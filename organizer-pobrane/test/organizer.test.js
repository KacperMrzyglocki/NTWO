import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { categoryFor, defaultDirectory, numberedName, organize, resolveDirectory } from '../src/organizer.js';
import { formatStructure } from '../src/report.js';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'organizer-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
async function snapshot(dir) {
  const output = {};
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name);
    output[entry.name] = entry.isDirectory() ? await snapshot(filename) : await fs.readFile(filename, 'utf8');
  }
  return output;
}

test('kategorie, wielkie litery i nieznane rozszerzenia', () => {
  for (const [name, expected] of [['A.JPG', 'Obrazy'], ['a.pdf', 'Dokumenty'], ['a.tar.gz', 'Archiwa'], ['a.mp3', 'Muzyka'], ['a.mp4', 'Wideo'], ['a.exe', 'Instalatory'], ['bez-rozszerzenia', 'Inne']]) {
    assert.equal(categoryFor(name), expected);
  }
  assert.equal(numberedName('a.tar.gz', 2), 'a (2).tar.gz');
});

test('struktura liczy tylko nowe pliki i rozróżnia foldery istniejące i nowe', async t => {
  const dir = await fixture(t);
  await fs.mkdir(path.join(dir, 'Archiwa'));
  await fs.writeFile(path.join(dir, 'Archiwa', 'stary.zip'), 'stary');
  await fs.writeFile(path.join(dir, 'nowy.zip'), 'nowy');
  await fs.writeFile(path.join(dir, 'a.pdf'), 'a');
  await fs.writeFile(path.join(dir, 'b.pdf'), 'b');
  const before = await snapshot(dir);
  const planned = await organize({ directory: dir, dryRun: true });
  assert.deepEqual(await snapshot(dir), before);
  assert.equal(planned.structure.length, 7);
  assert.match(formatStructure(planned), /Archiwa\/ \[istniejący\] — nowych do dodania: 1/);
  assert.match(formatStructure(planned), /Dokumenty\/ \[do utworzenia\] — nowych do dodania: 2/);
  assert.match(formatStructure(planned), /Muzyka\/ \[nie będzie tworzony\] — nowych do dodania: 0/);
  const actual = await organize({ directory: dir });
  assert.equal(actual.structure.reduce((sum, item) => sum + item.added, 0), actual.moved);
  assert.match(formatStructure(actual), /Dokumenty\/ \[utworzony\] — nowych przeniesionych: 2/);
  assert.equal((await fs.readdir(path.join(dir, 'Archiwa'))).length, 2);
});

test('błędy nie zwiększają liczby nowych plików, a pliki systemowe są pomijane', async t => {
  const dir = await fixture(t);
  await fs.writeFile(path.join(dir, 'Obrazy'), 'blokada');
  await fs.writeFile(path.join(dir, 'a.jpg'), 'a');
  await fs.writeFile(path.join(dir, 'desktop.ini'), 'ustawienia');
  await fs.writeFile(path.join(dir, 'Thumbs.db'), 'miniatury');
  const report = await organize({ directory: dir, dryRun: true });
  const images = report.structure.find(item => item.category === 'Obrazy');
  assert.equal(images.blocked, true);
  assert.equal(images.added, 0);
  assert.equal(images.errors, 1);
  assert.equal(report.skipped, 2);
  assert.match(formatStructure(report), /Obrazy\/ \[niedostępny lub nazwa zajęta\] — nowych do dodania: 0; błędy: 1/);
});

test('dry run zachowuje całą zawartość, nie tworzy katalogów i rezerwuje nazwy', async t => {
  const dir = await fixture(t);
  await fs.mkdir(path.join(dir, 'Dokumenty'));
  await fs.writeFile(path.join(dir, 'Dokumenty', 'raport.txt'), 'stary');
  await fs.writeFile(path.join(dir, 'raport.txt'), 'nowy');
  await fs.writeFile(path.join(dir, 'raport (1).txt'), 'inny');
  await fs.writeFile(path.join(dir, 'obraz.png'), 'obraz');
  const before = await snapshot(dir);
  const events = [];
  const report = await organize({ directory: dir, dryRun: true, onEvent: event => events.push(event) });
  assert.deepEqual(await snapshot(dir), before);
  assert.equal(report.planned, 3);
  const targets = events.filter(e => e.type === 'plan').map(e => e.destination);
  assert.equal(new Set(targets).size, 3);
  assert.ok(targets.includes(path.join(dir, 'Dokumenty', 'raport (2).txt')));
});

test('przenosi zawartość i zachowuje istniejące pliki przy kolejnych kolizjach', async t => {
  const dir = await fixture(t);
  await fs.mkdir(path.join(dir, 'Dokumenty'));
  for (const name of ['a.txt', 'a (1).txt']) await fs.writeFile(path.join(dir, 'Dokumenty', name), 'stary-' + name);
  await fs.writeFile(path.join(dir, 'a.txt'), 'nowy');
  const report = await organize({ directory: dir });
  assert.equal(report.moved, 1);
  assert.deepEqual(await snapshot(dir), { Dokumenty: { 'a.txt': 'stary-a.txt', 'a (1).txt': 'stary-a (1).txt', 'a (2).txt': 'nowy' } });
});

test('pomija pliki tymczasowe, ukryte i podfoldery', async t => {
  const dir = await fixture(t);
  for (const name of ['a.CRDOWNLOAD', 'b.part', 'c.partial', 'd.download', 'e.tmp', 'f.temp', '.sekret', '~$word.docx']) await fs.writeFile(path.join(dir, name), 'x');
  await fs.mkdir(path.join(dir, 'podfolder'));
  await fs.writeFile(path.join(dir, 'podfolder', 'a.jpg'), 'x');
  const before = await snapshot(dir);
  const report = await organize({ directory: dir });
  assert.equal(report.skipped, 9);
  assert.equal(report.moved, 0);
  assert.deepEqual(await snapshot(dir), before);
});

test('odrzuca dowiązanie jako katalog kategorii i pomija dowiązania źródłowe', async t => {
  const dir = await fixture(t);
  const outside = await fixture(t);
  await fs.symlink(outside, path.join(dir, 'Dokumenty'), 'dir');
  await fs.writeFile(path.join(dir, 'a.txt'), 'źródło');
  await fs.symlink(path.join(dir, 'a.txt'), path.join(dir, 'link.txt'));
  const report = await organize({ directory: dir });
  assert.equal(report.errors, 1);
  assert.equal(report.skipped, 2);
  assert.deepEqual(await fs.readdir(outside), []);
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf8'), 'źródło');
});

test('plik zajmujący nazwę kategorii nie blokuje pozostałych kategorii', async t => {
  const dir = await fixture(t);
  await fs.writeFile(path.join(dir, 'Dokumenty'), 'zajęte');
  await fs.writeFile(path.join(dir, 'a.txt'), 'txt');
  await fs.writeFile(path.join(dir, 'b.png'), 'png');
  const report = await organize({ directory: dir });
  assert.equal(report.errors, 1);
  assert.equal(await fs.readFile(path.join(dir, 'a.txt'), 'utf8'), 'txt');
  assert.equal(await fs.readFile(path.join(dir, 'Obrazy', 'b.png'), 'utf8'), 'png');
});

test('kolejne uruchomienie nie porządkuje wnętrza kategorii', async t => {
  const dir = await fixture(t);
  await fs.writeFile(path.join(dir, 'a.txt'), 'x');
  await organize({ directory: dir });
  const report = await organize({ directory: dir });
  assert.equal(report.moved, 0);
  assert.equal(report.skipped, 1);
});

test('równoległe uruchomienia nie nadpisują celu ani nie gubią źródła', async t => {
  const dir = await fixture(t);
  await fs.mkdir(path.join(dir, 'Dokumenty'));
  await fs.writeFile(path.join(dir, 'Dokumenty', 'a.txt'), 'istniejący');
  await fs.writeFile(path.join(dir, 'a.txt'), 'nowy');
  await Promise.all([organize({ directory: dir }), organize({ directory: dir })]);
  assert.equal(await fs.readFile(path.join(dir, 'Dokumenty', 'a.txt'), 'utf8'), 'istniejący');
  const copies = await fs.readdir(path.join(dir, 'Dokumenty'));
  assert.ok((await Promise.all(copies.map(name => fs.readFile(path.join(dir, 'Dokumenty', name), 'utf8')))).includes('nowy'));
});

test('ścieżki względne, spacje, tylda i wykrywanie Pobrane', async t => {
  const dir = await fixture(t);
  assert.equal(resolveDirectory('~', dir), dir);
  assert.equal(resolveDirectory('~/moje pliki', dir), path.join(dir, 'moje pliki'));
  assert.equal(resolveDirectory('./moje pliki'), path.resolve('moje pliki'));
  await assert.rejects(defaultDirectory(dir), /--dir/);
  await fs.mkdir(path.join(dir, 'Pobrane'));
  assert.equal(await defaultDirectory(dir), path.join(dir, 'Pobrane'));
});

test('nieistniejący folder i plik zamiast folderu zwracają błąd', async t => {
  const dir = await fixture(t);
  await assert.rejects(organize({ directory: path.join(dir, 'brak') }));
  await fs.writeFile(path.join(dir, 'plik'), 'x');
  await assert.rejects(organize({ directory: path.join(dir, 'plik') }), /folderem/);
});

test('CLI: pomoc, wersja, błędne argumenty, dry run i kod błędu', async t => {
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.match(run('--help').stdout, /--dry-run/);
  assert.equal(run('--version').stdout.trim(), '1.1.0');
  for (const args of [['--nieznane'], ['--dir'], ['--dir', ''], ['argument'], ['--undo']]) assert.equal(run(...args).status, 1);
  const dir = await fixture(t);
  await fs.writeFile(path.join(dir, 'a.txt'), 'x');
  assert.equal(run('--dir', dir, '--dry-run').status, 0);
  assert.deepEqual(await fs.readdir(dir), ['a.txt']);
  await fs.writeFile(path.join(dir, 'Dokumenty'), 'zajęte');
  assert.equal(run('--dir', dir).status, 1);
});

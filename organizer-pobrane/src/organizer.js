import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { categories, temporaryExtensions } from './categories.js';

export async function statIfExists(filename) {
  try { return await fs.lstat(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function resolveDirectory(value, home = os.homedir()) {
  if (value === '~') return home;
  if (value?.startsWith('~/') || value?.startsWith('~\\')) return path.resolve(home, value.slice(2));
  return path.resolve(value);
}

export async function defaultDirectory(home = os.homedir()) {
  for (const name of ['Downloads', 'Pobrane']) {
    const candidate = path.join(home, name);
    if ((await statIfExists(candidate))?.isDirectory()) return candidate;
  }
  throw new Error('Nie znaleziono folderu Downloads ani Pobrane. Podaj ścieżkę przez --dir.');
}

export function categoryFor(name) {
  const extension = path.extname(name).toLowerCase();
  return Object.entries(categories).find(([, extensions]) => extensions.includes(extension))?.[0] ?? 'Inne';
}

export function skipReason(entry) {
  if (!entry.isFile()) return 'folder, dowiązanie lub plik specjalny';
  if (['desktop.ini', 'thumbs.db'].includes(entry.name.toLowerCase())) return 'plik ustawień lub pamięci podręcznej systemu';
  if (entry.name.startsWith('.') || entry.name.startsWith('~$')) return 'plik ukryty lub tymczasowy';
  if (temporaryExtensions.includes(path.extname(entry.name).toLowerCase())) return 'plik tymczasowy lub niedokończone pobieranie';
  return null;
}

export function numberedName(name, index) {
  if (!index) return name;
  // Zachowaj rozszerzenia archiwów złożonych.
  const extension = /\.tar\.(gz|bz2|xz)$/i.exec(name)?.[0] ?? path.extname(name);
  return `${name.slice(0, name.length - extension.length)} (${index})${extension}`;
}

async function categoryDirectory(root, category, dryRun) {
  const directory = path.join(root, category);
  let info = await statIfExists(directory);
  if (!info && !dryRun) {
    try { await fs.mkdir(directory); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    info = await fs.lstat(directory);
  }
  if (info && (!info.isDirectory() || info.isSymbolicLink())) {
    throw new Error(`Katalog kategorii jest zajęty przez plik lub dowiązanie: ${directory}`);
  }
  return directory;
}

function unchanged(before, after) {
  return after?.isFile() && before.dev === after.dev && before.ino === after.ino
    && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
}

/** Kopiowanie z EXCL chroni cel również wtedy, gdy powstanie po sprawdzeniu nazwy.
 * Źródło usuwamy dopiero po poprawnym kopiowaniu i ponownym sprawdzeniu.
 */
async function moveWithoutOverwrite(source, destination, before) {
  const current = await fs.lstat(source);
  if (!unchanged(before, current)) throw new Error('Plik źródłowy zmienił się. Pozostawiono go bez zmian.');
  await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
  const after = await fs.lstat(source);
  if (!unchanged(before, after)) {
    throw new Error(`Źródło zmieniło się podczas kopiowania. Zachowano źródło i kopię: ${destination}`);
  }
  try { await fs.unlink(source); }
  catch (error) { throw new Error(`Nie usunięto źródła. Zachowano kopię: ${destination}. ${error.message}`); }
}

export async function organize({ directory, dryRun = false, onEvent = () => {} }) {
  const root = await fs.realpath(resolveDirectory(directory));
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Wskazana ścieżka nie jest folderem.');
  // Czytamy wyłącznie pierwszy poziom, przed utworzeniem kategorii.
  const entries = (await fs.readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  const structure = [];
  for (const category of [...Object.keys(categories), 'Inne']) {
    try {
      const info = await statIfExists(path.join(root, category));
      structure.push({ category, existed: Boolean(info), blocked: Boolean(info && (!info.isDirectory() || info.isSymbolicLink())), created: false, added: 0, errors: 0 });
    } catch {
      structure.push({ category, existed: false, blocked: true, created: false, added: 0, errors: 0 });
    }
  }
  const report = { dryRun, directory: root, moved: 0, planned: 0, skipped: 0, errors: 0, structure };
  const reserved = new Set();
  for (const entry of entries) {
    const reason = skipReason(entry);
    if (reason) {
      report.skipped++;
      onEvent({ type: 'skip', name: entry.name, reason });
      continue;
    }
    const category = categoryFor(entry.name);
    const categoryReport = structure.find(item => item.category === category);
    try {
      const source = path.join(root, entry.name);
      const before = await fs.lstat(source);
      if (!before.isFile()) throw new Error('Źródło przestało być zwykłym plikiem.');
      const targetDirectory = await categoryDirectory(root, category, dryRun);
      if (!dryRun && !categoryReport.existed) categoryReport.created = true;
      let index = 0;
      while (true) {
        const destination = path.join(targetDirectory, numberedName(entry.name, index++));
        if (reserved.has(destination.toLowerCase()) || await statIfExists(destination)) continue;
        if (!dryRun) {
          try { await moveWithoutOverwrite(source, destination, before); }
          catch (error) { if (error.code === 'EEXIST') continue; throw error; }
        }
        reserved.add(destination.toLowerCase());
        report[dryRun ? 'planned' : 'moved']++;
        categoryReport.added++;
        onEvent({ type: dryRun ? 'plan' : 'move', source, destination, name: entry.name });
        break;
      }
    } catch (error) {
      report.errors++;
      categoryReport.errors++;
      onEvent({ type: 'error', name: entry.name, reason: error.message });
    }
  }
  return report;
}

import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { defaultDirectory, organize } from './organizer.js';
import { formatStructure } from './report.js';

const help = `Organizer folderu Pobrane

Uruchomienie: node src/cli.js [opcje]

  --dir <ścieżka>  Folder do uporządkowania (domyślnie ~/Downloads lub ~/Pobrane)
  --dry-run       Pokaż plan bez tworzenia folderów i przenoszenia plików
  --help, -h      Pomoc
  --version, -v   Wersja

Przykłady:
  node src/cli.js --dry-run
  node src/cli.js --dir "C:\\Users\\Jan\\Downloads" --dry-run
  node src/cli.js --dir ./przykladowe-pobrane

Bez --dry-run program przenosi pliki. Kolizje rozwiązuje sufiksem (1), (2), ...
Foldery, dowiązania, pliki ukryte i niedokończone pobrania są pomijane.
`;

try {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string' }, 'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
    }, strict: true, allowPositionals: false,
  });
  if (values.help) console.log(help);
  else if (values.version) {
    console.log(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version);
  } else {
    if (values.dir !== undefined && !values.dir.trim()) throw new Error('--dir wymaga niepustej ścieżki.');
    const directory = values.dir ?? await defaultDirectory();
    const color = (code, text) => process.stdout.isTTY && !('NO_COLOR' in process.env)
      ? `\u001b[${code}m${text}\u001b[0m` : text;
    console.log(values['dry-run'] ? 'SYMULACJA: żadne pliki ani foldery nie zostaną zmienione.' : 'Porządkowanie plików...');
    const report = await organize({ directory, dryRun: values['dry-run'], onEvent(event) {
      if (event.type === 'plan' || event.type === 'move') {
        console.log(color('32', `[${event.type === 'plan' ? 'PLAN' : 'OK'}] ${JSON.stringify(event.source)} → ${JSON.stringify(event.destination)}`));
      } else {
        console.log(color(event.type === 'error' ? '31' : '33', `[${event.type === 'error' ? 'BŁĄD' : 'POMINIĘTO'}] ${JSON.stringify(event.name)}: ${event.reason}`));
      }
    } });
    console.log(formatStructure(report));
    console.log(`\n${report.dryRun ? 'Zaplanowano: ' + report.planned : 'Przeniesiono: ' + report.moved}. Pominięto: ${report.skipped}. Błędy: ${report.errors}.`);
    if (report.errors) process.exitCode = 1;
  }
} catch (error) {
  console.error(`Błąd: ${error.message}\nUżyj --help, aby zobaczyć dostępne opcje.`);
  process.exitCode = 1;
}

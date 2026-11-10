# Organizer folderu Pobrane

Lokalny program CLI w Node.js, przygotowany na podstawie prezentacji „Plan Projektu”. Segreguje pliki według rozszerzeń, pomija nieukończone pobrania i rozwiązuje kolizje nazw. Wymaga Node.js 22 lub nowszego. Korzysta wyłącznie z modułów wbudowanych, więc nie wymaga `npm install`.

## Uruchomienie

Rozpakuj projekt i otwórz terminal w folderze `organizer-pobrane`.

Najpierw zobacz plan:

```sh
node src/cli.js --dry-run
```

Uporządkuj domyślny folder:

```sh
node src/cli.js
```

Wskaż własny folder, np. testowy:

```sh
node src/cli.js --dir "./moje pobrane" --dry-run
node src/cli.js --dir "./moje pobrane"
```

Przykład dla Windows:

```powershell
node src/cli.js --dir "C:\Users\Jan\Downloads" --dry-run
```

Możesz też używać `npm start -- --dry-run` lub `npm start -- --dir "./moje pobrane"`. Pomoc: `node src/cli.js --help`. Wersja: `node src/cli.js --version`.

Domyślna ścieżka to `Downloads` w katalogu domowym z `node:os`, a następnie `Pobrane`, jeśli pierwszy folder nie istnieje. Przekierowane foldery systemowe, niestandardowe ścieżki i XDG wymagają `--dir`. Obsługiwane są ścieżki bezwzględne, względne względem terminala i `~/...`. Brak folderu zgłasza błąd, program go nie tworzy.

## Zasady segregacji

| Kategoria | Przykładowe rozszerzenia |
| --- | --- |
| Obrazy | jpg, png, webp, svg, heic |
| Dokumenty | pdf, docx, txt, xlsx, csv, pptx |
| Archiwa | zip, rar, 7z, tar, gz |
| Muzyka | mp3, wav, flac, m4a |
| Wideo | mp4, mkv, avi, mov |
| Instalatory | exe, msi, dmg, deb |
| Inne | nieznane rozszerzenia i pliki bez rozszerzenia |

Pełną listę edytujesz w `src/categories.js`. Wielkość liter rozszerzenia nie ma znaczenia. Pliki trafiają do podfolderów we wskazanym katalogu. Program przegląda tylko pierwszy poziom i pomija istniejące foldery oraz dowiązania symboliczne.

Pomijane są nazwy zaczynające się od `.` lub `~$` oraz rozszerzenia `.crdownload`, `.part`, `.partial`, `.download`, `.tmp`, `.temp`. To rozpoznawanie po nazwie, nie po stanie przeglądarki. Przed porządkowaniem zakończ pobieranie i zamknij programy zapisujące pliki. Atrybut ukrycia w Windows bez kropki w nazwie nie jest wykrywany.

## Dry run i ochrona przed nadpisaniem

`--dry-run` jedynie czyta katalog i pokazuje planowane ścieżki. Nie tworzy folderów, logów ani plików. Rezerwuje planowane nazwy, by plan nie zawierał dwóch identycznych celów. Stan folderu może zmienić się przed rzeczywistym uruchomieniem.

Jeśli `Dokumenty/raport.pdf` istnieje, program wybiera `raport (1).pdf`, potem `(2)` itd. Kolizją jest również folder lub dowiązanie zajmujące docelową nazwę. Archiwum `plik.tar.gz` otrzymuje nazwę `plik (1).tar.gz`.

Kopiowanie używa `COPYFILE_EXCL`, więc istniejący cel jest chroniony także przy kolizji po sprawdzeniu nazwy. Po skopiowaniu program ponownie sprawdza tożsamość, rozmiar i czas modyfikacji źródła, a następnie usuwa źródło. Błąd kopiowania pozostawia źródło. Błąd usuwania lub wykryta zmiana źródła może pozostawić obie kopie i jest zgłaszany. Kopiowanie wymaga wolnego miejsca na plik. Nie jest transakcją: przerwanie procesu może pozostawić kopię, a narzędzie nie zachowuje wszystkich metadanych pliku, np. ACL i czasów.

Program odrzuca dowiązania symboliczne użyte jako katalog kategorii. Jest przeznaczony do lokalnego folderu użytkownika bez jednoczesnego zmieniania jego struktury przez inne programy. Sprawdzenia metadanych nie zastępują blokady pliku ani migawki systemu plików.

Po zakończeniu pojawia się liczba przeniesionych lub zaplanowanych plików, pominiętych pozycji i błędów. Błąd pojedynczego pliku nie zatrzymuje pozostałych operacji. Kod zakończenia: `0` oznacza brak błędów, `1` błąd argumentów, folderu lub co najmniej jednej operacji. Kolory działają w terminalu i można je wyłączyć zmienną `NO_COLOR`.

## Testy i struktura

```sh
npm test
```

Testy tworzą osobne katalogi tymczasowe. Sprawdzają m.in. niezmienność zawartości przy dry run, kolizje, zachowanie danych, pomijanie pobrań, dowiązania i argumenty CLI.

- `src/cli.js` — argumenty, komunikaty i podsumowanie.
- `src/organizer.js` — ścieżki, planowanie nazw i operacje na plikach.
- `src/categories.js` — reguły rozszerzeń.
- `test/organizer.test.js` — testy z użyciem `node:test`.

Zakres obecnej wersji obejmuje podstawowy silnik ze slajdów oraz dry run, ochronę przed nadpisaniem, `--dir` i testy. Funkcja `--undo` pozostaje na kolejny etap. Nie ma pola `bin` w `package.json` ani rejestracji globalnego polecenia. Wszystkie polecenia uruchamia się lokalnie przez `node` lub `npm start`.


## Podsumowanie struktury (wersja 1.1.0)

Po liście operacji terminal pokazuje wszystkie 7 kategorii jako strukturę podfolderów. Przy każdym folderze podaje status (istniejący, do utworzenia, utworzony, nie będzie tworzony lub niedostępny) i liczbę nowych plików z bieżącej operacji. Nie liczy wcześniejszych plików wewnątrz kategorii. W trybie rzeczywistym liczy wyłącznie poprawnie zakończone przeniesienia, a błędy podaje osobno. Puste, niepotrzebne kategorie nie są tworzone.

Dodatkowo pomijane są pliki systemowe `desktop.ini` i `Thumbs.db`, niezależnie od wielkości liter.

Zdefiniowano 50 rozszerzeń w 6 kategoriach oraz siódmy folder `Inne`. Pozostałe rozszerzenia (np. `.xml`, `.bin`, `.iso`, `.json`, `.js`) i pliki bez rozszerzenia trafiają do `Inne`. Program klasyfikuje po nazwie, nie analizuje zawartości plików.

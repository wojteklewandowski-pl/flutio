# Flet – dokumentacja dla programisty

## Stos technologiczny i decyzje

| Decyzja | Dlaczego |
|---|---|
| **Aplikacja webowa + PWA**, bez natywnej | jeden kod dla telefonu i komputera, bez sklepów; po wdrożeniu na https instaluje się na ekranie głównym i działa offline |
| **TypeScript + Vite**, bez frameworka UI | interfejs to kilka kontrolek; czysty DOM jest prostszy niż React czy Vue i nie dokłada zależności |
| **Notacja ABC** jako format wewnętrzny | tekst, który łatwo pisać ręcznie i trzymać w kodzie (wbudowane utwory); abcjs rysuje z niego nuty i gra |
| **abcjs** do nut i dźwięku | jedna biblioteka: render SVG, syntezator Web Audio z próbkami SoundFont, zdarzenia „teraz gra nuta X” |
| **Własny konwerter MusicXML → ABC** | gotowy xml2abc nie jest w npm; dla melodii na flet wystarcza ~200 linii z testami |
| **localStorage** dla własnych utworów | utwory to krótkie teksty; IndexedDB byłby przerostem formy |
| **Własny YIN** do wykrywania wysokości | ~100 linii, testowalny na sygnałach syntetycznych; flet daje prawie sinusoidę, więc nie potrzeba bibliotek ML (CREPE itp.) |
| **HTTPS w dev przez openssl**, bez wtyczki | mikrofon na telefonie wymaga bezpiecznego kontekstu; `npm run cert` + `npm run dev:https` nie dokładają zależności |

### Zależności

| Pakiet | Rola | Licencja |
|---|---|---|
| `abcjs` | render nut (SVG), syntezator, synchronizacja z nutami | MIT |
| `fflate` | rozpakowanie skompresowanych plików MusicXML `.mxl` (zip) | MIT |
| `vite` *(dev)* | serwer deweloperski i budowanie `dist/` | MIT |
| `typescript` *(dev)* | sprawdzanie typów (`tsc`; wersja 7, kompilator natywny) | Apache-2.0 |
| `vitest` *(dev)* | testy jednostkowe | MIT |
| `jsdom` *(dev)* | DOM (DOMParser) w testach konwertera MusicXML | MIT |

Próbki dźwięku (SoundFont FluidR3_GM, instrument GM #75 „Recorder”) pobiera abcjs w czasie działania
z `https://paulrosen.github.io/midi-js-soundfonts/abcjs/`. Nie ma ich w repozytorium.

## Polecenia

```bash
npm install          # zależności
npm run dev          # http://localhost:5173 (+ adres w sieci LAN dla telefonu)
npm test             # testy jednostkowe (vitest)
npm run typecheck    # tsc --noEmit (tryb strict)
npm run build        # tsc + vite build → dist/
npm run preview      # serwuje dist/ na :4173 (tu działa service worker)
```

W VS Code (`.vscode/`) przygotowane są:
- **zadania** (Ctrl+Shift+B = build, „test”, „dev”),
- **debugowanie**: „Chrome: debuguj aplikację” uruchamia serwer dev i Chrome z breakpointami w `.ts`; „Vitest: debuguj testy”,
- rekomendowane rozszerzenie **Vitest** (testy w panelu bocznym).

## Struktura

```
index.html              układ strony (wszystkie kontrolki mają id używane w main.ts)
src/
  main.ts               łączy UI z modułami; obsługa zdarzeń, wczytywanie plików
  fingerings.ts         ★ TABELA CHWYTÓW (dane z podręcznika) + fingeringFor(midi, system)
  fingeringSvg.ts       rysowanie diagramu chwytu jako <svg>
  pitch.ts              MIDI → polska nazwa dźwięku (c¹, fis², b¹, h¹ …)
  score.ts              render nut przez abcjs + diagramy pod nutami + podświetlanie
  player.ts             syntezator + zegar nut; tempo, pauza, pętla, pojedynczy dźwięk
  musicxml.ts           MusicXML / .mxl → ABC
  songs.ts              ★ WBUDOWANE UTWORY (ABC)
  storage.ts            localStorage: własne utwory i ustawienia
  pitchDetect.ts        wykrywanie wysokości dźwięku (YIN) – czysta funkcja
  microphone.ts         mikrofon: getUserMedia → AnalyserNode → detectPitch, ~60 ramek/s
  practice.ts           sesja ćwiczenia: maszyna stanów (zaliczenie, pomyłki, powtórzone nuty)
  style.css             wygląd; kolory jako zmienne CSS (jasny i ciemny motyw)
public/
  sw.js                 service worker (offline: aplikacja + próbki dźwięku)
  manifest.webmanifest  PWA: nazwa, ikona, tryb „standalone”
  icon.svg
tests/                  testy vitest (*.test.ts)
```

## Jak to działa

### Od ABC do nut z chwytami (`score.ts`)

1. `abcjs.renderAbc(..., { oneSvgPerLine: true, responsive: 'resize', wrap: … })` rysuje każdy
   system (linijkę nut) jako osobny `<svg>`. Liczba taktów w linii zależy od szerokości ekranu
   (`densityFor`): 1 na telefonie, 2 na tablecie, 4 na komputerze. Przekroczenie progu
   (np. obrót telefonu) rysuje nuty od nowa i wywołuje `onRerender`.
2. `tune.setUpAudio({})` dopisuje do każdej nuty `midiPitches` (wysokość MIDI po uwzględnieniu
   tonacji, znaków przygodnych i transpozycji wizualnej). Odczytujemy je **od razu**, bo
   `CreateSynth.init()` w odtwarzaczu wywołuje to samo z `midiTranspose: 12` i nadpisuje te pola.
3. Pod każdym `<svg>` wstawiany jest `div.fingering-row` z komórkami ustawionymi absolutnie
   pod środkiem główki nuty (`getBoundingClientRect`). `ResizeObserver` przelicza pozycje przy
   każdej zmianie szerokości. Wielkość diagramu jest wspólna dla całego utworu i zależy od
   najmniejszego odstępu między nutami (13–26 px).
4. Nuty łączymy ze zdarzeniami odtwarzacza po `startChar`, czyli pozycji nuty w tekście ABC.

### Odtwarzanie (`player.ts`)

- `CreateSynth.init()` + `prime()` renderuje całą melodię do bufora audio (Web Audio).
  `TimingCallbacks` (zegar oparty na `requestAnimationFrame`) wywołuje `eventCallback`
  na początku każdej nuty, a `main.ts` podświetla ją i aktualizuje panel „Teraz / Następna”.
- **Tempo:** bufor jest renderowany dla konkretnego tempa (`millisecondsPerMeasure`). Zmiana
  tempa w trakcie grania: zapamiętaj postęp (0..1), przebuduj bufor, `synth.seek(postęp)`,
  `timer.start(postęp)`.
- **AudioContext** powstaje przy pierwszym kliknięciu „Graj”, bo przeglądarki (zwłaszcza iOS)
  blokują dźwięk bez gestu użytkownika.
- **Brzmienie oktawę wyżej** (`midiTranspose: 12`) zmienia tylko dźwięk; chwyty są liczone z zapisu,
  jak w podręczniku.

### Ćwiczenie z mikrofonem (`pitchDetect.ts`, `microphone.ts`, `practice.ts`)

```
mikrofon ─getUserMedia─▶ AnalyserNode (1024 próbki ≈ 21 ms)
   └─ rAF ~60/s ─▶ detectPitch (YIN) ─▶ Hz → MIDI ─▶ mediana z 3 ramek
        └─▶ PracticeSession.feed({time, midi, rms}) ─▶ FrameStatus (UI) + zdarzenia correct/mistake/finished
```

- **YIN** (`detectPitch`): funkcja różnicowa → skumulowana normalizacja → pierwsze minimum pod
  progiem 0,15 → interpolacja paraboliczna. Zakres 240–2600 Hz (flet sopranowy brzmi
  523–2093 Hz). Ramka poniżej RMS 0,01 to cisza. Ramka bez minimum pod progiem (szum, sam oddech)
  daje `null`. Dokładność na sygnałach testowych: < 5 centów.
- **Ustawienia mikrofonu**: `echoCancellation`, `noiseSuppression` i `autoGainControl` wyłączone,
  bo filtry mowy tłumią ciągły ton. Mikrofon nie jest podłączony do głośników, więc nie ma sprzężenia.
- **`PracticeSession`** (czysta logika, testy w `tests/practice.test.ts`):
  - oczekiwana wysokość brzmiąca = zapis + 12;
  - zaliczenie: ≥ 150 ms (`holdMs`) w granicach ±50 centów (`toleranceCents`);
  - po zaliczeniu trzeba się **zwolnić**: cisza, spadek RMS poniżej 40% szczytu (artykulacja „tu”)
    albo zmiana wysokości. Dzięki temu powtórzone nuty liczą się osobno;
  - pomyłka: stabilny zły dźwięk ≥ 150 ms, najwyżej jedna na nutę. Lekko nieczysty dźwięk (< 1 półton)
    nie jest pomyłką, tylko podpowiedzią „za wysoko/za nisko”. Dźwięk o oktawę obok daje
    podpowiedź `octave-high/low`;
  - `muteUntil()`: na czas odtwarzania podpowiedzi (kliknięcie w nutę) mikrofon jest ignorowany,
    bo słyszałby głośnik.
- **Test od początku do końca bez fletu**: Chrome przyjmuje plik WAV jako mikrofon:
  ```bash
  google-chrome --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
                --use-file-for-fake-audio-capture=/ścieżka/melodia.wav http://localhost:5173
  ```
  WAV z tonami melodii (zapis + 12 półtonów, przerwy ~70 ms między nutami) przechodzi cały utwór.
  W ten sposób sprawdzono „Aidę”: 28/28 nut i poprawnie wykrytą wstawioną pomyłkę.

### Konwersja MusicXML (`musicxml.ts`)

Bierze pierwszą `<part>` i pierwszy `<voice>`, pomija `<chord/>`, `<grace/>`, `<backup>`.
Wartość nuty liczy z `<type>` + `<dot/>` (zapis), a nie z `<duration>`; dzięki temu triole wychodzą
jako `(3` + wartości zapisane. Wynik ma jednostkę `L:1/16`.
Znaki przygodne są liczone zgodnie z semantyką ABC: obowiązują do końca taktu dla danego
kroku i oktawy, a domyślnie obowiązuje znak przykluczowy.
Nie obsługujemy formatu `score-timewise` (rzadki; MuseScore go nie eksportuje) ani mikrotonów.

## Typowe zmiany

### Poprawienie chwytu
Edytuj tekst w `src/fingerings.ts`, tabela `GERMAN` (lub `BAROQUE_OVERRIDES`). Zapis
`"K LLL PPPP"`: `x` zakryty, `o` odkryty, `h` w połowie, `q` w 3/4. Testy w
`tests/fingerings.test.ts` sprawdzają kompletność zakresu i kilka chwytów z podręcznika.
Jeśli zmieniasz te chwyty celowo, popraw też test.

### Dodanie utworu
Dopisz obiekt do `BUILTIN_SONGS` w `src/songs.ts`. Najprościej przygotować go w edytorze ABC
w aplikacji (podgląd na żywo), a potem skopiować tekst. `id` musi być unikalne, bo jest
zapamiętywane jako ostatnio wybrany utwór.

### Zmiana instrumentu lub serwera próbek
`RECORDER_PROGRAM` w `src/player.ts` (numer GM liczony od 0). Własny serwer próbek ustawia się przez
`options.soundFontUrl` w `synth.init()`. Wtedy zmień też `SOUNDFONT_HOST` w `public/sw.js`.

## Testy

- **Jednostkowe** (`npm test`): tabela chwytów, nazwy dźwięków, konwerter MusicXML (w tym `.mxl`),
  detektor wysokości (sinusy w całym zakresie fletu, alikwoty, szum, cisza, 44,1/48 kHz),
  sesja ćwiczenia (zaliczanie, powtórzone nuty, pomyłki, podpowiedzi, wyciszenie).
- **Ręcznie w przeglądarce**, bo render SVG i dźwięk wymagają prawdziwej przeglądarki. Sprawdź:
  1. Każdy wbudowany utwór: chwyty pod nutami, brak „?”.
  2. Graj → podświetla się kolejna nuta, panel „Teraz/Następna” nadąża, na telefonie przewija się widok.
  3. Zmiana tempa w trakcie grania wznawia od tego samego miejsca.
  4. Palcowanie barokowe zmienia tylko f¹ i f² (utwór „Wlazł kotek”).
  5. Wgranie `.mxl` z MuseScore; zapis z edytora ABC; usunięcie własnego utworu.
  6. Szerokość 390 px (DevTools → tryb urządzenia): bez poziomego przewijania.
  7. Ćwiczenie z mikrofonem: z prawdziwym fletem albo z plikiem WAV (patrz wyżej); na telefonie przez `dev:https`.

## Wdrożenie

`npm run build` daje statyczny katalog `dist/` ze ścieżkami względnymi (`base: './'`). Można go
wrzucić do dowolnego katalogu na serwerze https. Po zmianach w `public/sw.js` podbij
`CACHE_VERSION`, żeby telefony porzuciły starą pamięć podręczną.

## Ograniczenia i pomysły na dalszy rozwój

- Rozpoznawanie nut ze zdjęcia (OMR): poza zakresem; obejście przez MuseScore lub Audiveris → MusicXML.
- Tylko flet sopranowy C. Flet altowy (F) wymagałby drugiej tabeli i transpozycji chwytów.
- Mikrofon ocenia **wysokość**, nie rytm. Tryb ćwiczenia czeka na ucznia.
- Pomysły: odliczanie / metronom przed startem, ćwiczenie fragmentu (zakres taktów w pętli),
  ocena gry **razem z odtwarzaniem** (rytm + wysokość), statystyki najczęściej mylonych nut,
  regulacja tolerancji stroju w ustawieniach.

# Flutio – nauka gry na flecie prostym

Aplikacja w przeglądarce (komputer i telefon) do nauki melodii na **flecie prostym sopranowym (C)**:

- wybierasz gotowy krótki utwór albo **wgrywasz własne nuty**,
- melodia jest **odgrywana** (dźwięk fletu), a grana nuta podświetla się na pięciolinii,
- **tempo** zmieniasz suwakiem (25–150%), także w trakcie grania,
- **pod każdą nutą** jest jej nazwa i **rysunek chwytu**,
- u góry ekranu widać duży chwyt **bieżącej** i **następnej** nuty,
- kliknięcie w nutę odtwarza jej dźwięk i pokazuje chwyt,
- **ćwiczenie z mikrofonem**: grasz na flecie, aplikacja słucha, czeka na dobrą nutę
  i dopiero wtedy przechodzi dalej. Pokazuje, co słyszy, czy dźwięk jest czysty, i oznacza pomyłki.

Chwyty pochodzą z tabeli w podręczniku („Tabela chwytów na flet”, s. 190), od c¹ do c³.

## Wersja online

**https://wojteklewandowski-pl.github.io/flutio/**

Nic nie trzeba instalować. Otwórz adres w przeglądarce na komputerze albo telefonie.

**Na telefonie jako aplikacja:**
1. Otwórz adres w Chrome (Android) lub Safari (iPhone).
2. Chrome: menu ⋮ → **„Dodaj do ekranu głównego”** / „Zainstaluj aplikację”.
   Safari: przycisk **Udostępnij** → **„Do ekranu początkowego”**.
3. Ikona Flutio pojawi się na ekranie głównym i aplikacja otworzy się na pełnym ekranie.
   Po pierwszym odtworzeniu melodii działa też **bez internetu**.

**Mikrofon** (🎤 Ćwicz z mikrofonem) działa od razu, bo strona jest na https. Przy pierwszym
użyciu przeglądarka zapyta o zgodę.

Nowa wersja publikuje się sama po każdym `git push` na gałąź `main` (GitHub Actions, ok. 1–2 min).
Zainstalowana aplikacja pobierze ją przy następnym uruchomieniu z internetem.

## Uruchomienie lokalne (dla programisty)

Wymagany Node.js 20+ (testowane na 22).

```bash
npm install        # raz, pobiera zależności
npm run dev        # serwer deweloperski: http://localhost:5173
```

### Na telefonie

`npm run dev` udostępnia aplikację w sieci lokalnej. W terminalu pojawi się adres
typu `Network: http://192.168.1.20:5173`. Otwórz go na telefonie podłączonym do tej samej sieci Wi-Fi.

**Mikrofon na telefonie wymaga https.** Przez zwykły `http://192.168…` przeglądarka nie da
dostępu do mikrofonu. Wtedy uruchom serwer z szyfrowaniem:

```bash
npm run cert        # raz: tworzy samopodpisany certyfikat w .cert/ (potrzebny openssl)
npm run dev:https   # https://192.168.1.20:5173
```

Telefon ostrzeże o „niezaufanym certyfikacie”. To normalne dla certyfikatu domowego:
wybierz „Zaawansowane → Przejdź do strony”. Na komputerze (`localhost`) mikrofon działa bez tego.

Instalacja na ekranie głównym i tryb offline wymagają `https://`, więc do tego służy wersja online.
Wersję produkcyjną można też zbudować i obejrzeć lokalnie:

```bash
npm run build      # wynik w dist/
npm run preview    # podgląd zbudowanej wersji: http://localhost:4173
```

> **Dźwięk:** przy pierwszym odtworzeniu pobierane są próbki brzmienia fletu
> (pliki MP3 z `paulrosen.github.io`). Potrzebny jest więc wtedy internet. W wersji zainstalowanej
> próbki zostają zapisane i później działają offline.
> Na iPhonie wyłącz przełącznik wyciszenia, bo inaczej Safari nie odtwarza dźwięku.

## Obsługa

| Element | Co robi |
|---|---|
| **Utwór** | lista gotowych utworów i „Moje utwory” (wgrane lub zapisane z edytora) |
| **Wgraj nuty…** | wczytuje plik `.abc`, `.musicxml`, `.xml` lub `.mxl` (opis niżej) |
| **▶ Graj / ❚❚ Pauza / ■ Stop** | odtwarzanie; **spacja** = graj/pauza |
| **Tempo** | 25–150% tempa z nut; obok wynik w BPM |
| **Zapętl** | po końcu utworu gra od początku |
| Ustawienia → **Palcowanie** | niemieckie (domyślne) lub barokowe; różnią się tylko f¹ i f² |
| Ustawienia → **Transpozycja** | przesuwa całą melodię o półtony, np. gdy nuty są za nisko lub za wysoko dla fletu |
| Ustawienia → **Brzmienie fletu sopranowego** | flet sopranowy brzmi oktawę wyżej niż zapis; odznacz, żeby słyszeć wysokość z zapisu |
| **🎤 Ćwicz z mikrofonem** | tryb ćwiczenia (opis niżej) |
| **Edytor nut (ABC)** | podgląd i poprawianie zapisu bieżącego utworu, zapis jako własny |

## Ćwiczenie z mikrofonem

1. Wybierz utwór i kliknij **🎤 Ćwicz z mikrofonem**. Przy pierwszym razie przeglądarka zapyta o zgodę na mikrofon.
2. Podświetlona nuta i duży chwyt u góry pokazują, co zagrać. Zagraj tę nutę i przytrzymaj ją przez chwilę.
3. Gdy dźwięk jest dobry, nuta dostaje zieloną ramkę i aplikacja przechodzi do następnej. Tempo zależy od ucznia.
4. Panel **Słyszę** pokazuje:
   - jaką nutę słyszy aplikacja,
   - **wskaźnik stroju**: kreska w zielonym polu oznacza czysty dźwięk, w lewo za nisko, w prawo za wysoko,
   - podpowiedź, np. „O oktawę za wysoko – dmuchnij lżej” albo „Grasz e², a potrzebne jest a¹”.
5. Zła nuta trzymana przez chwilę to **pomyłka**: pomarańczowa ramka i ✗ pod nutą. Liczy się najwyżej
   jedna pomyłka na nutę, a potem i tak trzeba zagrać dobrze, żeby pójść dalej.
6. **Powtórzone nuty** (np. h¹ h¹ h¹) trzeba rozdzielić językiem („tu”) albo krótką przerwą.
   Jeden długi dźwięk nie zaliczy kilku nut.
7. Na końcu pojawia się podsumowanie. **↺ Od początku** zaczyna od nowa, a kliknięcie w nutę
   przenosi do niej i odtwarza ją jako podpowiedź.

Wskazówki:
- Aplikacja zakłada, że flet jest **sopranowy**, czyli brzmi oktawę wyżej niż zapis.
- Graj w cichym pokoju, z telefonem lub komputerem ok. 0,5–1 m od fletu.
- Pasek pod podpowiedzią pokazuje głośność z mikrofonu. Jeśli się nie rusza, mikrofon nie działa
  albo jest wyciszony.
- Za dobry uznawany jest dźwięk w granicach ±50 centów (pół półtonu), więc tani szkolny flet też przejdzie.

**Który flet mam: niemiecki czy barokowy?** Zagraj f¹ chwytem niemieckim: kciuk, trzy palce
lewej ręki i palec wskazujący prawej, a reszta otwarta. Na flecie niemieckim dźwięk jest czysty,
na barokowym wyraźnie fałszuje. Barokowy flet ma też zwykle większy czwarty otwór od góry
po stronie prawej ręki.

**Nuta oznaczona „?”** jest poza zakresem fletu (c¹–c³). Użyj transpozycji, najczęściej o ±12 półtonów (oktawę).

## Własne nuty

### Z programu nutowego (MusicXML), sposób zalecany

W **MuseScore** (darmowy): *Plik → Eksportuj → MusicXML* i wgraj plik `.mxl` lub `.musicxml`.
Działa też z Finale, Sibeliusem, Dorico i większością programów nutowych.

Aplikacja bierze **pierwszą partię i pierwszy głos**, czyli melodię. Akordy redukuje do pierwszej nuty,
a ozdobniki pomija. Obsługiwane są wartości nut z kropkami, pauzy, triole, łuki łączące, znaki
przygodne, zmiany metrum i tonacji oraz tempo.

**Nuty na papierze lub zdjęcie:** aplikacja nie rozpoznaje nut ze zdjęć. Skorzystaj z MuseScore
(Plik → Importuj PDF) albo z darmowego programu Audiveris, który zamienia skan na MusicXML.

### W notacji ABC (tekst)

ABC to prosty zapis nut zwykłymi znakami. Można go wpisać w edytorze w aplikacji albo wgrać plik `.abc`.

```
X:1
T:Tytuł utworu
C:Kompozytor
M:4/4          ← metrum
L:1/8          ← podstawowa wartość nuty (tu: ósemka)
Q:1/4=90       ← tempo (ćwierćnuty na minutę)
K:G            ← tonacja (G-dur: fis przy kluczu)
D2 | G6 (3ADA | B2 B2 B2 (3BcG | B3 A G2 z2 |]
```

| Zapis | Znaczenie |
|---|---|
| `C D E F G A B` | c¹ d¹ e¹ f¹ g¹ a¹ h¹ |
| `c d e f g a b` | c² … h² |
| `c'` | c³ |
| `^F` / `_B` / `=F` | fis / b / kasownik |
| `G2`, `G4`, `G/2` | 2×, 4×, ½× wartości `L` |
| `G3` lub `G>A` | z kropką; `G>A` = ósemka z kropką i szesnastka |
| `(3ABC` | triola |
| `z` | pauza |
| `G2-G2` | łuk łączący |
| `|`, `|]`, `:|` | kreska taktowa, koniec, powtórka |

Pełny opis znajdziesz w [standardzie ABC 2.1](https://abcnotation.com/wiki/abc:standard:v2.1).

## Gdzie są zapisane moje utwory?

W pamięci przeglądarki (`localStorage`) **na tym urządzeniu**. Nie są nigdzie wysyłane.
Wyczyszczenie danych przeglądarki je usuwa, dlatego warto trzymać kopię pliku `.abc` lub `.musicxml`.

## Dla programisty

Budowa aplikacji, moduły, testy i wprowadzanie zmian (np. poprawianie chwytów albo dodawanie
utworów) są opisane w [DEVELOPING.md](DEVELOPING.md).

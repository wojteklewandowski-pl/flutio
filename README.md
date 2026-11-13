# Flet – nauka gry na flecie prostym

Aplikacja w przeglądarce (komputer i telefon) do nauki melodii na **flecie prostym sopranowym (C)**:

- wybierasz gotowy krótki utwór albo **wgrywasz własne nuty**,
- melodia jest **odgrywana** (dźwięk fletu), a grana nuta podświetla się na pięciolinii,
- **tempo** zmieniasz suwakiem (25–150%), także w trakcie grania,
- **pod każdą nutą** jest jej nazwa i **rysunek chwytu**,
- u góry ekranu widać duży chwyt **bieżącej** i **następnej** nuty,
- kliknięcie w nutę odtwarza jej dźwięk i pokazuje chwyt.

Chwyty pochodzą z tabeli w podręczniku („Tabela chwytów na flet”, s. 190), od c¹ do c³.

## Uruchomienie

Wymagany Node.js 20+ (testowane na 22).

```bash
npm install        # raz, pobiera zależności
npm run dev        # serwer deweloperski: http://localhost:5173
```

### Na telefonie

`npm run dev` udostępnia aplikację w sieci lokalnej. W terminalu pojawi się adres
typu `Network: http://192.168.1.20:5173`. Otwórz go na telefonie podłączonym do tej samej sieci Wi-Fi.

Żeby **zainstalować aplikację na ekranie głównym** i używać jej **offline**, potrzebny jest
adres `https://`, bo tego wymagają przeglądarki. Zbuduj wersję produkcyjną i wrzuć katalog `dist/`
na dowolny hosting statyczny, np. GitHub Pages, Netlify albo Cloudflare Pages:

```bash
npm run build      # wynik w dist/
npm run preview    # podgląd zbudowanej wersji: http://localhost:4173
```

Potem w przeglądarce telefonu: Chrome: menu ⋮ → „Dodaj do ekranu głównego”; Safari: Udostępnij → „Do ekranu początkowego”.

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
| **Edytor nut (ABC)** | podgląd i poprawianie zapisu bieżącego utworu, zapis jako własny |

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

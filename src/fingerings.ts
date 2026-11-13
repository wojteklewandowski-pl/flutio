/**
 * Tabela chwytów na flet prosty sopranowy (C).
 *
 * Źródło: podręcznik szkolny, strona 190 – „Tabela chwytów na flet”.
 * Zakres: c¹ (MIDI 60) … c³ (MIDI 84), zapis nutowy (flet sopranowy brzmi
 * oktawę wyżej niż zapis – to obsługuje odtwarzacz, nie ta tabela).
 *
 * Kolejność otworów w każdym wpisie (od góry fletu, tak jak na rysunku):
 *
 *   indeks 0      – kciuk lewej ręki (otwór z tyłu)
 *   indeksy 1..3  – lewa ręka: palec wskazujący, środkowy, serdeczny
 *   indeksy 4..7  – prawa ręka: wskazujący, środkowy, serdeczny, mały
 *
 * Zapis tekstowy wpisu: "K LLL PPPP" (spacje są ignorowane), gdzie znak:
 *   x – otwór całkowicie zakryty  (●)
 *   o – otwór odkryty             (○)
 *   h – otwór w połowie zakryty   (◐)  – „half”
 *   q – otwór w 3/4 zakryty       (◕)  – „quarter open”
 *
 * Aby poprawić chwyt, wystarczy zmienić tekst w tabeli poniżej.
 */

export type HoleState = 'open' | 'closed' | 'half' | 'threeQuarter';

/** System palcowania: niemiecki (najczęstszy w szkołach) lub barokowy (angielski). */
export type FingeringSystem = 'german' | 'baroque';

/** Liczba otworów: kciuk + 3 lewa + 4 prawa. */
export const HOLE_COUNT = 8;

/** Najniższa i najwyższa nuta, dla której znamy chwyt (MIDI). */
export const LOWEST_MIDI = 60; // c¹
export const HIGHEST_MIDI = 84; // c³

/** Chwyty niemieckie – podstawowa kolumna tabeli z podręcznika. */
const GERMAN: Readonly<Record<number, string>> = {
  60: 'x xxx xxxx', // c¹
  61: 'x xxx xxxh', // cis¹
  62: 'x xxx xxxo', // d¹
  63: 'x xxx xxho', // dis¹
  64: 'x xxx xxoo', // e¹
  65: 'x xxx xooo', // f¹   (chwyt niemiecki)
  66: 'x xxx oxxo', // fis¹
  67: 'x xxx oooo', // g¹
  68: 'x xxo xxoo', // gis¹
  69: 'x xxo oooo', // a¹
  70: 'x xox xooo', // b¹   (= ais¹)
  71: 'x xoo oooo', // h¹
  72: 'x oxo oooo', // c²
  73: 'x ooo oooo', // cis²
  74: 'o oxo oooo', // d²
  75: 'o oxx xxxo', // dis²
  76: 'h xxx xxoo', // e²
  77: 'h xxx xooo', // f²   (chwyt niemiecki)
  78: 'h xxx oxoo', // fis²
  79: 'h xxx oooo', // g²
  80: 'h xxo xooo', // gis²
  81: 'h xxo oooo', // a²
  82: 'h xxo xxxo', // b²
  83: 'h xxo xxoo', // h²
  84: 'q xoo xxoo', // c³
};

/**
 * Różnice dla fletu barokowego – w podręczniku oznaczone gwiazdką (*).
 * Podręcznik pokazuje je tylko dla f¹ i f². Uwaga: wiele tabel barokowych
 * dla f¹ zakrywa też otwór 7 (mały palec) – tu trzymamy się podręcznika.
 */
const BAROQUE_OVERRIDES: Readonly<Record<number, string>> = {
  65: 'x xxx xoxo', // f¹*
  77: 'h xxx xoxo', // f²*
};

const CHAR_TO_STATE: Readonly<Record<string, HoleState>> = {
  x: 'closed',
  o: 'open',
  h: 'half',
  q: 'threeQuarter',
};

/** Zamienia zapis "x xxx xxoo" na tablicę 8 stanów otworów. Rzuca wyjątek przy błędnym zapisie. */
export function parseHoles(spec: string): HoleState[] {
  const chars = spec.replace(/\s+/g, '');
  if (chars.length !== HOLE_COUNT) {
    throw new Error(`Chwyt "${spec}" musi mieć ${HOLE_COUNT} otworów, ma ${chars.length}`);
  }
  return [...chars].map((c) => {
    const state = CHAR_TO_STATE[c];
    if (!state) throw new Error(`Nieznany znak "${c}" w chwycie "${spec}"`);
    return state;
  });
}

const cache = new Map<string, readonly HoleState[]>();

/**
 * Zwraca chwyt dla nuty (numer MIDI, c¹ = 60) albo `undefined`,
 * jeśli nuta jest poza zakresem fletu sopranowego.
 */
export function fingeringFor(midi: number, system: FingeringSystem = 'german'): readonly HoleState[] | undefined {
  const spec = (system === 'baroque' ? BAROQUE_OVERRIDES[midi] : undefined) ?? GERMAN[midi];
  if (spec === undefined) return undefined;
  let holes = cache.get(spec);
  if (!holes) {
    holes = Object.freeze(parseHoles(spec));
    cache.set(spec, holes);
  }
  return holes;
}

/** Czy dla tej nuty chwyt różni się między systemem niemieckim i barokowym. */
export function differsBetweenSystems(midi: number): boolean {
  return midi in BAROQUE_OVERRIDES;
}

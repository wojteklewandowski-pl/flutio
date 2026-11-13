/**
 * Konwersja MusicXML (.musicxml / .xml / skompresowany .mxl) → ABC.
 *
 * Obsługujemy to, czego potrzeba do melodii na flet: pierwszą partię,
 * pierwszy głos, nuty i pauzy, kropki, triole (i inne grupy), łuki
 * łączące, metrum, tonację, tempo i tytuł. Akordy są redukowane do
 * pierwszej zapisanej nuty akordu (flet gra jednogłosowo). Ozdobniki są pomijane.
 *
 * Moduł korzysta z DOMParser, więc działa w przeglądarce (w testach: jsdom).
 */
import { unzipSync, strFromU8 } from 'fflate';

const STEP_SEMITONE: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Kolejność znaków przy kluczu: krzyżyki F C G D A E B, bemole odwrotnie. */
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

const MAJOR_KEYS: Readonly<Record<number, string>> = {
  [-7]: 'Cb', [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F',
  0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#',
};

/** Wartość zapisanej nuty jako ułamek całej nuty. */
const TYPE_VALUE: Readonly<Record<string, number>> = {
  breve: 2, whole: 1, half: 1 / 2, quarter: 1 / 4, eighth: 1 / 8,
  '16th': 1 / 16, '32nd': 1 / 32, '64th': 1 / 64,
};

/** Jednostka ABC (L:) używana w wyniku. */
const UNIT = 1 / 16;

export class MusicXmlError extends Error {}

function keyAlterations(fifths: number): Map<string, number> {
  const m = new Map<string, number>();
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach((s) => m.set(s, 1));
  if (fifths < 0) [...SHARP_ORDER].reverse().slice(0, -fifths).forEach((s) => m.set(s, -1));
  return m;
}

function childText(parent: Element, selector: string): string | undefined {
  const t = parent.querySelector(selector)?.textContent?.trim();
  return t === '' ? undefined : t;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Długość w jednostkach L jako tekst ABC: 1 → "", 2 → "2", 0.5 → "/2", 1.5 → "3/2". */
export function abcLength(units: number): string {
  // mianownik będący potęgą dwójki (do 1/64 całej nuty przy L:1/16 wystarczy 4)
  let den = 1;
  while (Math.abs(units * den - Math.round(units * den)) > 1e-9 && den < 64) den *= 2;
  let num = Math.round(units * den);
  const g = gcd(num, den);
  num /= g;
  den /= g;
  if (den === 1) return num === 1 ? '' : String(num);
  return num === 1 ? `/${den}` : `${num}/${den}`;
}

/** Nuta ABC dla kroku, oktawy (MusicXML: 4 = oktawa razkreślna). */
export function abcPitch(step: string, octave: number): string {
  if (octave >= 5) return step.toLowerCase() + "'".repeat(octave - 5);
  return step + ','.repeat(4 - octave);
}

function accidentalPrefix(alter: number): string {
  switch (alter) {
    case 2: return '^^';
    case 1: return '^';
    case 0: return '=';
    case -1: return '_';
    case -2: return '__';
    default: throw new MusicXmlError(`Nieobsługiwany znak chromatyczny (alter=${alter})`);
  }
}

/** Parsuje tekst MusicXML (partwise) i zwraca ABC. */
export function musicXmlToAbc(xmlText: string): string {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new MusicXmlError('Plik nie jest poprawnym XML-em');
  const root = doc.documentElement;
  if (root.nodeName === 'score-timewise') {
    throw new MusicXmlError('Format „score-timewise” nie jest obsługiwany – wyeksportuj plik ponownie (MuseScore zapisuje „partwise”)');
  }
  if (root.nodeName !== 'score-partwise') throw new MusicXmlError('To nie jest plik MusicXML');

  const part = root.querySelector('part');
  if (!part) throw new MusicXmlError('Plik MusicXML nie zawiera żadnej partii');

  const title =
    childText(root, 'work > work-title') ?? childText(root, 'movement-title') ?? 'Bez tytułu';
  const composer = root.querySelector('identification > creator[type="composer"]')?.textContent?.trim();

  let fifths = 0;
  let meter = '4/4';
  let tempo: number | undefined;
  let divisions = 1;
  let firstVoice: string | undefined;
  const body: string[] = [];
  let keyMap = keyAlterations(0);
  let headerKeyDone = false;
  let headerMeterDone = false;

  const measures = [...part.querySelectorAll(':scope > measure')];
  for (const measure of measures) {
    const barAlter = new Map<string, number>(); // znaki przygodne w bieżącym takcie, klucz: krok+oktawa
    const tokens: string[] = [];
    let tupletRemaining = 0;

    for (const child of [...measure.children]) {
      if (child.nodeName === 'attributes') {
        const div = childText(child, 'divisions');
        if (div) divisions = Number(div);
        const f = childText(child, 'key > fifths');
        if (f !== undefined) {
          fifths = Number(f);
          keyMap = keyAlterations(fifths);
          if (headerKeyDone) tokens.push(`[K:${MAJOR_KEYS[fifths] ?? 'C'}]`);
        }
        const beats = childText(child, 'time > beats');
        const beatType = childText(child, 'time > beat-type');
        if (beats && beatType) {
          meter = `${beats}/${beatType}`;
          if (headerMeterDone) tokens.push(`[M:${meter}]`);
        }
        continue;
      }
      if (child.nodeName === 'direction' || child.nodeName === 'sound') {
        const t = (child.nodeName === 'sound' ? child : child.querySelector('sound'))?.getAttribute('tempo');
        if (t && tempo === undefined) tempo = Math.round(Number(t));
        continue;
      }
      if (child.nodeName !== 'note') continue;

      const note = child;
      if (note.querySelector(':scope > grace')) continue; // ozdobniki pomijamy
      if (note.querySelector(':scope > chord')) continue; // dalsze nuty akordu
      const voice = childText(note, ':scope > voice') ?? '1';
      firstVoice ??= voice;
      if (voice !== firstVoice) continue;

      // wartość zapisana: typ + kropki; gdy brak typu – z <duration>
      const type = childText(note, ':scope > type');
      const dots = note.querySelectorAll(':scope > dot').length;
      let value: number;
      if (type && TYPE_VALUE[type] !== undefined) {
        value = TYPE_VALUE[type] * (2 - Math.pow(0.5, dots));
      } else {
        const dur = Number(childText(note, ':scope > duration') ?? '0');
        value = dur / divisions / 4;
      }
      // pauza na cały takt bez typu
      if (note.querySelector(':scope > rest[measure="yes"]') && !type) {
        const [b, bt] = meter.split('/').map(Number);
        value = b / bt;
      }

      // początek grupy niemiarowej (triola itp.)
      const tm = note.querySelector(':scope > time-modification');
      if (tm && tupletRemaining === 0) {
        const actual = Number(childText(tm, 'actual-notes') ?? '3');
        const normal = Number(childText(tm, 'normal-notes') ?? '2');
        // policz nuty grupy: od tej do tuplet stop (albo `actual` nut)
        let count = 0;
        let n: Element | null = note;
        while (n) {
          if (n.nodeName === 'note' && !n.querySelector(':scope > chord')) {
            count++;
            if (n.querySelector('notations > tuplet[type="stop"]')) break;
            if (!n.querySelector(':scope > time-modification')) { count--; break; }
          }
          n = n.nextElementSibling;
        }
        if (count <= 0) count = actual;
        tokens.push(actual === 3 && normal === 2 && count === 3 ? '(3' : `(${actual}:${normal}:${count}`);
        tupletRemaining = count;
      }
      if (tupletRemaining > 0) tupletRemaining--;

      const len = abcLength(value / UNIT);
      if (note.querySelector(':scope > rest')) {
        tokens.push(`z${len}`);
        continue;
      }
      const step = childText(note, 'pitch > step');
      const octave = Number(childText(note, 'pitch > octave') ?? '4');
      if (!step || !(step in STEP_SEMITONE)) throw new MusicXmlError('Nuta bez wysokości dźwięku');
      const alter = Math.round(Number(childText(note, 'pitch > alter') ?? '0'));

      const slot = `${step}${octave}`;
      const current = barAlter.get(slot) ?? keyMap.get(step) ?? 0;
      let acc = '';
      if (alter !== current) {
        acc = accidentalPrefix(alter);
        barAlter.set(slot, alter);
      }
      const tie = note.querySelector(':scope > tie[type="start"]') ? '-' : '';
      tokens.push(`${acc}${abcPitch(step, octave)}${len}${tie}`);
    }
    headerKeyDone = true;
    headerMeterDone = true;
    if (tokens.length) body.push(tokens.join(' '));
  }

  if (!body.length) throw new MusicXmlError('Nie znaleziono żadnych nut w pierwszej partii');

  const lines = body.map((m, i) => m + (i === body.length - 1 ? ' |]' : ' |'));
  // po 4 takty w linii źródła (podział na systemy robi i tak renderer)
  const bodyText: string[] = [];
  for (let i = 0; i < lines.length; i += 4) bodyText.push(lines.slice(i, i + 4).join(' '));

  return [
    'X:1',
    `T:${title}`,
    ...(composer ? [`C:${composer}`] : []),
    `M:${meter}`,
    'L:1/16',
    ...(tempo ? [`Q:1/4=${tempo}`] : []),
    `K:${MAJOR_KEYS[fifths] ?? 'C'}`,
    ...bodyText,
  ].join('\n');
}

/**
 * Wyciąga główny plik MusicXML z archiwum .mxl (zip).
 * Kolejność: META-INF/container.xml → pierwszy plik .xml/.musicxml poza META-INF.
 */
export function extractMxl(data: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new MusicXmlError('Plik .mxl nie jest poprawnym archiwum');
  }
  const container = files['META-INF/container.xml'];
  if (container) {
    const doc = new DOMParser().parseFromString(strFromU8(container), 'application/xml');
    const path = doc.querySelector('rootfile')?.getAttribute('full-path');
    if (path && files[path]) return strFromU8(files[path]);
  }
  const name = Object.keys(files).find((n) => !n.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(n));
  if (!name) throw new MusicXmlError('W archiwum .mxl nie ma pliku MusicXML');
  return strFromU8(files[name]);
}

/**
 * Wyświetlanie nut (abcjs) z diagramem chwytu pod każdą nutą.
 *
 * Jak to działa:
 *  1. abcjs rysuje utwór z opcją `oneSvgPerLine` – każdy system (linijka nut)
 *     to osobny <svg> w osobnym <div>.
 *  2. `setUpAudio()` dopisuje do każdej nuty jej wysokość MIDI (`midiPitches`).
 *     Zapamiętujemy ją OD RAZU, bo późniejsze przygotowanie odtwarzacza
 *     (z transpozycją o oktawę) nadpisuje te pola.
 *  3. Pod każdym systemem wstawiamy wiersz `.fingering-row`, a w nim diagramy
 *     ustawione absolutnie pod środkiem główki nuty. Pozycje przeliczamy przy
 *     każdej zmianie szerokości (ResizeObserver), bo nuty skalują się z oknem.
 */
import abcjs from 'abcjs';
import type { TuneObject, AbcElem } from 'abcjs';
import { fingeringFor, type FingeringSystem } from './fingerings';
import { createFingeringSvg, DIAGRAM_ASPECT } from './fingeringSvg';
import { polishName } from './pitch';

export interface ScoreNote {
  /** Pozycja nuty w tekście ABC – po niej łączymy zdarzenia odtwarzacza z nutą. */
  startChar: number;
  /** Wysokość w zapisie (MIDI), `null` dla pauzy. */
  midi: number | null;
  /** Druga (i dalsze) nuta połączona łukiem – grana razem z poprzednią. */
  tied: boolean;
  /** Element SVG nuty narysowany przez abcjs. */
  svgElement: SVGElement;
  /** Kontener diagramu pod nutą. */
  cell: HTMLElement;
  row: HTMLElement;
}

export interface RenderOptions {
  transpose: number;
  system: FingeringSystem;
  onNoteClick?: (note: ScoreNote) => void;
}

// Minimalne typy tego, co czytamy ze struktury abcjs.
interface StaffData { voices?: AbcElem[][] }
interface LineData { staff?: StaffData[] }

const MIN_DIAGRAM = 13;
const MAX_DIAGRAM = 26;

/** Układ zależny od szerokości ekranu: szerokość pięciolinii i takty w linii. */
interface Density { staffwidth: number; measuresPerLine: number }
function densityFor(width: number): Density {
  if (width < 520) return { staffwidth: 360, measuresPerLine: 1 };
  if (width < 820) return { staffwidth: 560, measuresPerLine: 2 };
  return { staffwidth: 760, measuresPerLine: 4 };
}

export class Score {
  private notes: ScoreNote[] = [];
  private byStartChar = new Map<number, ScoreNote>();
  private tune: TuneObject | null = null;
  private system: FingeringSystem = 'german';
  private active: ScoreNote | null = null;
  private readonly resizeObserver: ResizeObserver;
  private last: { abc: string; opts: RenderOptions; density: Density } | null = null;

  /**
   * @param onRerender wywoływane, gdy nuty zostały narysowane od nowa po zmianie
   *   szerokości ekranu (np. obrót telefonu) – powstaje wtedy nowy obiekt utworu.
   */
  constructor(
    private readonly container: HTMLElement,
    private readonly onRerender?: (tune: TuneObject) => void,
  ) {
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);
  }

  private onResize(): void {
    if (this.last && densityFor(this.container.clientWidth).measuresPerLine !== this.last.density.measuresPerLine) {
      const tune = this.render(this.last.abc, this.last.opts);
      this.onRerender?.(tune);
      return;
    }
    this.layout();
  }

  get tuneObject(): TuneObject | null {
    return this.tune;
  }

  get allNotes(): readonly ScoreNote[] {
    return this.notes;
  }

  /** Rysuje utwór. Rzuca wyjątek, gdy ABC nie zawiera żadnej melodii. */
  render(abc: string, opts: RenderOptions): TuneObject {
    this.container.replaceChildren();
    this.notes = [];
    this.byStartChar.clear();
    this.active = null;
    this.system = opts.system;

    const target = document.createElement('div');
    target.className = 'score-target';
    this.container.appendChild(target);

    const density = densityFor(this.container.clientWidth);
    const [tune] = abcjs.renderAbc(target, abc, {
      add_classes: true,
      oneSvgPerLine: true,
      responsive: 'resize',
      visualTranspose: opts.transpose,
      staffwidth: density.staffwidth,
      paddingleft: 0,
      paddingright: 0,
      wrap: { minSpacing: 2.2, maxSpacing: 3.2, preferredMeasuresPerLine: density.measuresPerLine },
      clickListener: (abcElem: AbcElem) => {
        const note = abcElem.startChar !== undefined ? this.byStartChar.get(abcElem.startChar) : undefined;
        if (note && opts.onNoteClick) opts.onNoteClick(note);
      },
    });
    if (!tune || !tune.lines || tune.lines.length === 0) throw new Error('Brak nut do wyświetlenia – sprawdź zapis ABC');
    this.tune = tune;
    this.last = { abc, opts, density };
    this.hideHeader(target);

    tune.setUpAudio({}); // wypełnia midiPitches (bez transpozycji odtwarzacza)
    this.collectNotes(tune, target);
    this.drawDiagrams();
    this.layout();
    return tune;
  }

  /**
   * Tytuł, kompozytora i tempo pokazujemy w HTML (nie mieszczą się na wąskim
   * ekranie), więc ukrywamy nagłówkowe SVG abcjs – te bez pięciolinii.
   */
  private hideHeader(target: HTMLElement): void {
    for (const svg of target.querySelectorAll('svg')) {
      if (!svg.querySelector('.abcjs-staff') && svg.querySelector('.abcjs-title, .abcjs-composer, .abcjs-tempo')) {
        (svg.parentElement ?? svg).style.display = 'none';
      }
    }
  }

  private collectNotes(tune: TuneObject, target: HTMLElement): void {
    const rows = new Map<Element, HTMLElement>();
    let lastPitchedMidi: number | null = null;

    for (const line of tune.lines as unknown as LineData[]) {
      const voice = line.staff?.[0]?.voices?.[0];
      if (!voice) continue;
      for (const elem of voice) {
        if (elem.el_type !== 'note' || elem.startChar === undefined) continue;
        const svgElement = elem.abselem?.elemset?.[0];
        if (!svgElement) continue;
        const wrapper = svgElement.closest('svg')?.parentElement;
        if (!wrapper || !target.contains(wrapper)) continue;

        let row = rows.get(wrapper);
        if (!row) {
          row = document.createElement('div');
          row.className = 'fingering-row';
          wrapper.after(row);
          rows.set(wrapper, row);
        }

        const isRest = elem.rest !== undefined || !elem.pitches?.length;
        const midi = isRest ? null : (elem.midiPitches?.[0]?.pitch ?? null);
        // nuta z wysokością, ale bez dźwięku MIDI = kontynuacja łuku
        const tied = !isRest && midi === null;
        const note: ScoreNote = {
          startChar: elem.startChar,
          midi: tied ? lastPitchedMidi : midi,
          tied,
          svgElement,
          cell: document.createElement('div'),
          row,
        };
        if (midi !== null) lastPitchedMidi = midi;
        note.cell.className = 'fingering-cell';
        row.appendChild(note.cell);
        this.notes.push(note);
        this.byStartChar.set(note.startChar, note);
      }
    }
  }

  /** Zmiana systemu palcowania bez ponownego rysowania nut. */
  setSystem(system: FingeringSystem): void {
    this.system = system;
    this.drawDiagrams();
    this.layout();
  }

  private drawDiagrams(): void {
    for (const note of this.notes) {
      note.cell.replaceChildren();
      note.cell.classList.toggle('is-rest', note.midi === null);
      note.cell.classList.toggle('is-tied', note.tied);
      const label = document.createElement('span');
      label.className = 'note-name';
      if (note.midi === null) {
        label.textContent = 'pauza';
        note.cell.appendChild(label);
        continue;
      }
      if (note.tied) {
        label.textContent = '⁀';
        label.title = 'Nuta połączona łukiem – trzymaj poprzedni dźwięk';
        note.cell.appendChild(label);
        continue;
      }
      const name = polishName(note.midi);
      const holes = fingeringFor(note.midi, this.system);
      label.textContent = name;
      note.cell.append(label, createFingeringSvg(holes, holes ? `Chwyt ${name}` : `${name} – poza zakresem fletu (c¹–c³)`));
      note.cell.classList.toggle('is-out-of-range', !holes);
    }
  }

  /** Ustawia diagramy pod główkami nut i dobiera ich wielkość do gęstości nut. */
  layout(): void {
    const byRow = new Map<HTMLElement, { note: ScoreNote; x: number }[]>();
    for (const note of this.notes) {
      const head = note.svgElement.querySelector('.abcjs-notehead, .abcjs-rest') ?? note.svgElement;
      const r = head.getBoundingClientRect();
      const rowRect = note.row.getBoundingClientRect();
      const x = r.left + r.width / 2 - rowRect.left;
      let list = byRow.get(note.row);
      if (!list) byRow.set(note.row, (list = []));
      list.push({ note, x });
    }
    // jedna wielkość diagramu w całym utworze – wg najciaśniej ułożonych nut
    let minGap = Infinity;
    for (const list of byRow.values()) {
      for (let i = 1; i < list.length; i++) minGap = Math.min(minGap, list[i].x - list[i - 1].x);
    }
    const size = Math.max(MIN_DIAGRAM, Math.min(MAX_DIAGRAM, Number.isFinite(minGap) ? minGap * 0.8 : MAX_DIAGRAM));
    for (const [row, list] of byRow) {
      row.style.setProperty('--diagram-w', `${size}px`);
      row.style.height = `${size * DIAGRAM_ASPECT + 22}px`;
      for (const { note, x } of list) note.cell.style.left = `${x}px`;
    }
  }

  /** Podświetla nutę o danym `startChar` (zdarzenie odtwarzacza); zwraca ją. */
  highlight(startChar: number | undefined): ScoreNote | null {
    this.clearHighlight();
    if (startChar === undefined) return null;
    const note = this.byStartChar.get(startChar) ?? null;
    if (!note) return null;
    note.cell.classList.add('is-active');
    note.svgElement.classList.add('is-active');
    this.active = note;
    return note;
  }

  clearHighlight(): void {
    if (!this.active) return;
    this.active.cell.classList.remove('is-active');
    this.active.svgElement.classList.remove('is-active');
    this.active = null;
  }

  /** Następna nuta z dźwiękiem (do podglądu „następny chwyt”). */
  nextSounding(note: ScoreNote): ScoreNote | null {
    const i = this.notes.indexOf(note);
    for (let j = i + 1; j < this.notes.length; j++) {
      const n = this.notes[j];
      if (n.midi !== null && !n.tied) return n;
    }
    return null;
  }

  /** Liczba nut poza zakresem fletu – do ostrzeżenia i podpowiedzi transpozycji. */
  outOfRangeCount(): number {
    return this.notes.filter((n) => n.midi !== null && !fingeringFor(n.midi, this.system)).length;
  }
}

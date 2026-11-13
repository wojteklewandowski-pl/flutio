/**
 * Sesja ćwiczenia z mikrofonem: „aplikacja czeka, aż zagram dobrze”.
 *
 * Czysta maszyna stanów (bez Web Audio i DOM), zasilana ramkami z mikrofonu
 * mniej więcej 60 razy na sekundę. Dzięki temu da się ją dokładnie przetestować.
 *
 * Zasady:
 *  - Uczeń ma zagrać bieżącą nutę i przytrzymać ją `holdMs` w granicach
 *    `toleranceCents` → nuta zaliczona, przechodzimy do następnej.
 *  - Dwie takie same nuty z rzędu (h¹ h¹ h¹) trzeba rozdzielić – językiem
 *    („tu”) albo przerwą. Rozpoznajemy to po spadku głośności lub ciszy
 *    („zwolnienie”). Bez tego jeden długi dźwięk zaliczałby kilka nut.
 *  - Pewny, stabilny zły dźwięk (≥ `holdMs`) liczy się jako jedna pomyłka
 *    na nutę – dalsze próby tej samej nuty nie są już karane.
 *  - Flet sopranowy brzmi oktawę wyżej niż zapis: oczekiwana wysokość
 *    brzmiąca = zapis + `transposeSemitones` (domyślnie 12).
 */

export interface PracticeTarget {
  /** Dowolny identyfikator nuty (u nas: `startChar` z ABC). */
  id: number;
  /** Wysokość w zapisie (MIDI). */
  writtenMidi: number;
}

export interface PracticeOptions {
  toleranceCents: number;
  holdMs: number;
  /** Ile półtonów flet brzmi wyżej niż zapis (sopranowy: 12). */
  transposeSemitones: number;
  /** Zwolnienie przy powtórzonej nucie: głośność spada poniżej tej części szczytu. */
  releaseRatio: number;
}

export const DEFAULT_PRACTICE_OPTIONS: PracticeOptions = {
  toleranceCents: 50,
  holdMs: 150,
  transposeSemitones: 12,
  releaseRatio: 0.4,
};

/** Jedna ramka z mikrofonu. `midi` – wysokość brzmiąca (liczba rzeczywista) lub null. */
export interface PracticeFrame {
  time: number;
  midi: number | null;
  rms: number;
}

export type Hint = 'ok' | 'sharp' | 'flat' | 'octave-high' | 'octave-low' | 'wrong-note' | 'silence';

export interface FrameStatus {
  /** Bieżąca nuta (indeks w `targets`) albo `targets.length` po zakończeniu. */
  index: number;
  /** Odchyłka od oczekiwanej wysokości w centach (bez oktaw) – do wskaźnika stroju. */
  cents: number | null;
  /** Wykryta wysokość w zapisie (zaokrąglona), do pokazania nazwy. */
  playedWrittenMidi: number | null;
  hint: Hint;
  /** Czeka na rozdzielenie powtórzonej nuty. */
  waitingForRelease: boolean;
}

export type PracticeEvent =
  | { type: 'correct'; index: number; target: PracticeTarget }
  | { type: 'mistake'; index: number; target: PracticeTarget; playedWrittenMidi: number; hint: Hint }
  /** `clean` – nuty zagrane bez żadnej pomyłki. */
  | { type: 'finished'; clean: number; mistakes: number };

export class PracticeSession {
  private readonly opt: PracticeOptions;
  private idx = 0;
  private holdStart: number | null = null;
  private wrongStart: number | null = null;
  private wrongMidi: number | null = null;
  private mistakeCounted = new Set<number>();
  private mistakes = 0;
  private needRelease = false;
  private releasePitch: number | null = null;
  private peakRms = 0;
  private mutedUntil = -Infinity;

  constructor(
    private readonly targets: readonly PracticeTarget[],
    options: Partial<PracticeOptions> = {},
    private readonly emit: (e: PracticeEvent) => void = () => {},
  ) {
    this.opt = { ...DEFAULT_PRACTICE_OPTIONS, ...options };
  }

  get index(): number {
    return this.idx;
  }

  get finished(): boolean {
    return this.idx >= this.targets.length;
  }

  get current(): PracticeTarget | undefined {
    return this.targets[this.idx];
  }

  get mistakeCount(): number {
    return this.mistakes;
  }

  /** Przejście do wybranej nuty (kliknięcie w nutę). */
  jumpTo(index: number): void {
    this.idx = Math.max(0, Math.min(this.targets.length, index));
    this.resetDetection();
    this.needRelease = false;
  }

  /** Ignoruj mikrofon do chwili `until` (np. gdy aplikacja sama gra podpowiedź). */
  muteUntil(until: number): void {
    this.mutedUntil = until;
    this.resetDetection();
  }

  private resetDetection(): void {
    this.holdStart = null;
    this.wrongStart = null;
    this.wrongMidi = null;
  }

  feed(frame: PracticeFrame): FrameStatus {
    const status: FrameStatus = {
      index: this.idx,
      cents: null,
      playedWrittenMidi: frame.midi === null ? null : Math.round(frame.midi) - this.opt.transposeSemitones,
      hint: frame.midi === null ? 'silence' : 'ok',
      waitingForRelease: this.needRelease,
    };
    const target = this.current;
    if (!target || frame.time < this.mutedUntil) return status;

    const expected = target.writtenMidi + this.opt.transposeSemitones;

    // --- zwolnienie po zaliczonej nucie
    if (this.needRelease) {
      this.peakRms = Math.max(this.peakRms, frame.rms);
      const silent = frame.midi === null;
      const dipped = frame.rms < this.peakRms * this.opt.releaseRatio;
      const changedPitch = frame.midi !== null && this.releasePitch !== null && Math.abs(frame.midi - this.releasePitch) > 0.6;
      if (silent || dipped || changedPitch) {
        this.needRelease = false;
        status.waitingForRelease = false;
      } else {
        status.hint = 'ok';
        return status;
      }
    }

    if (frame.midi === null) {
      this.resetDetection();
      return status;
    }

    const diff = frame.midi - expected; // w półtonach
    const octaves = Math.round(diff / 12);
    const withinOctave = diff - octaves * 12;
    status.cents = Math.round(withinOctave * 100);

    const inTune = Math.abs(diff) * 100 <= this.opt.toleranceCents;
    if (inTune) {
      status.hint = 'ok';
      this.wrongStart = null;
      this.wrongMidi = null;
      this.holdStart ??= frame.time;
      if (frame.time - this.holdStart >= this.opt.holdMs) this.accept(target, frame);
      return status;
    }

    // zły dźwięk
    this.holdStart = null;
    status.hint =
      Math.abs(withinOctave) * 100 <= this.opt.toleranceCents
        ? octaves > 0 ? 'octave-high' : 'octave-low'
        : Math.abs(diff) < 1 ? (diff > 0 ? 'sharp' : 'flat') : 'wrong-note';

    const rounded = Math.round(frame.midi);
    if (this.wrongMidi !== rounded) {
      this.wrongMidi = rounded;
      this.wrongStart = frame.time;
    } else if (
      this.wrongStart !== null &&
      frame.time - this.wrongStart >= this.opt.holdMs &&
      status.hint !== 'sharp' && status.hint !== 'flat' && // lekko nieczysto to jeszcze nie pomyłka
      !this.mistakeCounted.has(this.idx)
    ) {
      this.mistakeCounted.add(this.idx);
      this.mistakes++;
      this.emit({ type: 'mistake', index: this.idx, target, playedWrittenMidi: rounded - this.opt.transposeSemitones, hint: status.hint });
    }
    return status;
  }

  private accept(target: PracticeTarget, frame: PracticeFrame): void {
    const index = this.idx;
    this.idx++;
    this.resetDetection();
    this.needRelease = true;
    this.releasePitch = frame.midi;
    this.peakRms = frame.rms;
    this.emit({ type: 'correct', index, target });
    if (this.finished) {
      this.emit({ type: 'finished', clean: this.targets.length - this.mistakeCounted.size, mistakes: this.mistakes });
    }
  }
}

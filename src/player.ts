/**
 * Odtwarzanie melodii: syntezator abcjs (Web Audio + próbki SoundFont)
 * zsynchronizowany z `TimingCallbacks`, który co nutę wywołuje `onNote`.
 *
 * - Instrument: General MIDI #75 „Recorder” (indeks 74 liczony od zera).
 * - Flet sopranowy brzmi oktawę wyżej niż zapis – domyślnie transponujemy
 *   dźwięk o +12 półtonów (tylko brzmienie, chwyty liczone są z zapisu).
 * - Tempo = tempo z nut (Q:) × współczynnik z suwaka. Zmiana tempa w trakcie
 *   grania przebudowuje bufor audio i wznawia od tego samego miejsca.
 * - Próbki są pobierane z sieci przy pierwszym odtworzeniu
 *   (domyślny serwer abcjs: paulrosen.github.io/midi-js-soundfonts),
 *   a service worker (public/sw.js) trzyma je potem w pamięci podręcznej.
 */
import abcjs from 'abcjs';
import type { TuneObject, MidiBuffer, NoteTimingEvent } from 'abcjs';

export const RECORDER_PROGRAM = 74;

export interface PlayerSettings {
  tempoFactor: number;
  octaveUp: boolean;
  loop: boolean;
}

export interface PlayerHooks {
  /** Wywoływane na początku każdej nuty/pauzy (`startChar` w tekście ABC). */
  onNote(startChar: number | undefined): void;
  /** Zmiana stanu odtwarzania (do przycisków). */
  onState(state: PlayerState): void;
  onError(message: string): void;
}

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused';

export class Player {
  private ctx: AudioContext | null = null;
  private synth: MidiBuffer | null = null;
  private timer: abcjs.TimingCallbacks | null = null;
  private tune: TuneObject | null = null;
  private primedFor: string | null = null; // klucz ustawień, dla których bufor jest gotowy
  private state: PlayerState = 'idle';
  /** Miejsce (0..1), od którego zegar nut ma ruszyć po przebudowie bufora. */
  private pendingOffset: number | null = null;

  constructor(
    private readonly hooks: PlayerHooks,
    private settings: PlayerSettings,
  ) {}

  static supported(): boolean {
    return abcjs.synth.supportsAudio();
  }

  get currentState(): PlayerState {
    return this.state;
  }

  /** Bazowe tempo utworu (ćwierćnuty na minutę). */
  baseBpm(): number {
    return this.tune ? this.tune.getBpm() : 100;
  }

  currentBpm(): number {
    return Math.round(this.baseBpm() * this.settings.tempoFactor);
  }

  /** Nowy utwór – zatrzymuje poprzedni. */
  setTune(tune: TuneObject): void {
    this.stop();
    this.tune = tune;
    this.primedFor = null;
  }

  async updateSettings(next: Partial<PlayerSettings>): Promise<void> {
    const old = this.settings;
    this.settings = { ...old, ...next };
    const needsRebuild = old.tempoFactor !== this.settings.tempoFactor || old.octaveUp !== this.settings.octaveUp;
    if (!needsRebuild) return;
    if (this.state === 'playing' || this.state === 'paused') {
      const resume = this.state === 'playing';
      const progress = this.progress();
      this.halt();
      await this.prepare();
      this.synth?.seek(progress);
      this.pendingOffset = progress;
      if (resume) this.startSources();
      else this.setState('paused');
    } else {
      this.primedFor = null;
    }
  }

  async togglePlay(): Promise<void> {
    if (this.state === 'playing') return this.pause();
    if (this.state === 'paused') return this.startSources();
    if (this.state === 'loading') return;
    await this.play();
  }

  async play(): Promise<void> {
    if (!this.tune) return;
    try {
      await this.prepare();
      this.startSources();
    } catch (e) {
      this.setState('idle');
      this.hooks.onError(`Nie udało się uruchomić dźwięku: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.synth?.pause();
    this.timer?.pause();
    this.setState('paused');
  }

  stop(): void {
    this.halt();
    this.hooks.onNote(undefined);
    this.setState('idle');
  }

  /**
   * Zagraj pojedynczy dźwięk (kliknięcie w nutę). `midi` – wysokość z zapisu.
   * Zwraca czas trwania w ms (żeby tryb ćwiczenia mógł na ten czas wyciszyć mikrofon).
   */
  async playSingle(midi: number): Promise<number> {
    if (!this.tune) return 0;
    await this.audioContext();
    const pitch = midi + (this.settings.octaveUp ? 12 : 0);
    const msPerMeasure = this.tune.millisecondsPerMeasure(this.currentBpm());
    // czas trwania w ułamku taktu: ćwierćnuta
    await abcjs.synth.playEvent(
      [{ pitch, volume: 90, start: 0, duration: 0.25, instrument: RECORDER_PROGRAM, gap: 0 }],
      [],
      msPerMeasure,
    );
    return msPerMeasure * 0.25;
  }

  // ---------------------------------------------------------------- wewnętrzne

  private settingsKey(): string {
    return `${this.settings.tempoFactor}|${this.settings.octaveUp}`;
  }

  /** Wspólny AudioContext (tworzony przy pierwszym geście użytkownika); używa go też mikrofon. */
  async audioContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      // abcjs używa globalnego kontekstu przy playEvent
      (window as unknown as { abcjsAudioContext: AudioContext }).abcjsAudioContext = this.ctx;
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume(); // iOS/Chrome: wymaga gestu użytkownika
    return this.ctx;
  }

  private async prepare(): Promise<void> {
    if (!this.tune) return;
    if (this.synth && this.timer && this.primedFor === this.settingsKey()) return;
    this.setState('loading');
    const audioContext = await this.audioContext();
    const tune = this.tune;
    const bpm = this.currentBpm();

    const synth = new abcjs.synth.CreateSynth();
    await synth.init({
      audioContext,
      visualObj: tune,
      millisecondsPerMeasure: tune.millisecondsPerMeasure(bpm),
      options: {
        program: RECORDER_PROGRAM,
        midiTranspose: this.settings.octaveUp ? 12 : 0,
      },
    });
    await synth.prime();

    this.synth = synth;
    this.timer = new abcjs.TimingCallbacks(tune, {
      qpm: bpm,
      eventCallback: (ev: NoteTimingEvent | null) => this.onTimingEvent(ev),
    });
    this.primedFor = this.settingsKey();
  }

  private onTimingEvent(ev: NoteTimingEvent | null): undefined | 'continue' {
    if (!ev) {
      // koniec utworu
      if (this.settings.loop && this.state === 'playing') {
        this.halt();
        this.startSources();
      } else {
        this.stop();
      }
      return undefined;
    }
    this.hooks.onNote(ev.startChar);
    return undefined;
  }

  private startSources(): void {
    if (!this.synth || !this.timer) return;
    if (this.state === 'paused') {
      this.synth.resume();
    } else {
      this.synth.start();
    }
    if (this.pendingOffset !== null && this.pendingOffset > 0) this.timer.start(this.pendingOffset);
    else this.timer.start();
    this.pendingOffset = null;
    this.setState('playing');
  }

  /** Zatrzymanie bez zmiany stanu UI (używane wewnętrznie). */
  private halt(): void {
    try {
      this.synth?.stop();
    } catch {
      /* syntezator mógł już nie grać */
    }
    this.timer?.stop();
    this.timer?.reset();
    this.synth?.seek(0);
    this.pendingOffset = null;
    this.state = this.state === 'loading' ? 'loading' : 'idle';
  }

  /** Postęp 0..1 według zegara nut. */
  private progress(): number {
    const t = this.timer as unknown as { currentTime?: number; lastMoment?: number } | null;
    if (!t?.lastMoment || !t.currentTime) return 0;
    return Math.min(1, Math.max(0, t.currentTime / t.lastMoment));
  }

  private setState(s: PlayerState): void {
    this.state = s;
    this.hooks.onState(s);
  }
}

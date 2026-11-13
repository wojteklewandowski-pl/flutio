/**
 * Mikrofon → ramki z wysokością dźwięku, ok. 60 razy na sekundę.
 *
 * getUserMedia → MediaStreamSource → AnalyserNode; w pętli requestAnimationFrame
 * pobieramy ostatnie `FRAME_SIZE` próbek i liczymy wysokość (YIN, pitchDetect.ts).
 *
 * Ważne:
 *  - Wyłączamy echoCancellation / noiseSuppression / autoGainControl – te filtry
 *    są robione pod mowę i potrafią „zjadać” czysty, ciągły dźwięk fletu.
 *  - Przeglądarka da dostęp do mikrofonu tylko na https:// albo http://localhost.
 *  - Wynik jest wygładzany medianą z 3 ostatnich ramek (usuwa pojedyncze skoki).
 */
import { detectPitch, freqToMidi, type PitchOptions } from './pitchDetect';

/** 1024 próbki ≈ 21 ms przy 48 kHz – wystarcza dla dźwięków od 240 Hz wzwyż. */
const FRAME_SIZE = 1024;

export interface MicFrame {
  /** performance.now() w ms */
  time: number;
  /** Wysokość brzmiąca jako MIDI (liczba rzeczywista) albo null. */
  midi: number | null;
  rms: number;
  clarity: number;
}

export class MicrophoneError extends Error {}

export function microphoneAvailable(): boolean {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

function median3(a: number, b: number, c: number): number {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

export class Microphone {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private readonly buf = new Float32Array(FRAME_SIZE);
  private readonly scratch = new Float32Array(FRAME_SIZE);
  private history: number[] = [];

  constructor(private readonly pitchOptions: Partial<PitchOptions> = {}) {}

  get running(): boolean {
    return this.stream !== null;
  }

  async start(ctx: AudioContext, onFrame: (f: MicFrame) => void): Promise<void> {
    if (this.running) return;
    if (!microphoneAvailable()) {
      throw new MicrophoneError(
        window.isSecureContext
          ? 'Ta przeglądarka nie daje dostępu do mikrofonu.'
          : 'Mikrofon działa tylko przez https:// (albo na localhost). Uruchom „npm run dev:https” – patrz README.',
      );
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      throw new MicrophoneError(
        name === 'NotAllowedError'
          ? 'Brak zgody na mikrofon. Zezwól na dostęp w ustawieniach strony (ikona kłódki przy adresie).'
          : name === 'NotFoundError'
            ? 'Nie znaleziono mikrofonu.'
            : `Nie udało się włączyć mikrofonu: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (ctx.state === 'suspended') await ctx.resume();
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = FRAME_SIZE;
    this.source.connect(this.analyser); // bez połączenia do głośników – brak sprzężenia
    this.history = [];

    const sampleRate = ctx.sampleRate;
    const loop = () => {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      const r = detectPitch(this.buf, sampleRate, this.pitchOptions, this.scratch);
      let midi: number | null = null;
      if (r.freq !== null) {
        this.history.push(freqToMidi(r.freq));
        if (this.history.length > 3) this.history.shift();
        midi = this.history.length === 3 ? median3(this.history[0], this.history[1], this.history[2]) : this.history[this.history.length - 1];
      } else {
        this.history = [];
      }
      onFrame({ time: performance.now(), midi, rms: r.rms, clarity: r.clarity });
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.history = [];
  }
}

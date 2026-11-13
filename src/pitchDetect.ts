/**
 * Wykrywanie wysokości dźwięku (częstotliwości podstawowej) algorytmem YIN.
 *
 * A. de Cheveigné, H. Kawahara, „YIN, a fundamental frequency estimator for
 * speech and music”, JASA 111(4), 2002.
 *
 * Kroki (numeracja jak w artykule):
 *  2. funkcja różnicowa  d(τ) = Σ (x[j] − x[j+τ])²
 *  3. normalizacja       d'(τ) = d(τ) · τ / Σ_{k≤τ} d(k)   (d'(0) = 1)
 *  4. pierwsze τ, dla którego d'(τ) < próg, i dalej do lokalnego minimum
 *  5. interpolacja paraboliczna wokół minimum (dokładność poniżej próbki)
 *
 * Flet prosty sopranowy brzmi od c² (523 Hz) do c⁴ (2093 Hz), a jego dźwięk
 * jest zbliżony do sinusoidy, więc YIN radzi sobie z nim bardzo dobrze.
 * Domyślny zakres szukania (240–2600 Hz) obejmuje go z zapasem; dolna granica
 * pozwala też wykryć, że ktoś gra na flecie altowym albo śpiewa.
 *
 * Moduł jest czysty (bez Web Audio) – testy podają mu syntetyczne sygnały.
 */

export interface PitchOptions {
  minFreq: number;
  maxFreq: number;
  /** Próg d'(τ); mniejszy = ostrzejszy (mniej fałszywych wykryć, więcej „nie wiem”). */
  threshold: number;
  /** Poniżej tej głośności (RMS) uznajemy, że jest cisza. */
  minRms: number;
}

export const DEFAULT_PITCH_OPTIONS: PitchOptions = {
  minFreq: 240,
  maxFreq: 2600,
  threshold: 0.15,
  minRms: 0.01,
};

export interface PitchResult {
  /** Częstotliwość w Hz albo `null`, gdy nie ma wyraźnego dźwięku. */
  freq: number | null;
  /** Pewność 0..1 (1 − d'(τ) w minimum). */
  clarity: number;
  /** Głośność ramki (RMS). */
  rms: number;
}

export function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/**
 * Wykrywa wysokość w ramce próbek. Długość ramki musi być co najmniej
 * dwa razy większa niż najdłuższy okres (`sampleRate / minFreq`).
 * `scratch` to opcjonalny bufor roboczy (długość ≥ maxTau + 2), żeby nie
 * alokować pamięci 60 razy na sekundę.
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  options: Partial<PitchOptions> = {},
  scratch?: Float32Array,
): PitchResult {
  const opt = { ...DEFAULT_PITCH_OPTIONS, ...options };
  const level = rms(buf);
  if (level < opt.minRms) return { freq: null, clarity: 0, rms: level };

  const minTau = Math.max(2, Math.floor(sampleRate / opt.maxFreq));
  const maxTau = Math.ceil(sampleRate / opt.minFreq);
  if (buf.length < 2 * (maxTau + 1)) {
    throw new RangeError(`Za krótka ramka: ${buf.length} próbek, potrzeba co najmniej ${2 * (maxTau + 1)} dla ${opt.minFreq} Hz`);
  }
  // okno całkowania; liczymy d(τ) do maxTau+1 (potrzebne do interpolacji), więc j+τ ≤ length−1
  const W = buf.length - maxTau - 1;
  const d = scratch && scratch.length >= maxTau + 2 ? scratch : new Float32Array(maxTau + 2);

  // krok 2 + 3: funkcja różnicowa i skumulowana normalizacja
  d[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxTau + 1; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    runningSum += sum;
    d[tau] = runningSum === 0 ? 1 : (sum * tau) / runningSum;
  }

  // krok 4: pierwsze minimum poniżej progu
  let tauEst = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (d[tau] < opt.threshold) {
      while (tau + 1 <= maxTau && d[tau + 1] < d[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst < 0) {
    // brak minimum pod progiem – dźwięk nieokresowy (szum, dmuchanie)
    let best = 1;
    for (let tau = minTau; tau <= maxTau; tau++) best = Math.min(best, d[tau]);
    return { freq: null, clarity: Math.max(0, 1 - best), rms: level };
  }

  // krok 5: interpolacja paraboliczna
  const x0 = d[tauEst - 1];
  const x1 = d[tauEst];
  const x2 = d[tauEst + 1];
  const denom = x0 - 2 * x1 + x2;
  const shift = denom !== 0 ? (x0 - x2) / (2 * denom) : 0;
  const betterTau = tauEst + Math.max(-1, Math.min(1, shift));

  return { freq: sampleRate / betterTau, clarity: Math.max(0, Math.min(1, 1 - x1)), rms: level };
}

/** Hz → numer MIDI jako liczba rzeczywista (A4 = 440 Hz = 69). */
export function freqToMidi(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

/** Odchyłka w centach od najbliższego półtonu (−50..+50). */
export function centsFromNearest(midiFloat: number): number {
  return (midiFloat - Math.round(midiFloat)) * 100;
}

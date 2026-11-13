import { describe, expect, it } from 'vitest';
import { detectPitch, freqToMidi, centsFromNearest } from '../src/pitchDetect';

const SR = 48000;
const N = 2048;

function tone(freq: number, harmonics: number[] = [1], amp = 0.3, sr = SR, n = N): Float32Array {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    harmonics.forEach((a, k) => (v += a * Math.sin((2 * Math.PI * freq * (k + 1) * i) / sr)));
    b[i] = amp * v;
  }
  return b;
}

/** Deterministyczny szum (LCG), żeby testy były powtarzalne. */
function noise(amp: number, n = N): Float32Array {
  let s = 12345;
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    b[i] = amp * ((s / 0x7fffffff) * 2 - 1);
  }
  return b;
}

const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);

describe('detectPitch (YIN)', () => {
  // cały zakres brzmiący fletu sopranowego: c² … c⁴
  it.each([523.25, 587.33, 880, 987.77, 1174.66, 1567.98, 2093.0])('sinus %f Hz z dokładnością < 5 centów', (f) => {
    const r = detectPitch(tone(f), SR);
    expect(r.freq).not.toBeNull();
    expect(Math.abs(cents(r.freq!, f))).toBeLessThan(5);
    expect(r.clarity).toBeGreaterThan(0.9);
  });

  it('dźwięk z alikwotami (jak flet: mocna 2. harmoniczna) – bez błędu oktawy', () => {
    const f = 659.25; // e²
    const r = detectPitch(tone(f, [1, 0.6, 0.25, 0.1]), SR);
    expect(Math.abs(cents(r.freq!, f))).toBeLessThan(5);
  });

  it('działa przy 44,1 kHz', () => {
    const r = detectPitch(tone(783.99, [1], 0.3, 44100), 44100);
    expect(Math.abs(cents(r.freq!, 783.99))).toBeLessThan(5);
  });

  it('dźwięk z lekkim szumem oddechu nadal rozpoznany', () => {
    const t = tone(880);
    const ns = noise(0.03);
    const mixed = t.map((v, i) => v + ns[i]);
    expect(Math.abs(cents(detectPitch(mixed, SR).freq!, 880))).toBeLessThan(10);
  });

  it('cisza → null', () => {
    const r = detectPitch(new Float32Array(N), SR);
    expect(r.freq).toBeNull();
    expect(r.rms).toBe(0);
  });

  it('sam szum (dmuchanie bez tonu) → null', () => {
    expect(detectPitch(noise(0.3), SR).freq).toBeNull();
  });

  it('za krótka ramka → wyjątek', () => {
    expect(() => detectPitch(tone(880, [1], 0.3, SR, 300), SR)).toThrow(RangeError);
  });
});

describe('freqToMidi / centsFromNearest', () => {
  it('A4 = 69, C5 = 72', () => {
    expect(freqToMidi(440)).toBeCloseTo(69, 6);
    expect(freqToMidi(523.2511)).toBeCloseTo(72, 3);
  });
  it('centy', () => {
    expect(centsFromNearest(69.25)).toBeCloseTo(25, 6);
    expect(centsFromNearest(68.8)).toBeCloseTo(-20, 6);
  });
});

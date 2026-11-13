import { describe, expect, it } from 'vitest';
import { fingeringFor, parseHoles, differsBetweenSystems, LOWEST_MIDI, HIGHEST_MIDI, HOLE_COUNT } from '../src/fingerings';

describe('tabela chwytów', () => {
  it('ma chwyt dla każdej nuty od c¹ do c³ (25 dźwięków chromatycznie)', () => {
    for (let m = LOWEST_MIDI; m <= HIGHEST_MIDI; m++) {
      const h = fingeringFor(m);
      expect(h, `MIDI ${m}`).toBeDefined();
      expect(h).toHaveLength(HOLE_COUNT);
    }
  });

  it('zwraca undefined poza zakresem fletu', () => {
    expect(fingeringFor(59)).toBeUndefined();
    expect(fingeringFor(85)).toBeUndefined();
  });

  it('c¹ – wszystko zakryte, g¹ – kciuk + lewa ręka', () => {
    expect(fingeringFor(60)).toEqual(Array(8).fill('closed'));
    expect(fingeringFor(67)).toEqual(['closed', 'closed', 'closed', 'closed', 'open', 'open', 'open', 'open']);
  });

  it('chwyty z podręcznika: półotwory i kciuk', () => {
    expect(fingeringFor(61)?.[7]).toBe('half'); // cis¹ – mały palec w połowie
    expect(fingeringFor(63)?.[6]).toBe('half'); // dis¹
    expect(fingeringFor(74)?.[0]).toBe('open'); // d² – kciuk odkryty
    expect(fingeringFor(76)?.[0]).toBe('half'); // e² – kciuk w połowie
    expect(fingeringFor(84)?.[0]).toBe('threeQuarter'); // c³
  });

  it('palcowanie barokowe różni się tylko dla f¹ i f²', () => {
    for (let m = LOWEST_MIDI; m <= HIGHEST_MIDI; m++) {
      const same = JSON.stringify(fingeringFor(m, 'german')) === JSON.stringify(fingeringFor(m, 'baroque'));
      expect(same, `MIDI ${m}`).toBe(!differsBetweenSystems(m));
    }
    expect(differsBetweenSystems(65)).toBe(true);
    expect(differsBetweenSystems(77)).toBe(true);
    expect(fingeringFor(65, 'baroque')?.slice(4)).toEqual(['closed', 'open', 'closed', 'open']);
  });

  it('parseHoles odrzuca błędny zapis', () => {
    expect(() => parseHoles('x xxx xxx')).toThrow(/8 otworów/);
    expect(() => parseHoles('x xxx xxxz')).toThrow(/Nieznany znak/);
  });
});

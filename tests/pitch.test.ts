import { describe, expect, it } from 'vitest';
import { polishName } from '../src/pitch';

describe('polskie nazwy dźwięków', () => {
  it.each([
    [60, 'c¹'], [61, 'cis¹'], [70, 'b¹'], [71, 'h¹'], [72, 'c²'], [84, 'c³'],
    [57, 'a'], [47, 'H'],
  ])('MIDI %i → %s', (midi, name) => {
    expect(polishName(midi)).toBe(name);
  });
});

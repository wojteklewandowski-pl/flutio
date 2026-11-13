/**
 * Polskie nazwy dźwięków (system niemiecki: h = B, b = B♭).
 * Oktawy: razkreślna c¹ (MIDI 60–71), dwukreślna c² (72–83), trzykreślna c³ (84…),
 * mała (48–59) bez oznaczenia, wielka (36–47) wielką literą.
 */

const NAMES = ['c', 'cis', 'd', 'dis', 'e', 'f', 'fis', 'g', 'gis', 'a', 'b', 'h'] as const;
const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵'] as const;

/** Nazwa dźwięku bez oktawy, np. 61 → "cis". */
export function pitchClassName(midi: number): string {
  return NAMES[((midi % 12) + 12) % 12];
}

/** Pełna nazwa z oznaczeniem oktawy, np. 60 → "c¹", 82 → "b²", 57 → "a". */
export function polishName(midi: number): string {
  const name = pitchClassName(midi);
  const octave = Math.floor(midi / 12) - 4; // 60 → 1
  if (octave >= 1 && octave < SUPERSCRIPT.length) return name + SUPERSCRIPT[octave];
  if (octave === 0) return name;
  if (octave === -1) return name.charAt(0).toUpperCase() + name.slice(1);
  return `${name}(${midi})`;
}

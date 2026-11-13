/**
 * Rysuje diagram chwytu jako SVG: pionowy flet, na górze kciuk,
 * potem 3 otwory lewej ręki i 4 otwory prawej (jak w podręczniku).
 * Kolory pochodzą ze zmiennych CSS (--hole-fill, --hole-stroke, --flute-body),
 * więc diagram dopasowuje się do jasnego i ciemnego motywu.
 */
import type { HoleState } from './fingerings';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Geometria w jednostkach viewBox (szerokość 24).
const W = 24;
const R = 7;
const CX = W / 2;
const GAP = 19; // odstęp między środkami otworów
const SECTION_GAP = 9; // dodatkowa przerwa między kciukiem / lewą / prawą ręką
const TOP = 12;

function holeY(i: number): number {
  const section = i === 0 ? 0 : i <= 3 ? 1 : 2;
  return TOP + i * GAP + section * SECTION_GAP;
}

const H = holeY(7) + R + 6;

export const DIAGRAM_ASPECT = H / W;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Wycinek koła od kąta „12:00” zgodnie z ruchem wskazówek, `fraction` ∈ (0,1). */
function piePath(cx: number, cy: number, r: number, fraction: number): string {
  const a = fraction * 2 * Math.PI;
  const x = cx + r * Math.sin(a);
  const y = cy - r * Math.cos(a);
  const large = fraction > 0.5 ? 1 : 0;
  return `M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 ${large} 1 ${x},${y} Z`;
}

function drawHole(svg: SVGSVGElement, cy: number, state: HoleState): void {
  const circle = el('circle', { cx: CX, cy, r: R, class: 'hole' });
  if (state === 'closed') circle.classList.add('hole--closed');
  svg.appendChild(circle);
  if (state === 'half') {
    // lewa połowa zakryta
    svg.appendChild(el('path', { d: `M${CX},${cy - R} A${R},${R} 0 0 0 ${CX},${cy + R} Z`, class: 'hole-fill' }));
  } else if (state === 'threeQuarter') {
    svg.appendChild(el('path', { d: piePath(CX, cy, R, 0.75), class: 'hole-fill', transform: `rotate(180 ${CX} ${cy})` }));
  }
}

/**
 * Tworzy element <svg> z diagramem. `holes === undefined` oznacza nutę poza
 * zakresem fletu – rysowany jest pusty flet ze znakiem zapytania.
 */
export function createFingeringSvg(holes: readonly HoleState[] | undefined, label?: string): SVGSVGElement {
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fingering', role: 'img' });
  if (label) {
    const title = el('title', {});
    title.textContent = label;
    svg.appendChild(title);
    svg.setAttribute('aria-label', label);
  }
  svg.appendChild(el('rect', { x: 1, y: 1, width: W - 2, height: H - 2, rx: 5, class: 'flute-body' }));
  // linie oddzielające kciuk / lewą / prawą rękę
  for (const after of [0, 3]) {
    const y = (holeY(after) + holeY(after + 1)) / 2;
    svg.appendChild(el('line', { x1: 1, x2: W - 1, y1: y, y2: y, class: 'flute-divider' }));
  }
  if (!holes) {
    const q = el('text', { x: CX, y: H / 2 + 6, 'text-anchor': 'middle', class: 'fingering-unknown' });
    q.textContent = '?';
    svg.appendChild(q);
    return svg;
  }
  holes.forEach((state, i) => drawHole(svg, holeY(i), state));
  return svg;
}

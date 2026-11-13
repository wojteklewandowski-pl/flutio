import { describe, expect, it } from 'vitest';
import { PracticeSession, type PracticeEvent, type PracticeTarget } from '../src/practice';

/** Symulacja: lista odcinków [czas ms, wysokość brzmiąca | null, rms], ramki co 16 ms. */
function run(session: PracticeSession, segments: [number, number | null, number?][], start = 0) {
  let t = start;
  const statuses = [];
  for (const [dur, midi, rms = 0.2] of segments) {
    const end = t + dur;
    for (; t < end; t += 16) statuses.push(session.feed({ time: t, midi, rms: midi === null ? 0 : rms }));
  }
  return { t, statuses };
}

const targets = (...written: number[]): PracticeTarget[] => written.map((w, i) => ({ id: i * 10, writtenMidi: w }));

function session(t: PracticeTarget[]) {
  const events: PracticeEvent[] = [];
  const s = new PracticeSession(t, {}, (e) => events.push(e));
  return { s, events };
}

describe('PracticeSession', () => {
  it('zalicza nutę po przytrzymaniu 150 ms (flet brzmi oktawę wyżej)', () => {
    const { s, events } = session(targets(67, 69)); // g¹, a¹ → brzmi g², a²
    run(s, [[100, 79]]);
    expect(s.index).toBe(0); // za krótko
    run(s, [[100, 79]], 100);
    expect(s.index).toBe(1);
    expect(events[0]).toMatchObject({ type: 'correct', index: 0 });
  });

  it('akceptuje lekko nieczysty dźwięk w granicach 50 centów', () => {
    const { s } = session(targets(67));
    run(s, [[200, 79.4]]);
    expect(s.finished).toBe(true);
  });

  it('kolejna, inna nuta – wystarczy zmienić dźwięk (bez przerwy)', () => {
    const { s, events } = session(targets(67, 69));
    run(s, [[200, 79], [200, 81]]);
    expect(s.finished).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'finished', clean: 2, mistakes: 0 });
  });

  it('powtórzona nuta wymaga rozdzielenia – jeden długi dźwięk zalicza tylko jedną', () => {
    const { s } = session(targets(71, 71, 71)); // h¹ h¹ h¹
    run(s, [[800, 83]]);
    expect(s.index).toBe(1);
  });

  it('powtórzona nuta: przerwa (cisza) albo spadek głośności rozdziela dźwięki', () => {
    const { s } = session(targets(71, 71, 71));
    let { t } = run(s, [[200, 83], [48, null], [200, 83]]); // cisza
    expect(s.index).toBe(2);
    ({ t } = run(s, [[48, 83, 0.05], [200, 83, 0.2]], t)); // „tu” – chwilowy spadek głośności
    expect(s.index).toBe(3);
  });

  it('zły dźwięk = jedna pomyłka na nutę; potem można poprawić', () => {
    const { s, events } = session(targets(67));
    run(s, [[300, 81], [50, null], [300, 81], [200, 79]]);
    const mistakes = events.filter((e) => e.type === 'mistake');
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0]).toMatchObject({ playedWrittenMidi: 69, hint: 'wrong-note' });
    expect(events.at(-1)).toEqual({ type: 'finished', clean: 0, mistakes: 1 });
  });

  it('podpowiedzi: o oktawę za wysoko (za mocny oddech), za wysoko / za nisko', () => {
    const { s } = session(targets(67));
    expect(s.feed({ time: 0, midi: 91, rms: 0.2 }).hint).toBe('octave-high');
    expect(s.feed({ time: 16, midi: 67, rms: 0.2 }).hint).toBe('octave-low');
    const sharp = s.feed({ time: 32, midi: 79.7, rms: 0.2 });
    expect(sharp.hint).toBe('sharp');
    expect(sharp.cents).toBe(70);
    expect(s.feed({ time: 48, midi: 78.4, rms: 0.2 }).hint).toBe('flat');
    expect(s.feed({ time: 64, midi: null, rms: 0 }).hint).toBe('silence');
  });

  it('lekko nieczysto (sharp/flat) nie jest liczone jako pomyłka', () => {
    const { s, events } = session(targets(67));
    run(s, [[500, 79.7]]);
    expect(events).toHaveLength(0);
  });

  it('wyciszenie (aplikacja gra podpowiedź) ignoruje mikrofon', () => {
    const { s } = session(targets(67));
    s.muteUntil(500);
    run(s, [[400, 79]]);
    expect(s.index).toBe(0);
    run(s, [[200, 79]], 500);
    expect(s.index).toBe(1);
  });

  it('jumpTo przenosi do wybranej nuty', () => {
    const { s } = session(targets(60, 62, 64));
    s.jumpTo(2);
    run(s, [[200, 76]]);
    expect(s.finished).toBe(true);
  });
});

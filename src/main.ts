/**
 * Punkt wejścia: łączy interfejs (index.html) z modułami
 *   Score   – nuty + diagramy chwytów,
 *   Player  – dźwięk i podświetlanie nut w czasie,
 *   storage – utwory użytkownika i ustawienia w przeglądarce,
 *   musicxml – import plików z programów nutowych.
 */
import './style.css';
import { BUILTIN_SONGS, type Song } from './songs';
import { Score, type ScoreNote } from './score';
import { Player, type PlayerState } from './player';
import { fingeringFor, type FingeringSystem } from './fingerings';
import { createFingeringSvg } from './fingeringSvg';
import { polishName } from './pitch';
import { musicXmlToAbc, extractMxl } from './musicxml';
import { loadSettings, saveSettings, loadUserSongs, saveUserSongs, type Settings } from './storage';
import { Microphone, type MicFrame } from './microphone';
import { PracticeSession, type FrameStatus, type PracticeEvent } from './practice';

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Brak elementu #${id} w index.html`);
  return el as T;
}

const ui = {
  songSelect: $<HTMLSelectElement>('song-select'),
  fileInput: $<HTMLInputElement>('file-input'),
  deleteSong: $<HTMLButtonElement>('delete-song'),
  play: $<HTMLButtonElement>('play'),
  stop: $<HTMLButtonElement>('stop'),
  tempo: $<HTMLInputElement>('tempo'),
  tempoOut: $<HTMLOutputElement>('tempo-out'),
  loop: $<HTMLInputElement>('loop'),
  system: $<HTMLSelectElement>('system'),
  transpose: $<HTMLSelectElement>('transpose'),
  octaveUp: $<HTMLInputElement>('octave-up'),
  message: $<HTMLDivElement>('message'),
  songTitle: $<HTMLHeadingElement>('song-title'),
  songMeta: $<HTMLSpanElement>('song-meta'),
  nowName: $<HTMLSpanElement>('now-name'),
  nowDiagram: $<HTMLDivElement>('now-diagram'),
  nextName: $<HTMLSpanElement>('next-name'),
  nextDiagram: $<HTMLDivElement>('next-diagram'),
  score: $<HTMLElement>('score'),
  abcText: $<HTMLTextAreaElement>('abc-text'),
  abcPreview: $<HTMLButtonElement>('abc-preview'),
  abcSave: $<HTMLButtonElement>('abc-save'),
  practice: $<HTMLButtonElement>('practice'),
  practiceCard: $<HTMLDivElement>('practice-card'),
  practiceProgress: $<HTMLSpanElement>('practice-progress'),
  heardName: $<HTMLSpanElement>('heard-name'),
  tunerNeedle: $<HTMLSpanElement>('tuner-needle'),
  practiceHint: $<HTMLParagraphElement>('practice-hint'),
  levelBar: $<HTMLSpanElement>('level-bar'),
  practiceRestart: $<HTMLButtonElement>('practice-restart'),
};

let settings: Settings = loadSettings();
let userSongs: Song[] = loadUserSongs();

const score = new Score(ui.score, (tune) => {
  // nuty narysowane od nowa po zmianie szerokości ekranu
  stopPractice();
  player.setTune(tune);
  showCurrent(null);
});
const player = new Player(
  {
    onNote: (startChar) => showCurrent(score.highlight(startChar)),
    onState: renderPlayState,
    onError: (msg) => showMessage(msg, 'error'),
  },
  { tempoFactor: settings.tempoFactor, octaveUp: settings.octaveUp, loop: settings.loop },
);

// ------------------------------------------------------------------ komunikaty

function showMessage(text: string, kind: 'error' | 'info' = 'info'): void {
  ui.message.textContent = text;
  ui.message.dataset.kind = kind;
  ui.message.hidden = false;
}

function clearMessage(): void {
  ui.message.hidden = true;
}

// ------------------------------------------------------------------ utwory

function allSongs(): Song[] {
  return [...BUILTIN_SONGS, ...userSongs];
}

function currentSong(): Song {
  return allSongs().find((s) => s.id === settings.songId) ?? BUILTIN_SONGS[0];
}

function fillSongSelect(): void {
  ui.songSelect.replaceChildren();
  const groups: [string, readonly Song[]][] = [
    ['Gotowe utwory', BUILTIN_SONGS],
    ['Moje utwory', userSongs],
  ];
  for (const [label, songs] of groups) {
    if (!songs.length) continue;
    const g = document.createElement('optgroup');
    g.label = label;
    for (const s of songs) g.appendChild(new Option(s.title, s.id));
    ui.songSelect.appendChild(g);
  }
  ui.songSelect.value = currentSong().id;
  ui.deleteSong.hidden = !currentSong().user;
}

function persist(): void {
  saveSettings(settings);
}

/** Wyświetla ABC (utwór z listy albo podgląd z edytora). */
function showAbc(abc: string): boolean {
  stopPractice();
  clearMessage();
  try {
    const tune = score.render(abc, {
      transpose: settings.transpose,
      system: settings.system,
      onNoteClick: onNoteClick,
    });
    player.setTune(tune);
    showCurrent(null);
    updateTempoLabel();
    ui.songTitle.textContent = tune.metaText.title ?? 'Bez tytułu';
    const meta = [tune.metaText.composer, `tempo ♩ = ${Math.round(tune.getBpm())}`];
    ui.songMeta.textContent = meta.filter(Boolean).join(' · ');
    const out = score.outOfRangeCount();
    if (out > 0) {
      showMessage(
        `${out} ${out === 1 ? 'nuta jest' : 'nut jest'} poza zakresem fletu (c¹–c³) – oznaczone „?”. ` +
          'Spróbuj transpozycji w Ustawieniach (np. o oktawę).',
      );
    }
    return true;
  } catch (e) {
    showMessage(`Nie udało się wyświetlić nut: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return false;
  }
}

function selectSong(id: string): void {
  settings.songId = id;
  persist();
  const song = currentSong();
  ui.abcText.value = song.abc;
  ui.deleteSong.hidden = !song.user;
  showAbc(song.abc);
}

function titleOf(abc: string, fallback: string): string {
  return abc.match(/^T:\s*(.+)$/m)?.[1]?.trim() || fallback;
}

function addUserSong(abc: string, fallbackTitle: string): void {
  const song: Song = { id: `user-${Date.now().toString(36)}`, title: titleOf(abc, fallbackTitle), abc, user: true };
  userSongs = [...userSongs, song];
  if (!saveUserSongs(userSongs)) {
    showMessage('Utwór wyświetlony, ale nie udało się go zapisać w przeglądarce (tryb prywatny?).', 'error');
  }
  settings.songId = song.id;
  fillSongSelect();
  selectSong(song.id);
}

async function importFile(file: File): Promise<void> {
  const name = file.name.toLowerCase();
  try {
    let abc: string;
    if (name.endsWith('.mxl')) {
      abc = musicXmlToAbc(extractMxl(new Uint8Array(await file.arrayBuffer())));
    } else if (name.endsWith('.musicxml') || name.endsWith('.xml')) {
      abc = musicXmlToAbc(await file.text());
    } else {
      abc = await file.text();
      if (!/^K:/m.test(abc)) throw new Error('Plik ABC musi zawierać nagłówek K: (tonacja)');
    }
    addUserSong(abc, file.name.replace(/\.[^.]+$/, ''));
  } catch (e) {
    showMessage(`Nie udało się wczytać „${file.name}”: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

// ------------------------------------------------------------------ chwyt bieżący

function fillDiagram(nameEl: HTMLElement, box: HTMLElement, note: ScoreNote | null): void {
  box.replaceChildren();
  if (!note || note.midi === null) {
    nameEl.textContent = note ? 'pauza' : '–';
    return;
  }
  const name = polishName(note.midi);
  nameEl.textContent = name;
  box.appendChild(createFingeringSvg(fingeringFor(note.midi, settings.system), `Chwyt ${name}`));
}

function showCurrent(note: ScoreNote | null): void {
  fillDiagram(ui.nowName, ui.nowDiagram, note);
  fillDiagram(ui.nextName, ui.nextDiagram, note ? score.nextSounding(note) : (score.allNotes.find((n) => n.midi !== null) ?? null));
  if (note && (player.currentState === 'playing' || practice)) {
    note.cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function onNoteClick(note: ScoreNote): void {
  if (player.currentState === 'playing') return;
  if (practice) {
    // w trybie ćwiczenia: przejdź do tej nuty i zagraj ją jako podpowiedź
    const i = practiceTargets.findIndex((t) => t.startChar === note.startChar);
    if (i >= 0) practice.jumpTo(i);
    showPracticeTarget();
  } else {
    score.highlight(note.startChar);
    showCurrent(note);
  }
  if (note.midi !== null) {
    player
      .playSingle(note.midi)
      // mikrofon usłyszałby głośnik – ignorujemy go na czas podpowiedzi
      .then((ms) => practice?.muteUntil(performance.now() + ms + 350))
      .catch((e: unknown) => showMessage(`Błąd dźwięku: ${String(e)}`, 'error'));
  }
}

// ------------------------------------------------------------------ ćwiczenie z mikrofonem

const mic = new Microphone();
let practice: PracticeSession | null = null;
let practiceTargets: ScoreNote[] = [];

async function startPractice(): Promise<void> {
  player.stop();
  practiceTargets = score.allNotes.filter((n) => n.midi !== null && !n.tied);
  if (!practiceTargets.length) return;
  const outOfRange = practiceTargets.filter((n) => !fingeringFor(n.midi!, settings.system)).length;
  if (outOfRange) {
    showMessage('Ten utwór ma nuty poza zakresem fletu – najpierw ustaw transpozycję.', 'error');
    return;
  }
  ui.practice.disabled = true;
  try {
    await mic.start(await player.audioContext(), onMicFrame);
  } catch (e) {
    ui.practice.disabled = false;
    showMessage(e instanceof Error ? e.message : String(e), 'error');
    return;
  }
  clearMessage();
  score.clearMarks();
  practice = new PracticeSession(
    practiceTargets.map((n) => ({ id: n.startChar, writtenMidi: n.midi! })),
    {},
    onPracticeEvent,
  );
  ui.practice.disabled = false;
  ui.practice.setAttribute('aria-pressed', 'true');
  ui.practice.textContent = '■ Zakończ ćwiczenie';
  ui.play.disabled = true;
  ui.practiceCard.hidden = false;
  document.body.classList.add('practicing');
  showPracticeTarget();
}

function stopPractice(): void {
  if (!practice && !mic.running) return;
  mic.stop();
  practice = null;
  ui.practice.setAttribute('aria-pressed', 'false');
  ui.practice.textContent = '🎤 Ćwicz z mikrofonem';
  ui.play.disabled = false;
  ui.practiceCard.hidden = true;
  document.body.classList.remove('practicing');
  score.clearHighlight();
  showCurrent(null);
}

function restartPractice(): void {
  if (!practice) return;
  score.clearMarks();
  practice = new PracticeSession(
    practiceTargets.map((n) => ({ id: n.startChar, writtenMidi: n.midi! })),
    {},
    onPracticeEvent,
  );
  showPracticeTarget();
}

function showPracticeTarget(): void {
  if (!practice) return;
  const i = practice.index;
  ui.practiceProgress.textContent = progressText(Math.min(i + 1, practiceTargets.length), practice.mistakeCount);
  const note = practiceTargets[i];
  if (!note) return;
  score.highlight(note.startChar);
  showCurrent(note);
  ui.practiceHint.textContent = `Zagraj ${polishName(note.midi!)}.`;
}

function progressText(position: number, mistakes: number): string {
  return `nuta ${position}/${practiceTargets.length}` + (mistakes ? ` · ✗ ${mistakes}` : '');
}

function onPracticeEvent(e: PracticeEvent): void {
  switch (e.type) {
    case 'correct':
      score.mark(e.target.id, 'done');
      showPracticeTarget();
      break;
    case 'mistake':
      score.mark(e.target.id, 'mistake');
      if (practice) ui.practiceProgress.textContent = progressText(practice.index + 1, practice.mistakeCount);
      break;
    case 'finished': {
      score.clearHighlight();
      showCurrent(null);
      const all = practiceTargets.length;
      ui.practiceProgress.textContent = `${all} / ${all}`;
      ui.practiceHint.textContent =
        e.mistakes === 0
          ? `Brawo! Cały utwór bez pomyłki (${all} nut).`
          : `Koniec! Bez pomyłki: ${e.clean} z ${all} nut. Nuty z ✗ warto poćwiczyć.`;
      break;
    }
  }
}

const HINTS: Record<FrameStatus['hint'], string> = {
  ok: 'Dobrze – trzymaj…',
  sharp: 'Trochę za wysoko – dmuchnij lżej.',
  flat: 'Trochę za nisko – dmuchnij mocniej i sprawdź, czy otwory są szczelnie zakryte.',
  'octave-high': 'O oktawę za wysoko – dmuchnij lżej, spokojniej.',
  'octave-low': 'O oktawę za nisko – dmuchnij mocniej albo sprawdź kciuk.',
  'wrong-note': '',
  silence: '',
};

function onMicFrame(f: MicFrame): void {
  if (!practice) return;
  const st = practice.feed({ time: f.time, midi: f.midi, rms: f.rms });
  ui.levelBar.style.width = `${Math.min(100, Math.round(f.rms * 400))}%`;
  if (practice.finished) return;

  const target = practiceTargets[practice.index];
  const good = st.hint === 'ok' && st.cents !== null;
  const state = st.playedWrittenMidi === null ? '' : good ? 'ok' : 'bad';
  ui.heardName.textContent = st.playedWrittenMidi === null ? '–' : polishName(st.playedWrittenMidi);
  ui.heardName.dataset.state = state;
  // wskaźnik stroju ma sens tylko w pobliżu właściwego dźwięku (także o oktawę obok)
  const tunerUseful = st.cents !== null && st.hint !== 'wrong-note';
  ui.tunerNeedle.dataset.state = tunerUseful ? state : '';
  if (tunerUseful && st.cents !== null) {
    const pos = 50 + Math.max(-100, Math.min(100, st.cents)) / 2; // ±100 centów = pełna skala
    ui.tunerNeedle.style.left = `${pos}%`;
  }

  let hint: string;
  if (st.waitingForRelease) hint = 'Rozdziel dźwięki językiem („tu”) albo krótką przerwą.';
  else if (st.hint === 'silence') hint = target ? `Zagraj ${polishName(target.midi!)}.` : '';
  else if (st.hint === 'wrong-note' && st.playedWrittenMidi !== null && target)
    hint = `Grasz ${polishName(st.playedWrittenMidi)}, a potrzebne jest ${polishName(target.midi!)} – spójrz na chwyt.`;
  else hint = HINTS[st.hint];
  if (ui.practiceHint.textContent !== hint) ui.practiceHint.textContent = hint;
}

// ------------------------------------------------------------------ odtwarzanie

function renderPlayState(state: PlayerState): void {
  ui.play.textContent = state === 'playing' ? '❚❚ Pauza' : state === 'loading' ? '… Ładowanie' : '▶ Graj';
  ui.play.disabled = state === 'loading';
  ui.play.setAttribute('aria-label', state === 'playing' ? 'Pauza' : 'Odtwórz');
  if (state === 'idle') score.clearHighlight();
}

function updateTempoLabel(): void {
  ui.tempoOut.textContent = `${Math.round(settings.tempoFactor * 100)}% · ${player.currentBpm()} BPM`;
}

// ------------------------------------------------------------------ zdarzenia

function bind(): void {
  ui.songSelect.addEventListener('change', () => selectSong(ui.songSelect.value));

  ui.fileInput.addEventListener('change', () => {
    const file = ui.fileInput.files?.[0];
    ui.fileInput.value = '';
    if (file) void importFile(file);
  });

  ui.deleteSong.addEventListener('click', () => {
    const song = currentSong();
    if (!song.user || !confirm(`Usunąć „${song.title}” z moich utworów?`)) return;
    userSongs = userSongs.filter((s) => s.id !== song.id);
    saveUserSongs(userSongs);
    settings.songId = BUILTIN_SONGS[0].id;
    fillSongSelect();
    selectSong(settings.songId);
  });

  ui.play.addEventListener('click', () => void player.togglePlay());
  ui.practice.addEventListener('click', () => (practice ? stopPractice() : void startPractice()));
  ui.practiceRestart.addEventListener('click', restartPractice);
  ui.stop.addEventListener('click', () => player.stop());

  ui.tempo.addEventListener('input', () => {
    settings.tempoFactor = Number(ui.tempo.value);
    persist();
    void player.updateSettings({ tempoFactor: settings.tempoFactor }).then(updateTempoLabel);
    updateTempoLabel();
  });

  ui.loop.addEventListener('change', () => {
    settings.loop = ui.loop.checked;
    persist();
    void player.updateSettings({ loop: settings.loop });
  });

  ui.octaveUp.addEventListener('change', () => {
    settings.octaveUp = ui.octaveUp.checked;
    persist();
    void player.updateSettings({ octaveUp: settings.octaveUp });
  });

  ui.system.addEventListener('change', () => {
    settings.system = ui.system.value as FingeringSystem;
    persist();
    score.setSystem(settings.system);
    showCurrent(null);
  });

  ui.transpose.addEventListener('change', () => {
    settings.transpose = Number(ui.transpose.value);
    persist();
    showAbc(ui.abcText.value || currentSong().abc);
  });

  ui.abcPreview.addEventListener('click', () => showAbc(ui.abcText.value));
  ui.abcSave.addEventListener('click', () => {
    if (showAbc(ui.abcText.value)) addUserSong(ui.abcText.value, 'Mój utwór');
  });

  // spacja = graj/pauza (poza polami tekstowymi)
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.code !== 'Space' || t.closest('textarea, input, select, button')) return;
    e.preventDefault();
    if (!practice) void player.togglePlay();
  });
}

function init(): void {
  for (let st = -12; st <= 12; st++) {
    const label = st === 0 ? 'bez transpozycji' : `${st > 0 ? '+' : ''}${st} półt.${Math.abs(st) === 12 ? ' (oktawa)' : ''}`;
    ui.transpose.appendChild(new Option(label, String(st)));
  }
  ui.transpose.value = String(settings.transpose);
  ui.tempo.value = String(settings.tempoFactor);
  ui.loop.checked = settings.loop;
  ui.octaveUp.checked = settings.octaveUp;
  ui.system.value = settings.system;

  if (!Player.supported()) showMessage('Ta przeglądarka nie obsługuje Web Audio – nuty i chwyty działają, dźwięk nie.', 'error');

  fillSongSelect();
  bind();
  selectSong(currentSong().id);

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* bez trybu offline – aplikacja działa dalej */
    });
  }
}

init();

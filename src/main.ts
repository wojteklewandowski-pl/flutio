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
};

let settings: Settings = loadSettings();
let userSongs: Song[] = loadUserSongs();

const score = new Score(ui.score, (tune) => {
  // nuty narysowane od nowa po zmianie szerokości ekranu
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
  if (note && player.currentState === 'playing') {
    note.cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function onNoteClick(note: ScoreNote): void {
  if (player.currentState === 'playing') return;
  score.highlight(note.startChar);
  showCurrent(note);
  if (note.midi !== null) {
    player.playSingle(note.midi).catch((e: unknown) => showMessage(`Błąd dźwięku: ${String(e)}`, 'error'));
  }
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
    void player.togglePlay();
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

/**
 * Zapis w przeglądarce (localStorage): utwory użytkownika i ustawienia.
 * Dane zostają tylko na tym urządzeniu i w tej przeglądarce.
 * Każdy dostęp jest w try/catch – w trybie prywatnym localStorage bywa niedostępny,
 * a aplikacja ma wtedy po prostu działać bez zapamiętywania.
 */
import type { Song } from './songs';
import type { FingeringSystem } from './fingerings';

const SONGS_KEY = 'flet.userSongs.v1';
const SETTINGS_KEY = 'flet.settings.v1';

export interface Settings {
  songId: string;
  tempoFactor: number;
  octaveUp: boolean;
  loop: boolean;
  system: FingeringSystem;
  transpose: number;
}

export const DEFAULT_SETTINGS: Settings = {
  songId: 'aida',
  tempoFactor: 1,
  octaveUp: true,
  loop: false,
  system: 'german',
  transpose: 0,
};

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadUserSongs(): Song[] {
  const list = read<Song[]>(SONGS_KEY);
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => typeof s?.id === 'string' && typeof s.title === 'string' && typeof s.abc === 'string')
    .map((s) => ({ ...s, user: true }));
}

export function saveUserSongs(songs: readonly Song[]): boolean {
  return write(SONGS_KEY, songs.map(({ id, title, abc }) => ({ id, title, abc })));
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}

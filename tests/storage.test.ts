import { beforeEach, describe, expect, it } from 'vitest';
import { loadSettings, loadUserSongs, saveUserSongs, DEFAULT_SETTINGS } from '../src/storage';

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('domyślne ustawienia, gdy nic nie zapisano', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadUserSongs()).toEqual([]);
  });

  it('zapis i odczyt utworów użytkownika', () => {
    saveUserSongs([{ id: 'u1', title: 'A', abc: 'X:1\nK:C\nC|]' }]);
    expect(loadUserSongs()).toEqual([{ id: 'u1', title: 'A', abc: 'X:1\nK:C\nC|]', user: true }]);
  });

  it('przenosi dane zapisane pod starą nazwą aplikacji (flet.* → flutio.*)', () => {
    localStorage.setItem('flet.userSongs.v1', JSON.stringify([{ id: 'u1', title: 'Stary', abc: 'K:C' }]));
    localStorage.setItem('flet.settings.v1', JSON.stringify({ tempoFactor: 0.5 }));
    expect(loadUserSongs()[0].title).toBe('Stary');
    expect(loadSettings().tempoFactor).toBe(0.5);
    expect(localStorage.getItem('flet.userSongs.v1')).toBeNull();
    expect(localStorage.getItem('flutio.userSongs.v1')).not.toBeNull();
  });

  it('uszkodzone dane nie wywracają aplikacji', () => {
    localStorage.setItem('flutio.userSongs.v1', '{zepsute');
    expect(loadUserSongs()).toEqual([]);
  });
});

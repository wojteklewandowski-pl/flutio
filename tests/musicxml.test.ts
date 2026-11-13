import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { abcLength, abcPitch, musicXmlToAbc, extractMxl, MusicXmlError } from '../src/musicxml';

function note(step: string, octave: number, type: string, extra = '', alter?: number): string {
  return `<note><pitch><step>${step}</step>${alter !== undefined ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch><duration>1</duration><voice>1</voice><type>${type}</type>${extra}</note>`;
}

function score(measures: string[], { fifths = 1, title = 'Test' } = {}): string {
  const body = measures
    .map((m, i) =>
      i === 0
        ? `<measure number="1"><attributes><divisions>4</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes><direction><sound tempo="96"/></direction>${m}</measure>`
        : `<measure number="${i + 1}">${m}</measure>`,
    )
    .join('');
  return `<?xml version="1.0"?><score-partwise version="3.1"><work><work-title>${title}</work-title></work><identification><creator type="composer">Ktoś</creator></identification><part-list><score-part id="P1"><part-name>Flet</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
}

describe('abcLength / abcPitch', () => {
  it('długości w jednostkach L:1/16', () => {
    expect(abcLength(1)).toBe('');
    expect(abcLength(4)).toBe('4');
    expect(abcLength(6)).toBe('6');
    expect(abcLength(0.5)).toBe('/2');
    expect(abcLength(1.5)).toBe('3/2');
  });
  it('oktawy: 4 = razkreślna (C), 5 = dwukreślna (c), 6 = c\'', () => {
    expect(abcPitch('C', 4)).toBe('C');
    expect(abcPitch('C', 5)).toBe('c');
    expect(abcPitch('C', 6)).toBe("c'");
    expect(abcPitch('A', 3)).toBe('A,');
  });
});

describe('musicXmlToAbc', () => {
  it('nagłówek: tytuł, kompozytor, metrum, tempo, tonacja', () => {
    const abc = musicXmlToAbc(score([note('G', 4, 'whole')], { title: 'Moja melodia' }));
    expect(abc).toContain('T:Moja melodia');
    expect(abc).toContain('C:Ktoś');
    expect(abc).toContain('M:4/4');
    expect(abc).toContain('Q:1/4=96');
    expect(abc).toContain('K:G');
    expect(abc).toMatch(/G16 \|\]$/);
  });

  it('wartości, kropki i pauzy', () => {
    const m = note('D', 4, 'quarter') + note('G', 4, 'half', '<dot/>');
    const m2 = '<note><rest/><duration>4</duration><voice>1</voice><type>quarter</type></note>' + note('B', 4, 'eighth') + note('A', 4, '16th') + note('G', 4, 'half');
    const abc = musicXmlToAbc(score([m, m2]));
    expect(abc).toContain('D4 G12 |');
    expect(abc).toContain('z4 B2 A G8 |]');
  });

  it('znaki przygodne względem tonacji i taktu', () => {
    // G-dur: F jest fis. F naturalne wymaga kasownika, drugie F w takcie już nie.
    const m = note('F', 4, 'quarter', '', 0) + note('F', 4, 'quarter', '', 0) + note('F', 4, 'quarter', '', 1) + note('B', 4, 'quarter', '', -1);
    const abc = musicXmlToAbc(score([m, note('F', 4, 'whole', '', 1)]));
    expect(abc).toContain('=F4 F4 ^F4 _B4 |');
    // nowy takt – fis (alter=1) zgodne z kluczem G-dur, więc bez znaku
    expect(abc).toMatch(/\| F16 \|\]/);
  });

  it('triola ósemkowa', () => {
    const tm = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
    const m =
      note('G', 4, 'half', '', undefined) +
      note('G', 4, 'quarter') +
      note('A', 4, 'eighth', tm + '<notations><tuplet type="start"/></notations>') +
      note('D', 4, 'eighth', tm) +
      note('A', 4, 'eighth', tm + '<notations><tuplet type="stop"/></notations>');
    expect(musicXmlToAbc(score([m]))).toContain('G8 G4 (3 A2 D2 A2');
  });

  it('łuk łączący i pomijanie akordu / drugiego głosu', () => {
    const m =
      note('C', 5, 'half', '<tie type="start"/>') +
      '<note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type></note>' +
      note('C', 5, 'half', '<tie type="stop"/>') +
      '<backup><duration>16</duration></backup>' +
      '<note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type></note>';
    const abc = musicXmlToAbc(score([m]));
    expect(abc).toContain('c8- c8 |]');
    expect(abc).not.toContain('C,');
  });

  it('błędy: nie-XML, timewise, brak nut', () => {
    expect(() => musicXmlToAbc('to nie xml <')).toThrow(MusicXmlError);
    expect(() => musicXmlToAbc('<score-timewise/>')).toThrow(/timewise/);
    expect(() => musicXmlToAbc(score([''], {}))).toThrow(/żadnych nut/);
  });
});

describe('extractMxl', () => {
  it('czyta plik wskazany w META-INF/container.xml', () => {
    const xml = score([note('A', 4, 'whole')]);
    const zip = zipSync({
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'),
      'score.xml': strToU8(xml),
    });
    expect(extractMxl(zip)).toBe(xml);
  });
  it('odrzuca uszkodzone archiwum', () => {
    expect(() => extractMxl(new Uint8Array([1, 2, 3]))).toThrow(MusicXmlError);
  });
});

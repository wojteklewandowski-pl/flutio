/**
 * Wbudowane utwory w notacji ABC (https://abcnotation.com/wiki/abc:standard:v2.1).
 * Wszystkie mieszczą się w zakresie fletu sopranowego c¹–c³.
 *
 * Ściąga ABC:  C D E F G A B = c¹…h¹,  c d e … b = c²…h²,  c' = c³
 *              ^F = fis, _B = b, =F = kasownik,  z = pauza
 *              liczba po nucie = wielokrotność L (np. L:1/8 → G2 = ćwierćnuta)
 *              (3ABC = triola,  B>A = ósemka z kropką + szesnastka,  | = kreska taktowa
 */

export interface Song {
  id: string;
  title: string;
  abc: string;
  /** true dla utworów wgranych przez użytkownika (można je usunąć). */
  user?: boolean;
}

export const BUILTIN_SONGS: readonly Song[] = [
  {
    id: 'aida',
    title: 'Marsz triumfalny – „Aida” (G. Verdi)',
    abc: `X:1
T:Marsz triumfalny z opery „Aida” (fragment)
C:Giuseppe Verdi
M:4/4
L:1/8
Q:1/4=90
K:G
D2 | G6 (3ADA | B2 B2 B2 (3BcG | B3 A G2 z2 | AB B>A G z A>B | B z A>B B z G>A | A6 |]`,
  },
  {
    id: 'oda',
    title: 'Oda do radości (L. van Beethoven)',
    abc: `X:1
T:Oda do radości
C:Ludwig van Beethoven
M:4/4
L:1/4
Q:1/4=100
K:G
B B c d | d c B A | G G A B | B3/2 A/ A2 |
B B c d | d c B A | G G A B | A3/2 G/ G2 |]`,
  },
  {
    id: 'panie-janie',
    title: 'Panie Janie',
    abc: `X:1
T:Panie Janie
C:melodia ludowa (Frère Jacques)
M:4/4
L:1/8
Q:1/4=100
K:G
G2 A2 B2 G2 | G2 A2 B2 G2 | B2 c2 d4 | B2 c2 d4 |
dedc B2 G2 | dedc B2 G2 | G2 D2 G4 | G2 D2 G4 |]`,
  },
  {
    id: 'kotek',
    title: 'Wlazł kotek na płotek',
    abc: `X:1
T:Wlazł kotek na płotek
C:piosenka ludowa
M:2/4
L:1/8
Q:1/4=90
K:C
G E E2 | F D D2 | C E G2 | G E E2 | F D D2 | C E C2 |]`,
  },
  {
    id: 'gwiazdka',
    title: 'Błyszcz, gwiazdeczko (Twinkle, Twinkle)',
    abc: `X:1
T:Błyszcz, gwiazdeczko
C:melodia francuska
M:4/4
L:1/4
Q:1/4=100
K:G
G G d d | e e d2 | c c B B | A A G2 |
d d c c | B B A2 | d d c c | B B A2 |
G G d d | e e d2 | c c B B | A A G2 |]`,
  },
];

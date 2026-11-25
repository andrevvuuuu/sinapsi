import { describe, it, expect } from 'vitest';
import { stripNoise } from '../../src/main/notes/strip-noise';

describe('stripNoise', () => {
  it('should not touch code blocks ```', () => {
    const input = `
Testo normale
\`\`\`
console.log("Hello World");
const x = 10;
\`\`\`
Fine testo
`;
    const output = stripNoise(input);
    expect(output).toContain('console.log("Hello World");');
    expect(output).toContain('const x = 10;');
    expect(output).not.toContain('<!--'); // Just sanity check
  });

  it('should not touch multi-line math blocks $$', () => {
    const input = `
Formula:
$$
E = mc^2
$$
Testo dopo
`;
    const output = stripNoise(input);
    expect(output).toContain('E = mc^2');
    expect(output).not.toContain('<!--');
  });

  it('should remove HTML comments', () => {
    const input = `
Testo
<!-- Questo è un commento HTML -->
Altro testo
<!--
Commento multi-riga
-->
`;
    const output = stripNoise(input);
    expect(output).not.toContain('<!--');
    expect(output).not.toContain('Questo è un commento HTML');
    expect(output).not.toContain('Commento multi-riga');
  });

  it('should remove Obsidian comments %% ... %%', () => {
    const input = `
Testo
%% Questo è un commento Obsidian %%
Altro testo
%%
Commento multi-riga
%%
`;
    const output = stripNoise(input);
    expect(output).not.toContain('%%');
    expect(output).not.toContain('Questo è un commento Obsidian');
  });

  it('should preserve lines with %% verifica-inizio %% or %% verifica-fine %%', () => {
    const input = `
Testo
%% verifica-inizio %%
Contenuto da conservare
%% verifica-fine %%
Altro testo
%% Commento normale %%
`;
    const output = stripNoise(input);
    expect(output).toContain('%% verifica-inizio %%');
    expect(output).toContain('Contenuto da conservare');
    expect(output).toContain('%% verifica-fine %%');
    expect(output).not.toContain('%% Commento normale %%');
  });

  it('should remove image embeds ![[file.png]]', () => {
    const input = `
![[immagine.png]]
![[immagine.jpg]]
![[immagine.gif]]
![[immagine.svg]]
![[immagine.webp]]
![[immagine.pdf]]
![[audio.mp3]]
![[video.mp4]]
![[video.mov]]
![[file.txt]]
![[file.pdf]]
`;
    const output = stripNoise(input);
    expect(output).not.toContain('![[immagine.png]]');
    expect(output).not.toContain('![[video.mov]]');
    expect(output).toContain('![[file.txt]]'); // not a media extension: kept
  });

  it('should remove markdown images ![alt](url) with media extensions', () => {
    const input = `
![Alt testo](./img.png)
![Alt testo](./img.jpg)
![Alt testo](./img.pdf)
![Alt testo](./img.txt)
![Alt testo](https://example.com/image.png)
`;
    const output = stripNoise(input);
    expect(output).not.toContain('![');
    expect(output).not.toContain('./img.png');
    expect(output).not.toContain('![');
  });

  it('should preserve note embeds ![[Note]]', () => {
    const input = `
![[Nota 1]]
![[Nota 2]]
![[Nota.pdf]]
`;
    const output = stripNoise(input);
    expect(output).toContain('![[Nota 1]]');
    expect(output).toContain('![[Nota 2]]');
    expect(output).not.toContain('![[Nota.pdf]]');
  });

  it('should preserve wikilinks [[...]]', () => {
    const input = `
[[Link1]]
[[Link2]]
[[Link3]]
`;
    const output = stripNoise(input);
    expect(output).toContain('[[Link1]]');
    expect(output).toContain('[[Link2]]');
  });

  it('should preserve links [testo](url)', () => {
    const input = `
[Google](https://google.com)
[Link](./file.txt)
`;
    const output = stripNoise(input);
    expect(output).toContain('[Google](https://google.com)');
    expect(output).toContain('[Link](./file.txt)');
  });

  it('should preserve inline LaTeX $...$', () => {
    const input = `
$x^2 + y^2 = z^2$
`;
    const output = stripNoise(input);
    expect(output).toContain('$x^2 + y^2 = z^2$');
  });

  it('should preserve callouts > [!note]', () => {
    const input = `
> [!note]
> Questo è un callout.
> [!info]
> Info qui.
`;
    const output = stripNoise(input);
    expect(output).toContain('> [!note]');
    expect(output).toContain('> [!info]');
  });

  it('should compress 3+ empty lines to 1', () => {
    const input = `
Riga 1


Riga 2




Riga 3
`;
    const output = stripNoise(input);
    const lines = output.split('\n');
    // Count consecutive empty lines
    let emptyCount = 0;
    let maxEmpty = 0;
    for (const line of lines) {
      if (line === '') {
        emptyCount++;
        maxEmpty = Math.max(maxEmpty, emptyCount);
      } else {
        emptyCount = 0;
      }
    }
    expect(maxEmpty).toBeLessThanOrEqual(1);
    expect(output).not.toContain('\n\n\n');
  });

  it('should remove trailing spaces', () => {
    const input = `
Riga con spazi   \n
Riga con spazi\t\t\n
`;
    const output = stripNoise(input);
    expect(output).not.toMatch(/[ \t]+$/m);
    expect(output).toContain('Riga con spazi');
  });
});

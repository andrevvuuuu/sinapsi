const MEDIA = /\.(png|jpe?g|gif|svg|webp|pdf|mp3|m4a|wav|mp4|mov)$/i
const VERIFY_LINE = /^\s*%% verifica-(inizio|fine) %%\s*$/

/**
 * Text a model never uses: HTML and Obsidian comments, embedded images and media, runs of blank lines.
 * Code fences and $$…$$ blocks are left exactly as they are; the correctness check's markers stay.
 */
export function stripNoise(text: string): string {
  // Protected segments (code fences, display math) alternate with free text at odd indices of the split.
  const parts = text.split(/(^```[^\n]*\n[\s\S]*?^```[^\n]*$|\$\$[\s\S]*?\$\$)/m)
  const cleaned = parts.map((part, i) => (i % 2 === 1 ? part : cleanFree(part))).join('')
  return cleaned.replace(/\n{3,}/g, '\n\n')
}

function cleanFree(t: string): string {
  // Verification markers are swapped out first so the %%…%% rule cannot eat them or the text between them.
  const markers: string[] = []
  let s = t
    .split('\n')
    .map((line) => (VERIFY_LINE.test(line) ? `\u0000${markers.push(line) - 1}\u0000` : line))
    .join('\n')
  s = s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/!\[\[([^\]]+)\]\]/g, (all, inner: string) => (MEDIA.test(inner.split('|')[0].trim()) ? '' : all))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[ \t]+$/gm, '')
  return s.replace(/\u0000(\d+)\u0000/g, (_, k: string) => markers[Number(k)])
}

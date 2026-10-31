export type PosterTheme = 'midnight' | 'parchment' | 'ember';
export interface PosterContent { title: string; body: string; rating: number; bookTitle: string; author: string; theme: PosterTheme }
export interface PosterResult { blob: Blob; truncated: boolean }

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/u)) {
      const trial = line ? `${line} ${word}` : word;
      if (ctx.measureText(trial).width <= maxWidth) { line = trial; continue; }
      if (line) lines.push(line);
      line = '';
      for (const character of Array.from(word)) {
        if (line && ctx.measureText(line + character).width > maxWidth) { lines.push(line); line = ''; }
        line += character;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function limitedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maximum: number): { bottom: number; truncated: boolean } {
  const lines = wrap(ctx, text, width);
  const visible = lines.slice(0, maximum);
  if (lines.length > maximum && visible.length) {
    let last = visible[visible.length - 1];
    while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1);
    visible[visible.length - 1] = last.trimEnd() + '…';
  }
  visible.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return { bottom: y + visible.length * lineHeight, truncated: lines.length > maximum };
}

/** Render a self-contained, portrait PNG using the user's own review text. */
export async function renderReviewPoster(content: PosterContent): Promise<PosterResult> {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Poster creation is unavailable in this browser. Your review can still be copied.');
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const paper = content.theme === 'parchment';
  const bg = paper ? token('--color-bg-parchment') : content.theme === 'ember' ? token('--color-bg-surface') : token('--color-bg-deep');
  const fg = paper ? token('--color-text-ink') : token('--color-text-primary');
  const accent = paper ? token('--color-amber-dim') : token('--color-amber');
  const subtle = paper ? token('--color-text-ink') : token('--color-text-secondary');
  const readingFont = token('--font-reading') || 'Georgia, serif';
  const uiFont = token('--font-ui') || 'sans-serif';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1350);
  ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(42, 42, 996, 1266);
  const glow = ctx.createRadialGradient(950, 40, 0, 950, 40, 700);
  glow.addColorStop(0, accent); glow.addColorStop(1, bg);
  ctx.globalAlpha = .11; ctx.fillStyle = glow; ctx.fillRect(0, 0, 1080, 1350); ctx.globalAlpha = 1;
  ctx.textBaseline = 'top';
  ctx.fillStyle = accent; ctx.font = `600 25px ${uiFont}`;
  ctx.fillText('A PERSONAL BOOK REVIEW', 90, 98);
  ctx.fillStyle = fg; ctx.font = `500 68px ${readingFont}`;
  const heading = limitedText(ctx, content.bookTitle || content.title || 'Book review', 90, 170, 900, 80, 3);
  let y = heading.bottom + 24;
  if (content.author) {
    ctx.fillStyle = subtle; ctx.font = `400 29px ${uiFont}`;
    const author = limitedText(ctx, content.author, 90, y, 900, 39, 2); y = author.bottom + 24;
  }
  ctx.fillStyle = accent; ctx.font = `400 35px ${uiFont}`;
  ctx.fillText(`${'★'.repeat(content.rating)}${'☆'.repeat(5 - content.rating)}`, 90, y); y += 78;
  ctx.strokeStyle = accent; ctx.globalAlpha = .35; ctx.beginPath(); ctx.moveTo(90, y); ctx.lineTo(990, y); ctx.stroke(); ctx.globalAlpha = 1; y += 46;
  let titleTruncated = false;
  if (content.bookTitle && content.title) {
    ctx.fillStyle = fg; ctx.font = `600 35px ${uiFont}`;
    const title = limitedText(ctx, content.title, 90, y, 900, 46, 2); y = title.bottom + 30; titleTruncated = title.truncated;
  }
  ctx.fillStyle = fg; ctx.font = `400 39px ${readingFont}`;
  const available = Math.max(3, Math.floor((1210 - y) / 56));
  const body = limitedText(ctx, content.body || 'Your reading impression goes here.', 90, y, 900, 56, available);
  ctx.fillStyle = subtle; ctx.font = `400 23px ${uiFont}`;
  ctx.fillText(`${content.rating} / 5 · Personal reading notes`, 90, 1237);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not create the poster image.')), 'image/png'));
  return { blob, truncated: heading.truncated || titleTruncated || body.truncated };
}

/** Draft an editable caption without adding claims or quotations to the review. */
export function reviewCaption(content: Pick<PosterContent, 'title' | 'body' | 'rating' | 'bookTitle' | 'author'>): string {
  const book = content.bookTitle ? `${content.bookTitle}${content.author ? ` by ${content.author}` : ''}` : content.title;
  return `${book}\n${content.rating}/5\n\n${content.bookTitle && content.title ? `${content.title}\n\n` : ''}${content.body}\n\n#BookReview #ReadingNotes`;
}

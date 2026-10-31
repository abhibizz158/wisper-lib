import type { Chapter } from '@wisper-lib/shared-types';

export interface ReadingLocation { chapterId: string; page: number; offset: number; chapterTitle?: string }
export interface ReadingPage { chapterId: string; chapterTitle: string; chapterIndex: number; page: number; offset: number; text: string }

/** Fixed text boundaries keep note locations independent of font size and viewport. */
export function readingPages(chapters: Chapter[], target = 2800): ReadingPage[] {
  if (!Number.isInteger(target) || target < 256) throw new RangeError('Reading page size must be an integer of at least 256 characters.');
  return chapters.flatMap((chapter, chapterIndex) => {
    const body = chapter.body.replace(/\r\n?/g, '\n');
    const pages: ReadingPage[] = [];
    let offset = 0;
    do {
      let end = Math.min(offset + target, body.length);
      if (end < body.length) {
        const paragraph = body.lastIndexOf('\n\n', end);
        const whitespace = body.lastIndexOf(' ', end);
        const boundary = paragraph > offset + target / 2 ? paragraph + 2 : whitespace > offset + target / 2 ? whitespace + 1 : end;
        end = boundary;
      }
      // Do not divide an emoji or another UTF-16 surrogate pair between pages.
      if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1]) && /[\uDC00-\uDFFF]/.test(body[end])) end--;
      pages.push({ chapterId: chapter.id, chapterTitle: chapter.title, chapterIndex, page: pages.length, offset, text: body.slice(offset, end) });
      offset = end;
    } while (offset < body.length);
    return pages;
  });
}

export function parseLocation(value: string | null | undefined): ReadingLocation | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const location = parsed as Partial<ReadingLocation>;
    if (typeof location.chapterId !== 'string' || !location.chapterId || !Number.isSafeInteger(location.page) || (location.page ?? -1) < 0) return null;
    return { chapterId: location.chapterId, page: location.page!, offset: Number.isSafeInteger(location.offset) && location.offset! >= 0 ? location.offset! : 0, ...(typeof location.chapterTitle === 'string' ? { chapterTitle: location.chapterTitle.slice(0, 500) } : {}) };
  } catch { return null; }
}

export function locatePage(pages: ReadingPage[], location: ReadingLocation | null): number {
  if (!location) return 0;
  const exact = pages.findIndex(page => page.chapterId === location.chapterId && page.page === location.page);
  if (exact >= 0) return exact;
  const chapterPages = pages.map((page, index) => ({ page, index })).filter(item => item.page.chapterId === location.chapterId);
  if (!chapterPages.length) return 0;
  return [...chapterPages].reverse().find(item => item.page.offset <= location.offset)?.index ?? chapterPages[0].index;
}

export function describeLocation(value: string | null): string {
  const location = parseLocation(value);
  if (!location) return 'Book note';
  if (location.chapterTitle && /^page \d+$/i.test(location.chapterTitle)) return `${location.chapterTitle}${location.page ? ` · continued ${location.page + 1}` : ''}`;
  return `${location.chapterTitle ? `${location.chapterTitle} · ` : ''}Reading page ${location.page + 1}`;
}

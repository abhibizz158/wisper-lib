import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ApiResponse, BookContent, LibraryBook, PageNote } from '@wisper-lib/shared-types';
import { api } from '@/lib/apiClient';
import { operationId } from '@/lib/uuid';
import NoteComposer from '@/reader/NoteComposer';
import { describeLocation, locatePage, parseLocation, readingPages } from '@/reader/reading';
import styles from './ReaderPage.module.css';

interface Editor { note?: PageNote; key: string; context?: { bookId: string; chapterId: string | null; location: string; selectedText: string } }
function preference<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try { const stored = localStorage.getItem(key); return allowed.includes(stored as T) ? stored as T : fallback; } catch { return fallback; }
}

export default function ReaderPage(): React.ReactElement {
  const { id = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const bookQuery = useQuery({ queryKey: ['reader-book', id], queryFn: async () => (await api.get<ApiResponse<LibraryBook>>(`/books/${id}`)).data, enabled: Boolean(id) });
  const contentQuery = useQuery({ queryKey: ['book-content', id], queryFn: async () => (await api.get<ApiResponse<BookContent>>(`/books/${id}/content`)).data, enabled: Boolean(id) });
  const pages = useMemo(() => readingPages(contentQuery.data?.chapters ?? []), [contentQuery.data]);
  const book = bookQuery.data;
  const [pageIndex, setPageIndex] = useState(0);
  const [restored, setRestored] = useState(false);
  const [sidePanel, setSidePanel] = useState<'contents' | 'notes' | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [selection, setSelection] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [smallScreen, setSmallScreen] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const [showOriginal, setShowOriginal] = useState(false);
  const [fontSize, setFontSize] = useState(() => { try { const value = Number(localStorage.getItem('reader-font-size')); return value >= 16 && value <= 30 ? value : 20; } catch { return 20; } });
  const [theme, setTheme] = useState(() => preference('reader-theme', ['paper', 'sepia', 'night'] as const, 'paper'));
  const [saveStatus, setSaveStatus] = useState('');
  const [saveError, setSaveError] = useState(false);
  const [bookmarkSaving, setBookmarkSaving] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  const progressQueue = useRef<Promise<unknown>>(Promise.resolve());
  const latestPosition = useRef<{ location: string; progress: number } | null>(null);
  const loadedId = useRef(id);
  const currentPage = pages[Math.min(pageIndex, Math.max(0, pages.length - 1))];
  const currentLocation = currentPage ? JSON.stringify({ chapterId: currentPage.chapterId, page: currentPage.page, offset: currentPage.offset, chapterTitle: currentPage.chapterTitle }) : '';

  const notesQuery = useInfiniteQuery({
    queryKey: ['reader-notes', id], initialPageParam: '', enabled: Boolean(id) && sidePanel === 'notes',
    queryFn: ({ pageParam }) => api.get<ApiResponse<PageNote[]>>(`/notes?bookId=${encodeURIComponent(id)}&limit=50${pageParam ? `&after=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: response => response.meta?.nextCursor || undefined,
  });
  const notes = notesQuery.data?.pages.flatMap(page => page.data) ?? [];
  const searchResults = useMemo(() => {
    const text = deferredSearch.trim().toLocaleLowerCase();
    if (text.length < 2) return [];
    return pages.map((page, index) => ({ page, index, at: page.text.toLocaleLowerCase().indexOf(text) })).filter(result => result.at >= 0).slice(0, 30);
  }, [pages, deferredSearch]);

  useEffect(() => {
    mounted.current = true;
    const media = window.matchMedia('(max-width: 700px)');
    const changed = () => setSmallScreen(media.matches);
    media.addEventListener('change', changed);
    return () => { mounted.current = false; media.removeEventListener('change', changed); };
  }, []);
  useEffect(() => {
    if (!sidePanel || !smallScreen) return;
    const panel = panelRef.current;
    const previous = document.activeElement as HTMLElement | null;
    panel?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setSidePanel(null); return; }
      if (event.key !== 'Tab' || !panel) return;
      const targets = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'));
      const first = targets[0]; const last = targets[targets.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus({ preventScroll: true }); };
  }, [sidePanel, smallScreen]);

  useEffect(() => { setRestored(false); setPageIndex(0); setEditor(null); setSelection(''); latestPosition.current = null; loadedId.current = id; }, [id]);
  useEffect(() => {
    if (!book || !contentQuery.data || restored) return;
    const supplied = parseLocation(searchParams.get('location'));
    const saved = supplied ?? parseLocation(book.lastLocation);
    const firstBody = contentQuery.data.chapters.find(chapter => chapter.kind === 'body');
    const firstIndex = firstBody ? Math.max(0, pages.findIndex(page => page.chapterId === firstBody.id)) : 0;
    setPageIndex(saved ? locatePage(pages, saved) : firstIndex);
    setRestored(true);
  }, [book, contentQuery.data, pages, restored, searchParams]);
  useEffect(() => { setSelection(''); }, [pageIndex]);
  useEffect(() => {
    try { localStorage.setItem('reader-font-size', String(fontSize)); localStorage.setItem('reader-theme', theme); } catch { /* Reading still works when local storage is unavailable. */ }
  }, [fontSize, theme]);

  function saveProgress(position: { location: string; progress: number }) {
    progressQueue.current = progressQueue.current.catch(() => {}).then(async () => {
      if (loadedId.current !== id) return;
      try {
        await api.post(`/books/${id}/progress`, { lastLocation: position.location, progress: position.progress, status: position.progress >= 100 ? 'finished' : 'reading' }, { keepalive: true });
        if (mounted.current && loadedId.current === id) { setSaveStatus('Reading position saved'); setSaveError(false); }
        void queryClient.invalidateQueries({ queryKey: ['books'] });
        void queryClient.invalidateQueries({ queryKey: ['book', id] });
      } catch {
        if (mounted.current && loadedId.current === id) { setSaveStatus('Reading position could not sync. Keep this page open and retry.'); setSaveError(true); }
      }
    });
  }

  useEffect(() => {
    if (!restored || !currentLocation || !pages.length) return;
    const position = { location: currentLocation, progress: Math.round(((pageIndex + 1) / pages.length) * 10000) / 100 };
    latestPosition.current = position;
    setSaveStatus('Saving reading position…');
    const timeout = window.setTimeout(() => saveProgress(position), 700);
    return () => window.clearTimeout(timeout);
    // The location is the source of truth; cache invalidation must not trigger another write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, restored, currentLocation, pageIndex, pages.length]);

  useEffect(() => () => {
    const position = latestPosition.current;
    if (position) {
      // Serialize the final write behind earlier page writes to preserve order.
      progressQueue.current = progressQueue.current.catch(() => {}).then(() => api.post(`/books/${id}/progress`, {
        lastLocation: position.location, progress: position.progress, status: position.progress >= 100 ? 'finished' : 'reading',
      }, { keepalive: true })).catch(() => {});
    }
  }, [id]);

  function goToPage(index: number) {
    setPageIndex(Math.max(0, Math.min(index, pages.length - 1)));
    requestAnimationFrame(() => { articleRef.current?.focus({ preventScroll: true }); articleRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); });
  }
  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (sidePanel || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || target.closest('input, textarea, select, button, a, [contenteditable="true"]') || !pages.length) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); goToPage(pageIndex + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); goToPage(pageIndex - 1); }
    }
    document.addEventListener('keydown', keyDown);
    return () => document.removeEventListener('keydown', keyDown);
  }, [pageIndex, pages.length, sidePanel]);

  function captureSelection() {
    const selected = window.getSelection();
    if (!selected?.rangeCount || !articleRef.current?.contains(selected.getRangeAt(0).commonAncestorContainer)) return;
    const text = selected.toString();
    if (text.length > 10000) { setSaveStatus('Select a shorter passage to attach to a note.'); return; }
    setSelection(text.trim() ? text : '');
  }
  function newNote() {
    if (!currentPage) return;
    setSidePanel('notes');
    setEditor({
      key: `reader-note:${id}:${currentPage.chapterId}:${currentPage.page}`,
      context: { bookId: id, chapterId: currentPage.chapterId, location: currentLocation, selectedText: selection },
    });
  }
  async function bookmark() {
    if (!currentPage || bookmarkSaving) return;
    setBookmarkSaving(true);
    try {
      await api.post('/notes', { bookId: id, chapterId: currentPage.chapterId, location: currentLocation, title: `Bookmark · ${currentPage.chapterTitle}`, body: 'Saved reading position', tags: ['bookmark'], selectedText: '', clientOperationId: operationId() });
      await queryClient.invalidateQueries({ queryKey: ['reader-notes', id] });
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      setSaveStatus('Bookmark saved in your notes.');
    } catch (error) { setSaveStatus(error instanceof Error ? error.message : 'Could not save this bookmark.'); }
    finally { setBookmarkSaving(false); }
  }
  function savedNote() {
    setEditor(null); setSelection('');
    void queryClient.invalidateQueries({ queryKey: ['reader-notes', id] });
    void queryClient.invalidateQueries({ queryKey: ['notes'] });
  }

  if (bookQuery.isPending || contentQuery.isPending) return <div className={styles.loading} role="status">Opening your book…</div>;
  if (bookQuery.isError || contentQuery.isError || !book) return <div className={styles.loading} role="alert"><h1>This book could not be opened.</h1><p>{bookQuery.error?.message ?? contentQuery.error?.message ?? 'The book may have been removed.'}</p><button className="button" onClick={() => { void bookQuery.refetch(); void contentQuery.refetch(); }}>Try again</button><Link className="button-quiet" to="/library">Back to library</Link></div>;

  return (
    <div className={`${styles.reader} ${styles[theme]}`} style={{ '--reader-font-size': `${fontSize}px` } as React.CSSProperties}>
      <header className={styles.toolbar} aria-hidden={smallScreen && sidePanel ? true : undefined}>
        <Link className="button-quiet" to="/library" aria-label="Back to your library">← Library</Link>
        <div className={styles.bookHeading}><strong>{book.title}</strong><span>{book.author}</span></div>
        <button className="button-quiet" aria-expanded={sidePanel === 'contents'} onClick={() => setSidePanel(sidePanel === 'contents' ? null : 'contents')}>Contents</button>
        <button className="button-quiet" aria-expanded={sidePanel === 'notes'} onClick={() => setSidePanel(sidePanel === 'notes' ? null : 'notes')}>Notes</button>
      </header>
      <section className={styles.preferences} aria-label="Reading preferences" aria-hidden={smallScreen && sidePanel ? true : undefined}>
        <div className={styles.fontButtons}><button aria-label="Decrease text size" disabled={fontSize <= 16} onClick={() => setFontSize(value => Math.max(16, value - 2))}>A−</button><span>{fontSize}</span><button aria-label="Increase text size" disabled={fontSize >= 30} onClick={() => setFontSize(value => Math.min(30, value + 2))}>A+</button></div>
        <label>Page theme <select value={theme} onChange={event => setTheme(event.target.value as typeof theme)}><option value="paper">Paper</option><option value="sepia">Sepia</option><option value="night">Night</option></select></label>
        {book.format === 'pdf' && <button className="button-quiet" onClick={() => setShowOriginal(value => !value)}>{showOriginal ? 'Read extracted text' : 'View original PDF'}</button>}
        <button className="button-quiet" onClick={() => void bookmark()} disabled={!currentPage || bookmarkSaving}>{bookmarkSaving ? 'Saving…' : 'Bookmark page'}</button>
      </section>
      <div className={`${styles.workspace} ${sidePanel ? styles.withPanel : ''}`}>
        <div className={styles.pageColumn} aria-hidden={smallScreen && sidePanel ? true : undefined}>
          {currentPage ? <>
            <div className={styles.chapterHeading}><span>{currentPage.chapterTitle}</span><span>Reading page {pageIndex + 1} of {pages.length}</span></div>
            {showOriginal && book.format === 'pdf' ? <iframe className={styles.pdf} title={`Original PDF: ${book.title}`} src={`/api/v1/books/${id}/file#page=${currentPage.chapterIndex + 1}`} /> : <article
              className={styles.prose} ref={articleRef} tabIndex={0} lang={book.language}
              onMouseUp={captureSelection} onTouchEnd={captureSelection} onKeyUp={captureSelection}
              aria-label={`${currentPage.chapterTitle}, reading page ${pageIndex + 1}`}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children, href, title }) => <a href={href} title={title} target="_blank" rel="noreferrer noopener">{children}</a>, img: () => null }}>{currentPage.text || '*This chapter is empty.*'}</ReactMarkdown>
            </article>}
            <div className={styles.noteAction}><button className="button" onClick={newNote}>{selection ? 'Note selected passage' : 'Add a note to this page'}</button>{selection && <span>{selection.length} characters selected</span>}</div>
            <nav className={styles.pagination} aria-label="Reading pages"><button className="button" onClick={() => goToPage(pageIndex - 1)} disabled={pageIndex <= 0}>← Previous</button><span>{Math.round(((pageIndex + 1) / pages.length) * 100)}%</span><button className="button" onClick={() => goToPage(pageIndex + 1)} disabled={pageIndex >= pages.length - 1}>Next →</button></nav>
          </> : <section className={styles.noContent}><h1>{book.title}</h1><p>{book.description || 'This shelf entry has no reading content yet.'}</p>{book.format === 'pdf' && <iframe className={styles.pdf} title={`Original PDF: ${book.title}`} src={`/api/v1/books/${id}/file`} />}{book.isOriginal ? <Link className="button button-primary" to={`/write/${id}`}>Write the first chapter</Link> : <Link className="button" to={`/notes?bookId=${id}`}>Keep notes about this book</Link>}</section>}
          <p className={`${styles.saved} ${saveError ? styles.unsaved : ''}`} role="status">{saveStatus}{saveError && <button onClick={() => { if (latestPosition.current) saveProgress(latestPosition.current); }} className="button-quiet">Retry sync</button>}</p>
          {(book.license || contentQuery.data?.references.length) && <details className={styles.sources}><summary>References and source information</summary>{book.sourceUrl && <a href={book.sourceUrl} target="_blank" rel="noreferrer noopener">Original source</a>}{book.license && <p>{book.license}</p>}{contentQuery.data?.references.map((reference, index) => <p key={reference.id}>[{index + 1}] {reference.label}{reference.author ? ` · ${reference.author}` : ''}{reference.locator ? ` · ${reference.locator}` : ''}{reference.url && <> · <a href={reference.url} target="_blank" rel="noreferrer noopener">Open reference</a></>}</p>)}{contentQuery.data?.licenseText && <pre>{contentQuery.data.licenseText}</pre>}</details>}
        </div>
        {sidePanel && <aside ref={panelRef} tabIndex={-1} role={smallScreen ? 'dialog' : undefined} aria-modal={smallScreen ? true : undefined} className={styles.sidePanel} aria-label={sidePanel === 'contents' ? 'Book contents and search' : 'Book notes'}>
          <div className={styles.panelHeading}><h2>{sidePanel === 'contents' ? 'In this book' : 'Your marginalia'}</h2><button className="button-quiet" onClick={() => setSidePanel(null)} aria-label="Close reader panel">Close</button></div>
          {sidePanel === 'contents' ? <>
            <label className="field">Find a passage<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search this book" /></label>
            {search.trim().length >= 2 ? <div className={styles.results} role="region" aria-label="Book search results"><p>{searchResults.length ? `${searchResults.length} matching reading pages` : 'No passages found.'}</p>{searchResults.map(result => <button key={result.index} onClick={() => { goToPage(result.index); setSearch(''); }}><strong>{result.page.chapterTitle}</strong><span>Page {result.index + 1} · …{result.page.text.slice(Math.max(0, result.at - 30), result.at + 100)}…</span></button>)}</div> : <ol className={styles.contents}>{contentQuery.data?.chapters.map(chapter => <li key={chapter.id}><button aria-current={currentPage?.chapterId === chapter.id ? 'location' : undefined} onClick={() => goToPage(pages.findIndex(page => page.chapterId === chapter.id))}>{chapter.title}<span>{chapter.kind === 'glossary' ? 'Glossary' : chapter.kind === 'frontmatter' ? 'Front matter' : ''}</span></button></li>)}</ol>}
          </> : <>
            {editor ? <><p className={styles.context}>{editor.note ? describeLocation(editor.note.location) : `${contentQuery.data?.chapters.find(chapter => chapter.id === editor.context?.chapterId)?.title ?? 'Book'} · ${describeLocation(editor.context?.location ?? null)}`}</p><NoteComposer key={editor.key} draftKey={editor.key} note={editor.note} context={editor.context} onSaved={savedNote} onCancel={() => setEditor(null)} /></> : <button className="button button-primary" onClick={newNote} disabled={!currentPage}>Add page note</button>}
            <div className={styles.noteList}>
              {notesQuery.isPending && <p role="status">Loading notes…</p>}
              {notesQuery.isError && <p role="alert">Notes could not load. <button className="button-quiet" onClick={() => void notesQuery.refetch()}>Retry</button></p>}
              {!notesQuery.isPending && !notes.length && <p>No notes yet. Select a passage or leave a thought on this page.</p>}
              {notes.map(note => <article className={styles.noteCard} key={note.id}><div className={styles.noteMeta}><span>{describeLocation(note.location)}</span>{note.location && <button className="button-quiet" onClick={() => goToPage(locatePage(pages, parseLocation(note.location)))}>Go to page</button>}</div><h3>{note.title || (note.tags.includes('bookmark') ? 'Bookmark' : 'A reading note')}</h3>{note.selectedText && <blockquote>{note.selectedText}</blockquote>}<p>{note.body.slice(0, 1200)}</p>{note.body.length > 1200 && <Link className="button-quiet" to={`/notes/${note.id}`}>Open complete note</Link>}<div className={styles.noteMeta}><button className="button-quiet" onClick={() => setEditor({ note, key: `edit-note:${note.id}` })}>Edit</button><Link className="button-quiet" to={`/reviews?noteId=${note.id}`}>Make a review</Link></div></article>)}
              {notesQuery.hasNextPage && <button className="button" disabled={notesQuery.isFetchingNextPage} onClick={() => void notesQuery.fetchNextPage()}>{notesQuery.isFetchingNextPage ? 'Loading…' : 'Load more notes'}</button>}
            </div>
          </>}
        </aside>}
      </div>
    </div>
  );
}

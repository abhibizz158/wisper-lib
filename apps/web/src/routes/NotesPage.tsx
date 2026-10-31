import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse, LibraryBook, PageNote } from '@wisper-lib/shared-types';
import { api } from '@/lib/apiClient';
import NoteComposer from '@/reader/NoteComposer';
import { describeLocation } from '@/reader/reading';
import styles from './NotesPage.module.css';

export default function NotesPage(): React.ReactElement {
  const { id: routeId } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [bookFilter, setBookFilter] = useState(params.get('bookId') ?? '');
  const [wishlist, setWishlist] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(routeId ?? null);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newDraft, setNewDraft] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search), 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { setSelectedId(routeId ?? null); setEditing(false); setComposing(false); setConfirmDelete(false); }, [routeId]);
  const booksQuery = useQuery({ queryKey: ['notes-book-options'], queryFn: async () => (await api.get<ApiResponse<LibraryBook[]>>('/books?limit=100')).data });
  const notesQuery = useInfiniteQuery({
    queryKey: ['notes', debouncedSearch, bookFilter, wishlist], initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: '30' });
      if (debouncedSearch.trim()) query.set('q', debouncedSearch.trim());
      if (bookFilter) query.set('bookId', bookFilter);
      if (wishlist) query.set('tag', 'wishlist');
      if (pageParam) query.set('after', pageParam);
      return api.get<ApiResponse<PageNote[]>>(`/notes?${query}`);
    },
    getNextPageParam: response => response.meta?.nextCursor || undefined,
  });
  const detailQuery = useQuery({ queryKey: ['note', selectedId], queryFn: async () => (await api.get<ApiResponse<PageNote>>(`/notes/${selectedId}`)).data, enabled: Boolean(selectedId) });
  const notes = notesQuery.data?.pages.flatMap(page => page.data) ?? [];
  const selected = detailQuery.data;

  function refresh() {
    void client.invalidateQueries({ queryKey: ['notes'] });
    void client.invalidateQueries({ queryKey: ['reader-notes'] });
    void client.invalidateQueries({ queryKey: ['note', selectedId] });
  }
  function beginNote() { setComposing(true); setEditing(false); setConfirmDelete(false); setMessage(''); setError(''); }
  function saved(note: PageNote) {
    client.setQueryData(['note', note.id], note);
    setSelectedId(note.id); setComposing(false); setEditing(false); setNewDraft(value => value + 1);
    setMessage('Your note is saved.'); refresh(); navigate(`/notes/${note.id}`, { replace: !routeId });
  }
  async function remove() {
    if (!selected || deleting) return;
    setDeleting(true); setError('');
    try {
      await api.delete(`/notes/${selected.id}`);
      setSelectedId(null); setConfirmDelete(false); setEditing(false); setMessage('Note deleted.');
      refresh(); navigate('/notes', { replace: true });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this note.'); }
    finally { setDeleting(false); }
  }
  async function exportNotes(format: 'markdown' | 'json') {
    setExporting(true); setError('');
    try {
      const query = new URLSearchParams({ format });
      if (bookFilter) query.set('bookId', bookFilter);
      const response = await fetch(`/api/v1/notes/export?${query}`);
      if (!response.ok) throw new Error('Notes could not be exported. Check your connection and retry.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `wisper-notes.${format === 'markdown' ? 'md' : 'json'}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Notes exported. Exports contain the selected book or your full notebook, including notes outside the current search.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Export failed.'); }
    finally { setExporting(false); }
  }

  return (
    <section className={styles.page}>
      <header className={styles.heading}><div><p className={styles.kicker}>Your reading, remembered</p><h1>Marginalia</h1><p>Passages, loose thoughts, and ideas worth returning to.</p></div><button className="button button-primary" onClick={beginNote}>Write a note</button></header>
      <div className={styles.tools}>
        <label className={`field ${styles.search}`}>Search notes<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find an idea or phrase" /></label>
        <label className="field">Book<select value={bookFilter} onChange={event => setBookFilter(event.target.value)}><option value="">Every book</option>{bookFilter && !booksQuery.data?.some(book => book.id === bookFilter) && <option value={bookFilter}>Selected book</option>}{booksQuery.data?.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
        <button className={`${styles.filter} ${wishlist ? styles.filterActive : ''}`} aria-pressed={wishlist} onClick={() => setWishlist(value => !value)}>Wishlist notes</button>
        <details className={styles.export}><summary className="button-quiet">Export notes</summary><div><button className="button-quiet" disabled={exporting} onClick={() => void exportNotes('markdown')}>Markdown</button><button className="button-quiet" disabled={exporting} onClick={() => void exportNotes('json')}>JSON</button></div></details>
      </div>
      {message && <p className={styles.notice} role="status">{message}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.workspace}>
        <section className={styles.list} aria-label="Saved notes">
          {notesQuery.isPending && <div className={styles.empty} role="status">Finding your notes…</div>}
          {notesQuery.isError && <div className={styles.empty} role="alert"><p>{notesQuery.error.message}</p><button className="button" onClick={() => void notesQuery.refetch()}>Try again</button></div>}
          {!notesQuery.isPending && !notesQuery.isError && !notes.length && <div className={styles.empty}><h2>{search || bookFilter || wishlist ? 'No notes match this view.' : 'A little room for your thoughts.'}</h2><p>{wishlist ? 'Add the tag “wishlist” to a note to keep it here.' : 'Leave a note beside a passage, or start with a thought of your own.'}</p><button className="button" onClick={beginNote}>Write your first note</button></div>}
          {notes.map(note => <Link to={`/notes/${note.id}`} className={`${styles.note} ${selectedId === note.id && !composing ? styles.selected : ''}`} key={note.id} aria-current={selectedId === note.id && !composing ? 'true' : undefined}>
            <div className={styles.noteMeta}><span>{note.bookTitle || 'Loose leaf'}</span><time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></div>
            <h2>{note.title || 'Untitled thought'}</h2><p>{note.body.slice(0, 500)}</p>
            <div className={styles.noteFooter}><span>{describeLocation(note.location)}</span><span>{note.tags.slice(0, 3).map(tag => `#${tag}`).join(' ')}</span></div>
          </Link>)}
          {notesQuery.hasNextPage && <button className="button" disabled={notesQuery.isFetchingNextPage} onClick={() => void notesQuery.fetchNextPage()}>{notesQuery.isFetchingNextPage ? 'Loading…' : 'Load more notes'}</button>}
        </section>
        <section className={`${styles.detail} panel`} aria-label={composing ? 'New note' : 'Note detail'}>
          {composing ? <><div className={styles.editorHeading}><h2>A new leaf</h2><span>{bookFilter ? `Attached to ${booksQuery.data?.find(book => book.id === bookFilter)?.title ?? 'the selected book'}` : 'Standalone or attached to a book'}</span></div><NoteComposer key={`compose-${newDraft}-${bookFilter}`} draftKey={`new-note:${bookFilter || 'standalone'}`} context={bookFilter ? { bookId: bookFilter } : undefined} books={booksQuery.data ?? []} onSaved={saved} onCancel={() => setComposing(false)} /></> : selectedId ? <>
            {detailQuery.isPending && <p role="status">Opening note…</p>}
            {detailQuery.isError && <div className={styles.empty} role="alert"><h2>This note could not be opened.</h2><p>{detailQuery.error.message}</p><button className="button" onClick={() => void detailQuery.refetch()}>Try again</button><Link className="button-quiet" to="/notes">Back to notebook</Link></div>}
            {selected && (editing ? <><div className={styles.editorHeading}><h2>Edit your note</h2><span>{selected.bookTitle || 'Loose leaf'}</span></div><NoteComposer key={`edit-${selected.id}`} draftKey={`edit-note:${selected.id}`} note={selected} books={booksQuery.data ?? []} onSaved={saved} onCancel={() => setEditing(false)} /></> : <article>
              <div className={styles.noteMeta}><span>{selected.bookTitle || 'Loose leaf'}</span><span>{describeLocation(selected.location)}</span></div>
              <h2 className={styles.detailTitle}>{selected.title || 'Untitled thought'}</h2>
              {selected.selectedText && <blockquote className={styles.quote}>{selected.selectedText}</blockquote>}
              <p className={styles.body}>{selected.body}</p>
              {selected.tags.length > 0 && <div className={styles.tags}>{selected.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>}
              <div className={styles.detailActions}><button className="button" onClick={() => setEditing(true)}>Edit note</button>{selected.bookId && selected.location && <Link className="button-quiet" to={`/reader/${selected.bookId}?location=${encodeURIComponent(selected.location)}`}>Return to passage</Link>}<Link className="button-quiet" to={`/reviews?noteId=${selected.id}`}>Make a review poster</Link></div>
              <div className={styles.lastEdited}><span>Last saved {new Date(selected.updatedAt).toLocaleString()}</span><button className="button-quiet" onClick={() => setConfirmDelete(value => !value)}>Delete note</button></div>
              {confirmDelete && <div className={styles.deleteConfirm} role="group" aria-label="Delete note confirmation"><p>Delete this saved note? This cannot be undone.</p><button className="button" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete note'}</button><button className="button-quiet" disabled={deleting} onClick={() => setConfirmDelete(false)}>Keep note</button></div>}
            </article>)}
          </> : <div className={styles.welcome}><span className={styles.flourish} aria-hidden="true">“</span><h2>Keep the thought.<br />Find it again.</h2><p>Choose a note to revisit its passage, edit your words, or turn it into a review poster.</p><button className="button" onClick={beginNote}>Start a loose leaf</button></div>}
        </section>
      </div>
    </section>
  );
}

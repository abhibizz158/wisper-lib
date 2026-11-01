import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react';
import { LibraryBookInputSchema, type LibraryBook, type Shelf } from '@wisper-lib/shared-types';
import { api } from '@/lib/apiClient';
import BookCover from '@/components/BookCover';
import Dialog from '@/components/Dialog';
import PreviewPlayer from '@/components/PreviewPlayer';

type Envelope<T> = { data: T; meta?: { nextCursor?: string | null } };
type BookFormProps = { book?: LibraryBook; shelves: Shelf[]; defaultShelf: string | null; pending: boolean; onSave: (event: FormEvent<HTMLFormElement>, file: File | null) => void; onCancel: () => void };

function BookForm({ book, shelves, defaultShelf, pending, onSave, onCancel }: BookFormProps) {
  const [file, setFile] = useState<File | null>(null);
  return <form className="stack" onSubmit={event => { event.preventDefault(); onSave(event, file); }}>
    {!book && <label className="field">Import a book (optional)<input type="file" accept=".epub,.pdf,.md,.txt" onChange={event => setFile(event.target.files?.[0] || null)} /><small>EPUB, PDF, Markdown, or text, up to 50 MB. Leave empty for a physical or wishlist book.</small></label>}
    <div className="form-grid"><label className="field">Title<input name="title" autoFocus required maxLength={500} defaultValue={book?.title} /></label><label className="field">Author<input name="author" maxLength={300} defaultValue={book?.author || ''} autoComplete="name" /></label></div>
    <label className="field">Description<textarea name="description" rows={3} maxLength={10000} defaultValue={book?.description || ''} /></label>
    <div className="form-grid"><label className="field">Collection<select name="shelfId" defaultValue={book?.shelfId || defaultShelf || ''}><option value="">Unsorted</option>{shelves.map(shelf => <option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}</select></label><label className="field">Book language<select name="language" defaultValue={book?.language || 'en-US'}>{[['en-US','English (US)'],['en-GB','English (UK)'],['es-ES','Spanish'],['fr-FR','French'],['de-DE','German'],['it-IT','Italian'],['pt-BR','Portuguese'],['hi-IN','Hindi'],['ja-JP','Japanese']].map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></label></div>
    <div className="form-grid"><label className="field">Tags<input name="tags" defaultValue={book?.tags.join(', ')} maxLength={1200} placeholder="Technology, ideas, weekend reads" /></label><label className="field">Cover color<input name="accent" type="color" defaultValue={book?.accent || '#B58A67'} /></label></div>
    <label className="field">Your cover image<input name="cover" type="file" accept="image/png,image/jpeg,image/webp" /><small>PNG, JPEG, or WebP, up to 5 MB.</small></label>
    {book?.coverPath && <label className="check-row"><input name="removeCover" type="checkbox" /> Restore the typographic cover</label>}
    <label className="check-row"><input name="isWishlist" type="checkbox" defaultChecked={book?.isWishlist} /> Keep on my wishlist</label>
    <div className="form-actions"><button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={pending}>{pending ? 'Saving…' : book ? 'Save changes' : file ? 'Import book' : 'Add book'}</button></div>
  </form>;
}

export default function LibraryPage() {
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('shelf');
  const [order, setOrder] = useState('recent');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'add' | 'edit' | 'shelf' | 'delete' | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [libraryTools, setLibraryTools] = useState(false);
  const [editShelf, setEditShelf] = useState<Shelf | null>(null);
  const notice = useRef<HTMLDivElement>(null);
  const shelvesQuery = useQuery({ queryKey: ['shelves'], queryFn: () => api.get<Envelope<Shelf[]>>('/shelves') });
  const shelves = shelvesQuery.data?.data || [];
  useEffect(() => { const timeout = setTimeout(() => setQuery(search), 220); return () => clearTimeout(timeout); }, [search]);
  const booksQuery = useInfiniteQuery({
    queryKey: ['books', query, shelfId, filter], initialPageParam: '',
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '30' });
      if (query) params.set('q', query);
      if (shelfId) params.set('shelfId', shelfId);
      if (filter === 'wishlist') params.set('wishlist', 'true');
      else if (filter !== 'all') params.set('status', filter);
      if (pageParam) params.set('after', pageParam);
      return api.get<Envelope<LibraryBook[]>>(`/books?${params}`, { signal });
    },
    getNextPageParam: page => page.meta?.nextCursor || undefined,
  });
  const books = useMemo(() => {
    const list = [...(booksQuery.data?.pages.flatMap(page => page.data) || [])];
    if (order === 'title') list.sort((a,b) => a.title.localeCompare(b.title));
    if (order === 'progress') list.sort((a,b) => b.progress - a.progress);
    return list;
  }, [booksQuery.data, order]);
  const selected = books.find(book => book.id === selectedId) || books[0];
  const carousel = useRef<HTMLDivElement>(null);
  const selectedIndex = selected ? books.findIndex(book => book.id === selected.id) : -1;
  function moveSelection(direction: -1 | 1) {
    if (!books.length) return;
    const next = (Math.max(0, selectedIndex) + direction + books.length) % books.length;
    setSelectedId(books[next].id);
  }
  useEffect(() => {
    if (!selected || view !== 'shelf') return;
    carousel.current?.querySelector<HTMLElement>(`[data-book-id="${CSS.escape(selected.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selected?.id, view]);
  async function perform(label: string, operation: () => Promise<void>) {
    if (busy) return;
    setBusy(label); setError(''); setMessage('');
    try {
      await operation();
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['books'] }), queryClient.invalidateQueries({ queryKey: ['shelves'] })]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The change could not be saved. Please try again.'); notice.current?.focus(); }
    finally { setBusy(''); }
  }
  function selectCollection(id: string | null) {
    setShelfId(id); setSelectedId(null);
    const shelf = shelves.find(item => item.id === id);
    setView(shelf?.layout || 'shelf');
  }
  async function saveBook(event: FormEvent<HTMLFormElement>, file: File | null) {
    const form = new FormData(event.currentTarget);
    const current = dialog === 'edit' ? selected : undefined;
    const input = LibraryBookInputSchema.safeParse({ title: form.get('title'), author: form.get('author'), description: form.get('description'), language: form.get('language'), shelfId: form.get('shelfId') || null, accent: form.get('accent'), tags: String(form.get('tags') || '').split(',').map(value => value.trim()).filter(Boolean), isOriginal: current?.isOriginal || false, isWishlist: form.get('isWishlist') === 'on' });
    if (!input.success) { setError(input.error.issues[0].message); return; }
    const cover = form.get('cover');
    await perform('book', async () => {
      let response: Envelope<LibraryBook>;
      if (current) response = await api.patch(`/books/${current.id}`, input.data);
      else if (file) {
        const upload = new FormData(); upload.set('file', file);
        Object.entries(input.data).forEach(([key,value]) => { if (value !== null) upload.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value)); });
        response = await api.upload('/books/upload', upload);
      } else response = await api.post('/books', input.data);
      if (cover instanceof File && cover.size) { const upload = new FormData(); upload.set('file', cover); await api.upload(`/books/${response.data.id}/cover`, upload); }
      else if (current && form.get('removeCover') === 'on') await api.delete(`/books/${current.id}/cover`);
      setSelectedId(response.data.id); setDialog(null); setMessage(current ? 'Book details saved.' : file ? 'Book imported. Your reading room is ready.' : 'Added to your library.');
      if (filter !== 'all' && filter !== 'wishlist') setFilter('all');
    });
  }
  function saveShelf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const input = { name: String(form.get('name')), description: String(form.get('description')), color: String(form.get('color')), layout: String(form.get('layout')), sortOrder: editShelf?.sortOrder ?? shelves.length };
    void perform('shelf', async () => {
      const response: Envelope<Shelf> = editShelf ? await api.patch(`/shelves/${editShelf.id}`, input) : await api.post('/shelves', input);
      setShelfId(response.data.id); setView(response.data.layout); setSelectedId(null); setDialog(null); setMessage('Collection saved.');
    });
  }
  function moveShelf(id: string, direction: -1 | 1) {
    const ordered=[...shelves];
    const index=ordered.findIndex(shelf=>shelf.id===id), target=index+direction;
    if(index<0 || target<0 || target>=ordered.length) return;
    [ordered[index],ordered[target]]=[ordered[target],ordered[index]];
    void perform('shelf-order',async()=>{
      await api.put('/shelves/order',{ids:ordered.map(shelf=>shelf.id)});
      const current=ordered.find(shelf=>shelf.id===id);
      if(current) setEditShelf({...current,sortOrder:target});
      setMessage(direction<0?'Collection moved earlier.':'Collection moved later.');
    });
  }
  function importDemos() {
    void perform('demo', async () => { await api.post('/demo/import'); setFilter('all'); setShelfId(null); setQuery(''); setSearch(''); setMessage('Three licensed sample editions are on your shelf. Their original notices are included.'); });
  }
  return <section className="library-page apple-library" style={{ '--book-accent': selected?.accent || '#8b6246' } as CSSProperties}>
    <LazyMotion features={domAnimation}>
    <div className="apple-backdrop" aria-hidden="true"><span /></div>
    <div ref={notice} className="apple-notices" tabIndex={-1} aria-live="polite">{error && <div className="alert" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss error">✕</button></div>}{message && <div className="notice">{message}<button type="button" onClick={() => setMessage('')} aria-label="Dismiss notification">✕</button></div>}</div>
    <AnimatePresence mode="wait" initial={false}>
    {selected && <m.section className="now-playing-book" key={`now-${selected.id}`} aria-label="Selected book"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.992 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -7, scale: 0.996 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.34, ease: [0.2, 0.72, 0.2, 1] }}>
      <div className="now-playing-core">
        <m.div className="now-cover" whileHover={reduceMotion ? undefined : { y: -3, rotateY: -1.5, rotateX: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 22 }}
          onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width - 0.5; const y = (event.clientY - rect.top) / rect.height - 0.5; event.currentTarget.style.setProperty('--tilt-x', `${Math.max(-1.4, Math.min(1.4, -y * 2.8))}deg`); event.currentTarget.style.setProperty('--tilt-y', `${Math.max(-1.6, Math.min(1.6, x * 3.2))}deg`); event.currentTarget.style.setProperty('--glint-x', `${(x + 0.5) * 100}%`); event.currentTarget.style.setProperty('--glint-y', `${(y + 0.5) * 100}%`); }}
          onPointerLeave={event => { event.currentTarget.style.setProperty('--tilt-x', '0deg'); event.currentTarget.style.setProperty('--tilt-y', '0deg'); }}>
          <BookCover book={selected} large />
        </m.div>
        <div className="now-book-copy">
          <p className="now-state">{selected.isWishlist ? 'ON YOUR WISHLIST' : selected.progress > 0 ? 'PICK UP WHERE YOU LEFT OFF' : selected.isOriginal ? 'FROM YOUR WRITING DESK' : 'READY WHEN YOU ARE'}</p>
          <div className="now-title-row"><h1>{selected.title}</h1><button type="button" className="now-more" onClick={() => { setError(''); setDialog('edit'); }} aria-label={`Book options for ${selected.title}`}>✎</button></div>
          <p className="now-author">{selected.author || 'A personal book'} <span>·</span> {selected.format.toUpperCase()}</p>
          <div className="now-progress"><div><span>{Math.round(selected.progress)}% read</span><span>{selected.progress > 0 ? 'Continue your reading' : selected.status === 'finished' ? 'Finished' : 'Not started'}</span></div><progress max="100" value={selected.progress} aria-label="Reading progress" /></div>
          <div className="now-actions"><button type="button" className="now-skip" aria-label="Previous book" onClick={() => moveSelection(-1)} disabled={books.length < 2}>⏮</button><PreviewPlayer book={selected} /><button type="button" className="now-skip" aria-label="Next book" onClick={() => moveSelection(1)} disabled={books.length < 2}>⏭</button></div>
          <Link className="button button-quiet now-read" to={`/reader/${selected.id}`}>{selected.progress > 0 ? 'Continue reading' : 'Open book'} <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </m.section>}
    </AnimatePresence>
    {!selected && <div className="now-empty"><p>YOUR BOOKS</p><h1>A quieter place for your next chapter.</h1><button className="button button-primary" onClick={() => setDialog('add')}>Add a book</button></div>}
    <section className="apple-library-shelf" aria-label="Your books">
      <div className="apple-shelf-heading"><div><p>YOUR LIBRARY</p><h2>Books <span>{books.length}</span></h2></div><div className="apple-shelf-actions"><button className="apple-tool-button" type="button" aria-label="Browse and filter books" aria-expanded={libraryTools} onClick={() => setLibraryTools(open => !open)}>⌕</button><button className="button button-primary apple-add-book" onClick={() => { setError(''); setDialog('add'); }}>＋ Add book</button></div></div>
      {libraryTools && <div className="apple-library-tools"><label className="shelf-select">Collection<select aria-label="Choose a collection" value={shelfId || ''} onChange={event => selectCollection(event.target.value || null)}><option value="">All books</option>{shelves.map(shelf => <option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}</select></label><label className="shelf-select">Status<select aria-label="Filter reading status" value={filter} onChange={event => { setFilter(event.target.value); setSelectedId(null); }}><option value="all">All books</option><option value="unread">Unread</option><option value="reading">Reading</option><option value="paused">Paused</option><option value="finished">Finished</option><option value="dnf">Stopped</option><option value="wishlist">Wishlist</option></select></label><label className="search-field"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search your books" placeholder="Search title or author" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="shelf-select">Sort<select aria-label="Sort books" value={order} onChange={event => setOrder(event.target.value)}><option value="recent">Recently added</option><option value="title">Title A–Z</option><option value="progress">Reading progress</option></select></label><label className="shelf-select">Layout<select aria-label="Shelf layout" value={view} onChange={event => setView(event.target.value)}><option value="shelf">Shelf</option><option value="grid">Grid</option><option value="list">List</option><option value="table">Table</option></select></label><button className="button button-quiet" onClick={() => { setEditShelf(null); setDialog('shelf'); }}>＋ Collection</button><button className="button button-quiet" onClick={importDemos} disabled={!!busy}>{busy === 'demo' ? 'Adding…' : 'Free sample books'}</button></div>}
      {booksQuery.isPending ? <div className="apple-books-loading" aria-busy="true">Opening your shelf…</div> : booksQuery.error ? <div className="empty-state" role="alert"><h3>Your library could not be opened</h3><p>{(booksQuery.error as Error).message}</p><button className="button button-primary" onClick={() => void booksQuery.refetch()}>Try again</button></div> : !books.length ? <div className="apple-books-loading">{query ? 'No books match that search.' : 'No books on this shelf yet.'}</div> : <div className={`apple-book-rail layout-${view}`} ref={carousel} tabIndex={0} aria-label="Installed books. Use the left and right arrow keys to browse" onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveSelection(event.key === 'ArrowRight' ? 1 : -1); } }}>{books.map((book,index) => <m.article key={book.id} data-book-id={book.id} className={`apple-book-card ${selected?.id === book.id ? 'is-selected' : ''}`} onPointerEnter={() => setSelectedId(book.id)} onContextMenu={event => { event.preventDefault(); setSelectedId(book.id); setError(''); setDialog('edit'); }} whileHover={reduceMotion ? undefined : { y: -3, rotateY: 0.7 }} whileTap={reduceMotion ? undefined : { scale: 0.99 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}><button type="button" className="apple-book-select" onFocus={() => setSelectedId(book.id)} onClick={() => setSelectedId(book.id)} onKeyDown={event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); const next=(index+(event.key==='ArrowRight'?1:-1)+books.length)%books.length; setSelectedId(books[next].id); requestAnimationFrame(()=>carousel.current?.querySelector<HTMLButtonElement>(`[data-book-id="${CSS.escape(books[next].id)}"] .apple-book-select`)?.focus()); }} aria-pressed={selected?.id===book.id} aria-label={`Select ${book.title}`}><BookCover book={book}/><span className="apple-book-title">{book.title}</span><span className="apple-book-author">{book.author || 'Personal edition'}</span></button></m.article>)}</div>}
      {booksQuery.hasNextPage && <div className="apple-load-more"><button className="button button-quiet" onClick={() => void booksQuery.fetchNextPage()} disabled={booksQuery.isFetchingNextPage}>{booksQuery.isFetchingNextPage ? 'Opening more books…' : 'Load more books'}</button></div>}
    </section>
    {(dialog === 'add' || dialog === 'edit') && <Dialog title={dialog === 'edit' ? 'Make this book yours' : 'Add to your library'} onClose={() => !busy && setDialog(null)}><BookForm book={dialog === 'edit' ? selected : undefined} shelves={shelves} defaultShelf={shelfId} pending={busy === 'book'} onSave={saveBook} onCancel={() => setDialog(null)} />{error && <p className="inline-error" role="alert">{error}</p>}{dialog === 'edit' && selected && <div className="dialog-footer"><Link className="button button-quiet" to={`/reviews?bookId=${selected.id}`}>Write a review</Link><button className="button button-danger" disabled={!!busy} onClick={() => setDialog('delete')}>Remove book</button></div>}</Dialog>}
    {dialog === 'delete' && selected && <Dialog title="Remove this book?" onClose={() => setDialog(null)}><p>“{selected.title}” and its reading progress will be removed. Export any notes you want to keep first.</p><div className="form-actions"><button className="button button-quiet" onClick={() => setDialog('edit')}>Keep book</button><button className="button button-danger" disabled={!!busy} onClick={() => { void perform('delete', async () => { await api.delete(`/books/${selected.id}`); setSelectedId(null); setDialog(null); setMessage('Book removed.'); }); }}>Remove book</button></div></Dialog>}
    {dialog === 'shelf' && <Dialog title={editShelf ? 'Arrange this collection' : 'Create a collection'} onClose={() => setDialog(null)}><form className="stack" onSubmit={saveShelf}><label className="field">Collection name<input autoFocus name="name" required maxLength={120} defaultValue={editShelf?.name} placeholder="Late-night learning" /></label><label className="field">A little description<textarea name="description" maxLength={500} rows={2} defaultValue={editShelf?.description} /></label><div className="form-grid"><label className="field">Color<input name="color" type="color" defaultValue={editShelf?.color || '#B58A67'} /></label><label className="field">Preferred view<select name="layout" defaultValue={editShelf?.layout || 'grid'}><option value="grid">Grid</option><option value="shelf">Shelf</option><option value="list">List</option></select></label></div><div className="form-actions"><button className="button button-quiet" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={!!busy}>Save collection</button></div></form>{editShelf && <div className="dialog-footer"><button className="button button-quiet" disabled={!!busy || shelves.findIndex(shelf=>shelf.id===editShelf.id)<=0} onClick={() => moveShelf(editShelf.id,-1)}>Move earlier</button><button className="button button-quiet" disabled={!!busy || shelves.findIndex(shelf=>shelf.id===editShelf.id)===shelves.length-1} onClick={() => moveShelf(editShelf.id,1)}>Move later</button><button className="button button-danger" disabled={!!busy} onClick={() => { void perform('delete-shelf', async () => { await api.delete(`/shelves/${editShelf.id}`); setShelfId(null); setDialog(null); setMessage('Collection removed. Its books remain in your library.'); }); }}>Remove collection</button></div>}{error && <p className="inline-error" role="alert">{error}</p>}</Dialog>}
    </LazyMotion>
  </section>;
}

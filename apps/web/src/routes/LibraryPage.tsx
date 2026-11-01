import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [editShelf, setEditShelf] = useState<Shelf | null>(null);
  const notice = useRef<HTMLDivElement>(null);
  const shelvesQuery = useQuery({ queryKey: ['shelves'], queryFn: () => api.get<Envelope<Shelf[]>>('/shelves') });
  const shelves = shelvesQuery.data?.data || [];
  const activeShelf = shelves.find(shelf => shelf.id === shelfId);
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
  return <section className="library-page">
    <header className="page-heading"><div><p className="eyebrow">YOUR BOOKS · YOUR OWN LITTLE UNIVERSE</p><h1>The library</h1></div><div className="heading-actions"><button className="button button-primary" onClick={() => { setError(''); setDialog('add'); }}>＋ Add book</button></div></header>
    <div ref={notice} tabIndex={-1} aria-live="polite">{error && <div className="alert" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss error">✕</button></div>}{message && <div className="notice">{message}<button type="button" onClick={() => setMessage('')} aria-label="Dismiss notification">✕</button></div>}</div>
    <div className="library-layout">
      <aside className="collection-rail" aria-label="Library collections"><div className="rail-heading"><h2>Collections</h2><button type="button" className="button button-quiet icon-button" aria-label="Create collection" onClick={() => { setEditShelf(null); setDialog('shelf'); }}>＋</button></div><button className={`collection-link ${!shelfId ? 'is-active' : ''}`} onClick={() => selectCollection(null)}><span className="collection-glyph" aria-hidden="true">▤</span>All books</button>{shelvesQuery.isPending && <p className="fine-print">Opening collections…</p>}{shelves.map(shelf => <button key={shelf.id} className={`collection-link ${shelf.id === shelfId ? 'is-active' : ''}`} onClick={() => selectCollection(shelf.id)} style={{ '--collection-color': shelf.color } as CSSProperties}><span className="collection-glyph" aria-hidden="true">▰</span><span>{shelf.name}</span><small>{shelf.bookCount}</small></button>)}{shelvesQuery.error && <button className="button button-quiet" onClick={() => void shelvesQuery.refetch()}>Retry collections</button>}
        {activeShelf && <div className="collection-tools"><p>{activeShelf.description || 'A shelf arranged your way.'}</p><button className="button button-quiet" onClick={() => { setEditShelf(activeShelf); setDialog('shelf'); }}>Edit collection</button></div>}
        <div className="rail-foot"><span className="ambient-mark" aria-hidden="true">✦</span><p>Keep the stories.<br />Keep the little thoughts.</p><button className="button button-quiet" disabled={!!busy} onClick={importDemos}>{busy === 'demo' ? 'Adding books…' : 'Add free tech samples'}</button></div>
      </aside>
      <div className="library-main">
        {selected && <div className="book-stage" key={`stage-${selected.id}`} style={{ '--stage-accent': selected.accent } as CSSProperties}>
          <div className="stage-art"><BookCover book={selected} large /><div className="stage-reflection" aria-hidden="true" /></div>
          <div className="stage-copy"><p className="eyebrow">{selected.isWishlist ? 'On your wishlist' : selected.progress > 0 ? 'Waiting where you left it' : selected.isOriginal ? 'From your writing desk' : 'An invitation to begin'}</p><h2>{selected.title}</h2><p className="stage-author">{selected.author || 'A personal book'}<span>·</span>{selected.format.toUpperCase()}</p><p className="stage-description">{selected.description || 'Make space for a new idea. Read, leave a thought, and return whenever you are ready.'}</p>
            <div className="stage-actions"><Link className="button button-primary" to={`/reader/${selected.id}`}>{selected.progress > 0 ? 'Continue reading' : 'Open book'} <span aria-hidden="true">↗</span></Link><button className="button button-quiet" onClick={() => { setError(''); setDialog('edit'); }} aria-label={`Book options for ${selected.title}`}>Book options <span aria-hidden="true">⋯</span></button>{selected.isOriginal && <Link className="button button-quiet" to={`/write/${selected.id}`}>Writing desk</Link>}</div>
            <div className="reading-line"><span>{Math.round(selected.progress)}% read</span><progress max={100} value={selected.progress} aria-label="Reading progress" /><label className="sr-only" htmlFor="book-status">Reading status</label><select id="book-status" value={selected.status} disabled={!!busy} onChange={event => { const status = event.target.value; void perform('progress', async () => { await api.post(`/books/${selected.id}/progress`, { lastLocation: selected.lastLocation || '', progress: status === 'finished' ? 100 : selected.progress, status }); }); }}>{[['unread','Unread'],['reading','Reading'],['paused','Paused'],['finished','Finished'],['dnf','Stopped']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </div>
        </div>}
        {selected && <PreviewPlayer book={selected} />}
        {view === 'shelf' && books.length > 0 && <section className="launch-shelf" aria-label="Choose a book">
          <div className="launch-shelf-heading"><div><p className="eyebrow">Your shelf</p><h2>Choose your next chapter</h2></div><div className="shelf-arrows"><button className="button button-quiet icon-button" aria-label="Previous book" onClick={() => moveSelection(-1)} disabled={books.length < 2}>←</button><span>{selectedIndex + 1} <span aria-hidden="true">/</span> {books.length}</span><button className="button button-quiet icon-button" aria-label="Next book" onClick={() => moveSelection(1)} disabled={books.length < 2}>→</button></div></div>
          <div className="launch-rail" ref={carousel} tabIndex={0} aria-label="Book carousel. Use left and right arrow keys to browse" onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveSelection(event.key === 'ArrowRight' ? 1 : -1); } }}>
            {books.map(book => <article key={book.id} data-book-id={book.id} className={`launch-card ${selected?.id === book.id ? 'is-selected' : ''}`} onContextMenu={event => { event.preventDefault(); setSelectedId(book.id); setError(''); setDialog('edit'); }}>
              <button type="button" className="launch-select" onClick={() => setSelectedId(book.id)} onKeyDown={event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); const next = (books.findIndex(item => item.id === book.id) + (event.key === 'ArrowRight' ? 1 : -1) + books.length) % books.length; setSelectedId(books[next].id); requestAnimationFrame(() => carousel.current?.querySelector<HTMLButtonElement>(`[data-book-id="${CSS.escape(books[next].id)}"] .launch-select`)?.focus()); }} aria-pressed={selected?.id === book.id} aria-label={`Select ${book.title}`}><BookCover book={book} /><span className="launch-title">{book.title}</span><span className="launch-author">{book.author || 'Personal edition'}</span></button>
              {selected?.id === book.id && <button type="button" className="launch-options" onClick={() => { setError(''); setDialog('edit'); }}>Options <span aria-hidden="true">⋯</span></button>}
            </article>)}
          </div>
          <p className="carousel-hint">Browse with ← → · Select a cover · Right click or choose Options to manage a book</p>
        </section>}
        <div className="shelf-toolbar"><label className="shelf-select">Show books<select aria-label="Filter reading status" value={filter} onChange={event => { setFilter(event.target.value); setSelectedId(null); }}><option value="all">All titles</option><option value="unread">Unread</option><option value="reading">Reading</option><option value="paused">Paused</option><option value="finished">Finished</option><option value="dnf">Stopped</option><option value="wishlist">Wishlist</option></select></label><label className="search-field"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search your books" placeholder="Find a title, author, or tag" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
        <div className="shelf-heading"><div><h2>{activeShelf?.name || (filter === 'wishlist' ? 'Books for someday' : 'On your shelves')}</h2><span>{books.length} {books.length === 1 ? 'title' : 'titles'} displayed</span></div><div className="view-controls"><label className="sr-only" htmlFor="book-sort">Arrange displayed titles</label><select id="book-sort" value={order} onChange={event => setOrder(event.target.value)}><option value="recent">Recently added</option><option value="title">Displayed titles A–Z</option><option value="progress">Displayed progress</option></select><label className="shelf-select">View<select aria-label="Library view" value={view} onChange={event => setView(event.target.value)}><option value="shelf">Covers</option><option value="grid">Grid</option><option value="list">List</option><option value="table">Table</option></select></label></div></div>
        {booksQuery.isPending ? <div className="book-grid" aria-label="Loading books" aria-busy="true">{Array.from({length: 6}, (_,index) => <div className="book-skeleton" key={index} />)}</div> : booksQuery.error ? <div className="empty-state" role="alert"><h3>Your library could not be opened</h3><p>{(booksQuery.error as Error).message}</p><button className="button button-primary" onClick={() => void booksQuery.refetch()}>Try again</button></div> : !books.length ? <div className="empty-state"><span className="empty-symbol" aria-hidden="true">▤</span><h3>{query ? 'No books by that name' : filter === 'wishlist' ? 'A place for your next discoveries' : 'Your own corner of the library'}</h3><p>{query ? 'Try another title, author, or tag.' : 'Bring a book, start writing, or explore three freely licensed technical sample editions.'}</p><div className="heading-actions"><button className="button button-primary" onClick={() => setDialog('add')}>Add a book</button><button className="button button-quiet" onClick={importDemos} disabled={!!busy}>Explore sample books</button></div></div> : view === 'shelf' ? null : view === 'table' ? <div className="data-table-wrap"><table className="data-table"><caption className="sr-only">Books in the current library view</caption><thead><tr><th>Title</th><th>Author</th><th>Collection</th><th>Status</th><th>Read</th><th>Language</th><th /></tr></thead><tbody>{books.map(book => <tr key={book.id} className={selected?.id === book.id ? 'is-selected' : ''}><td><button className="table-title" onClick={() => setSelectedId(book.id)}>{book.title}</button></td><td>{book.author || '—'}</td><td>{book.shelfName || 'Unsorted'}</td><td>{book.status.replace('dnf','Stopped')}</td><td>{Math.round(book.progress)}%</td><td>{book.language}</td><td><Link className="button button-quiet" to={`/reader/${book.id}`} aria-label={`Read ${book.title}`}>Read ↗</Link></td></tr>)}</tbody></table></div> : <div className={`book-grid view-${view}`}>{books.map(book => <article key={book.id} className={`book-card ${selected?.id === book.id ? 'is-selected' : ''}`}><button type="button" className="book-select" onClick={() => { setSelectedId(book.id); }} aria-pressed={selected?.id === book.id} aria-label={`Preview ${book.title}`}><BookCover book={book} /><div className="book-caption"><h3>{book.title}</h3><p>{book.author || 'Personal collection'}</p><div className="book-meta"><span>{book.isWishlist ? 'Wishlist' : book.isOriginal ? 'Your manuscript' : book.license ? 'Sample edition' : book.status}</span>{book.progress > 0 && <span>{Math.round(book.progress)}%</span>}</div></div></button><Link className="book-read-link" to={`/reader/${book.id}`} aria-label={`Read ${book.title}`}>Read <span aria-hidden="true">↗</span></Link></article>)}</div>}
        {booksQuery.hasNextPage && <div className="load-more"><button className="button button-quiet" onClick={() => void booksQuery.fetchNextPage()} disabled={booksQuery.isFetchingNextPage}>{booksQuery.isFetchingNextPage ? 'Opening more books…' : 'Load more titles'}</button></div>}
      </div>
    </div>
    {(dialog === 'add' || dialog === 'edit') && <Dialog title={dialog === 'edit' ? 'Make this book yours' : 'Add to your library'} onClose={() => !busy && setDialog(null)}><BookForm book={dialog === 'edit' ? selected : undefined} shelves={shelves} defaultShelf={shelfId} pending={busy === 'book'} onSave={saveBook} onCancel={() => setDialog(null)} />{error && <p className="inline-error" role="alert">{error}</p>}{dialog === 'edit' && selected && <div className="dialog-footer"><Link className="button button-quiet" to={`/reviews?bookId=${selected.id}`}>Write a review</Link><button className="button button-danger" disabled={!!busy} onClick={() => setDialog('delete')}>Remove book</button></div>}</Dialog>}
    {dialog === 'delete' && selected && <Dialog title="Remove this book?" onClose={() => setDialog(null)}><p>“{selected.title}” and its reading progress will be removed. Export any notes you want to keep first.</p><div className="form-actions"><button className="button button-quiet" onClick={() => setDialog('edit')}>Keep book</button><button className="button button-danger" disabled={!!busy} onClick={() => { void perform('delete', async () => { await api.delete(`/books/${selected.id}`); setSelectedId(null); setDialog(null); setMessage('Book removed.'); }); }}>Remove book</button></div></Dialog>}
    {dialog === 'shelf' && <Dialog title={editShelf ? 'Arrange this collection' : 'Create a collection'} onClose={() => setDialog(null)}><form className="stack" onSubmit={saveShelf}><label className="field">Collection name<input autoFocus name="name" required maxLength={120} defaultValue={editShelf?.name} placeholder="Late-night learning" /></label><label className="field">A little description<textarea name="description" maxLength={500} rows={2} defaultValue={editShelf?.description} /></label><div className="form-grid"><label className="field">Color<input name="color" type="color" defaultValue={editShelf?.color || '#B58A67'} /></label><label className="field">Preferred view<select name="layout" defaultValue={editShelf?.layout || 'grid'}><option value="grid">Grid</option><option value="shelf">Shelf</option><option value="list">List</option></select></label></div><div className="form-actions"><button className="button button-quiet" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={!!busy}>Save collection</button></div></form>{editShelf && <div className="dialog-footer"><button className="button button-quiet" disabled={!!busy || shelves.findIndex(shelf=>shelf.id===editShelf.id)<=0} onClick={() => moveShelf(editShelf.id,-1)}>Move earlier</button><button className="button button-quiet" disabled={!!busy || shelves.findIndex(shelf=>shelf.id===editShelf.id)===shelves.length-1} onClick={() => moveShelf(editShelf.id,1)}>Move later</button><button className="button button-danger" disabled={!!busy} onClick={() => { void perform('delete-shelf', async () => { await api.delete(`/shelves/${editShelf.id}`); setShelfId(null); setDialog(null); setMessage('Collection removed. Its books remain in your library.'); }); }}>Remove collection</button></div>}{error && <p className="inline-error" role="alert">{error}</p>}</Dialog>}
  </section>;
}

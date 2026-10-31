import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ContentUpdateSchema, languageCodes, type BookContent, type BookReferenceInput, type Chapter, type LibraryBook } from '@wisper-lib/shared-types';
import { api, ApiClientError } from '@/lib/apiClient';
import { studioDrafts } from '@/lib/studioDrafts';
import { operationId } from '@/lib/uuid';
import styles from './WriterPage.module.css';

type DraftChapter = { id: string; title: string; body: string; kind: Chapter['kind'] };
type DraftReference = BookReferenceInput & { id: string };
interface WritingDraft { chapters: DraftChapter[]; references: DraftReference[]; revision: number; goal: number; title: string; author: string }
const languageLabels: Record<string, string> = { 'en-US': 'English (US)', 'en-GB': 'English (UK)', 'es-ES': 'Español', 'fr-FR': 'Français', 'de-DE': 'Deutsch', 'it-IT': 'Italiano', 'pt-BR': 'Português (Brasil)', 'hi-IN': 'हिन्दी', 'ja-JP': '日本語' };
const newChapter = (): DraftChapter => ({ id: operationId(), title: 'Untitled chapter', body: '', kind: 'body' });
const message = (error: unknown) => error instanceof Error ? error.message : 'Could not save. Please try again.';
const wordCount = (text: string) => text.trim() ? text.trim().split(/\s+/u).length : 0;

/** Chapter editor with local recovery, stable chapter identities, and referenced exports. */
export default function WriterPage(): React.ReactElement {
  const { id = 'new' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<LibraryBook | null>(null);
  const [draft, setDraft] = useState<WritingDraft>({ chapters: [], references: [], revision: 0, goal: 1000, title: '', author: '' });
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(id !== 'new');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recovery, setRecovery] = useState<WritingDraft | null>(null);
  const [conflict, setConflict] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [referencePanel, setReferencePanel] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newLanguage, setNewLanguage] = useState<string>('en-US');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const currentDraft = useRef(draft);
  const savingRef = useRef(false);
  const generation = useRef(0);
  const draftKey = `writer:local-user-001:${id}`;
  currentDraft.current = draft;

  useEffect(() => {
    let live = true;
    generation.current += 1;
    setError(''); setStatus(''); setRecovery(null); setConflict(false); setDirty(false); setBook(null); setSaving(false); savingRef.current = false;
    if (id === 'new') { setLoading(false); return; }
    setLoading(true);
    void Promise.all([
      api.get<{ data: LibraryBook }>(`/books/${id}`),
      api.get<{ data: BookContent }>(`/books/${id}/content`),
      studioDrafts.read<WritingDraft>(draftKey).catch(() => null),
      studioDrafts.read<number>(`writer-goal:local-user-001:${id}`).catch(() => null),
    ]).then(([bookResult, contentResult, localDraft, savedGoal]) => {
      if (!live) return;
      const content = contentResult.data;
      const chapters = content.chapters.length ? content.chapters.map(({ id: chapterId, title, body, kind }) => ({ id: chapterId, title, body, kind })) : [newChapter()];
      const value: WritingDraft = { chapters, references: content.references, revision: content.revision, goal: typeof savedGoal === 'number' && savedGoal >= 100 && savedGoal <= 1000000 ? savedGoal : 1000, title: bookResult.data.title, author: bookResult.data.author ?? '' };
      setBook(bookResult.data); setDraft(value); setSelectedId(chapters[0]?.id ?? '');
      setDirty(content.chapters.length === 0 && bookResult.data.isOriginal);
      if (localDraft && JSON.stringify({ ...localDraft, goal: 1000 }) !== JSON.stringify({ ...value, goal: 1000 })) setRecovery(localDraft);
    }).catch((cause) => { if (live) setError(message(cause)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id, draftKey]);

  useEffect(() => {
    if (!dirty || loading || recovery || !book?.isOriginal) return;
    let live = true;
    void studioDrafts.write(draftKey, draft).then(() => { if (live && !savingRef.current) setStatus('Draft saved on this device'); }).catch(() => { if (live) setStatus('Device recovery is unavailable. Save your book before leaving.'); });
    return () => { live = false; };
  }, [draft, draftKey, dirty, loading, recovery, book?.isOriginal]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const selected = draft.chapters.find(chapter => chapter.id === selectedId) ?? draft.chapters[0];
  const countCache = useRef(new WeakMap<DraftChapter, number>());
  const totalWords = useMemo(() => draft.chapters.reduce((sum, chapter) => {
    let words = countCache.current.get(chapter);
    if (words === undefined) { words = wordCount(chapter.body); countCache.current.set(chapter, words); }
    return sum + words;
  }, 0), [draft.chapters]);
  function change(update: Partial<WritingDraft>) { setDraft(value => ({ ...value, ...update })); setDirty(true); setError(''); }
  function editChapter(update: Partial<DraftChapter>) {
    if (!selected) return;
    change({ chapters: draft.chapters.map(chapter => chapter.id === selected.id ? { ...chapter, ...update } : chapter) });
  }
  function insert(before: string, after = '', sample = '') {
    if (!selected) return;
    const field = textarea.current;
    const start = field?.selectionStart ?? selected.body.length;
    const end = field?.selectionEnd ?? start;
    const text = selected.body.slice(start, end) || sample;
    editChapter({ body: selected.body.slice(0, start) + before + text + after + selected.body.slice(end) });
    requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(start + before.length, start + before.length + text.length); });
  }
  function reorder(index: number, delta: number) {
    const chapters = [...draft.chapters];
    const target = index + delta;
    if (target < 0 || target >= chapters.length) return;
    [chapters[index], chapters[target]] = [chapters[target], chapters[index]];
    change({ chapters });
  }
  async function createBook(event: React.FormEvent) {
    event.preventDefault(); if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const result = await api.post<{ data: LibraryBook }>('/books', { title: newTitle.trim(), author: newAuthor.trim(), language: newLanguage, isOriginal: true });
      navigate(`/write/${result.data.id}`, { replace: true });
    } catch (cause) { setError(message(cause)); } finally { savingRef.current = false; setSaving(false); }
  }
  async function save() {
    if (!book || savingRef.current || recovery) return;
    const snapshot = currentDraft.current;
    const payload = { revision: snapshot.revision, chapters: snapshot.chapters, references: snapshot.references };
    const checked = ContentUpdateSchema.safeParse(payload);
    if (!checked.success) { setError(checked.error.issues[0]?.message ?? 'Check the chapter and reference fields.'); return; }
    if (!snapshot.title.trim()) { setError('Give your book a title.'); return; }
    const saveGeneration = generation.current;
    savingRef.current = true; setSaving(true); setError(''); setStatus('Saving book…');
    try {
      const metadata = await api.patch<{ data: LibraryBook }>(`/books/${book.id}`, { title: snapshot.title.trim(), author: snapshot.author.trim() });
      const result = await api.patch<{ data: BookContent }>(`/books/${book.id}/content`, checked.data, { method: 'PUT' });
      if (saveGeneration !== generation.current) return;
      setBook(metadata.data); setConflict(false);
      const isSameDraft = currentDraft.current === snapshot;
      const canonical = { ...snapshot, revision: result.data.revision, chapters: result.data.chapters.map(({ id: chapterId, title, body, kind }) => ({ id: chapterId, title, body, kind })), references: result.data.references };
      if (isSameDraft) {
        setDraft(canonical); setDirty(false); await studioDrafts.clear(draftKey).catch(() => {});
        setStatus('All chapters and references saved');
      } else {
        const newer = { ...currentDraft.current, revision: result.data.revision };
        setDraft(newer); await studioDrafts.write(draftKey, newer).catch(() => {});
        setStatus('Saved. Newer edits remain in your device draft.');
      }
    } catch (cause) {
      if (saveGeneration !== generation.current) return;
      if (cause instanceof ApiClientError && cause.status === 409) {
        setConflict(true); setError('This book changed elsewhere. Your device draft is safe; export it before loading the latest version.');
      } else setError(message(cause));
      setStatus('Changes have not all reached the server');
    } finally { if (saveGeneration === generation.current) { savingRef.current = false; setSaving(false); } }
  }
  async function reloadServer() {
    if (!window.confirm('Replace the editor with the latest saved book? Download your draft first if you want to keep these edits.')) return;
    try {
      const [result, metadata] = await Promise.all([api.get<{ data: BookContent }>(`/books/${id}/content`), api.get<{ data: LibraryBook }>(`/books/${id}`)]);
      setDraft(value => ({ ...value, chapters: result.data.chapters, references: result.data.references, revision: result.data.revision, title: metadata.data.title, author: metadata.data.author ?? '' }));
      setSelectedId(result.data.chapters[0]?.id ?? ''); setBook(metadata.data); setDirty(false); setConflict(false); setRecovery(null); setError('');
      await studioDrafts.clear(draftKey); setStatus('Latest server version loaded');
    } catch (cause) { setError(message(cause)); }
  }
  function downloadDraft() {
    const refs = draft.references.map((reference, index) => `[${index + 1}] ${reference.label}${reference.author ? `, ${reference.author}` : ''}${reference.url ? ` — ${reference.url}` : ''}${reference.locator ? ` (${reference.locator})` : ''}`).join('\n\n');
    const text = `# ${draft.title}\n\n${draft.author}\n\n` + draft.chapters.map(chapter => `## ${chapter.title}\n\n${chapter.body}`).join('\n\n') + (refs ? `\n\n## References\n\n${refs}` : '');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${draft.title.replace(/[^\p{L}\p{N}\- ]/gu, '').slice(0, 80) || 'book-draft'}.md`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (id === 'new') return <section className={styles.newBook}>
    <Link to="/library" className="button button-quiet">Back to library</Link>
    <div className="page-heading"><p className={styles.eyebrow}>The writing room</p><h1>Make room for your own story.</h1><p>Start with a title. Build your chapters and keep the sources beside your words.</p></div>
    <form className={`panel ${styles.createForm}`} onSubmit={createBook}>
      <label className="field">Book title<input value={newTitle} onChange={event => setNewTitle(event.target.value)} maxLength={500} required autoFocus autoComplete="off" placeholder="Your next book" /></label>
      <label className="field">Author<input value={newAuthor} onChange={event => setNewAuthor(event.target.value)} maxLength={300} autoComplete="name" placeholder="Your name or pen name" /></label>
      <label className="field">Language<select value={newLanguage} onChange={event => setNewLanguage(event.target.value)}>{languageCodes.map(code => <option key={code} value={code}>{languageLabels[code] ?? code}</option>)}</select></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className="button button-primary" disabled={saving || !newTitle.trim()}>{saving ? 'Creating…' : 'Create book'}</button>
    </form>
  </section>;
  if (loading) return <div className="empty-state" role="status">Opening your writing desk…</div>;
  if (!book) return <div className="empty-state"><h1>Could not open this book</h1><p role="alert">{error}</p><Link className="button" to="/library">Return to library</Link></div>;
  if (!book.isOriginal) return <div className="empty-state"><h1>This is an imported book</h1><p>Keep the original intact. Create your own book in the writing room.</p><Link className="button button-primary" to="/write/new">Start a book</Link><Link className="button" to={`/reader/${id}`}>Read this book</Link></div>;

  return <section className={styles.studio}>
    <header className={styles.header}>
      <div><Link to="/library" className={styles.back}>← Library</Link><p className={styles.eyebrow}>Writing room</p><h1>{book.title}</h1><p className={styles.saveState} role="status">{status || (dirty ? 'Unsaved changes' : 'Your writing is up to date')}</p></div>
      <div className={styles.actions}><Link className="button button-quiet" to={`/reader/${id}`}>Read</Link><button className="button button-primary" onClick={() => void save()} disabled={saving || !!recovery || conflict || !dirty}>{saving ? 'Saving…' : 'Save book'}</button></div>
    </header>
    {recovery && <div className={styles.notice} role="status"><div><strong>A device draft is waiting.</strong><p>Restore it to continue writing, or keep the saved version.</p></div><button className="button" onClick={() => { setDraft(recovery); setSelectedId(recovery.chapters[0]?.id ?? ''); setRecovery(null); setDirty(true); setStatus('Device draft restored'); }}>Restore draft</button><button className="button button-quiet" onClick={() => { setRecovery(null); void studioDrafts.clear(draftKey).catch(() => {}); }}>Keep saved version</button></div>}
    {error && <div className={styles.notice} role="alert"><p>{error}</p>{conflict && <><button className="button" onClick={downloadDraft}>Download device draft</button><button className="button" onClick={() => void reloadServer()}>Load latest version</button></>}</div>}
    <fieldset className={styles.workspace} disabled={!!recovery}>
      <aside className={`panel ${styles.outline}`} aria-label="Book outline">
        <div className={styles.sectionHeading}><h2>Chapters</h2><span>{draft.chapters.length}</span></div>
        <ol className={styles.chapterList}>{draft.chapters.map((chapter, index) => <li key={chapter.id} className={selected?.id === chapter.id ? styles.selectedChapter : ''}><button className={styles.chapterButton} onClick={() => setSelectedId(chapter.id)} aria-current={selected?.id === chapter.id ? 'page' : undefined}><span>{String(index + 1).padStart(2, '0')}</span>{chapter.title || 'Untitled chapter'}</button><div className={styles.orderControls}><button aria-label={`Move ${chapter.title} up`} disabled={index === 0} onClick={() => reorder(index, -1)}>↑</button><button aria-label={`Move ${chapter.title} down`} disabled={index === draft.chapters.length - 1} onClick={() => reorder(index, 1)}>↓</button></div></li>)}</ol>
        <button className="button" disabled={draft.chapters.length >= 300} onClick={() => { const chapter = newChapter(); change({ chapters: [...draft.chapters, chapter] }); setSelectedId(chapter.id); setMode('write'); }}>+ Add chapter</button>
        <button className="button button-quiet" aria-expanded={referencePanel} onClick={() => setReferencePanel(value => !value)}>References · {draft.references.length}</button>
        <div className={styles.goal}><label className="field">Writing goal<input type="number" min={100} max={1000000} step={100} value={draft.goal} onChange={event => { const goal = Math.max(100, Math.min(1000000, Number(event.target.value) || 100)); setDraft(value => ({ ...value, goal })); void studioDrafts.write(`writer-goal:local-user-001:${id}`, goal).catch(() => setStatus('Writing goal could not be saved on this device')); }} /></label><progress value={Math.min(totalWords, draft.goal)} max={draft.goal} aria-label="Words toward writing goal" /><p>{totalWords.toLocaleString()} / {draft.goal.toLocaleString()} words</p></div>
        <details className={styles.exports}><summary>Export your book</summary><button className="button" onClick={downloadDraft}>Download draft Markdown</button>{!dirty && <><a className="button" href={`/api/v1/books/${id}/export?format=epub`} download>Download EPUB</a><a className="button" href={`/api/v1/books/${id}/export?format=markdown`} download>Download saved Markdown</a></>}{dirty && <p>Save the book to export the latest EPUB.</p>}</details>
      </aside>
      <div className={styles.mainColumn}>
        <details className={`panel ${styles.details}`}><summary>Book details</summary><div className={styles.metadata}><label className="field">Title<input value={draft.title} maxLength={500} onChange={event => change({ title: event.target.value })} /></label><label className="field">Author<input value={draft.author} maxLength={300} onChange={event => change({ author: event.target.value })} /></label></div></details>
        {referencePanel && <section className={`panel ${styles.references}`} aria-label="References"><div className={styles.sectionHeading}><h2>Your sources</h2><button className="button" disabled={draft.references.length >= 200} onClick={() => change({ references: [...draft.references, { id: operationId(), label: '', author: '', url: '', locator: '', notes: '' }] })}>+ Add source</button></div><p>Keep the title, link, and page for each source. Insert its numbered citation while writing.</p>{draft.references.map((reference, index) => <fieldset key={reference.id} className={styles.reference}><legend>Source [{index + 1}]</legend>{(['label', 'author', 'url', 'locator', 'notes'] as const).map(field => <label className="field" key={field}>{({label:'Source title',author:'Author / organization',url:'URL',locator:'Page or section',notes:'Research notes'})[field]}<input type={field === 'url' ? 'url' : 'text'} maxLength={field === 'notes' ? 5000 : field === 'url' ? 2000 : field === 'label' ? 500 : 300} value={reference[field]} onChange={event => change({ references: draft.references.map(item => item.id === reference.id ? { ...item, [field]: event.target.value } : item) })} /></label>)}<div className={styles.actions}><button className="button" onClick={() => { setMode('write'); insert(` [${index + 1}]`); }}>Insert [{index + 1}]</button><button className="button button-quiet" onClick={() => { if (window.confirm('Remove this source? Existing citation numbers in your writing will need checking.')) change({ references: draft.references.filter(item => item.id !== reference.id) }); }}>Remove source</button></div></fieldset>)}{draft.references.length === 0 && <p>No references yet. Add a source when an idea needs a citation.</p>}</section>}
        {selected ? <article className={`panel ${styles.editor}`}>
          <div className={styles.editorTop}><label className="field">Chapter title<input value={selected.title} maxLength={500} onChange={event => editChapter({ title: event.target.value })} /></label><label className="field">Section type<select value={selected.kind} onChange={event => editChapter({ kind: event.target.value as DraftChapter['kind'] })}><option value="body">Main text</option><option value="glossary">Glossary</option><option value="frontmatter">Front matter</option></select></label></div>
          <div className={styles.editorTabs}><label>Editor view <select value={mode} onChange={event => setMode(event.target.value as 'write' | 'preview')}><option value="write">Write</option><option value="preview">Preview</option></select></label><span>{wordCount(selected.body).toLocaleString()} words</span></div>
          {mode === 'write' ? <><div className={styles.toolbar} role="group" aria-label="Markdown formatting"><button onClick={() => insert('**', '**', 'bold text')} aria-label="Bold"><strong>B</strong></button><button onClick={() => insert('*', '*', 'italic text')} aria-label="Italic"><em>I</em></button><button onClick={() => insert('\n## ', '\n', 'Heading')}>Heading</button><button onClick={() => insert('\n- ', '\n', 'List item')}>List</button><button onClick={() => insert('\n> ', '\n', 'Quotation')}>Quote</button><button onClick={() => insert('\n| Column | Column |\n| --- | --- |\n| Value | Value |\n')}>Table</button><button onClick={() => setReferencePanel(true)}>Cite source</button></div><label className="sr-only" htmlFor="chapter-body">Chapter text in Markdown</label><textarea id="chapter-body" ref={textarea} className={styles.bodyInput} value={selected.body} onChange={event => editChapter({ body: event.target.value })} maxLength={300000} spellCheck placeholder="Begin with the idea you keep coming back to…" /></> : <div className={styles.preview}><h2>{selected.title}</h2><Markdown remarkPlugins={[remarkGfm]}>{selected.body || '*Your chapter preview will appear here.*'}</Markdown>{draft.references.length > 0 && <section className={styles.bibliography}><h3>References</h3><ol>{draft.references.map(reference => <li key={reference.id}>{reference.label}{reference.author && `. ${reference.author}`}{reference.locator && `. ${reference.locator}`}{reference.url && /^https?:\/\//i.test(reference.url) && <>. <a href={reference.url} rel="noopener noreferrer" target="_blank">Source</a></>}</li>)}</ol></section>}</div>}
          <footer className={styles.editorFooter}><span>Markdown · saved locally while you write</span><button className="button button-quiet" disabled={draft.chapters.length <= 1} onClick={() => { if (window.confirm(`Remove “${selected.title}” and its text from this draft?`)) { const remaining = draft.chapters.filter(chapter => chapter.id !== selected.id); change({ chapters: remaining }); setSelectedId(remaining[0]?.id ?? ''); } }}>Remove chapter</button></footer>
        </article> : <div className="empty-state"><p>Add a chapter to begin.</p><button className="button" onClick={() => { const chapter = newChapter(); change({ chapters: [chapter] }); setSelectedId(chapter.id); }}>Add chapter</button></div>}
      </div>
    </fieldset>
  </section>;
}

import React, { useEffect, useId, useRef, useState } from 'react';
import type { ApiResponse, LibraryBook, PageNote } from '@wisper-lib/shared-types';
import { api, ApiClientError } from '@/lib/apiClient';
import { operationId } from '@/lib/uuid';
import { noteDrafts, type NoteFormDraft } from './noteDrafts';
import styles from './NoteComposer.module.css';

interface NoteContext {
  bookId?: string | null; chapterId?: string | null; location?: string | null; selectedText?: string;
}
interface Props {
  draftKey: string; note?: PageNote; context?: NoteContext; books?: LibraryBook[];
  onSaved(note: PageNote): void; onCancel?(): void;
}

/** Page notes and standalone notes use the same revision-aware, recoverable editor. */
export default function NoteComposer({ draftKey, note, context, books, onSaved, onCancel }: Props): React.ReactElement {
  const id = useId();
  const [form, setForm] = useState<NoteFormDraft>(() => ({
    title: note?.title ?? '', body: note?.body ?? '', tags: note?.tags.join(', ') ?? '',
    bookId: note?.bookId ?? context?.bookId ?? '', chapterId: note?.chapterId ?? context?.chapterId ?? null,
    location: note?.location ?? context?.location ?? null, selectedText: note?.selectedText ?? context?.selectedText ?? '',
    operationId: operationId(), savedAt: Date.now(), baseRevision: note?.revision ?? null,
  }));
  const [revision, setRevision] = useState(note?.revision ?? 0);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<PageNote | null>(null);
  const [conflicted, setConflicted] = useState(false);
  const generation = useRef(0);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    let active = true;
    const start = generation.current;
    void noteDrafts.read(draftKey).then(draft => {
      if (!active) return;
      if (draft && generation.current === start) {
        setForm(draft); setStatus('Recovered your saved draft.');
        if (note && draft.baseRevision !== note.revision) {
          setConflicted(true); setLatest(note);
          setError('Your recovered draft was based on an earlier saved version. Compare both before saving again.');
        }
      }
      setHydrated(true);
    }).catch(() => { if (active) { setHydrated(true); setStatus('Local draft storage is unavailable. Keep this page open until you save.'); } });
    return () => { active = false; };
  }, [draftKey]);

  useEffect(() => {
    if (context?.selectedText && !note) {
      setForm(previous => ({ ...previous, selectedText: context.selectedText! }));
    }
  }, [context?.selectedText, note]);

  function change(patch: Partial<NoteFormDraft>) {
    generation.current++;
    const next = { ...formRef.current, ...patch, savedAt: Date.now() };
    formRef.current = next;
    setForm(next);
    if (hydrated) void noteDrafts.write(draftKey, next).catch(() => setStatus('Could not save a local draft. Save to the library before leaving.'));
    if (!conflicted) setError('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.body.trim() || saving || conflicted) return;
    setSaving(true); setError(''); setStatus('Saving…');
    const snapshot = { ...form };
    const tags = [...new Set(form.tags.split(',').map(tag => tag.trim()).filter(Boolean))].slice(0, 20);
    const payload = {
      title: form.title, body: form.body, tags, bookId: form.bookId || null,
      chapterId: form.chapterId, location: form.location, selectedText: form.selectedText,
    };
    try {
      const response = note
        ? await api.patch<ApiResponse<PageNote>>(`/notes/${note.id}`, { ...payload, revision })
        : await api.post<ApiResponse<PageNote>>('/notes', { ...payload, clientOperationId: form.operationId });
      setRevision(response.data.revision);
      if (formRef.current.body === snapshot.body && formRef.current.title === snapshot.title && formRef.current.tags === snapshot.tags && formRef.current.bookId === snapshot.bookId && formRef.current.selectedText === snapshot.selectedText) {
        await noteDrafts.clear(draftKey).catch(() => {});
      }
      setStatus('Saved to your library.');
      onSaved(response.data);
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 409 && note) {
        setConflicted(true);
        setError('This note changed elsewhere. Your draft is safe. Compare the saved version before saving again.');
        try { setLatest((await api.get<ApiResponse<PageNote>>(`/notes/${note.id}`)).data); } catch { /* A separate retry remains available. */ }
      } else {
        setError(reason instanceof Error ? reason.message : 'Could not save this note. Your draft remains on this device.');
      }
      setStatus('Draft kept on this device.');
    } finally { setSaving(false); }
  }

  return (
    <form className={styles.composer} onSubmit={save} aria-label={note ? 'Edit note' : 'Write a note'}>
      {!context?.bookId && books && <label className="field" htmlFor={`${id}-book`}>Attach to a book
        <select id={`${id}-book`} value={form.bookId} disabled={saving} onChange={event => change({ bookId: event.target.value, chapterId: null, location: null, selectedText: '' })}>
          <option value="">Standalone note</option>
          {form.bookId && !books.some(book => book.id === form.bookId) && <option value={form.bookId}>{note?.bookTitle ?? 'Attached book'}</option>}
          {books.map(book => <option value={book.id} key={book.id}>{book.title}</option>)}
        </select>
      </label>}
      {form.selectedText && <blockquote className={styles.quote}>{form.selectedText}<button type="button" className="button-quiet" onClick={() => change({ selectedText: '' })} disabled={saving}>Remove quote</button></blockquote>}
      <label className="field" htmlFor={`${id}-title`}>Title <span className={styles.optional}>(optional)</span>
        <input id={`${id}-title`} maxLength={500} value={form.title} disabled={!hydrated || saving} onChange={event => change({ title: event.target.value })} placeholder="A thought to return to" autoComplete="off" />
      </label>
      <label className="field" htmlFor={`${id}-body`}>Your note
        <textarea id={`${id}-body`} rows={7} maxLength={100000} required value={form.body} disabled={!hydrated || saving} onChange={event => change({ body: event.target.value })} placeholder="What would you like to remember?" />
      </label>
      <label className="field" htmlFor={`${id}-tags`}>Tags <span className={styles.optional}>(comma separated)</span>
        <input id={`${id}-tags`} value={form.tags} disabled={!hydrated || saving} onChange={event => change({ tags: event.target.value })} placeholder="ideas, wishlist, research" autoComplete="off" />
      </label>
      {conflicted && <section className={styles.conflict} aria-label="Note conflict">
        {latest ? <><h4>Saved version</h4><p>{latest.body}</p>
          <button className="button" type="button" onClick={() => { setRevision(latest.revision); change({ baseRevision: latest.revision }); setConflicted(false); setError(''); setStatus('Your draft is ready to save over the reviewed version.'); }}>Keep my draft with this revision</button>
          <button className="button-quiet" type="button" onClick={() => { setRevision(latest.revision); change({ title: latest.title ?? '', body: latest.body, tags: latest.tags.join(', '), baseRevision: latest.revision }); setConflicted(false); setError(''); setLatest(null); }}>Use saved version</button>
        </> : <button className="button" type="button" onClick={() => { if (note) void api.get<ApiResponse<PageNote>>(`/notes/${note.id}`).then(response => setLatest(response.data)).catch(() => setError('Saved version could not be loaded. Check your connection and retry.')); }}>Load saved version</button>}
      </section>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        <button className="button button-primary" disabled={!hydrated || saving || conflicted || !form.body.trim()} type="submit">{saving ? 'Saving…' : note ? 'Save changes' : 'Save note'}</button>
        {onCancel && <button type="button" className="button-quiet" onClick={onCancel} disabled={saving}>Close</button>}
      </div>
      <p className={styles.status} role="status">{status || 'Drafts stay on this device until you save.'}</p>
    </form>
  );
}

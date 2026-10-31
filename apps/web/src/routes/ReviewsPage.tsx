import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ReviewInputSchema, type LibraryBook, type PageNote, type PersonalReview } from '@wisper-lib/shared-types';
import { api } from '@/lib/apiClient';
import { renderReviewPoster, reviewCaption, type PosterContent, type PosterTheme } from '@/lib/reviewPoster';
import { studioDrafts } from '@/lib/studioDrafts';
import styles from './ReviewsPage.module.css';

interface ReviewDraft {
  title: string; body: string; rating: number; bookId: string | null; sourceNoteId: string | null;
  theme: PosterTheme; caption: string; customCaption: boolean;
}
const blank = (): ReviewDraft => ({ title: '', body: '', rating: 5, bookId: null, sourceNoteId: null, theme: 'midnight', caption: '', customCaption: false });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

/** Personal reviews with a downloadable poster and a user-controlled sharing flow. */
export default function ReviewsPage(): React.ReactElement {
  const [params] = useSearchParams();
  const noteId = params.get('noteId');
  const sourceBookId = params.get('bookId');
  const [reviews, setReviews] = useState<PersonalReview[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [draft, setDraft] = useState<ReviewDraft>(blank);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [key, setKey] = useState('review:local-user-001:new');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [recovery, setRecovery] = useState<ReviewDraft | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [renderedPosterKey, setRenderedPosterKey] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [posterError, setPosterError] = useState('');
  const blob = useRef<Blob | null>(null);
  const previewUrl = useRef('');
  const captionField = useRef<HTMLTextAreaElement>(null);
  const requestVersion = useRef(0);
  const selectedBook = books.find(book => book.id === draft.bookId);

  async function loadReviews(after?: string) {
    const response = await api.get<{ data: PersonalReview[]; meta?: { nextCursor?: string | null } }>(`/reviews?limit=30${after ? `&after=${encodeURIComponent(after)}` : ''}`);
    setReviews(current => after ? [...current, ...response.data.filter(review => !current.some(item => item.id === review.id))] : response.data);
    setNextCursor(response.meta?.nextCursor ?? null);
  }

  useEffect(() => {
    let live = true;
    const version = ++requestVersion.current;
    setLoading(true); setError(''); setStatus(''); setDirty(false); setRecovery(null); setActiveId(null);
    const currentKey = `review:local-user-001:${noteId ? `note:${noteId}` : sourceBookId ? `book:${sourceBookId}` : 'new'}`;
    setKey(currentKey);
    void Promise.all([
      api.get<{ data: PersonalReview[]; meta?: { nextCursor?: string | null } }>('/reviews?limit=30'),
      api.get<{ data: LibraryBook[] }>('/books?limit=100'),
      noteId ? api.get<{ data: PageNote }>(`/notes/${encodeURIComponent(noteId)}`) : Promise.resolve(null),
      studioDrafts.read<ReviewDraft>(currentKey).catch(() => null),
    ]).then(async ([reviewResult, bookResult, noteResult, localDraft]) => {
      if (!live || version !== requestVersion.current) return;
      const note = noteResult?.data;
      const chosenId = note?.bookId ?? sourceBookId;
      let allBooks = bookResult.data;
      if (chosenId && !allBooks.some(book => book.id === chosenId)) {
        try { const result = await api.get<{ data: LibraryBook }>(`/books/${encodeURIComponent(chosenId)}`); allBooks = [...allBooks, result.data]; } catch { /* A deleted source remains a standalone note. */ }
      }
      if (!live || version !== requestVersion.current) return;
      const chosen = allBooks.find(book => book.id === chosenId);
      const initial: ReviewDraft = { ...blank(), bookId: chosen?.id ?? null, sourceNoteId: note?.id ?? null, title: note?.title || '', body: note?.body || '' };
      initial.caption = reviewCaption({ ...initial, bookTitle: chosen?.title ?? '', author: chosen?.author ?? '' });
      setBooks(allBooks); setReviews(reviewResult.data); setNextCursor(reviewResult.meta?.nextCursor ?? null); setDraft(initial);
      setDirty(Boolean(note?.body));
      if (localDraft) setRecovery(localDraft);
    }).catch(cause => { if (live && version === requestVersion.current) setError(errorMessage(cause)); }).finally(() => { if (live && version === requestVersion.current) setLoading(false); });
    return () => { live = false; };
  }, [noteId, sourceBookId]);

  useEffect(() => {
    if (loading || !dirty || recovery) return;
    let live = true;
    void studioDrafts.write(key, draft).catch(() => { if (live) setStatus('Device recovery is unavailable. Save your review before leaving.'); });
    return () => { live = false; };
  }, [draft, key, loading, dirty, recovery]);

  const posterContent = useMemo<PosterContent>(() => ({ title: draft.title, body: draft.body, rating: draft.rating, theme: draft.theme, bookTitle: selectedBook?.title ?? '', author: selectedBook?.author ?? '' }), [draft.title, draft.body, draft.rating, draft.theme, selectedBook?.title, selectedBook?.author]);
  const posterKey = JSON.stringify(posterContent);
  const posterReady = !!posterUrl && renderedPosterKey === posterKey;
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      void renderReviewPoster(posterContent).then(result => {
        if (!live) return;
        const url = URL.createObjectURL(result.blob);
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url; blob.current = result.blob; setPosterUrl(url); setRenderedPosterKey(JSON.stringify(posterContent)); setTruncated(result.truncated); setPosterError('');
      }).catch(cause => { if (live) { setPosterError(errorMessage(cause)); blob.current = null; } });
    }, 180);
    return () => { live = false; window.clearTimeout(timer); };
  }, [posterContent]);
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  function update(value: Partial<ReviewDraft>) {
    setDraft(current => {
      const next = { ...current, ...value };
      if (!next.customCaption && !Object.prototype.hasOwnProperty.call(value, 'caption')) {
        const book = books.find(item => item.id === next.bookId);
        next.caption = reviewCaption({ ...next, bookTitle: book?.title ?? '', author: book?.author ?? '' });
      }
      return next;
    });
    setDirty(true); setError(''); setStatus('');
  }
  async function openReview(review: PersonalReview) {
    if (saving) return;
    const version = ++requestVersion.current;
    const newKey = `review:local-user-001:${review.id}`;
    setLoading(true); setError(''); setStatus('');
    try {
      let knownBooks = books;
      if (review.bookId && !knownBooks.some(book => book.id === review.bookId)) {
        const result = await api.get<{ data: LibraryBook }>(`/books/${review.bookId}`);
        knownBooks = [...knownBooks, result.data];
      }
      const local = await studioDrafts.read<ReviewDraft>(newKey).catch(() => null);
      if (version !== requestVersion.current) return;
      setBooks(knownBooks); setActiveId(review.id); setKey(newKey); setDirty(false); setRecovery(local);
      const value: ReviewDraft = { title: review.title, body: review.body, rating: review.rating, theme: review.theme, bookId: review.bookId, sourceNoteId: review.sourceNoteId, customCaption: Boolean(review.caption), caption: review.caption || '' };
      value.caption = review.caption || reviewCaption({ ...value, bookTitle: review.bookTitle ?? '', author: review.author ?? '' });
      setDraft(value);
    } catch (cause) { setError(errorMessage(cause)); } finally { if (version === requestVersion.current) setLoading(false); }
  }
  async function newReview() {
    if (saving) return;
    const version = ++requestVersion.current;
    const newKey = 'review:local-user-001:new';
    setLoading(true);
    const local = await studioDrafts.read<ReviewDraft>(newKey).catch(() => null);
    if (version !== requestVersion.current) return;
    setKey(newKey); setActiveId(null); setDraft(blank()); setDirty(false); setRecovery(local); setLoading(false); setError(''); setStatus('');
  }
  async function saveReview(event: React.FormEvent) {
    event.preventDefault(); if (saving || recovery) return;
    const parsed = ReviewInputSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check your review.'); return; }
    const version = requestVersion.current;
    setSaving(true); setError('');
    try {
      const result = activeId ? await api.patch<{ data: PersonalReview }>(`/reviews/${activeId}`, parsed.data) : await api.post<{ data: PersonalReview }>('/reviews', parsed.data);
      if (version !== requestVersion.current) return;
      await studioDrafts.clear(key).catch(() => {});
      setActiveId(result.data.id); setKey(`review:local-user-001:${result.data.id}`); setDirty(false); setStatus('Review saved to your personal collection');
      await loadReviews();
    } catch (cause) { setError(errorMessage(cause)); } finally { setSaving(false); }
  }
  async function removeReview() {
    if (!activeId || !window.confirm('Delete this saved review? Any downloaded poster will stay on your device.')) return;
    setSaving(true); setError('');
    try { await api.delete(`/reviews/${activeId}`); await studioDrafts.clear(key).catch(() => {}); setActiveId(null); setKey('review:local-user-001:new'); setDraft(blank()); setDirty(false); setStatus('Review deleted'); await loadReviews(); } catch (cause) { setError(errorMessage(cause)); } finally { setSaving(false); }
  }
  function downloadPoster() {
    if (!posterReady || !draft.body.trim()) return;
    const anchor = document.createElement('a'); anchor.href = posterUrl; anchor.download = `${(draft.title || selectedBook?.title || 'book-review').replace(/[^\p{L}\p{N}\- ]/gu, '').slice(0, 80)}.png`; anchor.click(); setStatus('Poster downloaded. Add it to your post with the caption below.');
  }
  async function sharePoster() {
    if (!posterReady || !blob.current || !draft.body.trim()) return;
    const file = new File([blob.current], 'book-review.png', { type: 'image/png' });
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) { setStatus('File sharing is unavailable here. Download the PNG and copy the caption, then choose it in Instagram or another app.'); return; }
    try { await navigator.share({ files: [file], title: draft.title || selectedBook?.title || 'Book review', text: draft.caption }); setStatus('Sharing dialog closed. Your review is still saved here.'); } catch (cause) { if (cause instanceof DOMException && cause.name === 'AbortError') setStatus('Sharing cancelled'); else setStatus('The selected app could not accept this share. Download the PNG and copy your caption instead.'); }
  }
  async function copyCaption() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(draft.caption);
      else { captionField.current?.focus(); captionField.current?.select(); if (!document.execCommand('copy')) throw new Error('Clipboard unavailable'); }
      setStatus('Caption copied');
    } catch { captionField.current?.focus(); captionField.current?.select(); setStatus('Select and copy the highlighted caption using your device’s copy command.'); }
  }

  return <section className={styles.page}>
    <header className={styles.heading}><div className="page-heading"><p className={styles.eyebrow}>Your reading, in your words</p><h1>Personal reviews</h1><p>Turn a thought from your notebook into something worth keeping or sharing.</p></div><button className="button" onClick={() => void newReview()} disabled={saving}>+ New review</button></header>
    {error && <div className={styles.notice} role="alert">{error}<button className="button button-quiet" onClick={() => void loadReviews().then(() => setError('')).catch(cause => setError(errorMessage(cause)))}>Retry loading reviews</button></div>}
    {status && <p className={styles.status} role="status">{status}</p>}
    {recovery && <div className={styles.notice} role="status"><div><strong>A review draft is saved on this device.</strong><p>Restore your text and edited caption, or keep the saved version.</p></div><button className="button" onClick={() => { setDraft(recovery); setRecovery(null); setDirty(true); }}>Restore draft</button><button className="button button-quiet" onClick={() => { setRecovery(null); void studioDrafts.clear(key).catch(() => {}); }}>Keep saved version</button></div>}
    <div className={styles.layout}>
      <div className={styles.composerColumn}>
        <form className={`panel ${styles.form}`} onSubmit={event => void saveReview(event)}>
          <div className={styles.sectionTitle}><h2>{activeId ? 'Edit review' : noteId && draft.sourceNoteId ? 'From your notebook' : 'A new impression'}</h2><span>{dirty ? 'Device draft' : activeId ? 'Saved review' : 'Private until you share'}</span></div>
          {loading ? <div className="empty-state" role="status">Opening your reviews…</div> : <fieldset disabled={saving || !!recovery} className={styles.fields}>
            <label className="field">Book<select value={draft.bookId ?? ''} onChange={event => update({ bookId: event.target.value || null })}><option value="">A standalone reading reflection</option>{books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
            {draft.sourceNoteId && <p className={styles.source}>Started from a personal note. Your original note stays unchanged. <Link to={`/notes?noteId=${draft.sourceNoteId}`}>Open notebook</Link></p>}
            <label className="field">Review title<input maxLength={300} value={draft.title} onChange={event => update({ title: event.target.value })} required placeholder="The idea that stayed with me" /></label>
            <div><span className={styles.label}>Your rating</span><div className={styles.rating} role="group" aria-label="Book rating">{[1, 2, 3, 4, 5].map(value => <button type="button" key={value} aria-label={`${value} out of 5 stars`} aria-pressed={draft.rating === value} className={value <= draft.rating ? styles.filledStar : ''} onClick={() => update({ rating: value })}>★</button>)}<span>{draft.rating}/5</span></div></div>
            <label className="field">Your review<textarea value={draft.body} onChange={event => update({ body: event.target.value })} required rows={8} maxLength={5000} placeholder="What worked for you? What would you tell another reader?" /></label>
            <div className={styles.count}>{draft.body.length.toLocaleString()} / 5,000 characters</div>
            <label className="field">Poster theme<select value={draft.theme} onChange={event => update({ theme: event.target.value as PosterTheme })}><option value="midnight">Midnight</option><option value="parchment">Parchment</option><option value="ember">Ember</option></select></label>
            <div className={styles.actions}><button className="button button-primary" type="submit" disabled={saving || !dirty || !draft.title.trim() || !draft.body.trim()}>{saving ? 'Saving…' : 'Save personal review'}</button>{activeId && <button className="button button-quiet" type="button" onClick={() => void removeReview()}>Delete review</button>}</div>
          </fieldset>}
        </form>
        <section className={`panel ${styles.caption}`} aria-label="Social caption"><div className={styles.sectionTitle}><h2>Your caption</h2><button className="button button-quiet" disabled={loading || saving} onClick={() => update({ caption: reviewCaption(posterContent), customCaption: false })}>Draft from review</button></div><p>Edit this before sharing. Nothing is posted automatically.</p><label className="sr-only" htmlFor="review-caption">Social post caption</label><textarea id="review-caption" ref={captionField} rows={7} maxLength={8000} value={draft.caption} disabled={loading || saving || !!recovery} onChange={event => update({ caption: event.target.value, customCaption: true })} /><button className="button" disabled={!draft.caption || loading} onClick={() => void copyCaption()}>Copy caption</button></section>
      </div>
      <aside className={styles.posterColumn} aria-label="Review poster preview">
        <div className={styles.posterHeader}><span>Poster preview</span><span>1080 × 1350 · PNG</span></div>
        {posterUrl ? <img src={posterUrl} alt={`Poster preview of ${draft.title || 'your book review'}`} className={styles.poster} width={1080} height={1350} /> : <div className={`panel ${styles.posterPlaceholder}`} role="status">Preparing poster…</div>}
        {posterUrl && !posterReady && <p className={styles.sharingHint} role="status">Updating poster…</p>}
        {posterError && <p className={styles.posterWarning} role="alert">{posterError}</p>}
        {truncated && <p className={styles.posterWarning}>The poster shortens long text to keep it readable. Your full review remains in the caption and saved review.</p>}
        <div className={styles.shareActions}><button className="button button-primary" disabled={!posterReady || !draft.body.trim() || loading} onClick={downloadPoster}>Download poster</button><button className="button" disabled={!posterReady || !draft.body.trim() || loading} onClick={() => void sharePoster()}>Share…</button></div>
        <p className={styles.sharingHint}>Choose Instagram or another app in your device's share sheet when supported. Otherwise upload the downloaded poster and paste your caption.</p>
      </aside>
    </div>
    <section className={styles.savedReviews} aria-label="Saved personal reviews"><div className={styles.sectionTitle}><h2>Your review collection</h2><span>{reviews.length} loaded</span></div>{reviews.length ? <div className={styles.reviewList}>{reviews.map((review, index) => <button key={review.id} className={`panel ${styles.reviewCard} ${activeId === review.id ? styles.activeReview : ''}`} onClick={() => void openReview(review)} onKeyDown={event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; const cards = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(`.${styles.reviewCard}`) ?? []); const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + cards.length) % cards.length; if (cards.length > 1) { event.preventDefault(); cards[nextIndex].focus(); void openReview(reviews[nextIndex]); } }} disabled={saving} aria-pressed={activeId === review.id}><div className={styles.reviewTop}><span>{review.bookTitle || 'Reading reflection'}</span><span>{review.rating}/5</span></div><h3>{review.title}</h3><p>{review.body}</p><span className={styles.reviewDate}>{new Date(review.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></button>)}</div> : !loading && <div className="empty-state"><p>Your private review collection is ready for its first thought.</p></div>}{nextCursor && <button className="button" onClick={() => void loadReviews(nextCursor).catch(cause => setError(errorMessage(cause)))}>Load more reviews</button>}</section>
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LibraryBook, SpeechLanguage, WhisperPreview } from '@wisper-lib/shared-types';
import { api } from '@/lib/apiClient';

type Envelope<T> = { data: T };

export default function PreviewPlayer({ book }: { book: LibraryBook }) {
  const [language, setLanguage] = useState(book.language || 'en-US');
  const [automatic, setAutomatic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<WhisperPreview | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const pending = useRef<AbortController | null>(null);
  const activeBook = useRef(book.id);
  const generation = useRef(0);
  const [volume, setVolume] = useState(0.55);
  const languages = useQuery({ queryKey: ['speech-languages'], queryFn: () => api.get<Envelope<SpeechLanguage[]>>('/speech/languages'), staleTime: Infinity });
  const preview = useQuery({ queryKey: ['preview', book.id, language, book.lastLocation], queryFn: ({ signal }) => api.get<Envelope<WhisperPreview>>(`/books/${book.id}/preview?language=${language}`, { signal }) });

  function stop() {
    generation.current += 1;
    pending.current?.abort();
    pending.current = null;
    if (audio.current) { audio.current.pause(); audio.current = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(false); setBusy(false);
  }
  async function listen() {
    if (!preview.data?.data.transcript) { setMessage('Wait for a readable preview before listening.'); return; }
    stop();
    const currentGeneration = generation.current;
    const id = book.id;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage('');
    try {
      const response = await api.post<Envelope<WhisperPreview>>(`/books/${id}/whisper`, { language, consent: true, transcript: preview.data.data.transcript }, { signal: controller.signal });
      if (controller.signal.aborted || activeBook.current !== id || generation.current !== currentGeneration) return;
      setResult(response.data);
      if (!response.data.audioUrl) { setMessage(response.data.message || 'Polly is unavailable. You can read the transcript or choose a device voice.'); return; }
      const player = new Audio(response.data.audioUrl); audio.current = player; player.volume = volume;
      player.onended = () => setPlaying(false);
      player.onerror = () => { setPlaying(false); setMessage('Audio could not be loaded. The transcript is still available.'); };
      await player.play();
      if (generation.current !== currentGeneration) { player.pause(); return; }
      setPlaying(true);
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Preview unavailable. Try again.');
    } finally { if (generation.current === currentGeneration) setBusy(false); }
  }
  useEffect(() => {
    activeBook.current = book.id;
    setResult(null); setMessage(''); stop();
    if (automatic && preview.data?.data.transcript) void listen();
    return () => { generation.current += 1; pending.current?.abort(); audio.current?.pause(); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
    // A book/language switch replaces the current preview; no sound until explicitly enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, language, automatic, preview.data?.data.transcript]);
  useEffect(() => { if ('speechSynthesis' in window) window.speechSynthesis.getVoices(); }, []);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);
  const current = result || preview.data?.data;
  function deviceVoice() {
    stop();
    if (!current?.transcript || !('speechSynthesis' in window)) { setMessage('This browser has no device speech. The transcript is available below.'); return; }
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(item => item.lang.toLowerCase() === language.toLowerCase()) || voices.find(item => item.lang.split('-')[0] === language.split('-')[0]);
    if (!voice) { setMessage('No matching device voice is installed for this language. Try another language or use Polly.'); return; }
    const utterance = new SpeechSynthesisUtterance(current.transcript);
    utterance.voice = voice; utterance.lang = language; utterance.rate = 0.88; utterance.pitch = 0.72; utterance.volume = volume;
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => { setPlaying(false); setMessage('Device speech was interrupted.'); };
    window.speechSynthesis.speak(utterance); setPlaying(true); setMessage('Playing with your device voice. This is not the Polly whisper effect.');
  }
  return <section className="preview-player" aria-label="Book audio preview">
    <div className="player-row"><div className="player-mark" aria-hidden="true">♫</div><div><strong>A little whisper</strong><p>{current?.source === 'last-location' ? 'From where you left off' : current?.source === 'glossary' ? 'From the glossary' : 'A passage from inside'}</p></div>
      <button className="button button-primary" onClick={() => { if (playing || busy) stop(); else void listen(); }} disabled={(!preview.data?.data.transcript || preview.isPending) && !playing && !busy} aria-label={playing || busy ? 'Stop preview' : 'Listen to book preview'}>{busy ? 'Cancel' : playing ? 'Stop' : 'Listen'}</button>
    </div>
    <div className="player-settings"><label>Voice language<select aria-label="Preview voice language" value={language} onChange={event => { setResult(null); setLanguage(event.target.value); }}>{(languages.data?.data || [{ code: 'en-US', label: 'English (US)', voice: 'Joanna' }]).map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label>Volume<input aria-label="Preview volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))} /></label></div>
    <label className="check-row"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} /> Preview sound when I switch books</label>
    <p className="fine-print">Listening sends only this short passage to Amazon Polly when configured. Voice selection does not translate the book.</p>
    <details className="preview-transcript"><summary>Read the preview transcript</summary><p>{preview.isPending ? 'Finding a passage…' : current?.transcript || 'No readable passage yet. Add book content or a description.'}</p><button className="button button-quiet" onClick={deviceVoice} disabled={!current?.transcript}>Use a device voice</button></details>
    {(message || preview.error) && <p className="inline-message" role="status">{message || (preview.error as Error).message}</p>}
  </section>;
}

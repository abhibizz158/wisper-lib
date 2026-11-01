import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LibraryBook, WhisperPreview } from '@wisper-lib/shared-types';
import { api } from '@/lib/apiClient';

type Envelope<T> = { data: T };

const LANGUAGES = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Spanish'],
  ['fr-FR', 'French'], ['de-DE', 'German'], ['it-IT', 'Italian'],
  ['pt-BR', 'Portuguese'], ['hi-IN', 'Hindi'], ['ja-JP', 'Japanese'],
];

function savedAutoPreview() {
  try { return localStorage.getItem('whisper-auto-preview') !== 'false'; }
  catch { return true; }
}

export default function PreviewPlayer({ book }: { book: LibraryBook }) {
  const [language, setLanguage] = useState(book.language || 'en-US');
  const [automatic, setAutomatic] = useState(savedAutoPreview);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [volume, setVolume] = useState(0.7);
  const [pitch, setPitch] = useState(0.68);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const preview = useQuery({
    queryKey: ['preview', book.id, language, book.lastLocation],
    queryFn: ({ signal }) => api.get<Envelope<WhisperPreview>>(`/books/${book.id}/preview?language=${language}`, { signal }),
    retry: 1,
    retryDelay: 600,
  });
  const transcript = preview.data?.data.transcript;

  const stop = useCallback(() => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(false);
  }, []);

  const listen = useCallback(() => {
    if (!transcript) { setMessage('Wait for the passage to load before listening.'); return; }
    stop();
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setMessage('This browser does not provide speech playback. The passage is available to read below.');
      return;
    }
    const currentGeneration = generation.current;
    const available = window.speechSynthesis.getVoices();
    const voice = available.find(item => item.voiceURI === voiceURI)
      || available.find(item => item.lang.toLowerCase() === language.toLowerCase())
      || available.find(item => item.lang.split('-')[0] === language.split('-')[0]);
    const utterance = new SpeechSynthesisUtterance(transcript.slice(0, 2800));
    if (voice) utterance.voice = voice;
    utterance.lang = language;
    utterance.rate = 0.86;
    utterance.pitch = pitch;
    utterance.volume = volume;
    utterance.onstart = () => { if (generation.current === currentGeneration) setPlaying(true); };
    utterance.onend = () => { if (generation.current === currentGeneration) setPlaying(false); };
    utterance.onerror = event => {
      if (generation.current !== currentGeneration || event.error === 'canceled' || event.error === 'interrupted') return;
      setPlaying(false);
      setMessage('The browser voice could not read this passage. Try another installed voice.');
    };
    window.speechSynthesis.speak(utterance);
    setMessage(`A quiet ${voice?.name || 'device'} voice is reading this passage.`);
  }, [language, pitch, stop, transcript, voiceURI, volume]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('whisper-auto-preview', String(automatic)); }
    catch { /* The preference still applies for this visit. */ }
  }, [automatic]);

  useEffect(() => {
    stop();
    setMessage('');
    return stop;
  }, [book.id, language, stop]);

  useEffect(() => {
    if (!automatic || !transcript) return;
    setMessage('The whisper is settling in…');
    timer.current = setTimeout(listen, 2500);
    return () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  }, [automatic, book.id, language, listen, transcript]);

  const current = preview.data?.data;
  const fetchError = preview.error;
  const fetchMessage = fetchError instanceof TypeError
    ? 'The passage could not be fetched. Check that the local library server is running, then retry.'
    : fetchError instanceof Error ? fetchError.message : 'The passage could not be loaded.';

  return <section className="preview-player" aria-label="Book audio preview">
    <div className="player-row">
      <div className="player-mark" aria-hidden="true">♫</div>
      <div className="player-copy"><strong>A little whisper</strong><p>{current?.source === 'last-location' ? 'From where you left off' : current?.source === 'glossary' ? 'From the glossary' : 'A passage from inside'}</p></div>
      <button type="button" className="audio-settings-trigger" aria-label="Whisper settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(open => !open)}>⚙</button>
      <button type="button" className="button button-primary" onClick={() => playing ? stop() : listen()} disabled={preview.isPending && !playing} aria-label={playing ? 'Stop preview' : 'Listen to book preview'}>{playing ? 'Stop' : 'Listen'}</button>
    </div>
    {settingsOpen && <div className="player-settings-panel">
      <div className="player-settings">
        <label>Device voice<select aria-label="Installed speech voice" value={voiceURI} onChange={event => setVoiceURI(event.target.value)}>
          <option value="">Match book language</option>{voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
        </select></label>
        <label>Language<select aria-label="Preview language" value={language} onChange={event => setLanguage(event.target.value)}>{LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
        <label>Voice depth<input aria-label="Voice depth" type="range" min="0.45" max="1.2" step="0.05" value={pitch} onChange={event => setPitch(Number(event.target.value))} /></label>
        <label>Volume<input aria-label="Preview volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))} /></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} /> Whisper after I choose a book</label>
      <p className="fine-print">Uses the speech voices already installed in your browser or device. No voice model download or external speech request. A lower voice depth adds a calm, ghostly tone where the selected voice supports it.</p>
    </div>}
    <details className="preview-transcript"><summary>Read the preview transcript</summary><p>{preview.isPending ? 'Finding a passage…' : current?.transcript || 'No readable passage yet. Add book content or a description.'}</p></details>
    {(message || fetchError) && <p className="inline-message" role="status">{message || fetchMessage}{fetchError && <button type="button" className="button button-quiet" onClick={() => void preview.refetch()}>Retry</button>}</p>}
  </section>;
}

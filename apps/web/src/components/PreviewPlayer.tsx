import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BookContent, LibraryBook, WhisperPreview } from '@wisper-lib/shared-types';
import { api } from '@/lib/apiClient';

type Envelope<T> = { data: T };
type ReadLine = { text: string; chapter: string };
type VoiceGender = 'female' | 'male';
type ReadingMode = 'preview' | 'book';

const LANGUAGES = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['es-ES', 'Spanish'],
  ['fr-FR', 'French'], ['de-DE', 'German'], ['it-IT', 'Italian'],
  ['pt-BR', 'Portuguese'], ['hi-IN', 'Hindi'], ['ja-JP', 'Japanese'],
];
const FEMALE_VOICE_HINTS = ['female', 'woman', 'samantha', 'ava', 'jenny', 'aria', 'zira', 'susan', 'victoria', 'karen', 'moira', 'tessa', 'joanna', 'lucia', 'serena', 'allison', 'salli', 'kimberly', 'ivy', 'kendra', 'amy', 'emma', 'sonia', 'libby', 'nicky', 'kate', 'catherine', 'siri female'];
const MALE_VOICE_HINTS = ['male', 'man', 'ryan', 'david', 'guy', 'mark', 'daniel', 'james', 'george', 'thomas', 'fred', 'brian', 'justin', 'matthew', 'oliver', 'rishi', 'joey', 'arthur', 'aaron', 'lee', 'alex'];

function voiceGender(voice: SpeechSynthesisVoice): VoiceGender | null {
  const name = voice.name.toLowerCase();
  if (FEMALE_VOICE_HINTS.some(hint => name.includes(hint))) return 'female';
  if (MALE_VOICE_HINTS.some(hint => name.includes(hint))) return 'male';
  return null;
}

function preferredVoice(voices: SpeechSynthesisVoice[], language: string, gender: VoiceGender, selectedURI: string) {
  if (selectedURI) {
    const chosen = voices.find(voice => voice.voiceURI === selectedURI);
    if (chosen) return chosen;
  }
  const matchingLanguage = voices.filter(voice => voice.lang.toLowerCase() === language.toLowerCase());
  const matchingFamily = voices.filter(voice => voice.lang.split('-')[0] === language.split('-')[0]);
  const genderMatches = (items: SpeechSynthesisVoice[]) => items.find(voice => voiceGender(voice) === gender);
  return genderMatches(matchingLanguage) || genderMatches(matchingFamily) || matchingLanguage[0] || matchingFamily[0] || voices[0];
}

function toReadLines(text: string, chapter: string, wordLimit = 11): ReadLine[] {
  const readable = text
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!readable) return [];
  const sentences = readable.split(/(?<=[.!?。！？])\s+/u);
  const lines: ReadLine[] = [];
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    for (let index = 0; index < words.length; index += wordLimit) {
      const line = words.slice(index, index + wordLimit).join(' ');
      if (line) lines.push({ text: line, chapter });
    }
  }
  return lines;
}

function bookReadLines(content: BookContent): ReadLine[] {
  return content.chapters
    .filter(chapter => chapter.kind !== 'frontmatter')
    .flatMap(chapter => toReadLines(chapter.body, chapter.title));
}

function savedAutoPreview() {
  try { return localStorage.getItem('whisper-auto-preview') !== 'false'; }
  catch { return true; }
}

function savedGender(): VoiceGender {
  try { return localStorage.getItem('whisper-voice-gender') === 'male' ? 'male' : 'female'; }
  catch { return 'female'; }
}

export default function PreviewPlayer({ book }: { book: LibraryBook }) {
  const [language, setLanguage] = useState(book.language || 'en-US');
  const [automatic, setAutomatic] = useState(savedAutoPreview);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [gender, setGender] = useState<VoiceGender>(savedGender);
  const [volume, setVolume] = useState(0.7);
  const [pitch, setPitch] = useState(0.68);
  const [pace, setPace] = useState(0.74);
  const [mode, setMode] = useState<ReadingMode>('preview');
  const [visibleLines, setVisibleLines] = useState<ReadLine[]>([]);
  const [activeLine, setActiveLine] = useState(0);
  const [fullBookRequest, setFullBookRequest] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const playbackLines = useRef<ReadLine[]>([]);
  const readingMode = useRef<ReadingMode>('preview');
  const nextLine = useRef<(index: number, token: number) => void>(() => {});
  const preview = useQuery({
    queryKey: ['preview', book.id, language, book.lastLocation],
    queryFn: ({ signal }) => api.get<Envelope<WhisperPreview>>(`/books/${book.id}/preview?language=${language}`, { signal }),
    retry: 1,
    retryDelay: 600,
  });
  const fullBook = useQuery({
    queryKey: ['book-content', book.id],
    queryFn: ({ signal }) => api.get<Envelope<BookContent>>(`/books/${book.id}/content`, { signal }),
    enabled: fullBookRequest > 0,
    staleTime: 5 * 60 * 1000,
  });
  const current = preview.data?.data;
  const previewLines = useMemo(() => toReadLines(current?.transcript || '', 'Preview'), [current?.transcript]);
  const selectedVoice = useMemo(() => preferredVoice(voices, language, gender, voiceURI), [voices, language, gender, voiceURI]);

  const stop = useCallback(() => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
  }, []);

  nextLine.current = (index, token) => {
    if (generation.current !== token) return;
    const lines = playbackLines.current;
    if (index >= lines.length) {
      setPlaying(false);
      setPaused(false);
      setMessage(readingMode.current === 'book' ? 'You’ve reached the end of this book.' : 'That was the preview.');
      return;
    }
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setPlaying(false);
      setMessage('This browser does not provide speech playback. The transcript is available to read.');
      return;
    }
    const line = lines[index];
    const utterance = new SpeechSynthesisUtterance(line.text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.lang = language;
    utterance.rate = pace;
    utterance.pitch = pitch;
    utterance.volume = volume;
    utterance.onstart = () => { if (generation.current === token) setPlaying(true); };
    utterance.onend = () => {
      if (generation.current !== token) return;
      if (index + 1 >= lines.length) {
        setPlaying(false);
        setPaused(false);
        setMessage(readingMode.current === 'book' ? 'You’ve reached the end of this book.' : 'That was the preview.');
        return;
      }
      const pause = /[.!?。！？]$/.test(line.text) ? 300 : 165;
      timer.current = setTimeout(() => nextLine.current(index + 1, token), pause);
    };
    utterance.onerror = event => {
      if (generation.current !== token || event.error === 'canceled' || event.error === 'interrupted') return;
      setPlaying(false);
      setPaused(false);
      setMessage('The browser voice could not read this line. Try another installed voice.');
    };
    setActiveLine(index);
    setPlaying(true);
    setPaused(false);
    window.speechSynthesis.speak(utterance);
  };

  const startLines = useCallback((lines: ReadLine[], nextMode: ReadingMode) => {
    if (!lines.length) { setMessage('There is no readable text available for this book.'); return; }
    stop();
    const token = generation.current;
    playbackLines.current = lines;
    readingMode.current = nextMode;
    setVisibleLines(lines);
    setMode(nextMode);
    setActiveLine(0);
    setMessage(nextMode === 'book' ? `Reading the book · ${lines.length.toLocaleString()} lines` : 'Reading the selected passage');
    nextLine.current(0, token);
  }, [stop]);

  const startPreview = useCallback(() => startLines(previewLines, 'preview'), [previewLines, startLines]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('whisper-auto-preview', String(automatic));
      localStorage.setItem('whisper-voice-gender', gender);
    } catch { /* These preferences still apply for this visit. */ }
  }, [automatic, gender]);

  useEffect(() => {
    stop();
    setMessage('');
    setMode('preview');
    setActiveLine(0);
    return stop;
  }, [book.id, language, stop]);

  useEffect(() => {
    if (mode !== 'preview' || playing || paused) return;
    setVisibleLines(previewLines);
    setActiveLine(0);
  }, [mode, playing, paused, previewLines]);

  useEffect(() => {
    if (!automatic || !previewLines.length) return;
    setMessage('The whisper is settling in…');
    timer.current = setTimeout(startPreview, 2500);
    return () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  }, [automatic, book.id, language, previewLines, startPreview]);

  useEffect(() => {
    if (!fullBookRequest || fullBook.isPending || fullBook.isError || !fullBook.data) return;
    const lines = bookReadLines(fullBook.data.data);
    if (!lines.length) { setMessage('This edition has no readable chapter text. Open it in the reader to check its source.'); return; }
    startLines(lines, 'book');
  }, [fullBookRequest, fullBook.data, fullBook.isPending, fullBook.isError, startLines]);

  const fetchError = preview.error || fullBook.error;
  const fetchMessage = fetchError instanceof TypeError
    ? 'The passage could not be fetched. Check that the local library server is running, then retry.'
    : fetchError instanceof Error ? fetchError.message : 'The passage could not be loaded.';
  const shownStart = Math.max(0, Math.min(activeLine - 3, visibleLines.length - 7));
  const shownLines = visibleLines.slice(shownStart, shownStart + 7);
  const currentLine = visibleLines[activeLine];

  function changeGender(value: VoiceGender) {
    setGender(value);
    setVoiceURI('');
    setPitch(value === 'female' ? 0.68 : 0.54);
  }

  function togglePlayback() {
    if (playing) { window.speechSynthesis.pause(); setPlaying(false); setPaused(true); return; }
    if (paused) { window.speechSynthesis.resume(); setPlaying(true); setPaused(false); return; }
    if (mode === 'book' && visibleLines.length) startLines(visibleLines, 'book');
    else startPreview();
  }

  return <section className="preview-player" aria-label="Book audio preview">
    <div className="player-row">
      <div className="player-mark" aria-hidden="true">♫</div>
      <div className="player-copy"><strong>A little whisper</strong><p>{current?.source === 'last-location' ? 'From where you left off' : current?.source === 'glossary' ? 'From the glossary' : 'A passage from inside'}</p></div>
      <button type="button" className="audio-settings-trigger" aria-label="Voice settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(open => !open)}>⚙</button>
      <button type="button" className="button button-primary" onClick={togglePlayback} disabled={preview.isPending && mode === 'preview' && !playing && !paused} aria-label={playing ? 'Pause reading' : paused ? 'Resume reading' : mode === 'book' ? 'Read full book' : 'Play preview'}>{playing ? 'Pause' : paused ? 'Resume' : mode === 'book' ? 'Read again' : 'Listen'}</button>
      {(playing || paused) && <button type="button" className="button button-quiet whisper-stop" onClick={() => { stop(); setMessage('Playback stopped.'); }} aria-label="Stop reading">■</button>}
    </div>
    {settingsOpen && <div className="player-settings-panel">
      <div className="voice-gender" role="group" aria-label="Voice presentation">
        <button type="button" className={gender === 'female' ? 'is-active' : ''} aria-pressed={gender === 'female'} onClick={() => changeGender('female')}>Female</button>
        <button type="button" className={gender === 'male' ? 'is-active' : ''} aria-pressed={gender === 'male'} onClick={() => changeGender('male')}>Male</button>
      </div>
      <div className="player-settings">
        <label>Installed voice<select aria-label="Installed speech voice" value={voiceURI} onChange={event => setVoiceURI(event.target.value)}>
          <option value="">Automatic · {gender}</option>{voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
        </select></label>
        <label>Language<select aria-label="Preview language" value={language} onChange={event => setLanguage(event.target.value)}>{LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
        <label>Pace<input aria-label="Reading pace" type="range" min="0.58" max="0.94" step="0.02" value={pace} onChange={event => setPace(Number(event.target.value))} /></label>
        <label>Voice depth<input aria-label="Voice depth" type="range" min="0.4" max="1.05" step="0.05" value={pitch} onChange={event => setPitch(Number(event.target.value))} /></label>
        <label>Volume<input aria-label="Preview volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))} /></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} /> Whisper after I choose a book</label>
      <p className="fine-print">Slow pacing and a lower pitch add a measured, hollow tone. Voices are provided by your device; available voice names and gender options vary by operating system.</p>
    </div>}
    <div className="whisper-lyrics" aria-label={mode === 'book' ? 'Book text with current line highlighted' : 'Preview transcript with current line highlighted'}>
      <div className="lyrics-heading"><span>{mode === 'book' ? 'FULL BOOK' : 'WHISPER PREVIEW'}</span><span>{visibleLines.length ? `${Math.min(activeLine + 1, visibleLines.length).toLocaleString()} / ${visibleLines.length.toLocaleString()}` : 'Preparing passage'}</span></div>
      {currentLine?.chapter && mode === 'book' && <p className="lyrics-chapter">{currentLine.chapter}</p>}
      <div className="lyrics-window" aria-live="off">
        {shownLines.length ? shownLines.map((line, index) => {
          const lineIndex = shownStart + index;
          return <p key={`${lineIndex}-${line.text}`} className={`lyrics-line ${lineIndex === activeLine ? 'is-active' : ''}`} aria-current={lineIndex === activeLine ? 'true' : undefined}>{line.text}</p>;
        }) : <p className="lyrics-placeholder">{preview.isPending ? 'Finding a passage…' : current?.transcript ? 'Preparing the whisper…' : 'No readable passage yet. Add book content or a description.'}</p>}
      </div>
    </div>
    <div className="lyrics-actions">
      <button type="button" className="button button-quiet read-whole-book" onClick={() => { stop(); setMode('book'); setVisibleLines([]); setActiveLine(0); setMessage(fullBook.isPending ? 'Opening the full text…' : 'Preparing the full book…'); setFullBookRequest(value => value + 1); }} disabled={fullBookRequest > 0 && fullBook.isFetching}>{fullBookRequest > 0 && fullBook.isFetching ? 'Opening full book…' : mode === 'book' && playing ? 'Reading full book' : 'Read full book'}</button>
      {message && <span role="status">{message}</span>}
    </div>
    {fetchError && <p className="inline-message" role="status">{fetchMessage}<button type="button" className="button button-quiet" onClick={() => { void preview.refetch(); if (fullBookRequest) void fullBook.refetch(); }}>Retry</button></p>}
  </section>;
}

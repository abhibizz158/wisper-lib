import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LibraryBook, SpeechLanguage, WhisperPreview } from '@wisper-lib/shared-types';
import { api } from '@/lib/apiClient';

type Envelope<T> = { data: T };

export default function PreviewPlayer({ book }: { book: LibraryBook }) {
  const [language, setLanguage] = useState(book.language || 'en-US');
  const [automatic, setAutomatic] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState('');
  const [voiceMode, setVoiceMode] = useState<'local' | 'polly'>(() => { try { return localStorage.getItem('whisper-provider') === 'polly' ? 'polly' : 'local'; } catch { return 'local'; } });
  const [modelProgress, setModelProgress] = useState('');
  const [result, setResult] = useState<WhisperPreview | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const localTts = useRef<import('kokoro-js').KokoroTTS | null>(null);
  const localAudioUrl = useRef('');
  const whisperContext = useRef<AudioContext | null>(null);
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
    if (localAudioUrl.current) { URL.revokeObjectURL(localAudioUrl.current); localAudioUrl.current = ''; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(false); setBusy(false);
  }
  function addRoomTone(player: HTMLAudioElement) {
    if (!('AudioContext' in window)) return;
    try {
      const context = whisperContext.current || (whisperContext.current = new AudioContext());
      const source = context.createMediaElementSource(player);
      const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 3600; filter.Q.value = 0.65;
      const dry = context.createGain(); dry.gain.value = 0.86;
      const wet = context.createGain(); wet.gain.value = 0.14;
      const room = context.createConvolver();
      const length = Math.floor(context.sampleRate * 0.48);
      const impulse = context.createBuffer(2, length, context.sampleRate);
      for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
        const samples = impulse.getChannelData(channel);
        for (let index = 0; index < length; index++) samples[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 4.5);
      }
      room.buffer = impulse;
      source.connect(filter); filter.connect(dry); dry.connect(context.destination); filter.connect(room); room.connect(wet); wet.connect(context.destination);
      void context.resume();
    } catch { /* Unsupported audio routing falls back to the clean local voice. */ }
  }
  async function listen() {
    if (!preview.data?.data.transcript) { setMessage('Wait for a readable preview before listening.'); return; }
    stop();
    const currentGeneration = generation.current;
    const id = book.id;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage('');
    try {
      if (voiceMode === 'local') {
        if (!['en-US', 'en-GB'].includes(language)) {
          deviceVoice();
          return;
        }
        const { KokoroTTS } = await import('kokoro-js');
        if (!localTts.current) localTts.current = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          dtype: 'q8', device: 'wasm', progress_callback: info => {
            if (controller.signal.aborted || generation.current !== currentGeneration) return;
            const progress = 'progress' in info && typeof info.progress === 'number' ? ` ${Math.round(info.progress)}%` : '';
            setModelProgress(info.status === 'progress' ? `Preparing the local voice${progress}…` : 'Loading the local voice…');
          },
        });
        if (controller.signal.aborted || activeBook.current !== id || generation.current !== currentGeneration) return;
        setModelProgress('Finding the right voice…');
        const voice = language === 'en-GB' ? 'bf_isabella' : 'af_bella';
        const audioResult = await localTts.current.generate(preview.data.data.transcript.slice(0, 900), { voice, speed: 0.88 });
        if (controller.signal.aborted || activeBook.current !== id || generation.current !== currentGeneration) return;
        localAudioUrl.current = URL.createObjectURL(audioResult.toBlob());
        const player = new Audio(localAudioUrl.current); audio.current = player; player.volume = volume;
        addRoomTone(player);
        player.onended = () => { setPlaying(false); setModelProgress(''); if (localAudioUrl.current) { URL.revokeObjectURL(localAudioUrl.current); localAudioUrl.current = ''; } };
        player.onerror = () => { setPlaying(false); setModelProgress(''); if (localAudioUrl.current) { URL.revokeObjectURL(localAudioUrl.current); localAudioUrl.current = ''; } setMessage('The local voice could not play this passage.'); };
        await player.play();
        if (generation.current !== currentGeneration) { player.pause(); return; }
        setPlaying(true); setMessage('Local whisper · Kokoro voice · the passage stays on this device.');
        setModelProgress('');
        return;
      }
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
    } finally { if (generation.current === currentGeneration) { setBusy(false); setModelProgress(''); } }
  }
  useEffect(() => {
    activeBook.current = book.id;
    setResult(null); setMessage(''); stop();
    if (automatic && preview.data?.data.transcript) void listen();
    return () => { generation.current += 1; pending.current?.abort(); audio.current?.pause(); if (localAudioUrl.current) URL.revokeObjectURL(localAudioUrl.current); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
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
  function changeVoiceMode(mode: 'local' | 'polly') {
    stop(); setVoiceMode(mode);
    try { localStorage.setItem('whisper-provider', mode); } catch { /* Voice choice still applies for this visit. */ }
  }
  return <section className="preview-player" aria-label="Book audio preview">
    <div className="player-row"><div className="player-mark" aria-hidden="true">♫</div><div className="player-copy"><strong>A little whisper</strong><p>{current?.source === 'last-location' ? 'From where you left off' : current?.source === 'glossary' ? 'From the glossary' : 'A passage from inside'}</p></div>
      <button className="audio-settings-trigger" aria-label="Whisper settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(open => !open)}>⚙</button>
      <button className="button button-primary" onClick={() => { if (playing || busy) stop(); else void listen(); }} disabled={(!preview.data?.data.transcript || preview.isPending) && !playing && !busy} aria-label={playing || busy ? 'Stop preview' : 'Listen to book preview'}>{busy ? 'Preparing…' : playing ? 'Stop' : 'Listen'}</button>
    </div>
    {settingsOpen && <div className="player-settings-panel"><div className="player-settings"><label>Whisper voice<select aria-label="Whisper voice provider" value={voiceMode} onChange={event => changeVoiceMode(event.target.value as 'local' | 'polly')}><option value="local">Free local whisper</option><option value="polly">Amazon Polly</option></select></label><label>Voice language<select aria-label="Preview voice language" value={language} onChange={event => { setResult(null); setLanguage(event.target.value); }}>{(languages.data?.data || [{ code: 'en-US', label: 'English (US)', voice: 'Joanna' }]).map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label>Volume<input aria-label="Preview volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))} /></label></div>
    <label className="check-row"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} /> Preview sound when I switch books</label>
    <p className="fine-print">{voiceMode === 'local' ? 'Kokoro runs on this device. Its model downloads on first use and is cached by your browser. English has the dedicated hollow voice; other languages use your installed device voice.' : 'Amazon Polly receives the selected short passage when configured. Voice selection does not translate the book.'} Voice preview is opt-in.</p></div>}
    {modelProgress && <p className="inline-message" role="status">{modelProgress}</p>}
    <details className="preview-transcript"><summary>Read the preview transcript</summary><p>{preview.isPending ? 'Finding a passage…' : current?.transcript || 'No readable passage yet. Add book content or a description.'}</p><button className="button button-quiet" onClick={deviceVoice} disabled={!current?.transcript}>Use a device voice</button></details>
    {(message || preview.error) && <p className="inline-message" role="status">{message || (preview.error as Error).message}</p>}
  </section>;
}

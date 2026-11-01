import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BookContent, LibraryBook, WhisperPreview } from '@wisper-lib/shared-types';
import { api } from '@/lib/apiClient';

type Envelope<T> = { data: T };
type ReadLine = { text: string; chapter: string };
type VoiceGender = 'female' | 'male';
type ReadingMode = 'preview' | 'book';
type VoiceEngine = 'neural' | 'device';
type KokoroAudio = { audio: Float32Array; sampling_rate: number };
type KokoroVoice = 'af_heart' | 'am_onyx';
type PreparedLineAudio = { token: number; index: number; key: string; audio: Promise<KokoroAudio> };

type WorkerReply =
  | { type: 'progress'; id: number; progress: number }
  | { type: 'ready'; id: number }
  | { type: 'audio'; id: number; audio: ArrayBuffer; samplingRate: number }
  | { type: 'error'; id: number; message: string };
type PendingWorkerRequest = { resolve: (value?: KokoroAudio) => void; reject: (error: Error) => void };

let kokoroWorker: Worker | null = null;
let workerRequestId = 0;
let kokoroPromise: Promise<void> | null = null;
let kokoroLoaded = false;
let kokoroProgress = 0;
let kokoroUnloadTimer: ReturnType<typeof setTimeout> | null = null;
const kokoroProgressListeners = new Set<(progress: number) => void>();
const pendingWorkerRequests = new Map<number, PendingWorkerRequest>();
let sharedAudioContext: AudioContext | null = null;
const roomImpulseCache = new WeakMap<AudioContext, AudioBuffer>();
let previewWarmup: { key: string; audio: Promise<KokoroAudio> } | null = null;

function voiceCacheKey(text: string, gender: VoiceGender, pace: number) {
  return `${gender}:${pace}:${text}`;
}

function canWarmVoiceInBackground() {
  if (typeof navigator === 'undefined') return false;
  const device = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  const memory = device.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency || 2;
  const connection = device.connection;
  return memory >= 4 && cores >= 6 && !connection?.saveData && !/^(slow-)?2g$/i.test(connection?.effectiveType || '');
}

function keepKokoroWarm() {
  if (kokoroUnloadTimer) clearTimeout(kokoroUnloadTimer);
  kokoroUnloadTimer = null;
}

function releaseKokoroAfterIdle() {
  keepKokoroWarm();
  if (!kokoroLoaded || !kokoroWorker) return;
  kokoroUnloadTimer = setTimeout(() => {
    kokoroUnloadTimer = null;
    if (pendingWorkerRequests.size) {
      releaseKokoroAfterIdle();
      return;
    }
    kokoroWorker?.terminate();
    kokoroWorker = null;
    kokoroLoaded = false;
    kokoroProgress = 0;
    kokoroPromise = null;
    previewWarmup = null;
  }, 120_000);
}

function getKokoroWorker() {
  if (!kokoroWorker) {
    const worker = new Worker(new URL('../workers/kokoro.worker.ts', import.meta.url), { type: 'module' });
    kokoroWorker = worker;
    worker.onmessage = event => {
      const reply = event.data as WorkerReply;
      if (reply.type === 'progress') {
        kokoroProgress = reply.progress;
        kokoroProgressListeners.forEach(listener => listener(kokoroProgress));
        return;
      }
      const pending = pendingWorkerRequests.get(reply.id);
      if (!pending) return;
      pendingWorkerRequests.delete(reply.id);
      if (reply.type === 'error') pending.reject(new Error(reply.message));
      else if (reply.type === 'ready') pending.resolve();
      else pending.resolve({ audio: new Float32Array(reply.audio), sampling_rate: reply.samplingRate });
    };
    worker.onerror = event => {
      const error = new Error(event.message || 'The local voice worker stopped unexpectedly.');
      pendingWorkerRequests.forEach(request => request.reject(error));
      pendingWorkerRequests.clear();
      worker.terminate();
      if (kokoroWorker === worker) kokoroWorker = null;
      kokoroPromise = null;
      kokoroLoaded = false;
      kokoroProgress = 0;
    };
  }
  return kokoroWorker;
}

function sendKokoroRequest<T = KokoroAudio | undefined>(request: Record<string, unknown>): Promise<T> {
  const worker = getKokoroWorker();
  const id = ++workerRequestId;
  return new Promise<T>((resolve, reject) => {
    pendingWorkerRequests.set(id, { resolve: value => resolve(value as T), reject });
    try { worker.postMessage({ ...request, id }); }
    catch (error) {
      pendingWorkerRequests.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function loadKokoro(onProgress: (progress: number) => void): Promise<void> {
  kokoroProgressListeners.add(onProgress);
  onProgress(kokoroLoaded ? 100 : kokoroProgress);
  keepKokoroWarm();
  if (!kokoroPromise) {
    kokoroProgress = 0;
    try {
      kokoroPromise = sendKokoroRequest<void>({ type: 'load' }).then(() => {
        kokoroLoaded = true;
        kokoroProgress = 100;
        releaseKokoroAfterIdle();
      }).catch(error => {
        kokoroPromise = null;
        throw error;
      });
    } catch (error) {
      kokoroProgressListeners.delete(onProgress);
      return Promise.reject(error);
    }
  }
  return kokoroPromise.finally(() => kokoroProgressListeners.delete(onProgress));
}

function generateKokoro(text: string, voice: KokoroVoice, speed: number) {
  keepKokoroWarm();
  return sendKokoroRequest<KokoroAudio>({ type: 'generate', text, voice, speed });
}

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

function toReadLines(text: string, chapter: string, wordLimit = 22): ReadLine[] {
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
  let phrase = '';
  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();
    if (!cleanSentence) continue;
    const words = cleanSentence.split(/\s+/).filter(Boolean);
    if (words.length <= wordLimit) {
      if (phrase && phrase.split(/\s+/).length + words.length <= wordLimit) phrase += ` ${cleanSentence}`;
      else {
        if (phrase) lines.push({ text: phrase, chapter });
        phrase = cleanSentence;
      }
      continue;
    }
    if (phrase) { lines.push({ text: phrase, chapter }); phrase = ''; }
    for (let index = 0; index < words.length; index += wordLimit) {
      const line = words.slice(index, index + wordLimit).join(' ');
      if (line) lines.push({ text: line, chapter });
    }
  }
  if (phrase) lines.push({ text: phrase, chapter });
  return lines;
}

function roomImpulse(context: AudioContext) {
  const cached = roomImpulseCache.get(context);
  if (cached) return cached;
  const sampleRate = context.sampleRate;
  const duration = 0.42;
  const impulse = context.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
  const samples = impulse.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    const progress = index / samples.length;
    samples[index] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 5) * 0.32;
  }
  roomImpulseCache.set(context, impulse);
  return impulse;
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

function savedEngine(): VoiceEngine {
  try { return localStorage.getItem('whisper-voice-engine') === 'device' ? 'device' : 'neural'; }
  catch { return 'neural'; }
}

function savedAmbience() {
  try {
    const saved = localStorage.getItem('whisper-voice-ambience');
    if (saved === null) return 0.42;
    const value = Number(saved);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.42;
  } catch { return 0.42; }
}

export default function PreviewPlayer({ book }: { book: LibraryBook }) {
  const [language, setLanguage] = useState(book.language || 'en-US');
  const [automatic, setAutomatic] = useState(savedAutoPreview);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState('');
  const [engine, setEngine] = useState<VoiceEngine>(savedEngine);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [gender, setGender] = useState<VoiceGender>(savedGender);
  const [volume, setVolume] = useState(0.7);
  const [pitch, setPitch] = useState(0.96);
  const [ambience, setAmbience] = useState(savedAmbience);
  const [pace, setPace] = useState(0.88);
  const [mode, setMode] = useState<ReadingMode>('preview');
  const [visibleLines, setVisibleLines] = useState<ReadLine[]>([]);
  const [activeLine, setActiveLine] = useState(0);
  const [fullBookRequest, setFullBookRequest] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const readingRequested = useRef(false);
  const preparedAudioRef = useRef<PreparedLineAudio | null>(null);
  const playbackLines = useRef<ReadLine[]>([]);
  const readingMode = useRef<ReadingMode>('preview');
  const nextLine = useRef<(index: number, token: number) => void>(() => {});
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackOffset = useRef(0);
  const playbackStartedAt = useRef(0);
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

  const stopAudio = useCallback(() => {
    const source = sourceRef.current;
    sourceRef.current = null;
    if (source) {
      source.onended = null;
      try { source.stop(); } catch { /* It may already have ended. */ }
    }
    bufferRef.current = null;
    playbackOffset.current = 0;
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    readingRequested.current = false;
    preparedAudioRef.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    stopAudio();
    releaseKokoroAfterIdle();
    setModelProgress(null);
    setPlaying(false);
    setPaused(false);
  }, [stopAudio]);

  nextLine.current = (index, token) => {
    if (generation.current !== token) return;
    const lines = playbackLines.current;
    if (index >= lines.length) {
      setPlaying(false);
      setPaused(false);
      setMessage(readingMode.current === 'book' ? 'You’ve reached the end of this book.' : 'That was the preview.');
      return;
    }
    const line = lines[index];
    if (engine === 'neural') {
      void (async () => {
        try {
          setMessage(kokoroLoaded ? 'Finding the next line…' : 'Waking the local voice…');
          if (!kokoroLoaded) setModelProgress(progress => progress ?? 0);
          await loadKokoro(progress => {
            if (generation.current === token) setModelProgress(progress);
          });
          if (generation.current !== token) return;
          const voice: KokoroVoice = gender === 'female' ? 'af_heart' : 'am_onyx';
          const key = voiceCacheKey(line.text, gender, pace);
          const warmedAudio = previewWarmup?.key === key ? previewWarmup.audio : null;
          const prepared = preparedAudioRef.current;
          const matchesPrepared = prepared?.token === token && prepared.index === index && prepared.key === key;
          let audio: KokoroAudio;
          if (warmedAudio) audio = await warmedAudio;
          else if (matchesPrepared && prepared) {
            preparedAudioRef.current = null;
            try { audio = await prepared.audio; }
            catch {
              if (generation.current !== token) return;
              audio = await generateKokoro(line.text, voice, pace);
            }
          } else audio = await generateKokoro(line.text, voice, pace);
          if (generation.current !== token) return;
          if (previewWarmup?.key === key) previewWarmup = null;
          if (prepared?.token === token && prepared.index === index) preparedAudioRef.current = null;
          const context = audioContextRef.current || sharedAudioContext || new AudioContext();
          sharedAudioContext = context;
          audioContextRef.current = context;
          if (context.state === 'suspended') {
            try { await context.resume(); } catch { /* A fresh user gesture may be required. */ }
          }
          if (context.state !== 'running') {
            setModelProgress(null);
            setMessage('Tap Listen once to enable audio on this browser.');
            return;
          }
          const buffer = context.createBuffer(1, audio.audio.length, audio.sampling_rate);
          buffer.getChannelData(0).set(audio.audio);
          bufferRef.current = buffer;
          playbackOffset.current = 0;
          setModelProgress(null);
          setActiveLine(index);
          setMessage('The local whisper is reading.');
          keepKokoroWarm();
          const nextLineIndex = index + 1;
          if (nextLineIndex < lines.length && canWarmVoiceInBackground()) {
            const nextText = lines[nextLineIndex].text;
            const nextKey = voiceCacheKey(nextText, gender, pace);
            const nextAudio = generateKokoro(nextText, voice, pace);
            const preparedNext: PreparedLineAudio = { token, index: nextLineIndex, key: nextKey, audio: nextAudio };
            preparedAudioRef.current = preparedNext;
            void nextAudio.catch(() => {
              if (preparedAudioRef.current === preparedNext) preparedAudioRef.current = null;
            });
          }
          playNeuralBuffer(buffer, 0, index, token, lines);
        } catch (error) {
          if (generation.current !== token) return;
          console.error('Local neural voice failed', error);
          setModelProgress(null);
          setPlaying(false);
          setPaused(false);
          if ('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
            setEngine('device');
            setMessage('The local voice is unavailable here. Continuing with a device voice.');
            setTimeout(() => { if (generation.current === token) nextLine.current(index, token); }, 0);
          } else {
            setMessage('The local voice could not start, and this browser has no device voice. The transcript is still available.');
          }
        }
      })();
      return;
    }
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setPlaying(false);
      setMessage('This browser does not provide speech playback. The transcript is available to read.');
      return;
    }
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
        releaseKokoroAfterIdle();
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

  function playNeuralBuffer(buffer: AudioBuffer, offset: number, index: number, token: number, lines: ReadLine[]) {
    if (generation.current !== token) return;
    const context = audioContextRef.current;
    if (!context) return;
    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 72 + ambience * 22;
    highPass.Q.value = 0.55;
    const warmth = context.createBiquadFilter();
    warmth.type = 'peaking';
    warmth.frequency.value = 245;
    warmth.Q.value = 0.72;
    warmth.gain.value = 0.5 + (1 - ambience) * 0.7;
    const softness = context.createBiquadFilter();
    softness.type = 'lowpass';
    softness.frequency.value = 8200 - ambience * 1050;
    softness.Q.value = 0.55;
    const dry = context.createGain();
    dry.gain.value = volume * 0.94;
    const room = context.createConvolver();
    room.buffer = roomImpulse(context);
    const wet = context.createGain();
    wet.gain.value = volume * (0.035 + ambience * 0.08);
    const output = context.createGain();
    output.gain.value = 0.92;
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    source.detune.value = [-1.4, 0.8, 1.6, -0.6][index % 4];
    source.connect(highPass);
    highPass.connect(warmth);
    warmth.connect(softness);
    softness.connect(dry);
    dry.connect(output);
    softness.connect(room);
    room.connect(wet);
    wet.connect(output);
    output.connect(context.destination);
    sourceRef.current = source;
    playbackOffset.current = offset;
    playbackStartedAt.current = context.currentTime;
    source.onended = () => {
      if (sourceRef.current !== source) return;
      sourceRef.current = null;
      if (generation.current !== token) return;
      playbackOffset.current = 0;
      bufferRef.current = null;
      if (index + 1 >= lines.length) {
        setPlaying(false);
        setPaused(false);
        setMessage(readingMode.current === 'book' ? 'You’ve reached the end of this book.' : 'That was the preview.');
        releaseKokoroAfterIdle();
        return;
      }
      const pause = /[.!?。！？]$/.test(lines[index].text) ? 270 : 135;
      timer.current = setTimeout(() => nextLine.current(index + 1, token), pause);
    };
    setPlaying(true);
    setPaused(false);
    setActiveLine(index);
    keepKokoroWarm();
    source.start(0, offset);
  }

  const startLines = useCallback((lines: ReadLine[], nextMode: ReadingMode) => {
    if (!lines.length) { setMessage('There is no readable text available for this book.'); return; }
    stop();
    readingRequested.current = true;
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
    if (engine !== 'neural' || typeof AudioContext === 'undefined') return;
    const unlockAudio = () => {
      try {
        const context = audioContextRef.current || sharedAudioContext || new AudioContext();
        sharedAudioContext = context;
        audioContextRef.current = context;
        if (context.state === 'suspended') void context.resume().catch(() => {});
      } catch { /* Unsupported devices can still use an installed speech voice. */ }
    };
    document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
    document.addEventListener('keydown', unlockAudio, true);
    return () => {
      document.removeEventListener('pointerdown', unlockAudio, true);
      document.removeEventListener('keydown', unlockAudio, true);
    };
  }, [engine]);

  useEffect(() => {
    try {
      localStorage.setItem('whisper-auto-preview', String(automatic));
      localStorage.setItem('whisper-voice-gender', gender);
      localStorage.setItem('whisper-voice-engine', engine);
      localStorage.setItem('whisper-voice-ambience', String(ambience));
    } catch { /* These preferences still apply for this visit. */ }
  }, [automatic, gender, engine, ambience]);

  useEffect(() => {
    stop();
    setMessage('');
    setMode('preview');
    setActiveLine(0);
    return stop;
  }, [book.id, language, stop]);

  useEffect(() => {
    if (engine === 'neural' && language !== 'en-US') setLanguage('en-US');
  }, [engine, language]);

  useEffect(() => {
    if (!automatic || engine !== 'neural' || !previewLines.length || !canWarmVoiceInBackground()) return;
    const firstLine = previewLines[0].text;
    const voice: KokoroVoice = gender === 'female' ? 'af_heart' : 'am_onyx';
    const key = voiceCacheKey(firstLine, gender, pace);
    let cancelled = false;
    const warm = () => {
      if (cancelled || readingRequested.current || previewWarmup?.key === key) return;
      setMessage('Preparing a quiet preview…');
      setModelProgress(0);
      const audio = loadKokoro(progress => {
        if (!cancelled) setModelProgress(progress);
      })
        .then(() => {
          if (cancelled) {
            releaseKokoroAfterIdle();
            throw new Error('Voice preparation cancelled.');
          }
          return generateKokoro(firstLine, voice, pace);
        })
        .then(generated => {
          if (!cancelled) setModelProgress(null);
          releaseKokoroAfterIdle();
          return generated;
        });
      previewWarmup = { key, audio };
      void audio.catch(() => {
        if (previewWarmup?.key === key) previewWarmup = null;
        if (!cancelled) setModelProgress(null);
      });
    };
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      if (idleWindow.requestIdleCallback) idleId = idleWindow.requestIdleCallback(warm, { timeout: 700 });
      else warm();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (idleId !== undefined) idleWindow.cancelIdleCallback?.(idleId);
      if (previewWarmup?.key === key) previewWarmup = null;
    };
  }, [automatic, book.id, engine, gender, pace, previewLines]);

  useEffect(() => stop, [stop]);

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
    setPitch(value === 'female' ? 0.96 : 0.91);
  }

  function togglePlayback() {
    if (playing) {
      if (engine === 'neural') {
        const context = audioContextRef.current;
        const source = sourceRef.current;
        if (context && source) {
          playbackOffset.current += (context.currentTime - playbackStartedAt.current) * pitch;
          sourceRef.current = null;
          source.onended = null;
          try { source.stop(); } catch { /* It may already have ended. */ }
        }
        releaseKokoroAfterIdle();
      } else if ('speechSynthesis' in window) window.speechSynthesis.pause();
      setPlaying(false); setPaused(true); return;
    }
    if (paused) {
      if (engine === 'neural' && bufferRef.current) {
        const index = activeLine;
        playNeuralBuffer(bufferRef.current, playbackOffset.current, index, generation.current, playbackLines.current);
      } else if ('speechSynthesis' in window) window.speechSynthesis.resume();
      setPlaying(true); setPaused(false); return;
    }
    if (mode === 'book' && visibleLines.length) startLines(visibleLines, 'book');
    else startPreview();
  }

  return <section className="preview-player" aria-label="Book audio preview">
    <div className="player-row">
      <div className="player-mark" aria-hidden="true">♫</div>
      <div className="player-copy"><strong>A little whisper</strong><p>{current?.source === 'last-location' ? 'From where you left off' : current?.source === 'glossary' ? 'From the glossary' : 'A passage from inside'}</p></div>
      <button type="button" className="audio-settings-trigger" aria-label="Voice settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(open => !open)}>⚙</button>
      <button type="button" className="button button-primary" onClick={togglePlayback} disabled={modelProgress !== null || (preview.isPending && mode === 'preview' && !playing && !paused)} aria-label={playing ? 'Pause reading' : paused ? 'Resume reading' : mode === 'book' ? 'Read full book' : 'Play preview'}>{modelProgress !== null ? 'Preparing…' : playing ? 'Pause' : paused ? 'Resume' : mode === 'book' ? 'Read again' : 'Listen'}</button>
      {(playing || paused) && <button type="button" className="button button-quiet whisper-stop" onClick={() => { stop(); setMessage('Playback stopped.'); }} aria-label="Stop reading">■</button>}
    </div>
    {settingsOpen && <div className="player-settings-panel">
      <div className="voice-gender" role="group" aria-label="Voice presentation">
        <button type="button" className={gender === 'female' ? 'is-active' : ''} aria-pressed={gender === 'female'} onClick={() => changeGender('female')}>Female</button>
        <button type="button" className={gender === 'male' ? 'is-active' : ''} aria-pressed={gender === 'male'} onClick={() => changeGender('male')}>Male</button>
      </div>
      <div className="player-settings">
        <label>Voice engine<select aria-label="Voice engine" value={engine} onChange={event => { stop(); setEngine(event.target.value as VoiceEngine); }}>
          <option value="neural">Local neural voice · Kokoro</option><option value="device">Device voice</option>
        </select></label>
        {engine === 'device' && <label>Installed voice<select aria-label="Installed speech voice" value={voiceURI} onChange={event => setVoiceURI(event.target.value)}>
          <option value="">Automatic · {gender}</option>{voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
        </select></label>}
        {engine === 'device'
          ? <label>Language<select aria-label="Preview language" value={language} onChange={event => setLanguage(event.target.value)}>{LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          : <label>Language<span className="voice-language-note">English · US</span></label>}
        <label>Pace<input aria-label="Reading pace" type="range" min="0.58" max="0.94" step="0.02" value={pace} onChange={event => setPace(Number(event.target.value))} /></label>
        <label>Voice depth<input aria-label="Voice depth" type="range" min="0.86" max="1.04" step="0.01" value={pitch} onChange={event => setPitch(Number(event.target.value))} /></label>
        {engine === 'neural' && <label>Candlelit ambience<input aria-label="Candlelit ambience" type="range" min="0" max="1" step="0.05" value={ambience} onChange={event => setAmbience(Number(event.target.value))} /></label>}
        <label>Volume<input aria-label="Preview volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))} /></label>
      </div>
      <label className="check-row"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} /> Whisper after I choose a book</label>
      <p className="fine-print">Kokoro reads locally with no API key or per-reading limit. Its first model download is about 92 MB and the browser caches it. The model reads English; device voices support other languages. Candlelit ambience gently softens the voice and adds a short room tail.</p>
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
      {modelProgress !== null
        ? <div className="voice-load-status" role="status" aria-live="polite"><span>Preparing local voice</span><progress max="100" value={modelProgress} aria-label="Local voice download progress" /><span>{modelProgress}%</span></div>
        : message && <span role="status">{message}</span>}
    </div>
    {fetchError && <p className="inline-message" role="status">{fetchMessage}<button type="button" className="button button-quiet" onClick={() => { void preview.refetch(); if (fullBookRequest) void fullBook.refetch(); }}>Retry</button></p>}
  </section>;
}

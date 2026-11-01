import { CachedFileReader, TtsSession } from '@jtsage/piper-tts-web';
import ortWasmModuleUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import ortWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';

type Gender = 'female' | 'male';
type Request =
  | { id: number; type: 'load'; gender: Gender }
  | { id: number; type: 'generate'; gender: Gender; text: string };
type Reply =
  | { id: number; type: 'progress'; progress: number }
  | { id: number; type: 'ready' }
  | { id: number; type: 'audio'; audio: ArrayBuffer; samplingRate: number }
  | { id: number; type: 'error'; message: string };

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Reply, transfer?: Transferable[]): void;
};

let session: TtsSession | null = null;
let sessionGender: Gender | null = null;
let queue = Promise.resolve();

function voiceFor(gender: Gender) {
  return gender === 'female' ? 'en_US-hfc_female-medium' : 'en_US-hfc_male-medium';
}

function wavToMonoFloat32(wav: ArrayBuffer) {
  const view = new DataView(wav);
  if (view.byteLength < 44 || view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
    throw new Error('Piper returned an invalid WAV file.');
  }

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const size = view.getUint32(offset + 4, true);
    const next = offset + 8 + size + (size % 2);
    if (next > view.byteLength) break;
    if (view.getUint32(offset, false) === 0x666d7420) {
      format = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (view.getUint32(offset, false) === 0x64617461) {
      dataOffset = offset + 8;
      dataLength = size;
    }
    offset = next;
  }

  if (format !== 1 || bitsPerSample !== 16 || channels < 1 || sampleRate < 1 || dataOffset < 0) {
    throw new Error('Piper returned an unsupported audio format.');
  }
  const bytesPerFrame = channels * 2;
  const frames = Math.floor(dataLength / bytesPerFrame);
  const audio = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sample = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sample += view.getInt16(dataOffset + frame * bytesPerFrame + channel * 2, true) / 32768;
    }
    audio[frame] = sample / channels;
  }
  return { audio, sampleRate };
}

async function loadVoice(id: number, gender: Gender, announceReady: boolean) {
  if (session && sessionGender === gender) {
    if (announceReady) worker.postMessage({ id, type: 'ready' });
    return session;
  }
  TtsSession._instance = null;
  const fileReader = new CachedFileReader({
    progress: progress => {
      if (progress.total > 0) {
        worker.postMessage({ id, type: 'progress', progress: Math.min(100, Math.round(progress.loaded / progress.total * 100)) });
      }
    },
  });
  const loaded = await TtsSession.create({
    voiceId: voiceFor(gender),
    fileReader,
    wasmPaths: {
      ...TtsSession.WASM_LOCATIONS,
      onnxWasm: { mjs: ortWasmModuleUrl, wasm: ortWasmUrl } as unknown as string,
    },
    fallbackStrategy: 'local',
  });
  session = loaded;
  sessionGender = gender;
  if (announceReady) worker.postMessage({ id, type: 'ready' });
  return loaded;
}

worker.onmessage = event => {
  const request = event.data;
  queue = queue.then(async () => {
    try {
      const loaded = await loadVoice(request.id, request.gender, request.type === 'load');
      if (request.type === 'generate') {
        const wav = await loaded.predict(request.text);
        const decoded = wavToMonoFloat32(await wav.arrayBuffer());
        worker.postMessage(
          { id: request.id, type: 'audio', audio: decoded.audio.buffer, samplingRate: decoded.sampleRate },
          [decoded.audio.buffer],
        );
      }
    } catch (error) {
      worker.postMessage({ id: request.id, type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }).catch(error => {
    worker.postMessage({ id: request.id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  });
};

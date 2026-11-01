import ortWasmModuleUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import ortWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import { env, KokoroTTS } from 'kokoro-js';

type Request =
  | { id: number; type: 'load' }
  | { id: number; type: 'generate'; text: string; voice: 'af_heart' | 'am_onyx'; speed: number };
type Reply =
  | { id: number; type: 'progress'; progress: number }
  | { id: number; type: 'ready' }
  | { id: number; type: 'audio'; audio: ArrayBuffer; samplingRate: number }
  | { id: number; type: 'error'; message: string };

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Reply, transfer?: Transferable[]): void;
};

let model: KokoroTTS | null = null;
let loading: Promise<KokoroTTS> | null = null;
let queue = Promise.resolve();

async function loadModel(id: number, announceReady = true) {
  if (!loading) {
    env.wasmPaths = { mjs: ortWasmModuleUrl, wasm: ortWasmUrl };
    loading = KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: info => {
        if (info.status === 'progress') {
          worker.postMessage({ type: 'progress', id, progress: Math.round(info.progress) });
        }
      },
    }).then(loaded => {
      model = loaded;
      return loaded;
    }).catch(error => {
      loading = null;
      throw error;
    });
  }
  const loaded = await loading;
  if (announceReady) worker.postMessage({ type: 'ready', id });
  return loaded;
}

worker.onmessage = event => {
  const request = event.data;
  queue = queue.then(async () => {
    try {
      const loaded = request.type === 'load' ? await loadModel(request.id) : model || await loadModel(request.id, false);
      if (request.type === 'generate') {
        const audio = await loaded.generate(request.text, { voice: request.voice, speed: request.speed });
        const samples = audio.audio;
        worker.postMessage(
          { type: 'audio', id: request.id, audio: samples.buffer as ArrayBuffer, samplingRate: audio.sampling_rate },
          [samples.buffer as ArrayBuffer],
        );
      }
    } catch (error) {
      worker.postMessage({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
    }
  }).catch(error => {
    worker.postMessage({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
  });
};

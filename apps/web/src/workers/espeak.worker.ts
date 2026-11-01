import { createEspeak } from '@spelling-creator/spellophone/browser';
import espeakWasmUrl from '../../node_modules/@spelling-creator/spellophone/wasm/espeak-ng.wasm?url';

type Gender = 'female' | 'male';
type Request =
  | { id: number; type: 'load' }
  | { id: number; type: 'generate'; gender: Gender; text: string; pitch: number; language: string };
type Reply =
  | { id: number; type: 'progress'; progress: number }
  | { id: number; type: 'ready' }
  | { id: number; type: 'audio'; audio: ArrayBuffer; samplingRate: number }
  | { id: number; type: 'error'; message: string };

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Reply, transfer?: Transferable[]): void;
};

let ready = createEspeak({ cdn: 'jsdelivr', languages: ['en'], wasmUrl: espeakWasmUrl });

function espeakLanguage(language: string) {
  const languages: Record<string, string> = {
    'en-US': 'en-us', 'en-GB': 'en-gb', 'es-ES': 'es', 'fr-FR': 'fr-fr',
    'de-DE': 'de', 'it-IT': 'it', 'pt-BR': 'pt-br', 'hi-IN': 'hi', 'ja-JP': 'ja',
  };
  return languages[language] || 'en-us';
}

worker.onmessage = event => {
  const request = event.data;
  void (async () => {
    try {
      const espeak = await ready;
      if (request.type === 'load') {
        worker.postMessage({ id: request.id, type: 'ready' });
        return;
      }

      await espeak.loadVoice({ language: espeakLanguage(request.language), gender: request.gender });
      const result = espeak.synthesize(request.text, {
        rate: 175,
        pitch: Math.max(0, Math.min(99, Math.round(50 + (request.pitch - 1) * 150))),
        range: 34,
        volume: 100,
        endPause: true,
      });
      const samples = new Float32Array(result.samples.length);
      for (let index = 0; index < result.samples.length; index += 1) samples[index] = result.samples[index] / 32768;
      worker.postMessage(
        { id: request.id, type: 'audio', audio: samples.buffer, samplingRate: result.sampleRate },
        [samples.buffer],
      );
    } catch (error) {
      worker.postMessage({ id: request.id, type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  })();
};

void ready.then(() => worker.postMessage({ id: 0, type: 'progress', progress: 100 })).catch(() => {
  ready = createEspeak({ cdn: 'jsdelivr', languages: ['en'], wasmUrl: espeakWasmUrl });
});

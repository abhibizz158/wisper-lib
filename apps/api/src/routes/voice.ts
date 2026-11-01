import type { FastifyInstance } from 'fastify';
import { config } from '../lib/config.js';

type OrpheusRequest = { input?: string; voice?: string };
const ALLOWED_VOICES = new Set(['tara', 'leah', 'jess', 'leo', 'dan', 'mia', 'zac', 'zoe']);

export async function voiceRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: OrpheusRequest }>('/voice/orpheus', async (request, reply) => {
    if (!config.orpheusTtsUrl) {
      return reply.code(503).send({ error: { code: 'ORPHEUS_NOT_CONFIGURED', message: 'Set ORPHEUS_TTS_URL to an OpenAI-compatible local Orpheus speech endpoint.' } });
    }

    const input = request.body?.input?.trim();
    const voice = request.body?.voice;
    if (!input || input.length > 3000 || !voice || !ALLOWED_VOICES.has(voice)) {
      return reply.code(400).send({ error: { code: 'INVALID_SPEECH_REQUEST', message: 'Provide readable text (up to 3,000 characters) and a supported Orpheus voice.' } });
    }

    let endpoint: URL;
    try {
      endpoint = new URL(config.orpheusTtsUrl);
      if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') throw new Error('unsupported protocol');
    } catch {
      return reply.code(500).send({ error: { code: 'INVALID_ORPHEUS_URL', message: 'ORPHEUS_TTS_URL must be an HTTP or HTTPS endpoint.' } });
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/wav, audio/*' },
        body: JSON.stringify({ input, voice, model: 'canopylabs/orpheus-tts-0.1-finetune-prod', response_format: 'wav' }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        return reply.code(502).send({ error: { code: 'ORPHEUS_REQUEST_FAILED', message: `Orpheus returned ${response.status}${detail ? `: ${detail}` : '.'}` } });
      }
      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.byteLength || audio.byteLength > 24 * 1024 * 1024) {
        return reply.code(502).send({ error: { code: 'INVALID_ORPHEUS_AUDIO', message: 'Orpheus returned empty audio or a response larger than 24 MB.' } });
      }
      const type = response.headers.get('content-type') || 'audio/wav';
      if (!type.includes('audio') && !type.includes('octet-stream')) {
        return reply.code(502).send({ error: { code: 'INVALID_ORPHEUS_AUDIO', message: 'The configured Orpheus endpoint did not return audio.' } });
      }
      return reply.header('Content-Type', type).send(audio);
    } catch (error) {
      const message = error instanceof Error && error.name === 'TimeoutError'
        ? 'Orpheus took too long to respond. Check the local model server and try again.'
        : 'Could not reach the configured Orpheus server. Check that it is running and try again.';
      return reply.code(502).send({ error: { code: 'ORPHEUS_UNREACHABLE', message } });
    }
  });
}

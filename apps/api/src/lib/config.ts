/**
 * Centralised runtime configuration.
 * Read once at startup — all other modules import from here.
 * Avoids scattering process.env reads throughout the codebase.
 */

import path from 'path';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '127.0.0.1',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  orpheusTtsUrl: process.env.ORPHEUS_TTS_URL,

  // File storage — local filesystem in dev, swap to S3 adapter in Phase 2
  uploadsDir: path.resolve(process.env.UPLOADS_DIR ?? './uploads'),

  // Amazon Polly — all optional; app degrades gracefully when absent
  aws: {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    pollyVoiceId: process.env.POLLY_VOICE_ID ?? 'Joanna',
    pollyEngine: process.env.POLLY_ENGINE ?? 'standard',
    pollyLocale: process.env.POLLY_LOCALE ?? 'en-US',
  },

  /** True if Polly credentials are available */
  get pollyEnabled(): boolean {
    return Boolean(
      this.aws.region &&
      this.aws.accessKeyId &&
      this.aws.secretAccessKey
    );
  },
} as const;

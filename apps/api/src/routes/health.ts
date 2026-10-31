import type { FastifyInstance } from 'fastify';
import type { HealthResponse, ApiResponse } from '@wisper-lib/shared-types';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Reply: ApiResponse<HealthResponse> }>(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  version: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.send({
        data: {
          status: 'ok',
          version: '0.1.0',
        },
      });
    }
  );
}

import type { FastifyInstance } from 'fastify';
import type { MeResponse } from '@wisper-lib/shared-types';
import { findUserById } from '../db/users.js';
import { notFound, sendError } from '../lib/errors.js';

export async function meRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/me
   * Returns the current authenticated user from the database.
   * In Phase 1 this is always local-user-001 (auth stub).
   * In Phase 2 it will be the Cognito-verified user.
   */
  fastify.get<{ Reply: MeResponse | object }>('/me', async (request, reply) => {
    try {
      const user = await findUserById(request.user.id);
      if (!user) {
        // Should never happen in Phase 1 since we seed the user,
        // but handles Phase 2 edge cases gracefully.
        throw notFound('User');
      }
      return reply.send({
        data: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
      });
    } catch (err) {
      sendError(reply, err);
    }
  });
}

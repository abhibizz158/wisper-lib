/**
 * useCurrentUser
 * Fetches the current user from GET /api/v1/me.
 * In Phase 1 this always returns local-user-001.
 * In Phase 2 it will return the Cognito-authenticated user.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import type { MeResponse } from '@wisper-lib/shared-types';

export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/me'),
    staleTime: 5 * 60_000, // 5 min — user data doesn't change often
  });
}

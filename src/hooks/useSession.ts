/**
 * Shared subscription/tenant state hooks (spec §4).
 * Session is bootstrapped once in the app shell via GET /api/v1/auth/session
 * and consumed everywhere else — pages never refetch subscription state
 * independently.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionPayload } from '../api/types';
import { authApi } from '../api/services';
import { queryKeys } from '../lib/queryKeys';

export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => authApi.session(),
    staleTime: 60_000,
    retry: false,
  });
}

export function useSessionData(): SessionPayload | null | undefined {
  const q = useSession();
  return q.data;
}

export function useTenant() {
  const session = useSessionData();
  return session?.tenant ?? null;
}

export function useSubscription() {
  const tenant = useTenant();
  return tenant?.subscription ?? null;
}

export function isPlatformUser(session: SessionPayload | null | undefined): boolean {
  return !!session?.user?.platformRole;
}

/**
 * Resolved feature state for the current tenant.
 * Returns undefined while the session is loading / when no tenant context exists.
 */
export function useFeature(featureKey: string) {
  const tenant = useTenant();
  return tenant?.features?.[featureKey];
}

export function useLimit(limitKey: string) {
  const tenant = useTenant();
  const value = tenant?.limits?.[limitKey];
  return value ?? null;
}

export function canUseFeature(session: SessionPayload | null | undefined, featureKey: string): boolean {
  const f = session?.tenant?.features?.[featureKey];
  return !!f?.enabled;
}

/**
 * Does the customer tenant still have working access to the financial modules?
 * (expired / suspended / cancelled subscriptions restrict the app surface)
 */
export function hasWorkingSubscription(session: SessionPayload | null | undefined): boolean {
  const status = session?.tenant?.subscription?.status;
  if (session?.tenant?.customerStatus === 'SUSPENDED' || session?.tenant?.customerStatus === 'CANCELLED') return false;
  return status === 'ACTIVE' || status === 'TRIAL' || status === 'PAST_DUE';
}

/** Refetch the bootstrap session after admin-side changes (e.g. override added). */
export function useRefreshSession() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.session });
}

import { useEffect } from 'react';
import { setSentryUser, clearSentryUser, addBreadcrumb } from '@/utils/sentry';
import { AuthUser } from '@/api-types';

/**
 * Hook to automatically sync user context with Sentry
 */
export function useSentryUser(user: AuthUser | null) {
  useEffect(() => {
    if (user) {
      setSentryUser({
        id: user.id,
        email: user.email,
        username: user.displayName,
      });
    } else {
      clearSentryUser();
    }
  }, [user]);
}

/**
 * Hook to track user actions as breadcrumbs
 */
export function useSentryBreadcrumb() {
  return (message: string, data?: Record<string, string>) => {
    addBreadcrumb(message, 'user-action', 'info', data);
  };
}

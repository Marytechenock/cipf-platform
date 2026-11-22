import { ApiError, isApiErrorStatus } from '../../lib/api';
import { User } from '../../types';

export type AdminAccessDecision =
  | { state: 'redirect-login'; message: string }
  | { state: 'forbidden'; message: string; user: User | null }
  | { state: 'ready'; user: User }
  | { state: 'fatal'; message: string };

export function resolveAdminAccess(
  verifiedUser?: User | null,
  error?: unknown
): AdminAccessDecision {
  if (error) {
    if (isApiErrorStatus(error, [401])) {
      return {
        state: 'redirect-login',
        message: 'Please sign in as an administrator.'
      };
    }

    if (isApiErrorStatus(error, [403])) {
      return {
        state: 'forbidden',
        message: 'Your account is signed in but does not have administrator access.',
        user: verifiedUser ?? null
      };
    }

    const fallbackMessage = error instanceof ApiError
      ? error.message
      : 'We could not verify your administrator access right now.';

    return { state: 'fatal', message: fallbackMessage };
  }

  if (!verifiedUser) {
    return {
      state: 'redirect-login',
      message: 'Please sign in as an administrator.'
    };
  }

  if (verifiedUser.role !== 'admin') {
    return {
      state: 'forbidden',
      message: 'Your account is signed in but does not have administrator access.',
      user: verifiedUser
    };
  }

  return { state: 'ready', user: verifiedUser };
}

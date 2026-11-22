export type AppRoute =
  | { kind: 'app' }
  | { kind: 'admin' }
  | { kind: 'super-admin' }
  | { kind: 'session-questions'; mode: 'presenter' | 'display'; sessionId: string }
  | { kind: 'election-results' }
  | { kind: 'qa-results'; questionId: string }
  | { kind: 'checkin'; path: string }
  | { kind: 'voter-registration'; path: string };

export function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function parseAppRoute(pathname: string): AppRoute {
  const normalized = normalizePath(pathname);

  if (normalized === '/admin') {
    return { kind: 'admin' };
  }
  if (normalized === '/super-admin') {
    return { kind: 'super-admin' };
  }

  if (normalized === '/session-questions/presenter') {
    return { kind: 'session-questions', mode: 'presenter', sessionId: '' };
  }
  const displayMatch = normalized.match(/^\/session-questions\/display\/([^/]+)$/);
  if (displayMatch) {
    try { return { kind: 'session-questions', mode: 'display', sessionId: decodeURIComponent(displayMatch[1]) }; }
    catch { return { kind: 'app' }; }
  }

  if (normalized === '/admin/election-results') {
    return { kind: 'election-results' };
  }

  if (normalized.startsWith('/admin/qa-results/')) {
    return { kind: 'qa-results', questionId: normalized.replace('/admin/qa-results/', '') };
  }

  if (normalized.startsWith('/checkin')) {
    return { kind: 'checkin', path: normalized };
  }

  if (normalized.startsWith('/voter-registration')) {
    return { kind: 'voter-registration', path: normalized };
  }

  return { kind: 'app' };
}

export function navigateTo(path: string) {
  const nextPath = normalizePath(path);
  if (normalizePath(window.location.pathname) === nextPath) {
    return;
  }

  window.history.pushState({}, '', nextPath);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

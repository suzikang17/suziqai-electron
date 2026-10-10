import type { Session } from 'electron';

// Read-only mode for the target-app BrowserView: blocks every non-GET request except an
// allowlist (login, verified read-only RPCs), so recording or replaying against a production
// app can't create, change, send or delete anything. Mirrors tps-web's prod-readonly-guard.

const MONITORING = [/sentry\.[^/]+\/api\/\d+\/envelope/, /\/cdn-cgi\/rum/];

export type RequestDecision = 'allow' | 'block' | 'block-quiet';

function compile(patterns: string[]): RegExp[] {
  return patterns.flatMap((p) => {
    try {
      return [new RegExp(p)];
    } catch {
      return [];
    }
  });
}

export function decideRequest(method: string, url: string, allow: string[]): RequestDecision {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'allow';
  if (compile(allow).some((re) => re.test(url))) return 'allow';
  if (MONITORING.some((re) => re.test(url))) return 'block-quiet';
  return 'block';
}

/**
 * Installs (or, with `allow === null`, removes) the guard on a session.
 * `onBlocked` gets each blocked write, with the query string stripped.
 */
export function applyReadOnlyGuard(
  session: Session,
  allow: string[] | null,
  onBlocked: (method: string, url: string) => void,
): void {
  if (allow === null) {
    session.webRequest.onBeforeRequest(null);
    return;
  }
  session.webRequest.onBeforeRequest((details, callback) => {
    const decision = decideRequest(details.method, details.url, allow);
    if (decision === 'block') onBlocked(details.method, details.url.split('?')[0]);
    callback({ cancel: decision !== 'allow' });
  });
}

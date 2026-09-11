// Real-time presence beacon: reports the visitor's page + buying intent every 15s.
import { getFp } from './ref';

type PresenceRole = 'guest' | 'customer' | 'merchant' | 'admin';

const state: { page: string; intent: number; role: PresenceRole } = { page: 'Store', intent: 10, role: 'guest' };
let timer: number | null = null;

function routeLabel(): string {
  const h = window.location.hash || '#/';
  if (h.startsWith('#/b2b')) return 'Wholesale panel (B2B)';
  if (h.startsWith('#/admin')) return 'Admin dashboard';
  if (h.startsWith('#/orders')) return 'My orders';
  return 'Store';
}

let inflight = false;
let pendingDirty = false;

// Single-flight heartbeat: concurrent triggers (route change, intent bumps, 15s timer)
// can never open parallel writes — the anti-duplicate guarantee on the client side.
function postNow() {
  if (inflight) {
    pendingDirty = true;
    return;
  }
  inflight = true;
  try {
    fetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: getFp(), role: state.role, page: state.page, intent: state.intent }),
      keepalive: true,
    })
      .catch(() => {})
      .finally(() => {
        inflight = false;
        if (pendingDirty) {
          pendingDirty = false;
          postNow();
        }
      });
  } catch {
    inflight = false;
  }
}

export function initPresence() {
  if (timer !== null) return;
  state.page = routeLabel();
  postNow();
  timer = window.setInterval(postNow, 15000);
  window.addEventListener('hashchange', () => {
    // Natural reset on navigation: new page = fresh intent evaluation
    state.page = routeLabel();
    state.intent = 10;
    postNow();
  });
}

/** Direct presence update (page + intent). Intent only ever rises within a page. */
export function setPresence(patch: { page?: string; intent?: number }) {
  if (patch.page !== undefined) state.page = patch.page;
  if (patch.intent !== undefined && patch.intent > state.intent) state.intent = Math.min(95, patch.intent);
  postNow();
}

/** Idle browsing ramp: raises the floor (10% → 20% → 30%) without ever lowering. */
export function bumpBrowseIntent(level: 20 | 30) {
  if (state.intent < level) {
    state.intent = level;
    postNow();
  }
}

export function setPresenceRole(role: PresenceRole) {
  if (state.role !== role) {
    state.role = role;
    postNow();
  }
}

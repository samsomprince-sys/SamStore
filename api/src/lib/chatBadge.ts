// Per-thread read cursors (persisted) — powers the real-time unread badges.
const KEY = 'dz_chat_reads';

function readAll(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function getReadAt(thread: string): number {
  const m = readAll();
  return m[thread] ? Date.parse(m[thread]) : 0;
}

export function markThreadRead(thread: string) {
  const m = readAll();
  m[thread] = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* full */
  }
}

export function markAllRead(threads: string[]) {
  const m = readAll();
  const now = new Date().toISOString();
  threads.forEach((t) => (m[t] = now));
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* full */
  }
}

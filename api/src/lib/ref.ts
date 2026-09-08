// Persistent browser fingerprint + referral attribution (localStorage-based).

export function getFp(): string {
  try {
    let v = localStorage.getItem('dz_fp');
    if (!v) {
      v =
        typeof crypto !== 'undefined' && (crypto as any).randomUUID
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem('dz_fp', v);
    }
    return v;
  } catch {
    return 'nofp';
  }
}

/** ENTERPRISE HARDWARE FINGERPRINT: CPU/platform + screen + canvas token + timezone. */
let hwCached = '';
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export function getHw(): string {
  if (hwCached) return hwCached;
  let canvasSig = '';
  try {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 60;
    const g = c.getContext('2d');
    if (g) {
      g.textBaseline = 'top';
      g.font = "14px 'Arial'";
      g.fillStyle = '#f60';
      g.fillRect(10, 10, 80, 20);
      g.fillStyle = '#069';
      g.fillText('samstore-dz', 4, 6);
      g.beginPath();
      g.arc(120, 30, 14, 0, 6.28);
      g.fillStyle = '#0a7';
      g.fill();
      canvasSig = c.toDataURL().slice(-80);
    }
  } catch {
    canvasSig = 'nocanvas';
  }
  const parts = [
    navigator.userAgent,
    navigator.language || '',
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String((navigator as any).hardwareConcurrency || ''),
    String((navigator as any).deviceMemory || ''),
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    (navigator as any).platform || '',
    canvasSig,
  ];
  hwCached = `hw_${hashStr(parts.join('|'))}${hashStr(canvasSig)}`;
  return hwCached;
}

/** Captures ?ref=... from ANY incoming link format (/#/?ref=… or /?ref=…#/) — saved instantly on load. */
export function captureRefFromHash() {
  try {
    let ref: string | null = null;
    const h = window.location.hash || '';
    const qi = h.indexOf('?');
    if (qi !== -1) ref = new URLSearchParams(h.slice(qi + 1)).get('ref');
    if (!ref && window.location.search) ref = new URLSearchParams(window.location.search).get('ref');
    // Telegram Mini App deep link: startapp payload arrives via initDataUnsafe.start_param
    try {
      const sp = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.start_param;
      if (!ref && typeof sp === 'string' && sp && sp !== 'store') ref = sp;
    } catch {
      /* ignore */
    }
    if (ref && ref.length <= 32) localStorage.setItem('dz_ref', ref);
  } catch {
    /* ignore */
  }
}

export function getRef(): string {
  try {
    return localStorage.getItem('dz_ref') || '';
  } catch {
    return '';
  }
}

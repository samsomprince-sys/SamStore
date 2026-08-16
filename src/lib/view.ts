export type ViewMode = 'auto' | 'mobile' | 'pc';

const KEY = 'dz_view';

export function getViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'mobile' || v === 'pc' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setViewMode(m: ViewMode) {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('dz-view-changed'));
}

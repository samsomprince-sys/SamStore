/** Explicit backend cloud server (Render/Vercel) — used for /api/products + /api/activity. */
const BACKEND_URL = 'https://sam-store-dz.vercel.app';

type Options = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

export async function request<T = any>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  // /api/products and /api/activity hit the explicit backend URL; everything else stays relative.
  const base = path.startsWith('/api/products') || path.startsWith('/api/activity') ? BACKEND_URL : '';

  const res = await fetch(base + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err: any = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string, token?: string | null) => request<T>(path, { token }),
  post: <T = any>(path: string, body?: unknown, token?: string | null) =>
    request<T>(path, { method: 'POST', body, token }),
  put: <T = any>(path: string, body?: unknown, token?: string | null) =>
    request<T>(path, { method: 'PUT', body, token }),
  del: <T = any>(path: string, body?: unknown, token?: string | null) =>
    request<T>(path, { method: 'DELETE', body, token }),
};

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

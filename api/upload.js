import supabase from './db-client.js';
import { setCors, requireAdmin } from './_lib.js';

const PUBLIC_BUCKETS = ['receipts'];           // buyers upload receipts without login
const ADMIN_BUCKETS = ['content', 'products']; // admin-only uploads (site + product images)

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const b = req.body || {};
    const bucket = String(b.bucket || '');
    if (![...PUBLIC_BUCKETS, ...ADMIN_BUCKETS].includes(bucket)) {
      return res.status(400).json({ error: 'Invalid upload bucket' });
    }
    if (ADMIN_BUCKETS.includes(bucket) && !requireAdmin(req)) {
      return res.status(401).json({ error: 'Admin access required' });
    }

    const contentType = String(b.contentType || '');
    if (!/^image\/(jpeg|png|webp|gif)$/.test(contentType)) {
      return res.status(400).json({ error: 'Only image files are allowed (JPG, PNG, WEBP, GIF)' });
    }
    const base64 = String(b.fileBase64 || '');
    if (!base64) return res.status(400).json({ error: 'No file data received' });
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large (max 10 MB)' });

    const safeName = String(b.fileName || 'image').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    const path = `${bucket}/${Date.now()}-${safeName}`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(path, buffer, { contentType, upsert: false });
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    return res.status(200).json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('upload error', err);
    return res.status(500).json({ error: err.message });
  }
}

import crypto from 'crypto';
import supabase from './db-client.js';
import { setCors, requireAdmin, hashPassword } from './_lib.js';
import { notifyNewMerchant } from './_telegram.js';

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const { data: rows, error } = await supabase
        .from('merchants')
        .select('id, first_name, last_name, status, cni_path, created_at')
        .order('id', { ascending: false });
      if (error) throw error;

      const paths = (rows || []).map((r) => r.cni_path).filter(Boolean);
      let signedMap = {};
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage.from('cni-photos').createSignedUrls(paths, 3600);
        (signed || []).forEach((s) => {
          if (s && s.path && s.signedUrl) signedMap[s.path] = s.signedUrl;
        });
      }
      const out = (rows || []).map((r) => ({
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        status: r.status,
        created_at: r.created_at,
        cni_url: r.cni_path ? signedMap[r.cni_path] || null : null,
      }));
      return res.status(200).json(out);
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const first = String(b.first_name || '').trim();
      const last = String(b.last_name || '').trim();
      const password = String(b.password || '');
      const cniBase64 = String(b.cni_base64 || '');
      const cniType = String(b.cni_content_type || '');

      if (first.length < 2 || last.length < 2) return res.status(400).json({ error: 'Please enter your real first and last name' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      if (!MIME_EXT[cniType]) return res.status(400).json({ error: 'CNI photo must be a JPG, PNG or WEBP image' });
      if (!cniBase64) return res.status(400).json({ error: 'A clear photo of your National ID card (CNI) is required' });
      const buffer = Buffer.from(cniBase64, 'base64');
      if (buffer.length < 2000) return res.status(400).json({ error: 'CNI photo seems invalid — please take a clear photo' });
      if (buffer.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'CNI photo is too large (max 8 MB)' });

      const { data: existing, error: exErr } = await supabase
        .from('merchants')
        .select('id')
        .ilike('first_name', first)
        .ilike('last_name', last)
        .limit(1);
      if (exErr) throw exErr;
      if (existing && existing.length > 0) {
        return res.status(409).json({ error: 'An account with this name already exists — please log in' });
      }

      const path = `cni/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${MIME_EXT[cniType]}`;
      const { error: upErr } = await supabase.storage.from('cni-photos').upload(path, buffer, { contentType: cniType });
      if (upErr) throw upErr;

      const { salt, hash } = hashPassword(password);
      const { data, error } = await supabase
        .from('merchants')
        .insert({ first_name: first, last_name: last, password_hash: hash, salt, cni_path: path, status: 'pending' })
        .select('id, first_name, last_name, status')
        .single();
      if (error) throw error;
      // Instant Telegram alert with the CNI photo (short-lived signed URL, best effort)
      let signedCni = null;
      try {
        const { data: s } = await supabase.storage.from('cni-photos').createSignedUrl(path, 600);
        signedCni = (s && s.signedUrl) || null;
      } catch (e) {
        console.error('cni sign for alert failed', e);
      }
      let alertOk = false;
      try {
        alertOk = await notifyNewMerchant(supabase, { ...data }, signedCni);
      } catch (e) {
        console.error('tg merchant alert', e);
      }
      return res.status(201).json({ ...data, alert_sent: alertOk });
    }

    if (req.method === 'PUT') {
      if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });
      const b = req.body || {};
      const id = parseInt(b.id, 10);
      if (!id) return res.status(400).json({ error: 'Merchant id is required' });
      if (!['pending', 'approved', 'rejected'].includes(b.status)) return res.status(400).json({ error: 'Invalid status' });
      const { data, error } = await supabase
        .from('merchants')
        .update({ status: b.status })
        .eq('id', id)
        .select('id, first_name, last_name, status')
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('merchants error', err);
    return res.status(500).json({ error: err.message });
  }
}

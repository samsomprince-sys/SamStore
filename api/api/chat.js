import supabase from './db-client.js';
import { setCors, requireAdmin, verifyToken, getBearer } from './_lib.js';

// Threads are derived STRICTLY from the verified session token — a user can never
// choose another user's thread id. Admin threads are addressed explicitly.
function actorOf(req) {
  const p = verifyToken(getBearer(req));
  if (!p) return null;
  if (p.role === 'customer') return { kind: 'customer', id: p.cid, thread: `c_${p.cid}` };
  if (p.role === 'merchant') return { kind: 'merchant', id: p.mid, thread: `m_${p.mid}` };
  if (p.role === 'admin') return { kind: 'admin', id: 0 };
  return null;
}

async function senderName(actor) {
  if (actor.kind === 'admin') return 'Samir (Admin)';
  if (actor.kind === 'customer') {
    const { data } = await supabase.from('customers').select('name').eq('id', actor.id).maybeSingle();
    return (data && data.name) || 'Customer';
  }
  const { data } = await supabase.from('merchants').select('first_name, last_name').eq('id', actor.id).maybeSingle();
  return data ? `${data.first_name} ${data.last_name}` : 'Trader';
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const admin = requireAdmin(req);
    const actor = actorOf(req);
    if (!admin && !actor) return res.status(401).json({ error: 'Login required' });

    /* ---------------- GET ---------------- */
    if (req.method === 'GET') {
      if (admin) {
        const thread = String((req.query && req.query.thread) || '');
        if (thread) {
          const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('thread_id', thread)
            .order('id', { ascending: true })
            .limit(300);
          if (error) throw error;
          return res.status(200).json(data || []);
        }
        // threads summary: group latest by thread
        const { data, error } = await supabase.from('chat_messages').select('*').order('id', { ascending: false }).limit(500);
        if (error) throw error;
        const map = {};
        (data || []).forEach((m) => {
          if (!map[m.thread_id]) map[m.thread_id] = { thread_id: m.thread_id, count: 0, msgs: [] };
          map[m.thread_id].count += 1;
          map[m.thread_id].msgs.push(m);
        });
        const threads = Object.values(map)
          .map((t) => {
            const last = t.msgs[0];
            const peer = t.msgs.find((m) => m.sender_role !== 'admin');
            return {
              thread_id: t.thread_id,
              count: t.count,
              last_message: last.message,
              last_at: last.created_at,
              sender_role: (peer && peer.sender_role) || 'customer',
              sender_name: (peer && peer.sender_name) || 'User',
            };
          })
          .sort((a, b) => Date.parse(b.last_at) - Date.parse(a.last_at));
        return res.status(200).json(threads);
      }
      // user mode: own thread only
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', actor.thread)
        .order('id', { ascending: true })
        .limit(300);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    /* ---------------- POST ---------------- */
    if (req.method === 'POST') {
      const message = String((req.body || {}).message || '').trim().slice(0, 2000);
      if (!message) return res.status(400).json({ error: 'Message is empty' });

      let thread;
      let role;
      if (admin) {
        thread = String((req.body || {}).thread || '');
        if (!thread) return res.status(400).json({ error: 'thread required' });
        role = 'admin';
      } else {
        thread = actor.thread; // locked to the caller's own account
        role = actor.kind;
      }

      const name = admin ? 'Samir (Admin)' : await senderName(actor);
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({ thread_id: thread, sender_role: role, sender_name: name, message })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('chat error', err);
    return res.status(500).json({ error: err.message });
  }
}

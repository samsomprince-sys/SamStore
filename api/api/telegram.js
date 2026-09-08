import supabase from './db-client.js';
import { setCors, requireAdmin } from './_lib.js';
import { tgApi, getBotInfo, getAdminChatId, sendAdminAlert } from './_telegram.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!requireAdmin(req)) return res.status(401).json({ error: 'Admin access required' });

  try {
    if (req.method === 'GET') {
      const chatId = await getAdminChatId(supabase);
      const bot = await getBotInfo();
      return res.status(200).json({
        connected: !!chatId,
        chat_id: chatId,
        bot_username: bot && bot.username ? bot.username : null,
      });
    }

    if (req.method === 'POST') {
      const { action } = req.body || {};

      if (action === 'connect') {
        const r = await tgApi('getUpdates', { limit: 50, timeout: 0 });
        if (!r || !r.ok) {
          return res.status(502).json({
            error: 'Telegram API error — make sure no webhook is set on this bot, send /start to it, then try again.',
          });
        }
        const updates = Array.isArray(r.result) ? r.result : [];
        let chat = null;
        for (let i = updates.length - 1; i >= 0; i--) {
          const u = updates[i];
          const c = (u.message && u.message.chat) || (u.channel_post && u.channel_post.chat) || (u.callback_query && u.callback_query.message && u.callback_query.message.chat);
          if (c && c.id) {
            chat = c;
            break;
          }
        }
        if (!chat) {
          return res.status(404).json({
            error: 'No chat found yet. Open the bot in Telegram and send /start first, then press Connect again.',
          });
        }
        const chatId = String(chat.id);
        const { error } = await supabase
          .from('site_content')
          .upsert({ key: 'admin_telegram_chat_id', value: chatId, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;
        await sendAdminAlert(
          supabase,
          '✅ <b>Telegram alerts connected!</b>\nYou will now receive instant notifications for: new orders (retail & wholesale), new wholesaler applications, and Super Edit saves.'
        );
        return res.status(200).json({ ok: true, chat_id: chatId });
      }

      if (action === 'test') {
        const ok = await sendAdminAlert(supabase, '🔔 Test alert from SamStore DZ — Telegram notifications are working.');
        if (!ok) return res.status(400).json({ error: 'Not connected yet — send /start to the bot, then press Connect.' });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('telegram api error', err);
    return res.status(500).json({ error: err.message });
  }
}

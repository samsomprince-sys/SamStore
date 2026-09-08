export type TgUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: any };
  }
}

export function getTg(): any {
  try {
    return window.Telegram?.WebApp;
  } catch {
    return undefined;
  }
}

export function getTgUser(): TgUser | null {
  const tg = getTg();
  const u = tg?.initDataUnsafe?.user;
  return u && u.id ? (u as TgUser) : null;
}

export function applyTelegramTheme(): boolean {
  const tg = getTg();
  if (!tg) return false;
  const root = document.documentElement;
  const params = tg.themeParams || {};
  // FORCED DARK MODE: surfaces/text stay dark everywhere; Telegram params only
  // tune accents/buttons when they match the dark scheme.
  const accentMap: Record<string, string> = {
    link_color: '--app-link',
    button_color: '--tg-btn',
    button_text_color: '--tg-btn-text',
  };
  let applied = false;
  for (const [key, cssVar] of Object.entries(accentMap)) {
    const val = params[key];
    if (typeof val === 'string' && val) {
      root.style.setProperty(cssVar, val);
      applied = true;
    }
  }
  if (tg.colorScheme === 'dark') {
    // Dark Telegram: accept its dark surface colors too (they stay dark by design)
    const darkMap: Record<string, string> = {
      bg_color: '--app-bg',
      secondary_bg_color: '--app-card',
      text_color: '--app-text',
      hint_color: '--app-hint',
    };
    for (const [key, cssVar] of Object.entries(darkMap)) {
      const val = params[key];
      if (typeof val === 'string' && val) {
        root.style.setProperty(cssVar, val);
        applied = true;
      }
    }
  }
  root.dataset.scheme = 'dark';
  root.dataset.tg = 'true';
  return applied;
}

export function initTelegram(): boolean {
  const tg = getTg();
  if (!tg) return false;
  try {
    tg.ready?.();
    tg.expand?.();
    try {
      tg.setHeaderColor?.('secondary_bg_color');
    } catch {
      /* older clients */
    }
    tg.onEvent?.('themeChanged', applyTelegramTheme);
    if (tg.disableVerticalSwipes) {
      try {
        tg.disableVerticalSwipes();
      } catch {
        /* not supported */
      }
    }
  } catch {
    /* ignore */
  }
  applyTelegramTheme();
  return true;
}

export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    getTg()?.HapticFeedback?.impactOccurred?.(style);
  } catch {
    /* ignore */
  }
}

export function hapticNotify(type: 'success' | 'error' | 'warning' = 'success') {
  try {
    getTg()?.HapticFeedback?.notificationOccurred?.(type);
  } catch {
    /* ignore */
  }
}

export function tgAlert(message: string) {
  const tg = getTg();
  if (tg?.showAlert) tg.showAlert(message);
  else window.alert(message);
}

export function tgPopup(title: string, message: string) {
  const tg = getTg();
  if (tg?.showPopup) tg.showPopup({ title, message, buttons: [{ type: 'ok' }] });
  else tgAlert(`${title}\n${message}`);
}

export function openTelegramLink(url: string) {
  const tg = getTg();
  try {
    if (tg?.openTelegramLink && url.includes('t.me')) {
      tg.openTelegramLink(url);
      return;
    }
  } catch {
    /* ignore */
  }
  window.open(url, '_blank');
}

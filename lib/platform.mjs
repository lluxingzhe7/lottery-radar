export function normalizeUrl(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return s;
  }
}

export function detectPlatform(raw, settings) {
  let host = '';
  try {
    host = new URL(normalizeUrl(raw)).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [key, cfg] of Object.entries(settings.platforms || {})) {
    if (key === 'other') continue;
    for (const h of cfg.hosts || []) {
      const hh = String(h).toLowerCase();
      if (host === hh || host.endsWith('.' + hh)) return key;
    }
  }
  return null;
}

export function platformLabel(settings, key) {
  return settings.platforms?.[key]?.label || key || '未知';
}

export function platformPrefix(settings, key) {
  return settings.platforms?.[key]?.prefix || 'oth';
}

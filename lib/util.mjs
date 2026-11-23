// 通用小工具：中文宽度对齐、日期解析、哈希
export function displayWidth(str) {
  let w = 0;
  for (const ch of String(str ?? '')) {
    const c = ch.codePointAt(0);
    if (c === 0x200b || c === 0x200d || c === 0xfe0f) continue;
    if (
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0x303e) ||
      (c >= 0x3041 && c <= 0x33ff) ||
      (c >= 0x3400 && c <= 0x4dbf) ||
      (c >= 0x4e00 && c <= 0x9fff) ||
      (c >= 0xa000 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x1f300 && c <= 0x1faff)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

export function truncateDisplay(str, width) {
  const s = String(str ?? '');
  if (displayWidth(s) <= width) return s;
  let out = '';
  for (const ch of s) {
    if (displayWidth(out + ch) > width - 1) break;
    out += ch;
  }
  return out + '…';
}

export function padDisplay(str, width, align = 'left') {
  const s = String(str ?? '');
  const gap = width - displayWidth(s);
  if (gap <= 0) return s;
  return align === 'right' ? ' '.repeat(gap) + s : s + ' '.repeat(gap);
}

export function fmtDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

export function todayStr(now = new Date()) {
  return fmtDate(now);
}

export function toDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysUntil(str, now = new Date()) {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((toDate(str).getTime() - t.getTime()) / 86400000);
}

export function dueText(deadline) {
  const n = daysUntil(deadline);
  if (n === 0) return '今天开奖';
  if (n > 0) return n + ' 天后';
  return '已过期 ' + Math.abs(n) + ' 天';
}

// 支持：2026-12-01 / 12-01 / 12月1日 / 今天 / 明天 / 3天后
export function parseDeadline(raw, now = new Date()) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: '空值' };
  const y = now.getFullYear();
  const norm = (yy, mm, dd) => {
    const m = Number(mm), d = Number(dd), Y = Number(yy);
    if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
    const dt = new Date(Y, m - 1, d);
    if (dt.getFullYear() !== Y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return fmtDate(dt);
  };
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
    const d = norm(m[1], m[2], m[3]);
    return d ? { ok: true, date: d } : { ok: false, error: '日期不存在' };
  }
  if ((m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})[日号]?$/))) {
    const d = norm(m[1], m[2], m[3]);
    return d ? { ok: true, date: d } : { ok: false, error: '日期不存在' };
  }
  if ((m = s.match(/^(\d{1,2})[-/.月](\d{1,2})[日号]?$/))) {
    let d = norm(y, m[1], m[2]);
    if (d && daysUntil(d, now) < -1) d = norm(y + 1, m[1], m[2]);
    return d ? { ok: true, date: d } : { ok: false, error: '日期不存在' };
  }
  if (s === '今天' || s === '今晚') return { ok: true, date: todayStr(now) };
  if (s === '明天') return { ok: true, date: fmtDate(new Date(now.getTime() + 86400000)) };
  if (s === '后天') return { ok: true, date: fmtDate(new Date(now.getTime() + 2 * 86400000)) };
  if ((m = s.match(/^(\d{1,3})\s*天后$/))) {
    return { ok: true, date: fmtDate(new Date(now.getTime() + Number(m[1]) * 86400000)) };
  }
  return { ok: false, error: '认不出这个日期：' + s };
}

export function extractDeadlineFromText(text, now = new Date()) {
  const s = String(text || '');
  let m;
  if ((m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})[日号]/))) {
    const r = parseDeadline(m[1] + '-' + m[2] + '-' + m[3], now);
    if (r.ok) return r.date;
  }
  if ((m = s.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/))) {
    const r = parseDeadline(m[1] + '-' + m[2] + '-' + m[3], now);
    if (r.ok) return r.date;
  }
  if ((m = s.match(/(\d{1,2})月(\d{1,2})[日号]\s*(?:开奖|公布|截止|抽奖)/)) || (m = s.match(/(?:开奖|公布|截止|抽奖)[^\n]{0,6}?(\d{1,2})月(\d{1,2})[日号]/))) {
    const r = parseDeadline(m[1] + '-' + m[2], now);
    if (r.ok) return r.date;
  }
  return null;
}

export function hashCode(str) {
  let h = 5381;
  for (const ch of String(str)) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0;
  return h;
}

export function oneLine(str, max = 120) {
  return String(str ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function firstMeaningfulLine(str) {
  for (const line of String(str || '').split(/\r?\n/)) {
    const t = line.trim();
    if (t) return t;
  }
  return '';
}

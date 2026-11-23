import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DB_FILE } from './paths.mjs';
import { fmtDate, todayStr } from './util.mjs';

export function nowIso() {
  return new Date().toISOString();
}

export function emptyStore() {
  return { version: 1, updatedAt: nowIso(), seq: {}, activities: [] };
}

export function loadStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) return emptyStore();
  const raw = fs.readFileSync(DB_FILE, 'utf8').trim();
  if (!raw) return emptyStore();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('数据文件不是合法 JSON：' + DB_FILE + '（' + e.message + '）');
  }
  if (!data || !Array.isArray(data.activities)) throw new Error('数据文件结构不对：' + DB_FILE);
  data.seq = data.seq || {};
  return data;
}

export function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  store.updatedAt = nowIso();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  if (fs.existsSync(DB_FILE)) {
    try {
      fs.copyFileSync(DB_FILE, DB_FILE + '.bak');
    } catch {
      /* 备份失败不影响主流程 */
    }
  }
  fs.renameSync(tmp, DB_FILE);
}

export function nextId(store, prefix) {
  const stamp = fmtDate(new Date()).replace(/-/g, '');
  const key = prefix + '-' + stamp;
  let n = 0;
  for (const a of store.activities) {
    if (a.id && a.id.startsWith(key + '-')) n = Math.max(n, Number(a.id.split('-').pop()) || 0);
  }
  store.seq = store.seq || {};
  store.seq[prefix] = Math.max(Number(store.seq[prefix] || 0) + 1, n + 1);
  return key + '-' + String(store.seq[prefix]).padStart(2, '0');
}

export function findByRef(store, ref) {
  const r = String(ref || '').trim();
  if (!r) return null;
  const list = store.activities;
  const exact = list.find((a) => a.id === r);
  if (exact) return exact;
  const byPrefix = list.filter((a) => a.id.startsWith(r));
  if (byPrefix.length === 1) return byPrefix[0];
  const byUrl = list.filter((a) => (a.url || '').includes(r));
  if (byUrl.length === 1) return byUrl[0];
  const byTitle = list.filter((a) => (a.title || '').includes(r));
  if (byTitle.length === 1) return byTitle[0];
  return null;
}

export function appendEvent(activity, type, detail) {
  activity.events = activity.events || [];
  activity.events.push({ at: nowIso(), type, detail: detail || '' });
  activity.updatedAt = nowIso();
}

export function makeActivity(fields) {
  const at = nowIso();
  return {
    id: fields.id,
    sample: false,
    url: fields.url,
    platform: fields.platform,
    kind: fields.kind || 'lottery',
    title: fields.title || '（未填标题）',
    author: fields.author || '',
    prize: fields.prize || '',
    deadline: fields.deadline || null,
    status: 'pending',
    score: fields.score ?? 0,
    level: fields.level || '存疑',
    hits: fields.hits || [],
    prizeEval: fields.prizeEval || null,
    requirements: fields.requirements || [],
    text: String(fields.text || '').slice(0, 8000),
    notes: fields.notes || '',
    fetch: fields.fetch || null,
    createdAt: at,
    updatedAt: at,
    events: [{ at, type: 'created', detail: '录入' }],
  };
}

// 自动发现：定时跑各平台公开入口，把疑似送福利/抽奖的帖子丢进台账
// 用法：node scripts/discover.mjs [--dry] [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const VERBOSE = process.argv.includes('--verbose');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

const cfg = readJson(path.join(ROOT, 'config/discover.json'), {});
if (cfg.enabled === false) { console.log('discover 已在配置里关闭'); process.exit(0); }

function dataPath() { return path.join(process.env.RADAR_HOME || path.join(ROOT, 'data'), 'activities.json'); }

function markAuto(id) {
  const file = dataPath();
  const db = readJson(file, null);
  if (!db || !Array.isArray(db.activities)) return;
  const a = db.activities.find((x) => x.id === id);
  if (!a) return;
  a.source = 'auto';
  a.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(db, null, 2));
}

const requireWords = cfg.requireWords || [];
const blockWords = cfg.blockWords || [];
const maxNew = Number(cfg.maxNewPerRun) || 8;

function strip(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function pickable(title, desc) {
  const t = strip(title);
  const d = strip(desc);
  const all = t + ' ' + d;
  if (!all.trim()) return false;
  if (blockWords.some((w) => all.includes(w))) return false;
  return requireWords.some((w) => all.includes(w));
}

async function getJson(url, headers) {
  const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' }, headers || {}) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 不是 json */ }
  return { status: r.status, json, text };
}

async function fromBilibili(keywords) {
  const out = [];
  for (const kw of keywords) {
    try {
      const url = 'https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=' + encodeURIComponent(kw) + '&page=1';
      const { status, json } = await getJson(url, { Referer: 'https://search.bilibili.com/' });
      if (!json || json.code !== 0) { if (VERBOSE) console.log('bili 失败', kw, status); continue; }
      for (const it of (json.data && json.data.result) || []) {
        const title = strip(it.title);
        const desc = strip(it.description);
        if (!pickable(title, desc)) continue;
        out.push({
          source: 'bilibili',
          platform: 'bilibili',
          url: it.arcurl || ('https://www.bilibili.com/video/' + it.bvid),
          title: title.slice(0, 80),
          author: strip(it.author),
          desc: desc.slice(0, 600)
        });
      }
    } catch (e) { if (VERBOSE) console.log('bili 异常', kw, e.message); }
  }
  return out;
}

async function fromWeibo(keywords) {
  const out = [];
  for (const kw of keywords) {
    try {
      const url = 'https://m.weibo.cn/api/container/getIndex?containerid=' + encodeURIComponent('100103type=1&q=' + kw) + '&page_type=searchall';
      const { status, json } = await getJson(url, { Referer: 'https://m.weibo.cn/' });
      if (!json || !json.data) { if (VERBOSE) console.log('weibo 跳过', kw, status); continue; }
      const cards = json.data.cards || [];
      for (const c of cards) {
        const mb = c.mblog || (c.card_group && c.card_group[0] && c.card_group[0].mblog);
        if (!mb || !mb.id) continue;
        const text = strip(mb.text);
        if (!pickable(text, '')) continue;
        out.push({
          source: 'weibo',
          platform: 'weibo',
          url: 'https://m.weibo.cn/detail/' + mb.id,
          title: text.slice(0, 60),
          author: (mb.user && mb.user.screen_name) || '',
          desc: text.slice(0, 600)
        });
      }
    } catch (e) { if (VERBOSE) console.log('weibo 异常', kw, e.message); }
  }
  return out;
}

function addOne(cand) {
  const args = [path.join(ROOT, 'radar.mjs'), 'add', cand.url,
    '--desc', (cand.title + '\n' + cand.desc).slice(0, 3000),
    '--title', cand.title,
    '--platform', cand.platform,
    '--kind', 'lottery',
    '--no-fetch', '--json'];
  if (cand.author) args.push('--author', cand.author);
  try {
    const out = execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
    const i = out.indexOf('{');
    if (i < 0) return { ok: false, reason: 'nocjson', out: out.slice(-120) };
    const act = JSON.parse(out.slice(i));
    return { ok: true, id: act.id, score: act.score, level: act.level, verdict: act.prizeEval && act.prizeEval.verdict };
  } catch (e) {
    return { ok: false, reason: String(e.message).slice(0, 120) };
  }
}

const db0 = readJson(dataPath(), { activities: [] });
const todayKey = new Date().toISOString().slice(0, 10);
const autoToday = (db0.activities || []).filter((a) => a.source === 'auto' && String(a.createdAt || '').slice(0, 10) === todayKey).length;
const dailyCap = Number(cfg.dailyCap) || 20;
if (autoToday >= dailyCap) {
  console.log('今天自动发现已到上限 ' + dailyCap + ' 条（' + todayKey + '），本轮跳过');
  process.exit(0);
}

const found = [];
const seen = new Set();
function pushAll(list) {
  for (const c of list) {
    const key = c.url.split('?')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(c);
  }
}

if ((cfg.sources || {}).bilibili !== false) pushAll(await fromBilibili(cfg.keywords.bilibili || []));
if ((cfg.sources || {}).weibo !== false) pushAll(await fromWeibo(cfg.keywords.weibo || []));

console.log('候选：' + found.length + ' 条');

const added = [];
let skipped = 0;
for (const cand of found) {
  if (added.length >= maxNew) break;
  if (DRY) { console.log('· [dry]', cand.platform, cand.title); added.push({ dry: true }); continue; }
  const r = addOne(cand);
  if (r.ok) {
    markAuto(r.id);
    added.push(r);
    const v = r.verdict && (r.verdict.label || r.verdict.key) ? (r.verdict.label || r.verdict.key) : '';
    console.log('+ ' + r.id + ' [' + cand.platform + '] ' + cand.title.slice(0, 40) + ' → ' + r.level + ' ' + r.score + (v ? ' · ' + v : ''));
  } else {
    skipped += 1;
    if (VERBOSE) console.log('- 跳过', cand.url.slice(0, 60), r.reason);
  }
}

console.log('新增 ' + added.length + ' 条，跳过/重复 ' + skipped + ' 条');

#!/usr/bin/env node
// 抽奖情报台 radar —— 半自动抽奖/送福利台账（不登录账号、不代发内容）
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadSettings } from './lib/config.mjs';
import { detectPlatform, platformLabel, platformPrefix, normalizeUrl } from './lib/platform.mjs';
import { evaluateActivity } from './lib/evaluate.mjs';
import { extractRequirements } from './lib/requirements.mjs';
import { buildComment, buildDm, collectTags } from './lib/draft.mjs';
import { loadStore, saveStore, nextId, findByRef, appendEvent, makeActivity, nowIso } from './lib/store.mjs';
import { renderList, renderDetail, renderDigest, renderStats } from './lib/format.mjs';
import { parseDeadline, extractDeadlineFromText, firstMeaningfulLine, daysUntil, todayStr, oneLine } from './lib/util.mjs';
import { DB_FILE, DATA_DIR } from './lib/paths.mjs';
import { CONFIG_FILE } from './lib/config.mjs';

const HELP = [
  '抽奖情报台 radar v0.1 —— 帮你记、帮你判、帮你盯，最后一步你自己点',
  '',
  '录入',
  '  node radar.mjs add <链接> [--desc "正文/要求"] [--title 标题] [--prize 奖品]',
  '                            [--deadline 2026-12-01|12-01|3天后] [--kind lottery|seat|coupon]',
  '                            [--author 博主] [--no-fetch]',
  '  node radar.mjs capture <txt文件>   把"链接+正文"整体粘进文件一次录入',
  '',
  '查看',
  '  node radar.mjs list [--status pending] [--level 可疑] [--platform douyin] [--search 关键词]',
  '  node radar.mjs show <编号>         看判定依据和参与清单',
  '  node radar.mjs due [--days 3]      最近要开奖的',
  '  node radar.mjs remind              每日摘要（给定时任务/通知用）',
  '  node radar.mjs stats               中奖率统计',
  '',
  '推进',
  '  node radar.mjs copy <编号>         输出参与清单 + 可直接复制的评论文案 + 领奖私信',
  '  node radar.mjs done <编号> <要求key>   勾掉一项要求（undo 撤销）',
  '  node radar.mjs set <编号> <状态>   状态：pending/joined/awaiting/won/lost/claimed/skipped',
  '',
  '维护',
  '  node radar.mjs rescore [<编号>|--all]  重新打分',
  '  node radar.mjs edit <编号> [--title ...] [--desc ...] [--deadline ...] [--note ...]',
  '  node radar.mjs remove <编号> --yes',
  '  node radar.mjs export --csv 台账.csv',
  '  node radar.mjs config              打印配置路径和内容',
  '',
  '数据：' + DB_FILE,
  '规则：' + CONFIG_FILE + '（可改关键词、阈值、文案模板、加新平台）',
].join('\n');

const OPTIONS = {
  title: { type: 'string' },
  author: { type: 'string' },
  prize: { type: 'string' },
  deadline: { type: 'string' },
  desc: { type: 'string' },
  'desc-file': { type: 'string' },
  kind: { type: 'string' },
  platform: { type: 'string' },
  status: { type: 'string' },
  level: { type: 'string' },
  verdict: { type: 'string' },
  days: { type: 'string' },
  note: { type: 'string' },
  notes: { type: 'string' },
  search: { type: 'string' },
  csv: { type: 'string' },
  out: { type: 'string' },
  text: { type: 'string' },
  json: { type: 'boolean' },
  'no-fetch': { type: 'boolean' },
  force: { type: 'boolean' },
  yes: { type: 'boolean' },
  undo: { type: 'boolean' },
  all: { type: 'boolean' },
  help: { type: 'boolean' },
};

function parse(argv) {
  const r = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: false });
  return { values: r.values || {}, pos: r.positionals || [] };
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'help';
  const rest = argv[0] && !argv[0].startsWith('-') ? argv.slice(1) : argv;
  const { values, pos } = parse(rest);
  const settings = loadSettings();

  switch (cmd) {
    case 'help': case '--help': case '-h':
      console.log(HELP); return;
    case 'add': return cmdAdd(settings, values, pos);
    case 'capture': return cmdCapture(settings, values, pos);
    case 'list': case 'ls': return cmdList(settings, values);
    case 'show': return cmdShow(settings, values, pos);
    case 'set': return cmdSet(settings, values, pos);
    case 'done': case 'undone': return cmdDone(settings, values, pos, cmd === 'undone');
    case 'copy': return cmdCopy(settings, pos);
    case 'due': return cmdDue(settings, values);
    case 'remind': return cmdRemind(settings, values);
    case 'rescore': return cmdRescore(settings, values, pos);
    case 'edit': return cmdEdit(settings, values, pos);
    case 'remove': case 'rm': return cmdRemove(values, pos);
    case 'stats': return console.log(renderStats(loadStore(), settings));
    case 'export': return cmdExport(values, pos);
    case 'config': return cmdConfig();
    default:
      console.log('不认识的命令：' + cmd + '\n');
      console.log(HELP);
  }
}

function cmdConfig() {
  console.log('配置文件：' + CONFIG_FILE);
  console.log('数据文件：' + DB_FILE);
  console.log('');
  console.log(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

async function fetchMeta(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
      },
      signal: AbortSignal.timeout(9000),
    });
    const html = await res.text();
    const t = pick(html, /<meta[^>]+property=["']og:title["'][^>]*>/i) || pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const d = pick(html, /<meta[^>]+property=["']og:description["'][^>]*>/i) || pick(html, /<meta[^>]+name=["']description["'][^>]*>/i);
    return { ok: true, status: res.status, finalUrl: res.url, title: decodeEntities(t || '').trim(), desc: decodeEntities(d || '').trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function pick(html, tagRe) {
  const block = String(html).match(tagRe);
  if (!block) return '';
  const content = block[0].match(/content=["']([\s\S]*?)["']/i);
  if (content) return content[1];
  const inner = block[0].match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return inner ? inner[1] : '';
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)));
}

function safeChar(code) {
  try { return String.fromCodePoint(code); } catch { return ''; }
}

async function cmdAdd(settings, values, pos) {
  const rawUrl = pos[0];
  if (!rawUrl) throw new Error('缺少链接。用法：node radar.mjs add "<帖子链接>" --desc "正文或要求"');
  const url = normalizeUrl(rawUrl);
  const platform = String(values.platform || detectPlatform(url, settings) || 'other');
  if (!settings.platforms[platform]) throw new Error('未知平台：' + platform);

  const store = loadStore();
  const dup = store.activities.find((a) => normalizeUrl(a.url) === url);
  if (dup && !values.force) {
    console.log('这条已经录过了：' + dup.id + '｜' + dup.title);
    console.log('想再录一条就加 --force');
    return;
  }

  let desc = String(values.desc || '');
  if (values['desc-file']) {
    desc += '\n' + fs.readFileSync(path.resolve(String(values['desc-file'])), 'utf8');
  }
  desc = desc.trim();

  let meta = { ok: false };
  if (!values['no-fetch']) {
    meta = await fetchMeta(url);
    if (!values.json) {
      console.log(meta.ok ? '· 抓页面：成功（' + meta.status + '）' : '· 抓页面：失败（' + (meta.error || '无返回') + '），下面按你贴的正文判断');
    }
  }

  const fetchedText = [meta.title, meta.desc].filter(Boolean).join('\n');
  const text = [desc, fetchedText].filter(Boolean).join('\n').trim().slice(0, 8000);
  if (!text) {
    console.log('! 没有正文，判定和参与清单会不准。建议加：--desc "帖子写了什么要求"');
  }

  const title = oneLine(
    values.title || (meta.ok && meta.title ? meta.title : '') || firstMeaningfulLine(desc) || '（未填标题）',
    80
  );

  let kind = String(values.kind || 'lottery');
  if (!settings.kinds[kind]) throw new Error('未知类型：' + kind + '（可选：' + Object.keys(settings.kinds).join('/') + '）');

  let deadline = null;
  if (values.deadline) {
    const r = parseDeadline(String(values.deadline));
    if (!r.ok) throw new Error('开奖日认不出：' + values.deadline + '（可写 2026-12-01 / 12-01 / 3天后）');
    deadline = r.date;
  } else {
    deadline = extractDeadlineFromText(text);
  }

  const ev = evaluateActivity({ text, title, prize: values.prize }, settings);
  const reqs = extractRequirements(text, kind, settings);

  const activity = makeActivity({
    id: nextId(store, platformPrefix(settings, platform)),
    url,
    platform,
    kind,
    title,
    author: String(values.author || ''),
    prize: String(values.prize || ''),
    deadline,
    text,
    notes: String(values.note || values.notes || ''),
    score: ev.score,
    level: ev.level,
    hits: ev.hits,
    prizeEval: ev.prizeEval,
    requirements: reqs,
    fetch: meta.ok ? { status: meta.status, finalUrl: meta.finalUrl } : null,
  });

  store.activities.push(activity);
  saveStore(store);

  if (values.json) {
    console.log(JSON.stringify(activity, null, 2));
    return;
  }
  console.log('');
  console.log(renderDetail(activity, settings));
  console.log('');
  console.log('已存到台账。下一步：node radar.mjs copy ' + activity.id);
}

function cmdCapture(settings, values, pos) {
  const file = pos[0];
  if (!file) throw new Error('用法：node radar.mjs capture <txt文件>（第一行放链接，其余放正文）');
  const content = fs.readFileSync(path.resolve(file), 'utf8');
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^https?:\/\//i.test(l.trim()));
  if (idx < 0) throw new Error('文件里没找到以 http 开头的链接行');
  const url = lines[idx].trim();
  const desc = lines.filter((_, i) => i !== idx).join('\n').trim();
  return cmdAdd(settings, { ...values, desc }, [url]);
}

function cmdList(settings, values) {
  const store = loadStore();
  const opts = {
    status: values.status,
    platform: values.platform,
    level: values.level,
    verdict: values.verdict,
    kind: values.kind,
    search: values.search,
  };
  if (values.json) {
    const list = store.activities.filter((a) => (!opts.status || a.status === opts.status) && (!opts.platform || a.platform === opts.platform) && (!opts.level || a.level === opts.level));
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  console.log(renderList(store, settings, opts));
}

function cmdShow(settings, values, pos) {
  const store = loadStore();
  const a = findByRef(store, pos[0]);
  if (!a) throw new Error('找不到这条：' + (pos[0] || '(空)'));
  if (values.json) { console.log(JSON.stringify(a, null, 2)); return; }
  console.log(renderDetail(a, settings));
  const tail = (a.events || []).slice(-4);
  if (tail.length) {
    console.log('');
    console.log('最近动态：');
    for (const e of tail) console.log('  · ' + e.at.slice(0, 16).replace('T', ' ') + '　' + e.type + (e.detail ? '　' + e.detail : ''));
  }
}

function cmdSet(settings, values, pos) {
  const ref = pos[0];
  const status = pos[1] || values.status;
  if (!ref || !status) throw new Error('用法：node radar.mjs set <编号> <状态>\n状态可选：' + Object.entries(settings.statuses).map(([k, v]) => k + '(' + v + ')').join(' '));
  const store = loadStore();
  const a = findByRef(store, ref);
  if (!a) throw new Error('找不到这条：' + ref);
  if (!settings.statuses[status]) throw new Error('未知状态：' + status + '，可选：' + Object.keys(settings.statuses).join('/'));
  const before = a.status;
  a.status = status;
  appendEvent(a, 'status', before + ' → ' + status);
  saveStore(store);
  console.log(a.id + '：' + (settings.statuses[before] || before) + ' → ' + settings.statuses[status]);
  if (status === 'won') {
    console.log('');
    console.log('中奖了就把这几件事做掉：');
    console.log('  1. 截图开奖公示（含你的评论/ID），留证');
    console.log('  2. 私信博主领奖：node radar.mjs copy ' + a.id + ' 里有现成话术');
    console.log('  3. 对方要你先付邮费/保证金 → 停，按诈骗处理，别付');
    console.log('  4. 收到奖品后：node radar.mjs set ' + a.id + ' claimed');
  }
}

function cmdDone(settings, values, pos, undo) {
  const ref = pos[0];
  const key = pos[1];
  if (!ref || !key) throw new Error('用法：node radar.mjs ' + (undo ? 'undone' : 'done') + ' <编号> <要求key>\nkey 见 show 输出，如 follow / like / comment');
  const store = loadStore();
  const a = findByRef(store, ref);
  if (!a) throw new Error('找不到这条：' + ref);
  const req = (a.requirements || []).find((r) => r.key === key || r.label === key);
  if (!req) throw new Error('这条活动没有要求项：' + key + '，可选：' + (a.requirements || []).map((r) => r.key).join('/'));
  req.done = !undo;
  appendEvent(a, 'requirement', (undo ? '取消 ' : '完成 ') + req.label);
  saveStore(store);
  const done = (a.requirements || []).filter((r) => r.done).length;
  console.log((req.done ? '[x] ' : '[ ] ') + req.label + '　（' + done + '/' + a.requirements.length + '）');
  if (done === a.requirements.length && a.status === 'pending') {
    console.log('要求都做完了 → 记一笔：node radar.mjs set ' + a.id + ' joined');
  }
}

function cmdCopy(settings, pos) {
  const store = loadStore();
  const a = findByRef(store, pos[0]);
  if (!a) throw new Error('找不到这条：' + (pos[0] || '(空)'));
  const done = (a.requirements || []).filter((r) => r.done).length;
  const total = (a.requirements || []).length;
  console.log('【' + a.id + '】' + a.title);
  console.log('链接：' + a.url);
  console.log('');
  console.log('参与清单（' + done + '/' + total + '）：');
  if (!total) console.log('  （没识别出要求，自己看一眼帖子）');
  for (const r of a.requirements || []) console.log('  ' + (r.done ? '[x]' : '[ ]') + ' ' + r.label + (r.source === 'default' ? '（推断）' : ''));
  console.log('');
  console.log('可复制文案（发出去前自己再看一眼，别带上自己的个人信息）：');
  console.log('  ' + buildComment(a, settings));
  const tags = collectTags(a);
  if (tags.length) console.log('  话题：' + tags.slice(0, 5).join(' '));
  console.log('');
  console.log('万一中了，领奖私信：');
  console.log('  ' + buildDm(a, settings));
  console.log('');
  console.log('做完记得：node radar.mjs set ' + a.id + ' joined');
}

function cmdDue(settings, values) {
  const store = loadStore();
  const days = Number(values.days ?? 3);
  const open = ['pending', 'joined', 'awaiting'];
  const rows = store.activities
    .filter((a) => open.includes(a.status) && a.deadline && daysUntil(a.deadline) <= days)
    .sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
  if (values.json) { console.log(JSON.stringify(rows, null, 2)); return; }
  if (!rows.length) { console.log('最近 ' + days + " 天没有要开奖的。"); return; }
  console.log('最近 ' + days + ' 天要开奖的（' + rows.length + ' 条）：');
  for (const a of rows) {
    const d = daysUntil(a.deadline);
    const when = d < 0 ? '已过 ' + Math.abs(d) + ' 天' : d === 0 ? '今天' : d + ' 天后';
    console.log('  ' + a.deadline + '（' + when + '）' + platformLabel(settings, a.platform) + '｜' + a.title);
    console.log('     ' + a.id + '｜' + a.url);
  }
}

function cmdRemind(settings, values) {
  const text = renderDigest(loadStore(), settings, { days: values.days });
  if (values.out) {
    const dest = path.resolve(String(values.out));
    fs.writeFileSync(dest, text, 'utf8');
    console.log('摘要已写入 ' + dest);
    return;
  }
  console.log(text);
}

function cmdRescore(settings, values, pos) {
  const store = loadStore();
  const targets = values.all || !pos[0] ? store.activities : [findByRef(store, pos[0])].filter(Boolean);
  if (!targets.length) throw new Error('没有可打分的记录');
  for (const a of targets) {
    const ev = evaluateActivity(a, settings);
    const changed = ev.score !== a.score || ev.level !== a.level;
    a.score = ev.score;
    a.level = ev.level;
    a.hits = ev.hits;
    a.prizeEval = ev.prizeEval;
    if (changed) appendEvent(a, 'rescore', '重新打分 ' + ev.score + ' ' + ev.level);
    console.log(a.id + '：' + ev.score + ' 分 ' + ev.level + ' · ' + ev.prizeEval.verdict.label + '　' + a.title.slice(0, 26));
  }
  saveStore(store);
}

function cmdEdit(settings, values, pos) {
  const store = loadStore();
  const a = findByRef(store, pos[0]);
  if (!a) throw new Error('找不到这条：' + (pos[0] || '(空)'));
  const touchesText = values.desc !== undefined || values.text !== undefined;
  if (values.title !== undefined) a.title = oneLine(values.title, 80);
  if (values.author !== undefined) a.author = String(values.author);
  if (values.prize !== undefined) a.prize = String(values.prize);
  if (values.kind !== undefined) {
    if (!settings.kinds[values.kind]) throw new Error('未知类型：' + values.kind);
    a.kind = values.kind;
  }
  if (values.deadline !== undefined) {
    if (!values.deadline) a.deadline = null;
    else {
      const r = parseDeadline(String(values.deadline));
      if (!r.ok) throw new Error('开奖日认不出：' + values.deadline);
      a.deadline = r.date;
    }
  }
  if (touchesText) {
    const t = String(values.desc ?? values.text ?? '');
    a.text = t.slice(0, 8000);
    a.requirements = extractRequirements(a.text, a.kind, settings);
    if (!a.deadline) {
      const d = extractDeadlineFromText(a.text);
      if (d) a.deadline = d;
    }
  }
  const ev = evaluateActivity(a, settings);
  a.score = ev.score; a.level = ev.level; a.hits = ev.hits; a.prizeEval = ev.prizeEval;
  if (values.note !== undefined || values.notes !== undefined) a.notes = String(values.note ?? values.notes ?? '');
  appendEvent(a, 'edit', Object.keys(values).filter((k) => k !== 'json').join(','));
  saveStore(store);
  console.log(renderDetail(a, settings));
}

function cmdRemove(values, pos) {
  const store = loadStore();
  const a = findByRef(store, pos[0]);
  if (!a) throw new Error('找不到这条：' + (pos[0] || '(空)'));
  if (!values.yes) {
    console.log('要删的是：' + a.id + '｜' + a.title);
    console.log('确认删除请加 --yes');
    return;
  }
  store.activities = store.activities.filter((x) => x.id !== a.id);
  saveStore(store);
  console.log('已删除 ' + a.id);
}

function cmdExport(values, pos) {
  const store = loadStore();
  const settings = loadSettings();
  const dest = path.resolve(String(values.csv || pos[0] || 'lottery-radar-export.csv'));
  const cols = ['id', 'platform', 'title', 'author', 'prize', 'deadline', 'status', 'score', 'level', 'url', 'createdAt'];
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [cols.join(',')];
  for (const a of store.activities) {
    const row = { ...a, platform: platformLabel(settings, a.platform), status: settings.statuses?.[a.status] || a.status };
    lines.push(cols.map((c) => esc(row[c])).join(','));
  }
  fs.writeFileSync(dest, '\ufeff' + lines.join('\r\n'), 'utf8');
  console.log('导出 ' + store.activities.length + ' 条 → ' + dest);
}

main().catch((e) => {
  console.error('出错了：' + e.message);
  process.exitCode = 1;
});

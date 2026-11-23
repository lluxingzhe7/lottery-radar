#!/usr/bin/env node
// 把台账渲染成手机端单页（内嵌数据，不依赖接口）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings } from '../lib/config.mjs';
import { loadStore } from '../lib/store.mjs';
import { buildComment, buildDm } from '../lib/draft.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.RADAR_OUT ? path.resolve(process.env.RADAR_OUT) : path.join(ROOT, '_site');
const DEMO = process.env.RADAR_DEMO === '1';

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

const site = readJson(path.join(ROOT, 'site.config.json'), {});
const title = site.title || '抽奖情报台';
const tz = site.timezone || 'Asia/Shanghai';
const repo = site.repo || '';
const repoOk = /^[\w.-]+\/[\w.-]+$/.test(repo) && !repo.startsWith('your-');

const settings = loadSettings();
const store = loadStore();

function todayInTZ(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return parts;
}

const today = todayInTZ(tz);
const todayMs = Date.parse(today + 'T00:00:00Z');

function daysTo(deadline) {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  return Math.round((Date.parse(deadline + 'T00:00:00Z') - todayMs) / 86400000);
}

function deadlineLabel(deadline, days) {
  if (!deadline) return '';
  const m = deadline.match(/^\d{4}-(\d{2})-(\d{2})$/);
  const base = m ? Number(m[1]) + '月' + Number(m[2]) + '日' : deadline;
  if (days === null) return base;
  if (days < 0) return base + ' · 已过 ' + -days + ' 天';
  if (days === 0) return base + ' · 今天开奖';
  if (days === 1) return base + ' · 明天开奖';
  return base + ' · ' + days + ' 天后';
}

const items = (store.activities || []).map((a) => {
  const days = daysTo(a.deadline);
  const hits = (a.hits || []).filter((h) => h.kind === 'veto' || h.kind === 'risk');
  return {
    id: a.id,
    url: a.url,
    platform: a.platform,
    platformLabel: (settings.platforms || {})[a.platform]?.label || a.platform,
    platClass: (settings.platforms || {})[a.platform]?.prefix || 'oth',
    kindLabel: (settings.kinds || {})[a.kind] || a.kind,
    title: a.title || '(无标题)',
    author: a.author || '',
    prize: a.prize || '',
    deadline: a.deadline || '',
    deadlineLabel: deadlineLabel(a.deadline, days),
    daysLeft: days,
    status: a.status,
    statusLabel: (settings.statuses || {})[a.status] || a.status,
    score: a.score == null ? '' : a.score,
    level: a.level || '',
    warnings: hits.map((h) => ({ label: h.label, points: h.points, kind: h.kind })),
    requirements: (a.requirements || []).map((r) => ({ key: r.key, label: r.label, done: !!r.done })),
    comment: buildComment(a, settings),
    dm: buildDm(a, settings),
    prizeEval: a.prizeEval
      ? {
          value: a.prizeEval.value,
          category: a.prizeEval.category,
          quality: a.prizeEval.quality,
          coupon: a.prizeEval.coupon,
          verdict: a.prizeEval.verdict,
        }
      : null,
    verdictKey: a.prizeEval?.verdict?.key || 'judge',
    sample: !!a.sample,
    createdAt: a.createdAt || '',
  };
});

// 筛掉的和可疑的默认不上页面：只有当它已经参与/中奖时还留着，方便追开奖和领奖
const visible = items.filter((it) => {
  const messy = it.verdictKey === 'drop' || it.level === '可疑';
  const keepIfInvolved = it.status === 'joined' || it.status === 'awaiting' || it.status === 'won' || it.status === 'claimed';
  return !messy || keepIfInvolved;
});
items.length = 0;
items.push(...visible);

// 平台筛选：按 settings 里的顺序，只保留页面里真的出现过的平台
const usedPlats = new Set(items.map((it) => it.platform));
const platList = Object.entries(settings.platforms || {})
  .filter(([key]) => key !== 'other' && usedPlats.has(key))
  .map(([key, cfg]) => ({ key, label: cfg.label, cls: cfg.prefix }));
if (items.some((it) => it.platform === 'other' || !platList.some((p) => p.key === it.platform))) {
  platList.push({ key: 'other', label: '其他', cls: 'oth' });
}

const rank = (it) => {
  if (it.status === 'won') return 0;
  if (it.status === 'lost' || it.status === 'claimed' || it.status === 'skipped') return 3;
  if (it.verdictKey === 'drop') return 2;
  return 1;
};
items.sort((x, y) => {
  if (rank(x) !== rank(y)) return rank(x) - rank(y);
  const dx = x.deadline || '9999-99-99';
  const dy = y.deadline || '9999-99-99';
  if (dx !== dy) return dx < dy ? -1 : 1;
  return (y.score || 0) - (x.score || 0);
});

const data = {
  title,
  platforms: platList,
  builtAt: today + ' ' + new Intl.DateTimeFormat('zh-CN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
  items,
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const repoUrl = repoOk ? 'https://github.com/' + repo : '#';
const newIssue = repoOk ? 'https://github.com/' + repo + '/issues/new?template=capture.yml' : '#';

const template = fs.readFileSync(path.join(ROOT, 'web', 'site.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'web', 'site.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'web', 'site.js'), 'utf8');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const banner = DEMO
  ? '<div class="banner">预览模式 · 以下是示例数据，部署后换成你自己的记录</div>'
  : '';

const html = template
  .split('{{TITLE}}').join(esc(title))
  .split('{{CSS}}').join(css)
  .split('{{JS}}').join(js)
  .split('{{DATA}}').join(json)
  .split('{{REPO_URL}}').join(repoUrl)
  .split('{{NEW_ISSUE}}').join(newIssue)
  .split('{{BANNER}}').join(banner);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');
fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(data, null, 2), 'utf8');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '', 'utf8');

console.log('已生成 ' + path.join(OUT, 'index.html') + '（' + items.length + ' 条，' + Math.round(html.length / 1024) + ' KB）');
if (!repoOk) console.log('提示：site.config.json 里的 repo 还是占位值，投稿按钮和仓库链接暂时不可用。');

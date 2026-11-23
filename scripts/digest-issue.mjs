#!/usr/bin/env node
// 每日提醒：刚中奖还没领的、快截止还没参加的、等着开奖的
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings } from '../lib/config.mjs';
import { loadStore } from '../lib/store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.out');
fs.mkdirSync(OUT, { recursive: true });

loadSettings();
const store = loadStore();
const owner = process.env.REPO_OWNER || '';

function readSiteConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8')); } catch { return {}; }
}
const site = readSiteConfig();
const tz = site.timezone || 'Asia/Shanghai';
const windowDays = Number(site.digestDays) > 0 ? Number(site.digestDays) : 3;
const repoName = site.repo && site.repo.indexOf('/') > -1 ? site.repo.split('/')[1] : 'lottery-radar';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const todayMs = Date.parse(today + 'T00:00:00Z');

function daysTo(d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return Math.round((Date.parse(d + 'T00:00:00Z') - todayMs) / 86400000);
}
function shortDate(d) {
  const m = String(d).match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? Number(m[1]) + '月' + Number(m[2]) + '日' : d;
}
function line(a) {
  const d = daysTo(a.deadline);
  const parts = ['[' + a.title + '](' + a.url + ')'];
  if (a.deadline) {
    parts.push('开奖 ' + shortDate(a.deadline) + (d === null ? '' : d < 0 ? '（已过 ' + -d + ' 天）' : d === 0 ? '（今天）' : '（' + d + ' 天后）'));
  }
  if (a.prize) parts.push('🎁 ' + a.prize);
  parts.push('\u0060' + a.id + '\u0060');
  return '- ' + parts.join(' ｜ ');
}

const acts = store.activities || [];
const won = acts.filter(function (a) { return a.status === 'won'; });
const joined = acts.filter(function (a) { return a.status === 'joined' || a.status === 'awaiting'; });
const pendingSoon = acts.filter(function (a) {
  if (a.status !== 'pending' || a.level === '可疑') return false;
  if (a.prizeEval && a.prizeEval.verdict && a.prizeEval.verdict.key === 'drop') return false;
  const d = daysTo(a.deadline);
  return d !== null && d >= 0 && d <= windowDays;
});
const droppedSoon = acts.filter(function (a) {
  if (a.status !== 'pending') return false;
  if (!(a.prizeEval && a.prizeEval.verdict && a.prizeEval.verdict.key === 'drop')) return false;
  const d = daysTo(a.deadline);
  return d !== null && d >= 0 && d <= windowDays;
});

const lines = [];
lines.push((owner ? '@' + owner + ' ' : '') + '抽奖提醒 ' + today);
lines.push('');
lines.push('手机网页：https://' + (owner || 'you') + '.github.io/' + repoName + '/');
lines.push('');

if (!won.length && !pendingSoon.length && !joined.length) {
  fs.writeFileSync(path.join(OUT, 'digest.json'), JSON.stringify({ hasItems: false }, null, 2), 'utf8');
  console.log('没有要提醒的事');
  process.exit(0);
}

if (won.length) {
  lines.push('## 🎉 中了，去领');
  lines.push('');
  won.forEach(function (a) { lines.push(line(a)); });
  lines.push('');
  lines.push('领完在这条 issue 评论 \u0060/领奖 编号\u0060；要私信博主领奖，网页上「复制评论」旁边还有一段领奖私信。');
  lines.push('');
}
if (pendingSoon.length) {
  lines.push('## ⏰ ' + windowDays + ' 天内开奖，还没参加');
  lines.push('');
  pendingSoon.forEach(function (a) { lines.push(line(a)); });
  lines.push('');
  lines.push('参加完在这条 issue 评论 \u0060/参与 编号\u0060，之后就不再催了。');
  if (droppedSoon.length) lines.push('（另有 ' + droppedSoon.length + ' 条按你的规则筛掉了：太便宜 / 入口上身的 / 限定券，不值得花时间。）');
  lines.push('');
}
if (joined.length) {
  lines.push('## 👀 等着开奖');
  lines.push('');
  joined.forEach(function (a) { lines.push(line(a)); });
  lines.push('');
  lines.push('开奖后瞄一眼评论区；中了发 \u0060/中奖 编号\u0060，没中发 \u0060/未中 编号\u0060。');
  lines.push('');
}
lines.push('---');
lines.push('这个工具不读你的私信，中奖要你自己发现，标记 \u0060/中奖\u0060 之后才会提醒你领奖。');

fs.writeFileSync(path.join(OUT, 'digest.md'), lines.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(OUT, 'digest.json'), JSON.stringify({
  hasItems: true, title: '抽奖提醒 · ' + today,
  won: won.length, pendingSoon: pendingSoon.length, joined: joined.length,
}, null, 2), 'utf8');
console.log('提醒已生成：中奖 ' + won.length + '，快截止 ' + pendingSoon.length + '，等开奖 ' + joined.length);

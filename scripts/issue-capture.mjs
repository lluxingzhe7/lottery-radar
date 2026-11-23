#!/usr/bin/env node
// GitHub issue 投稿 -> radar add。不登录任何平台账号，只解析你贴的链接和正文。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.out');
fs.mkdirSync(OUT, { recursive: true });

const body = process.env.ISSUE_BODY || '';
const issueTitle = (process.env.ISSUE_TITLE || '').replace(/^\s*\[投稿\]\s*/, '').trim();

function section(name) {
  const re = new RegExp('###\\s*' + name + '\\s*\\n([\\s\\S]*?)(?=\\n###\\s|$)', 'i');
  const m = body.match(re);
  if (!m) return '';
  const v = m[1].trim();
  return /^_No response_$/i.test(v) ? '' : v;
}

const URL_RE = /https?:\/\/[^\s)\]>]+/;
const formUrl = section('链接');
const url = (formUrl.match(URL_RE) || body.match(URL_RE) || [])[0] || '';

function stripComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, '').trim();
}

const secText = section('正文或要求');
const secPrize = section('奖品');
const secDeadline = section('开奖日期');
const secAuthor = section('博主');

const parts = [];
if (secText) parts.push(secText);
if (secPrize) parts.push('奖品：' + secPrize);
if (secDeadline) parts.push('开奖日期：' + secDeadline);
if (secAuthor) parts.push('博主：' + secAuthor);
if (!parts.length) {
  parts.push(stripComments(body).split(/\r?\n/).filter(function (l) {
    return !/^###/.test(l) && l.indexOf('http') !== 0;
  }).join('\n'));
}

const descFile = path.join(OUT, 'desc.txt');
fs.writeFileSync(descFile, parts.filter(Boolean).join('\n').trim(), 'utf8');

const result = { ok: false, id: '', duplicate: false, message: '' };

function runRadar(args) {
  return execFileSync(process.execPath, ['radar.mjs'].concat(args), {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
  });
}

function writeOut(text) {
  fs.writeFileSync(path.join(OUT, 'comment.md'), text + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2), 'utf8');
  process.exit(0);
}

if (!url) {
  result.message = 'no-url';
  writeOut('没在投稿里找到链接。请编辑这条 issue，把 https:// 开头的帖子链接填到「链接」一栏。');
}

const base = ['add', url, '--desc-file', descFile, '--no-fetch', '--json'];
if (issueTitle) base.push('--title', issueTitle);
if (secPrize) base.push('--prize', secPrize);
if (secAuthor) base.push('--author', secAuthor);
if (secDeadline) base.push('--deadline', secDeadline);

let stdout = '';
try {
  stdout = runRadar(base);
} catch (e) {
  const msg = String((e.stderr || e.stdout || e.message || '')).trim();
  if (/开奖日认不出/.test(msg) && secDeadline) {
    const retry = base.filter(function (x, i, arr) { return !(x === '--deadline' || arr[i - 1] === '--deadline'); });
    try {
      stdout = runRadar(retry);
    } catch (e2) {
      writeOut('入库失败：' + String((e2.stderr || e2.stdout || e2.message || '')).trim().slice(0, 600));
    }
  } else {
    writeOut('入库失败：' + msg.slice(0, 600));
  }
}

const start = stdout.indexOf('{');
if (start < 0) {
  result.duplicate = true;
  result.message = 'duplicate';
  writeOut('这条已经录过了：' + stdout.trim().split('\n')[0] + '\n\n确实要再录一条的话，把链接加个参数（比如结尾加 ?h=2）重新投稿。');
}

let activity;
try {
  activity = JSON.parse(stdout.slice(start));
} catch (e) {
  writeOut('入库失败：台账返回的不是 JSON。' + stdout.slice(0, 400));
}

result.ok = true;
result.id = activity.id;

const hits = (activity.hits || []).filter(function (h) { return h.kind === 'veto' || h.kind === 'risk'; });
const reqs = (activity.requirements || []).map(function (r) { return '- [ ] ' + r.label; });
const lines = [];
lines.push('已入库：**' + activity.id + '**　判定 **' + activity.level + ' ' + activity.score + '/100**');
lines.push('');
lines.push('标题：' + activity.title);
if (activity.deadline) lines.push('开奖日：' + activity.deadline);
if (activity.prize) lines.push('奖品：' + activity.prize);
lines.push('');
if (activity.prizeEval) {
  const pv = activity.prizeEval;
  lines.push('奖品评估：' + pv.category.label + ' · ' + pv.value.label);
  lines.push('筛选结论：**' + pv.verdict.label + '**' + ((pv.verdict.reasons && pv.verdict.reasons.length) ? '（' + pv.verdict.reasons.join('；') + '）' : ''));
  lines.push('');
}
if (hits.length) {
  lines.push('**要留意的点**');
  lines.push('');
  hits.forEach(function (h) { lines.push('- ' + (h.kind === 'veto' ? '⛔ 红线：' : '⚠️ ') + h.label + '（' + h.points + '）'); });
  if (activity.level === '可疑') {
    lines.push('');
    lines.push('> 判定为可疑，大概率是引流或刷单。建议跳过：别付钱、别加私人微信。');
  }
  lines.push('');
}
if (reqs.length) {
  lines.push('**参与清单**');
  lines.push('');
  lines.push(reqs.join('\n'));
  lines.push('');
}
lines.push('下一步：打开手机网页点「打开原帖」按清单做，评论文案在网页上点「复制评论」。');
lines.push('');
lines.push('做完了在这条 issue 评论 \u0060/参与 ' + activity.id + '\u0060；中奖了评论 \u0060/中奖 ' + activity.id + '\u0060。');

writeOut(lines.join('\n'));
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'id=' + activity.id + '\nok=true\n');
}

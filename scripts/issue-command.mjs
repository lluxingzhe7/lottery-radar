#!/usr/bin/env node
// issue 评论命令 -> 改台账状态。评论格式：/中奖 xhs-20261123-01
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.out');
fs.mkdirSync(OUT, { recursive: true });

const body = (process.env.COMMENT_BODY || '').trim();
const MAP = {
  '参与': 'joined',
  '已参与': 'joined',
  '中奖': 'won',
  '中了': 'won',
  '领奖': 'claimed',
  '已领': 'claimed',
  '未中': 'lost',
  '没中': 'lost',
  '跳过': 'skipped',
  '待参与': 'pending',
  '待开奖': 'awaiting',
};

const result = { ok: false, id: '', status: '', message: '' };

function writeOut(text) {
  fs.writeFileSync(path.join(OUT, 'comment.md'), text + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2), 'utf8');
  process.exit(0);
}

const tokens = body.split(/\s+/).filter(Boolean);
const cmd = (tokens[0] || '').replace(/^\//, '');
const id = tokens[1] || '';

if (cmd === '帮助' || cmd === 'help') {
  writeOut([
    '可用命令：',
    '',
    '- \u0060/参与 编号\u0060 标记已参加，进入等开奖',
    '- \u0060/中奖 编号\u0060 记录中奖，会进下一次提醒',
    '- \u0060/领奖 编号\u0060 已经领到手',
    '- \u0060/未中 编号\u0060 没中',
    '- \u0060/跳过 编号\u0060 不参加（可疑的用这个）',
    '- \u0060/待参与 编号\u0060 改回待参与',
    '- \u0060/删除 编号\u0060 从台账删掉',
  ].join('\n'));
}

const known = cmd === '删除' || cmd === 'delete' || !!MAP[cmd];
if (!known) {
  writeOut('不认识的命令 \u0060/' + cmd + '\u0060。发 \u0060/帮助\u0060 看支持的写法。');
}
if (!id) {
  writeOut('还差编号。写法：\u0060/' + cmd + ' xhs-20261123-01\u0060，编号在手机网页每张卡片标题下面。');
}

let args;
if (cmd === '删除' || cmd === 'delete') {
  args = ['remove', id, '--yes'];
} else {
  result.status = MAP[cmd];
  args = ['set', id, result.status];
}

let out = '';
try {
  out = execFileSync(process.execPath, ['radar.mjs'].concat(args), {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  });
} catch (e) {
  writeOut('没改成：' + String((e.stderr || e.stdout || e.message || '')).trim().slice(0, 400));
}

result.ok = true;
result.id = id;
writeOut('已更新 **' + id + '**' + (result.status ? ' → ' + result.status : '') + '\n\n\u0060\u0060\u0060\n' + out.trim().slice(0, 1200) + '\n\u0060\u0060\u0060');

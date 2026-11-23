import { displayWidth, truncateDisplay, padDisplay, daysUntil, dueText, todayStr } from './util.mjs';
import { platformLabel } from './platform.mjs';
import { requirementProgress } from './requirements.mjs';

export function renderList(store, settings, opts = {}) {
  let rows = store.activities.slice();
  if (opts.status) rows = rows.filter((a) => a.status === opts.status);
  if (opts.platform) rows = rows.filter((a) => a.platform === opts.platform);
  if (opts.level) rows = rows.filter((a) => a.level === opts.level);
  if (opts.kind) rows = rows.filter((a) => a.kind === opts.kind);
  if (opts.verdict) rows = rows.filter((a) => (a.prizeEval?.verdict?.key || 'judge') === opts.verdict);
  if (opts.search) {
    const q = String(opts.search);
    rows = rows.filter((a) => (a.title + ' ' + a.author + ' ' + (a.prize || '')).includes(q));
  }
  if (!rows.length) return '（没有符合条件的记录）';

  rows.sort((a, b) => {
    const da = a.deadline || '9999-99-99';
    const db = b.deadline || '9999-99-99';
    if (da !== db) return da < db ? -1 : 1;
    return (b.score || 0) - (a.score || 0);
  });

  const header = ['编号', '平台', '评分', '判定', '奖品筛选', '状态', '开奖日', '标题'];
  const body = rows.map((a) => [
    a.id,
    platformLabel(settings, a.platform),
    String(a.score ?? ''),
    a.level || '',
    prizeTag(a),
    settings.statuses?.[a.status] || a.status,
    a.deadline || '—',
    (a.sample ? '[示例] ' : '') + truncateDisplay(a.title, 34),
  ]);

  const widths = header.map((h, i) => Math.max(displayWidth(h), ...body.map((r) => displayWidth(r[i]))));
  const line = (cells) => cells.map((c, i) => padDisplay(c, widths[i])).join('  ').trimEnd();
  const out = [line(header), widths.map((w) => '─'.repeat(w)).join('  ')];
  for (const r of body) out.push(line(r));
  out.push('');
  out.push(summary(store, settings));
  return out.join('\n');
}

function prizeTag(a) {
  const pv = a.prizeEval;
  if (!pv) return '—';
  const v = pv.value?.level === 'high' ? '贵' : pv.value?.level === 'low' ? '便宜' : pv.value?.level === 'mid' ? '中档' : '价值不明';
  return (pv.verdict?.label || '待判断') + '·' + v;
}

function summary(store, settings) {
  const stat = {};
  for (const a of store.activities) stat[a.status] = (stat[a.status] || 0) + 1;
  const parts = Object.entries(settings.statuses || {})
    .filter(([k]) => stat[k])
    .map(([k, label]) => label + ' ' + stat[k]);
  return '共 ' + store.activities.length + ' 条' + (parts.length ? ' · ' + parts.join(' · ') : '');
}

export function renderDetail(a, settings) {
  const L = [];
  L.push('【' + a.id + '】' + a.title);
  if (a.sample) L.push('（示例数据，可删）');
  L.push('');
  L.push('平台：' + platformLabel(settings, a.platform) + '    类型：' + (settings.kinds?.[a.kind] || a.kind));
  L.push('状态：' + (settings.statuses?.[a.status] || a.status) + '    开奖：' + (a.deadline ? a.deadline + '（' + dueText(a.deadline) + '）' : '未填'));
  L.push('可信号：' + a.score + ' 分 · ' + a.level);
  if (a.author) L.push('博主/作者：' + a.author);
  if (a.prize) L.push('奖 品：' + a.prize);
  if (a.prizeEval) {
    const pv = a.prizeEval;
    L.push('奖品评估：' + pv.category.label + ' · ' + pv.value.label + (pv.quality.label ? ' · ' + pv.quality.label : ''));
    L.push('筛选结论：' + pv.verdict.label + (pv.verdict.reasons && pv.verdict.reasons.length ? '（' + pv.verdict.reasons.join('；') + '）' : ''));
  }

  if (a.hits && a.hits.length) {
    L.push('');
    L.push('判定依据：');
    for (const h of a.hits) {
      const tag = h.kind === 'veto' ? '⛔ 红线' : h.kind === 'risk' ? '⚠ 扣分' : '✓ 加分';
      const sign = h.kind === 'bonus' ? '+' : '-';
      L.push('  ' + tag + ' ' + sign + h.points + '　' + h.label);
    }
  }

  if (a.requirements && a.requirements.length) {
    const p = requirementProgress(a);
    L.push('');
    L.push('参与要求（已完成 ' + p.done + '/' + p.total + '）：');
    for (const r of a.requirements) {
      L.push('  ' + (r.done ? '[x]' : '[ ]') + ' ' + r.label + (r.source === 'default' ? '（推断，可删）' : ''));
    }
  }

  const warnings = [];
  if (a.hits && a.hits.some((h) => h.kind === 'veto')) warnings.push('命中红线：这条大概率是割韭菜，别付一分钱、别加微信');
  if (a.prizeEval?.verdict?.key === 'drop') warnings.push('按你的筛选规则已判「筛掉」：' + (a.prizeEval.verdict.reasons.join('；') || '不值得参与'));
  if (a.level !== '可信') warnings.push('人工复核三步：点进主页看是不是本人号 → 翻评论区看有没有真实中奖反馈 → 看上期有没有开奖公示');
  if (a.deadline && daysUntil(a.deadline) < 0) warnings.push('开奖日已过，去公示帖看一眼有没有你，然后标记结果');
  if (warnings.length) {
    L.push('');
    for (const w of warnings) L.push('! ' + w);
  }

  if (a.notes) {
    L.push('');
    L.push('备注：' + a.notes);
  }
  L.push('');
  L.push('操作：node radar.mjs copy ' + a.id + '（出清单+文案）  set ' + a.id + ' <状态>');
  L.push('链接：' + a.url);
  return L.join('\n');
}

export function renderDigest(store, settings, opts = {}) {
  const days = Number(opts.days ?? 3);
  const open = ['pending', 'joined', 'awaiting'];
  const due = store.activities.filter((a) => open.includes(a.status) && a.deadline && daysUntil(a.deadline) <= days);
  const pendingAll = store.activities.filter((a) => a.status === 'pending');
  const dropped = pendingAll.filter((a) => a.prizeEval?.verdict?.key === 'drop').length;
  const pending = pendingAll.filter((a) => a.prizeEval?.verdict?.key !== 'drop');
  const won = store.activities.filter((a) => a.status === 'won');
  const samples = store.activities.filter((a) => a.sample).length;

  const L = [];
  L.push('抽奖情报台 · ' + todayStr() + ' · 摘要');
  L.push('');

  L.push('【该盯开奖了】' + (due.length ? due.length + ' 条' : '无'));
  for (const a of due) {
    const d = daysUntil(a.deadline);
    const when = d < 0 ? '已过 ' + Math.abs(d) + ' 天' : d === 0 ? '今天' : d + ' 天后';
    L.push('  · ' + a.deadline + '（' + when + '）' + platformLabel(settings, a.platform) + '｜' + truncateDisplay(a.title, 30) + '｜' + a.id);
  }
  if (due.length) L.push('  → 点开链接看开奖公示，中了就：node radar.mjs set <编号> won');

  L.push('');
  const ranked = pending.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  const visible = ranked.filter((a) => a.level !== '可疑');
  const risky = ranked.filter((a) => a.level === '可疑');
  L.push('【还没参加】' + (pending.length ? pending.length + ' 条' : '无') + (dropped ? '（另有 ' + dropped + ' 条按规则筛掉了）' : ''));
  for (const a of visible.slice(0, 10)) {
    L.push('  · ' + a.id + '｜' + platformLabel(settings, a.platform) + '｜' + truncateDisplay(a.title, 30) + '｜' + a.score + ' 分 ' + a.level);
  }
  for (const a of risky.slice(0, 5)) {
    L.push('  · ' + a.id + '｜' + platformLabel(settings, a.platform) + '｜' + truncateDisplay(a.title, 30) + '｜' + a.score + ' 分 可疑，建议跳过');
  }

  L.push('');
  L.push('【已中奖待领】' + (won.length ? won.length + ' 条' : '无'));
  for (const a of won) {
    L.push('  · ' + a.id + '｜' + truncateDisplay(a.title, 30) + '｜赶紧私信博主留地址/兑奖');
  }

  L.push('');
  L.push('【提醒】中奖只认博主公示或私信，别信"先付邮费再发货"的中奖通知。');
  if (samples) L.push('（台账里有 ' + samples + ' 条示例数据，删掉更清爽：node radar.mjs remove <编号> --yes）');
  return L.join('\n');
}

export function renderStats(store, settings) {
  const total = store.activities.length;
  const byStatus = {};
  const byPlatform = {};
  for (const a of store.activities) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byPlatform[a.platform] = (byPlatform[a.platform] || 0) + 1;
  }
  const won = byStatus.won || 0;
  const lost = byStatus.lost || 0;
  const closed = won + lost + (byStatus.claimed || 0);
  const L = [];
  L.push('台账统计');
  L.push('  总数：' + total);
  L.push('  按状态：' + Object.entries(byStatus).map(([k, v]) => (settings.statuses?.[k] || k) + ' ' + v).join(' · '));
  L.push('  按平台：' + Object.entries(byPlatform).map(([k, v]) => platformLabel(settings, k) + ' ' + v).join(' · '));
  L.push('  已开奖：' + closed + ' 条，中 ' + won + ' 条' + (closed ? '，中奖率 ' + Math.round((won / closed) * 100) + '%' : ''));
  return L.join('\n');
}

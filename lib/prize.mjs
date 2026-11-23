// 奖品价值 / 品类 / 质量风险 / 券限制 评估
const CN_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 五: 5, 十: 10 };

function safeTest(pattern, text) {
  try { return new RegExp(pattern).test(text); } catch { return false; }
}

function firstMatch(pattern, text) {
  try { return new RegExp(pattern).exec(text); } catch { return null; }
}

// 从正文里抠金额：¥199 / 199元 / 价值 300 / 100 块钱
export function extractAmount(text) {
  const s = String(text || '');
  const p1 = /(?:¥|￥)\s*(\d+(?:\.\d+)?)/;
  const p2 = /(\d+(?:\.\d+)?)\s*(?:元|块钱|大洋)/;
  const p3 = /价值\s*(\d+(?:\.\d+)?)/;
  for (const p of [p1, p2, p3]) {
    const m = firstMatch(p, s);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

// 限定词匹配：「满」要求后面带数字/额度，避免「满足」误判
function matchRestrict(keywords, text) {
  for (const k of keywords) {
    if (k === '满') {
      if (/满\s*\d+|满额|满减|满\s*\d+\s*元?\s*(?:可用|使用|起)/.test(text)) return k;
      continue;
    }
    if (text.includes(k)) return k;
  }
  return null;
}

export function evaluatePrize(activity, settings) {
  const cfg = settings.prize || {};
  const text = [activity.prize, activity.title, activity.text].filter(Boolean).join('\n');
  const reasons = [];

  // 品类
  let category = { key: 'other', label: '其他' };
  for (const c of cfg.categories || []) {
    if (c.pattern && safeTest(c.pattern, text)) { category = { key: c.key, label: c.label, risk: !!c.risk }; break; }
  }

  // 价值档
  const amount = extractAmount(text);
  const lowHit = (cfg.lowValueKeywords || []).find((k) => text.includes(k));
  const highHit = (cfg.highValueKeywords || []).find((k) => text.includes(k));
  const minAmount = Number(cfg.minAmount ?? 50);
  const highAmount = Number(cfg.highAmount ?? 150);
  let value = { level: 'unknown', amount, label: '价值不明' };
  if (amount !== null) {
    if (amount >= highAmount) { value = { level: 'high', amount, label: '约 ' + amount + ' 元，算贵的' }; }
    else if (amount >= minAmount) { value = { level: 'mid', amount, label: '约 ' + amount + ' 元' }; }
    else { value = { level: 'low', amount, label: '约 ' + amount + ' 元，太便宜' }; }
  } else if (highHit) {
    value = { level: 'high', amount: null, label: '高价值品类（' + highHit + '），具体价格待核' };
  } else if (lowHit) {
    value = { level: 'low', amount: null, label: '低价物品（' + lowHit + '）' };
  }
  if (lowHit && value.level !== 'low') {
    reasons.push('含低价品类词「' + lowHit + '」');
    value = { ...value, level: 'low', label: value.label + '，且含小样/券类' };
  }

  // 质量风险：入口、上身的
  const officialHit = (cfg.officialHints || []).find((k) => text.includes(k));
  const qualityRisk = !!category.risk;
  const quality = {
    risk: qualityRisk && !officialHit,
    label: qualityRisk
      ? (officialHit ? '入口/上身物品，出自官方（' + officialHit + '），仍需看评价' : '入口/上身物品，来源不明，质量没法保证')
      : '',
  };

  // 券/红包：看是否限定使用
  const cashLike = /红包|现金/.test(text);
  const restrictHit = matchRestrict(cfg.couponRestrictKeywords || [], text);
  const isCoupon = category.key === 'coupon'
    || /券|满减|抵扣/.test([activity.prize, activity.title].filter(Boolean).join(' '))
    || (cashLike && !!restrictHit);
  const coupon = {
    isCoupon,
    restricted: isCoupon && !!restrictHit,
    label: isCoupon ? (restrictHit ? '券有使用限制（' + restrictHit + '）' : '券，未看到使用限制') : '',
  };

  // 结论
  let verdict = 'keep';
  if (coupon.restricted) { verdict = 'drop'; reasons.push('限定使用的券/红包，实际用不上'); }
  else if (value.level === 'low') { verdict = 'drop'; reasons.push('太便宜，凑热闹不值得'); }
  else if (quality.risk) { verdict = 'drop'; reasons.push('入口/上身的东西，质量没法保证'); }
  else if (value.level === 'unknown') verdict = 'judge';

  const label = verdict === 'drop' ? '筛掉' : verdict === 'judge' ? '待判断' : '推荐';
  return { value, category, quality, coupon, verdict: { key: verdict, label, reasons } };
}

export const PRIZE_LABELS = { high: '贵', mid: '中档', low: '便宜', unknown: '不明' };

// 打分增量
export function prizeDelta(pv) {
  let d = 0;
  const hits = [];
  if (pv.value.level === 'high') { d += 10; hits.push({ kind: 'bonus', id: 'valueHigh', label: '奖品算贵的', points: 10 }); }
  if (pv.value.level === 'low') { d -= 25; hits.push({ kind: 'risk', id: 'valueLow', label: '奖品太便宜', points: 25 }); }
  if (pv.quality.risk) { d -= 20; hits.push({ kind: 'risk', id: 'quality', label: '入口/上身物品来源不明', points: 20 }); }
  if (pv.coupon.restricted) { d -= 25; hits.push({ kind: 'risk', id: 'couponLimit', label: '券有使用限制', points: 25 }); }
  if (pv.verdict.key === 'drop') { d -= 10; hits.push({ kind: 'risk', id: 'drop', label: '按你的筛选规则建议筛掉', points: 10 }); }
  return { delta: d, hits };
}

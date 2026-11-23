// 真实性打分：红线否决 + 风险扣分 + 良性信号加分
export function scoreText(text, settings) {
  const s = String(text || '');
  const cfg = settings.scoring || {};
  const hits = [];

  for (const rule of cfg.vetoes || []) {
    if (!rule.pattern) continue;
    if (safeTest(rule.pattern, s)) hits.push({ kind: 'veto', id: rule.id, label: rule.label, points: Number(rule.points) || 0 });
  }
  for (const rule of cfg.risks || []) {
    if (!rule.pattern) continue;
    if (safeTest(rule.pattern, s)) hits.push({ kind: 'risk', id: rule.id, label: rule.label, points: Number(rule.points) || 0 });
  }
  for (const rule of cfg.bonuses || []) {
    if (!rule.pattern) continue;
    if (safeTest(rule.pattern, s)) hits.push({ kind: 'bonus', id: rule.id, label: rule.label, points: Number(rule.points) || 0 });
  }

  const base = Number(cfg.base ?? 50);
  let score = base;
  for (const h of hits) score += h.kind === 'bonus' ? h.points : -h.points;

  const vetoed = hits.some((h) => h.kind === 'veto');
  if (vetoed) score = Math.min(score, Number(cfg.vetoCap ?? 25));
  score = Math.max(0, Math.min(100, Math.round(score)));

  const th = cfg.thresholds || { trust: 75, doubt: 50 };
  let level = '可疑';
  if (!vetoed) {
    if (score >= Number(th.trust)) level = '可信';
    else if (score >= Number(th.doubt)) level = '存疑';
  }

  return { score, level, hits, vetoed };
}

function safeTest(pattern, text) {
  try {
    return new RegExp(pattern, 'i').test(text);
  } catch {
    return false;
  }
}

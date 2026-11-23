// 打分的统一入口：真实性评分 + 奖品价值评估
import { scoreText } from './score.mjs';
import { evaluatePrize, prizeDelta } from './prize.mjs';

export function evaluateActivity(fields, settings) {
  const text = String(fields.text || '');
  const sc = scoreText(text, settings);
  const pv = evaluatePrize(fields, settings);
  const extra = prizeDelta(pv);
  const score = Math.max(0, Math.min(100, Math.round(sc.score + extra.delta)));
  const hits = sc.hits.concat(extra.hits);
  const th = settings.scoring?.thresholds || { trust: 75, doubt: 50 };
  let level = '可疑';
  if (!sc.vetoed) {
    if (score >= Number(th.trust)) level = '可信';
    else if (score >= Number(th.doubt)) level = '存疑';
  }
  return { score, level, hits, prizeEval: pv };
}

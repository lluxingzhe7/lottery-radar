import { hashCode } from './util.mjs';

export function extractRequirements(text, kind, settings) {
  const s = String(text || '');
  const found = [];
  for (const r of settings.requirements || []) {
    if (!r.pattern) continue;
    let hit = false;
    try {
      hit = new RegExp(r.pattern, 'i').test(s);
    } catch {
      hit = false;
    }
    if (hit) found.push({ key: r.key, label: r.label, done: false, source: 'text' });
  }
  if (!found.length && kind !== 'other') {
    for (const key of ['follow', 'comment']) {
      const r = (settings.requirements || []).find((x) => x.key === key);
      if (r) found.push({ key: r.key, label: r.label, done: false, source: 'default' });
    }
  }
  return found;
}

export function requirementProgress(activity) {
  const list = activity.requirements || [];
  return { done: list.filter((r) => r.done).length, total: list.length };
}

export function draftSeed(activity) {
  return hashCode(activity.id || activity.url || '');
}

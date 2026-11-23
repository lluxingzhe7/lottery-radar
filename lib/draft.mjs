import { draftSeed } from './requirements.mjs';

export function buildComment(activity, settings) {
  const tpl = settings.templates?.comment || {};
  const pool = tpl[activity.platform]?.length ? tpl[activity.platform] : tpl.other || ['已参与，蹲一个～'];
  let text = pool[draftSeed(activity) % pool.length];
  const tags = collectTags(activity);
  const needsTopic = (activity.requirements || []).some((r) => r.key === 'topic');
  if (needsTopic && tags.length) text += ' ' + tags.slice(0, 3).join(' ');
  return text;
}

export function buildDm(activity, settings) {
  const tpl = settings.templates?.dm || '博主您好～我在【{title}】活动的开奖名单里有我，请问怎么领呀？';
  return tpl.replace('{title}', String(activity.title || '').slice(0, 30));
}

export function collectTags(activity) {
  const s = String(activity.text || '') + ' ' + String(activity.title || '');
  const m = s.match(/#[^\s#]{1,20}/g) || [];
  return [...new Set(m)];
}

export function previewText(activity, settings) {
  const reqs = (activity.requirements || []).map((r) => (r.done ? '[x] ' : '[ ] ') + r.label);
  return {
    comment: buildComment(activity, settings),
    dm: buildDm(activity, settings),
    checklist: reqs,
    topicTags: collectTags(activity),
  };
}

(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('data').textContent || '{}');
  var items = data.items || [];
  var status = 'all';
  var plat = 'all';
  var q = '';
  var local = {};
  try { local = JSON.parse(localStorage.getItem('lr.joined') || '{}') || {}; } catch (e) { local = {}; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function saveLocal() {
    try { localStorage.setItem('lr.joined', JSON.stringify(local)); } catch (e) {}
  }
  function localJoined(it) { return !!local[it.id]; }
  function joinedLocal(it) { return it.status === 'pending' && localJoined(it); }
  function byStatus(it, f) {
    if (f === 'all') return !joinedLocal(it);
    if (f === 'pending') return it.status === 'pending' && !localJoined(it);
    if (f === 'running') return it.status === 'joined' || it.status === 'awaiting';
    if (f === 'won') return it.status === 'won' || it.status === 'claimed';
    if (f === 'joined') return joinedLocal(it);
    return true;
  }
  function byQuery(it) {
    if (!q) return true;
    var hay = [it.title, it.author, it.prize, it.id, it.kindLabel].join(' ').toLowerCase();
    return hay.indexOf(q.toLowerCase()) > -1;
  }
  function counts() {
    var c = { pending: 0, running: 0, won: 0, joined: 0 };
    items.forEach(function (it) {
      if (byStatus(it, 'pending')) c.pending++;
      if (byStatus(it, 'running')) c.running++;
      if (byStatus(it, 'won')) c.won++;
      if (byStatus(it, 'joined')) c.joined++;
    });
    return c;
  }
  function renderStats() {
    var c = counts();
    document.getElementById('stats').innerHTML =
      '<span><b>' + c.pending + '</b>待参与</span>' +
      '<span><b>' + c.running + '</b>待开奖</span>' +
      '<span><b>' + c.won + '</b>已中奖</span>' +
      '<span><b>' + c.joined + '</b>已参与</span>';
  }
  function renderFilters() {
    var defs = [['all', '全部'], ['pending', '待参与'], ['running', '待开奖'], ['won', '已中奖'], ['joined', '已参与']];
    var plats = [['all', '全部平台']];
    (data.platforms || []).forEach(function (p) { plats.push([p.key, p.label]); });
    document.getElementById('filters').innerHTML = defs.map(function (d) {
      return '<button class="chip' + (status === d[0] ? ' on' : '') + '" data-s="' + d[0] + '">' + esc(d[1]) + '</button>';
    }).join('');
    var platEl = document.getElementById('plats');
    platEl.innerHTML = plats.map(function (p) {
      return '<button class="chip sm' + (plat === p[0] ? ' on' : '') + '" data-p="' + p[0] + '">' + esc(p[1]) + '</button>';
    }).join('');
    platEl.style.display = plats.length > 2 ? '' : 'none';
  }
  function cardHtml(it) {
    var lvlClass = it.level === '可信' ? 'trust' : (it.level === '可疑' ? 'bad' : 'doubt');
    var platClass = it.platClass || 'oth';
    var done = localJoined(it);
    var dl = '';
    if (it.deadlineLabel) {
      var soon = typeof it.daysLeft === 'number' && it.daysLeft <= 2;
      dl = '<span class="dl' + (soon ? ' soon' : '') + '">' + esc(it.deadlineLabel) + '</span>';
    }
    var reqs = (it.requirements || []).map(function (r) {
      return '<span class="req' + (r.done ? ' done' : '') + '">' + (r.done ? '✓ ' : '') + esc(r.label) + '</span>';
    }).join('');
    var pv = it.prizeEval;
    var verdictChip = pv && pv.verdict
      ? '<span class="lvl ' + (pv.verdict.key === 'drop' ? 'vdrop' : pv.verdict.key === 'keep' ? 'vkeep' : '') + '">' + esc(pv.verdict.label) + '</span>'
      : '';
    var prizeLine = pv
      ? '<p class="pinfo">' + esc(pv.category.label) + ' · ' + esc(pv.value.label) + (pv.verdict.reasons.length ? ' · ' + esc(pv.verdict.reasons[0]) : '') + '</p>'
      : '';
    var warn = (it.warnings && it.warnings.length)
      ? '<p class="warnbox">⚠ ' + esc(it.warnings.map(function (w) { return w.label; }).slice(0, 2).join('；')) + '</p>'
      : '';
    var statusChip = it.status !== 'pending' ? '<span class="lvl">' + esc(it.statusLabel) + '</span>' : '';
    var joinedChip = done ? '<span class="lvl joined">已参与</span>' : '';
    var more = it.comment
      ? '<details class="more"><summary>看评论文案</summary><pre class="comment">' + esc(it.comment) + '</pre></details>'
      : '';
    var appBtn = it.appUrl
      ? '<a class="btn" href="' + esc(it.appUrl) + '">在 App 打开</a>'
      : '';
    var joinBtn = done
      ? '<button class="btn ghost" data-join="' + esc(it.id) + '">取消已参与</button>'
      : '<button class="btn" data-join="' + esc(it.id) + '">标记已参与</button>';
    return '' +
      '<article class="card' + ((it.level === '可疑' || it.verdictKey === 'drop') ? ' dim' : '') + (it.status === 'won' || it.status === 'claimed' ? ' won' : '') + '">' +
        '<div class="card-top">' +
          '<span class="badge ' + platClass + '">' + esc(it.platformLabel) + '</span>' +
          (it.auto ? '<span class="lvl">自动发现</span>' : '') +
          '<span class="lvl ' + lvlClass + '">' + esc(it.level) + ' ' + esc(it.score) + '</span>' +
          verdictChip + statusChip + joinedChip + dl +
        '</div>' +
        '<h2>' + esc(it.title) + '</h2>' +
        '<p class="meta">' + (it.prize ? '🎁 ' + esc(it.prize) + ' · ' : '') + (it.author ? '@' + esc(it.author) + ' · ' : '') + esc(it.id) + '</p>' +
        prizeLine +
        (reqs ? '<div class="reqs">' + reqs + '</div>' : '') +
        warn +
        more +
        '<div class="actions">' +
          '<a class="btn primary" href="' + esc(it.url) + '" target="_blank" rel="noopener">打开原帖</a>' +
          appBtn +
          (it.comment ? '<button class="btn" data-copy="' + esc(it.id) + '">复制评论</button>' : '') +
          '<button class="btn" data-copyurl="' + esc(it.id) + '">复制链接</button>' +
          (it.status === 'pending' ? joinBtn : '') +
        '</div>' +
      '</article>';
  }
  function render() {
    renderStats();
    renderFilters();
    var shown = items.filter(function (it) {
      return byStatus(it, status) && (plat === 'all' || it.platform === plat) && byQuery(it);
    });
    shown.sort(function (a, b) { return (a.sortKey || 0) - (b.sortKey || 0); });
    var list = document.getElementById('list');
    if (!shown.length) {
      var msg = items.length
        ? (status === 'joined' ? '还没有标记过已参与的活动。点任意卡片的「标记已参与」就会收进来。' : '这个筛选下没有记录，换个筛选或清掉搜索词。')
        : '还没有记录。点右上角「＋ 投递」把刷到的活动丢进来。';
      list.innerHTML = '<p class="empty">' + msg + '</p>';
      return;
    }
    list.innerHTML = shown.map(cardHtml).join('');
  }
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1f2329;color:#fff;' +
        'padding:10px 16px;border-radius:999px;font-size:14px;z-index:99;opacity:0;transition:opacity .2s;pointer-events:none;max-width:80%;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, 1800);
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制，去粘贴吧'); }, fallback);
    } else {
      fallback();
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('已复制，去粘贴吧'); } catch (e) { toast('复制失败，长按文案手动复制'); }
      document.body.removeChild(ta);
    }
  }
  document.getElementById('q').addEventListener('input', function (e) {
    q = e.target.value.trim();
    render();
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-s],[data-p],[data-copy],[data-copyurl],[data-join]');
    if (!t) return;
    if (t.dataset.s) { status = t.dataset.s; render(); return; }
    if (t.dataset.p) { plat = t.dataset.p; render(); return; }
    if (t.dataset.copy) {
      var it = items.find(function (x) { return x.id === t.dataset.copy; });
      if (it) copy(it.comment);
      return;
    }
    if (t.dataset.copyurl) {
      var iu = items.find(function (x) { return x.id === t.dataset.copyurl; });
      if (iu) copy(iu.url);
      return;
    }
    if (t.dataset.join) {
      var id = t.dataset.join;
      if (local[id]) { delete local[id]; } else { local[id] = true; }
      saveLocal();
      render();
      toast(local[id] ? '已收进「已参与」。有空去 issue 评论 /参与 ' + id + ' 写回台账' : '已取消标记');
    }
  });
  render();
  document.getElementById('built').textContent = data.builtAt || '';
})();

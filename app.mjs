import { escape, gameHasWeekly, gameHasMonthly } from './core.mjs';
import { load, save, applyResets } from './store.mjs';

let state = load();
const toolsOpen = Object.create(null);
const accOpen = Object.create(null);
const openAccByGame = Object.create(null);
const accountUICache = new Map();
const progressCache = new WeakMap();
let editG = null, editA = null, editGid = null, noteTarget = null, noteAnchor = null;

function getProgress(a, field) {
  let cached = progressCache.get(a);
  if (!cached) { cached = Object.create(null); progressCache.set(a, cached); }
  if (cached[field]) return cached[field];
  const list = (a[field] || []).filter(c => c.label);
  const done = list.reduce((n, c) => n + (c.done ? 1 : 0), 0);
  const result = { total: list.length, done, full: list.length > 0 && done === list.length };
  cached[field] = result;
  return result;
}
function invalidateProgress(a) {
  progressCache.delete(a);
}
function dailyProgress(a) { return getProgress(a, 'daily'); }
function isDone(a) { return dailyProgress(a).full; }
function isWeekDone(a) { return getProgress(a, 'weekly').full; }
function isMonthDone(a) { return getProgress(a, 'monthly').full; }
function gameDailyAllOk(g) {
  const list = (g.accounts || []).filter(a => (a.daily || []).some(c => c.label));
  return list.length > 0 && list.every(isDone);
}
function gameWeeklyAllOk(g) {
  const list = (g.accounts || []).filter(a => (a.weekly || []).some(c => c.label));
  return list.length > 0 && list.every(isWeekDone);
}
function gameMonthlyAllOk(g) {
  const list = (g.accounts || []).filter(a => (a.monthly || []).some(c => c.label));
  return list.length > 0 && list.every(isMonthDone);
}
function syncGameHeader(g) {
  const el = document.querySelector('[data-gmeta="' + g.id + '"]');
  if (!el) return;
  const bits = [];
  // 全アカウントのデイリー完了時は COMPLETE（日課OKの置き換え）
  if (gameDailyAllOk(g)) bits.push('<span class="badge complete" title="全アカウント デイリー完了">COMPLETE</span>');
  if (gameWeeklyAllOk(g)) bits.push('<span class="badge week" title="全アカウント 週課完了">✓</span>');
  if (gameMonthlyAllOk(g)) bits.push('<span class="badge month" title="全アカウント 月課完了">✓</span>');
  el.innerHTML = bits.join('');
}

function updateDailyBadge(bd, a) {
  if (!bd) return;
  const prog = dailyProgress(a);
  if (!prog.total) {
    bd.hidden = true;
    return;
  }
  bd.textContent = prog.full ? 'デイリー完了' : `${prog.done}/${prog.total}`;
  bd.title = prog.full ? 'デイリー完了' : `デイリー ${prog.done}/${prog.total}`;
  bd.classList.toggle('complete', prog.full);
  bd.hidden = false;
}

function buildChecksHtml(g, a) {
  const chip = (c, i, type, cls) => c.label
    ? `<button type="button" class="chip ${cls}${c.done ? ' on' : ''}" data-t="${g.id}|${a.id}|${type}|${i}" aria-pressed="${c.done ? 'true' : 'false'}">${escape(c.label)}</button>`
    : '';
  const dChips = (a.daily || []).map((c, i) => chip(c, i, 'd', '')).filter(Boolean).join('');
  const wChips = (a.weekly || []).map((c, i) => chip(c, i, 'w', 'w')).filter(Boolean).join('');
  const mChips = (a.monthly || []).map((c, i) => chip(c, i, 'm', 'm')).filter(Boolean).join('');
  const xChips = (a.misc || []).map((c, i) => chip(c, i, 'x', 'x')).filter(Boolean).join('');
  let checks = '';
  if (dChips) checks += `<div class="chip-sec"><div class="chip-label d">デイリー</div><div class="chip-row">${dChips}</div></div>`;
  if (wChips) checks += `<div class="chip-sec"><div class="chip-label w">ウィークリー</div><div class="chip-row">${wChips}</div></div>`;
  if (mChips) checks += `<div class="chip-sec"><div class="chip-label m">マンスリー</div><div class="chip-row">${mChips}</div></div>`;
  if (xChips) checks += `<div class="chip-sec x"><div class="chip-label x">その他</div><div class="chip-row">${xChips}</div></div>`;
  return `${checks}<div class="abody-foot"><button type="button" class="abody-edit" data-ea="${g.id}|${a.id}" title="アカウント設定">⚙️</button><button type="button" class="memo" data-note="${g.id}|${a.id}" title="メモ">📝</button></div>`;
}

function prepareAccountBody(g, a, key) {
  let ui = accountUICache.get(key);
  if (!ui) return null;
  if (ui.body) return ui.body;

  const body = document.createElement('div');
  body.className = 'abody';
  body.dataset.abody = key;
  body.dataset.ready = '1';
  body.innerHTML = buildChecksHtml(g, a);
  ui.body = body;

  ui.chips = Object.create(null);
  body.querySelectorAll('[data-t]').forEach(el => { ui.chips[el.dataset.t] = el; });
  return body;
}

function structureSig() {
  // ゲーム／アカウントの増減だけを見る（ラベル変更は render(true) で強制再構築）
  return state.games.map(g => g.id + ':' + (g.accounts || []).map(a => a.id).join(',')).join('|');
}

function syncGridDim() {
  const anyOpen = Object.keys(openAccByGame).length > 0;
  document.body.classList.toggle('focus-mode', anyOpen);
}

function getAccountUI(key) {
  return accountUICache.get(key) || null;
}
function cacheAccountUI(g, a, acc) {
  const key = g.id + '|' + a.id;
  const ui = {
    acc,
    body: null,
    name: acc.querySelector('.aname-text'),
    daily: acc.querySelector('[data-bdaily]'),
    week: acc.querySelector('[data-bweek]'),
    month: acc.querySelector('[data-bmonth]'),
    note: acc.querySelector('[data-anote]'),
    chips: Object.create(null)
  };
  accountUICache.set(key, ui);
  return ui;
}

// 本文DOMは初期描画を重くしないため、アイドル時間に少しずつ先行生成してキャッシュする。
// タップが先に来た場合だけ、そのアカウントを即時生成する。
let warmupQueued = false;
function warmAccountBodies(deadline) {
  warmupQueued = false;
  const games = state.games;
  for (const g of games) {
    for (const a of (g.accounts || [])) {
      const key = g.id + '|' + a.id;
      if (!accountUICache.has(key)) continue;
      if (!accountUICache.get(key).body) prepareAccountBody(g, a, key);
      if (deadline && deadline.timeRemaining && deadline.timeRemaining() < 2) {
        warmupQueued = true;
        requestIdleCallback(warmAccountBodies, { timeout: 1200 });
        return;
      }
    }
  }
}
function queueAccountWarmup() {
  if (warmupQueued) return;
  warmupQueued = true;
  if ('requestIdleCallback' in window) requestIdleCallback(warmAccountBodies, { timeout: 1200 });
  else setTimeout(() => warmAccountBodies(null), 80);
}

function syncAccountUI(g, a) {
  const key = g.id + '|' + a.id;
  const ui = getAccountUI(key);
  if (!ui) return;
  const acc = ui.acc;

  acc.classList.toggle('daily-ok', isDone(a));
  if (ui.name) ui.name.textContent = a.name || '';
  updateDailyBadge(ui.daily, a);
  if (ui.week) ui.week.hidden = !isWeekDone(a);
  if (ui.month) ui.month.hidden = !isMonthDone(a);

  // 改行の1行目だけでなく全文を渡す。折り返し・2段化はCSSの line-clamp に任せる
  // （改行はここで空白に畳んでおき、実際の見た目の折り返し位置とズレないようにする）
  const noteHead = (a.note || '').trim().replace(/\s+/g, ' ');
  if (ui.note) ui.note.textContent = noteHead ? ('📝 ' + noteHead) : '';

  [['daily', 'd'], ['weekly', 'w'], ['monthly', 'm'], ['misc', 'x']].forEach(([field, prefix]) => {
    (a[field] || []).forEach((c, i) => {
      if (!c.label) return;
      const chip = ui.chips[key + '|' + prefix + '|' + i];
      if (!chip) return;
      const on = !!c.done;
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });
}

function render(forceStructure = false) {
  const root = document.getElementById('root');
  const sig = structureSig();
  const needStructure = forceStructure || root.dataset.sig !== sig || !state.games.length;

  if (!state.games.length) {
    root.dataset.sig = '';
    root.innerHTML = '<div class="empty">まだゲームがないよ…<br>右下の＋から追加してね♡</div>';
    return;
  }

  if (needStructure) {
    clearPending();
    accountUICache.clear();
    root.dataset.sig = sig;
    root.innerHTML = state.games.map(g => `
    <div class="game" data-gid="${g.id}">
      <div class="ghead">
        <div class="gname">${escape(g.name)}</div>
        <div class="gexpand">
          <span class="gmeta" data-gmeta="${g.id}"></span>
        </div>
      </div>
      <div class="gbody">
        ${(g.accounts||[]).length ? `<div class="acc-grid">${(g.accounts||[]).map(a => `
          <div class="acc" data-aid="${g.id}|${a.id}">
            <div class="ahead" data-atoggle="${g.id}|${a.id}">
              <div class="ainfo">
                <div class="aname">
                  <span class="aname-text">${escape(a.name)}</span>
                  <span class="abadges">
                    <span class="badge" data-bdaily="${g.id}|${a.id}" hidden>デイリー完了</span>
                    <span class="badge week" data-bweek="${g.id}|${a.id}" hidden title="週課完了">✓</span>
                    <span class="badge month" data-bmonth="${g.id}|${a.id}" hidden title="月課完了">✓</span>
                  </span>
                </div>
                <div class="anote" data-anote="${g.id}|${a.id}"></div>
              </div>
            </div>
          </div>`).join('')}</div>` : ''}
        <div class="gtools" data-gtools-wrap="${g.id}">
          <button type="button" class="gtools-toggle" data-gtools="${g.id}" title="操作">···</button>
          <div class="gactions">
            <button type="button" class="ib ggear" data-eg="${g.id}" title="ゲーム設定">⚙️</button>
            <button type="button" class="gaa" data-aa="${g.id}" title="アカウント追加">＋ アカウント</button>
          </div>
        </div>
      </div>
    </div>`).join('');
  }

  state.games.forEach(g => {
    const gameEl = root.querySelector(`[data-gid="${g.id}"]`);
    const tw = gameEl && gameEl.querySelector(`[data-gtools-wrap="${g.id}"]`);
    if (tw) tw.classList.toggle('open', !!toolsOpen[g.id]);
    (g.accounts || []).forEach(a => {
      const key = g.id + '|' + a.id;
      const acc = gameEl && gameEl.querySelector(`[data-aid="${key}"]`);
      if (!acc) return;
      const wantOpen = !!accOpen[key];
      if (!getAccountUI(key)) cacheAccountUI(g, a, acc);
      acc.classList.toggle('open', wantOpen);
      {
        const body = prepareAccountBody(g, a, key);
        if (body && !body.parentNode) acc.appendChild(body);
      }
      syncAccountUI(g, a);
    });
    syncGameHeader(g);
  });
  syncGridDim();
  queueAccountWarmup();
}

// チェックは常に「1回目タップ=保留、2回目タップ=確定」の2段階。
// 方向(ON/OFF)を問わず一律にすることで、フィールドごとの分岐を増やさない。
let pendingKey = null, pendingEl = null;
function clearPending() {
  if (pendingEl) pendingEl.classList.remove('pending');
  pendingKey = null; pendingEl = null;
}
function handleChipTap(el) {
  const t = el.dataset.t; if (!t) return;
  if (pendingKey === t) {
    clearPending();
    commitChip(el);
  } else {
    clearPending();
    pendingKey = t;
    pendingEl = el;
    el.classList.add('pending');
  }
}
function commitChip(el) {
  const t = el.dataset.t; if (!t) return;
  const [gid, aid, type, idx] = t.split('|');
  const g = state.games.find(x => x.id === gid);
  if (!g || !g.accounts) return;
  const a = g.accounts.find(x => x.id === aid);
  if (!a) return;
  const map = { d: 'daily', w: 'weekly', m: 'monthly', x: 'misc' };
  const field = map[type];
  if (!field) return;
  if (!Array.isArray(a[field])) a[field] = [];
  const list = a[field];
  const i = +idx;
  if (!list[i] || !list[i].label) return;
  list[i].done = !list[i].done;
  invalidateProgress(a);
  syncAccountUI(g, a);
  syncGameHeader(g);
  // チェックタップの体感を優先し、保存(同期I/O)は描画確定後に回す
  requestAnimationFrame(() => setTimeout(() => save(state), 0));
}

function toggleAcc(key) {
  if (!key) return;
  clearPending();
  const sep = key.indexOf('|');
  const gid = sep > 0 ? key.slice(0, sep) : '';
  const aid = sep > 0 ? key.slice(sep + 1) : '';
  const willOpen = !accOpen[key];

  if (willOpen) {
    // 開く対象は常に1枚だけ。別ゲームを開いたときも前のカードを閉じる。
    Object.keys(openAccByGame).forEach(otherGid => {
      const prevKey = openAccByGame[otherGid];
      if (!prevKey || prevKey === key) return;
      accOpen[prevKey] = false;
      const otherUI = getAccountUI(prevKey);
      const other = otherUI?.acc || document.querySelector('[data-aid="' + prevKey + '"]');
      if (other) other.classList.remove('open');
      delete openAccByGame[otherGid];
    });
    openAccByGame[gid] = key;
  } else {
    delete openAccByGame[gid];
  }

  accOpen[key] = willOpen;
  const ui = getAccountUI(key);
  const el = ui?.acc || document.querySelector('[data-aid="' + key + '"]');
  if (el) {
    el.classList.toggle('open', willOpen);
    if (willOpen) {
      const g = state.games.find(x => x.id === gid);
      const a = g && g.accounts.find(x => x.id === aid);
      if (g && a) prepareAccountBody(g, a, key);
    }
  }
  syncGridDim();
}

function closeOpenAccs() {
  clearPending();
  Object.keys(openAccByGame).forEach(gid => {
    const k = openAccByGame[gid];
    if (!k) return;
    accOpen[k] = false;
    delete openAccByGame[gid];
    const ui = getAccountUI(k);
    const el = ui?.acc || document.querySelector('[data-aid="' + k + '"]');
    if (el) el.classList.remove('open');
  });
  syncGridDim();
}

document.addEventListener('click', e => {
  if (pendingKey && !e.target.closest('.chip')) clearPending();
});
document.getElementById('root').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) clearPending();
  if (chip) {
    e.preventDefault();
    e.stopPropagation();
    handleChipTap(chip);
    return;
  }
  const nt = e.target.closest('[data-note]');
  if (nt) {
    e.stopPropagation();
    const [gid, aid] = nt.dataset.note.split('|');
    const g = state.games.find(x => x.id === gid);
    const a = g && g.accounts.find(x => x.id === aid);
    if (!a) return;
    noteTarget = { gid, aid };
    noteAnchor = nt.closest('.acc') || nt;
    document.getElementById('nTitle').textContent = a.name + ' のメモ';
    document.getElementById('notes').value = a.note || '';
    const modal = document.getElementById('nModal');
    modal.classList.add('show');
    requestAnimationFrame(positionNoteModal);
    return;
  }
  const ea = e.target.closest('[data-ea]');
  if (ea) {
    e.stopPropagation();
    const [gid, aid] = ea.dataset.ea.split('|');
    openA(gid, aid);
    return;
  }
  const at = e.target.closest('[data-atoggle]');
  if (at) {
    e.stopPropagation();
    toggleAcc(at.dataset.atoggle);
    return;
  }
  const gt = e.target.closest('[data-gtools]');
  if (gt) {
    e.stopPropagation();
    const id = gt.dataset.gtools;
    toolsOpen[id] = !toolsOpen[id];
    const wrap = document.querySelector('[data-gtools-wrap="' + id + '"]');
    if (wrap) wrap.classList.toggle('open', !!toolsOpen[id]);
    return;
  }
  const eg = e.target.closest('[data-eg]');
  if (eg) {
    e.stopPropagation();
    openG(eg.dataset.eg);
    return;
  }
  const aa = e.target.closest('[data-aa]');
  if (aa) {
    e.stopPropagation();
    openA(aa.dataset.aa);
    return;
  }
});

document.getElementById('focusDim').addEventListener('click', () => {
  closeOpenAccs();
});

document.getElementById('nModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeNoteModal();
});

document.getElementById('fab').onclick = () => openG();
document.getElementById('gCancel').onclick = () => document.getElementById('gModal').classList.remove('show');
document.getElementById('aCancel').onclick = () => document.getElementById('aModal').classList.remove('show');
document.getElementById('nCancel').onclick = closeNoteModal;
document.getElementById('nClear').onclick = () => {
  document.getElementById('notes').value = '';
  document.getElementById('notes').focus();
};

function setResetFieldsEnabled(g) {
  const hasW = g ? gameHasWeekly(g) : false;
  const hasM = g ? gameHasMonthly(g) : false;
  document.getElementById('gWDay').disabled = !hasW;
  document.getElementById('gWTime').disabled = !hasW;
  document.getElementById('gWeeklyHint').hidden = hasW;
  document.getElementById('gMDay').disabled = !hasM;
  document.getElementById('gMTime').disabled = !hasM;
  document.getElementById('gMonthlyHint').hidden = hasM;
}

function openG(id = null) {
  clearPending();
  editG = id;
  const g = id ? state.games.find(x => x.id === id) : null;
  document.getElementById('gTitle').textContent = g ? 'ゲーム設定' : 'ゲームを追加';
  document.getElementById('gName').value = g ? g.name : '';
  document.getElementById('gDaily').value = g ? (g.dailyReset || '05:00') : '05:00';
  document.getElementById('gWDay').value = String(g ? (g.weeklyDay ?? 1) : 1);
  document.getElementById('gWTime').value = g ? (g.weeklyReset || '05:00') : '05:00';
  document.getElementById('gMDay').value = g ? (g.monthlyDay ?? 1) : 1;
  document.getElementById('gMTime').value = g ? (g.monthlyReset || '05:00') : '05:00';
  document.getElementById('gDelZone').style.display = g ? 'block' : 'none';
  setResetFieldsEnabled(g);
  document.getElementById('gModal').classList.add('show');
}

function openA(gid, aid = null) {
  clearPending();
  editGid = gid;
  editA = aid;
  const g = state.games.find(x => x.id === gid);
  const a = aid && g ? g.accounts.find(x => x.id === aid) : null;
  document.getElementById('aTitle').textContent = a ? 'アカウント設定' : 'アカウントを追加';
  document.getElementById('aName').value = a ? a.name : '';
  for (let i = 1; i <= 5; i++) {
    const c = a && a.daily && a.daily[i - 1];
    document.getElementById('d' + i).value = c && c.label ? c.label : '';
  }
  for (let i = 1; i <= 2; i++) {
    const c = a && a.weekly && a.weekly[i - 1];
    document.getElementById('w' + i).value = c && c.label ? c.label : '';
  }
  for (let i = 1; i <= 2; i++) {
    const c = a && a.monthly && a.monthly[i - 1];
    document.getElementById('m' + i).value = c && c.label ? c.label : '';
  }
  for (let i = 1; i <= 5; i++) {
    const c = a && a.misc && a.misc[i - 1];
    document.getElementById('x' + i).value = c && c.label ? c.label : '';
  }
  document.getElementById('aDelZone').style.display = a ? 'block' : 'none';
  document.getElementById('aModal').classList.add('show');
}

function packChecks(prefix, max, existing) {
  const out = [];
  for (let i = 1; i <= max; i++) {
    const label = (document.getElementById(prefix + i).value || '').trim();
    if (!label) continue;
    // 同じ文言なら優先、なければ同じ枠番号の完了状態を引き継ぐ（改名時の誤リセット防止）
    let prev = existing && existing.find(c => c.label === label);
    if (!prev && existing && existing[i - 1] && existing[i - 1].label) prev = existing[i - 1];
    out.push({ label, done: prev ? !!prev.done : false });
  }
  return out;
}

document.getElementById('gSave').onclick = () => {
  const name = (document.getElementById('gName').value || '').trim();
  if (!name) return;
  const dailyReset = document.getElementById('gDaily').value || '05:00';
  const weeklyDay = +document.getElementById('gWDay').value;
  const weeklyReset = document.getElementById('gWTime').value || '05:00';
  const monthlyDay = Math.min(31, Math.max(1, +document.getElementById('gMDay').value || 1));
  const monthlyReset = document.getElementById('gMTime').value || '05:00';
  if (editG) {
    const g = state.games.find(x => x.id === editG);
    if (g) {
      g.name = name;
      g.dailyReset = dailyReset;
      g.weeklyDay = weeklyDay;
      g.weeklyReset = weeklyReset;
      g.monthlyDay = monthlyDay;
      g.monthlyReset = monthlyReset;
    }
  } else {
    state.games.push({
      id: 'g' + Date.now(), name, dailyReset, weeklyDay, weeklyReset, monthlyDay, monthlyReset, accounts: []
    });
  }
  save(state);
  document.getElementById('gModal').classList.remove('show');
  render(true);
  scheduleGameResets();
};

document.getElementById('gDel').onclick = () => {
  if (!editG || !confirm('このゲームを削除する？')) return;
  state.games = state.games.filter(g => g.id !== editG);
  save(state);
  document.getElementById('gModal').classList.remove('show');
  render(true);
  scheduleGameResets();
};

document.getElementById('aSave').onclick = () => {
  const g = state.games.find(x => x.id === editGid);
  if (!g) return;
  const name = (document.getElementById('aName').value || '').trim();
  if (!name) return;
  if (editA) {
    const a = g.accounts.find(x => x.id === editA);
    if (a) {
      a.name = name;
      a.daily = packChecks('d', 5, a.daily);
      a.weekly = packChecks('w', 2, a.weekly);
      a.monthly = packChecks('m', 2, a.monthly);
      a.misc = packChecks('x', 5, a.misc);
    }
  } else {
    g.accounts.push({
      id: 'a' + Date.now(), name,
      daily: packChecks('d', 5, null),
      weekly: packChecks('w', 2, null),
      monthly: packChecks('m', 2, null),
      misc: packChecks('x', 5, null),
      note: ''
    });
  }
  save(state);
  invalidateProgress(editA ? g.accounts.find(a => a.id === editA) : g.accounts[g.accounts.length - 1]);
  document.getElementById('aModal').classList.remove('show');
  const savedAcc = g.accounts.find(a => a.id === editA);
  if (savedAcc) {
    const savedKey = g.id + '|' + savedAcc.id;
    const oldUI = getAccountUI(savedKey);
    if (oldUI?.body?.parentNode === oldUI.acc) oldUI.acc.removeChild(oldUI.body);
    accountUICache.delete(savedKey);
  }
  render(false);
  scheduleGameResets();
};

document.getElementById('aDel').onclick = () => {
  if (!editA || !confirm('このアカウントを削除する？')) return;
  const g = state.games.find(x => x.id === editGid);
  if (!g) return;
  g.accounts = g.accounts.filter(a => a.id !== editA);
  save(state);
  document.getElementById('aModal').classList.remove('show');
  render(true);
  scheduleGameResets();
};

function closeNoteModal() {
  document.getElementById('nModal').classList.remove('show');
  noteAnchor = null;
}

function positionNoteModal() {
  if (!noteAnchor) return;
  const modal = document.getElementById('nModal');
  if (!modal.classList.contains('show')) return;
  const panel = modal.querySelector('.mb');
  if (!panel) return;
  const r = noteAnchor.getBoundingClientRect();
  const gap = 8;
  const margin = 8;
  const pw = Math.min(window.innerWidth * .92, 420);
  const ph = Math.min(window.innerHeight * .70, 520);
  let left = r.left;
  if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
  if (left < margin) left = margin;
  let top = r.bottom + gap;
  if (top + ph > window.innerHeight - margin) top = Math.max(margin, r.top - ph - gap);
  modal.style.setProperty('--note-left', left + 'px');
  modal.style.setProperty('--note-top', top + 'px');
}

window.addEventListener('resize', positionNoteModal, { passive:true });
window.addEventListener('scroll', positionNoteModal, { passive:true });

document.getElementById('nSave').onclick = () => {
  if (!noteTarget) return;
  const g = state.games.find(x => x.id === noteTarget.gid);
  const a = g && g.accounts.find(x => x.id === noteTarget.aid);
  if (!a) return;
  a.note = document.getElementById('notes').value;
  save(state);
  closeNoteModal();
  syncAccountUI(g, a);
};

const resetTimers = new Map();
const MAX_TIMEOUT = 2147483647;
const RECHECK_TIMEOUT = MAX_TIMEOUT - 60000;
function parseHM(s, defH = 5) {
  const [h, m] = String(s || '').split(':').map(Number);
  return [Number.isFinite(h) ? h : defH, Number.isFinite(m) ? m : 0];
}
function msUntilDaily(g, now = Date.now()) {
  const [h, m] = parseHM(g.dailyReset);
  const d = new Date(now);
  const next = new Date(d);
  next.setHours(h, m, 0, 0);
  if (next <= d) next.setDate(next.getDate() + 1);
  return next - d;
}
function msUntilWeekly(g, now = Date.now()) {
  const [h, m] = parseHM(g.weeklyReset);
  const day = g.weeklyDay ?? 1;
  const d = new Date(now);
  const next = new Date(d);
  next.setHours(h, m, 0, 0);
  let add = (day - next.getDay() + 7) % 7;
  if (add === 0 && next <= d) add = 7;
  next.setDate(next.getDate() + add);
  return next - d;
}
function msUntilMonthly(g, now = Date.now()) {
  const [h, m] = parseHM(g.monthlyReset);
  // core.mjs の monthlyKey と同じ「月の実日数でクランプ」に合わせる。
  // ここだけ28固定だと29〜31日設定時にタイマーが本来のリセット日を飛び越えてしまう。
  const rawDom = Math.max(1, g.monthlyDay ?? 1);
  const d = new Date(now);
  let y = d.getFullYear(), mo = d.getMonth();
  const last = new Date(y, mo + 1, 0).getDate();
  let next = new Date(y, mo, Math.min(rawDom, last), h, m, 0, 0);
  if (next <= d) {
    mo += 1;
    if (mo > 11) { mo = 0; y += 1; }
    const last2 = new Date(y, mo + 1, 0).getDate();
    next = new Date(y, mo, Math.min(rawDom, last2), h, m, 0, 0);
  }
  return next - d;
}
function nextResetMs(g, now = Date.now()) {
  let ms = msUntilDaily(g, now);
  if (gameHasWeekly(g)) ms = Math.min(ms, msUntilWeekly(g, now));
  if (gameHasMonthly(g)) ms = Math.min(ms, msUntilMonthly(g, now));
  return ms;
}
function clearResetTimers() {
  resetTimers.forEach(id => clearTimeout(id));
  resetTimers.clear();
}
function scheduleGameResets() {
  clearResetTimers();
  const now = Date.now();
  state.games.forEach(g => scheduleOneGameReset(g, now));
}
function scheduleOneGameReset(g, now = Date.now()) {
  const ms = Math.max(0, nextResetMs(g, now));
  // 月課などが遠い場合は、リセット処理をせず「次回時刻の再計算」だけ行う。
  const wait = Math.min(Math.max(50, ms), RECHECK_TIMEOUT);
  const tid = setTimeout(() => {
    const current = state.games.find(x => x.id === g.id);
    if (!current) return scheduleGameResets();
    if (ms > RECHECK_TIMEOUT) {
      scheduleOneGameReset(current);
      return;
    }
    if (applyResets(state)) {
      state.games.forEach(g => (g.accounts || []).forEach(invalidateProgress));
      save(state);
      render(false);
    }
    scheduleOneGameReset(current);
  }, wait);
  resetTimers.set(g.id, tid);
}
function onResume() {
  // バックグラウンドから戻ったとき：リセット反映＋タイマー張り直し（操作を邪魔しないよう軽く）
  clearPending();
  if (applyResets(state)) {
    state.games.forEach(g => (g.accounts || []).forEach(invalidateProgress));
    save(state);
    render(false);
  }
  scheduleGameResets();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    save(state);
  } else if (document.visibilityState === 'visible') {
    onResume();
  }
});
window.addEventListener('pagehide', () => save(state));
window.addEventListener('pageshow', e => {
  // bfcache 復帰時もリセット確認
  if (e.persisted) onResume();
});

// 起動：まず画面を出してから、後回しでタイマーと SW
if (applyResets(state)) {
  state.games.forEach(g => (g.accounts || []).forEach(invalidateProgress));
  save(state);
}
render(true);
const defer = (fn) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 1200 });
  else setTimeout(fn, 0);
};
defer(() => {
  scheduleGameResets();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?rev=v542', { updateViaCache: 'all' }).catch(() => {});
  }
});

// 長押しでブラウザの検索バナー／コンテキストメニューを出さない（入力欄は除外）
document.addEventListener('contextmenu', e => {
  const t = e.target;
  if (t && (t.closest('input, textarea, select'))) return;
  e.preventDefault();
});

// バージョン表示：タップで更新ページへ
const verEl = document.querySelector('.ver');
if (verEl) {
  verEl.addEventListener('click', () => { location.href = 'update.html'; });
  verEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.href = 'update.html'; }
  });
}

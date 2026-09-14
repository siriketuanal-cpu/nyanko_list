import { escape, gameHasWeekly, gameHasMonthly } from './core.mjs';
import { load, save, applyResets } from './store.mjs';

let state = load();
const toolsOpen = Object.create(null);
const accOpen = Object.create(null);
const openAccByGame = Object.create(null);
const accountUICache = new Map();
const gameUICache = new Map();
let saveTimer = null;
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
  const el = gameUICache.get(g.id)?.meta || document.querySelector('[data-gmeta="' + g.id + '"]');
  if (!el) return;
  const bits = [];
  // 全アカウントのデイリー完了時は COMPLETE（日課OKの置き換え）
  if (gameDailyAllOk(g)) bits.push('<span class="badge complete" title="全アカウント デイリー完了">COMPLETE</span>');
  if (gameWeeklyAllOk(g)) bits.push('<span class="badge week" title="全アカウント 週課完了">DONE</span>');
  if (gameMonthlyAllOk(g)) bits.push('<span class="badge month" title="全アカウント 月課完了">DONE</span>');
  el.innerHTML = bits.join('');
}

function updateDailyBadge(bd, a) {
  if (!bd) return;
  const prog = dailyProgress(a);
  if (!prog.total) {
    bd.hidden = true;
    return;
  }
  bd.textContent = prog.full ? 'DONE' : `${prog.done}/${prog.total}`;
  bd.title = prog.full ? 'デイリー完了' : `デイリー ${prog.done}/${prog.total}`;
  bd.classList.toggle('complete', prog.full);
  bd.hidden = false;
}

function scheduleSave(delay = 120) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    save(state);
  }, delay);
}
function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  save(state);
}

function buildChecksHtml(g, a) {
  const chip = (c, i, type, cls) => c.label
    ? `<button type="button" class="chip ${cls}${c.done ? ' on' : ''}" data-t="${g.id}|${a.id}|${type}|${i}" aria-pressed="${c.done ? 'true' : 'false'}">${escape(c.label)}</button>`
    : '';
  const dChips = (a.daily || []).map((c, i) => chip(c, i, 'd', 'd')).filter(Boolean).join('');
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


// チップ文字：少し長いだけならフォントを下げ、それでも溢れたら ellipsis
function fitChipText(el) {
  if (!el) return;
  el.style.fontSize = '';
  const cs = getComputedStyle(el);
  let size = parseFloat(cs.fontSize) || 12;
  const min = Math.max(9, size * 0.78);
  // レイアウト確定後に測る
  while (size > min + 0.05 && el.scrollWidth > el.clientWidth + 1) {
    size -= 0.5;
    el.style.fontSize = size + 'px';
  }
}
function fitChipsIn(root) {
  if (!root) return;
  root.querySelectorAll('.chip').forEach(fitChipText);
}
function prepareAccountBody(g, a, key) {
  let ui = accountUICache.get(key);
  if (!ui) return null;
  if (ui.body) return ui.body;

  const body = document.createElement('div');
  body.className = 'abody';
  body.dataset.abody = key;
  body.dataset.ready = '1';
  // デイリー/ウィークリー/マンスリーのうち実際に中身があるものだけ列を確保し、
  // 余白ができないよう開く幅を絞る（その他欄は全幅の別行なので列数に含めない）
  const cols = ['daily', 'weekly', 'monthly'].filter(f => (a[f] || []).some(c => c.label)).length || 1;
  body.dataset.cols = String(cols);
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
  // 暗転オーバーレイは使わず、開いているカード自身のz-indexだけで前面表示する。
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

  // 改行はそのまま活かし、通常の空白だけ畳む。折り返し(pre-line)と2段クランプはCSS側で処理。
  const noteHead = (a.note || '').trim().replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n');
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
    accountUICache.clear();
    gameUICache.clear();
    root.innerHTML = '<div class="empty">まだゲームがないよ…<br>右下の＋から追加してね♡</div>';
    return;
  }

  if (needStructure) {
    clearPending();
    accountUICache.clear();
    gameUICache.clear();
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
                    <span class="badge week" data-bweek="${g.id}|${a.id}" hidden title="週課完了">DONE</span>
                    <span class="badge month" data-bmonth="${g.id}|${a.id}" hidden title="月課完了">DONE</span>
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
            ${(g.accounts || []).length > 1 ? `<button type="button" class="gaa" data-sync="${g.id}" title="先頭アカウントの内容を他の全員に反映">📋 全員に反映</button>` : ''}
          </div>
        </div>
      </div>
    </div>`).join('');

    // 構造を作った直後にDOM参照を一度だけキャッシュ。
    // 通常のrenderではゲーム/アカウントごとのquerySelectorを繰り返さない。
    root.querySelectorAll('.game').forEach(gameEl => {
      const gid = gameEl.dataset.gid;
      gameUICache.set(gid, {
        el: gameEl,
        meta: gameEl.querySelector('[data-gmeta="' + gid + '"]'),
        tools: gameEl.querySelector('[data-gtools-wrap="' + gid + '"]')
      });
      const g = state.games.find(x => x.id === gid);
      if (!g) return;
      gameEl.querySelectorAll('[data-aid]').forEach(acc => {
        const key = acc.dataset.aid;
        const sep = key.indexOf('|');
        const aid = sep >= 0 ? key.slice(sep + 1) : '';
        const a = g.accounts.find(x => x.id === aid);
        if (a) cacheAccountUI(g, a, acc);
      });
    });
  }

  state.games.forEach(g => {
    const gameUI = gameUICache.get(g.id);
    const gameEl = gameUI?.el;
    const tw = gameUI?.tools;
    if (tw) tw.classList.toggle('open', !!toolsOpen[g.id]);
    (g.accounts || []).forEach(a => {
      const key = g.id + '|' + a.id;
      const acc = gameEl && gameEl.querySelector(`[data-aid="${key}"]`);
      if (!acc) return;
      const wantOpen = !!accOpen[key];
      if (!getAccountUI(key)) cacheAccountUI(g, a, acc);
      acc.classList.toggle('open', wantOpen);
      // 本文は開いたアカウントだけ生成。閉じたカードではDOMを作らない。
      if (wantOpen) {
        const body = prepareAccountBody(g, a, key);
        if (body && !body.parentNode) acc.appendChild(body);
      }
      syncAccountUI(g, a);
    });
    syncGameHeader(g);
  });
  syncGridDim();
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
  scheduleSave();
}

function toggleAcc(key) {
  if (!key) return;
  clearPending();
  const sep = key.indexOf('|');
  const gid = sep > 0 ? key.slice(0, sep) : '';
  const aid = sep > 0 ? key.slice(sep + 1) : '';
  const willOpen = !accOpen[key];

  if (willOpen) {
    // 別のアカウントが開いているなら、このタップでは「閉じる」だけ。
    // もう一度タップすると次のアカウントが開く。
    const hasOtherOpen = Object.keys(openAccByGame).some(otherGid => {
      const prevKey = openAccByGame[otherGid];
      return !!prevKey && prevKey !== key;
    });
    if (hasOtherOpen) {
      closeOpenAccs();
      return;
    }
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
      if (g && a) {
        const body = prepareAccountBody(g, a, key);
        if (body && !body.parentNode) el.appendChild(body);
      }
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

document.addEventListener('pointerdown', e => {
  if (pendingKey && !e.target.closest('.chip')) clearPending();

  // 開いているアカウントの外側をタップしたら閉じる。
  // メモは枠外タップでは閉じないため、モーダル上は除外する。
  if (Object.keys(openAccByGame).length &&
      !e.target.closest('.acc.open') &&
      !e.target.closest('.modal')) {
    closeOpenAccs();
  }
}, { passive: true });
document.getElementById('root').addEventListener('pointerdown', e => {
  // アカウント外をタップしたら、まず現在のアカウントを閉じて終了。
  // これをルート側で先に処理することで、stopPropagation の影響を受けない。
  const openAcc = e.target.closest('.acc.open');
  if (Object.keys(openAccByGame).length && !openAcc && !e.target.closest('.modal')) {
    closeOpenAccs();
    return;
  }

  const chip = e.target.closest('.chip');
  if (!chip) clearPending();
  if (chip) {
    e.preventDefault(); e.stopPropagation(); handleChipTap(chip); return;
  }
  const nt = e.target.closest('[data-note]');
  if (nt) {
    e.preventDefault(); e.stopPropagation();
    const [gid, aid] = nt.dataset.note.split('|');
    const g = state.games.find(x => x.id === gid);
    const a = g && g.accounts.find(x => x.id === aid);
    if (!a) return;
    noteTarget = { gid, aid };
    noteAnchor = nt.closest('.acc') || nt;
    document.getElementById('nTitle').textContent = a.name + ' のメモ';
    document.getElementById('notes').value = a.note || '';
    const modal = document.getElementById('nModal');
    lockBodyScroll();
    modal.classList.add('show');
    requestAnimationFrame(() => {
      positionNoteModal();
      // キーボード等で高さが変わったあと再配置
      requestAnimationFrame(positionNoteModal);
    });
    return;
  }
  const ea = e.target.closest('[data-ea]');
  if (ea) { e.preventDefault(); e.stopPropagation(); const [gid, aid] = ea.dataset.ea.split('|'); openA(gid, aid); return; }
  const at = e.target.closest('[data-atoggle]');
  if (at) {
    e.preventDefault();
    e.stopPropagation();
    const key = at.dataset.atoggle;
    // 別アカウントが開いている状態での1タップ目は「閉じる」だけ。
    // 現在開いているDOMも確認して、状態ズレがあっても確実にこの挙動にする。
    const openedKeys = Object.keys(openAccByGame).filter(gid => openAccByGame[gid]);
    const domOpen = document.querySelector('.acc.open[data-aid]');
    const anotherOpen = openedKeys.some(gid => openAccByGame[gid] !== key) ||
      (!!domOpen && domOpen.dataset.aid !== key);
    if (anotherOpen) {
      closeOpenAccs();
      return;
    }
    toggleAcc(key);
    return;
  }
  const gt = e.target.closest('[data-gtools]');
  if (gt) {
    e.preventDefault(); e.stopPropagation();
    const id = gt.dataset.gtools; toolsOpen[id] = !toolsOpen[id];
    const wrap = document.querySelector('[data-gtools-wrap="' + id + '"]');
    if (wrap) wrap.classList.toggle('open', !!toolsOpen[id]);
    return;
  }
  const eg = e.target.closest('[data-eg]');
  if (eg) { e.preventDefault(); e.stopPropagation(); openG(eg.dataset.eg); return; }
  const aa = e.target.closest('[data-aa]');
  if (aa) { e.preventDefault(); e.stopPropagation(); openA(aa.dataset.aa); return; }
  const sy = e.target.closest('[data-sync]');
  if (sy) { e.preventDefault(); e.stopPropagation(); applyGameTemplate(sy.dataset.sync); return; }
});

document.getElementById('nModal').addEventListener('pointerdown', e => { e.stopPropagation(); });

document.getElementById('fab').onpointerdown = e => { e.preventDefault(); openG(); };
document.getElementById('gCancel').onpointerdown = e => { e.preventDefault(); document.getElementById('gModal').classList.remove('show'); unlockBodyScroll(); unlockBodyScroll(); };
document.getElementById('aCancel').onpointerdown = e => { e.preventDefault(); document.getElementById('aModal').classList.remove('show'); unlockBodyScroll(); unlockBodyScroll(); };
document.getElementById('nCancel').onpointerdown = e => { e.preventDefault(); closeNoteModal(); };
document.getElementById('nClear').onpointerdown = e => { e.preventDefault();
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
  lockBodyScroll(); document.getElementById('gModal').classList.add('show');
}

function updateSettingSlots(prefix, max, initial = 2) {
  const section = document.querySelector('.slot-section[data-prefix="' + prefix + '"]');
  if (!section) return;
  let last = 0;
  for (let i = 1; i <= max; i++) {
    const el = document.getElementById(prefix + i);
    if (el && el.value.trim()) last = i;
  }
  const visible = Math.min(max, Math.max(initial, last + (last ? 0 : 0)));
  for (let i = 1; i <= max; i++) {
    const el = document.getElementById(prefix + i);
    if (!el) continue;
    el.classList.toggle('slot-hidden', i > visible);
  }
  const add = section.querySelector('[data-addslots]');
  if (add) add.hidden = visible >= max;
}

function initSettingSlots() {
  [['d',5,2],['w',4,2],['m',4,2],['x',5,2]].forEach(([p,max,initial]) => updateSettingSlots(p,max,initial));
}

document.querySelectorAll('[data-addslots]').forEach(btn => {
  btn.onpointerdown = e => {
    e.preventDefault();
    const prefix = btn.dataset.addslots;
    const section = btn.closest('.slot-section');
    const max = +(section?.dataset.max || 5);
    let next = 0;
    for (let i = 1; i <= max; i++) {
      const el = document.getElementById(prefix + i);
      if (el && el.classList.contains('slot-hidden')) { next = i; break; }
    }
    if (!next) return;
    const el = document.getElementById(prefix + next);
    el.classList.remove('slot-hidden');
    el.focus();
    if (next >= max) btn.hidden = true;
  };
});

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
  initSettingSlots();
  lockBodyScroll(); document.getElementById('aModal').classList.add('show');
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

// ゲーム内の先頭アカウントのデイリー/ウィークリー/マンスリー/その他を、他の全アカウントに反映。
// 文言が一致する項目は完了状態を引き継ぐ（違う文言なら未完了で追加される）。
function applyGameTemplate(gid) {
  const g = state.games.find(x => x.id === gid);
  if (!g || !g.accounts || g.accounts.length < 2) return;
  const src = g.accounts[0];
  const rest = g.accounts.slice(1);
  const ok = confirm(`「${src.name}」のデイリー/ウィークリー/マンスリー/その他の内容を、他の${rest.length}件のアカウントに反映します。\n（同じ文言の項目は完了状態を引き継ぎます）\nよろしいですか？`);
  if (!ok) return;
  ['daily', 'weekly', 'monthly', 'misc'].forEach(field => {
    const template = src[field] || [];
    rest.forEach(a => {
      const existing = a[field] || [];
      a[field] = template.map(t => {
        const prev = existing.find(c => c.label === t.label);
        return { label: t.label, done: prev ? !!prev.done : false };
      });
      invalidateProgress(a);
    });
  });
  save(state);
  render(true);
}

document.getElementById('gSave').onpointerdown = e => { e.preventDefault();
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
  document.getElementById('gModal').classList.remove('show'); unlockBodyScroll();
  render(true);
  scheduleGameResets();
};

document.getElementById('gDel').onpointerdown = e => { e.preventDefault();
  if (!editG || !confirm('このゲームを削除する？')) return;
  state.games = state.games.filter(g => g.id !== editG);
  save(state);
  document.getElementById('gModal').classList.remove('show'); unlockBodyScroll();
  render(true);
  scheduleGameResets();
};

document.getElementById('aSave').onpointerdown = e => { e.preventDefault();
  const g = state.games.find(x => x.id === editGid);
  if (!g) return;
  const name = (document.getElementById('aName').value || '').trim();
  if (!name) return;
  if (editA) {
    const a = g.accounts.find(x => x.id === editA);
    if (a) {
      a.name = name;
      a.daily = packChecks('d', 5, a.daily);
      a.weekly = packChecks('w', 4, a.weekly);
      a.monthly = packChecks('m', 4, a.monthly);
      a.misc = packChecks('x', 5, a.misc);
    }
  } else {
    g.accounts.push({
      id: 'a' + Date.now(), name,
      daily: packChecks('d', 5, null),
      weekly: packChecks('w', 4, null),
      monthly: packChecks('m', 4, null),
      misc: packChecks('x', 5, null),
      note: ''
    });
  }
  save(state);
  invalidateProgress(editA ? g.accounts.find(a => a.id === editA) : g.accounts[g.accounts.length - 1]);
  document.getElementById('aModal').classList.remove('show'); unlockBodyScroll();
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

document.getElementById('aDel').onpointerdown = e => { e.preventDefault();
  if (!editA || !confirm('このアカウントを削除する？')) return;
  const g = state.games.find(x => x.id === editGid);
  if (!g) return;
  g.accounts = g.accounts.filter(a => a.id !== editA);
  save(state);
  document.getElementById('aModal').classList.remove('show'); unlockBodyScroll();
  render(true);
  scheduleGameResets();
};


let scrollLockY = 0;
function lockBodyScroll() {
  if (document.body.classList.contains('is-scroll-lock')) return;
  scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.classList.add('is-scroll-lock');
  document.body.style.top = '-' + scrollLockY + 'px';
}
function unlockBodyScroll() {
  if (!document.body.classList.contains('is-scroll-lock')) return;
  document.body.classList.remove('is-scroll-lock');
  document.body.style.top = '';
  window.scrollTo(0, scrollLockY);
}
function closeNoteModal() {
  document.getElementById('nModal').classList.remove('show');
  noteAnchor = null;
  unlockBodyScroll();
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
  // visualViewport があればキーボード表示時も実画面に合わせる
  const vv = window.visualViewport;
  const viewW = vv ? vv.width : window.innerWidth;
  const viewH = vv ? vv.height : window.innerHeight;
  const offsetLeft = vv ? vv.offsetLeft : 0;
  const offsetTop = vv ? vv.offsetTop : 0;
  const pw = Math.min(viewW * 0.92, 420);
  // 実測のパネル高さを優先（未計測時は上限）
  const measured = panel.offsetHeight || 0;
  const ph = measured > 0 ? measured : Math.min(viewH * 0.70, 520);
  let left = r.left;
  if (left + pw > offsetLeft + viewW - margin) left = offsetLeft + viewW - pw - margin;
  if (left < offsetLeft + margin) left = offsetLeft + margin;
  let top = r.bottom + gap;
  if (top + ph > offsetTop + viewH - margin) {
    top = Math.max(offsetTop + margin, r.top - ph - gap);
  }
  modal.style.setProperty('--note-left', Math.round(left) + 'px');
  modal.style.setProperty('--note-top', Math.round(top) + 'px');
}

window.addEventListener('resize', positionNoteModal, { passive:true });
window.addEventListener('scroll', positionNoteModal, { passive:true });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', positionNoteModal, { passive:true });
  window.visualViewport.addEventListener('scroll', positionNoteModal, { passive:true });
}

document.getElementById('nSave').onpointerdown = e => { e.preventDefault();
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
// 復帰の二重発火（visibility + pageshow）をまとめる
let lastResumeAt = 0;
function onResume() {
  if (document.hidden) return;
  const now = Date.now();
  if (now - lastResumeAt < 320) return;
  lastResumeAt = now;

  // 保留ハイライトだけ外す（構造再構築はしない）
  clearPending();

  // 内部状態はすぐ合わせる
  const changed = applyResets(state);
  if (changed) {
    state.games.forEach(g => (g.accounts || []).forEach(invalidateProgress));
  }

  const finish = () => {
    if (document.hidden) return;
    if (changed) {
      // 変化があるときだけ描画。構造は維持したままバッジ等を同期（forceStructure=false）
      render(false);
      // 保存は描画コミット後（復帰直後の同期I/Oと描画の衝突を避ける）
      requestAnimationFrame(() => setTimeout(() => save(state), 0));
    }
    // リセットタイマーは常に張り直す（内部時計の基準を合わせる）
    scheduleGameResets();
  };

  // DOM更新は1フレームに載せる（点滅・ちらつき抑制）
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
  else finish();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // 裏移行時の保存。可能ならアイドルへ（殺される前に走らせる timeout 付き）
    const persist = () => { try { flushSave(); } catch (_) {} };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(persist, { timeout: 400 });
    else setTimeout(persist, 0);
  } else if (document.visibilityState === 'visible') {
    onResume();
  }
});
window.addEventListener('pagehide', flushSave);
window.addEventListener('pageshow', e => {
  // bfcache 復帰の保険（主は visibilitychange）
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
    navigator.serviceWorker.register('./sw.js?rev=v555', { updateViaCache: 'all' }).catch(() => {});
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
  verEl.addEventListener('pointerdown', e => { e.preventDefault(); location.href = 'update.html'; });
  verEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.href = 'update.html'; }
  });
}

import { escape, gameHasWeekly, gameHasMonthly } from './core.mjs';
import { load, save, applyResets } from './store.mjs';

let state = load();
const toolsOpen = Object.create(null);
const accOpen = Object.create(null);
let editG = null, editA = null, editGid = null, noteTarget = null;

function dailyProgress(a) {
  const list = (a.daily || []).filter(c => c.label);
  if (!list.length) return { total: 0, done: 0, full: false };
  const done = list.filter(c => c.done).length;
  return { total: list.length, done, full: done === list.length };
}
function isDone(a) {
  return dailyProgress(a).full;
}
function isWeekDone(a) {
  const list = (a.weekly || []).filter(c => c.label);
  return list.length > 0 && list.every(c => c.done);
}
function isMonthDone(a) {
  const list = (a.monthly || []).filter(c => c.label);
  return list.length > 0 && list.every(c => c.done);
}
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
  if (gameDailyAllOk(g)) bits.push('<span class="badge">日課OK</span>');
  if (gameWeeklyAllOk(g)) bits.push('<span class="badge week">週課OK</span>');
  if (gameMonthlyAllOk(g)) bits.push('<span class="badge month">月課OK</span>');
  el.innerHTML = bits.join('');
}

function updateDailyBadge(bd, a) {
  if (!bd) return;
  const prog = dailyProgress(a);
  if (prog.full) {
    bd.textContent = '今日OK';
    bd.hidden = false;
  } else if (prog.done > 0) {
    bd.textContent = String(prog.done);
    bd.hidden = false;
  } else {
    bd.hidden = true;
  }
}

function buildChecksHtml(g, a) {
  const chip = (c, i, type, cls) => c.label
    ? `<button type="button" class="chip ${cls}${c.done ? ' on' : ''}" data-t="${g.id}|${a.id}|${type}|${i}" aria-pressed="${c.done ? 'true' : 'false'}">${escape(c.label)}</button>`
    : '';
  const dChips = (a.daily || []).map((c, i) => chip(c, i, 'd', '')).filter(Boolean).join('');
  const wChips = (a.weekly || []).map((c, i) => chip(c, i, 'w', 'w')).filter(Boolean).join('');
  const mChips = (a.monthly || []).map((c, i) => chip(c, i, 'm', 'm')).filter(Boolean).join('');
  let checks = '';
  if (dChips) checks += `<div class="chip-sec"><div class="chip-label d">デイリー</div><div class="chip-row">${dChips}</div></div>`;
  if (wChips) checks += `<div class="chip-sec"><div class="chip-label w">ウィークリー</div><div class="chip-row">${wChips}</div></div>`;
  if (mChips) checks += `<div class="chip-sec"><div class="chip-label m">マンスリー</div><div class="chip-row">${mChips}</div></div>`;
  return `${checks}<div class="abody-foot"><button type="button" class="abody-edit" data-ea="${g.id}|${a.id}">アカウント設定</button><button type="button" class="memo" data-note="${g.id}|${a.id}" title="メモ">📝</button></div>`;
}

function ensureAccBody(g, a) {
  const key = g.id + '|' + a.id;
  const box = document.querySelector('[data-abody="' + key + '"]');
  if (!box || box.dataset.ready === '1') return box;
  box.innerHTML = buildChecksHtml(g, a);
  box.dataset.ready = '1';
  return box;
}

function structureSig() {
  // ゲーム／アカウントの増減だけを見る（ラベル変更は render(true) で強制再構築）
  return state.games.map(g => g.id + ':' + (g.accounts || []).map(a => a.id).join(',')).join('|');
}

function syncAccountUI(g, a) {
  const root = document.getElementById('root');
  const key = g.id + '|' + a.id;
  const acc = root.querySelector('[data-aid="' + key + '"]');
  if (!acc) return;

  const done = isDone(a);
  acc.classList.toggle('done', done);
  updateDailyBadge(root.querySelector('[data-bdaily="' + key + '"]'), a);

  const bw = root.querySelector('[data-bweek="' + key + '"]');
  const bm = root.querySelector('[data-bmonth="' + key + '"]');
  if (bw) bw.hidden = !isWeekDone(a);
  if (bm) bm.hidden = !isMonthDone(a);

  const noteHead = ((a.note || '').trim().split(/\n/)[0]) || '';
  const an = root.querySelector('[data-anote="' + key + '"]');
  if (an) an.textContent = noteHead ? ('📝 ' + noteHead) : '';

  [['daily', 'd'], ['weekly', 'w'], ['monthly', 'm']].forEach(([field, prefix]) => {
    (a[field] || []).forEach((c, i) => {
      if (!c.label) return;
      const chip = root.querySelector('[data-t="' + key + '|' + prefix + '|' + i + '"]');
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
                    <span class="badge" data-bdaily="${g.id}|${a.id}" hidden>今日OK</span>
                    <span class="badge week" data-bweek="${g.id}|${a.id}" hidden>週OK</span>
                    <span class="badge month" data-bmonth="${g.id}|${a.id}" hidden>月OK</span>
                  </span>
                </div>
                <div class="anote" data-anote="${g.id}|${a.id}"></div>
              </div>
            </div>
            <div class="abody" data-abody="${g.id}|${a.id}"></div>
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
    const tw = root.querySelector(`[data-gtools-wrap="${g.id}"]`);
    if (tw) tw.classList.toggle('open', !!toolsOpen[g.id]);
    (g.accounts || []).forEach(a => {
      const key = g.id + '|' + a.id;
      const acc = root.querySelector(`[data-aid="${key}"]`);
      if (!acc) return;
      const wantOpen = !!accOpen[key];
      if (wantOpen) ensureAccBody(g, a);
      acc.classList.toggle('open', wantOpen);
      syncAccountUI(g, a);
    });
    syncGameHeader(g);
  });
}

function toggleChip(el) {
  const t = el.dataset.t; if (!t) return;
  const [gid, aid, type, idx] = t.split('|');
  const g = state.games.find(x => x.id === gid);
  if (!g) return;
  const a = g.accounts.find(x => x.id === aid);
  if (!a) return;
  const map = { d: 'daily', w: 'weekly', m: 'monthly' };
  const list = a[map[type]];
  if (!list || !list[+idx]) return;
  list[+idx].done = !list[+idx].done;
  save(state);
  syncAccountUI(g, a);
  syncGameHeader(g);
}

function toggleAcc(key) {
  if (!key) return;
  const willOpen = !accOpen[key];
  const [gid] = key.split('|');
  if (willOpen) {
    Object.keys(accOpen).forEach(k => {
      if (k.startsWith(gid + '|') && k !== key && accOpen[k]) {
        accOpen[k] = false;
        const other = document.querySelector('[data-aid="' + k + '"]');
        if (other) other.classList.remove('open');
      }
    });
    const g = state.games.find(x => x.id === gid);
    const a = g && g.accounts.find(x => x.id === key.split('|')[1]);
    if (g && a) ensureAccBody(g, a);
  }
  accOpen[key] = willOpen;
  const el = document.querySelector('[data-aid="' + key + '"]');
  if (el) el.classList.toggle('open', willOpen);
}

function closeOpenAccs() {
  Object.keys(accOpen).forEach(k => {
    if (!accOpen[k]) return;
    accOpen[k] = false;
    const el = document.querySelector('[data-aid="' + k + '"]');
    if (el) el.classList.remove('open');
  });
}

document.getElementById('root').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (chip) {
    e.preventDefault();
    e.stopPropagation();
    toggleChip(chip);
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
    document.getElementById('nTitle').textContent = a.name + ' のメモ';
    document.getElementById('notes').value = a.note || '';
    document.getElementById('nModal').classList.add('show');
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

document.addEventListener('click', e => {
  if (e.target.closest('.modal')) return;
  if (e.target.closest('.acc.open')) return;
  if (e.target.closest('[data-atoggle]')) return;
  closeOpenAccs();
}, true);

document.getElementById('fab').onclick = () => openG();
document.getElementById('gCancel').onclick = () => document.getElementById('gModal').classList.remove('show');
document.getElementById('aCancel').onclick = () => document.getElementById('aModal').classList.remove('show');
document.getElementById('nCancel').onclick = () => document.getElementById('nModal').classList.remove('show');
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
  document.getElementById('aDelZone').style.display = a ? 'block' : 'none';
  document.getElementById('aModal').classList.add('show');
}

function packChecks(prefix, max, existing) {
  const out = [];
  for (let i = 1; i <= max; i++) {
    const label = (document.getElementById(prefix + i).value || '').trim();
    if (!label) continue;
    const prev = existing && existing.find(c => c.label === label);
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
  const monthlyDay = +document.getElementById('gMDay').value || 1;
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
    }
  } else {
    g.accounts.push({
      id: 'a' + Date.now(), name,
      daily: packChecks('d', 5, null),
      weekly: packChecks('w', 2, null),
      monthly: packChecks('m', 2, null),
      note: ''
    });
  }
  save(state);
  document.getElementById('aModal').classList.remove('show');
  (g.accounts || []).forEach(a => {
    const box = document.querySelector('[data-abody="' + g.id + '|' + a.id + '"]');
    if (box) { box.dataset.ready = '0'; box.innerHTML = ''; }
  });
  render(true);
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

document.getElementById('nSave').onclick = () => {
  if (!noteTarget) return;
  const g = state.games.find(x => x.id === noteTarget.gid);
  const a = g && g.accounts.find(x => x.id === noteTarget.aid);
  if (!a) return;
  a.note = document.getElementById('notes').value;
  save(state);
  document.getElementById('nModal').classList.remove('show');
  syncAccountUI(g, a);
};

const resetTimers = new Map();
function msUntilDaily(g, now = Date.now()) {
  const [h, m] = (g.dailyReset || '05:00').split(':').map(Number);
  const d = new Date(now);
  const next = new Date(d);
  next.setHours(h || 5, m || 0, 0, 0);
  if (next <= d) next.setDate(next.getDate() + 1);
  return next - d;
}
function msUntilWeekly(g, now = Date.now()) {
  const [h, m] = (g.weeklyReset || '05:00').split(':').map(Number);
  const day = g.weeklyDay ?? 1;
  const d = new Date(now);
  const next = new Date(d);
  next.setHours(h || 5, m || 0, 0, 0);
  let add = (day - next.getDay() + 7) % 7;
  if (add === 0 && next <= d) add = 7;
  next.setDate(next.getDate() + add);
  return next - d;
}
function msUntilMonthly(g, now = Date.now()) {
  const [h, m] = (g.monthlyReset || '05:00').split(':').map(Number);
  const dom = Math.min(28, Math.max(1, g.monthlyDay ?? 1));
  const d = new Date(now);
  let y = d.getFullYear(), mo = d.getMonth();
  const last = new Date(y, mo + 1, 0).getDate();
  let next = new Date(y, mo, Math.min(dom, last), h || 5, m || 0, 0, 0);
  if (next <= d) {
    mo += 1;
    if (mo > 11) { mo = 0; y += 1; }
    const last2 = new Date(y, mo + 1, 0).getDate();
    next = new Date(y, mo, Math.min(dom, last2), h || 5, m || 0, 0, 0);
  }
  return next - d;
}
function clearResetTimers() {
  resetTimers.forEach(id => clearTimeout(id));
  resetTimers.clear();
}
function scheduleGameResets() {
  clearResetTimers();
  const MAX = 2147483647;
  const now = Date.now();
  // ゲームごとに「次のリセット」1本だけ張る（日／週／月の最も近い時刻）
  state.games.forEach(g => {
    let ms = msUntilDaily(g, now);
    if (gameHasWeekly(g)) ms = Math.min(ms, msUntilWeekly(g, now));
    if (gameHasMonthly(g)) ms = Math.min(ms, msUntilMonthly(g, now));
    const wait = Math.max(500, Math.min(ms + 50, MAX));
    const tid = setTimeout(() => {
      if (applyResets(state)) {
        save(state);
        render(false);
      }
      scheduleGameResets();
    }, wait);
    resetTimers.set(g.id, tid);
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save(state);
});
window.addEventListener('pagehide', () => save(state));

if (applyResets(state)) save(state);
render(true);
scheduleGameResets();

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

if ('serviceWorker' in navigator) {
  // updateViaCache: 'all' で SW 自体の余計な更新チェックを抑制。通常時はキャッシュのみで通信しない
  navigator.serviceWorker.register('./sw.js?rev=v537', { updateViaCache: 'all' }).catch(() => {});
}

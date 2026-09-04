import { dailyKey, weeklyKey, monthlyKey, gameHasWeekly, gameHasMonthly } from './core.mjs';

const KEY = 'nyanko_split_v3';

export function load() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem('nyanko_split_v2');
    if (!raw) return empty();
    const data = JSON.parse(raw);
    if (!Array.isArray(data.games)) return empty();
    if (!data.lastMonthly) data.lastMonthly = {};
    data.expanded = {};
    return data;
  } catch {
    return empty();
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
}

function empty() {
  return {
    games: [],
    lastDaily: {},
    lastWeekly: {},
    lastMonthly: {},
    expanded: {}
  };
}

export function applyResets(state) {
  let changed = false;
  const now = Date.now();
  if (!state.lastDaily) state.lastDaily = {};
  if (!state.lastWeekly) state.lastWeekly = {};
  if (!state.lastMonthly) state.lastMonthly = {};
  state.games.forEach(g => {
    const [dh, dm] = (g.dailyReset || '05:00').split(':').map(Number);
    const dKey = dailyKey(now, dh || 5, dm || 0);
    // キー未記録は「いまの周期」を覚えるだけ（チェックを消さない）
    if (state.lastDaily[g.id] == null) {
      state.lastDaily[g.id] = dKey;
      changed = true;
    } else if (state.lastDaily[g.id] !== dKey) {
      (g.accounts || []).forEach(a => {
        (a.daily || []).forEach(c => { c.done = false; });
      });
      state.lastDaily[g.id] = dKey;
      changed = true;
    }

    if (gameHasWeekly(g)) {
      const [wh, wm] = (g.weeklyReset || '05:00').split(':').map(Number);
      const wKey = weeklyKey(now, g.weeklyDay ?? 1, wh || 5, wm || 0);
      if (state.lastWeekly[g.id] == null) {
        state.lastWeekly[g.id] = wKey;
        changed = true;
      } else if (state.lastWeekly[g.id] !== wKey) {
        (g.accounts || []).forEach(a => {
          (a.weekly || []).forEach(c => { c.done = false; });
        });
        state.lastWeekly[g.id] = wKey;
        changed = true;
      }
    }

    if (gameHasMonthly(g)) {
      const [mh, mm] = (g.monthlyReset || '05:00').split(':').map(Number);
      const mKey = monthlyKey(now, g.monthlyDay ?? 1, mh || 5, mm || 0);
      if (state.lastMonthly[g.id] == null) {
        state.lastMonthly[g.id] = mKey;
        changed = true;
      } else if (state.lastMonthly[g.id] !== mKey) {
        (g.accounts || []).forEach(a => {
          (a.monthly || []).forEach(c => { c.done = false; });
        });
        state.lastMonthly[g.id] = mKey;
        changed = true;
      }
    }
  });
  return changed;
}

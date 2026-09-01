import { dailyKey, weeklyKey } from './core.mjs';

const KEY = 'nyanko_split_v2';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw);
    if (!Array.isArray(data.games)) return empty();
    // migrate old global notes if any
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
    lastWeekly: {}
  };
}

export function applyResets(state) {
  let changed = false;
  const now = Date.now();
  state.games.forEach(g => {
    const [dh, dm] = (g.dailyReset || '05:00').split(':').map(Number);
    const dKey = dailyKey(now, dh || 5, dm || 0);
    if (state.lastDaily[g.id] !== dKey) {
      (g.accounts || []).forEach(a => {
        (a.daily || []).forEach(c => { c.done = false; });
      });
      state.lastDaily[g.id] = dKey;
      changed = true;
    }

    const [wh, wm] = (g.weeklyReset || '05:00').split(':').map(Number);
    const wKey = weeklyKey(now, g.weeklyDay ?? 1, wh || 5, wm || 0);
    if (state.lastWeekly[g.id] !== wKey) {
      (g.accounts || []).forEach(a => {
        (a.weekly || []).forEach(c => { c.done = false; });
      });
      state.lastWeekly[g.id] = wKey;
      changed = true;
    }
  });
  return changed;
}

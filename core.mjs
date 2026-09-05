/** 軽量共通 */
export const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

export const dailyKey = (now = Date.now(), hour = 5, minute = 0) => {
  const d = new Date(now);
  const boundary = new Date(d);
  boundary.setHours(hour, minute, 0, 0);
  if (d < boundary) boundary.setDate(boundary.getDate() - 1);
  return boundary.getFullYear() + '-' +
    String(boundary.getMonth() + 1).padStart(2, '0') + '-' +
    String(boundary.getDate()).padStart(2, '0');
};

export const weeklyKey = (now = Date.now(), day = 1, hour = 5, minute = 0) => {
  const d = new Date(now);
  const boundary = new Date(d);
  boundary.setHours(hour, minute, 0, 0);
  const diff = (day - boundary.getDay() + 7) % 7;
  boundary.setDate(boundary.getDate() - diff);
  if (d < boundary) boundary.setDate(boundary.getDate() - 7);
  return boundary.getFullYear() + '-W' +
    String(boundary.getMonth() + 1).padStart(2, '0') + '-' +
    String(boundary.getDate()).padStart(2, '0');
};

/** 毎月 dayOfMonth 日の hour:minute を境界に（存在しない日は月末） */
export const monthlyKey = (now = Date.now(), dayOfMonth = 1, hour = 5, minute = 0) => {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const dom = Math.min(Math.max(1, dayOfMonth | 0), last);
  const boundary = new Date(y, m, dom, hour, minute, 0, 0);
  if (d < boundary) {
    const prev = new Date(y, m, 0);
    const lastP = prev.getDate();
    const domP = Math.min(dayOfMonth | 0, lastP);
    const b2 = new Date(prev.getFullYear(), prev.getMonth(), domP, hour, minute, 0, 0);
    return b2.getFullYear() + '-M' + String(b2.getMonth() + 1).padStart(2, '0') + '-' + String(b2.getDate()).padStart(2, '0');
  }
  return boundary.getFullYear() + '-M' + String(boundary.getMonth() + 1).padStart(2, '0') + '-' + String(boundary.getDate()).padStart(2, '0');
};

export const gameHasWeekly = (g) =>
  (g.accounts || []).some(a => (a.weekly || []).some(c => c.label));
export const gameHasMonthly = (g) =>
  (g.accounts || []).some(a => (a.monthly || []).some(c => c.label));

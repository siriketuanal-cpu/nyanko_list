/** 軽量共通 */
export const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

export const dailyKey = (now = Date.now(), hour = 5, minute = 0) => {
  const d = new Date(now);
  // 指定時刻を跨いだかどうかでキーを作る
  const boundary = new Date(d);
  boundary.setHours(hour, minute, 0, 0);
  if (d < boundary) boundary.setDate(boundary.getDate() - 1);
  return boundary.getFullYear() + '-' +
    String(boundary.getMonth() + 1).padStart(2, '0') + '-' +
    String(boundary.getDate()).padStart(2, '0');
};

export const weeklyKey = (now = Date.now(), day = 1, hour = 5, minute = 0) => {
  // day: 0=日 ... 6=土
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

export const fmtNow = () => {
  const d = new Date();
  return d.toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit'
  });
};

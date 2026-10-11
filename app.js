
(function () {
'use strict';
const D = document;
const app = D.getElementById('app');
if (!app) return;

/* ---------- small helpers ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const plural = (n, f) => { const a = n % 10, b = n % 100; return n + ' ' + (a === 1 && b !== 11 ? f[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? f[1] : f[2]); };

/* ---------- dates: plain YYYY-MM-DD strings, arithmetic in UTC so a clock change never shifts a day ---------- */
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const toTs = (iso) => { const p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); };
const toIso = (ts) => { const d = new Date(ts); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
const addDays = (iso, n) => toIso(toTs(iso) + n * DAY);
const dow = (iso) => (new Date(toTs(iso)).getUTCDay() + 6) % 7; /* 0 = Monday */
const monday = (iso) => addDays(iso, -dow(iso));
const ymd = (iso) => { const p = iso.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; };
const mins = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const hhmm = (n) => pad(Math.floor(n / 60) % 24) + ':' + pad(n % 60);
const fmtT = (t) => { const m = mins(t); return m == null ? '' : Math.floor(m / 60) + ':' + pad(m % 60); };
const fmtR = (s, e) => { const a = fmtT(s), b = fmtT(e); return a && b ? a + '–' + b : a; };
const startOr = (x) => { const m = mins(x.s); return m == null ? -1 : m; };
const byStart = (a, b) => startOr(a) - startOr(b);
/* Only plain https links are ever turned into something tappable. */
const safeUrl = (u) => { u = String(u == null ? '' : u).trim(); return /^https:\/\/[^\s"'<>`]+$/i.test(u) ? u : ''; };

/* The family lives in Riga, so "today" and "now" follow Riga time wherever the page is opened. */
function rigaNow() {
  try {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = {};
    f.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    const iso = p.year + '-' + p.month + '-' + p.day;
    if (isIso(iso)) return { date: iso, min: (+p.hour % 24) * 60 + +p.minute };
  } catch (e) { /* fall through to the device clock */ }
  const d = new Date();
  return { date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), min: d.getHours() * 60 + d.getMinutes() };
}

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WDF = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MN = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const fmtD = (iso) => { const p = ymd(iso); return p.d + ' ' + MG[p.m - 1]; };
function fmtSpan(a, b) {
  if (!b || a === b) return fmtD(a);
  const x = ymd(a), y = ymd(b);
  if (x.y === y.y && x.m === y.m) return x.d + '–' + y.d + ' ' + MG[x.m - 1];
  return x.d + ' ' + MS[x.m - 1] + ' – ' + y.d + ' ' + MS[y.m - 1];
}

/* ---------- state ---------- */
const cleanMarks = (m) => { const o = {}; if (m && typeof m === 'object') Object.keys(m).sort().forEach((k) => { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && (m[k] === 'nn' || m[k] === 'dd' || m[k] === 'nd' || m[k] === 'dn')) o[k] = m[k]; }); return o; };
const VIEWS = ['day', 'week', 'month'];
const STAYV = ['nn', 'dd', 'nd', 'dn'];
const fill7 = (a) => { const o = []; for (let i = 0; i < 7; i++) o.push(Array.isArray(a) && STAYV.indexOf(a[i]) >= 0 ? a[i] : ''); return o; };
const uniqDays = (a) => { const o = []; (Array.isArray(a) ? a : []).forEach((x) => { x = +x; if (x >= 1 && x <= 7 && o.indexOf(x) < 0) o.push(x); }); return o.sort((x, y) => x - y); };


function migrate(s) {
  s = s && typeof s === 'object' ? s : {};
  const person = (p, name, gen) => ({ name: (p && p.name) || name, gen: (p && p.gen) || gen });
  s.child = person(s.child, '', '');
  const pp = s.people || {};
  s.people = { n: person(pp.n, 'А', 'А'), d: person(pp.d, 'Б', 'Б') };
  const st = s.stay || {};
  s.stay = { mode: st.mode === 'biweekly' ? 'biweekly' : 'weekly', anchor: isIso(st.anchor) ? st.anchor : '', a: fill7(st.a), b: fill7(st.b) };
  ['stayOverrides', 'bells', 'clubs', 'plans', 'daysOff'].forEach((k) => { if (!Array.isArray(s[k])) s[k] = []; });
  const ls = s.lessons && typeof s.lessons === 'object' ? s.lessons : {};
  s.lessons = {};
  for (let w = 1; w <= 5; w++) s.lessons[w] = Array.isArray(ls[w]) ? ls[w] : [];
  s.updated = isIso(s.updated) ? s.updated : '';
  s.sample = !!s.sample;
  s.note = typeof s.note === 'string' ? s.note : '';
  s.rev = +s.rev || 0;
  s.marks = cleanMarks(s.marks);
  return s;
}

/* A clean copy with a fixed key order: what gets saved, and what two versions are compared by. */
function normalize(d) {
  const T = (x) => String(x == null ? '' : x).trim();
  const tm = (x) => { const m = mins(x); return m == null ? '' : hhmm(m); };
  const o = {
    v: 1, rev: +d.rev || 0, updated: T(d.updated), sample: !!d.sample, note: T(d.note),
    child: { name: T(d.child.name), gen: T(d.child.gen) },
    people: { n: { name: T(d.people.n.name), gen: T(d.people.n.gen) }, d: { name: T(d.people.d.name), gen: T(d.people.d.gen) } },
    stay: { mode: d.stay.mode === 'biweekly' ? 'biweekly' : 'weekly', anchor: isIso(d.stay.anchor) ? monday(d.stay.anchor) : '', a: fill7(d.stay.a), b: fill7(d.stay.b) },
    stayOverrides: [], marks: cleanMarks(d.marks), bells: [], lessons: {}, clubs: [], plans: [], daysOff: []
  };
  if (o.stay.mode === 'biweekly' && !o.stay.anchor) o.stay.anchor = monday(rigaNow().date);
  (d.stayOverrides || []).forEach((x) => { if (x && isIso(x.from) && STAYV.indexOf(x.v) >= 0) o.stayOverrides.push({ from: x.from, to: isIso(x.to) && x.to >= x.from ? x.to : x.from, v: x.v }); });
  (d.bells || []).forEach((b) => { o.bells.push([tm(b && b[0]), tm(b && b[1])]); });
  for (let w = 1; w <= 5; w++) {
    const src = (d.lessons && d.lessons[w]) || [], row = [];
    for (let i = 0; i < o.bells.length; i++) row.push(T(src[i]));
    while (row.length && !row[row.length - 1]) row.pop();
    o.lessons[w] = row;
  }
  (d.clubs || []).forEach((c) => { if (c && T(c.t)) o.clubs.push({ t: T(c.t), days: uniqDays(c.days), s: tm(c.s), e: tm(c.e), where: T(c.where), note: T(c.note), urlTo: safeUrl(c.urlTo), urlBack: safeUrl(c.urlBack) }); });
  (d.plans || []).forEach((p) => { if (p && T(p.t) && isIso(p.date)) o.plans.push({ date: p.date, to: isIso(p.to) && p.to > p.date ? p.to : '', s: tm(p.s), e: tm(p.e), t: T(p.t), note: T(p.note) }); });
  o.plans.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byStart(a, b)));
  (d.daysOff || []).forEach((x) => { if (x && isIso(x.from)) o.daysOff.push({ from: x.from, to: isIso(x.to) && x.to >= x.from ? x.to : x.from, t: T(x.t) }); });
  o.daysOff.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return o;
}
const sameData = (a, b) => { const x = normalize(migrate(JSON.parse(JSON.stringify(a)))), y = normalize(migrate(JSON.parse(JSON.stringify(b)))); x.updated = y.updated = ''; x.rev = y.rev = 0; return JSON.stringify(x) === JSON.stringify(y); };

let state = migrate({});
let NOW = rigaNow();
let view = 'day', cursor = NOW.date, mode = 'view';
let draft = null, dirty = false, edWd = 1, openSecs = {}, saving = false, askCancel = false, saveMsg = null;
let notice = null, lastNow = '';
let phase = 'boot', key = null, keyText = '', offline = false, syncedAt = 0, gateMsg = '';
let gh = null, loginMsg = '', loginBusy = false, baseRev = 0, paint = null, markMsg = null;
const editable = () => !!gh;

const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* storage is optional */ } }, del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* storage is optional */ } } };
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage is optional */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage is optional */ } } };

/* ---------- what happens on a given day ---------- */
/* A day marked in the calendar wins over exceptions and over the weekly template. */
function marksNow() { return paint ? paint.merged : state.marks; }
function stayOn(iso, src) {
  const s = src || state, ov = s.stayOverrides || [], mk = src ? (src.marks || {}) : marksNow();
  if (STAYV.indexOf(mk[iso]) >= 0) return mk[iso];
  for (let i = ov.length - 1; i >= 0; i--) { const o = ov[i]; if (o && isIso(o.from) && iso >= o.from && iso <= (isIso(o.to) ? o.to : o.from) && STAYV.indexOf(o.v) >= 0) return o.v; }
  let row = s.stay.a;
  if (s.stay.mode === 'biweekly' && isIso(s.stay.anchor)) {
    const w = Math.round((toTs(monday(iso)) - toTs(monday(s.stay.anchor))) / (7 * DAY));
    if (((w % 2) + 2) % 2 === 1) row = s.stay.b;
  }
  return row[dow(iso)] || '';
}
const stayEmpty = (s) => !Object.keys(s.marks || {}).length && !s.stayOverrides.length && s.stay.a.every((x) => !x) && (s.stay.mode !== 'biweekly' || s.stay.b.every((x) => !x));
function offOn(iso) { const a = state.daysOff; for (let i = 0; i < a.length; i++) { const o = a[i]; if (o && isIso(o.from) && iso >= o.from && iso <= (isIso(o.to) ? o.to : o.from)) return o; } return null; }
function lessonsOn(iso) {
  const w = dow(iso);
  if (w > 4 || offOn(iso)) return [];
  const row = state.lessons[w + 1] || [], out = [];
  state.bells.forEach((b, i) => { const t = String(row[i] == null ? '' : row[i]).trim(); if (t) out.push({ kind: 'lesson', key: 'L' + i, n: i + 1, s: b[0] || '', e: b[1] || '', t: t }); });
  return out;
}
function clubsOn(iso) {
  const w = dow(iso) + 1, out = [];
  state.clubs.forEach((c, i) => { if (c && c.t && (c.days || []).indexOf(w) >= 0) out.push({ kind: 'club', key: 'C' + i, t: c.t, s: c.s || '', e: c.e || '', note: c.where || '', more: c.note || '', urlTo: safeUrl(c.urlTo), urlBack: safeUrl(c.urlBack) }); });
  return out.sort(byStart);
}
function plansOn(iso) {
  const out = [];
  state.plans.forEach((p, i) => { if (p && p.t && isIso(p.date) && iso >= p.date && iso <= (isIso(p.to) ? p.to : p.date)) out.push({ kind: 'plan', key: 'P' + i, t: p.t, s: p.s || '', e: p.e || '', note: [isIso(p.to) && p.to !== p.date ? fmtSpan(p.date, p.to) : '', p.note || ''].filter(Boolean).join(' · ') }); });
  return out.sort(byStart);
}

const sClass = (v) => 's-' + (v || 'none');
function stayParts(v) { if (STAYV.indexOf(v) < 0) return null; const P = state.people, who = (c) => (c === 'n' ? P.n : P.d); return { a: who(v[0]), b: who(v[1]), same: v[0] === v[1], ca: v[0], cb: v[1] }; }
function stayShort(v) { const p = stayParts(v); if (!p) return ''; return p.same ? 'у ' + p.a.gen : 'у ' + p.a.gen + ' → у ' + p.b.gen; }
function stayLetters(v) { const p = stayParts(v); if (!p) return ''; return p.same ? p.a.name.charAt(0) : p.a.name.charAt(0) + '→' + p.b.name.charAt(0); }
function stayLong(v) { const p = stayParts(v); if (!p) return ''; return p.same ? 'у ' + p.a.gen : 'утром у ' + p.a.gen + ', вечером у ' + p.b.gen; }
/* Caption of a marking button, as HTML; a day with a hand-over takes two lines. */
function stayPick(v) { const p = stayParts(v); if (!p) return ''; return p.same ? 'У ' + esc(p.a.gen) : '<span>Утром у ' + esc(p.a.gen) + ',</span> <span>вечером у ' + esc(p.b.gen) + '</span>'; }

/* ---------- icons ---------- */
const svg = (d) => '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const IC_L = svg('M12 5l-5 5 5 5'), IC_R = svg('M8 5l5 5-5 5'), IC_X = svg('M6 6l8 8M14 6l-8 8'), IC_GO = svg('M7 13l6-6M8 7h5v5');
const IC_D = '<svg class="chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ---------- views ---------- */
function contains(v, cur, date) {
  if (v === 'day') return cur === date;
  if (v === 'week') return monday(cur) === monday(date);
  return cur.slice(0, 7) === date.slice(0, 7);
}
function shift(n) {
  if (view === 'day') cursor = addDays(cursor, n);
  else if (view === 'week') cursor = addDays(cursor, 7 * n);
  else { const p = ymd(cursor); cursor = toIso(Date.UTC(p.y, p.m - 1 + n, 1)); }
}

function topBar() {
  const ready = phase === 'ready', plain = ready && mode === 'view' && !paint;
  let h = '<header class="top"><div class="in top-in"><div class="brand"><span class="brand-name">' + esc((ready && state.child.name) || 'Расписание') + '</span>' + (ready && state.child.name ? '<span class="brand-sub">' + (mode === 'edit' ? 'изменение расписания' : mode === 'login' ? 'вход для редактора' : paint ? 'отмечаем дни' : 'расписание') + '</span>' : '') + '</div>';
  if (plain && editable()) h += '<button type="button" class="btn" data-act="edit">Изменить</button>';
  if (plain) h += '<div class="seg" role="group" aria-label="Период">' + [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц']].map((v) => '<button type="button" data-act="view" data-v="' + v[0] + '" aria-pressed="' + (view === v[0]) + '">' + v[1] + '</button>').join('') + '</div>';
  return h + '</div></header>';
}

function nav() {
  let kicker, title, unit;
  if (view === 'day') {
    const diff = Math.round((toTs(cursor) - toTs(NOW.date)) / DAY);
    kicker = WDF[dow(cursor)] + (diff === 0 ? ' · сегодня' : diff === 1 ? ' · завтра' : diff === -1 ? ' · вчера' : '');
    title = fmtD(cursor) + (ymd(cursor).y !== ymd(NOW.date).y ? ' ' + ymd(cursor).y : '');
    unit = ['Предыдущий день', 'Следующий день'];
  } else if (view === 'week') {
    const a = monday(cursor);
    kicker = 'неделя' + (monday(NOW.date) === a ? ' · текущая' : '');
    title = fmtSpan(a, addDays(a, 6));
    unit = ['Предыдущая неделя', 'Следующая неделя'];
  } else {
    const p = ymd(cursor);
    kicker = String(p.y);
    title = MN[p.m - 1];
    unit = ['Предыдущий месяц', 'Следующий месяц'];
  }
  const away = !contains(view, cursor, NOW.date);
  return '<div class="nav"><div class="nav-t"><div class="kick-row"><span class="kicker">' + esc(kicker) + '</span>' + (away ? '<button type="button" class="chipbtn" data-act="today">Сегодня</button>' : '') + '</div><h1>' + esc(title) + '</h1></div>'
    + '<div class="arrows"><button type="button" class="ico" data-act="prev" aria-label="' + unit[0] + '">' + IC_L + '</button><button type="button" class="ico" data-act="next" aria-label="' + unit[1] + '">' + IC_R + '</button></div></div>';
}

function stayBanner(v) {
  const p = stayParts(v), who = esc(state.child.name);
  if (!p) return '<div class="stay s-none"><small>Где ' + who + '</small><strong>Пока не указано</strong>' + (editable() ? '<span class="stay-hint">Отметьте день кнопками ниже.</span>' : '') + '</div>';
  if (p.same) return '<div class="stay ' + sClass(v) + '"><small>Где ' + who + '</small><strong>У ' + esc(p.a.gen) + '</strong></div>';
  return '<div class="stay split" role="group" aria-label="Где ' + who + '"><div class="half s-' + p.ca + p.ca + '"><small>Утром</small><strong>У ' + esc(p.a.gen) + '</strong></div><div class="half s-' + p.cb + p.cb + '"><small>Вечером</small><strong>У ' + esc(p.b.gen) + '</strong></div></div>';
}

/* What is happening right now, for today's page. */
function nowInfo(items) {
  const m = NOW.min, timed = items.filter((x) => mins(x.s) != null).sort(byStart);
  if (!timed.length) return null;
  const end = (x) => { const e = mins(x.e); return e == null || e <= mins(x.s) ? mins(x.s) + 1 : e; };
  const name = (x) => (x.kind === 'lesson' ? x.n + '-й урок, ' + x.t : x.t);
  const cur = timed.filter((x) => mins(x.s) <= m && m < end(x))[0];
  if (cur) return { key: cur.key, text: 'Сейчас: ' + name(cur) + (mins(cur.e) != null ? ' — до ' + fmtT(cur.e) : '') };
  const next = timed.filter((x) => mins(x.s) > m)[0];
  if (!next) return { key: '', text: 'На сегодня всё.' };
  const doneLessons = timed.filter((x) => x.kind === 'lesson' && end(x) <= m).length;
  if (next.kind === 'lesson' && !doneLessons) return { key: '', text: 'Первый урок в ' + fmtT(next.s) + ': ' + next.t };
  return { key: '', text: (next.kind === 'lesson' ? 'Перемена. ' : '') + 'Дальше: ' + next.t + ' в ' + fmtT(next.s) };
}

function markRow(iso) {
  const v = stayOn(iso), off = saving ? ' disabled' : '';
  const b = (val) => '<button type="button" class="btn mark' + (v === val ? ' on ' + sClass(val) : '') + '" data-act="mark" data-d="' + iso + '" data-v="' + val + '" aria-pressed="' + (v === val) + '"' + off + '>' + stayPick(val) + '</button>';
  return '<div class="markrow" role="group" aria-label="Отметить этот день"><span class="lbl">Отметить этот день</span><div class="pick">' + STAYV.map(b).join('') + '</div>'
    + (state.marks[iso] ? '<div class="quick"><button type="button" class="btn" data-act="mark" data-d="' + iso + '" data-v=""' + off + '>Сбросить</button></div>' : '')
    + (markMsg ? '<p class="save-msg ' + markMsg.kind + '" role="status">' + esc(markMsg.text) + '</p>' : '') + '</div>';
}
function paintEntry() {
  if (!editable() || paint) return '';
  return '<div class="quick"><button type="button" class="btn" data-act="paint">Отметить дни</button>' + (markMsg ? '<span class="save-msg ' + markMsg.kind + '" role="status">' + esc(markMsg.text) + '</span>' : '') + '</div>';
}
function paintBar() {
  const n = Object.keys(paint.changes).length, off = saving ? ' disabled' : '', bad = markMsg && markMsg.kind === 'err';
  const b = (val, wide) => '<button type="button"' + (wide ? ' class="wide"' : '') + ' data-act="brush" data-v="' + val + '" aria-pressed="' + (paint.brush === val) + '">' + (val ? stayPick(val) : 'Стереть') + '</button>';
  return '<div class="savebar" id="paintbar"><div class="brush" role="group" aria-label="Кого отмечаем">' + b('nn') + b('dd') + b('') + b('nd', true) + b('dn', true) + '</div>'
    + '<button type="button" class="btn primary" data-act="paint-save"' + off + '>' + (saving ? 'Сохраняю…' : 'Сохранить') + '</button><button type="button" class="btn" data-act="paint-cancel"' + off + '>Отмена</button>'
    + '<span class="save-msg' + (bad ? ' err' : ' inl') + '" role="status">' + esc(bad ? markMsg.text : 'Изменено дней: ' + n) + '</span></div>';
}
function dab(d) {
  if (!paint || !isIso(d)) return;
  const cur = state.marks[d] || '', want = paint.brush;
  if (paint.changes[d] === want || want === cur) delete paint.changes[d];
  else paint.changes[d] = want;
  const m = Object.assign({}, state.marks);
  Object.keys(paint.changes).forEach((k) => { if (paint.changes[k]) m[k] = paint.changes[k]; else delete m[k]; });
  paint.merged = m;
  render(true);
}
const outLink = (u, t) => '<a class="lnk" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + IC_GO + esc(t) + '</a>';
function restRow(x, curKey) {
  const time = fmtR(x.s, x.e) || (x.kind === 'club' ? '<span aria-hidden="true">—</span><span class="vh">время не указано</span>' : 'весь день');
  const links = (x.urlTo ? outLink(x.urlTo, 'Дорога туда на карте') : '') + (x.urlBack ? outLink(x.urlBack, 'Дорога обратно на карте') : '');
  return '<li' + (x.key === curKey ? ' class="now"' : '') + '><span class="tl-time">' + time + '</span><span class="mk ' + x.kind + '" aria-hidden="true"></span><span class="tl-main"><span class="tl-title">' + esc(x.t) + (x.key === curKey ? '<span class="pill">сейчас</span>' : '') + '</span><span class="tl-note">' + (x.kind === 'club' ? 'кружок' : 'план') + (x.note ? ' · ' + esc(x.note) : '') + '</span></span>'
    + (x.more || links ? '<div class="tl-extra">' + (x.more ? '<span>' + esc(x.more) + '</span>' : '') + (links ? '<span class="tl-links">' + links + '</span>' : '') + '</div>' : '') + '</li>';
}
function dayView() {
  const iso = cursor, off = offOn(iso), w = dow(iso);
  const L = lessonsOn(iso), rest = clubsOn(iso).concat(plansOn(iso)).sort(byStart);
  const info = iso === NOW.date ? nowInfo(L.concat(rest)) : null;
  const curKey = info ? info.key : '';
  lastNow = info ? info.text : '';
  let h = '<div class="day">' + stayBanner(stayOn(iso));
  if (editable()) h += markRow(iso);
  if (info) h += '<p class="nowline">' + esc(info.text) + '</p>';
  if (L.length) {
    h += '<section><div class="sec-h"><h2>Уроки</h2><span>' + fmtR(L[0].s, L[L.length - 1].e) + ' · ' + plural(L.length, ['урок', 'урока', 'уроков']) + '</span></div><ol class="tl">'
      + L.map((l) => '<li' + (l.key === curKey ? ' class="now"' : '') + '><span class="tl-time">' + fmtR(l.s, l.e) + '</span><span class="tl-n">' + l.n + '</span><span class="tl-main"><span class="tl-title">' + esc(l.t) + (l.key === curKey ? '<span class="pill">сейчас</span>' : '') + '</span></span></li>').join('')
      + '</ol></section>';
  } else {
    h += '<p class="empty">' + (off && w < 5 ? esc(off.t || 'Выходной') + ' — уроков нет.' : w > 4 ? 'Выходной — уроков нет.' : 'Уроки на этот день пока не внесены.') + '</p>';
  }
  if (rest.length) {
    h += '<section><div class="sec-h"><h2>Кружки и планы</h2></div><ul class="tl">'
      + rest.map((x) => restRow(x, curKey)).join('')
      + '</ul></section>';
  } else {
    h += '<p class="quiet">Кружков и планов на этот день нет.</p>';
  }
  if (editable()) h += '<div class="quick"><button type="button" class="btn" data-act="addplan" data-d="' + iso + '">Добавить план на этот день</button></div>';
  return h + '</div>';
}

function weekDay(iso) {
  const v = stayOn(iso), off = offOn(iso), L = lessonsOn(iso), w = dow(iso), isT = iso === NOW.date;
  const rest = clubsOn(iso).concat(plansOn(iso)).sort(byStart);
  const none = off && w < 5 ? esc(off.t || 'Выходной') + ' — уроков нет' : w > 4 ? 'Выходной' : 'Уроки не внесены';
  const inline = L.length ? '<span class="wk-time">' + fmtR(L[0].s, L[L.length - 1].e) + '</span> ' + L.map((l) => esc(l.t)).join(' · ') : none;
  const list = L.length ? '<span class="wk-range">' + fmtR(L[0].s, L[L.length - 1].e) + '</span>' + L.map((l) => '<span class="wl"><i>' + l.n + '</i><span>' + esc(l.t) + '</span></span>').join('') : '<span class="quiet">' + none + '</span>';
  const chips = rest.map((x) => '<span class="chip ' + x.kind + '">' + esc(x.t) + (fmtT(x.s) ? ' · ' + fmtT(x.s) : '') + '</span>').join('');
  const st = stayShort(v);
  return '<button type="button" class="wk-day' + (isT ? ' today' : '') + '" data-act="open" data-d="' + iso + '"><span class="wk-in">'
    + '<span class="tile ' + sClass(v) + '"><span class="tile-wd">' + WD[w] + '</span><span class="tile-d">' + ymd(iso).d + '</span></span>'
    + '<span class="wk-body">' + (isT || st ? '<span class="wk-stay">' + (isT ? '<span class="pill">сегодня</span>' : '') + esc(cap(st)) + '</span>' : '')
    + '<span class="wk-inline' + (L.length ? '' : ' quiet') + '">' + inline + '</span><span class="wk-list">' + list + '</span>'
    + (chips ? '<span class="chips">' + chips + '</span>' : '') + '</span></span></button>';
}
function weekView() {
  const a = monday(cursor);
  let h = paintEntry() + '<div class="wk">';
  for (let i = 0; i < 7; i++) h += weekDay(addDays(a, i));
  return h + '</div>' + legend(false);
}

function monthCell(iso, inMonth) {
  const v = stayOn(iso), off = offOn(iso), w = dow(iso), C = clubsOn(iso), P = plansOn(iso);
  const cls = ['mo-cell', sClass(v)];
  if (!inMonth) cls.push('out');
  if (iso === NOW.date) cls.push('today');
  if (paint && paint.changes[iso] !== undefined) cls.push('chg');
  const isOff = off && w < 5;
  if (isOff) cls.push('off');
  const label = [fmtD(iso), WDF[w], stayShort(v), isOff ? (off.t || 'уроков нет') : ''].concat(C.map((c) => 'кружок: ' + c.t), P.map((p) => 'план: ' + p.t)).filter(Boolean).join(', ');
  return '<button type="button" class="' + cls.join(' ') + '" data-act="' + (paint ? 'dab' : 'open') + '" data-d="' + iso + '" aria-label="' + esc(label) + '"><span class="mo-in">'
    + '<span class="mo-top"><span class="mo-d">' + ymd(iso).d + '</span><span class="mo-who">' + esc(stayLetters(v)) + '</span></span>'
    + '<span class="mo-marks">' + C.map(() => '<i class="mk club"></i>').join('') + P.map(() => '<i class="mk plan"></i>').join('') + '</span>'
    + '<span class="mo-text">' + (isOff ? '<span>' + esc(off.t || 'Уроков нет') + '</span>' : '') + C.map((c) => '<span>' + (fmtT(c.s) ? fmtT(c.s) + ' ' : '') + esc(c.t) + '</span>').join('') + P.map((p) => '<span>' + esc(p.t) + '</span>').join('') + '</span>'
    + '</span></button>';
}
function monthView() {
  const p = ymd(cursor), first = toIso(Date.UTC(p.y, p.m - 1, 1)), last = toIso(Date.UTC(p.y, p.m, 0)), ym = first.slice(0, 7);
  let h = (paint ? '<p class="paint-hint">Выберите внизу, кого отмечаете, и нажимайте на дни. В конце нажмите «Сохранить».</p>' : paintEntry()) + '<div class="mo"><div class="mo-head" aria-hidden="true">' + WD.map((w) => '<span>' + w + '</span>').join('') + '</div><div class="mo-grid">';
  const seen = {};
  for (let d = monday(first); d <= last; d = addDays(d, 7)) for (let i = 0; i < 7; i++) { const iso = addDays(d, i); seen[stayOn(iso)] = true; h += monthCell(iso, iso.slice(0, 7) === ym); }
  h += '</div></div>' + legend(true, seen);
  if (paint) return h;
  const items = [];
  state.plans.forEach((x) => { if (x && x.t && isIso(x.date)) { const to = isIso(x.to) ? x.to : x.date; if (x.date <= last && to >= first) items.push({ from: x.date, to: to, t: x.t, kind: 'plan' }); } });
  state.daysOff.forEach((x) => { if (x && isIso(x.from)) { const to = isIso(x.to) ? x.to : x.from; if (x.from <= last && to >= first) items.push({ from: x.from, to: to, t: (x.t || 'Уроков нет'), kind: 'off' }); } });
  items.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  h += '<section><div class="sec-h"><h2>В этом месяце</h2></div>';
  if (items.length) {
    h += '<ul class="mo-list">' + items.map((x) => '<li><button type="button" data-act="open" data-d="' + (x.from < first ? first : x.from) + '"><span class="mo-li">' + (x.kind === 'plan' ? '<span class="mk plan" aria-hidden="true"></span>' : '<span class="dash" aria-hidden="true"></span>') + '<span class="when">' + fmtSpan(x.from, x.to) + '</span><span>' + esc(x.t) + (x.kind === 'off' ? ' — уроков нет' : '') + '</span></span></button></li>').join('') + '</ul>';
  } else h += '<p class="quiet">Каникул, праздников и разовых планов в этом месяце нет.</p>';
  return h + '</section>';
}

function legend(month, seen) {
  const P = state.people;
  const half = (v) => (seen && seen[v] ? '<span class="lg"><i class="sw ' + sClass(v) + '"></i>' + esc(stayLetters(v) + ' — ' + stayLong(v)) + '</span>' : '');
  return '<div class="legend"><span class="lg"><i class="sw s-nn"></i>у ' + esc(P.n.gen) + '</span><span class="lg"><i class="sw s-dd"></i>у ' + esc(P.d.gen) + '</span>' + half('nd') + half('dn') + '<span class="lg"><i class="mk club"></i>кружок</span><span class="lg"><i class="mk plan"></i>план</span>' + (month ? '<span class="lg"><i class="sw hatch"></i>уроков нет</span>' : '') + '</div>';
}

function noticeHtml() {
  if (notice.kind === 'restore') return '<div class="callout" role="status"><span>Остались несохранённые правки с прошлого раза.</span><span class="callout-actions"><button type="button" class="btn primary" data-act="restore">Восстановить</button><button type="button" class="btn" data-act="discard">Удалить</button></span></div>';
  return '<div class="notice" role="status"><span>' + esc(notice.text) + '</span><button type="button" class="btn" data-act="dismiss">Понятно</button></div>';
}

function viewBody() {
  let h = '';
  if (notice) h += noticeHtml();
  if (offline) h += '<div class="callout" role="status"><span>Нет связи. Показано расписание, сохранённое ' + esc(whenText(syncedAt)) + '.</span></div>';
  if (state.sample) h += '<div class="callout" role="note"><span><b>Образец.</b> Уроки и звонки здесь примерные. Настоящее расписание появится, когда ' + esc(state.people.d.name) + ' его внесёт.</span></div>';
  if (state.note) h += '<div class="callout" role="note"><span>' + esc(state.note) + '</span></div>';
  if (editable() && !paint && stayEmpty(state)) h += '<div class="callout" role="note"><span>Дни у ' + esc(state.people.n.gen) + ' и у ' + esc(state.people.d.gen) + ' ещё не указаны.</span><span class="callout-actions"><button type="button" class="btn primary" data-act="paint">Отметить дни</button></span></div>';
  h += nav();
  h += view === 'day' ? dayView() : view === 'week' ? weekView() : monthView();
  h += '<p class="foot">' + (state.updated ? 'Обновлено ' + fmtD(state.updated) + ' ' + ymd(state.updated).y + '. ' : '') + 'Менять расписание может только ' + esc(state.people.d.name) + '. ' + (gh ? '<button type="button" class="linkbtn" data-act="logout">Выйти из режима редактора</button>' : '<button type="button" class="linkbtn" data-act="login">Вход для редактора</button>') + '</p>';
  if (paint) h += paintBar();
  return h;
}

/* ---------- editor ---------- */
const idOf = (k) => 'f-' + k.replace(/\./g, '-');
const inp = (type, k, val, extra) => '<input type="' + type + '" id="' + idOf(k) + '" data-k="' + k + '" value="' + esc(val) + '"' + (extra || '') + '>';
const delBtn = (list, i, label) => '<button type="button" class="del" data-act="del" data-list="' + list + '" data-i="' + i + '" aria-label="' + label + '">' + IC_X + '</button>';
const area = (k, val, rows, extra) => '<textarea id="' + idOf(k) + '" data-k="' + k + '" rows="' + rows + '"' + (extra || '') + '>' + esc(val) + '</textarea>';
const addBtn = (list, label) => '<button type="button" class="btn add" data-act="add" data-list="' + list + '">+ ' + label + '</button>';
function sel(k, val, placeholder) {
  const n = draft.people.n, d = draft.people.d;
  const opts = [['', placeholder], ['nn', 'У ' + n.gen], ['dd', 'У ' + d.gen], ['nd', n.name + ' → ' + d.name], ['dn', d.name + ' → ' + n.name]];
  return '<select id="' + idOf(k) + '" data-k="' + k + '">' + opts.map((o) => '<option value="' + o[0] + '"' + (o[0] === (val || '') ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
}

function edStay() {
  const s = draft.stay, bi = s.mode === 'biweekly', child = esc(draft.child.name);
  const block = (key, title) => '<div class="blk"><h3>' + title + '</h3>' + WDF.map((w, i) => '<label class="row"><span class="row-l">' + cap(w) + '</span>' + sel('stay.' + key + '.' + i, s[key][i], 'не указано') + '</label>').join('') + '</div>';
  const nm = Object.keys(draft.marks || {}).length;
  let h = '<p class="hint">Отдельные дни проще отмечать прямо в календаре кнопкой «Отметить дни». Шаблон ниже действует в дни без отметки.</p>'
    + (nm ? '<div class="quick"><span class="hint">Отмечено дней в календаре: ' + nm + '.</span><button type="button" class="btn" data-act="clear-marks">Убрать все отметки</button></div>' : '')
    + '<div class="choice" role="radiogroup" aria-label="Как повторяются недели">'
    + '<label><input type="radio" name="staymode" id="f-stay-mode-weekly" data-k="stay.mode" value="weekly"' + (bi ? '' : ' checked') + '>Каждая неделя одинаковая</label>'
    + '<label><input type="radio" name="staymode" id="f-stay-mode-biweekly" data-k="stay.mode" value="biweekly"' + (bi ? ' checked' : '') + '>Две недели чередуются</label></div>';
  h += '<div class="cols">' + block('a', bi ? 'Неделя А' : 'По дням недели') + (bi ? block('b', 'Неделя Б') : '') + '</div>';
  h += '<p class="hint">«' + esc(draft.people.n.name) + ' → ' + esc(draft.people.d.name) + '» значит: утром у ' + esc(draft.people.n.gen) + ', вечером у ' + esc(draft.people.d.gen) + '.</p>';
  if (bi) {
    const an = isIso(s.anchor) ? monday(s.anchor) : monday(NOW.date);
    const wk = Math.round((toTs(monday(NOW.date)) - toTs(an)) / (7 * DAY));
    h += '<label><span class="lbl">Неделя А начинается в понедельник</span>' + inp('date', 'stay.anchor', an) + '</label><p class="hint">Сейчас идёт неделя ' + ((((wk % 2) + 2) % 2) ? 'Б' : 'А') + '.</p>';
  }
  h += '<h3>Исключения</h3><p class="hint">Отдельные дни или периоды, когда всё иначе: поездка, обмен днями, праздники.</p>';
  h += draft.stayOverrides.map((o, i) => '<div class="card"><div class="two dates"><label><span class="lbl">С</span>' + inp('date', 'stayOverrides.' + i + '.from', o.from) + '</label><label><span class="lbl">По</span>' + inp('date', 'stayOverrides.' + i + '.to', o.to) + '</label></div><div class="card-h"><label class="grow"><span class="lbl">Где ' + child + '</span>' + sel('stayOverrides.' + i + '.v', o.v, 'выберите') + '</label>' + delBtn('ov', i, 'Удалить исключение') + '</div></div>').join('');
  return h + addBtn('ov', 'Добавить исключение');
}
function subjects() { const seen = {}, out = []; for (let w = 1; w <= 5; w++) (draft.lessons[w] || []).forEach((t) => { t = String(t == null ? '' : t).trim(); if (t && !seen[t]) { seen[t] = 1; out.push(t); } }); return out.sort((a, b) => a.localeCompare(b, 'ru')); }
function edLessons() {
  const row = draft.lessons[edWd] || [];
  let h = '<div class="tabs" role="group" aria-label="День недели">' + [1, 2, 3, 4, 5].map((d) => '<button type="button" class="tab" data-act="edwd" data-wd="' + d + '" aria-pressed="' + (d === edWd) + '">' + WD[d - 1] + '</button>').join('') + '</div>';
  if (!draft.bells.length) return h + '<p class="hint">Сначала добавьте время уроков в разделе «Звонки».</p>';
  h += draft.bells.map((b, i) => '<label class="row lrow"><span class="row-l"><b>' + (i + 1) + '</b> ' + (fmtR(b[0], b[1]) || 'без времени') + '</span>' + inp('text', 'lessons.' + edWd + '.' + i, row[i] == null ? '' : row[i], ' list="f-subjects" placeholder="нет урока" autocomplete="off"') + '</label>').join('');
  h += '<datalist id="f-subjects">' + subjects().map((s) => '<option value="' + esc(s) + '"></option>').join('') + '</datalist>';
  return h + '<p class="hint">Пустая строка означает, что урока нет. Время уроков меняется в разделе «Звонки».</p>';
}
function edBells() {
  return draft.bells.map((b, i) => '<div class="brow"><b>' + (i + 1) + '</b>' + inp('time', 'bells.' + i + '.0', b[0], ' aria-label="Начало урока ' + (i + 1) + '"') + '<span aria-hidden="true">–</span>' + inp('time', 'bells.' + i + '.1', b[1], ' aria-label="Конец урока ' + (i + 1) + '"') + delBtn('bells', i, 'Удалить урок ' + (i + 1) + ' из сетки') + '</div>').join('')
    + addBtn('bells', 'Добавить урок в сетку') + '<p class="hint">Если удалить строку, этот урок пропадёт из расписания всех дней.</p>';
}
function edClubs() {
  return draft.clubs.map((c, i) => '<div class="card"><div class="card-h"><label class="grow"><span class="lbl">Название</span>' + inp('text', 'clubs.' + i + '.t', c.t, ' placeholder="Например, рисование"') + '</label>' + delBtn('clubs', i, 'Удалить кружок') + '</div>'
    + '<div class="days" role="group" aria-label="Дни недели">' + WD.map((w, d) => '<label class="daychk"><input type="checkbox" id="' + idOf('clubs.' + i + '.day' + (d + 1)) + '" data-k="clubs.' + i + '.days" data-day="' + (d + 1) + '"' + ((c.days || []).indexOf(d + 1) >= 0 ? ' checked' : '') + '><span>' + w + '</span></label>').join('') + '</div>'
    + '<div class="two"><label><span class="lbl">Начало</span>' + inp('time', 'clubs.' + i + '.s', c.s) + '</label><label><span class="lbl">Конец</span>' + inp('time', 'clubs.' + i + '.e', c.e) + '</label></div>'
    + '<label><span class="lbl">Где (необязательно)</span>' + inp('text', 'clubs.' + i + '.where', c.where) + '</label>'
    + '<label><span class="lbl">Заметка, например как добраться (необязательно)</span>' + area('clubs.' + i + '.note', c.note, 3) + '</label>'
    + '<label><span class="lbl">Ссылка «Дорога туда» (необязательно)</span>' + inp('url', 'clubs.' + i + '.urlTo', c.urlTo, ' placeholder="https://" autocomplete="off"') + '</label>'
    + '<label><span class="lbl">Ссылка «Дорога обратно» (необязательно)</span>' + inp('url', 'clubs.' + i + '.urlBack', c.urlBack, ' placeholder="https://" autocomplete="off"') + '</label></div>').join('')
    + addBtn('clubs', 'Добавить кружок') + '<p class="hint">Если в разные дни время разное, добавьте кружок дважды. Ссылки должны начинаться с https://, иначе они не сохранятся.</p>';
}
function edPlans() {
  return draft.plans.map((p, i) => '<div class="card"><div class="card-h"><label class="grow"><span class="lbl">Что</span>' + inp('text', 'plans.' + i + '.t', p.t, ' placeholder="Например, экскурсия с классом"') + '</label>' + delBtn('plans', i, 'Удалить план') + '</div>'
    + '<div class="two dates"><label><span class="lbl">Дата</span>' + inp('date', 'plans.' + i + '.date', p.date) + '</label><label><span class="lbl">По</span>' + inp('date', 'plans.' + i + '.to', p.to) + '</label></div>'
    + '<div class="two"><label><span class="lbl">Начало</span>' + inp('time', 'plans.' + i + '.s', p.s) + '</label><label><span class="lbl">Конец</span>' + inp('time', 'plans.' + i + '.e', p.e) + '</label></div>'
    + '<label><span class="lbl">Заметка (необязательно)</span>' + inp('text', 'plans.' + i + '.note', p.note) + '</label></div>').join('')
    + addBtn('plans', 'Добавить план') + '<p class="hint">«По» заполняется, только если план на несколько дней. Без времени план считается на весь день.</p>';
}
function edOff() {
  return draft.daysOff.map((o, i) => '<div class="card"><div class="card-h"><label class="grow"><span class="lbl">Название</span>' + inp('text', 'daysOff.' + i + '.t', o.t, ' placeholder="Например, осенние каникулы"') + '</label>' + delBtn('off', i, 'Удалить период') + '</div>'
    + '<div class="two dates"><label><span class="lbl">С</span>' + inp('date', 'daysOff.' + i + '.from', o.from) + '</label><label><span class="lbl">По</span>' + inp('date', 'daysOff.' + i + '.to', o.to) + '</label></div></div>').join('')
    + addBtn('off', 'Добавить период') + '<p class="hint">В эти дни уроки не показываются. Кружки остаются.</p>';
}
const SECS = [
  ['stay', () => 'Где ' + draft.child.name, () => 'Дни у ' + draft.people.n.gen + ' и у ' + draft.people.d.gen, edStay],
  ['lessons', () => 'Уроки', () => 'Расписание по дням недели', edLessons],
  ['bells', () => 'Звонки', () => (draft.bells.length ? plural(draft.bells.length, ['урок', 'урока', 'уроков']) + ' в сетке' : 'время уроков не задано'), edBells],
  ['clubs', () => 'Кружки', () => (draft.clubs.length ? plural(draft.clubs.length, ['кружок', 'кружка', 'кружков']) : 'пока нет'), edClubs],
  ['plans', () => 'Планы', () => (draft.plans.length ? plural(draft.plans.length, ['план', 'плана', 'планов']) : 'разовые события: поездки, врач, праздники'), edPlans],
  ['off', () => 'Каникулы и выходные', () => (draft.daysOff.length ? plural(draft.daysOff.length, ['период', 'периода', 'периодов']) + ' без уроков' : 'дни без уроков'), edOff]
];
const secOf = (id) => SECS.filter((s) => s[0] === id)[0];
function saveBarInner() {
  if (askCancel) return '<span class="save-q">Отменить несохранённые изменения?</span><button type="button" class="btn" data-act="cancel-yes">Да, отменить</button><button type="button" class="btn primary" data-act="cancel-no">Продолжить</button>';
  let h = '<button type="button" class="btn primary" data-act="save"' + (saving ? ' disabled' : '') + '>' + (saving ? 'Сохраняю…' : 'Сохранить') + '</button><button type="button" class="btn" data-act="cancel"' + (saving ? ' disabled' : '') + '>Отмена</button>';
  if (saveMsg) {
    h += '<div class="save-msg ' + saveMsg.kind + '" role="alert"><span>' + esc(saveMsg.text) + '</span>' + (saveMsg.force ? '<button type="button" class="btn" data-act="save-force">Сохранить мою версию</button>' : '') + (saveMsg.copy ? '<button type="button" class="btn" data-act="copy">Скопировать правки</button>' : '') + '</div>';
    if (saveMsg.dump) h += '<textarea id="f-dump" class="dump" readonly rows="4" aria-label="Правки в виде текста">' + esc(saveMsg.dump) + '</textarea>';
  }
  return h;
}
function editor() {
  let h = '<div class="ed"><h1 class="ed-h">Изменить расписание</h1><p class="ed-lead">Изменения увидят все, у кого есть ссылка, после нажатия «Сохранить».</p>';
  if (draft.sample) h += '<div class="callout" role="note" id="ed-sample"><span><b>Сейчас показан образец.</b> Уроки и звонки примерные: исправьте их или очистите.</span><span class="callout-actions"><button type="button" class="btn" data-act="clear-sample">Очистить уроки</button><label class="check"><input type="checkbox" id="f-sample" data-k="sample" checked>Показывать пометку «Образец»</label></span></div>';
  h += '<label><span class="lbl">Объявление вверху страницы (необязательно)</span>' + area('note', draft.note, 2, ' placeholder="Например: на этой неделе расписание другое"') + '</label>';
  h += SECS.map((s) => '<details class="sec" data-sec="' + s[0] + '"' + (openSecs[s[0]] ? ' open' : '') + '><summary><span class="sec-t">' + esc(s[1]()) + '</span><span class="sec-s" id="sub-' + s[0] + '">' + esc(s[2]()) + '</span>' + IC_D + '</summary><div class="sec-b" id="sec-' + s[0] + '">' + s[3]() + '</div></details>').join('');
  return h + '<div class="savebar" id="savebar">' + saveBarInner() + '</div></div>';
}
function renderSaveBar() { const el = D.getElementById('savebar'); if (el) el.innerHTML = saveBarInner(); }
function rerender(id) {
  const s = secOf(id), el = D.getElementById('sec-' + id), sub = D.getElementById('sub-' + id);
  if (!s || !el) return;
  const act = D.activeElement && D.activeElement.id;
  el.innerHTML = s[3]();
  if (sub) sub.textContent = s[2]();
  if (act) { const f = D.getElementById(act); if (f && el.contains(f)) f.focus(); }
}
const getPath = (o, path) => path.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
function setPath(o, path, val) {
  const ks = path.split('.');
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}
function markDirty() { dirty = true; if (askCancel || (saveMsg && !saveMsg.copy)) { askCancel = false; saveMsg = null; renderSaveBar(); } }

const LISTS = {
  ov: { path: 'stayOverrides', sec: 'stay', focus: 'from', make: () => ({ from: cursor, to: cursor, v: '' }) },
  bells: { path: 'bells', sec: 'bells', focus: '0', make: () => { const l = draft.bells[draft.bells.length - 1], e = l ? mins(l[1]) : null, s = e == null ? 510 : e + 10; return [hhmm(s), hhmm(s + 40)]; } },
  clubs: { path: 'clubs', sec: 'clubs', focus: 't', make: () => ({ t: '', days: [], s: '', e: '', where: '', note: '', urlTo: '', urlBack: '' }) },
  plans: { path: 'plans', sec: 'plans', focus: 't', make: () => ({ date: cursor, to: '', s: '', e: '', t: '', note: '' }) },
  off: { path: 'daysOff', sec: 'off', focus: 't', make: () => ({ from: '', to: '', t: '' }) }
};
function addRow(list) {
  const L = LISTS[list]; if (!L) return;
  draft[L.path].push(L.make());
  markDirty(); rerender(L.sec);
  if (list === 'bells') rerender('lessons');
  const f = D.getElementById(idOf(L.path + '.' + (draft[L.path].length - 1) + '.' + L.focus));
  if (f) f.focus();
}
function delRow(list, i) {
  const L = LISTS[list]; if (!L || !(i >= 0)) return;
  draft[L.path].splice(i, 1);
  if (list === 'bells') { for (let w = 1; w <= 5; w++) if (draft.lessons[w] && draft.lessons[w].length > i) draft.lessons[w].splice(i, 1); }
  markDirty(); rerender(L.sec);
  if (list === 'bells') rerender('lessons');
}
function startEdit(o) {
  o = o || {};
  draft = migrate(JSON.parse(JSON.stringify(o.from || state)));
  dirty = !!o.from; askCancel = false; saveMsg = null; saving = false; mode = 'edit'; notice = null; baseRev = +state.rev || 0;
  const w = dow(cursor); edWd = w < 5 ? w + 1 : 1;
  const sec = o.sec || (stayEmpty(draft) ? 'stay' : 'lessons');
  openSecs = {}; openSecs[sec] = true;
  let focusId = '';
  if (o.ov) { draft.stayOverrides.push({ from: o.ov, to: o.ov, v: '' }); focusId = idOf('stayOverrides.' + (draft.stayOverrides.length - 1) + '.v'); }
  if (o.plan) { draft.plans.push({ date: o.plan, to: '', s: '', e: '', t: '', note: '' }); focusId = idOf('plans.' + (draft.plans.length - 1) + '.t'); }
  render();
  const f = focusId && D.getElementById(focusId);
  if (f) { f.scrollIntoView({ block: 'center' }); f.focus({ preventScroll: true }); }
  else if (o.sec) { const d = app.querySelector('details[data-sec="' + o.sec + '"]'); if (d) d.scrollIntoView({ block: 'start' }); }
  else window.scrollTo(0, 0);
}
function exitEdit() { mode = 'view'; draft = null; dirty = false; askCancel = false; saveMsg = null; render(); window.scrollTo(0, 0); }

/* ---------- the personal link: the key sits in the address after "#", which browsers never send to a server ---------- */
const b64 = {
  enc(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); },
  dec(text) { const s = atob(text), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
};
const fromUrl64 = (t) => { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; return b64.dec(t); };
const utf8 = { enc: (s) => new TextEncoder().encode(s), dec: (b) => new TextDecoder().decode(b) };
function findKey(text) {
  text = String(text == null ? '' : text).trim();
  const m = /[#&]k=([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/.exec(text) || /^([A-Za-z0-9_-]{43})$/.exec(text);
  return m ? m[1] : '';
}
async function useKey(text) {
  const raw = fromUrl64(text);
  if (raw.length !== 32) throw new Error('key');
  key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  keyText = text;
}
async function seal(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, utf8.enc(JSON.stringify(obj))));
  return JSON.stringify({ v: 1, iv: b64.enc(iv), ct: b64.enc(ct) }) + '\n';
}
async function unseal(text) {
  const o = JSON.parse(text);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(o.iv) }, key, b64.dec(o.ct));
  return JSON.parse(utf8.dec(new Uint8Array(pt)));
}

/* ---------- loading ---------- */
function whenText(ts) {
  try { return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Riga', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); }
  catch (e) { return ''; }
}
function remember(obj) { ls.set('sched.cache', JSON.stringify({ at: Date.now(), data: obj })); }
function recall() { try { const o = JSON.parse(ls.get('sched.cache') || 'null'); return o && o.data && typeof o.data === 'object' ? o : null; } catch (e) { return null; } }
function adopt(obj) {
  const next = migrate(JSON.parse(JSON.stringify(obj)));
  const changed = phase !== 'ready' || !sameData(next, state);
  state = next; phase = 'ready';
  try { D.title = 'Расписание' + (state.child.gen ? ' ' + state.child.gen : ''); } catch (e) { /* cosmetic only */ }
  if (changed && mode === 'view') render(true);
}
async function fetchSealed() {
  const res = await fetch('data.json?v=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('http ' + res.status);
  return res.text();
}
function lockOut() {
  key = null; keyText = ''; ls.del('sched.k'); ls.del('sched.cache');
  phase = 'badkey'; mode = 'view'; draft = null; paint = null; render();
}
function candidates() {
  const out = [];
  [findKey(location.hash), ls.get('sched.k') || ''].forEach((k) => { if (k && out.indexOf(k) < 0) out.push(k); });
  return out;
}
async function start(keys) {
  phase = 'loading'; gateMsg = ''; render();
  let text = null;
  try { text = await fetchSealed(); } catch (e) { text = null; }
  if (text == null) {
    /* no connection: show the copy this device saved last time, if there is one */
    const c = keys.length ? recall() : null;
    if (!c) { phase = keys.length ? 'error' : 'locked'; render(); return; }
    try { await useKey(keys[0]); } catch (e) { /* the saved copy can still be shown */ }
    offline = true; syncedAt = c.at; adopt(c.data);
    return;
  }
  if (!keys.length) { phase = 'locked'; render(); return; }
  let obj = null;
  for (let i = 0; i < keys.length && !obj; i++) { try { await useKey(keys[i]); obj = await unseal(text); } catch (e) { obj = null; } }
  if (!obj) { lockOut(); return; }
  ls.set('sched.k', keyText);
  /* keep the key in the address so a bookmark or a home-screen icon made from this page still opens it */
  try { if (findKey(location.hash) !== keyText) history.replaceState(null, '', location.pathname + location.search + '#k=' + keyText); } catch (e) { /* the address stays as it was */ }
  offline = false; syncedAt = Date.now(); remember(obj); adopt(obj);
}
async function refresh() {
  if (phase !== 'ready' || mode !== 'view' || !key || saving || paint) return;
  let text;
  try { text = await fetchSealed(); }
  catch (e) { if (!offline) { offline = true; if (mode === 'view') render(true); } return; }
  let obj;
  try { obj = await unseal(text); } catch (e) { lockOut(); return; }
  if (phase !== 'ready' || mode !== 'view' || paint) return;
  const was = offline;
  offline = false; syncedAt = Date.now();
  /* right after a save the host may still serve the previous copy for a minute: never step back to it */
  if ((+obj.rev || 0) >= (+state.rev || 0)) { remember(obj); adopt(obj); }
  if (was && mode === 'view') render(true);
}

/* ---------- editing: saved straight into the site's repository with the editor's own GitHub token ---------- */
function readGh() {
  try { const o = JSON.parse(ls.get('sched.gh') || 'null'); return o && typeof o.token === 'string' && o.token ? { token: o.token, branch: typeof o.branch === 'string' && o.branch ? o.branch : 'main' } : null; }
  catch (e) { return null; }
}
function repoInfo() {
  const meta = D.querySelector('meta[name="sched-repo"]');
  let m = /^([\w.-]+)\/([\w.-]+)$/.exec(meta ? String(meta.getAttribute('content') || '').trim() : '');
  if (m) return { owner: m[1], repo: m[2] };
  m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
  if (!m) return null;
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return { owner: m[1], repo: seg && seg.indexOf('.') < 0 ? seg : m[1] + '.github.io' };
}
async function api(path, opt) {
  const r = repoInfo();
  if (!r) throw { code: 'norepo' };
  opt = opt || {};
  const headers = { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + (opt.token || (gh && gh.token) || '') };
  if (opt.body) headers['Content-Type'] = 'application/json';
  try { return await fetch('https://api.github.com/repos/' + r.owner + '/' + r.repo + path, { method: opt.method || 'GET', headers: headers, body: opt.body, cache: 'no-store' }); }
  catch (e) { throw { code: 'network' }; }
}
async function login(token) {
  token = String(token == null ? '' : token).trim();
  if (loginBusy) return;
  if (!token) { loginMsg = 'Вставьте токен.'; render(true); return; }
  loginBusy = true; loginMsg = ''; render(true);
  try {
    const res = await api('', { token: token });
    if (res.status === 200) {
      const j = await res.json();
      if (j && j.permissions && j.permissions.push === false) loginMsg = 'У этого аккаунта GitHub нет права менять репозиторий сайта.';
      else {
        gh = { token: token, branch: (j && j.default_branch) || 'main' };
        ls.set('sched.gh', JSON.stringify(gh));
        loginBusy = false; mode = 'view';
        notice = { kind: 'ok', text: 'Режим редактора включён на этом устройстве. Вверху появилась кнопка «Изменить».' };
        render(); window.scrollTo(0, 0);
        return;
      }
    } else if (res.status === 401) loginMsg = 'GitHub не принял токен. Проверьте, что он скопирован целиком и срок его действия не истёк.';
    else if (res.status === 403 || res.status === 404) loginMsg = 'У токена нет доступа к репозиторию этого сайта. Проверьте шаг 2.';
    else loginMsg = 'GitHub ответил ошибкой ' + res.status + '. Попробуйте чуть позже.';
  } catch (e) {
    loginMsg = e && e.code === 'network' ? 'Нет связи с GitHub. Проверьте интернет и попробуйте ещё раз.' : e && e.code === 'norepo' ? 'Не удалось определить репозиторий этого сайта.' : 'Не получилось проверить токен. Попробуйте ещё раз.';
  }
  loginBusy = false; render(true);
}
function failText(e) {
  const code = e && e.code;
  if (code === 'auth') return 'GitHub не принял токен: возможно, срок его действия истёк. Выйдите из режима редактора и войдите с новым токеном.';
  if (code === 'scope') return 'У токена нет права записи в репозиторий сайта. Нужно разрешение Contents: Read and write.';
  if (code === 'race') return 'Файл расписания только что изменился. Попробуйте ещё раз.';
  if (code === 'network') return 'Нет связи с GitHub. Проверьте интернет и попробуйте ещё раз.';
  if (code === 'norepo') return 'Не удалось определить репозиторий этого сайта.';
  return 'Не получилось сохранить' + (e && e.status ? ' (ошибка ' + e.status + ')' : '') + '. Попробуйте ещё раз.';
}
/* One commit to data.json. makeNext receives the newest copy in the repository (or null) and returns what to store. */
async function writeRemote(makeNext) {
  if (!gh) throw { code: 'auth' };
  const branch = gh.branch || 'main';
  const cur = await api('/contents/data.json?ref=' + encodeURIComponent(branch));
  let sha = null, remote = null;
  if (cur.status === 200) {
    const j = await cur.json();
    sha = j.sha || null;
    try { remote = await unseal(utf8.dec(b64.dec(String(j.content || '').replace(/\s+/g, '')))); } catch (e) { remote = null; }
  } else if (cur.status === 401) throw { code: 'auth' };
  else if (cur.status === 403) throw { code: 'scope' };
  else if (cur.status !== 404) throw { code: 'http', status: cur.status };
  const next = makeNext(remote);
  next.rev = Math.max(Date.now(), (remote ? +remote.rev || 0 : 0) + 1, (+state.rev || 0) + 1);
  const body = { message: 'update', content: b64.enc(utf8.enc(await seal(next))), branch: branch };
  if (sha) body.sha = sha;
  const put = await api('/contents/data.json', { method: 'PUT', body: JSON.stringify(body) });
  if (put.status !== 200 && put.status !== 201) throw { code: put.status === 401 ? 'auth' : put.status === 403 || put.status === 404 ? 'scope' : put.status === 409 || put.status === 422 ? 'race' : 'http', status: put.status };
  return next;
}
function landed(next) { state = migrate(JSON.parse(JSON.stringify(next))); remember(next); syncedAt = Date.now(); offline = false; }
async function save(force) {
  if (saving || !draft) return;
  const mine = normalize(draft);
  mine.updated = rigaNow().date;
  saving = true; saveMsg = null; askCancel = false; renderSaveBar();
  try {
    const next = await writeRemote((remote) => { if (!force && remote && (+remote.rev || 0) !== baseRev) throw { code: 'changed' }; return mine; });
    landed(next);
    draft = null; dirty = false; saving = false; mode = 'view';
    notice = { kind: 'ok', text: 'Сохранено. На других телефонах расписание обновится через минуту-две.' };
    render(); window.scrollTo(0, 0);
  } catch (e) {
    const code = e && e.code;
    saving = false;
    if (code === 'changed') saveMsg = { kind: 'err', text: 'Пока вы вносили изменения, расписание поменяли в другом месте. Можно сохранить вашу версию поверх или отменить и открыть свежую.', force: true };
    else if (code === 'auth') saveMsg = { kind: 'err', text: 'GitHub не принял токен: возможно, срок его действия истёк. Скопируйте правки, выйдите из режима редактора и войдите с новым токеном.', copy: true };
    else if (code === 'scope') saveMsg = { kind: 'err', text: 'У токена нет права записи в репозиторий сайта. Нужно разрешение Contents: Read and write.', copy: true };
    else if (code === 'race') saveMsg = { kind: 'err', text: 'Файл расписания только что изменился. Нажмите «Сохранить» ещё раз.' };
    else if (code === 'network') saveMsg = { kind: 'err', text: 'Нет связи с GitHub. Проверьте интернет и нажмите «Сохранить» ещё раз.' };
    else saveMsg = { kind: 'err', text: failText(e), copy: true };
    renderSaveBar();
  }
}
/* Day marks are applied on top of the newest copy, so they never collide with other edits. */
async function saveMarks(changes, after) {
  if (saving || !gh) return;
  saving = true; markMsg = { kind: 'ok', text: 'Сохраняю…' }; render(true);
  try {
    const next = await writeRemote((remote) => {
      const base = normalize(migrate(JSON.parse(JSON.stringify(remote || state))));
      Object.keys(changes).forEach((k) => { if (!isIso(k)) return; if (STAYV.indexOf(changes[k]) >= 0) base.marks[k] = changes[k]; else delete base.marks[k]; });
      base.marks = cleanMarks(base.marks);
      base.updated = rigaNow().date;
      return base;
    });
    landed(next);
    saving = false;
    markMsg = { kind: 'ok', text: 'Сохранено. На других телефонах обновится через минуту-две.' };
    if (after) after();
    render(true);
  } catch (e) {
    saving = false; markMsg = { kind: 'err', text: failText(e) }; render(true);
  }
}
function copyDraft() {
  const text = JSON.stringify(normalize(draft));
  const manual = () => { saveMsg = { kind: 'err', text: 'Выделите текст ниже и скопируйте его, чтобы правки не пропали.', copy: true, dump: text }; renderSaveBar(); const t = D.getElementById('f-dump'); if (t) { t.focus(); t.select(); } };
  try { navigator.clipboard.writeText(text).then(() => { saveMsg = { kind: 'ok', text: 'Правки скопированы.', copy: true }; renderSaveBar(); }, manual); }
  catch (e) { manual(); }
}

/* ---------- screens shown before the timetable ---------- */
function gate() {
  if (phase === 'error') return '<div class="ed gate"><h1 class="ed-h">Не получилось загрузить расписание</h1><p class="ed-lead">Проверьте интернет и попробуйте ещё раз.</p><div class="quick"><button type="button" class="btn primary" data-act="retry">Повторить</button></div></div>';
  if (phase === 'locked' || phase === 'badkey') {
    const bad = phase === 'badkey';
    return '<form class="ed gate" data-form="unlock" novalidate><h1 class="ed-h">' + (bad ? 'Эта ссылка больше не подходит' : 'Нужна личная ссылка') + '</h1>'
      + '<p class="ed-lead">' + (bad ? 'Попросите новую ссылку и вставьте её сюда целиком.' : 'Страница открывается только по ссылке, которую вам прислали. Вставьте её сюда целиком.') + '</p>'
      + '<label><span class="lbl">Ссылка</span><input type="text" id="f-link" autocomplete="off" autocapitalize="off" spellcheck="false"></label>'
      + (gateMsg ? '<p class="save-msg err" role="alert">' + esc(gateMsg) + '</p>' : '')
      + '<div class="quick"><button type="submit" class="btn primary">Открыть</button></div></form>';
  }
  return '<p class="quiet" role="status">Загружаю расписание…</p>';
}
function loginView() {
  const r = repoInfo();
  const form = 'https://github.com/settings/personal-access-tokens/new?name=' + encodeURIComponent('Расписание: редактор') + '&description=' + encodeURIComponent('Сохранение расписания с сайта') + (r ? '&target_name=' + encodeURIComponent(r.owner) : '') + '&expires_in=366&contents=write';
  return '<form class="ed gate" data-form="login" novalidate><h1 class="ed-h">Вход для редактора</h1>'
    + '<p class="ed-lead">Менять расписание может только владелец репозитория этого сайта на GitHub. Для этого нужен личный токен. Он сохранится только в этом браузере.</p>'
    + '<ol class="steps"><li>Откройте <a href="' + esc(form) + '" target="_blank" rel="noopener noreferrer">страницу создания токена на GitHub</a>. Название, срок на год и право Contents: Read and write там уже заполнены.</li>'
    + '<li>В Repository access выберите Only select repositories' + (r ? ' и отметьте <b>' + esc(r.owner + '/' + r.repo) + '</b>' : ' и отметьте репозиторий этого сайта') + '.</li>'
    + '<li>Нажмите Generate token, скопируйте токен и вставьте его сюда.</li></ol>'
    + '<label><span class="lbl">Токен GitHub</span><input type="password" id="f-token" autocomplete="off" autocapitalize="off" spellcheck="false"></label>'
    + (loginMsg ? '<p class="save-msg err" role="alert">' + esc(loginMsg) + '</p>' : '')
    + '<div class="quick"><button type="submit" class="btn primary"' + (loginBusy ? ' disabled' : '') + '>' + (loginBusy ? 'Проверяю…' : 'Войти') + '</button><button type="button" class="btn" data-act="login-back">Назад</button></div></form>';
}

/* ---------- render and events ---------- */
function render(keepScroll) {
  const y = window.scrollY;
  const keep = mode === 'login' ? D.getElementById('f-token') : null, kept = keep ? keep.value : '';
  const body = phase !== 'ready' ? gate() : mode === 'edit' ? editor() : mode === 'login' ? loginView() : viewBody();
  app.innerHTML = topBar() + '<main class="in">' + body + '</main>';
  if (kept) { const f = D.getElementById('f-token'); if (f) f.value = kept; }
  if (keepScroll) window.scrollTo(0, y);
}
function setView(v) {
  if (VIEWS.indexOf(v) < 0) return;
  if (contains(view, cursor, NOW.date)) cursor = NOW.date;
  view = v; ls.set('sched.tab', v);
}
app.addEventListener('click', (e) => {
  const el = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!el || !app.contains(el) || el.disabled) return;
  const act = el.dataset.act;
  if (act === 'retry') { start(candidates()); return; }
  if (phase !== 'ready') return;
  if (mode === 'login') { if (act === 'login-back' && !loginBusy) { mode = 'view'; loginMsg = ''; render(); window.scrollTo(0, 0); } return; }
  if (mode === 'view') {
    if (notice) notice = null;
    if (act !== 'mark' && act !== 'paint-save' && act !== 'brush' && act !== 'dab') markMsg = null;
    if (act === 'view') { setView(el.dataset.v); render(); }
    else if (act === 'prev' || act === 'next') { shift(act === 'next' ? 1 : -1); render(true); }
    else if (act === 'today') { cursor = NOW.date; render(true); }
    else if (act === 'open') { cursor = el.dataset.d; view = 'day'; render(); window.scrollTo(0, 0); }
    else if (act === 'edit') startEdit({ sec: el.dataset.sec });
    else if (act === 'paint') { paint = { brush: 'nn', changes: {}, merged: Object.assign({}, state.marks) }; view = 'month'; render(); window.scrollTo(0, 0); }
    else if (act === 'brush') { if (paint) { paint.brush = el.dataset.v || ''; render(true); } }
    else if (act === 'dab') { if (!saving) dab(el.dataset.d); }
    else if (act === 'paint-cancel') { paint = null; render(true); }
    else if (act === 'paint-save') { if (paint) { if (Object.keys(paint.changes).length) saveMarks(paint.changes, () => { paint = null; }); else { paint = null; render(true); } } }
    else if (act === 'mark') { const ch = {}; ch[el.dataset.d] = el.dataset.v || ''; saveMarks(ch); }
    else if (act === 'addplan') startEdit({ sec: 'plans', plan: el.dataset.d });
    else if (act === 'login') { mode = 'login'; loginMsg = ''; loginBusy = false; render(); window.scrollTo(0, 0); }
    else if (act === 'logout') { gh = null; ls.del('sched.gh'); notice = { kind: 'ok', text: 'Режим редактора выключен на этом устройстве.' }; render(); window.scrollTo(0, 0); }
    else if (act === 'dismiss') render(true);
    return;
  }
  if (act === 'edwd') { edWd = +el.dataset.wd || 1; rerender('lessons'); }
  else if (act === 'add') addRow(el.dataset.list);
  else if (act === 'del') delRow(el.dataset.list, +el.dataset.i);
  else if (act === 'clear-sample') { for (let w = 1; w <= 5; w++) draft.lessons[w] = []; draft.sample = false; markDirty(); const b = D.getElementById('ed-sample'); if (b) b.remove(); rerender('lessons'); }
  else if (act === 'clear-marks') { draft.marks = {}; markDirty(); rerender('stay'); }
  else if (act === 'save') save(false);
  else if (act === 'save-force') save(true);
  else if (act === 'cancel') { if (dirty) { askCancel = true; renderSaveBar(); } else exitEdit(); }
  else if (act === 'cancel-yes') { exitEdit(); refresh(); }
  else if (act === 'cancel-no') { askCancel = false; renderSaveBar(); }
  else if (act === 'copy') copyDraft();
});
app.addEventListener('submit', (e) => {
  const f = e.target;
  if (!f || !f.dataset || !f.dataset.form) return;
  e.preventDefault();
  if (f.dataset.form === 'unlock') {
    const box = D.getElementById('f-link'), k = findKey(box ? box.value : '');
    if (!k) { gateMsg = 'Это не похоже на вашу ссылку. Вставьте её целиком, вместе с частью после знака #.'; render(); return; }
    start([k]);
  } else if (f.dataset.form === 'login') {
    const box = D.getElementById('f-token');
    login(box ? box.value : '');
  }
});
function onField(e) {
  if (mode !== 'edit' || !draft) return;
  const el = e.target, k = el && el.dataset ? el.dataset.k : '';
  if (!k) return;
  if (el.type === 'checkbox' && el.dataset.day) {
    const day = +el.dataset.day; let a = getPath(draft, k);
    if (!Array.isArray(a)) { a = []; setPath(draft, k, a); }
    const ix = a.indexOf(day);
    if (el.checked && ix < 0) a.push(day);
    if (!el.checked && ix >= 0) a.splice(ix, 1);
    a.sort((x, y) => x - y);
  } else if (el.type === 'checkbox') setPath(draft, k, el.checked);
  else if (el.type === 'radio') { if (!el.checked) return; setPath(draft, k, el.value); }
  else setPath(draft, k, el.value);
  markDirty();
  if (e.type !== 'change') return;
  if (k === 'stay.mode') { if (draft.stay.mode === 'biweekly' && !isIso(draft.stay.anchor)) draft.stay.anchor = monday(NOW.date); rerender('stay'); }
  else if (k === 'stay.anchor') { if (isIso(draft.stay.anchor)) draft.stay.anchor = monday(draft.stay.anchor); rerender('stay'); }
  else if (k.indexOf('bells.') === 0) { rerender('lessons'); const sub = D.getElementById('sub-bells'); if (sub) sub.textContent = secOf('bells')[2](); }
}
app.addEventListener('input', onField);
app.addEventListener('change', onField);
app.addEventListener('toggle', (e) => { const d = e.target; if (d && d.matches && d.matches('details.sec')) openSecs[d.dataset.sec] = d.open; }, true);
D.addEventListener('keydown', (e) => {
  if (phase !== 'ready' || mode !== 'view' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const t = e.target;
  if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
  if (e.key === 'ArrowLeft') { shift(-1); render(true); }
  else if (e.key === 'ArrowRight') { shift(1); render(true); }
});
function tick() {
  const n = rigaNow(), newDay = n.date !== NOW.date, wasToday = cursor === NOW.date;
  NOW = n;
  if (phase !== 'ready' || mode !== 'view') return;
  if (newDay) { if (wasToday) cursor = n.date; render(true); return; }
  if (view === 'day' && cursor === n.date) {
    const info = nowInfo(lessonsOn(cursor).concat(clubsOn(cursor), plansOn(cursor)));
    if ((info ? info.text : '') !== lastNow) render(true);
  }
}

/* ---------- start ---------- */
(async function boot() {
  const t = ls.get('sched.tab');
  if (VIEWS.indexOf(t) >= 0) view = t;
  render();
  if (!window.crypto || !crypto.subtle || !window.fetch) { phase = 'error'; render(); return; }
  gh = readGh();
  await start(candidates());
  setInterval(tick, 30000);
  setInterval(refresh, 5 * 60000);
  D.addEventListener('visibilitychange', () => { if (!D.hidden) { tick(); refresh(); } });
  window.addEventListener('online', refresh);
  window.addEventListener('hashchange', () => { const k = findKey(location.hash); if (k && k !== keyText && mode === 'view') start([k]); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    try { navigator.serviceWorker.register('sw.js').catch(() => { /* the page works without it */ }); } catch (e) { /* the page works without it */ }
  }
})();
})();

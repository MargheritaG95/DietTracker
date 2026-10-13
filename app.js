import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

/* ================= Configurazione ================= */
const DEMO = new URLSearchParams(location.search).has('demo');
const CONFIGURED = !String(SUPABASE_URL).startsWith('INSERISCI') && !String(SUPABASE_ANON_KEY).startsWith('INSERISCI');
let sb = null;
if (CONFIGURED && !DEMO) {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) { console.error(e); }
}
const AI = !!sb;

/* ================= Costanti ================= */
const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const GIORNI_L = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const today_ = k => key(new Date()) === k;
const fmtN = v => String(v).replace('.', ',');

/* ================= Stato ================= */
let user = null;
let PLAN = null;
let S = { days: {}, shop: {}, weights: {}, custom: [] };
let view = 'loading';      // loading | auth | setup | edit | app
let tab = 'oggi';
let viewDate = new Date(); viewDate.setHours(12, 0, 0, 0);
let rMode = 'w', rOff = 0;
let status = '';
let authMode = 'login', authMsg = null;
let setupMsg = null, parsing = false;
let ED = null, edDay = 1, edFrom = null;

/* ================= Piano ================= */
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const slug = s => str(s, 40).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 12);
function normPlan(p) {
  p = p && typeof p === 'object' ? p : {};
  const out = { meals: [], week: {}, supplements: [], water_l: 0, steps: 0, weigh_days: [], target: null, exclusions: [], rules: [], notes: '' };
  const used = new Set(['mov']);
  (Array.isArray(p.meals) ? p.meals : []).slice(0, 12).forEach((m, i) => {
    const n = str(m && m.n, 40); if (!n) return;
    let k = slug(m.k) || slug(n) || 'm' + i; while (used.has(k)) k += i; used.add(k);
    const h = /^\d{1,2}:\d{2}$/.test(str(m.h)) ? str(m.h).padStart(5, '0') : '';
    out.meals.push({ k, n, h, note: str(m.note, 120), _src: m.k });
  });
  const keyMap = {}; out.meals.forEach(m => { keyMap[m._src] = m.k; keyMap[m.k] = m.k; delete m._src; });
  const W = p.week && typeof p.week === 'object' ? p.week : {};
  for (let d = 0; d < 7; d++) {
    const src = W[d] || W[String(d)] || {};
    const meals = {};
    const sm = src.meals && typeof src.meals === 'object' ? src.meals : {};
    Object.entries(sm).forEach(([mk, items]) => {
      const k = keyMap[mk]; if (!k) return;
      meals[k] = (Array.isArray(items) ? items : String(items || '').split('\n')).map(t => str(t, 120)).filter(Boolean).slice(0, 20);
    });
    const sp = src.sport && str(src.sport.n, 40) ? { n: str(src.sport.n, 40), min: Math.max(0, Math.round(Number(src.sport.min) || 0)) } : null;
    out.week[d] = { meals, sport: sp };
  }
  out.supplements = (Array.isArray(p.supplements) ? p.supplements : []).map(s => ({ n: str(s && s.n, 60), dose: str(s && s.dose, 60), meal: keyMap[s && s.meal] || (out.meals[0] && out.meals[0].k) || '' })).filter(s => s.n).slice(0, 15);
  out.water_l = Math.max(0, Math.min(5, Number(p.water_l) || 0));
  out.steps = Math.max(0, Math.min(40000, Math.round(Number(p.steps) || 0)));
  out.weigh_days = [...new Set((Array.isArray(p.weigh_days) ? p.weigh_days : []).map(Number).filter(d => d >= 0 && d <= 6))];
  const tmin = Number(p.target && p.target.min), tmax = Number(p.target && p.target.max);
  out.target = tmin > 20 && tmax >= tmin ? { min: tmin, max: tmax } : (tmin > 20 ? { min: tmin, max: tmin } : null);
  out.exclusions = (Array.isArray(p.exclusions) ? p.exclusions : String(p.exclusions || '').split(',')).map(x => str(x, 40)).filter(Boolean).slice(0, 20);
  out.rules = (Array.isArray(p.rules) ? p.rules : []).map(r => ({ t: str(r && r.t, 40), v: str(r && r.v, 80), no: !!(r && r.no) })).filter(r => r.t).slice(0, 20);
  out.notes = str(p.notes, 600);
  return out;
}
function emptyPlan() {
  return normPlan({
    meals: [{ k: 'col', n: 'Colazione', h: '08:00' }, { k: 'spu1', n: 'Spuntino', h: '10:30' }, { k: 'pra', n: 'Pranzo', h: '13:00' }, { k: 'spu2', n: 'Merenda', h: '17:00' }, { k: 'cen', n: 'Cena', h: '20:00' }],
    week: {}, water_l: 2, steps: 0, weigh_days: [1],
  });
}
function planFor(d) {
  const W = (PLAN.week && PLAN.week[d]) || { meals: {}, sport: null };
  const meals = PLAN.meals.map(m => ({
    k: m.k, n: m.n, h: m.h, note: m.note,
    items: [...(W.meals[m.k] || []).map(t => ({ t })), ...PLAN.supplements.filter(s => s.meal === m.k).map(s => ({ t: s.n + (s.dose ? ' — ' + s.dose : ''), sup: 1 }))],
  })).filter(m => m.items.length);
  const mov = [];
  if (W.sport) mov.push({ t: W.sport.n + (W.sport.min ? ` ${W.sport.min} min` : ''), act: 1, min: W.sport.min || 0, sn: W.sport.n });
  if (PLAN.steps) mov.push({ t: `${PLAN.steps.toLocaleString('it-IT')} passi`, act: 1, step: 1 });
  if (mov.length) meals.push({ k: 'mov', n: 'Movimento', h: '', note: 'Basta una cosa: i passi, lo sport del piano o un altro sport. Solo zero movimento conta come sgarro.', items: mov });
  meals.forEach(m => m.items.forEach((it, i) => { it.id = m.k + i; it.mk = m.k; }));
  return meals;
}
function pool(mk, cur) {
  const keys = [mk];
  const set = new Set();
  for (let d = 0; d < 7; d++) planFor(d).forEach(m => { if (keys.includes(m.k)) m.items.forEach(it => { if (!it.sup && !it.act && it.t !== cur && !/acqua|olio/i.test(it.t)) set.add(it.t); }); });
  return [...set];
}
const glassesGoal = () => Math.max(0, Math.round((PLAN.water_l || 0) * 4));

/* ================= Salvataggio ================= */
const LS_DEMO = 'diettracker-demo';
const timers = {};
function queue(id, fn) { clearTimeout(timers[id]); timers[id] = setTimeout(fn, 600); }
function demoSave() { try { localStorage.setItem(LS_DEMO, JSON.stringify({ PLAN, S })); } catch (e) { } }
function saveDay(k) {
  if (!sb) return demoSave();
  queue('d' + k, async () => {
    const { error } = await sb.from('days').upsert({ user_id: user.id, day: k, data: S.days[k], updated_at: new Date().toISOString() });
    if (error) flash('Non sono riuscito a salvare. Controlla la connessione.');
  });
}
function saveMisc() {
  if (!sb) return demoSave();
  queue('misc', async () => {
    const { error } = await sb.from('misc').upsert({ user_id: user.id, data: { shop: S.shop, weights: S.weights, custom: S.custom }, updated_at: new Date().toISOString() });
    if (error) flash('Non sono riuscito a salvare. Controlla la connessione.');
  });
}
async function savePlan() {
  if (!sb) return demoSave();
  const { error } = await sb.from('plans').upsert({ user_id: user.id, plan: PLAN, updated_at: new Date().toISOString() });
  if (error) throw error;
}
async function loadAll() {
  if (!sb) {
    try { const r = JSON.parse(localStorage.getItem(LS_DEMO) || 'null'); if (r) { PLAN = r.PLAN ? normPlan(r.PLAN) : null; S = Object.assign(S, r.S || {}); } } catch (e) { }
    return;
  }
  const [pl, mi] = await Promise.all([
    sb.from('plans').select('plan').eq('user_id', user.id).maybeSingle(),
    sb.from('misc').select('data').eq('user_id', user.id).maybeSingle(),
  ]);
  PLAN = pl.data ? normPlan(pl.data.plan) : null;
  const m = (mi.data && mi.data.data) || {};
  S = { days: {}, shop: m.shop || {}, weights: m.weights || {}, custom: m.custom || [] };
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('days').select('day,data').eq('user_id', user.id).range(from, from + 999);
    if (error) throw error;
    (data || []).forEach(r => { S.days[r.day] = r.data || {}; });
    if (!data || data.length < 1000) break;
  }
}
function flash(m) { status = m; const el = $('#status'); if (el) el.textContent = m; }
const day = k => { const D = S.days[k] || (S.days[k] = { it: {}, w: 0, ex: [] }); D.it = D.it || {}; D.ex = D.ex || []; D.sp = D.sp || []; return D; };

/* ================= Claude (server) ================= */
async function callAI(body) {
  if (!sb) throw new Error('Non disponibile in modalità prova');
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Sessione scaduta: esci e rientra.');
  let r;
  try {
    r = await fetch(SUPABASE_URL + '/functions/v1/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
  } catch (e) { throw new Error('Connessione non riuscita: controlla internet e riprova.'); }
  let j = null; try { j = await r.json(); } catch (e) { }
  if (!r.ok) {
    const msg = (j && (j.message || j.msg || j.error)) || (r.status === 404 ? 'Funzione "claude" non trovata su Supabase.' : 'Servizio non disponibile.');
    throw new Error(`${msg} (errore ${r.status})`);
  }
  return j;
}

/* ================= Punteggio ================= */
function score(k, d) {
  const D = S.days[k]; const plan = planFor(d);
  let n = 0, ok = 0, sw = 0, va = 0, vaPts = 0, sk = 0, ms = 0, mlW = 0, mlPts = 0; const mlSeen = {};
  const extraSport = !!(D && D.sp && D.sp.length);
  let movDone = extraSport, movSkip = false, hasMov = false;
  plan.forEach(m => m.items.forEach(it => {
    const s = D && D.it && D.it[it.id];
    if (it.act) { hasMov = true; if (s && s.s === 'ok') movDone = true; if (s && s.s === 'skip') movSkip = true; return; }
    const ML = D && D.ml && D.ml[it.mk];
    if (ML && !it.sup) { n++; mlW++; mlPts += ML.ev ? ML.ev.p / 100 : 0.5; mlSeen[it.mk] = 1; return; }
    n++; if (s) { if (s.s === 'ok') ok++; else if (s.s === 'swap') sw++; else if (s.s === 'var') { va++; vaPts += s.ev ? s.ev.p / 100 : 0.5; } else sk++; }
  }));
  if (hasMov || extraSport) { n++; if (movDone) ok++; else if (movSkip) ms++; }
  const G = glassesGoal(); const w = D ? D.w || 0 : 0;
  if (G) { n++; if (w >= G) ok++; }
  const exL = D && D.ex ? D.ex : [];
  const ex = exL.length;
  const exPts = exL.reduce((a, x) => a + ((D.exEv && D.exEv[x]) ? D.exEv[x].p / 100 : 0), 0);
  const mlN = Object.keys(mlSeen).length;
  const marked = ok + sw + va + sk + ms + mlW;
  const den = Math.max(1, ok + sw + va + ms + ex + mlW);
  const pct = Math.round(Math.max(0, (ok + sw + vaPts + exPts + mlPts) / den) * 100);
  va += mlN;
  return { pct, ok, sw, va, sk, ms, n, ex, marked, mlN, any: marked > 0 || ex > 0 || extraSport };
}
const ST = [[100, '--s100', 'Obiettivo'], [85, '--s85', 'Molto vicino'], [70, '--s70', 'Buono'], [50, '--s50', 'A metà'], [0, '--s0', 'Lontano']];
const stat = p => ST.find(x => p >= x[0]);
const tcol = c => c === '--s70' ? '--s70t' : c;
const BGL = { ok: ['--s100', 'Normale', '🙂'], poco: ['--s70', 'Poco / a fatica', '😣'], diss: ['--s50', 'Dissenteria', '💧'] };
const bgQ = v => v.q || 'ok';
function bgEval(D) {
  const L = D.bg || []; const n = L.length;
  if (!n) return D.bgNone ? ['--s0', 'Nulla oggi.'] : ['--muted', 'Non hai ancora segnato niente.'];
  const c = { ok: 0, poco: 0, diss: 0 }; L.forEach(v => c[bgQ(v)]++);
  const parts = Object.keys(c).filter(q => c[q]).map(q => `${c[q]} ${BGL[q][1].toLowerCase()}`).join(', ');
  if (c.diss) return ['--s50', `Dissenteria (${parts}).`];
  if (c.poco) return ['--s70', c.ok ? `Un po' a fatica (${parts}).` : 'Poco / a fatica.'];
  return ['--s100', n === 1 ? 'Normale.' : `${n} volte, tutte normali.`];
}
function verdict(p, any) {
  if (!any) return 'Ancora niente segnato. Parti dal primo pasto.';
  if (p >= 90) return 'Giornata da manuale.';
  if (p >= 75) return 'Quasi tutto come da piano.';
  if (p >= 50) return 'A metà strada: qualche variazione.';
  return 'Oggi il piano è rimasto un po’ indietro.';
}

/* ================= Valutazione variazioni ================= */
const evBusy = {}, evErr = {};
const MANV = [[100, 'Uguale'], [75, 'Simile'], [50, 'Così così'], [25, 'Lontano'], [0, 'Per niente']];
function evHtml(ref, ev, has) {
  if (!has) return '';
  const chips = `<div class="mchips" role="group" aria-label="Quanto è vicino alla dieta">${MANV.map(([p, l]) => { const on = ev && ev.man && ev.p === p; return `<button data-man="${ref}" data-p="${p}" class="${on ? 'on' : ''}" style="${on ? `background:var(${stat(p)[1]});border-color:var(${stat(p)[1]})` : ''}">${l}</button>`; }).join('')}</div>`;
  let top = '';
  if (evBusy[ref]) top = `<div class="evrow"><span class="spin"></span>Sto valutando quanto è lontano dalla dieta…</div>`;
  else if (ev) { const st = stat(ev.p); top = `<div class="ev"><b style="background:var(${st[1]})">${ev.p}% vicino</b><span>${ev.man ? 'Valutato da te.' : esc(ev.nota || '')}</span>${AI ? `<button class="evb" data-eval="${ref}" style="border:none;background:none;color:var(--muted);font-size:12px;text-decoration:underline;padding:0">${ev.man ? 'chiedi a Claude' : 'rivaluta'}</button>` : ''}</div>`; }
  else top = `<div class="evrow">${evErr[ref] ? esc(evErr[ref]) + ' ' : 'Quanto è vicino alla dieta? Scegli tu' + (AI ? ' o chiedi a Claude.' : '. Senza valutazione conta come mezzo sgarro.')}${AI ? `<button class="evb" data-eval="${ref}">Chiedi a Claude</button>` : ''}</div>`;
  return top + chips;
}
function setManual(ref, p) {
  const [k, kind, id] = ref.split('|'); const D = day(k); const ev = { p, nota: '', man: true };
  if (kind === 'it') { if (!D.it[id]) return; const cur = D.it[id].ev; if (cur && cur.man && cur.p === p) delete D.it[id].ev; else D.it[id].ev = ev; }
  else if (kind === 'ml') { const ML = D.ml && D.ml[id]; if (!ML) return; if (ML.ev && ML.ev.man && ML.ev.p === p) delete ML.ev; else ML.ev = ev; }
  else { const e = D.ex[+id]; if (e == null) return; D.exEv = D.exEv || {}; const cur = D.exEv[e]; if (cur && cur.man && cur.p === p) delete D.exEv[e]; else D.exEv[e] = ev; }
  saveDay(k); render();
}
function dietCtx() { return { exclusions: PLAN.exclusions, rules: PLAN.rules, target: PLAN.target ? `${fmtN(PLAN.target.min)}–${fmtN(PLAN.target.max)} kg` : '' }; }
async function valuta(ref) {
  if (!AI || evBusy[ref]) return;
  const [k, kind, id] = ref.split('|'); const D = day(k); const d = new Date(k + 'T12:00').getDay();
  let body;
  if (kind === 'it') {
    const s = D.it[id]; if (!s || !s.n) return; let meal, item;
    planFor(d).forEach(m => m.items.forEach(it => { if (it.id === id) { meal = m; item = it; } })); if (!item) return;
    body = { mode: 'eval', kind: 'item', meal: meal.n, day: GIORNI_L[d], prescribed: meal.items.filter(i => !i.sup && !i.act).map(i => i.t), item: item.t, eaten: s.n, ctx: dietCtx() };
  } else if (kind === 'ml') {
    const ML = D.ml && D.ml[id]; if (!ML || !ML.n) return; const meal = planFor(d).find(m => m.k === id); if (!meal) return;
    body = { mode: 'eval', kind: 'meal', meal: meal.n, day: GIORNI_L[d], prescribed: meal.items.filter(i => !i.sup && !i.act).map(i => i.t), eaten: ML.n, ctx: dietCtx() };
  } else {
    const e = D.ex[+id]; if (!e) return;
    body = { mode: 'eval', kind: 'extra', day: GIORNI_L[d], eaten: e, ctx: dietCtx() };
  }
  evBusy[ref] = true; delete evErr[ref]; render();
  try {
    const r = await callAI(body);
    const ev = { p: Number(r.p), nota: String(r.nota || '') };
    if (kind === 'it') { if (D.it[id]) D.it[id].ev = ev; } else if (kind === 'ml') { if (D.ml && D.ml[id]) D.ml[id].ev = ev; } else { D.exEv = D.exEv || {}; D.exEv[D.ex[+id]] = ev; }
    saveDay(k);
  } catch (e) { evErr[ref] = e.message || 'Valutazione non riuscita.'; }
  finally { delete evBusy[ref]; render(); }
}

/* ================= Schermata: accesso ================= */
function renderAuth() {
  const brand = `<div class="brand"><div class="logo">✓</div><b>DietTracker</b></div><p class="sub">Segui la dieta del tuo nutrizionista giorno per giorno: pasti, sgarri, peso, sport e lista della spesa.</p>`;
  const msg = authMsg ? `<div class="msg ${authMsg[0]}">${esc(authMsg[1])}</div>` : '';
  if (authMode === 'signup') return brand + `<form class="card form" data-form="signup"><h2>Crea un account</h2>
    <label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required>
    <label for="pw">Password (almeno 8 caratteri)</label><input id="pw" name="password" type="password" minlength="8" autocomplete="new-password" required>
    <label class="consent"><input type="checkbox" name="consent" required><span>Ho letto l’<a href="privacy.html" target="_blank">informativa privacy</a> e acconsento al trattamento dei miei dati sulla salute (dieta, peso, abitudini) per il funzionamento dell’app.</span></label>
    <button class="btn" type="submit">Crea account</button>${msg}
    <p class="sub" style="margin-top:12px">Hai già un account? <button type="button" class="linkbtn" data-auth="login">Accedi</button></p></form>
    <p class="disc">DietTracker ti aiuta a seguire il piano del tuo nutrizionista. Non è un dispositivo medico e non sostituisce il parere di un professionista.</p>`;
  if (authMode === 'reset') return brand + `<form class="card form" data-form="reset"><h2>Recupera la password</h2>
    <label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required>
    <button class="btn" type="submit">Mandami il link</button>${msg}
    <p class="sub" style="margin-top:12px"><button type="button" class="linkbtn" data-auth="login">Torna all’accesso</button></p></form>`;
  if (authMode === 'newpass') return brand + `<form class="card form" data-form="newpass"><h2>Scegli una nuova password</h2>
    <label for="pw">Nuova password (almeno 8 caratteri)</label><input id="pw" name="password" type="password" minlength="8" autocomplete="new-password" required>
    <button class="btn" type="submit">Salva password</button>${msg}</form>`;
  return brand + `<form class="card form" data-form="login"><h2>Accedi</h2>
    <label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required>
    <label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required>
    <button class="btn" type="submit">Accedi</button>${msg}
    <p class="sub" style="margin-top:12px">Non hai un account? <button type="button" class="linkbtn" data-auth="signup">Registrati</button><br><button type="button" class="linkbtn" data-auth="reset">Password dimenticata?</button></p></form>`;
}
async function onAuthSubmit(form) {
  const f = new FormData(form); const email = String(f.get('email') || '').trim(); const password = String(f.get('password') || '');
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  const redirect = location.origin + location.pathname;
  try {
    if (form.dataset.form === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message.includes('Invalid') ? 'Email o password non corretti.' : error.message.includes('confirm') ? 'Conferma prima la tua email: controlla la posta.' : error.message);
    } else if (form.dataset.form === 'signup') {
      if (!f.get('consent')) throw new Error('Serve il consenso per usare l’app.');
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect, data: { consent_at: new Date().toISOString(), consent_version: '1' } } });
      if (error) throw new Error(error.message);
      if (!data.session) { authMode = 'login'; authMsg = ['ok', 'Ti abbiamo mandato un’email: apri il link per confermare l’account, poi accedi.']; render(); return; }
    } else if (form.dataset.form === 'reset') {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      if (error) throw new Error(error.message);
      authMsg = ['ok', 'Se l’email è registrata, riceverai un link per scegliere una nuova password.']; render(); return;
    } else if (form.dataset.form === 'newpass') {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      authMsg = null; authMode = 'login'; user = (await sb.auth.getUser()).data.user; await boot(); return;
    }
  } catch (e) { authMsg = ['err', e.message]; render(); }
  finally { btn.disabled = false; }
}

/* ================= Schermata: prima configurazione ================= */
function renderSetup() {
  return `<div class="brand"><div class="logo">✓</div><b>DietTracker</b></div>
  <h1>Carichiamo la tua dieta</h1>
  <p class="sub">Fai una foto (o più) del piano del tuo nutrizionista, oppure carica il PDF. ${AI ? 'Claude la legge e la trasforma nella tua agenda: poi controlli e correggi.' : ''}</p>
  ${AI ? `<div class="card"><h2>📄 Carica foto o PDF</h2>
    <div class="drop"><p class="sub">Puoi scegliere più foto, una per pagina.</p>
    <label class="btn" for="dietFile">Scegli file</label><input id="dietFile" type="file" accept="image/*,application/pdf" multiple></div>
    ${parsing ? `<p class="sub" style="margin-top:10px"><span class="spin"></span>Claude sta leggendo la tua dieta… può volerci fino a un minuto.</p>` : ''}
    ${setupMsg ? `<div class="msg ${setupMsg[0]}">${esc(setupMsg[1])}</div>` : ''}
    <p class="disc">La foto viene inviata a Claude (Anthropic) solo per la trascrizione e non viene conservata dall’app. Copri nome e dati personali se preferisci.</p></div>` : ''}
  <div class="card"><h2>✍️ Inseriscila a mano</h2><p class="sub">Parti da uno schema vuoto con colazione, spuntini, pranzo e cena.</p>
    <button class="btn full" data-act="manual">Compila a mano</button></div>
  ${PLAN ? `<button class="btn ghost" style="width:100%;margin-top:14px" data-act="cancelSetup">Annulla, tieni il piano attuale</button>` : ''}
  <p style="margin-top:18px;text-align:center"><button class="linkbtn" data-act="logout">Esci</button></p>`;
}
async function fileToPart(file) {
  if (file.type === 'application/pdf') {
    if (file.size > 9e6) throw new Error('Il PDF è troppo grande (massimo 9 MB).');
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
    return { type: 'pdf', media_type: 'application/pdf', data: b64 };
  }
  const img = await createImageBitmap(file);
  const sc = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1];
  return { type: 'image', media_type: 'image/jpeg', data: b64 };
}
async function onDietFiles(files) {
  if (!files.length) return;
  parsing = true; setupMsg = null; render();
  try {
    const parts = []; for (const f of [...files].slice(0, 6)) parts.push(await fileToPart(f));
    const r = await callAI({ mode: 'parse', files: parts });
    const plan = normPlan(r.plan);
    if (!plan.meals.length) throw new Error('Non sono riuscito a trovare i pasti. Prova con una foto più nitida o compila a mano.');
    ED = plan; edFrom = 'parse'; edDay = 1; view = 'edit';
  } catch (e) { setupMsg = ['err', e.message || 'Lettura non riuscita.']; }
  finally { parsing = false; render(); window.scrollTo(0, 0); }
}

/* ================= Schermata: modifica piano ================= */
function renderEditor() {
  const P = ED;
  const W = P.week[edDay] || (P.week[edDay] = { meals: {}, sport: null });
  const dayChips = WEEK_ORDER.map(d => `<button data-edact="day" data-v="${d}" class="${d === edDay ? 'on' : ''}">${GIORNI[d]}</button>`).join('');
  const mealOpts = sel => P.meals.map(m => `<option value="${m.k}" ${m.k === sel ? 'selected' : ''}>${esc(m.n)}</option>`).join('');
  return `<div class="ed">
  <h1>${edFrom === 'parse' ? 'Controlla la tua dieta' : 'Il tuo piano'}</h1>
  <p class="sub">${edFrom === 'parse' ? 'Claude l’ha trascritta così. Controlla giorno per giorno e correggi quello che non torna, poi salva.' : 'Modifica pasti, alimenti, integratori e obiettivi.'}</p>

  <div class="card"><h3>Pasti della giornata</h3>
    ${P.meals.map((m, i) => `<div class="row2"><input data-ed="meals.${i}.n" value="${esc(m.n)}" aria-label="Nome pasto"><input type="time" data-ed="meals.${i}.h" value="${esc(m.h)}" aria-label="Orario"><span style="display:flex;gap:4px"><button class="mini" data-edact="up" data-v="${i}" aria-label="Sposta su">↑</button><button class="mini" data-edact="delMeal" data-v="${i}" aria-label="Elimina pasto">✕</button></span></div>`).join('')}
    <button class="add" data-edact="addMeal">+ Aggiungi pasto</button></div>

  <div class="card"><h3>Cosa mangiare, giorno per giorno</h3>
    <div class="chipsel">${dayChips}</div>
    <p class="sub" style="margin-top:8px">${GIORNI_L[edDay]}: un alimento per riga, con la quantità.</p>
    ${P.meals.map(m => `<div class="mealta"><label for="ta-${m.k}">${esc(m.n)} <small>${esc(m.h)}</small></label><textarea id="ta-${m.k}" data-lines="week.${edDay}.meals.${m.k}" placeholder="Es. Yogurt bianco 125 g">${esc((W.meals[m.k] || []).join('\n'))}</textarea></div>`).join('')}
    <div class="grid2"><div><label class="lbl2">Sport del giorno</label><input data-sport="n" value="${esc(W.sport ? W.sport.n : '')}" placeholder="Nessuno"></div><div><label class="lbl2">Minuti</label><input type="number" inputmode="numeric" data-sport="min" value="${W.sport ? W.sport.min : ''}"></div></div>
    <button class="add" data-edact="copyDay">Copia ${GIORNI_L[edDay].toLowerCase()} su tutti gli altri giorni</button></div>

  <div class="card"><h3>Integratori</h3>
    ${P.supplements.map((s, i) => `<div class="row3"><input data-ed="supplements.${i}.n" value="${esc(s.n)}" placeholder="Nome"><input data-ed="supplements.${i}.dose" value="${esc(s.dose)}" placeholder="Dose"><select data-ed="supplements.${i}.meal">${mealOpts(s.meal)}</select><button class="mini" data-edact="delSup" data-v="${i}" aria-label="Elimina">✕</button></div>`).join('') || '<p class="sub">Nessun integratore.</p>'}
    <button class="add" data-edact="addSup">+ Aggiungi integratore</button></div>

  <div class="card"><h3>Obiettivi</h3>
    <div class="grid2">
      <div><label class="lbl2">Acqua al giorno (litri)</label><input type="number" step="0.5" inputmode="decimal" data-num="water_l" value="${P.water_l || ''}"></div>
      <div><label class="lbl2">Passi al giorno</label><input type="number" step="500" inputmode="numeric" data-num="steps" value="${P.steps || ''}" placeholder="Nessuno"></div>
      <div><label class="lbl2">Peso obiettivo da (kg)</label><input type="number" step="0.5" inputmode="decimal" data-num="target.min" value="${P.target ? P.target.min : ''}"></div>
      <div><label class="lbl2">a (kg)</label><input type="number" step="0.5" inputmode="decimal" data-num="target.max" value="${P.target ? P.target.max : ''}"></div>
    </div>
    <label class="lbl2">Giorni in cui pesarsi</label>
    <div class="chipsel">${WEEK_ORDER.map(d => `<button data-edact="weigh" data-v="${d}" class="${P.weigh_days.includes(d) ? 'on' : ''}">${GIORNI[d]}</button>`).join('')}</div></div>

  <div class="card"><h3>Esclusioni e regole</h3>
    <label class="lbl2">Alimenti da escludere o intolleranze (separati da virgola)</label>
    <input data-excl value="${esc(P.exclusions.join(', '))}" placeholder="Es. glutine, lattosio">
    <label class="lbl2" style="margin-top:12px">Regole generali</label>
    ${P.rules.map((r, i) => `<div class="rrow"><input data-ed="rules.${i}.t" value="${esc(r.t)}" placeholder="Es. Dolci"><input data-ed="rules.${i}.v" value="${esc(r.v)}" placeholder="Es. Solo la domenica"><label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" data-chk="rules.${i}.no" ${r.no ? 'checked' : ''}>evita</label><button class="mini" data-edact="delRule" data-v="${i}" aria-label="Elimina">✕</button></div>`).join('')}
    <button class="add" data-edact="addRule">+ Aggiungi regola</button></div>

  <div class="sticky"><button class="btn ghost" data-edact="cancel">Annulla</button><button class="btn" data-edact="save">Salva piano</button></div>
  <div id="status" class="sync">${esc(status)}</div></div>`;
}
function setPath(obj, path, val) {
  const ps = path.split('.'); let o = obj;
  for (let i = 0; i < ps.length - 1; i++) { if (o[ps[i]] == null) o[ps[i]] = {}; o = o[ps[i]]; }
  o[ps[ps.length - 1]] = val;
}
function onEditorInput(t) {
  if (t.dataset.ed) setPath(ED, t.dataset.ed, t.value);
  else if (t.dataset.lines) setPath(ED, t.dataset.lines, t.value.split('\n').map(s => s.trim()).filter(Boolean));
  else if (t.dataset.num) {
    const v = t.value === '' ? null : Number(t.value);
    if (t.dataset.num.startsWith('target.')) { ED.target = ED.target || { min: null, max: null }; ED.target[t.dataset.num.split('.')[1]] = v; }
    else ED[t.dataset.num] = v || 0;
  }
  else if (t.dataset.chk) setPath(ED, t.dataset.chk, t.checked);
  else if (t.hasAttribute('data-excl')) ED.exclusions = t.value.split(',').map(s => s.trim()).filter(Boolean);
  else if (t.dataset.sport) {
    const W = ED.week[edDay];
    if (t.dataset.sport === 'n') { if (t.value.trim()) W.sport = { n: t.value, min: W.sport ? W.sport.min : 0 }; else W.sport = null; }
    else if (W.sport) W.sport.min = Number(t.value) || 0;
  }
}
async function onEditorAct(act, v) {
  const P = ED;
  if (act === 'day') { edDay = +v; render(); return; }
  if (act === 'addMeal') { P.meals.push({ k: 'm' + Date.now().toString(36).slice(-5), n: 'Nuovo pasto', h: '', note: '' }); }
  if (act === 'delMeal') { const m = P.meals[+v]; if (!confirm(`Eliminare “${m.n}” da tutti i giorni?`)) return; P.meals.splice(+v, 1); for (const d in P.week) delete P.week[d].meals[m.k]; P.supplements.forEach(s => { if (s.meal === m.k) s.meal = P.meals[0] ? P.meals[0].k : ''; }); }
  if (act === 'up') { const i = +v; if (i > 0) [P.meals[i - 1], P.meals[i]] = [P.meals[i], P.meals[i - 1]]; }
  if (act === 'addSup') P.supplements.push({ n: '', dose: '', meal: P.meals[0] ? P.meals[0].k : '' });
  if (act === 'delSup') P.supplements.splice(+v, 1);
  if (act === 'addRule') P.rules.push({ t: '', v: '', no: false });
  if (act === 'delRule') P.rules.splice(+v, 1);
  if (act === 'weigh') { const d = +v; P.weigh_days = P.weigh_days.includes(d) ? P.weigh_days.filter(x => x !== d) : [...P.weigh_days, d]; }
  if (act === 'copyDay') { if (!confirm(`Copiare ${GIORNI_L[edDay].toLowerCase()} su tutti gli altri giorni? I loro alimenti verranno sostituiti.`)) return; const src = JSON.stringify(P.week[edDay]); for (let d = 0; d < 7; d++) if (d !== edDay) P.week[d] = JSON.parse(src); flash('Copiato su tutti i giorni.'); }
  if (act === 'cancel') { ED = null; view = PLAN ? 'app' : 'setup'; render(); window.scrollTo(0, 0); return; }
  if (act === 'save') {
    const np = normPlan(ED);
    if (!np.meals.length) { flash('Aggiungi almeno un pasto.'); return; }
    const prev = PLAN; PLAN = np;
    try { await savePlan(); ED = null; view = 'app'; tab = 'oggi'; status = 'Piano salvato'; render(); window.scrollTo(0, 0); }
    catch (e) { PLAN = prev; flash('Non sono riuscito a salvare il piano. Riprova.'); }
    return;
  }
  render();
}

/* ================= Tab: Oggi ================= */
function renderOggi() {
  const k = key(viewDate), d = viewDate.getDay(), D = day(k), sc = score(k, d);
  const today = today_(k);
  const nowH = new Date().getHours() * 60 + new Date().getMinutes();
  const plan = planFor(d);
  let nextK = null;
  if (today) { for (const m of plan) { if (!m.h) continue; const [h, mi] = m.h.split(':').map(Number); const done = (D.ml && D.ml[m.k]) || m.items.every(it => D.it[it.id]); if (!done && h * 60 + mi + 90 >= nowH) { nextK = m.k; break; } } }
  const mon = new Date(viewDate); mon.setDate(mon.getDate() - ((d + 6) % 7));
  const nowD = new Date(); nowD.setHours(12, 0, 0, 0);
  let strip = '';
  for (let i = 0; i < 7; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); strip += `<button data-day="${key(x)}" class="${key(x) === k ? 'on' : ''} ${x > nowD ? 'future' : ''}">${GIORNI[x.getDay()]}<small>${x.getDate()}</small></button>`; }
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const thisMon = new Date(nowD); thisMon.setDate(nowD.getDate() - ((nowD.getDay() + 6) % 7));
  const wDiff = Math.round((thisMon - mon) / (7 * 864e5));
  const wLbl = wDiff === 0 ? 'Questa settimana' : wDiff === 1 ? 'Settimana scorsa' : wDiff > 1 ? wDiff + ' settimane fa' : 'Prossima settimana';
  const C = 2 * Math.PI * 52;
  const seg = (v, c, off) => `<circle class="arc" cx="60" cy="60" r="52" fill="none" stroke="${c}" stroke-width="12" stroke-dasharray="${v * C} ${C}" stroke-dashoffset="${-off * C}"/>`;
  const fOk = (sc.ok + sc.sw) / sc.n, fVa = (sc.va + sc.ms) / sc.n, fSk = sc.sk / sc.n;
  const weigh = PLAN.weigh_days.includes(d);
  let h = `
  <div class="sub">${today ? 'Oggi' : 'Stai modificando un altro giorno'}</div>
  <h1>${GIORNI_L[d]} ${viewDate.getDate()} ${MESI[viewDate.getMonth()]}</h1>
  ${today ? '' : '<button class="back" data-today>Torna a oggi</button>'}
  ${weigh ? `<div style="margin-top:6px"><span class="hl">Giorno del peso</span> <span class="sub">— pesati al mattino</span></div>` : ''}
  <div class="wknav"><button class="arr" data-wk="-1" aria-label="Settimana precedente">‹</button><div class="lbl">${wLbl}<small>${mon.getDate()} ${MESI[mon.getMonth()]} – ${sun.getDate()} ${MESI[sun.getMonth()]}</small></div><button class="arr" data-wk="1" aria-label="Settimana successiva" ${wDiff <= 0 ? 'disabled' : ''}>›</button></div>
  <div class="days">${strip}</div>
  <div class="plate-wrap">
    <div class="plate"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" stroke-width="12"/>${seg(fOk, 'var(--green)', 0)}${seg(fVa, 'var(--amber)', fOk)}${seg(fSk, 'var(--muted)', fOk + fVa)}</svg>
      <div class="num"><b style="color:${sc.any ? `var(${tcol(stat(sc.pct)[1])})` : 'inherit'}">${sc.pct}%</b><span>aderenza</span></div></div>
    <div><div class="verdict">${verdict(sc.pct, sc.any)}</div>
      <div class="legend"><span><i class="dot" style="background:var(--green)"></i>${sc.ok + sc.sw} ok${sc.sw ? ` (${sc.sw} scambi)` : ''}</span><span><i class="dot" style="background:var(--amber)"></i>${sc.va + sc.ms + sc.ex} sgarri${sc.ms || sc.ex ? ` (${[sc.va ? sc.va + ' variati' : '', sc.ex ? sc.ex + ' fuori dieta' : '', sc.ms ? 'movimento' : ''].filter(Boolean).join(', ')})` : ''}</span><span><i class="dot" style="background:var(--muted)"></i>${sc.sk} non presi</span></div>
      <div class="sub" style="margin-top:6px">${sc.marked} di ${sc.n} voci segnate</div></div>
  </div>`;
  { const prev = Object.keys(S.weights).filter(x => x < k).sort().pop(); h += `<div class="water"><div class="row"><h2>Peso</h2><span class="sub">${weigh ? '<span class="hl">giorno del peso</span>' : prev ? 'ultimo: ' + fmtN(S.weights[prev]) + ' kg' : 'kg'}</span></div><div class="field"><input type="text" inputmode="decimal" autocomplete="off" id="wIn" placeholder="es. 60,4" value="${S.weights[k] != null ? fmtN(S.weights[k]) : ''}"><button class="btn" id="wSave">Salva peso</button></div></div>`; }
  const G = glassesGoal();
  if (G) {
    h += `<div class="water"><div class="row"><h2>Acqua</h2><span class="sub">${fmtN(((D.w || 0) * 0.25).toFixed(2))} di ${fmtN(PLAN.water_l)} L</span></div><div class="glasses">`;
    for (let i = 1; i <= G; i++) h += `<button data-glass="${i}" class="${(D.w || 0) >= i ? 'full' : ''}" aria-label="${i} bicchieri"></button>`;
    h += `</div></div>`;
  }
  if (!plan.length) h += `<div class="card"><p class="sub">Per ${GIORNI_L[d].toLowerCase()} il piano non ha pasti. <button class="linkbtn" data-act="edit">Modifica il piano</button></p></div>`;
  plan.forEach(m => {
    h += `<section class="meal ${m.k === nextK ? 'next' : ''}"><header><h2>${esc(m.n)}</h2><span class="t">${m.k === nextK ? '<span class="hl">Adesso</span> ' : ''}${esc(m.h)}</span></header>${m.note ? `<div class="note">${esc(m.note)}</div>` : ''}`;
    const hasFood = m.items.some(it => !it.sup && !it.act); const ML = D.ml && D.ml[m.k];
    if (hasFood && !ML) h += `<div class="note"><button class="mlbtn" data-mealvar="${m.k}">↻ Ho cambiato tutto il pasto</button></div>`;
    if (ML) h += `<div class="mlbox"><div class="mlhead"><b>Pasto cambiato</b><button class="mlbtn" data-mlcancel="${m.k}">Annulla</button></div><input data-mlnote="${m.k}" placeholder="Cosa hai mangiato? Es. pizza margherita e una birra" value="${esc(ML.n || '')}">${evHtml(k + '|ml|' + m.k, ML.ev, !!ML.n)}</div>`;
    m.items.forEach(it => {
      const s = D.it[it.id] || {}; const food = !it.sup && !it.act;
      if (ML && food) { h += `<div class="item mlgone"><div class="top"><div class="txt">${esc(it.t)}</div></div></div>`; return; }
      let swapHtml = '';
      if (food) { const opts = pool(it.mk, it.t); if (opts.length) swapHtml = `<div class="swapbox"><select data-swap aria-label="Alimento preso da un altro giorno"><option value="">Scegli da un altro giorno…</option>${opts.map(o => `<option ${s.s === 'swap' && s.n === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select><div class="hint">Scambio previsto dalla dieta: non è uno sgarro.</div></div>`; }
      h += `<div class="item ${s.s || ''} ${it.act ? 'act' : ''}" data-id="${it.id}"><div class="top"><div class="txt">${it.sup ? '<span class="tag">integratore</span>' : ''}${esc(it.t)}${s.s === 'swap' && s.n ? `<div style="color:var(--green)">⇄ ${esc(s.n)}</div>` : ''}</div>
      <div class="acts"><button class="ok ${s.s === 'ok' ? 'on' : ''}" data-set="ok" aria-label="Fatto come da dieta">✓</button>${food ? `${swapHtml ? `<button class="swap ${s.s === 'swap' ? 'on' : ''}" data-set="swap" aria-label="Scambiato con un altro giorno">⇄</button>` : ''}<button class="var ${s.s === 'var' ? 'on' : ''}" data-set="var" aria-label="Variato">↻</button>` : ''}<button class="skip ${s.s === 'skip' ? 'on' : ''}" data-set="skip" aria-label="${it.act ? 'Non fatto' : 'Non preso'}">✕</button></div></div>
      ${swapHtml}${food ? `<div class="varbox"><input data-note placeholder="Cosa hai mangiato al posto di questo? Es. pasta al pomodoro 80 g" value="${esc(s.n || '')}">${evHtml(k + '|it|' + it.id, s.ev, !!s.n)}</div>` : ''}</div>`;
    });
    h += `</section>`;
  });
  h += `<div class="extras"><h2>Altri sport</h2><div class="sub">Allenamenti in più rispetto al piano.</div>
    <div>${D.sp.map((x, i) => `<span class="chip sp">${esc(x.n)}${x.m ? ' · ' + x.m + ' min' : ''}<button data-delsp="${i}" aria-label="Rimuovi">×</button></span>`).join('')}</div>
    <div class="sprow"><input id="spName" placeholder="es. Padel" list="spList"><input id="spMin" type="number" inputmode="numeric" placeholder="min"><button class="btn" id="spAdd">Aggiungi</button></div>
    <datalist id="spList">${[...new Set(Object.values(S.days).flatMap(x => (x.sp || []).map(y => y.n)).concat(['Palestra', 'Corsa', 'Camminata', 'Padel', 'Nuoto', 'Bici', 'Yoga', 'Pilates', 'Tennis']))].map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>`;
  h += `<div class="extras"><h2>Fuori dieta</h2><div class="sub">Ogni cosa mangiata fuori dal piano è uno sgarro: valuta quanto pesa.</div>
    <div>${D.ex.map((e, i) => `<div style="margin-top:6px"><span class="chip" style="margin-top:0">${esc(e)}<button data-delex="${i}" aria-label="Rimuovi">×</button></span>${evHtml(k + '|ex|' + i, D.exEv && D.exEv[e], true)}</div>`).join('')}</div>
    <div class="addrow"><input id="exIn" placeholder="es. 2 biscotti"><button class="btn" id="exAdd">Aggiungi</button></div></div>`;
  D.bg = D.bg || [];
  const be = bgEval(D);
  h += `<div class="extras"><div class="row" style="display:flex;justify-content:space-between;align-items:center"><h2>Bagno</h2><span class="sub">${D.bg.length ? D.bg.length + ' ' + (D.bg.length === 1 ? 'volta' : 'volte') : ''}</span></div>
    <div class="sub">Tocca ogni volta che vai, o "Nulla" a fine giornata.</div>
    <div class="bgbtns">${Object.entries(BGL).map(([q, [c, l, e]]) => `<button data-bg="${q}" style="border-color:var(${c})">${e} ${l}</button>`).join('')}<button data-bgnone class="${D.bgNone && !D.bg.length ? 'on' : ''}" style="${D.bgNone && !D.bg.length ? 'border-color:var(--s0)' : ''}">🚫 Nulla</button></div>
    ${D.bg.length ? `<div class="visits">${D.bg.map((v, i) => { const L = BGL[bgQ(v)]; return `<span class="visit"><i class="d" style="background:var(${L[0]})"></i>${L[2]} ${v.t}<button data-delbg="${i}" aria-label="Rimuovi">×</button></span>`; }).join('')}</div>` : ''}
    <div class="bgnote" style="color:var(${tcol(be[0])})">${be[1]}</div></div>`;
  return h;
}

/* ================= Tab: Andamento ================= */
function dayInfo(x) {
  const k = key(x), D = S.days[k], d = x.getDay();
  const movM = planFor(d).find(m => m.k === 'mov'); const mov = movM ? movM.items : [];
  const planIt = mov.find(it => !it.step && D && D.it && D.it[it.id] && D.it[it.id].s === 'ok');
  const pm = planIt ? (planIt.min || 30) : 0, pName = planIt ? planIt.sn : null;
  const em = D && D.sp ? D.sp.reduce((a, y) => a + (y.m || 0), 0) : 0;
  const steps = !!(D && D.it && mov.some(it => it.step && D.it[it.id] && D.it[it.id].s === 'ok'));
  const sc = score(k, d);
  const n = new Date(); n.setHours(12, 0, 0, 0);
  return { x, k, D, d, sc, pm, pName, em, steps, fut: x > n, sg: { va: sc.va, ms: sc.ms, ex: sc.ex } };
}
function periodDays() {
  const n = new Date(); n.setHours(12, 0, 0, 0); const out = [];
  if (rMode === 'w') {
    const end = new Date(n); end.setDate(n.getDate() - 7 * rOff);
    for (let i = 6; i >= 0; i--) { const x = new Date(end); x.setDate(end.getDate() - i); out.push(x); }
    const a = out[0], b = out[6];
    return { xs: out, title: rOff === 0 ? 'Ultimi 7 giorni' : rOff === 1 ? '7 giorni prima' : rOff + ' settimane fa', range: `${a.getDate()} ${MESI[a.getMonth()]} – ${b.getDate()} ${MESI[b.getMonth()]}` };
  }
  const m = new Date(n.getFullYear(), n.getMonth() - rOff, 1, 12); const last = new Date(m.getFullYear(), m.getMonth() + 1, 0, 12).getDate();
  for (let i = 1; i <= last; i++) out.push(new Date(m.getFullYear(), m.getMonth(), i, 12));
  const MN = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  return { xs: out, title: MN[m.getMonth()] + ' ' + m.getFullYear(), range: rOff === 0 ? 'Questo mese' : rOff === 1 ? 'Mese scorso' : rOff + ' mesi fa' };
}
function barChart(I, fn, max, opts = {}) {
  const M = rMode === 'm';
  return `<div class="bars ${M ? 'dense' : ''}">${I.map(z => {
    const r = fn(z); const tot = r.segs.reduce((a, s) => a + s[0], 0);
    const lab = M ? ([1, 5, 10, 15, 20, 25, 30].includes(z.x.getDate()) ? z.x.getDate() : '') : GIORNI[z.d];
    const body = tot ? r.segs.slice().reverse().filter(s => s[0]).map(s => `<i style="height:${s[0] / max * 100}%;background:var(${s[1]})"></i>`).join('') : (z.fut ? '' : `<i class="empty" ${r.emptyColor ? `style="background:var(${r.emptyColor})"` : ''}></i>`);
    return `<div class="bar" data-open="${z.k}" title="${GIORNI_L[z.d]} ${z.x.getDate()} ${MESI[z.x.getMonth()]}: ${esc(r.tip)}"><b>${!M && r.top != null ? r.top : ''}</b><div class="track">${opts.goal ? '<span class="goal"></span>' : ''}${body}</div><span>${lab}</span>${!M && r.mark !== undefined ? `<small>${r.mark}</small>` : ''}</div>`;
  }).join('')}</div>`;
}
function hbars(rows, col) {
  const mx = Math.max(1, ...rows.map(r => r[1]));
  return rows.map(([n, v, sub]) => `<div class="hb"><div class="hb-l"><span>${esc(n)}</span><b>${sub}</b></div><div class="hb-t"><i style="width:${v / mx * 100}%;background:var(${col})"></i></div></div>`).join('');
}
function weightChart(I) {
  const pts = I.map(z => ({ z, v: S.weights[z.k] })).filter(p => p.v != null);
  if (!pts.length) return `<div class="chart"><p class="sub" style="margin:4px">Nessun peso segnato in questo periodo. Puoi pesarti ogni giorno dalla schermata Oggi.</p></div>`;
  const W = 340, H = 190, L = 34, R = 12, T = 14, B = 26; const tg = PLAN.target;
  const vals = pts.map(p => p.v); let lo = Math.min(...vals, ...(tg ? [tg.min] : [])) - 0.5, hi = Math.max(...vals, ...(tg ? [tg.max] : [])) + 0.5;
  lo = Math.floor(lo * 2) / 2; hi = Math.ceil(hi * 2) / 2;
  const n = I.length, xp = i => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R)), yp = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const idx = z => I.indexOf(z);
  const step = (hi - lo) > 8 ? 2 : (hi - lo) > 4 ? 1 : 0.5; let grid = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${yp(v)}" y2="${yp(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${yp(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${fmtN(v)}</text>`;
  const band = tg ? `<rect x="${L}" width="${W - L - R}" y="${yp(tg.max)}" height="${Math.max(2, yp(tg.min) - yp(tg.max))}" fill="var(--green-soft)"/><text x="${W - R - 4}" y="${yp(tg.max) - 4}" text-anchor="end" font-size="10" fill="var(--green)">obiettivo ${fmtN(tg.min)}${tg.max !== tg.min ? '–' + fmtN(tg.max) : ''}</text>` : '';
  const line = pts.length > 1 ? `<polyline fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p => xp(idx(p.z)) + ',' + yp(p.v)).join(' ')}"/>` : '';
  const dots = pts.map((p, i) => {
    const x = xp(idx(p.z)), y = yp(p.v);
    const lab = (i === pts.length - 1 || i === 0) ? `<text x="${x}" y="${y - 9}" text-anchor="${pts.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}" font-size="11" font-weight="600" fill="var(--ink)">${fmtN(p.v)}</text>` : '';
    return `<g data-open="${p.z.k}" style="cursor:pointer"><circle cx="${x}" cy="${y}" r="10" fill="transparent"/><circle cx="${x}" cy="${y}" r="4" fill="var(--ink)" stroke="var(--card)" stroke-width="2"><title>${GIORNI_L[p.z.d]} ${p.z.x.getDate()} ${MESI[p.z.x.getMonth()]}: ${p.v} kg</title></circle>${lab}</g>`;
  }).join('');
  const xl = I.map((z, i) => { const show = rMode === 'w' || [1, 8, 15, 22, 29].includes(z.x.getDate()); return show ? `<text x="${xp(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${rMode === 'w' ? GIORNI[z.d] : z.x.getDate()}</text>` : ''; }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Andamento del peso">${band}${grid}${line}${dots}${xl}</svg></div>`;
}
function renderSett() {
  const P = periodDays(); const I = P.xs.map(dayInfo); const past = I.filter(z => !z.fut); const nDays = past.length;
  let tot = 0, cnt = 0; past.forEach(z => { if (z.sc.any) { tot += z.sc.pct; cnt++; } });
  const avg = cnt ? Math.round(tot / cnt) : null; const as = avg === null ? null : stat(avg);
  const SG = { va: ['--g1', 'Variati'], ms: ['--g2', 'Zero movimento'], ex: ['--g3', 'Fuori dieta'] };
  const sgT = { va: 0, ms: 0, ex: 0 }; I.forEach(z => Object.keys(sgT).forEach(q => sgT[q] += z.sg[q]));
  const sgTot = sgT.va + sgT.ms + sgT.ex; const sgDays = I.filter(z => z.sg.va + z.sg.ms + z.sg.ex > 0).length;
  const sgMax = Math.max(2, ...I.map(z => z.sg.va + z.sg.ms + z.sg.ex));
  const freq = {}; const bump = t => { const n = String(t).trim().toLowerCase(); if (n) freq[n] = (freq[n] || 0) + 1; };
  I.forEach(z => { if (!z.D) return; Object.values(z.D.it || {}).forEach(v => { if (v.s === 'var' && v.n) bump(v.n); }); (z.D.ex || []).forEach(bump); Object.values(z.D.ml || {}).forEach(v => { if (v.n) bump(v.n); }); });
  const topSg = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, v]) => [n.charAt(0).toUpperCase() + n.slice(1), v, v + (v === 1 ? ' volta' : ' volte')]);
  let sgRows = '';
  I.forEach(z => {
    if (!z.D) return;
    const vars = Object.values(z.D.it || {}).filter(v => v.s === 'var' && v.n).map(v => v.n + (v.ev ? ` (${v.ev.p}% vicino)` : ''));
    const mls = Object.entries(z.D.ml || {}).filter(([, v]) => v.n).map(([mk, v]) => { const mm = PLAN.meals.find(m => m.k === mk); return (mm ? mm.n.toLowerCase() : 'pasto') + ': ' + v.n + (v.ev ? ` (${v.ev.p}% vicino)` : ''); });
    const all = [...mls, ...vars, ...(z.D.ex || []).map(e => e + ' (fuori dieta' + (z.D.exEv && z.D.exEv[e] ? `, ${z.D.exEv[e].p}% vicino` : '') + ')'), ...(z.sg.ms ? ['nessun movimento'] : [])];
    if (all.length) sgRows += `<div class="li" data-open="${z.k}"><span>${GIORNI_L[z.d]} ${z.x.getDate()}</span><span class="v">${esc(all.join(', '))}</span></div>`;
  });
  const spMax = Math.max(60, ...I.map(z => z.pm + z.em));
  let planMin = 0, exMin = 0, stepDays = 0; const act = {};
  I.forEach(z => {
    planMin += z.pm; exMin += z.em; if (z.steps) stepDays++;
    if (z.pName) { act[z.pName] = act[z.pName] || [0, 0]; act[z.pName][0] += z.pm; act[z.pName][1]++; }
    ((z.D && z.D.sp) || []).forEach(y => { const n = y.n.trim(); act[n] = act[n] || [0, 0]; act[n][0] += y.m || 0; act[n][1]++; });
  });
  const actRows = Object.entries(act).sort((a, b) => b[1][0] - a[1][0]).map(([n, [m, c]]) => [n, m, `${m} min · ${c} ${c === 1 ? 'volta' : 'volte'}`]);
  const activeDays = I.filter(z => z.pm || z.em || z.steps).length;
  const bgMax = Math.max(2, ...I.map(z => (z.D && z.D.bg ? z.D.bg.length : 0)));
  let bgDays = 0, bgNone = 0; const bgC = { ok: 0, poco: 0, diss: 0 };
  I.forEach(z => { const L = (z.D && z.D.bg) || []; L.forEach(v => bgC[bgQ(v)]++); if (L.length) bgDays++; else if (z.D && z.D.bgNone) bgNone++; });
  const bgTot = bgC.ok + bgC.poco + bgC.diss; const ratio = nDays ? bgDays / nDays : 0;
  const bgSt = bgC.diss >= (rMode === 'm' ? 4 : 2) ? ['--s50', 'Intestino irritato'] : ratio >= 0.85 && bgC.ok >= bgTot * 0.8 ? ['--s100', 'Regolare'] : ratio >= 0.55 ? ['--s70', 'Abbastanza regolare'] : ['--s0', 'Poco regolare'];
  const wPts = I.filter(z => S.weights[z.k] != null).map(z => S.weights[z.k]);
  const wLast = wPts.length ? wPts[wPts.length - 1] : null; const wDelta = wPts.length > 1 ? Math.round((wLast - wPts[0]) * 10) / 10 : null;
  const nG = n => n + ' ' + (n === 1 ? 'giorno' : 'giorni');
  const stepsLbl = PLAN.steps ? `${PLAN.steps.toLocaleString('it-IT')} passi` : '';
  return `<div class="seg" role="tablist"><button data-rmode="w" class="${rMode === 'w' ? 'on' : ''}">Settimana</button><button data-rmode="m" class="${rMode === 'm' ? 'on' : ''}">Mese</button></div>
  <div class="wknav" style="margin:10px 0 12px"><button class="arr" data-wk="-1" aria-label="Periodo precedente">‹</button><div class="lbl">${P.title}<small>${P.range}</small></div><button class="arr" data-wk="1" aria-label="Periodo successivo" ${rOff === 0 ? 'disabled' : ''}>›</button></div>
  <div class="tiles">
    <div class="tile"><span>Aderenza media</span><b ${as ? `style="color:var(${tcol(as[1])})"` : ''}>${avg === null ? '—' : avg + '%'}</b><small>${as ? as[2] : 'nessun dato'}</small></div>
    <div class="tile"><span>Sgarri</span><b>${sgTot}</b><small>in ${nG(sgDays)}</small></div>
    <div class="tile"><span>Sport</span><b>${planMin + exMin}<em> min</em></b><small>attivo ${activeDays} su ${nDays}</small></div>
    <div class="tile"><span>Peso</span><b>${wLast == null ? '—' : fmtN(wLast) + '<em> kg</em>'}</b><small>${wDelta == null ? (wLast == null ? 'non segnato' : '1 pesata') : (wDelta > 0 ? '+' : '') + fmtN(wDelta) + ' kg nel periodo'}</small></div>
  </div>
  <h2 class="sec">Aderenza alla dieta</h2>
  <p class="sub sd">Tocca una colonna per aprire e modificare quel giorno.</p>
  <div class="chart">${barChart(I, z => ({ segs: z.sc.any ? [[Math.max(2, z.sc.pct), stat(z.sc.pct)[1]]] : [], top: z.sc.any ? z.sc.pct + '%' : null, tip: z.sc.any ? z.sc.pct + '% — ' + stat(z.sc.pct)[2] : 'nessun dato' }), 100, { goal: true })}
  <div class="scale">${ST.map(([p, c, l], i) => `<span><i style="background:var(${c})"></i>${l} ${p === 100 ? '100%' : p + '–' + (ST[i - 1][0] - 1) + '%'}</span>`).join('')}</div></div>
  <h2 class="sec">Peso</h2>
  <p class="sub sd">${wPts.length ? `${wPts.length} ${wPts.length === 1 ? 'pesata' : 'pesate'}.${PLAN.target ? ' La fascia verde è il tuo obiettivo.' : ''}` : 'Pesati quando vuoi: il peso si segna ogni giorno.'}</p>
  ${weightChart(I)}
  <h2 class="sec">Sgarri</h2>
  <p class="sub sd">${sgTot ? `${sgTot} in ${nG(sgDays)}: ${Object.keys(sgT).filter(q => sgT[q]).map(q => sgT[q] + ' ' + SG[q][1].toLowerCase()).join(', ')}.` : 'Nessuno sgarro in questo periodo.'}</p>
  <div class="chart">${barChart(I, z => { const t = z.sg.va + z.sg.ms + z.sg.ex; return { segs: [[z.sg.va, '--g1'], [z.sg.ms, '--g2'], [z.sg.ex, '--g3']], top: t || null, tip: t ? Object.keys(SG).filter(q => z.sg[q]).map(q => z.sg[q] + ' ' + SG[q][1].toLowerCase()).join(', ') : 'nessuno sgarro' }; }, sgMax)}
  <div class="scale">${Object.values(SG).map(([c, l]) => `<span><i style="background:var(${c})"></i>${l}</span>`).join('')}</div></div>
  ${topSg.length ? `<div class="chart" style="margin-top:10px"><div class="sub" style="margin:0 4px 6px;font-weight:600;color:var(--ink)">Gli sgarri più frequenti</div>${hbars(topSg, '--g3')}</div>` : ''}
  ${sgRows ? `<details class="det"><summary>Dettaglio giorno per giorno</summary><div class="list">${sgRows}</div></details>` : ''}
  <h2 class="sec">Sport</h2>
  <p class="sub sd">${planMin + exMin} min in totale: ${planMin} dal piano, ${exMin} di altri sport.${stepsLbl ? ` ${stepsLbl} in ${stepDays} su ${nDays}.` : ''}</p>
  <div class="chart">${barChart(I, z => ({ segs: [[z.pm, '--sp1'], [z.em, '--sp2']], top: (z.pm + z.em) || null, mark: z.steps ? '👣' : '', tip: `${z.pm} min piano, ${z.em} min altri sport${z.steps ? ', ' + stepsLbl : ''}` }), spMax)}
  <div class="scale"><span><i style="background:var(--sp1)"></i>Sport del piano</span><span><i style="background:var(--sp2)"></i>Altri sport</span>${rMode === 'w' && stepsLbl ? `<span>👣 ${stepsLbl}</span>` : ''}</div></div>
  ${actRows.length ? `<div class="chart" style="margin-top:10px"><div class="sub" style="margin:0 4px 6px;font-weight:600;color:var(--ink)">Per attività</div>${hbars(actRows, '--sp1')}</div>` : ''}
  <h2 class="sec">Bagno</h2>
  <div class="pill" style="margin-left:4px"><i style="background:var(${bgSt[0]})"></i>${bgSt[1]}</div>
  <p class="sub sd">In bagno ${bgDays} ${bgDays === 1 ? 'giorno' : 'giorni'} su ${nDays}${bgTot ? ': ' + Object.keys(bgC).filter(q => bgC[q]).map(q => bgC[q] + ' ' + BGL[q][1].toLowerCase()).join(', ') : ''}${bgNone ? `. Nulla in ${nG(bgNone)}` : ''}.</p>
  <div class="chart">${barChart(I, z => {
    const L = (z.D && z.D.bg) || []; const c = { ok: 0, poco: 0, diss: 0 }; L.forEach(v => c[bgQ(v)]++);
    return { segs: [[c.ok, BGL.ok[0]], [c.poco, BGL.poco[0]], [c.diss, BGL.diss[0]]], top: L.length || null, emptyColor: z.D && z.D.bgNone ? '--s0' : null, mark: L.length ? BGL[c.diss ? 'diss' : c.poco ? 'poco' : 'ok'][2] : (z.D && z.D.bgNone ? '🚫' : ''), tip: L.length ? Object.keys(c).filter(q => c[q]).map(q => c[q] + ' ' + BGL[q][1].toLowerCase()).join(', ') : (z.D && z.D.bgNone ? 'nulla' : 'non segnato') };
  }, bgMax)}
  <div class="scale">${Object.values(BGL).map(([c, l, e]) => `<span><i style="background:var(${c})"></i>${e} ${l}</span>`).join('')}<span><i style="background:var(--s0)"></i>🚫 Nulla</span></div></div>`;
}

/* ================= Tab: Spesa ================= */
function renderSpesa() {
  const c = {};
  for (let d = 0; d < 7; d++) planFor(d).forEach(m => { if (m.k === 'mov') return; m.items.forEach(it => { if (it.sup || /^\s*\d*\s*bicchier/i.test(it.t)) return; const t = it.t.trim(); c[t] = (c[t] || 0) + 1; }); });
  const foods = Object.entries(c).sort((a, b) => a[0].localeCompare(b[0], 'it')).map(([n, v]) => [n, v > 1 ? `${v} volte a settimana` : '1 volta a settimana']);
  const sups = PLAN.supplements.map(s => [s.n, s.dose ? s.dose + ' al giorno' : '']);
  const groups = [['Alimenti della settimana', foods]]; if (sups.length) groups.push(['Integratori', sups]); if (S.custom.length) groups.push(['Aggiunti da te', S.custom.map(x => [x, ''])]);
  let h = `<div class="sub">Tutto quello che serve per una settimana di piano</div><h1>Lista della spesa</h1><div class="shop">`;
  groups.forEach(([g, items]) => {
    h += `<h3>${g}</h3><div class="list" style="margin-top:0">`;
    items.forEach(([n, q]) => { const id = 's:' + n; const on = !!S.shop[id]; h += `<div class="sitem ${on ? 'done' : ''}"><input type="checkbox" id="${esc(id)}" data-shop="${esc(id)}" ${on ? 'checked' : ''}><label for="${esc(id)}"><span>${esc(n)}</span><span class="q">${esc(q)}</span></label></div>`; });
    h += `</div>`;
  });
  h += `</div><div class="addrow" style="margin-top:16px"><input id="shIn" placeholder="Aggiungi un prodotto"><button class="btn" id="shAdd">Aggiungi</button></div>
  <div style="display:flex;gap:8px;margin-top:12px"><button class="btn ghost" id="shReset">Nuova spesa (togli le spunte)</button></div>
  <p class="sub" style="margin-top:12px">La quantità di ogni alimento è indicata nel nome: moltiplicala per le volte a settimana.</p>`;
  return h;
}

/* ================= Tab: Piano e account ================= */
function renderPiano() {
  const P = PLAN;
  const sport = WEEK_ORDER.map(d => P.week[d] && P.week[d].sport ? `<div class="li"><span>${GIORNI_L[d]}</span><span class="v">${esc(P.week[d].sport.n)}${P.week[d].sport.min ? ' · ' + P.week[d].sport.min + ' min' : ''}</span></div>` : '').join('');
  const email = user && user.email ? user.email : 'modalità prova';
  return `<div class="sub">Il tuo piano</div><h1>Piano</h1>
  <div style="display:flex;gap:8px;margin-top:10px"><button class="btn" style="flex:1" data-act="edit">Modifica piano</button><button class="btn ghost" style="flex:1" data-act="newdiet">Carica nuova dieta</button></div>
  ${P.rules.length ? `<h2 class="sec">Regole</h2><div class="rules" style="margin-top:10px">${P.rules.map(r => `<div class="rule ${r.no ? 'no' : ''}"><b>${esc(r.t)}</b><span>${esc(r.v)}</span></div>`).join('')}</div>` : ''}
  ${P.exclusions.length ? `<h2 class="sec">Da escludere</h2><p class="sub sd">${esc(P.exclusions.join(', '))}</p>` : ''}
  ${P.supplements.length ? `<h2 class="sec">Integratori</h2><div class="list">${P.supplements.map(s => { const m = P.meals.find(x => x.k === s.meal); return `<div class="li"><span>${esc(s.n)}</span><span class="v">${esc(s.dose)}${m ? ', ' + esc(m.n.toLowerCase()) : ''}</span></div>`; }).join('')}</div>` : ''}
  <h2 class="sec">Obiettivi</h2>
  <div class="list">
    ${sport}
    ${P.steps ? `<div class="li"><span>Passi</span><span class="v">${P.steps.toLocaleString('it-IT')} al giorno</span></div>` : ''}
    ${P.water_l ? `<div class="li"><span>Acqua</span><span class="v">${fmtN(P.water_l)} L al giorno</span></div>` : ''}
    ${P.weigh_days.length ? `<div class="li"><span>Peso</span><span class="v"><span class="hl">${WEEK_ORDER.filter(d => P.weigh_days.includes(d)).map(d => GIORNI_L[d].toLowerCase()).join(', ')}</span> mattina</span></div>` : ''}
    ${P.target ? `<div class="li"><span>Peso obiettivo</span><span class="v">${fmtN(P.target.min)}${P.target.max !== P.target.min ? '–' + fmtN(P.target.max) : ''} kg</span></div>` : ''}
  </div>
  ${P.notes ? `<h2 class="sec">Note</h2><p class="sub sd">${esc(P.notes)}</p>` : ''}
  <h2 class="sec">Account</h2>
  <div class="list">
    <div class="li"><span>Email</span><span class="v">${esc(email)}</span></div>
    <div class="li"><button class="linkbtn" data-act="export">Scarica tutti i miei dati</button></div>
    <div class="li"><a class="linkbtn" href="privacy.html" target="_blank">Informativa privacy</a></div>
    ${sb ? `<div class="li"><button class="linkbtn" data-act="logout">Esci</button></div>
    <div class="li"><button class="linkbtn" style="color:var(--red)" data-act="deleteAccount">Elimina account e dati</button></div>` : `<div class="li"><button class="linkbtn" style="color:var(--red)" data-act="resetDemo">Cancella i dati di prova</button></div>`}
  </div>
  <p class="disc">DietTracker ti aiuta a seguire il piano del tuo nutrizionista. Non è un dispositivo medico e non sostituisce il parere di un professionista. Le valutazioni di Claude sono stime.</p>`;
}

/* ================= Render ================= */
function render() {
  const app = $('#app');
  const showNav = view === 'app';
  document.body.classList.toggle('nonav', !showNav);
  let h = DEMO ? '<div class="demo">Modalità prova: i dati restano solo su questo dispositivo</div>' : '';
  if (!CONFIGURED && !DEMO) h += `<div class="brand"><div class="logo">✓</div><b>DietTracker</b></div><div class="card"><h2>App non ancora configurata</h2><p class="sub">Inserisci i dati di Supabase nel file <code>config.js</code>. Nel frattempo puoi <a href="?demo">provare l’app</a> con i dati salvati solo su questo dispositivo.</p></div>`;
  else if (view === 'loading') h += `<p class="sub" style="margin-top:40px;text-align:center"><span class="spin"></span>Caricamento…</p>`;
  else if (view === 'auth') h += renderAuth();
  else if (view === 'setup') h += renderSetup();
  else if (view === 'edit') h += renderEditor();
  else {
    h += ({ oggi: renderOggi, sett: renderSett, spesa: renderSpesa, piano: renderPiano }[tab])();
    h += `<div id="status" class="sync">${esc(status)}</div>`;
  }
  app.innerHTML = h;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}

/* ================= Eventi ================= */
document.querySelector('nav').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab;
  if (tab === 'oggi') { viewDate = new Date(); viewDate.setHours(12, 0, 0, 0); }
  status = ''; render(); window.scrollTo(0, 0);
});
const app = $('#app');
app.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); onAuthSubmit(f); });
app.addEventListener('click', async e => {
  const au = e.target.closest('[data-auth]'); if (au) { authMode = au.dataset.auth; authMsg = null; render(); return; }
  const ea = e.target.closest('[data-edact]'); if (ea) { e.preventDefault(); onEditorAct(ea.dataset.edact, ea.dataset.v); return; }
  const a = e.target.closest('[data-act]');
  if (a) {
    const act = a.dataset.act;
    if (act === 'manual') { ED = PLAN ? JSON.parse(JSON.stringify(PLAN)) : emptyPlan(); edFrom = 'manual'; edDay = 1; view = 'edit'; render(); window.scrollTo(0, 0); }
    if (act === 'edit') { ED = JSON.parse(JSON.stringify(PLAN)); edFrom = 'manual'; edDay = 1; view = 'edit'; render(); window.scrollTo(0, 0); }
    if (act === 'newdiet') { setupMsg = null; view = 'setup'; render(); window.scrollTo(0, 0); }
    if (act === 'cancelSetup') { view = 'app'; render(); }
    if (act === 'logout') { await sb.auth.signOut(); }
    if (act === 'export') {
      const blob = new Blob([JSON.stringify({ esportato: new Date().toISOString(), email: user && user.email, piano: PLAN, giorni: S.days, pesi: S.weights, spesa: { spunte: S.shop, aggiunti: S.custom } }, null, 2)], { type: 'application/json' });
      const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = 'diettracker-dati.json'; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000);
    }
    if (act === 'deleteAccount') {
      if (!confirm('Eliminare definitivamente il tuo account e tutti i dati? Non si può annullare.')) return;
      try { await callAI({ mode: 'delete_account' }); await sb.auth.signOut(); authMsg = ['ok', 'Account eliminato.']; } catch (err) { flash(err.message); }
    }
    if (act === 'resetDemo') { if (confirm('Cancellare i dati di prova?')) { localStorage.removeItem(LS_DEMO); PLAN = null; S = { days: {}, shop: {}, weights: {}, custom: [] }; view = 'setup'; render(); } }
    return;
  }
  if (view !== 'app') return;
  const k = key(viewDate);
  const wk = e.target.closest('[data-wk]'); if (wk) { if (tab === 'oggi') { viewDate = new Date(viewDate); viewDate.setDate(viewDate.getDate() + 7 * (+wk.dataset.wk)); const n = new Date(); n.setHours(12, 0, 0, 0); if (viewDate > n) viewDate = n; } else { rOff = Math.max(0, rOff - (+wk.dataset.wk)); } render(); return; }
  const rm = e.target.closest('[data-rmode]'); if (rm) { rMode = rm.dataset.rmode; rOff = 0; render(); return; }
  if (e.target.closest('[data-today]')) { viewDate = new Date(); viewDate.setHours(12, 0, 0, 0); render(); return; }
  const op = e.target.closest('[data-open]'); if (op) { tab = 'oggi'; viewDate = new Date(op.dataset.open + 'T12:00'); render(); window.scrollTo(0, 0); return; }
  const dd = e.target.closest('[data-day]'); if (dd) { viewDate = new Date(dd.dataset.day + 'T12:00'); render(); return; }
  const g = e.target.closest('[data-glass]'); if (g) { const D = day(k), n = +g.dataset.glass; D.w = ((D.w || 0) === n ? n - 1 : n); saveDay(k); render(); return; }
  const st = e.target.closest('[data-set]');
  if (st) {
    const id = st.closest('.item').dataset.id, D = day(k), v = st.dataset.set, cur = D.it[id];
    if (cur && cur.s === v) delete D.it[id]; else D.it[id] = { s: v, n: '' };
    saveDay(k); render();
    if (v === 'var' && D.it[id]) { const inp = document.querySelector(`[data-id="${id}"] [data-note]`); inp && inp.focus(); }
    if (v === 'swap' && D.it[id]) { const sel = document.querySelector(`[data-id="${id}"] [data-swap]`); sel && sel.focus(); }
    return;
  }
  const bgb = e.target.closest('[data-bg]'); if (bgb) { const D = day(k); D.bg = D.bg || []; const now = new Date(); const t = today_(k) ? String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') : '—'; D.bg.push({ t, q: bgb.dataset.bg }); D.bgNone = false; saveDay(k); render(); return; }
  if (e.target.closest('[data-bgnone]')) { const D = day(k); D.bgNone = !(D.bgNone && !(D.bg || []).length); if (D.bgNone) D.bg = []; saveDay(k); render(); return; }
  const bgd = e.target.closest('[data-delbg]'); if (bgd) { const D = day(k); D.bg.splice(+bgd.dataset.delbg, 1); saveDay(k); render(); return; }
  const ds = e.target.closest('[data-delsp]'); if (ds) { const D = day(k); D.sp.splice(+ds.dataset.delsp, 1); saveDay(k); render(); return; }
  if (e.target.id === 'spAdd') { const n = $('#spName').value.trim(); if (!n) return; const m = parseInt($('#spMin').value) || 0; day(k).sp.push({ n, m }); saveDay(k); render(); return; }
  const mv = e.target.closest('[data-mealvar]'); if (mv) { const D = day(k); D.ml = D.ml || {}; D.ml[mv.dataset.mealvar] = { n: '' }; saveDay(k); render(); const inp = document.querySelector(`[data-mlnote="${mv.dataset.mealvar}"]`); inp && inp.focus(); return; }
  const mc = e.target.closest('[data-mlcancel]'); if (mc) { const D = day(k); if (D.ml) delete D.ml[mc.dataset.mlcancel]; saveDay(k); render(); return; }
  const mb = e.target.closest('[data-man]'); if (mb) { setManual(mb.dataset.man, +mb.dataset.p); return; }
  const evb = e.target.closest('[data-eval]'); if (evb) { valuta(evb.dataset.eval); return; }
  const dx = e.target.closest('[data-delex]'); if (dx) { const D = day(k); D.ex.splice(+dx.dataset.delex, 1); saveDay(k); render(); return; }
  if (e.target.id === 'exAdd') { const v = $('#exIn').value.trim(); if (!v) return; const D = day(k); D.ex.push(v); saveDay(k); render(); if (AI) valuta(k + '|ex|' + (D.ex.length - 1)); return; }
  if (e.target.id === 'wSave') {
    const raw = $('#wIn').value.trim().replace(',', '.'); const v = Math.round(parseFloat(raw) * 100) / 100;
    if (!/^\d{2,3}([.]\d{1,2})?$/.test(raw) || isNaN(v)) { flash('Scrivi il peso così: 60,4'); return; }
    S.weights[k] = v; saveMisc(); status = 'Peso salvato'; render(); return;
  }
  if (e.target.id === 'shAdd') { const v = $('#shIn').value.trim(); if (!v) return; S.custom.push(v); saveMisc(); render(); return; }
  if (e.target.id === 'shReset') { S.shop = {}; saveMisc(); render(); return; }
});
app.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'dietFile') { onDietFiles(t.files); return; }
  if (view === 'edit') { onEditorInput(t); return; }
  const k = key(viewDate);
  if (t.hasAttribute('data-note')) { const id = t.closest('.item').dataset.id, D = day(k); if (D.it[id] && D.it[id].n && !D.it[id].ev && AI) valuta(k + '|it|' + id); else render(); return; }
  if (t.hasAttribute('data-mlnote')) { const mk = t.dataset.mlnote, D = day(k), ML = D.ml && D.ml[mk]; if (ML && ML.n) { if (!ML.ev && AI) valuta(k + '|ml|' + mk); else render(); } return; }
  if (t.hasAttribute('data-swap')) { const id = t.closest('.item').dataset.id, D = day(k); if (D.it[id]) { D.it[id].n = t.value; saveDay(k); render(); } return; }
  if (t.dataset.shop) { if (t.checked) S.shop[t.dataset.shop] = true; else delete S.shop[t.dataset.shop]; saveMisc(); t.closest('.sitem').classList.toggle('done', t.checked); }
});
app.addEventListener('input', e => {
  const t = e.target;
  if (view === 'edit') { onEditorInput(t); return; }
  const k = key(viewDate);
  if (t.hasAttribute('data-mlnote')) { const D = day(k), ML = D.ml && D.ml[t.dataset.mlnote]; if (ML) { ML.n = t.value; if (ML.ev && !ML.ev.man) delete ML.ev; saveDay(k); } return; }
  if (t.hasAttribute('data-note')) { const id = t.closest('.item').dataset.id, D = day(k); if (D.it[id]) { D.it[id].n = t.value; if (D.it[id].ev && !D.it[id].ev.man) delete D.it[id].ev; saveDay(k); } }
});
app.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || view !== 'app') return;
  const id = e.target.id;
  if (id === 'exIn') $('#exAdd').click(); if (id === 'wIn') $('#wSave').click(); if (id === 'shIn') $('#shAdd').click(); if (id === 'spName' || id === 'spMin') $('#spAdd').click();
});

/* ================= Avvio ================= */
async function boot() {
  view = 'loading'; render();
  try { await loadAll(); view = PLAN ? 'app' : 'setup'; tab = 'oggi'; }
  catch (e) { console.error(e); view = 'app'; status = 'Non riesco a caricare i dati. Controlla la connessione e ricarica.'; if (!PLAN) view = 'setup'; }
  render();
}
if (!CONFIGURED && !DEMO) render();
else if (!sb) boot();
else {
  let booted = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') { authMode = 'newpass'; authMsg = null; view = 'auth'; render(); return; }
    if (session && session.user) {
      if (authMode === 'newpass') return;
      if (!booted || !user || user.id !== session.user.id) { user = session.user; booted = true; setTimeout(boot, 0); }
    } else { user = null; booted = false; PLAN = null; S = { days: {}, shop: {}, weights: {}, custom: [] }; view = 'auth'; render(); }
  });
}

(() => {
  'use strict';

  const API = (window.WARDLIFE_API || '').replace(/\/$/, '');
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (n) => String(n || '?').replace(/^(dr|nurse|pharm)\.?\s+/i, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const ROLE_LIST = [
    ['doctor', 'Doctor', 'bi-clipboard2-pulse', 'Clerk, order tests, decide and operate'],
    ['student', 'Medical student', 'bi-mortarboard', 'Manage patients and present cases'],
    ['nurse', 'Nurse', 'bi-heart', 'Triage, give care and ward observations'],
    ['midwife', 'Midwife', 'bi-person-heart', 'Labour ward and maternity care'],
    ['pharmacist', 'Pharmacist', 'bi-capsule-pill', 'Dispense and stop unsafe prescriptions'],
    ['lab_scientist', 'Lab scientist', 'bi-droplet-half', 'Run blood tests and crossmatch'],
    ['radiographer', 'Radiographer', 'bi-radioactive', 'X-ray, CT and ultrasound'],
    ['paramedic', 'Paramedic / EMT', 'bi-truck', 'Ambulance hand-overs and transfers'],
  ];
  const BEDS = { ambulance: 3, emergency: 6, radiology: 2, opd: 4, theatre: 2, maternity: 6, paeds: 6, medical: 8, surgical: 8 };
  const ROOMS = ['ambulance', 'emergency', 'radiology', 'lab', 'records', 'opd', 'pharmacy', 'theatre', 'maternity', 'paeds', 'medical', 'surgical', 'conference'];
  const CLIN = ['doctor', 'student'];
  const TRIAGERS = ['nurse', 'midwife', 'doctor', 'student', 'paramedic'];
  const CARERS = ['nurse', 'midwife'];
  const STAGE = {
    en_route: 'Ambulance on the way', arrived: 'At the ambulance bay', registration: 'At Records for a folder',
    waiting: 'Waiting for triage', triaged: 'Waiting for a doctor', reviewed: 'Needs a plan',
    pharmacy: 'Prescription at Pharmacy', care: 'Needs nursing care', surgery: 'Waiting for surgery',
    inpatient: 'On the ward', transfer: 'Bed confirmed, needs an ambulance', leaving: 'Leaving',
    awaiting_ambulance: 'Needs an ambulance', pickup: 'Ambulance going to collect', boarding: 'No bed: on a trolley',
    transfer_call: 'Needs a receiving centre',
  };
  const TRIAGE_NAME = { red: 'Emergency', orange: 'Very urgent', yellow: 'Urgent', green: 'Routine' };

  const S = {
    token: localStorage.getItem('wl_token'), me: null, cfg: null, state: null, ws: null, retry: 0,
    myDept: null, openPid: null, folder: null, drafts: {}, chat: [], ticker: [], feed: [], myCases: [],
    answers: {}, lastPA: 0, renderedConf: false, advice: {},
  };

  // ---------- visitor tracking ----------
  let vid = localStorage.getItem('wl_vid');
  if (!/^[0-9a-f]{32}$/.test(vid || '')) {
    vid = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('wl_vid', vid);
  }
  const ref = document.referrer && new URL(document.referrer).host !== location.host ? document.referrer : '';
  fetch(`${API}/api/visit`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vid, path: location.pathname, ref }) }).catch(() => {});

  // ---------- toasts ----------
  function toast(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast align-items-center ${kind}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(text)}</div><button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
    $('#toasts').appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 3500 });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
  }

  // ---------- auth ----------
  function buildRoleGrid() {
    $('#roleGrid').innerHTML = ROLE_LIST.map(([k, n, icon, does], i) => `
      <div class="role-opt" style="--rc: var(--r-${k})">
        <input type="radio" name="role" id="role_${k}" value="${k}" ${i === 0 ? 'checked' : ''}>
        <label for="role_${k}"><i class="bi ${icon}" aria-hidden="true"></i><span><b>${n}</b>${does}</span></label>
      </div>`).join('');
  }

  function authError(msg) {
    const el = $('#authError');
    el.textContent = msg; el.classList.toggle('d-none', !msg);
  }

  async function post(url, body) {
    const r = await fetch(API + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || 'Something went wrong. Try again.');
    return data;
  }

  $('#tabJoin').addEventListener('submit', async (e) => {
    e.preventDefault(); authError('');
    try {
      const d = await post('/api/register', {
        name: $('#regName').value, role: document.querySelector('input[name=role]:checked')?.value,
        institution: $('#regInst').value, password: $('#regPass').value,
      });
      signedIn(d.token);
    } catch (err) { authError(err.message); }
  });
  $('#tabSignin').addEventListener('submit', async (e) => {
    e.preventDefault(); authError('');
    try { const d = await post('/api/login', { name: $('#logName').value, password: $('#logPass').value }); signedIn(d.token); }
    catch (err) { authError(err.message); }
  });
  $('#signOut').addEventListener('click', async () => {
    await fetch(`${API}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${S.token}` } }).catch(() => {});
    signOut();
  });

  function signedIn(token) {
    S.token = token; localStorage.setItem('wl_token', token);
    $('#auth').classList.add('d-none'); $('#game').classList.remove('d-none');
    connect();
  }
  function signOut() {
    localStorage.removeItem('wl_token'); S.token = null;
    if (S.ws) { S.ws.onclose = null; S.ws.close(); }
    location.reload();
  }
  async function showLanding() {
    buildRoleGrid();
    $('#auth').classList.remove('d-none');
    try {
      const r = await (await fetch(`${API}/api/public-stats`)).json();
      $('#landingOnline').textContent = r.online.toLocaleString();
      $('#landingPlayers').textContent = r.players.toLocaleString();
    } catch (_) { /* landing still works */ }
  }

  // ---------- websocket ----------
  function connect() {
    const base = API ? new URL(API) : location;
    const proto = base.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${base.host}/ws?token=${encodeURIComponent(S.token)}`);
    S.ws = ws;
    ws.onopen = () => { S.retry = 0; $('#connPill').classList.add('d-none'); if (S.openPid) send({ a: 'folder', pid: S.openPid }); };
    ws.onmessage = (e) => onMsg(JSON.parse(e.data));
    ws.onclose = (ev) => {
      if (ev.code === 4401) { signOut(); return; }
      $('#connPill').classList.remove('d-none');
      setTimeout(connect, Math.min(10000, 1000 * 2 ** S.retry++));
    };
  }
  function send(obj) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj)); }

  function onMsg(m) {
    switch (m.t) {
      case 'hello':
        S.me = m.me; S.cfg = m; S.myDept = m.me.dept; S.ticker = m.ticker; S.feed = m.feed;
        buildMap(); renderMe(); renderPAList(); setupView();
        if (S.ticker[0]) showPA(S.ticker[0], false);
        break;
      case 'state': S.state = m; render(); break;
      case 'me': S.me = m.me; S.myDept = m.me.dept; renderMe(); break;
      case 'xp':
        S.me = m.me; renderMe();
        toast(`${m.amount > 0 ? '+' : ''}${m.amount} XP. ${m.reason}`, m.amount >= 0 ? 'good' : 'bad');
        break;
      case 'pa': S.ticker.unshift(m); S.ticker = S.ticker.slice(0, 30); showPA(m, true); renderPAList(); worldPA(m.text); break;
      case 'error': toast(m.msg, 'bad'); break;
      case 'folder': if (m.patient.pid === S.openPid) { S.folder = m.patient; renderFolder(); } break;
      case 'chat': S.chat.push(m); S.chat = S.chat.slice(-120); renderChat(); if (S.view3d) window.World3D.say(m.from, m.text); break;
      case 'pos': if (S.view3d) window.World3D.positions(m.p); break;
      case 'feed': S.feed = m.feed; renderFeed(); break;
      case 'my_cases': S.myCases = m.cases; renderPresentPicker(); break;
    }
  }

  // ---------- top bar ----------
  function renderMe() {
    const me = S.me; if (!me) return;
    $('#meName').textContent = me.name;
    $('#meTitle').textContent = `${me.title}, ${me.xp.toLocaleString()} XP`;
    const av = $('#meAvatar'); av.textContent = initials(me.name); av.style.setProperty('--rc', `var(--r-${me.role})`);
    const pct = me.next ? Math.round(((me.xp - me.floor) / (me.next - me.floor)) * 100) : 100;
    $('#meXp').style.width = `${Math.max(3, pct)}%`;
  }
  function showPA(item, flash) {
    const strip = $('#paStrip');
    $('#paText').textContent = item.text;
    strip.className = `pa-strip kind-${item.kind || 'info'}`;
    if (flash) { void strip.offsetWidth; strip.classList.add('flash'); }
  }
  function renderPAList() {
    $('#paList').innerHTML = S.ticker.map((p) => `<li><time>${new Date(p.ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' })}</time>${esc(p.text)}</li>`).join('');
  }

  // ---------- map ----------
  function buildMap() {
    const map = $('#map');
    map.querySelectorAll('.room').forEach((r) => r.remove());
    ROOMS.forEach((id) => {
      const d = S.cfg.depts[id];
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'room'; b.dataset.room = id; b.style.gridArea = id;
      b.setAttribute('aria-label', `Walk to ${d.name}`);
      b.innerHTML = `<div class="room-h"><i class="bi ${d.icon}" aria-hidden="true"></i><span>${esc(d.name)}</span><span class="count"></span></div><div class="beds"></div><div class="queue-note"></div><div class="people"></div>`;
      map.appendChild(b);
    });
  }

  $('#map').addEventListener('click', (e) => {
    const room = e.target.closest('.room'); if (!room) return;
    moveTo(room.dataset.room);
  });
  function moveTo(dept) {
    if (dept === S.myDept) return;
    S.myDept = dept; S.movedAt = Date.now(); send({ a: 'move', dept });
    if (dept === 'conference') send({ a: 'my_cases' });
    render();
    if (window.innerWidth < 992 && !S.view3d) $('#deptHead').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- 3D view ----------
  function setupView() {
    if (S.viewReady) return; S.viewReady = true;
    const wrap = document.querySelector('.map-wrap');
    const can3d = !!(window.World3D && window.World3D.supported());
    let want = localStorage.getItem('wl_view') || '3d';
    if (!can3d) { want = 'plan'; $('#view3d').disabled = true; }
    const apply = (v) => {
      S.view3d = v === '3d' && can3d && window.World3D.init($('#world'), S.cfg, moveTo, send);
      wrap.classList.toggle('is-3d', !!S.view3d);
      $(S.view3d ? '#view3d' : '#viewPlan').checked = true;
      if (window.World3D) window.World3D.setVisible(!!S.view3d);
      localStorage.setItem('wl_view', S.view3d ? '3d' : 'plan');
      if (S.view3d && S.state) window.World3D.update(S.state, S.me, S.myDept);
    };
    document.querySelectorAll('input[name=view]').forEach((r) => r.addEventListener('change', () => apply(r.value)));
    $('#w3dWalk').addEventListener('click', (e) => {
      const on = !e.currentTarget.classList.contains('active'); e.currentTarget.classList.toggle('active', on);
      $('#world').classList.toggle('walking', on); window.World3D.setMode(on ? 'walk' : 'overview');
      $('#worldHint').textContent = on ? 'Use the joystick or W A S D to walk. Drag to look around.' : 'Drag to turn, pinch to zoom, tap a room to walk there.';
      localStorage.setItem('wl_walk', on ? '1' : '');
    });
    $('#w3dIn').addEventListener('click', () => window.World3D.zoom(0.8));
    $('#w3dOut').addEventListener('click', () => window.World3D.zoom(1.25));
    $('#w3dFull').addEventListener('click', (e) => {
      const on = !$('#world').classList.contains('full');
      $('#world').classList.toggle('full', on); document.body.classList.toggle('world-full-open', on);
      e.currentTarget.innerHTML = on ? '<i class="bi bi-fullscreen-exit"></i>' : '<i class="bi bi-fullscreen"></i>';
    });
    if (localStorage.getItem('wl_walk') && can3d) setTimeout(() => $('#w3dWalk').click(), 300);
    apply(want);
  }

  function worldPA(text) {
    const el = $('#worldPa'); if (!el) return;
    el.textContent = text; el.classList.add('show');
    clearTimeout(S.paTimer); S.paTimer = setTimeout(() => el.classList.remove('show'), 6000);
  }

  function myRole() { return S.me?.role; }

  function render() {
    const st = S.state; if (!st || !S.cfg) return;
    const meP = st.players.find((p) => p.uid === S.me.uid);
    if (meP && meP.dept !== S.myDept && Date.now() - (S.movedAt || 0) > 2500) S.myDept = meP.dept;
    document.body.classList.toggle('dumsor', st.power);
    $('#powerPill').classList.toggle('d-none', !st.power);
    $('#onlineCount').textContent = st.online.toLocaleString();
    $('#patientCount').textContent = st.patients.length;
    const o2 = $('#o2Pill');
    o2.innerHTML = `<i class="bi bi-lungs"></i><b>${st.o2.stock}</b> O₂ cylinders${st.o2.due_in ? `, delivery in ${st.o2.due_in}s` : ''}`;
    o2.classList.toggle('pill-warn', st.o2.stock <= 3);
    const free = Object.values(st.beds).reduce((a, b) => a + b.total - b.used, 0);
    const bp = $('#bedPill'); bp.innerHTML = `<i class="bi bi-hospital"></i><b>${free}</b> ward beds free`; bp.classList.toggle('pill-warn', free <= 2);
    $('#clock').innerHTML = `<i class="bi bi-clock"></i>${new Date(st.now * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' })}`;
    renderMap(); renderSession(); renderBoard();
    if (S.view3d && window.World3D) { window.World3D.update(st, S.me, S.myDept); $('#worldRoom').textContent = `You: ${S.cfg.depts[S.myDept]?.name || ''}`; }
    const active = document.activeElement;
    if (!(active && active.closest && active.closest('#deptBody') && active.matches('select'))) renderDept();
    if (S.openPid) {
      const p = st.patients.find((x) => x.pid === S.openPid);
      if (p && S.folder && p.rev !== S.folder.rev) send({ a: 'folder', pid: S.openPid });
      if (!p && S.folder && !S.folder.gone) { S.folder.gone = true; renderFolder(); }
    }
  }

  function renderMap() {
    const st = S.state;
    const byRoom = {}; ROOMS.forEach((r) => { byRoom[r] = { pats: [], ppl: [], queue: 0 }; });
    st.patients.forEach((p) => { if (!['en_route', 'awaiting_ambulance', 'pickup'].includes(p.stage) && byRoom[p.loc]) byRoom[p.loc].pats.push(p); });
    st.players.forEach((p) => byRoom[p.dept] && byRoom[p.dept].ppl.push(p));
    st.patients.forEach((p) => {
      p.pend.forEach((t) => { if (t.d === 'lab') byRoom.lab.queue++; if (t.d === 'radiology') byRoom.radiology.queue++; });
      if (p.stage === 'pharmacy') byRoom.pharmacy.queue++;
    });
    const sess = st.session;
    const next = st.next.round_ward;
    document.querySelectorAll('.room').forEach((el) => {
      const id = el.dataset.room; const r = byRoom[id];
      el.classList.toggle('here', id === S.myDept);
      el.classList.toggle('busy', r.pats.some((p) => p.tri === 'red' && p.stage !== 'inpatient'));
      el.classList.toggle('event', (sess && sess.dept === id) || (!sess && next === id));
      el.querySelector('.count').textContent = r.pats.length ? `${r.pats.length} pt${r.pats.length > 1 ? 's' : ''}` : '';
      const cap = st.beds[id] ? st.beds[id].total : st.units[id] ? st.units[id].total : (BEDS[id] || 0);
      const empty = Math.max(0, cap - r.pats.length);
      el.querySelector('.beds').innerHTML = r.pats.slice(0, 14).map((p) =>
        `<span class="bed tri-${p.tri || 'none'} ${p.stab < 30 ? 'low' : ''}" title="${esc(p.name)}: ${esc(STAGE[p.stage])}"></span>`).join('')
        + '<span class="bed vacant"></span>'.repeat(empty);
      let note = '';
      if (id === 'lab' || id === 'radiology') note = r.queue ? `${r.queue} test${r.queue > 1 ? 's' : ''} waiting` : '';
      if (id === 'pharmacy') note = r.queue ? `${r.queue} prescription${r.queue > 1 ? 's' : ''}` : '';
      const ringing = st.calls.filter((c) => c.unit === id).length;
      el.classList.toggle('ringing', ringing > 0);
      if (ringing) note = `Phone ringing${ringing > 1 ? ` (${ringing})` : ''}`;
      if (id === 'ambulance') { const out = st.fleet.filter((u) => u.status !== 'base').length; note = `${st.fleet.length - out} of ${st.fleet.length} ambulances at base`; }
      if (id === 'pharmacy' && st.o2.stock <= 3) note = `Oxygen low: ${st.o2.stock} left`;
      if (sess && sess.dept === id) note = sess.type === 'round' ? 'Ward round now' : 'Meeting now';
      else if (!sess && next === id) note = `Ward round in ${mmss(st.next.round_in)}`;
      el.querySelector('.queue-note').textContent = note;
      const ppl = r.ppl.slice(0, 9).map((p) => `<span class="avatar" style="--rc: var(--r-${p.role})" title="${esc(p.name)}">${esc(initials(p.name))}</span>`).join('');
      el.querySelector('.people').innerHTML = ppl + (r.ppl.length > 9 ? `<span class="more">+${r.ppl.length - 9}</span>` : '');
      let you = el.querySelector('.you');
      if (id === S.myDept && !you) { you = document.createElement('span'); you.className = 'you'; you.textContent = 'You'; el.appendChild(you); }
      if (id !== S.myDept && you) you.remove();
    });
    // ambulances: parked at the bay, driving out to collect or transfer, driving back with a patient
    const road = st.fleet.map((u, i) => {
      const prog = 1 - u.left / Math.max(1, u.total);
      let left = 5 + i * 5; let label = '';
      if (u.status === 'out' || u.status === 'transfer') { left = 12 + prog * 76; label = u.status === 'out' ? `To ${u.dest.split(',')[0]}` : 'Transfer'; }
      if (u.status === 'back') { left = 88 - prog * 76; label = `Back in ${u.left}s`; }
      const flip = u.status === 'out' || u.status === 'transfer' ? ' out' : '';
      return `<div class="amb${u.status === 'base' ? ' parked' : ''}${flip}" style="left:${left}%" title="${esc(u.name)}"><span class="amb-body"><b>+</b><i class="bi bi-truck-front-fill" aria-hidden="true"></i></span>${label ? `<small>${esc(label)}</small>` : ''}</div>`;
    });
    st.patients.filter((p) => p.taxi && p.stage === 'en_route').forEach((p) => {
      const left = 96 - (1 - p.eta / Math.max(1, p.eta_total)) * 70;
      road.push(`<div class="amb" style="left:${left}%"><span class="taxi">Taxi</span><small>${p.eta}s</small></div>`);
    });
    $('#ambulances').innerHTML = road.join('');
  }

  // ---------- sessions ----------
  function renderSession() {
    const st = S.state; const s = st.session; const box = $('#sessionBox');
    const calls = st.calls.filter((c) => c.unit !== S.myDept);
    const callHtml = calls.length && ['doctor', 'nurse', 'midwife'].includes(myRole()) ? `<div class="phone-alert"><i class="bi bi-telephone-inbound-fill"></i><span>Referral phone ringing in ${[...new Set(calls.map((c) => esc(S.cfg.depts[c.unit].name)))].join(' and ')}</span>${[...new Set(calls.map((c) => c.unit))].map((u) => `<button class="btn btn-sm btn-warning" data-move="${u}">Go to ${esc(S.cfg.depts[u].name)}</button>`).join('')}</div>` : '';
    if (!s) {
      const ward = st.next.round_ward ? S.cfg.depts[st.next.round_ward].name : null;
      box.innerHTML = callHtml + `<div class="upcoming"><span><i class="bi bi-clipboard2-check"></i> Ward round ${ward ? `on ${esc(ward)} ` : ''}in ${mmss(st.next.round_in)}</span><span><i class="bi bi-easel"></i> Clinical meeting in ${mmss(st.next.meeting_in)}</span></div>`;
      return;
    }
    const here = S.myDept === s.dept;
    const place = S.cfg.depts[s.dept].name;
    let html = `<div class="session"><div class="d-flex justify-content-between align-items-start gap-2"><div><h3>${esc(s.title)}</h3><div class="meta">${s.phase === 'summary' ? 'Shift summary' : `Question ${s.idx + 1} of ${s.total}`}, ${s.left}s left</div></div>`;
    if (!here) html += `<button class="btn btn-sm btn-warning" data-move="${s.dept}">Go to ${esc(place)}</button>`;
    html += '</div>';
    if (s.phase === 'summary') {
      const c = s.summary.counts;
      const cell = (n, l) => `<div><b>${n}</b>${l}</div>`;
      html += `<div class="stats">${cell(c.arrivals, 'Arrivals')}${cell(c.admissions, 'Admissions')}${cell(c.discharges, 'Discharges')}${cell(c.operations, 'Operations')}${cell(c.referrals_in, 'Referrals in')}${cell(c.referrals_out, 'Referrals out')}${cell(c.deteriorations, 'Moved to ICU')}${cell(c.prescriptions_stopped, 'Unsafe scripts stopped')}${cell(c.presentations, 'Presentations')}${cell(c.no_bed, 'No-bed events')}${cell(c.missed_calls, 'Missed referral calls')}</div>`;
      if (s.summary.top.length) html += `<p class="mt-2 mb-0 small">Top of this shift: ${s.summary.top.map((t) => `${esc(t.name)} (${t.xp} XP)`).join(', ')}</p>`;
    } else {
      const key = `${s.id}-${s.idx}`; const mine = S.answers[key];
      html += `<div class="meta mt-2">${esc(s.label)}</div><div class="q">${esc(s.q)}</div>`;
      html += s.options.map((o, i) => {
        let cls = 'opt';
        if (mine === i) cls += ' mine';
        if (s.phase === 'reveal') cls += i === s.answer ? ' right' : (mine === i ? ' wrong' : '');
        const dis = !here || mine !== undefined || s.phase === 'reveal' ? 'disabled' : '';
        return `<button class="${cls}" data-answer="${i}" data-key="${key}" ${dis}>${esc(o)}</button>`;
      }).join('');
      if (s.phase === 'reveal') html += `<div class="why">${esc(s.why)} <span class="opacity-75">${s.correct} got it right.</span></div>`;
      else if (!here) html += `<div class="meta">Only staff in ${esc(place)} can answer.</div>`;
      else html += `<div class="meta">${s.answered} answered so far.</div>`;
    }
    box.innerHTML = callHtml + html + '</div>';
  }
  $('#sessionBox').addEventListener('click', (e) => {
    const mv = e.target.closest('[data-move]'); if (mv) { moveTo(mv.dataset.move); return; }
    const b = e.target.closest('[data-answer]'); if (!b || b.disabled) return;
    S.answers[b.dataset.key] = Number(b.dataset.answer);
    send({ a: 'answer', opt: Number(b.dataset.answer) });
    renderSession();
  });

  // ---------- department panel ----------
  function condBar(p) {
    const cls = p.stab < 30 ? 'low' : p.stab < 60 ? 'mid' : '';
    return `<div class="cond"><span>Condition</span><div class="bar" role="progressbar" aria-valuenow="${p.stab}" aria-valuemin="0" aria-valuemax="100"><i class="${cls}" style="width:${p.stab}%"></i></div><span>${p.stab}%</span></div>`;
  }
  function btn(label, attrs, kind = 'btn-scrub', icon = '') {
    return `<button class="btn btn-sm ${kind}" ${attrs}>${icon ? `<i class="bi ${icon} me-1"></i>` : ''}${esc(label)}</button>`;
  }

  function actionsFor(p) {
    const role = myRole(); const here = S.myDept === p.loc; const out = []; let hint = '';
    const at = (needHere, html, place) => {
      const ok = place ? S.myDept === place : here;
      if (needHere && !ok) hint = `Go to ${S.cfg.depts[place || p.loc].name} to act.`; else out.push(html);
    };
    const A = (a, extra = '') => `data-a="${a}" data-pid="${p.pid}" ${extra}`;
    switch (p.stage) {
      case 'registration': at(true, btn('Open a folder', A('register'), 'btn-scrub', 'bi-folder-plus')); break;
      case 'arrived': if (role === 'paramedic') at(true, btn('Hand over with vitals', A('handover'), 'btn-scrub', 'bi-arrow-left-right')); break;
      case 'waiting': if (TRIAGERS.includes(role)) at(true, btn('Triage', A('triage'), 'btn-scrub', 'bi-activity')); break;
      case 'triaged': if (CLIN.includes(role)) at(true, btn('Clerk patient', A('clerk'), 'btn-scrub', 'bi-pencil-square')); break;
      case 'reviewed': if (CLIN.includes(role)) at(true, btn(p.pend.length ? 'Results pending' : 'Order tests or set plan', A('folder'), 'btn-scrub', 'bi-clipboard2-pulse')); break;
      case 'pharmacy': if (role === 'pharmacist') at(true, `${btn('Dispense', A('dispense'), 'btn-scrub', 'bi-capsule')} ${btn('Query prescription', A('dispense', 'data-query="1"'), 'btn-outline-danger', 'bi-question-octagon')}`, 'pharmacy'); break;
      case 'care': if (CARERS.includes(role)) at(true, btn('Give care and medicines', A('care'), 'btn-scrub', 'bi-heart-pulse')); break;
      case 'surgery': if (role === 'doctor') at(true, btn('Operate', A('operate'), 'btn-scrub', 'bi-scissors')); break;
      case 'awaiting_ambulance':
      case 'transfer': {
        if (role !== 'paramedic') break;
        const unit = S.state.fleet.find((u) => u.status === 'base');
        at(true, unit ? btn(`Dispatch ${unit.name}`, A('dispatch'), 'btn-scrub', 'bi-truck') : '<span class="hint align-self-center">All ambulances are out.</span>', 'ambulance');
        break;
      }
      case 'transfer_call':
        if (CLIN.includes(role)) at(true, `<select class="form-select form-select-sm w-auto" data-centre-for="${p.pid}" aria-label="Receiving centre">${S.state.centres.map((c) => `<option>${esc(c)}</option>`).join('')}</select>${btn('Call centre', A('call_centre'), 'btn-scrub', 'bi-telephone-outbound')}`);
        break;
      case 'inpatient':
        if ([...CARERS, 'student'].includes(role)) at(true, btn('Do observations', A('obs'), 'btn-outline-secondary', 'bi-thermometer-half'));
        if (role === 'doctor' && p.stab >= 90 && p.ward_secs >= 45) at(true, btn('Discharge early', A('early_discharge'), 'btn-outline-secondary', 'bi-door-open'));
        break;
    }
    if (['pharmacy', 'awaiting_ambulance', 'transfer'].includes(p.stage) && S.myDept === (p.stage === 'pharmacy' ? 'pharmacy' : 'ambulance')) hint = '';
    const active = out.length > 0;
    const NEEDS = { arrived: 'a paramedic, or the crew will bring them in', waiting: 'a nurse, midwife, doctor or student to triage',
      triaged: 'a doctor or student to clerk', reviewed: 'a doctor or student', pharmacy: 'a pharmacist', care: 'a nurse or midwife',
      surgery: 'a doctor in theatre', transfer: 'a paramedic to dispatch an ambulance',
      awaiting_ambulance: 'a paramedic to dispatch an ambulance', transfer_call: 'a doctor to call a receiving centre',
      boarding: 'a free bed. Doctors can discharge stable ward patients early' };
    if (!active && !hint && NEEDS[p.stage]) hint = `Needs ${NEEDS[p.stage]}.`;
    out.push(btn('Folder', A('folder'), 'btn-outline-secondary', 'bi-folder2-open'));
    return { active, html: out.join('') + (hint ? `<span class="hint align-self-center">${esc(hint)}</span>` : '') };
  }

  function pcard(p) {
    const acts = actionsFor(p);
    const stageCls = acts.active ? 'stage act' : 'stage';
    const meta = [`${p.age}${p.sex}`, p.nhis ? 'NHIS' : 'Cash', p.bed ? `Bed ${p.bed}` : '', p.src].filter(Boolean).join(', ');
    let extra = '';
    if (p.stage === 'en_route') extra = `<div class="pmeta">${p.taxi ? 'Coming by taxi' : `${esc(p.unit || 'Ambulance')} arriving`} in ${p.eta}s</div>`;
    if (p.stage === 'awaiting_ambulance') extra = `<div class="pmeta">Collect from: <b>${esc(p.pickup)}</b></div>`;
    if (p.stage === 'pickup') extra = `<div class="pmeta">${esc(p.unit)} is on the way to ${esc(p.pickup)}</div>`;
    if (p.centre) extra += `<div class="pmeta">Receiving centre: <b>${esc(p.centre)}</b></div>`;
    if (p.board) extra += `<div class="pmeta">Waiting for a bed on ${esc(S.cfg.depts[p.board].name)}</div>`;
    if (p.o2) extra += `<div class="pmeta"><i class="bi bi-lungs"></i> On oxygen${S.state.o2.stock <= 0 ? ': <b class="no">none left</b>' : ''}</div>`;
    if (p.rx) extra += `<div class="pmeta mt-1">Diagnosis on the script: <b>${esc(p.dx)}</b></div><ul class="rx">${p.rx.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
    if (p.pend.length) extra += `<div class="pmeta">Waiting for: ${p.pend.map((t) => esc(t.n)).join(', ')}</div>`;
    if (p.title && p.stage === 'inpatient') extra += `<div class="pmeta">${esc(p.title)}</div>`;
    return `<article class="pcard t-${p.tri || 'none'}">
      <div class="pcard-top"><div><div class="pname">${esc(p.name)}</div><div class="pmeta">${esc(meta)}</div></div>
      <span class="${stageCls}">${esc(p.stage === 'reviewed' && p.pend.length ? 'Awaiting results' : STAGE[p.stage])}</span></div>
      <p class="complaint">${esc(p.cc)}</p>${extra}
      ${['en_route', 'pickup'].includes(p.stage) ? '' : condBar(p)}
      <div class="pcard-actions">${acts.html}</div></article>`;
  }

  function callCard(c) {
    const role = myRole();
    const canAnswer = ['doctor', 'nurse', 'midwife'].includes(role) && !(role === 'midwife' && c.unit !== 'maternity');
    const adv = S.advice[c.cid] || (S.advice[c.cid] = new Set());
    const unitName = S.cfg.depts[c.unit].name;
    const spaceLine = `${c.space} of ${c.cap} spaces free in ${esc(unitName)}`;
    const o2Line = c.o2 ? `. Needs oxygen; ${S.state.o2.stock} cylinders in stock` : '';
    return `<article class="call">
      <div class="d-flex justify-content-between gap-2"><div><div class="call-h"><i class="bi bi-telephone-inbound-fill"></i> Referral call, ${c.ring}s</div>
      <div class="pname">${esc(c.from)}</div><div class="pmeta">${esc(c.level)}${c.missed ? ', calling again' : ''}</div></div></div>
      <dl class="sbar"><dt>Situation</dt><dd>${esc(c.name)}, ${c.age}${c.sex}. ${esc(c.s)}</dd><dt>Background</dt><dd>${esc(c.b)}</dd>
      <dt>Assessment</dt><dd>${esc(c.a)}</dd><dt>Request</dt><dd>${esc(c.r)}</dd></dl>
      <p class="cap-line ${c.space === 0 || (c.o2 && S.state.o2.stock <= 0) ? 'no' : ''}">${spaceLine}${o2Line}.</p>
      ${canAnswer ? `<div class="advice"><p class="small fw-semibold mb-1">Advice to give if you accept</p>${S.state.advice.map((a, i) => `<div class="form-check"><input class="form-check-input" type="checkbox" id="adv_${c.cid}_${i}" data-adv="${c.cid}" value="${i}" ${adv.has(i) ? 'checked' : ''}><label class="form-check-label" for="adv_${c.cid}_${i}">${esc(a)}</label></div>`).join('')}</div>
      <div class="pcard-actions">${btn('Accept', `data-call="${c.cid}" data-choice="accept"`, 'btn-scrub', 'bi-check-lg')}
      ${btn('Advise to manage locally', `data-call="${c.cid}" data-choice="local"`, 'btn-outline-secondary')}
      ${btn('Find another hospital', `data-call="${c.cid}" data-choice="redirect"`, 'btn-outline-secondary')}
      ${btn('Decline: no bed', `data-call="${c.cid}" data-choice="decline"`, 'btn-outline-danger')}</div>`
      : '<p class="hint mb-0">Calls are answered by the doctor, the nurse in charge, or the midwife in charge on the labour ward.</p>'}
    </article>`;
  }

  function renderDept() {
    const st = S.state; const id = S.myDept; const d = S.cfg.depts[id]; const role = myRole();
    const here = st.players.filter((p) => p.dept === id);
    $('#deptHead').innerHTML = `<h2><i class="bi ${d.icon}" aria-hidden="true"></i>${esc(d.name)}</h2><p>${esc(d.blurb)}</p>
      <div class="here-list">${here.slice(0, 12).map((p) => `<span>${esc(p.name)}, ${esc(S.cfg.roles[p.role].name)}</span>`).join('')}${here.length > 12 ? `<span>+${here.length - 12} more</span>` : ''}</div>`;
    $('#confBox').classList.toggle('d-none', id !== 'conference');
    if (id === 'conference' && !S.renderedConf) { S.renderedConf = true; send({ a: 'my_cases' }); renderFeed(); }
    if (id !== 'conference') S.renderedConf = false;

    let html = st.calls.filter((c) => c.unit === id).map(callCard).join('');
    const sort = (a, b) => ({ red: 0, orange: 1, yellow: 2, green: 3 }[a.tri] ?? 4) - ({ red: 0, orange: 1, yellow: 2, green: 3 }[b.tri] ?? 4) || a.stab - b.stab;
    if (id === 'lab' || id === 'radiology') {
      const rows = [];
      st.patients.forEach((p) => p.pend.filter((t) => t.d === id).forEach((t) => rows.push({ p, t })));
      const canRun = role === (id === 'lab' ? 'lab_scientist' : 'radiographer');
      html += `<h3 class="side-h">${id === 'lab' ? 'Samples waiting' : 'Imaging requests'}</h3>`;
      if (st.power) html += '<div class="empty">No power. Requests are queued until the generator is up.</div>';
      html += rows.length ? rows.sort((a, b) => b.t.w - a.t.w).map(({ p, t }) => `<div class="qrow"><div class="grow"><b>${esc(t.n)}</b><small>${esc(p.name)}, ${p.age}${p.sex}, waiting ${mmss(t.w)}</small></div>
        ${canRun ? btn(id === 'lab' ? 'Run test' : 'Do scan', `data-a="run_test" data-pid="${p.pid}" data-test="${t.k}" ${st.power ? 'disabled' : ''}`, 'btn-scrub') : ''}</div>`).join('')
        : `<div class="empty">No ${id === 'lab' ? 'samples' : 'requests'} waiting. Doctors order tests from the patient's folder.</div>`;
      if (!canRun) html += `<p class="small text-body-secondary mb-0">Only ${id === 'lab' ? 'lab scientists' : 'radiographers'} can run these. Without one on shift, duty staff report results more slowly.</p>`;
    } else if (id === 'pharmacy') {
      const list = st.patients.filter((p) => p.stage === 'pharmacy');
      const canOrder = ['pharmacist', 'nurse', 'doctor'].includes(role);
      html += `<div class="qrow"><i class="bi bi-lungs fs-4 ${st.o2.stock <= 3 ? 'no' : ''}"></i><div class="grow"><b>${st.o2.stock} oxygen cylinders</b><small>${st.o2.due_in ? `Delivery arriving in ${st.o2.due_in}s` : st.o2.stock <= 3 ? 'Running low. Order before it runs out.' : 'Each patient on oxygen uses about one cylinder every 40 seconds.'}</small></div>
        ${canOrder ? btn('Order 10 cylinders', `data-a="order_o2" ${st.o2.due_in ? 'disabled' : ''}`, 'btn-scrub') : ''}</div>`;
      html += '<h3 class="side-h mt-2">Prescriptions to check</h3>';
      html += list.length ? list.map(pcard).join('') : '<div class="empty">No prescriptions waiting. Read each one against the diagnosis; query anything unsafe.</div>';
    } else if (id === 'ambulance') {
      const list = st.patients.filter((p) => p.loc === 'ambulance' || p.stage === 'transfer').sort((a, b) => ['awaiting_ambulance', 'transfer', 'arrived'].indexOf(b.stage) - ['awaiting_ambulance', 'transfer', 'arrived'].indexOf(a.stage));
      const status = { base: 'At base, ready', out: 'Going to collect', back: 'Returning with a patient', transfer: 'On a transfer' };
      html += '<h3 class="side-h">Fleet</h3>' + st.fleet.map((u) => `<div class="qrow"><i class="bi bi-truck-front-fill fs-5 ${u.status === 'base' ? 'ok' : ''}"></i><div class="grow"><b>${esc(u.name)}</b><small>${status[u.status]}${u.dest ? `: ${esc(u.dest)}` : ''}${u.status !== 'base' ? `, ${u.left}s` : ''}</small></div></div>`).join('');
      html += '<h3 class="side-h mt-2">Jobs</h3>';
      html += list.length ? list.map(pcard).join('') : '<div class="empty">No jobs right now. 999 calls and accepted referrals appear here.</div>';
    } else if (id === 'conference') {
      html += '<div class="empty">Present patients you helped manage. Complete, accurate presentations score higher, and colleagues can endorse them.</div>';
    } else {
      const list = st.patients.filter((p) => p.loc === id && p.stage !== 'en_route').sort(sort);
      html += list.length ? list.map(pcard).join('') : `<div class="empty">No patients in ${esc(d.name)} right now.</div>`;
    }
    $('#deptBody').innerHTML = html;
  }

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-adv]'); if (!el) return;
    const set = S.advice[el.dataset.adv] || (S.advice[el.dataset.adv] = new Set());
    el.checked ? set.add(Number(el.value)) : set.delete(Number(el.value));
  });
  document.addEventListener('click', (e) => {
    const call = e.target.closest('[data-call]');
    if (call) { send({ a: 'answer_call', cid: call.dataset.call, choice: call.dataset.choice, advice: [...(S.advice[call.dataset.call] || [])] }); call.disabled = true; return; }
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a; const pid = b.dataset.pid;
    if (a === 'folder') { openFolder(pid); return; }
    const msg = { a, pid };
    if (b.dataset.test) msg.test = b.dataset.test;
    if (b.dataset.query) msg.query = true;
    if (a === 'call_centre') msg.centre = document.querySelector(`[data-centre-for="${pid}"]`)?.value;
    send(msg);
    b.disabled = true;
  });

  // ---------- folder ----------
  const folderModal = new bootstrap.Modal($('#folderModal'));
  $('#folderModal').addEventListener('hidden.bs.modal', () => { S.openPid = null; S.folder = null; });

  function openFolder(pid) {
    S.openPid = pid; S.folder = null;
    $('#folderTitle').textContent = 'Opening folder…'; $('#folderSub').textContent = ''; $('#folderNo').textContent = '';
    $('#folderBody').innerHTML = '';
    folderModal.show();
    send({ a: 'folder', pid });
  }

  function draft(pid) { return S.drafts[pid] || (S.drafts[pid] = { tests: new Set(), dx: null, mgmt: new Set(), dispo: '' }); }

  function renderFolder() {
    const p = S.folder; if (!p) return;
    const role = myRole(); const here = S.myDept === p.loc; const dr = draft(p.pid);
    const canAct = CLIN.includes(role) && here && p.stage === 'reviewed';
    $('#folderNo').textContent = `Folder ${p.folder}`;
    $('#folderTitle').textContent = p.name;
    $('#folderSub').textContent = [`${p.age} years, ${p.sex === 'F' ? 'female' : 'male'}`, p.nhis ? `NHIS ${p.nhis_no}` : 'No NHIS card, paying cash', p.src, p.gone ? 'Has left the hospital' : STAGE[p.stage]].filter(Boolean).join(', ');
    let h = '<div class="sheet">';
    h += `<h3>Presenting complaint</h3><p>${esc(p.cc)}</p>`;
    h += '<h3>Vital signs</h3>';
    h += p.vitals ? `<div class="vitals">${Object.entries(p.vitals).map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>
      ${p.tri ? `<p class="mt-2 mb-0 small">Triage: <b>${TRIAGE_NAME[p.tri]}</b></p>` : ''}` : '<p class="muted">Not triaged yet.</p>';
    h += '<h3>History</h3>' + (p.history ? `<p>${esc(p.history)}</p>` : '<p class="muted">Not clerked yet.</p>');
    if (p.exam) h += `<h3>Examination</h3><p>${esc(p.exam)}</p>`;

    h += '<h3>Investigations</h3>';
    h += p.tests.length ? `<ul class="tests-list">${p.tests.map((t) => `<li>${esc(t.n)}${t.status === 'done' ? `<span class="res">${esc(t.result)}</span>` : ` <span class="pending">pending at ${t.d === 'lab' ? 'the lab' : 'radiology'}</span>`}</li>`).join('')}</ul>` : '<p class="muted">None ordered.</p>';
    if (canAct) {
      const ordered = new Set(p.tests.map((t) => t.k));
      const groups = { bedside: 'Bedside', lab: 'Laboratory', radiology: 'Radiology' };
      h += `<form id="orderForm" class="mt-2"><div class="order-grid">${Object.entries(groups).map(([g, label]) => {
        const items = Object.entries(S.cfg.tests).filter(([k, t]) => t.dept === g && !ordered.has(k));
        return items.length ? `<h4>${label}</h4>` + items.map(([k, t]) =>
          `<div class="form-check"><input class="form-check-input" type="checkbox" id="t_${k}" value="${k}" ${dr.tests.has(k) ? 'checked' : ''}><label class="form-check-label" for="t_${k}">${esc(t.name)}</label></div>`).join('') : '';
      }).join('')}</div>
        <button class="btn btn-outline-dark btn-sm mt-2" type="submit">Order selected tests</button>
        <span class="small text-body-secondary ms-2">Bedside results are instant. Extra tests cost the patient and lose points.</span></form>`;
    }

    if (p.feedback) {
      const f = p.feedback;
      h += `<h3>Outcome of the plan</h3><div class="fb"><div class="d-flex justify-content-between align-items-baseline"><span>Plan by ${esc(f.by)}</span><span class="score ${f.xp >= 0 ? 'ok' : 'no'}">${f.xp > 0 ? '+' : ''}${f.xp} XP</span></div>
        <ul><li>${f.dx_ok ? '<i class="bi bi-check-circle-fill ok"></i>' : '<i class="bi bi-x-circle-fill no"></i>'}Diagnosis: ${esc(f.dx_given)}${f.dx_ok ? '' : `. Correct: <b>${esc(f.dx_correct)}</b>`}</li>
        <li>${f.dispo_ok ? '<i class="bi bi-check-circle-fill ok"></i>' : '<i class="bi bi-x-circle-fill no"></i>'}${esc(f.dispo_given)}${f.dispo_ok ? '' : `. Better: <b>${esc(f.dispo_correct)}</b>`}</li></ul>
        <ul>${f.plan.map((m) => {
          if (m.chosen && m.good) return `<li><i class="bi bi-check-lg ok"></i>${esc(m.t)}</li>`;
          if (m.chosen && m.good === false) return `<li><i class="bi bi-exclamation-triangle-fill no"></i>${esc(m.t)} <small class="no">(unsafe)</small></li>`;
          if (!m.chosen && m.good) return `<li><i class="bi bi-dash-circle miss"></i>${esc(m.t)} <small class="miss">(missed)</small></li>`;
          return '';
        }).join('')}</ul>
        ${f.missed.length ? `<p class="small mb-1 miss">Key tests missed: ${esc(f.missed.join(', '))}</p>` : ''}
        ${f.extra.length ? `<p class="small mb-1 miss">Tests not needed: ${esc(f.extra.join(', '))}</p>` : ''}
        ${f.notes.map((n) => `<p class="small mb-1"><i class="bi bi-info-circle"></i> ${esc(n)}</p>`).join('')}
        <div class="learn"><b>Learning point.</b> ${esc(f.learning)}</div></div>`;
    } else if (p.stage === 'reviewed') {
      h += '<h3>Management plan</h3>';
      if (!canAct) h += `<p class="muted">${CLIN.includes(role) ? `Go to ${esc(S.cfg.depts[p.loc].name)} to set the plan.` : 'Waiting for a doctor or student to set the plan.'}</p>`;
      else if (p.pend.length) h += '<p class="muted">Results are still pending. The plan opens when they are back.</p>';
      else {
        h += `<form id="planForm"><p class="small mb-1 fw-semibold">Diagnosis</p>${p.dx_options.map((o, i) => `<div class="form-check"><input class="form-check-input" type="radio" name="dx" id="dx_${i}" value="${i}" ${dr.dx === i ? 'checked' : ''}><label class="form-check-label" for="dx_${i}">${esc(o)}</label></div>`).join('')}
          <p class="small mb-1 mt-3 fw-semibold">Management (choose all that apply)</p>${p.mgmt_options.map((o, i) => `<div class="form-check"><input class="form-check-input" type="checkbox" name="mg" id="mg_${i}" value="${i}" ${dr.mgmt.has(i) ? 'checked' : ''}><label class="form-check-label" for="mg_${i}">${esc(o)}</label></div>`).join('')}
          <label class="small mb-1 mt-3 fw-semibold d-block" for="dispoSel">Where does the patient go?</label>
          <select class="form-select" id="dispoSel"><option value="">Choose</option>${Object.entries(S.cfg.dispositions).map(([k, v]) => `<option value="${k}" ${dr.dispo === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
          <button class="btn btn-scrub mt-3" type="submit">Confirm plan</button></form>`;
      }
    }
    if (p.rx_all && p.rx_all.length) h += `<h3>Medicines on the prescription</h3><ul class="rx">${p.rx_all.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
    if (p.team.length) h += `<h3>Care team</h3><p>${esc(p.team.join(', '))}</p>`;
    h += `<h3>Timeline</h3><ul class="timeline">${p.log.slice().reverse().map((l) => `<li><time>${new Date(l.ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' })}</time>${esc(l.text)}</li>`).join('')}</ul>`;
    $('#folderBody').innerHTML = h + '</div>';
  }

  $('#folderBody').addEventListener('change', (e) => {
    const p = S.folder; if (!p) return; const dr = draft(p.pid); const el = e.target;
    if (el.id.startsWith('t_')) el.checked ? dr.tests.add(el.value) : dr.tests.delete(el.value);
    if (el.name === 'dx') dr.dx = Number(el.value);
    if (el.name === 'mg') el.checked ? dr.mgmt.add(Number(el.value)) : dr.mgmt.delete(Number(el.value));
    if (el.id === 'dispoSel') dr.dispo = el.value;
  });
  $('#folderBody').addEventListener('submit', (e) => {
    e.preventDefault(); const p = S.folder; if (!p) return; const dr = draft(p.pid);
    if (e.target.id === 'orderForm') {
      if (!dr.tests.size) { toast('Tick at least one test.', 'bad'); return; }
      send({ a: 'order', pid: p.pid, tests: [...dr.tests] }); dr.tests.clear();
    }
    if (e.target.id === 'planForm') {
      if (dr.dx === null || !dr.mgmt.size || !dr.dispo) { toast('Choose a diagnosis, at least one management step and where the patient goes.', 'bad'); return; }
      send({ a: 'decide', pid: p.pid, dx: dr.dx, mgmt: [...dr.mgmt], dispo: dr.dispo });
    }
  });

  // ---------- conference ----------
  function renderPresentPicker() {
    const sel = $('#presentPid'); const open = S.myCases.filter((c) => !c.presented);
    sel.innerHTML = open.length ? open.map((c) => `<option value="${c.pid}">${esc(c.name)} (${c.age}${c.sex}), ${esc(c.title)}</option>`).join('')
      : '<option value="">Manage a patient first, then present them here</option>';
  }
  function renderFeed() {
    const labels = { pc: 'Complaint', findings: 'Findings', ix: 'Investigations', assessment: 'Assessment', plan: 'Plan', learning: 'Learning' };
    $('#feed').innerHTML = S.feed.length ? S.feed.map((f) => `<div class="pres"><h4>${esc(f.title)}</h4>
      <div class="pmeta">${esc(f.author)}, ${esc(S.cfg.roles[f.role]?.name || f.role)}. Patient ${esc(f.patient)}. Score ${f.score}.</div>
      <dl>${Object.entries(labels).filter(([k]) => f.body[k]).map(([k, l]) => `<dt>${l}</dt><dd>${esc(f.body[k])}</dd>`).join('')}</dl>
      ${f.uid !== S.me.uid ? `<button class="btn btn-sm btn-outline-secondary" data-endorse="${f.id}"><i class="bi bi-hand-thumbs-up"></i> Endorse (${f.endorsements})</button>` : `<span class="small text-body-secondary">${f.endorsements} endorsements</span>`}</div>`).join('')
      : '<p class="small text-body-secondary">No presentations yet. Be the first.</p>';
  }
  $('#feed').addEventListener('click', (e) => { const b = e.target.closest('[data-endorse]'); if (b) { send({ a: 'endorse', id: Number(b.dataset.endorse) }); b.disabled = true; } });
  $('#presentForm').addEventListener('submit', (e) => {
    e.preventDefault(); const pid = $('#presentPid').value;
    if (!pid) { toast('Manage a patient first.', 'bad'); return; }
    const sections = {}; ['pc', 'findings', 'ix', 'assessment', 'plan', 'learning'].forEach((k) => { sections[k] = $(`#pr_${k}`).value; });
    send({ a: 'present', pid, sections });
    e.target.querySelectorAll('textarea').forEach((t) => { t.value = ''; });
  });

  // ---------- chat and board ----------
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault(); const input = $('#chatInput'); const text = input.value.trim(); if (!text) return;
    send({ a: 'chat', text, scope: document.querySelector('input[name=chatScope]:checked').value }); input.value = '';
  });
  function renderChat() {
    const log = $('#chatLog'); const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.innerHTML = S.chat.map((m) => `<div class="msg" style="--rc: var(--r-${m.role})"><b>${esc(m.from)}</b><span class="tag">${m.scope === 'dept' ? esc(S.cfg.depts[m.dept].name) : 'Hospital'}</span> ${esc(m.text)}</div>`).join('');
    if (atEnd) log.scrollTop = log.scrollHeight;
  }
  function renderBoard() {
    const list = [...S.state.players].sort((a, b) => b.xp - a.xp).slice(0, 15);
    $('#board').innerHTML = list.map((p) => `<li><b>${esc(p.name)}</b> <small>${esc(S.cfg.roles[p.role].name)}, ${esc(S.cfg.depts[p.dept].name)}, ${p.xp.toLocaleString()} XP</small></li>`).join('');
  }

  // ---------- start ----------
  (async function start() {
    if (!S.token) { showLanding(); return; }
    try {
      const r = await fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${S.token}` } });
      if (!r.ok) throw new Error();
      $('#game').classList.remove('d-none'); connect();
    } catch (_) { localStorage.removeItem('wl_token'); S.token = null; showLanding(); }
  })();
})();

(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = (v) => Number(v || 0).toLocaleString();
  const ROLE = { doctor: 'Doctor', student: 'Medical student', nurse: 'Nurse', midwife: 'Midwife', pharmacist: 'Pharmacist',
    lab_scientist: 'Lab scientist', radiographer: 'Radiographer', paramedic: 'Paramedic / EMT' };
  const GAME = { arrivals: 'Patient arrivals', admissions: 'Admissions', discharges: 'Discharges', operations: 'Operations',
    referrals_in: 'Referrals in', referrals_out: 'Referrals out', deteriorations: 'Moved to ICU', decisions: 'Plans made',
    prescriptions_stopped: 'Unsafe prescriptions stopped', presentations: 'Case presentations', ward_rounds: 'Ward rounds',
    meetings: 'Clinical meetings', power_cuts: 'Power cuts', referral_calls: 'Referral calls received',
    missed_calls: 'Referral calls missed', referrals_refused: 'Referrals turned away', redirected: 'Referrals redirected',
    no_bed: 'No-bed events', o2_outs: 'Oxygen ran out' };
  let token = sessionStorage.getItem('wl_admin') || '';
  let data = null; let timer = null;

  async function load() {
    try {
      const r = await fetch(`${(window.WARDLIFE_API || '').replace(/\/$/, '')}/api/admin/stats`, { headers: { 'X-Admin-Token': token } });
      if (r.status === 401) throw new Error('Wrong admin token.');
      if (!r.ok) throw new Error('Could not load stats.');
      data = await r.json();
      $('#tokenForm').classList.add('d-none'); $('#dash').classList.remove('d-none');
      render();
      $('#updated').textContent = `Live. Updated ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Accra' })} Accra time. Refreshes every 15 seconds.`;
    } catch (e) {
      $('#tokErr').textContent = e.message; $('#tokenForm').classList.remove('d-none'); $('#dash').classList.add('d-none');
      clearInterval(timer); timer = null;
    }
  }

  function kpi(label, big, sub, icon) {
    return `<div class="col-6 col-lg-3"><div class="kpi"><small>${icon ? `<i class="bi ${icon}"></i>` : ''}${label}</small><div class="big">${big}</div><div class="sub">${sub}</div></div></div>`;
  }

  function render() {
    const d = data; const range = Number(document.querySelector('input[name=range]:checked').value);
    const series = d.series.slice(-range);
    const sum = (k) => series.reduce((a, s) => a + s[k], 0);
    $('#kpis').innerHTML = [
      kpi('Online now', n(d.online_now), `Peak ${n(d.peak_online)}. ${n(d.patients_now)} patients in the hospital`, 'bi-circle-fill text-success'),
      kpi('Active today', n(d.active_today), `${n(d.active_7d)} this week, ${n(d.active_30d)} in 30 days`),
      kpi('Players', n(d.players_total), `+${n(d.players_today)} today, +${n(d.players_7d)} this week`),
      kpi('Visits today', n(d.visits_today), `${n(d.visits_7d)} this week`),
      kpi('Unique visitors', n(range === 7 ? d.unique_7d : d.unique_30d), `last ${range} days, ${n(d.unique_today)} today`),
      kpi('All-time visits', n(d.visits_all), `${n(sum('visits'))} in the last ${range} days`),
      kpi('Sign-up rate', d.unique_30d ? `${Math.round((sum('signups') / Math.max(1, range === 7 ? d.unique_7d : d.unique_30d)) * 100)}%` : '0%', `unique visitors who signed up, last ${range} days`),
      kpi('Unsafe scripts stopped', n(d.game_all.prescriptions_stopped), `${n(d.game_all.presentations)} case presentations in total`),
    ].join('');
    $('#chart').innerHTML = chart(series);
    table('#roles', d.roles.map((r) => [ROLE[r.role] || r.role, n(r.n), n(d.online_by_role[r.role]) + ' online']), ['Role', 'Players', 'Now']);
    table('#insts', d.institutions.map((r) => [r.institution, n(r.n)]), ['School or hospital', 'Players']);
    table('#game', Object.entries(GAME).map(([k, l]) => [l, n(d.game_today[k])]), ['Event', 'Today']);
    table('#refs', d.referrers.map((r) => [r.ref, n(r.n)]), ['Site', 'Visits']);
    table('#top', d.top_players.map((r, i) => [`${i + 1}. ${r.name}`, ROLE[r.role] || r.role, r.institution || '', n(r.xp)]), ['Player', 'Role', 'School or hospital', 'XP']);
  }

  function table(sel, rows, head) {
    $(sel).innerHTML = `<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${
      rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}" class="text-body-secondary">No data yet.</td></tr>`}</tbody>`;
  }

  function chart(series) {
    const W = 800; const H = 220; const pad = { l: 40, r: 10, t: 10, b: 26 };
    const max = Math.max(5, ...series.map((s) => Math.max(s.visits, s.unique, s.signups)));
    const bw = (W - pad.l - pad.r) / series.length;
    const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
    let g = '';
    [0, 0.5, 1].forEach((f) => { const v = Math.round(max * f); g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#E4EAED"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v.toLocaleString()}</text>`; });
    series.forEach((s, i) => {
      const x = pad.l + i * bw; const w = Math.max(2, bw * 0.28);
      g += `<rect x="${x + bw * 0.08}" y="${y(s.visits)}" width="${w}" height="${H - pad.b - y(s.visits)}" fill="#0E7C7B" rx="2"><title>${s.day}: ${s.visits} visits</title></rect>`;
      g += `<rect x="${x + bw * 0.08 + w + 1}" y="${y(s.unique)}" width="${w}" height="${H - pad.b - y(s.unique)}" fill="#E9B824" rx="2"><title>${s.day}: ${s.unique} unique</title></rect>`;
      g += `<rect x="${x + bw * 0.08 + 2 * (w + 1)}" y="${y(s.signups)}" width="${w}" height="${H - pad.b - y(s.signups)}" fill="#1E5AA8" rx="2"><title>${s.day}: ${s.signups} sign-ups</title></rect>`;
      if (series.length <= 7 || i % 5 === 0) g += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${s.day.slice(5)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Visits, unique visitors and sign-ups per day">${g}</svg>`;
  }

  $('#tokenForm').addEventListener('submit', (e) => {
    e.preventDefault(); token = $('#tok').value.trim(); sessionStorage.setItem('wl_admin', token); $('#tokErr').textContent = '';
    load(); if (!timer) timer = setInterval(load, 15000);
  });
  document.querySelectorAll('input[name=range]').forEach((r) => r.addEventListener('change', () => data && render()));
  $('#refresh').addEventListener('click', load);
  if (token) { load(); timer = setInterval(load, 15000); }
})();

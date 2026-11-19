/* ============================================================
   LabQ — ตัวแอปหน้าเว็บ (hash router, ไม่ต้องใช้ build tool)
   เส้นทาง: #/  #/book/:id  #/done/:id  #/my  #/my/:id  #/admin  #/states
   ============================================================ */
(() => {
  'use strict';
  const C = window.LABQ_CONFIG || {};
  const API = window.API;
  const OPEN = C.OPEN_HOUR ?? 8, CLOSE = C.CLOSE_HOUR ?? 20;

  /* ---------- ตัวช่วยพื้นฐาน ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true" focusable="false"><use href="#i-${n}"/></svg>`;
  const pad = n => String(n).padStart(2, '0');
  const view = $('#view');

  const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const at = (ds, h) => { const d = parseDay(ds); d.setHours(h, 0, 0, 0); return d; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmtT = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtD = d => d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtDL = d => d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const overlap = (aS, aE, bS, bE) => aS < bE && bS < aE;

  function loadMe() { try { return JSON.parse(localStorage.getItem('labq.me')) || {}; } catch (e) { return {}; } }
  function saveMe(m) { S.me = m; try { localStorage.setItem('labq.me', JSON.stringify(m)); } catch (e) { /* ignore */ } }

  const S = {
    resources: [], bookings: [], loaded: false, me: loadMe(),
    filter: { q: '', kind: 'all', free: false },
    mine: null, myTab: 'active', lastDone: null,
    admin: null, adminList: [], adminTab: 'pending'
  };
  let F = {}; // สถานะฟอร์มจอง

  const ST = {
    pending:   { t: 'รออนุมัติ',   i: 'clock', c: 'st-pending' },
    approved:  { t: 'อนุมัติแล้ว', i: 'check', c: 'st-approved' },
    in_use:    { t: 'กำลังใช้งาน', i: 'play',  c: 'st-inuse' },
    returned:  { t: 'คืนแล้ว',     i: 'return', c: 'st-returned' },
    rejected:  { t: 'ไม่อนุมัติ',  i: 'x',     c: 'st-rejected' },
    cancelled: { t: 'ยกเลิกแล้ว',  i: 'ban',   c: 'st-cancelled' }
  };
  const badge = q => {
    const s = ST[q.status] || ST.pending;
    const label = q.status === 'returned' && q.kind === 'room' ? 'ใช้เสร็จแล้ว' : s.t;
    return `<span class="badge ${s.c}">${ic(s.i)}${label}</span>`;
  };
  const isOverdue = q => q.status === 'in_use' && new Date(q.end_at) < new Date();

  /* ---------- ข้อมูล / ตารางว่าง ---------- */
  const res = id => S.resources.find(r => r.id === id);
  async function loadData(force) {
    if (S.loaded && !force) return;
    const [r, b] = await Promise.all([API.listResources(), API.listBookings()]);
    S.resources = r; S.bookings = b; S.loaded = true;
  }
  async function refreshBookings() { S.bookings = await API.listBookings(); }

  const bookingsOf = id => S.bookings.filter(b => b.resource_id === id);
  function roomSlots(r, ds) {
    const now = new Date(), out = [];
    for (let h = OPEN; h < CLOSE; h++) {
      const s = at(ds, h), e = at(ds, h + 1);
      let state = 'free';
      if (e <= now) state = 'past';
      else if (bookingsOf(r.id).some(b => overlap(s, e, new Date(b.start_at), new Date(b.end_at)))) state = 'taken';
      out.push({ h, s, e, state });
    }
    return out;
  }
  function equipLeft(r, s, e) {
    const used = bookingsOf(r.id).filter(b => overlap(s, e, new Date(b.start_at), new Date(b.end_at))).reduce((a, b) => a + b.quantity, 0);
    return Math.max(0, r.stock_total - used);
  }
  function avail(r) {
    if (r.kind === 'room') {
      const n = roomSlots(r, toDateStr(new Date())).filter(s => s.state === 'free').length;
      if (n === 0) return { ok: false, n, tone: 'full', i: 'x', label: 'เต็มวันนี้' };
      return { ok: true, n, tone: n <= 2 ? 'low' : 'ok', i: n <= 2 ? 'alert' : 'check', label: `ว่างวันนี้ ${n} ช่วง` };
    }
    const now = new Date();
    const left = equipLeft(r, now, new Date(+now + 6e4));
    if (left === 0) return { ok: false, n: 0, tone: 'full', i: 'x', label: 'ถูกยืมหมดแล้ว' };
    return { ok: true, n: left, tone: left <= 1 ? 'low' : 'ok', i: left <= 1 ? 'alert' : 'check', label: `เหลือ ${left} จาก ${r.stock_total} ชิ้น` };
  }
  function period(r) {
    const s = new Date(r.start_at), e = new Date(r.end_at);
    if (r.kind === 'room') return `${fmtD(s)} · ${fmtT(s)}–${fmtT(e)} น.`;
    const days = Math.round((parseDay(toDateStr(e)) - parseDay(toDateStr(s))) / 864e5) + 1;
    return `ยืม ${fmtD(s)} → คืน ${fmtD(e)} (${days} วัน)`;
  }

  /* ---------- UI ย่อย ---------- */
  function toast(msg, type = 'ok') {
    const t = document.createElement('div');
    t.className = 'toast t-' + type;
    t.innerHTML = `${ic(type === 'err' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
    $('#toasts').append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 4200);
  }
  function setBusy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.html = btn.innerHTML; btn.setAttribute('aria-busy', 'true'); btn.disabled = true; btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${esc(label || 'กำลังดำเนินการ…')}`; }
    else { btn.removeAttribute('aria-busy'); btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
  }
  function dialog({ title, body = '', confirm = 'ยืนยัน', cancel = 'ยกเลิก', danger = false, ask = null }) {
    return new Promise(resolve => {
      const d = $('#dlg');
      d.setAttribute('aria-labelledby', 'dlg-t');
      d.innerHTML = `<form method="dialog" class="dlg-body">
        <h2 id="dlg-t">${esc(title)}</h2>
        <div class="dlg-text">${body}</div>
        ${ask ? `<div class="field"><label for="dlg-in">${esc(ask.label)}</label>
          <textarea id="dlg-in" rows="3" placeholder="${esc(ask.ph || '')}" aria-describedby="dlg-err"></textarea>
          <p class="field-error" id="dlg-err" hidden>${ic('alert')}<span>${esc(ask.error)}</span></p></div>` : ''}
        <div class="dlg-actions">
          <button class="btn" value="cancel" formnovalidate>${esc(cancel)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok" id="dlg-ok">${esc(confirm)}</button>
        </div></form>`;
      $('#dlg-ok', d).addEventListener('click', ev => {
        if (ask && !$('#dlg-in', d).value.trim()) {
          ev.preventDefault();
          $('#dlg-err', d).hidden = false;
          $('#dlg-in', d).setAttribute('aria-invalid', 'true');
          $('#dlg-in', d).focus();
        }
      });
      d.addEventListener('close', () => {
        const ok = d.returnValue === 'ok';
        resolve(ok ? (ask ? $('#dlg-in', d).value.trim() : true) : false);
      }, { once: true });
      d.returnValue = '';
      d.showModal();
    });
  }
  const emptyState = ({ icon = 'inbox', cls = '', title, text = '', tips = [], actions = '' }) => `
    <section class="state reveal" aria-labelledby="st-t">
      <div class="illu ${cls}">${ic(icon)}</div>
      <h1 id="st-t">${esc(title)}</h1>
      ${text ? `<p class="lead">${esc(text)}</p>` : ''}
      ${tips.length ? `<ul class="tips">${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <div class="btn-row">${actions}</div>
    </section>`;
  const skelCards = n => `<ul class="grid" aria-hidden="true">${Array.from({ length: n }, () => '<li><div class="skel card-s"></div></li>').join('')}</ul>`;

  function field({ id, label, type = 'text', ph = '', hint = '', val = '', mode = '', auto = '', max = '', err = '', req = true }) {
    return `<div class="field ${err ? 'has-err' : ''}" data-f="${id}">
      <label for="${id}">${label}${req ? '<span class="req" aria-hidden="true"> *</span>' : ' <span class="hint">(ไม่บังคับ)</span>'}</label>
      <input id="${id}" name="${id}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}" ${mode ? `inputmode="${mode}"` : ''} ${auto ? `autocomplete="${auto}"` : ''} ${max ? `maxlength="${max}"` : ''} ${req ? 'required' : ''} ${err ? 'aria-invalid="true"' : ''} aria-describedby="${id}-hint ${id}-err">
      <p class="hint" id="${id}-hint">${hint}</p>
      <p class="field-error" id="${id}-err" ${err ? '' : 'hidden'}>${err ? ic('alert') + '<span>' + esc(err) + '</span>' : ''}</p>
    </div>`;
  }

  function show(html, title) {
    view.onclick = view.onchange = view.oninput = view.onsubmit = null;
    view.innerHTML = `<div class="page">${html}</div>`;
    document.title = `${title} · LabQ`;
    window.scrollTo(0, 0);
    const h = $('h1', view);
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    updateNav();
  }
  function updateNav() {
    const h = location.hash || '#/';
    const key = h.startsWith('#/my') ? 'my' : h.startsWith('#/admin') ? 'admin' : h.startsWith('#/book') ? 'book' : 'home';
    document.body.dataset.route = key;
    $$('[data-nav]').forEach(a => {
      const on = a.dataset.nav === key || (key === 'book' && a.dataset.nav === 'home');
      on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
  }

  /* ============================================================
     หน้าจอที่ 1 : หน้าหลัก
     ============================================================ */
  async function renderHome(_, stale) {
    if (!S.loaded) show(`<h1 class="sr-only">กำลังโหลดข้อมูล</h1><p class="load-note"><span class="spin" aria-hidden="true"></span>กำลังโหลดห้องและอุปกรณ์…</p>${skelCards(6)}`, 'กำลังโหลด');
    await loadData();
    if (stale()) return;
    const rooms = S.resources.filter(r => r.kind === 'room');
    const eq = S.resources.filter(r => r.kind === 'equipment');
    const today = toDateStr(new Date());
    const roomsFree = rooms.filter(r => roomSlots(r, today).some(s => s.state === 'free')).length;
    const now = new Date(), soon = new Date(+now + 6e4);
    const eqReady = eq.reduce((a, r) => a + equipLeft(r, now, soon), 0);
    const eqTotal = eq.reduce((a, r) => a + r.stock_total, 0);
    const pop = S.resources.filter(r => r.popular);

    show(`
      <section class="hero" aria-labelledby="hero-t">
        <div>
          <span class="eyebrow">สำหรับนักศึกษา</span>
          <h1 id="hero-t">จองห้องแล็บ ยืมอุปกรณ์<br><mark>จบในไม่กี่แตะ</mark></h1>
          <p class="lead">เห็นช่วงเวลาว่างทันที ไม่ต้องเดินไปถามหลายจุด และตามสถานะคำขอได้จากมือถือ</p>
          <div class="cta-row">
            <button class="cta cta-a" type="button" data-kind="room"><span class="cta-ic">${ic('door')}</span><span><b>จองคิวใช้ห้อง</b><small>เลือกห้อง แล้วแตะช่วงเวลาที่ว่าง</small></span>${ic('chevron')}</button>
            <button class="cta cta-b" type="button" data-kind="equipment"><span class="cta-ic">${ic('box')}</span><span><b>ยืม-คืนอุปกรณ์</b><small>ดูจำนวนคงเหลือและระยะเวลายืม</small></span>${ic('chevron')}</button>
          </div>
        </div>
        <aside class="board" aria-label="สรุปภาพรวมวันนี้">
          <h2><span>วันนี้ที่ห้องแล็บ</span><span>${esc(fmtD(new Date()))}</span></h2>
          <div class="stat"><b>${roomsFree}<small>/${rooms.length}</small></b><span>ห้องที่ยังมีช่วงว่างให้จองวันนี้</span></div>
          <div class="stat"><b>${eqReady}<small>/${eqTotal}</small></b><span>ชิ้นอุปกรณ์พร้อมให้ยืมตอนนี้</span></div>
          <div class="stat"><b>${ic('ticket')}</b><span><a href="#/my">ดูสถานะคำขอของฉัน</a><br>ตามผลอนุมัติและแจ้งคืนได้ที่นี่</span></div>
        </aside>
      </section>

      <section aria-labelledby="pop-t">
        <div class="sec-title"><h2 id="pop-t">ยอดนิยมตอนนี้</h2></div>
        <div class="chips">${pop.map(r => `<a class="chip" href="#/book/${esc(r.id)}"><i aria-hidden="true">${esc(r.icon)}</i>${esc(r.name)}</a>`).join('')}</div>
      </section>

      <section id="browse" aria-labelledby="all-t">
        <div class="sec-title"><h2 id="all-t">ค้นหาและกรองรายการ</h2></div>
        <div class="toolbar" role="search">
          <div class="search">${ic('search')}<label class="sr-only" for="q">ค้นหาห้องหรืออุปกรณ์</label>
            <input id="q" type="search" placeholder="ค้นหา เช่น Arduino, E-301, กล้อง" value="${esc(S.filter.q)}" autocomplete="off"></div>
          <div class="seg" role="group" aria-label="ประเภท">
            ${[['all', 'ทั้งหมด'], ['room', 'ห้อง'], ['equipment', 'อุปกรณ์']].map(([k, t]) => `<button type="button" data-seg="${k}" aria-pressed="${S.filter.kind === k}">${t}</button>`).join('')}
          </div>
          <label class="switch"><input type="checkbox" id="free" ${S.filter.free ? 'checked' : ''}>เฉพาะที่ว่างตอนนี้</label>
        </div>
        <p class="count" id="count" aria-live="polite"></p>
        <div id="results"></div>
      </section>`, 'หน้าหลัก');
    renderResults();

    $('#q').oninput = e => { S.filter.q = e.target.value; renderResults(); };
    view.onchange = e => { if (e.target.id === 'free') { S.filter.free = e.target.checked; renderResults(); } };
    view.onclick = e => {
      const cta = e.target.closest('[data-kind]');
      if (cta) {
        S.filter.kind = cta.dataset.kind;
        $$('[data-seg]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.seg === S.filter.kind)));
        renderResults();
        $('#browse').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const seg = e.target.closest('[data-seg]');
      if (seg) {
        S.filter.kind = seg.dataset.seg;
        $$('[data-seg]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.seg === S.filter.kind)));
        renderResults();
      }
      if (e.target.closest('[data-action="clear"]')) {
        S.filter = { q: '', kind: 'all', free: false };
        $('#q').value = ''; $('#free').checked = false;
        $$('[data-seg]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.seg === 'all')));
        renderResults(); $('#q').focus();
      }
    };
  }

  function filtered() {
    const q = S.filter.q.trim().toLowerCase();
    return S.resources.filter(r =>
      (S.filter.kind === 'all' || r.kind === S.filter.kind) &&
      (!q || `${r.name} ${r.location || ''} ${r.description || ''}`.toLowerCase().includes(q)) &&
      (!S.filter.free || avail(r).ok));
  }
  function resourceCard(r, i) {
    const a = avail(r), room = r.kind === 'room';
    return `<li class="ticket reveal" style="--i:${Math.min(i, 10)}">
      <div class="t-top">
        <div class="t-head"><div class="t-ic" aria-hidden="true">${esc(r.icon)}</div>
          <div><h3>${esc(r.name)}</h3><p class="t-sub">${ic('pin')}${esc(r.location || '')}</p></div></div>
        <p class="t-desc">${esc(r.description || '')}</p>
        <div><span class="badge av-${a.tone}">${ic(a.i)}${esc(a.label)}</span></div>
      </div>
      <div class="perf" aria-hidden="true"></div>
      <div class="t-foot">
        <div class="metas">${room
          ? `<span>${ic('users')}${r.capacity} ที่นั่ง</span><span>${ic('clock')}ครั้งละ ≤ ${r.max_hours} ชม.</span>`
          : `<span>${ic('calendar')}ยืมได้ ≤ ${r.max_days} วัน</span>`}</div>
        <a class="btn btn-sm ${a.ok ? 'btn-primary' : ''}" href="#/book/${esc(r.id)}" aria-label="${room ? 'เลือกเวลาจอง' : 'ขอยืม'} ${esc(r.name)}">${a.ok ? (room ? 'เลือกเวลาจอง' : 'ขอยืมอุปกรณ์') : 'ดูวันอื่น'}${ic('chevron')}</a>
      </div>
    </li>`;
  }
  function renderResults() {
    const list = filtered();
    $('#count').textContent = `พบ ${list.length} รายการ`;
    $('#results').innerHTML = list.length
      ? `<ul class="grid">${list.map(resourceCard).join('')}</ul>`
      : emptyState({
        title: 'ไม่พบรายการที่ค้นหา',
        text: 'ลองปรับคำค้นหรือตัวกรองดูอีกครั้ง',
        tips: ['ตรวจตัวสะกด หรือใช้คำที่สั้นลง เช่น “Arduino”', 'ปิดตัวกรอง “เฉพาะที่ว่างตอนนี้” เพื่อดูรายการทั้งหมด', 'เลือกประเภทเป็น “ทั้งหมด”'],
        actions: `<button class="btn btn-primary" type="button" data-action="clear">ล้างตัวกรองทั้งหมด</button><a class="btn" href="#/">กลับหน้าหลัก</a>`
      }).replace('<h1 id="st-t">', '<h3 id="st-t">').replace('</h1>', '</h3>');
  }

  /* ============================================================
     หน้าจอที่ 2 : กรอกรายละเอียดการจอง/ยืม
     ============================================================ */
  async function renderBook(id, stale) {
    await loadData();
    await refreshBookings().catch(() => { });
    if (stale()) return;
    const r = res(id);
    if (!r) {
      show(emptyState({ title: 'ไม่พบรายการที่เลือก', text: 'รายการนี้อาจถูกปิดใช้งานหรือลิงก์ไม่ถูกต้อง', actions: '<a class="btn btn-primary" href="#/">กลับหน้าหลัก</a>' }), 'ไม่พบรายการ');
      return;
    }
    const room = r.kind === 'room', me = S.me || {};
    F = { date: toDateStr(new Date()), sel: null, days: 1, qty: 1, left: r.stock_total };
    const todayStr = toDateStr(new Date()), maxStr = toDateStr(addDays(new Date(), 30));

    show(`
      <a class="backlink" href="#/">${ic('arrow-left')}กลับหน้าหลัก</a>
      <h1>${room ? 'จองคิวใช้ห้อง' : 'ขอยืมอุปกรณ์'}</h1>
      <div class="book" style="margin-top:1rem">
        <aside>
          <div class="card info-card">
            <div class="t-head"><div class="t-ic" aria-hidden="true">${esc(r.icon)}</div>
              <div><h2 style="font-size:var(--fs-lg)">${esc(r.name)}</h2><p class="t-sub">${ic('pin')}${esc(r.location || '')}</p></div></div>
            <p class="t-sub" style="display:block">${esc(r.description || '')}</p>
            <div class="limit">${ic('info')}${room ? `จองได้ครั้งละไม่เกิน <b>${r.max_hours} ชั่วโมง</b> · ${r.capacity} ที่นั่ง` : `ยืมได้ไม่เกิน <b>${r.max_days} วัน</b> · ทั้งหมด ${r.stock_total} ชิ้น`}</div>
            ${!room ? `<p class="note" style="margin:0" id="left-info" aria-live="polite"></p>` : ''}
            <div><h3 style="font-size:var(--fs-md);margin-bottom:.4rem">เงื่อนไขการใช้งาน</h3>
              <ul class="rules">${(r.rules || []).map(x => `<li>${ic('check')}<span>${esc(x)}</span></li>`).join('')}</ul></div>
          </div>
          <div class="actionbar">
            <p class="sum" id="sum" aria-live="polite"></p>
            <button class="btn btn-primary btn-lg btn-block" type="submit" form="bookform" id="submitbtn">${room ? 'ยืนยันการจอง' : 'ยืนยันการขอยืม'}</button>
          </div>
        </aside>

        <form id="bookform" novalidate>
          <div id="errsum" class="errsum" role="alert" tabindex="-1" hidden></div>

          <section class="card step" aria-labelledby="s1">
            <span class="step-n" aria-hidden="true">01</span>
            <h2 id="s1">${room ? 'เลือกวันและช่วงเวลา' : 'เลือกวันที่ยืมและจำนวน'}</h2>
            <div class="field" data-f="date">
              <label for="date">${room ? 'วันที่ต้องการใช้ห้อง' : 'วันที่รับอุปกรณ์'}</label>
              <input id="date" name="date" type="date" min="${todayStr}" max="${maxStr}" value="${todayStr}" aria-describedby="date-hint date-err">
              <p class="hint" id="date-hint">จองล่วงหน้าได้สูงสุด 30 วัน</p>
              ${room ? `
              <div class="legend" aria-hidden="true"><span><i></i>ว่าง</span><span><i class="l-sel"></i>ที่เลือก</span><span><i class="l-taken"></i>ถูกจองแล้ว</span></div>
              <div class="slots" id="slots" role="group" aria-label="ช่วงเวลา"></div>
              <p class="hint">แตะช่วงเวลาที่ต้องการ แตะช่วงถัดไปเพื่อต่อเวลาได้ (ไม่เกิน ${r.max_hours} ชั่วโมง) แตะซ้ำเพื่อยกเลิกการเลือก</p>`
              : `
              <div class="stepper-row">
                <div><label id="days-l">ระยะเวลายืม (วัน)</label>
                  <div class="stepper" role="group" aria-labelledby="days-l">
                    <button type="button" data-step="days:-1" aria-label="ลดจำนวนวัน">${ic('minus')}</button><output id="days-out" aria-live="polite">1</output>
                    <button type="button" data-step="days:1" aria-label="เพิ่มจำนวนวัน">${ic('plus')}</button></div></div>
                <div><label id="qty-l">จำนวนชิ้น</label>
                  <div class="stepper" role="group" aria-labelledby="qty-l">
                    <button type="button" data-step="qty:-1" aria-label="ลดจำนวนชิ้น">${ic('minus')}</button><output id="qty-out" aria-live="polite">1</output>
                    <button type="button" data-step="qty:1" aria-label="เพิ่มจำนวนชิ้น">${ic('plus')}</button></div></div>
              </div>
              <p class="note" id="range-msg"></p>`}
              <p class="field-error" id="date-err" hidden></p>
            </div>
          </section>

          <section class="card step" aria-labelledby="s2">
            <span class="step-n" aria-hidden="true">02</span>
            <h2 id="s2">ข้อมูลผู้ขอ</h2>
            ${field({ id: 'student_id', label: 'รหัสนักศึกษา', ph: 'เช่น 6612345678', hint: 'ตัวเลข 8–10 หลัก ไม่ต้องใส่ขีดหรือเว้นวรรค', val: me.student_id || '', mode: 'numeric', auto: 'off', max: 10 })}
            ${field({ id: 'student_name', label: 'ชื่อ-นามสกุล', ph: 'เช่น สมหญิง ใจดี', hint: 'ใช้ชื่อจริงตามบัตรนักศึกษา', val: me.student_name || '', auto: 'name', max: 120 })}
            ${field({ id: 'phone', label: 'เบอร์โทรติดต่อ', type: 'tel', ph: 'เช่น 0812345678', hint: 'ให้ผู้ดูแลติดต่อกลับได้ถ้าจำเป็น (ตัวเลข 9–10 หลัก)', val: me.phone || '', mode: 'tel', auto: 'tel', max: 12, req: false })}
          </section>

          <section class="card step" aria-labelledby="s3">
            <span class="step-n" aria-hidden="true">03</span>
            <h2 id="s3">วัตถุประสงค์และยืนยัน</h2>
            <div class="field" data-f="purpose">
              <label for="purpose">นำไปใช้ทำอะไร<span class="req" aria-hidden="true"> *</span></label>
              <textarea id="purpose" name="purpose" required maxlength="500" placeholder="เช่น ทดลองวงจรขยายสัญญาณสำหรับรายวิชาอิเล็กทรอนิกส์ กลุ่มที่ 3" aria-describedby="purpose-hint purpose-err"></textarea>
              <p class="hint" id="purpose-hint">เขียนสั้น ๆ อย่างน้อย 10 ตัวอักษร เพื่อให้ผู้ดูแลอนุมัติได้เร็วขึ้น</p>
              <p class="field-error" id="purpose-err" hidden></p>
            </div>
            <div class="field" data-f="accept">
              <label class="check" for="accept"><input id="accept" name="accept" type="checkbox" aria-describedby="accept-err"><span>ฉันได้อ่านและยอมรับเงื่อนไขการใช้งานด้านซ้าย และรับผิดชอบหากอุปกรณ์/ห้องเสียหาย</span></label>
              <p class="field-error" id="accept-err" hidden></p>
            </div>
          </section>
        </form>
      </div>`, `${room ? 'จอง' : 'ยืม'} ${r.name}`);

    if (room) renderSlots(r); else updateEquip(r);
    updateSummary(r);
    const form = $('#bookform');

    view.onclick = e => {
      const slot = e.target.closest('.slot');
      if (slot && !slot.disabled) { pickSlot(r, +slot.dataset.i); return; }
      const st = e.target.closest('[data-step]');
      if (st) {
        const [k, d] = st.dataset.step.split(':'); const n = +d;
        if (k === 'days') F.days = Math.min(r.max_days, Math.max(1, F.days + n));
        if (k === 'qty') F.qty = Math.min(F.left, Math.max(1, F.qty + n));
        clearErr('date'); updateEquip(r); updateSummary(r); return;
      }
      const fo = e.target.closest('[data-focus]');
      if (fo) { e.preventDefault(); const t = document.getElementById(fo.dataset.focus); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.focus({ preventScroll: true }); } }
    };
    view.onchange = e => {
      if (e.target.id === 'date') {
        let v = e.target.value;
        if (!v || v < todayStr) v = todayStr; if (v > maxStr) v = maxStr;
        e.target.value = v; F.date = v; F.sel = null; clearErr('date');
        if (room) renderSlots(r); else updateEquip(r);
        updateSummary(r);
      }
    };
    view.oninput = e => { const f = e.target.closest('[data-f]'); if (f && e.target.id !== 'date') clearErr(f.dataset.f); };
    form.onsubmit = ev => submitBook(ev, r, form);
  }

  function renderSlots(r) {
    const slots = roomSlots(r, F.date);
    $('#slots').innerHTML = slots.map((s, i) => {
      const sel = F.sel && i >= F.sel.a && i <= F.sel.b;
      const st = sel ? 'sel' : s.state;
      const lab = { free: 'ว่าง', taken: 'เต็ม', past: 'ผ่านแล้ว', sel: 'เลือกแล้ว' }[st];
      const dis = st === 'taken' || st === 'past';
      return `<button type="button" class="slot s-${st}" data-i="${i}" ${dis ? 'disabled' : ''} aria-pressed="${!!sel}" aria-label="${pad(s.h)}:00 ถึง ${pad(s.h + 1)}:00 น. ${lab}"><span class="t">${pad(s.h)}:00</span><span class="l">${sel ? ic('check') : ''}${lab}</span></button>`;
    }).join('');
  }
  function pickSlot(r, i) {
    const max = r.max_hours || 3; let s = F.sel; clearErr('date');
    if (!s) s = { a: i, b: i };
    else if (i >= s.a && i <= s.b) s = s.a === s.b ? null : { a: i, b: i };
    else if (i === s.b + 1 || i === s.a - 1) {
      const na = Math.min(s.a, i), nb = Math.max(s.b, i);
      if (nb - na + 1 > max) { toast(`จองห้องนี้ได้ครั้งละไม่เกิน ${max} ชั่วโมง`, 'err'); s = { a: i, b: i }; } else s = { a: na, b: nb };
    } else s = { a: i, b: i };
    F.sel = s; renderSlots(r); updateSummary(r);
  }
  function equipRange() {
    const s = at(F.date, OPEN);
    const e = addDays(parseDay(F.date), F.days - 1); e.setHours(CLOSE, 0, 0, 0);
    return [s, e];
  }
  function updateEquip(r) {
    const [s, e] = equipRange(); const left = equipLeft(r, s, e);
    F.left = left;
    F.qty = left ? Math.min(Math.max(F.qty, 1), left) : 0;
    $('#days-out').textContent = F.days; $('#qty-out').textContent = F.qty;
    const b = n => $(`[data-step="${n}"]`);
    b('days:-1').disabled = F.days <= 1; b('days:1').disabled = F.days >= r.max_days;
    b('qty:-1').disabled = F.qty <= 1; b('qty:1').disabled = F.qty >= left;
    $('#range-msg').innerHTML = `รับอุปกรณ์ ${esc(fmtDL(s))} · <b>คืนภายใน ${esc(fmtD(e))} เวลา ${CLOSE}:00 น.</b>`;
    $('#left-info').innerHTML = left ? `ช่วงที่เลือกเหลือ <b>${left} ชิ้น</b>` : `<span style="color:var(--red-t);font-weight:600">${ic('alert')} ช่วงที่เลือกถูกยืมหมดแล้ว ลองเปลี่ยนวันที่</span>`;
  }
  function updateSummary(r) {
    const el = $('#sum');
    if (r.kind === 'room') {
      if (!F.sel) { el.innerHTML = `${ic('info')}<span>ยังไม่ได้เลือกช่วงเวลา แตะช่วงที่ว่างด้านบน</span>`; return; }
      const sl = roomSlots(r, F.date), s = sl[F.sel.a].s, e = sl[F.sel.b].e;
      el.innerHTML = `${ic('check')}<span>${esc(fmtD(s))} · <b>${fmtT(s)}–${fmtT(e)}</b> น. (${F.sel.b - F.sel.a + 1} ชม.)</span>`;
    } else {
      const [s, e] = equipRange();
      el.innerHTML = F.qty ? `${ic('check')}<span><b>${F.qty}</b> ชิ้น · ${esc(fmtD(s))} → ${esc(fmtD(e))}</span>` : `${ic('alert')}<span>ช่วงนี้ไม่มีอุปกรณ์เหลือ</span>`;
    }
  }

  function clearErr(k) {
    const f = $(`[data-f="${k}"]`); if (!f) return;
    f.classList.remove('has-err');
    const p = $(`#${k}-err`, f); if (p) { p.hidden = true; p.innerHTML = ''; }
    const i = $(`#${k}`, f); if (i) i.removeAttribute('aria-invalid');
  }
  function validate(form, r) {
    const e = {}, v = n => (form.elements[n]?.value || '').trim();
    if (r.kind === 'room' && !F.sel) e.date = 'ยังไม่ได้เลือกช่วงเวลา กรุณาแตะช่วงที่ว่างอย่างน้อย 1 ช่วง';
    if (r.kind === 'equipment' && F.qty < 1) e.date = 'ช่วงที่เลือกไม่มีอุปกรณ์เหลือ กรุณาเปลี่ยนวันที่หรือจำนวนวัน';
    if (!v('student_id')) e.student_id = 'กรุณากรอกรหัสนักศึกษา';
    else if (!/^\d{8,10}$/.test(v('student_id'))) e.student_id = 'รหัสนักศึกษาต้องเป็นตัวเลข 8–10 หลัก เช่น 6612345678 (ไม่ต้องใส่ขีดหรือเว้นวรรค)';
    if (!v('student_name')) e.student_name = 'กรุณากรอกชื่อ-นามสกุล';
    else if (v('student_name').split(/\s+/).filter(Boolean).length < 2) e.student_name = 'กรุณากรอกทั้งชื่อและนามสกุล เช่น สมหญิง ใจดี';
    const ph = v('phone').replace(/[\s-]/g, '');
    if (ph && !/^0\d{8,9}$/.test(ph)) e.phone = 'เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก เช่น 0812345678';
    if (v('purpose').length < 10) e.purpose = v('purpose') ? 'กรุณาอธิบายให้ละเอียดขึ้นอีกเล็กน้อย (อย่างน้อย 10 ตัวอักษร)' : 'กรุณาบอกว่าจะนำไปใช้ทำอะไร';
    if (!form.elements.accept.checked) e.accept = 'กรุณาติ๊กยอมรับเงื่อนไขการใช้งานก่อนส่งคำขอ';
    return e;
  }
  function showErrors(form, errs) {
    $$('[data-f]', form).forEach(f => clearErr(f.dataset.f));
    const items = [];
    for (const [k, m] of Object.entries(errs)) {
      if (k === '_top') { items.push(`<li>${esc(m)}</li>`); continue; }
      const f = $(`[data-f="${k}"]`, form);
      if (f) {
        f.classList.add('has-err');
        const p = $(`#${k}-err`, f); p.innerHTML = `${ic('alert')}<span>${esc(m)}</span>`; p.hidden = false;
        const inp = $(`#${k}`, f); if (inp) inp.setAttribute('aria-invalid', 'true');
      }
      items.push(`<li><a href="#" data-focus="${k}">${esc(m)}</a></li>`);
    }
    const box = $('#errsum'); const only = items.length === 1 && errs._top;
    box.innerHTML = `<h2>${ic('alert')}${only ? 'ส่งคำขอไม่สำเร็จ' : `กรุณาแก้ไข ${items.length} จุดก่อนส่งคำขอ`}</h2><ul>${items.join('')}</ul>`;
    box.hidden = false; box.focus({ preventScroll: true }); box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  async function submitBook(ev, r, form) {
    ev.preventDefault();
    const errs = validate(form, r);
    if (Object.keys(errs).length) { showErrors(form, errs); return; }
    $('#errsum').hidden = true;
    let start, end;
    if (r.kind === 'room') { const sl = roomSlots(r, F.date); start = sl[F.sel.a].s; end = sl[F.sel.b].e; } else [start, end] = equipRange();
    const val = n => form.elements[n].value.trim();
    const payload = {
      resource_id: r.id, student_id: val('student_id'), student_name: val('student_name').replace(/\s+/g, ' '),
      phone: val('phone').replace(/[\s-]/g, ''), purpose: val('purpose'),
      start_at: start.toISOString(), end_at: end.toISOString(), quantity: r.kind === 'room' ? 1 : F.qty
    };
    const btn = $('#submitbtn'); setBusy(btn, true, 'กำลังส่งคำขอ…');
    try {
      const rec = await API.createRequest(payload);
      saveMe({ student_id: payload.student_id, student_name: payload.student_name, phone: payload.phone });
      S.lastDone = rec; S.mine = null;
      await refreshBookings().catch(() => { });
      location.hash = '#/done/' + rec.id;
    } catch (ex) {
      setBusy(btn, false);
      if (ex.code === 'OFFLINE') {
        showErrors(form, { _top: 'ส่งคำขอไม่สำเร็จเพราะสัญญาณอินเทอร์เน็ตขาดหาย ข้อมูลที่กรอกไว้ยังอยู่ครบ กดส่งอีกครั้งเมื่อกลับมาออนไลน์' });
      } else {
        await refreshBookings().catch(() => { });
        if (r.kind === 'room') { F.sel = null; renderSlots(r); } else updateEquip(r);
        updateSummary(r);
        showErrors(form, { _top: ex.message + (ex.code === 'CONFLICT' ? ' (อัปเดตตารางล่าสุดให้แล้ว)' : '') });
      }
    }
  }

  /* ---------- ส่งสำเร็จ ---------- */
  async function renderDone(id, stale) {
    await loadData(); if (stale()) return;
    let q = S.lastDone && S.lastDone.id === id ? S.lastDone : null;
    if (!q) { location.hash = '#/my'; return; }
    const r = res(q.resource_id) || {};
    show(`<div class="donepage">
      <div class="ticket reveal"><div class="stamp" aria-hidden="true">ส่งแล้ว</div>
        <div class="done-in">
          <span class="eyebrow" style="justify-self:start">คำขอ #${esc(q.id.slice(0, 6).toUpperCase())}</span>
          <h1>ส่งคำขอเรียบร้อยแล้ว</h1>
          <dl class="kv">
            <div><dt>รายการ</dt><dd>${esc(r.icon || '')} ${esc(r.name || '')}</dd></div>
            <div><dt>ช่วงเวลา</dt><dd>${esc(period(q))}</dd></div>
            ${q.kind === 'equipment' ? `<div><dt>จำนวน</dt><dd>${q.quantity} ชิ้น</dd></div>` : ''}
            <div><dt>ผู้ขอ</dt><dd>${esc(q.student_name)} (${esc(q.student_id)})</dd></div>
            <div><dt>สถานะ</dt><dd>${badge(q)}</dd></div>
          </dl>
        </div>
        <div class="perf" aria-hidden="true"></div>
        <ol class="next" aria-label="ขั้นตอนต่อไป">
          <li><span><b>รอผู้ดูแลอนุมัติ</b><br>ปกติภายใน 1 วันทำการ ดูผลได้ที่ “คำขอของฉัน”</span></li>
          <li><span><b>${q.kind === 'room' ? 'ไปที่ห้องตามเวลา' : 'รับอุปกรณ์ตามวันที่เลือก'}</b><br>แสดงบัตรนักศึกษากับผู้ดูแล</span></li>
          <li><span><b>${q.kind === 'room' ? 'เก็บห้องให้เรียบร้อย' : 'คืนอุปกรณ์ภายในกำหนด'}</b><br>กด “แจ้ง${q.kind === 'room' ? 'ใช้เสร็จ' : 'คืน'}” ในหน้าคำขอเมื่อเสร็จ</span></li>
        </ol>
      </div>
      <div class="btn-row" style="display:grid;gap:12px;margin-top:20px">
        <a class="btn btn-primary btn-lg" href="#/my/${esc(q.id)}">ดูสถานะคำขอนี้</a>
        <a class="btn btn-ghost" href="#/">กลับหน้าหลัก</a>
      </div></div>`, 'ส่งคำขอเรียบร้อย');
  }

  /* ============================================================
     หน้าจอที่ 3 : คำขอของฉัน + รายละเอียด
     ============================================================ */
  async function loadMine() { S.mine = await API.myRequests(S.me.student_id); return S.mine; }
  const groups = {
    active: q => ['pending', 'approved', 'in_use'].includes(q.status),
    done: q => ['returned', 'rejected', 'cancelled'].includes(q.status),
    all: () => true
  };

  async function renderMy(_, stale) {
    if (!S.me || !S.me.student_id) {
      show(`<h1>คำขอของฉัน</h1><p class="lead" style="margin:.6rem 0 1.2rem">กรอกรหัสนักศึกษาเพื่อดูสถานะคำขอจอง/ยืมของคุณ</p>
        <form class="card login" id="whoform" novalidate style="margin:0">
          ${field({ id: 'student_id', label: 'รหัสนักศึกษา', ph: 'เช่น 6612345678', hint: 'ตัวเลข 8–10 หลัก ระบบจะจดจำไว้ในเครื่องนี้', mode: 'numeric', auto: 'off', max: 10 })}
          <button class="btn btn-primary btn-block" type="submit">ดูคำขอของฉัน</button>
          ${API.mode === 'demo' ? `<button class="btn btn-ghost btn-block" type="button" data-demo-id style="margin-top:.6rem">ใช้บัญชีตัวอย่าง (6612345678)</button>` : ''}
        </form>`, 'คำขอของฉัน');
      view.onsubmit = ev => {
        ev.preventDefault(); const v = $('#student_id').value.trim();
        if (!/^\d{8,10}$/.test(v)) {
          const f = $('[data-f="student_id"]'); f.classList.add('has-err');
          const p = $('#student_id-err'); p.innerHTML = ic('alert') + '<span>รหัสนักศึกษาต้องเป็นตัวเลข 8–10 หลัก เช่น 6612345678</span>'; p.hidden = false;
          $('#student_id').setAttribute('aria-invalid', 'true'); $('#student_id').focus(); return;
        }
        saveMe({ ...S.me, student_id: v }); route();
      };
      view.onclick = e => { if (e.target.closest('[data-demo-id]')) { saveMe({ student_id: '6612345678', student_name: 'สมหญิง ใจดี', phone: '0812345678' }); route(); } };
      return;
    }
    show(`<h1>คำขอของฉัน</h1><p class="load-note"><span class="spin" aria-hidden="true"></span>กำลังโหลดคำขอ…</p>${skelCards(3)}`, 'คำขอของฉัน');
    await loadData(); await loadMine(); if (stale()) return;
    drawMy();
  }
  function drawMy() {
    const list = S.mine || [];
    const cnt = k => list.filter(groups[k]).length;
    const tabs = [['active', 'กำลังดำเนินการ'], ['done', 'เสร็จสิ้น'], ['all', 'ทั้งหมด']];
    const items = list.filter(groups[S.myTab]);
    show(`
      <div class="admin-top"><div><h1>คำขอของฉัน</h1><p class="t-sub" style="margin-top:.3rem">${ic('users')}${esc(S.me.student_name || '')} · รหัส ${esc(S.me.student_id)}</p></div>
        <button class="btn btn-sm" type="button" data-action="switch">เปลี่ยนรหัสนักศึกษา</button></div>
      <div class="tabs" role="group" aria-label="กรองตามสถานะ">${tabs.map(([k, t]) => `<button type="button" data-tab="${k}" aria-pressed="${S.myTab === k}">${t}<span class="n">${cnt(k)}</span></button>`).join('')}</div>
      <div id="mylist">${items.length ? `<ul class="list">${items.map(myCard).join('')}</ul>` : emptyState({
        icon: 'inbox', title: S.myTab === 'active' ? 'ไม่มีรายการค้างส่งหรือรอดำเนินการ' : 'ยังไม่มีรายการในหมวดนี้',
        text: S.myTab === 'active' ? 'เมื่อคุณส่งคำขอจองหรือยืม รายการจะมาแสดงที่นี่' : 'ลองดูหมวด “ทั้งหมด” หรือไปจองห้อง/ยืมอุปกรณ์ได้เลย',
        tips: ['รายการที่คืนแล้วหรือถูกยกเลิกจะอยู่ในหมวด “เสร็จสิ้น”'],
        actions: '<a class="btn btn-primary" href="#/">กลับไปหน้าหลัก</a>'
      }).replace('<h1 id="st-t">', '<h2 id="st-t">').replace('</h1>', '</h2>')}</div>`, 'คำขอของฉัน');
    view.onclick = e => {
      const t = e.target.closest('[data-tab]');
      if (t) { S.myTab = t.dataset.tab; drawMy(); return; }
      if (e.target.closest('[data-action="switch"]')) { saveMe({}); S.mine = null; route(); }
    };
  }
  function myCard(q, i) {
    const r = res(q.resource_id) || { name: 'รายการที่ถูกลบ', icon: '📦' };
    return `<li class="reveal" style="--i:${Math.min(i, 10)}"><a class="ticket req" href="#/my/${esc(q.id)}">
      <div class="t-ic" aria-hidden="true">${esc(r.icon)}</div>
      <div class="body"><h3>${esc(r.name)}</h3><span class="t-sub mono">${esc(period(q))}</span>
        <span>${badge(q)} ${isOverdue(q) ? `<span class="badge av-full">${ic('alert')}เลยกำหนดคืน</span>` : ''} ${q.return_reported && q.status === 'in_use' ? `<span class="badge av-ok">${ic('return')}แจ้งคืนแล้ว</span>` : ''}</span></div>
      ${ic('chevron')}</a></li>`;
  }

  async function renderDetail(id, stale) {
    if (!S.me || !S.me.student_id) { location.hash = '#/my'; return; }
    show(`<h1 class="sr-only">กำลังโหลด</h1><p class="load-note"><span class="spin" aria-hidden="true"></span>กำลังโหลดรายละเอียด…</p>${skelCards(1)}`, 'กำลังโหลด');
    await loadData(); if (!S.mine) await loadMine(); if (stale()) return;
    drawDetail(id);
  }
  function drawDetail(id) {
    const q = (S.mine || []).find(x => x.id === id);
    if (!q) {
      show(emptyState({ title: 'ไม่พบคำขอนี้', text: 'คำขออาจไม่ใช่ของรหัสนักศึกษานี้ หรือถูกลบไปแล้ว', actions: '<a class="btn btn-primary" href="#/my">กลับไปคำขอของฉัน</a>' }), 'ไม่พบคำขอ');
      return;
    }
    const r = res(q.resource_id) || { name: 'รายการที่ถูกลบ', icon: '📦', rules: [] }, room = q.kind === 'room';
    const flow = [['pending', 'ส่งคำขอแล้ว', 'รอผู้ดูแลตรวจสอบ'], ['approved', 'อนุมัติแล้ว', room ? 'ไปที่ห้องตามเวลา' : 'รับอุปกรณ์ตามวันที่เลือก'], ['in_use', room ? 'กำลังใช้ห้อง' : 'กำลังใช้งานอุปกรณ์', 'แจ้งเมื่อใช้เสร็จ'], ['returned', room ? 'ใช้เสร็จแล้ว' : 'คืนแล้ว', 'ผู้ดูแลตรวจรับเรียบร้อย']];
    const order = ['pending', 'approved', 'in_use', 'returned'];
    let steps;
    if (q.status === 'rejected') steps = [{ ...flow[0], s: 'done' }, { t: 'ไม่อนุมัติ', d: q.admin_note || 'ผู้ดูแลไม่อนุมัติคำขอนี้', s: 'bad', i: 'x' }];
    else if (q.status === 'cancelled') steps = [{ ...flow[0], s: 'done' }, { t: 'ยกเลิกคำขอแล้ว', d: 'คุณยกเลิกคำขอนี้', s: 'bad', i: 'ban' }];
    else {
      const cur = order.indexOf(q.status);
      steps = flow.map((f, k) => ({ t: f[1], d: f[2], s: k < cur ? 'done' : k === cur ? (q.status === 'returned' ? 'done' : 'now') : '', i: ['clock', 'check', 'play', 'return'][k] }));
    }
    const tl = steps.map((s, k) => `<li class="${s.s}"><span class="dot">${ic(s.i || (s.s === 'done' ? 'check' : ['clock', 'check', 'play', 'return'][k]))}</span><span><b>${esc(s.t || s[1])}</b><small>${esc(s.d || s[2] || '')}</small></span></li>`).join('');

    let actions = '';
    if (['pending', 'approved'].includes(q.status)) actions = `<button class="btn btn-danger btn-block" data-action="cancel" type="button">${ic('ban')}ยกเลิกคำขอนี้</button>`;
    if (q.status === 'in_use') actions = q.return_reported
      ? `<div class="callout good">${ic('check')}<span>แจ้ง${room ? 'ใช้เสร็จ' : 'คืน'}แล้ว รอผู้ดูแลตรวจรับ${room ? 'ห้อง' : 'อุปกรณ์'}</span></div>`
      : `<button class="btn btn-primary btn-lg btn-block" data-action="report" type="button">${ic('return')}แจ้ง${room ? 'ใช้ห้องเสร็จแล้ว' : 'คืนอุปกรณ์'}</button>`;
    if (['rejected', 'cancelled'].includes(q.status)) actions = `<a class="btn btn-primary btn-block" href="#/book/${esc(q.resource_id)}">${ic('refresh')}ส่งคำขอใหม่</a>`;
    if (q.status === 'returned') actions = `<a class="btn btn-block" href="#/book/${esc(q.resource_id)}">จอง/ยืมอีกครั้ง</a>`;

    show(`
      <a class="backlink" href="#/my">${ic('arrow-left')}กลับไปคำขอของฉัน</a>
      <div class="detail">
        <div class="ticket reveal">
          <div class="t-top">
            <div class="t-head"><div class="t-ic" aria-hidden="true">${esc(r.icon)}</div><div><span class="eyebrow">#${esc(q.id.slice(0, 6).toUpperCase())}</span><h1 style="font-size:var(--fs-xl)">${esc(r.name)}</h1></div></div>
            <div>${badge(q)} ${isOverdue(q) ? `<span class="badge av-full">${ic('alert')}เลยกำหนดคืน</span>` : ''}</div>
          </div>
          <div class="perf" aria-hidden="true"></div>
          <div class="t-top"><dl class="kv">
            <div><dt>ช่วงเวลา</dt><dd>${esc(period(q))}</dd></div>
            ${!room ? `<div><dt>จำนวน</dt><dd>${q.quantity} ชิ้น</dd></div>` : ''}
            <div><dt>สถานที่</dt><dd>${esc(r.location || '-')}</dd></div>
            <div><dt>วัตถุประสงค์</dt><dd>${esc(q.purpose)}</dd></div>
            <div><dt>ผู้ขอ</dt><dd>${esc(q.student_name)} (${esc(q.student_id)})</dd></div>
            <div><dt>ส่งเมื่อ</dt><dd>${esc(new Date(q.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }))}</dd></div>
          </dl>
          ${q.status === 'rejected' && q.admin_note ? `<div class="callout bad">${ic('alert')}<span><b>เหตุผลที่ไม่อนุมัติ:</b> ${esc(q.admin_note)}</span></div>` : ''}</div>
        </div>
        <div class="card reveal" style="--i:2"><h2 style="font-size:var(--fs-lg);margin-bottom:1rem">ความคืบหน้า</h2>
          <ol class="timeline">${tl}</ol><div class="actions">${actions}</div></div>
      </div>`, `คำขอ ${r.name}`);

    view.onclick = async e => {
      const b = e.target.closest('[data-action]'); if (!b) return;
      const a = b.dataset.action;
      if (a === 'cancel') {
        const ok = await dialog({ title: 'ยกเลิกคำขอนี้ใช่ไหม?', body: `<p>${esc(r.name)}<br>${esc(period(q))}</p><p>เมื่อยกเลิกแล้วจะย้อนกลับไม่ได้ ต้องส่งคำขอใหม่</p>`, confirm: 'ยืนยันยกเลิกคำขอ', cancel: 'ไม่ยกเลิก', danger: true });
        if (ok) await doAction(q, 'cancel', b, 'ยกเลิกคำขอเรียบร้อยแล้ว');
      }
      if (a === 'report') {
        const ok = await dialog({ title: room ? 'แจ้งว่าใช้ห้องเสร็จแล้ว?' : 'แจ้งว่านำอุปกรณ์มาคืนแล้ว?', body: `<p>${room ? 'กรุณาเก็บห้องให้เรียบร้อยก่อนแจ้ง' : 'กรุณานำอุปกรณ์ไปส่งคืนที่ผู้ดูแลก่อนกดยืนยัน'}</p>`, confirm: 'ยืนยันการแจ้ง', cancel: 'ยังไม่แจ้ง' });
        if (ok) await doAction(q, 'report_return', b, 'ส่งแจ้งเรียบร้อย รอผู้ดูแลตรวจรับ');
      }
    };
  }
  async function doAction(q, action, btn, okMsg) {
    setBusy(btn, true, 'กำลังดำเนินการ…');
    try {
      const upd = await API.studentAction(q.id, S.me.student_id, action);
      S.mine = S.mine.map(x => x.id === q.id ? { ...x, ...upd } : x);
      await refreshBookings().catch(() => { });
      toast(okMsg); drawDetail(q.id);
    } catch (ex) {
      setBusy(btn, false);
      toast(ex.code === 'OFFLINE' ? 'สัญญาณขาดหาย ลองใหม่อีกครั้งเมื่อกลับมาออนไลน์' : ex.message, 'err');
    }
  }

  /* ============================================================
     หน้าจอผู้ดูแล (เหมาะกับจอคอมพิวเตอร์)
     ============================================================ */
  async function renderAdmin(_, stale) {
    show(`<h1 class="sr-only">กำลังโหลด</h1><p class="load-note"><span class="spin" aria-hidden="true"></span>กำลังตรวจสอบสิทธิ์…</p>`, 'ผู้ดูแล');
    await loadData(); const sess = await API.adminSession(); if (stale()) return;
    if (!sess) return drawLogin();
    S.admin = sess;
    S.adminList = await API.adminList(); if (stale()) return;
    drawAdmin();
  }
  function drawLogin() {
    show(`<h1>เข้าสู่ระบบผู้ดูแล</h1>
      <form class="card login" id="loginform" novalidate>
        <div id="errsum" class="errsum" role="alert" tabindex="-1" hidden></div>
        ${API.mode === 'demo'
        ? `<p class="callout" style="margin-bottom:1rem">${ic('info')}<span>โหมดสาธิต: ยังไม่ได้เชื่อม Supabase กดปุ่มด้านล่างเพื่อทดลองมุมมองผู้ดูแล</span></p>`
        : `${field({ id: 'email', label: 'อีเมลผู้ดูแล', type: 'email', ph: 'admin@school.ac.th', auto: 'username' })}
           ${field({ id: 'password', label: 'รหัสผ่าน', type: 'password', ph: '••••••••', auto: 'current-password' })}`}
        <button class="btn btn-primary btn-block btn-lg" type="submit" id="loginbtn">${ic('shield')}เข้าสู่ระบบ</button>
      </form>`, 'เข้าสู่ระบบผู้ดูแล');
    view.onsubmit = async ev => {
      ev.preventDefault();
      const btn = $('#loginbtn'), box = $('#errsum'); box.hidden = true;
      const email = $('#email')?.value.trim(), pw = $('#password')?.value;
      if (API.mode === 'live' && (!email || !pw)) { box.innerHTML = `<h2>${ic('alert')}กรุณากรอกอีเมลและรหัสผ่าน</h2>`; box.hidden = false; box.focus(); return; }
      setBusy(btn, true, 'กำลังเข้าสู่ระบบ…');
      try { await API.adminLogin(email, pw); route(); }
      catch (ex) { setBusy(btn, false); box.innerHTML = `<h2>${ic('alert')}${esc(ex.code === 'OFFLINE' ? 'สัญญาณอินเทอร์เน็ตขาดหาย ลองใหม่อีกครั้ง' : ex.message)}</h2>`; box.hidden = false; box.focus(); }
    };
  }
  const adminTabs = [['pending', 'รออนุมัติ', q => q.status === 'pending'], ['handover', 'รอส่งมอบ', q => q.status === 'approved'], ['inuse', 'กำลังใช้งาน / รอรับคืน', q => q.status === 'in_use'], ['all', 'ทั้งหมด', () => true]];
  function drawAdmin() {
    const L = S.adminList, cnt = f => L.filter(f).length;
    const tab = adminTabs.find(t => t[0] === S.adminTab) || adminTabs[0];
    let items = L.filter(tab[2]);
    if (S.adminTab === 'inuse') items = items.sort((a, b) => (b.return_reported - a.return_reported) || (new Date(a.end_at) - new Date(b.end_at)));
    show(`
      <div class="admin-top"><div><h1>งานของผู้ดูแล</h1><p class="t-sub" style="margin-top:.3rem">${ic('shield')}${esc(S.admin.email)}</p></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-sm" data-action="refresh" type="button">${ic('refresh')}รีเฟรช</button><button class="btn btn-sm" data-action="logout" type="button">${ic('logout')}ออกจากระบบ</button></div></div>
      <div class="kpis">
        <div class="kpi"><b>${cnt(q => q.status === 'pending')}</b><span>รออนุมัติ</span></div>
        <div class="kpi"><b>${cnt(q => q.status === 'approved')}</b><span>รอส่งมอบ</span></div>
        <div class="kpi"><b>${cnt(q => q.status === 'in_use')}</b><span>กำลังใช้งาน</span></div>
        <div class="kpi"><b>${cnt(q => q.status === 'in_use' && q.return_reported)}</b><span>แจ้งคืนแล้ว รอตรวจรับ</span></div>
      </div>
      <div class="tabs" role="group" aria-label="กรองงาน">${adminTabs.map(([k, t, f]) => `<button type="button" data-atab="${k}" aria-pressed="${S.adminTab === k}">${t}<span class="n">${cnt(f)}</span></button>`).join('')}</div>
      ${items.length ? `<div class="admin-head" aria-hidden="true"><span>นักศึกษา</span><span>รายการ</span><span>ช่วงเวลา</span><span>วัตถุประสงค์</span><span>สถานะ / ดำเนินการ</span></div>
      <ul class="admin-list">${items.map(adminRow).join('')}</ul>` : emptyState({ icon: 'check', cls: 'ok', title: 'ไม่มีงานค้างในหมวดนี้', text: 'เมื่อมีคำขอใหม่ จะแสดงที่นี่ กด “รีเฟรช” เพื่ออัปเดตล่าสุด', actions: '<button class="btn btn-primary" data-action="refresh" type="button">รีเฟรช</button>' }).replace('<h1 id="st-t">', '<h2 id="st-t">').replace('</h1>', '</h2>')}`, 'งานของผู้ดูแล');

    view.onclick = async e => {
      const t = e.target.closest('[data-atab]'); if (t) { S.adminTab = t.dataset.atab; drawAdmin(); return; }
      const b = e.target.closest('[data-action]'); if (!b) return;
      const a = b.dataset.action;
      if (a === 'refresh') { setBusy(b, true, 'กำลังโหลด…'); try { S.adminList = await API.adminList(); drawAdmin(); toast('อัปเดตรายการล่าสุดแล้ว'); } catch (ex) { setBusy(b, false); toast(ex.code === 'OFFLINE' ? 'สัญญาณขาดหาย' : ex.message, 'err'); } return; }
      if (a === 'logout') { await API.adminLogout(); S.admin = null; route(); return; }
      const q = S.adminList.find(x => x.id === b.dataset.id); if (!q) return;
      const r = res(q.resource_id) || { name: 'รายการที่ถูกลบ' };
      const who = `<p><b>${esc(q.student_name)}</b> (${esc(q.student_id)})<br>${esc(r.name)}${q.kind === 'equipment' ? ` × ${q.quantity}` : ''}<br>${esc(period(q))}</p>`;
      if (a === 'approve') { if (await dialog({ title: 'อนุมัติคำขอนี้?', body: who, confirm: 'อนุมัติ' })) await adminSet(q, 'approved', undefined, b, 'อนุมัติแล้ว'); }
      if (a === 'reject') {
        const note = await dialog({ title: 'ไม่อนุมัติคำขอนี้', body: who, confirm: 'ยืนยันไม่อนุมัติ', danger: true, ask: { label: 'เหตุผล (นักศึกษาจะเห็นข้อความนี้)', ph: 'เช่น ห้องถูกสงวนไว้สำหรับการเรียนการสอน', error: 'กรุณาระบุเหตุผลสั้น ๆ เพื่อให้นักศึกษาแก้ไขได้' } });
        if (note) await adminSet(q, 'rejected', note, b, 'บันทึกการไม่อนุมัติแล้ว');
      }
      if (a === 'handover') { if (await dialog({ title: q.kind === 'room' ? 'เปิดห้องให้เริ่มใช้งาน?' : 'ส่งมอบอุปกรณ์ให้นักศึกษา?', body: who + '<p>ตรวจบัตรนักศึกษาและสภาพก่อนส่งมอบ</p>', confirm: 'ยืนยันส่งมอบ' })) await adminSet(q, 'in_use', undefined, b, 'เปลี่ยนสถานะเป็นกำลังใช้งานแล้ว'); }
      if (a === 'receive') { if (await dialog({ title: q.kind === 'room' ? 'ตรวจห้องเรียบร้อยแล้ว?' : 'ตรวจสภาพและรับคืนอุปกรณ์?', body: who, confirm: 'ยืนยันรับคืน' })) await adminSet(q, 'returned', undefined, b, 'บันทึกการรับคืนแล้ว'); }
    };
  }
  function adminRow(q, i) {
    const r = res(q.resource_id) || { name: 'รายการที่ถูกลบ', icon: '📦' };
    const btn = (a, txt, cls = '') => `<button class="btn btn-sm ${cls}" data-action="${a}" data-id="${esc(q.id)}" type="button">${txt}</button>`;
    let ops = '';
    if (q.status === 'pending') ops = btn('approve', `${ic('check')}อนุมัติ`, 'btn-primary') + btn('reject', `${ic('x')}ไม่อนุมัติ`, 'btn-danger');
    if (q.status === 'approved') ops = btn('handover', `${ic('play')}ส่งมอบ / เริ่มใช้`, 'btn-primary');
    if (q.status === 'in_use') ops = btn('receive', `${ic('return')}รับคืนแล้ว`, 'btn-primary');
    return `<li class="arow reveal" style="--i:${Math.min(i, 8)}">
      <div class="who"><span class="lab">นักศึกษา</span><b>${esc(q.student_name)}</b><span class="mono">${esc(q.student_id)}</span>${q.phone ? `<br><span class="t-sub">${esc(q.phone)}</span>` : ''}</div>
      <div class="what"><span class="lab">รายการ</span><b>${esc(r.icon)} ${esc(r.name)}</b>${q.kind === 'equipment' ? `<span class="t-sub">จำนวน ${q.quantity} ชิ้น</span>` : ''}</div>
      <div><span class="lab">ช่วงเวลา</span><span class="mono">${esc(period(q))}</span></div>
      <div class="purpose"><span class="lab">วัตถุประสงค์</span>${esc(q.purpose)}${q.admin_note ? `<br><span class="t-sub">หมายเหตุ: ${esc(q.admin_note)}</span>` : ''}</div>
      <div><span class="lab">สถานะ</span>${badge(q)} ${isOverdue(q) ? `<span class="badge av-full">${ic('alert')}เลยกำหนด</span>` : ''} ${q.return_reported && q.status === 'in_use' ? `<span class="badge av-ok">${ic('return')}แจ้งคืนแล้ว</span>` : ''}
        <div class="ops" style="margin-top:.6rem">${ops}</div></div></li>`;
  }
  async function adminSet(q, status, note, btn, okMsg) {
    setBusy(btn, true, 'กำลังบันทึก…');
    try {
      const upd = await API.adminSetStatus(q.id, status, note);
      S.adminList = S.adminList.map(x => x.id === q.id ? { ...x, ...upd } : x);
      await refreshBookings().catch(() => { });
      toast(okMsg); drawAdmin();
    } catch (ex) { setBusy(btn, false); toast(ex.code === 'OFFLINE' ? 'สัญญาณขาดหาย ยังไม่ได้บันทึก ลองใหม่อีกครั้ง' : ex.message, 'err'); }
  }

  /* ============================================================
     หน้าจอที่ 4 : สถานะพิเศษและข้อผิดพลาด (หน้าตัวอย่างรวม)
     ============================================================ */
  async function renderStates(tab = 'empty') {
    const tabs = [['empty', 'ไม่พบข้อมูล'], ['invalid', 'กรอกข้อมูลไม่ถูกต้อง'], ['loading', 'กำลังโหลด / สัญญาณขาด']];
    let body = '';
    if (tab === 'empty') body = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start">
      <div class="card">${emptyState({ title: 'ไม่พบรายการที่ค้นหา', text: 'ลองปรับคำค้นหรือตัวกรองดูอีกครั้ง', tips: ['ตรวจตัวสะกด หรือใช้คำที่สั้นลง เช่น “Arduino”', 'ปิดตัวกรอง “เฉพาะที่ว่างตอนนี้”', 'เลือกประเภทเป็น “ทั้งหมด”'], actions: '<a class="btn btn-primary" href="#/">กลับหน้าหลัก</a>' }).replace('<h1 id="st-t">', '<h2 id="st-t">').replace('</h1>', '</h2>')}</div>
      <div class="card">${emptyState({ title: 'ยังไม่มีรายการค้างส่ง', text: 'ทุกอย่างเรียบร้อยแล้ว ไม่มีอุปกรณ์ที่ต้องคืน', actions: '<a class="btn btn-primary" href="#/">กลับไปหน้าหลัก</a>' }).replace('<h1 id="st-t">', '<h2 id="st-t2">').replace('</h1>', '</h2>')}</div></div>`;
    if (tab === 'invalid') body = `<div class="card" style="max-width:560px">
      <div class="errsum" role="alert"><h2>${ic('alert')}กรุณาแก้ไข 2 จุดก่อนส่งคำขอ</h2><ul><li><a href="#" data-noop>รหัสนักศึกษาต้องเป็นตัวเลข 8–10 หลัก</a></li><li><a href="#" data-noop>ยังไม่ได้ติ๊กยอมรับเงื่อนไข</a></li></ul></div>
      ${field({ id: 'demo_id', label: 'รหัสนักศึกษา', val: '66-1234', hint: 'ตัวเลข 8–10 หลัก ไม่ต้องใส่ขีดหรือเว้นวรรค', err: 'รหัสนักศึกษาต้องเป็นตัวเลข 8–10 หลัก เช่น 6612345678 (ไม่ต้องใส่ขีดหรือเว้นวรรค)' })}
      <p class="note">ข้อผิดพลาดบอกด้วย <b>ไอคอน ข้อความ และขอบเส้นประ</b> ไม่ได้อาศัยสีแดงเพียงอย่างเดียว และบอกวิธีแก้ทันที</p></div>`;
    if (tab === 'loading') body = `<div class="detail">
      <div><p class="load-note"><span class="spin" aria-hidden="true"></span>กำลังโหลดห้องและอุปกรณ์…</p>${skelCards(2)}</div>
      <div class="card">${emptyState({ icon: 'wifi-off', cls: 'off', title: 'ดูเหมือนสัญญาณอินเทอร์เน็ตขาดหาย', text: 'ข้อมูลที่คุณกรอกยังอยู่ครบ ไม่ต้องเริ่มใหม่', tips: ['ตรวจการเชื่อมต่อ Wi-Fi หรือสัญญาณมือถือ', 'เมื่อกลับมาออนไลน์ กดปุ่มด้านล่างเพื่อลองอีกครั้ง'], actions: '<button class="btn btn-primary" type="button" data-action="demo-retry">ลองใหม่อีกครั้ง</button>' }).replace('<h1 id="st-t">', '<h2 id="st-t">').replace('</h1>', '</h2>')}</div></div>`;
    show(`<h1>หน้าจอสถานะพิเศษ</h1><p class="lead" style="margin:.6rem 0 1rem">ตัวอย่างหน้าจอที่ผู้ใช้จะเจอเมื่อไม่พบข้อมูล กรอกไม่ถูกต้อง หรือระบบโหลดช้า/ออฟไลน์</p>
      <div class="tabs">${tabs.map(([k, t]) => `<a href="#/states/${k}" ${k === tab ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</div>${body}`, 'หน้าจอสถานะพิเศษ');
    view.onclick = async e => {
      if (e.target.closest('[data-noop]')) e.preventDefault();
      const b = e.target.closest('[data-action="demo-retry"]');
      if (b) { setBusy(b, true, 'กำลังเชื่อมต่อ…'); await new Promise(r => setTimeout(r, 1100)); setBusy(b, false); toast('เชื่อมต่อได้แล้ว'); }
    };
  }

  /* ---------- ข้อผิดพลาดระดับหน้า ---------- */
  function showError(e) {
    const off = e && e.code === 'OFFLINE';
    show(emptyState({
      icon: off ? 'wifi-off' : 'alert', cls: off ? 'off' : 'err',
      title: off ? 'ดูเหมือนสัญญาณอินเทอร์เน็ตขาดหาย' : 'เกิดข้อผิดพลาดบางอย่าง',
      text: off ? 'ข้อมูลที่คุณกรอกยังอยู่ครบ ไม่ต้องเริ่มใหม่' : (e && e.message) || 'กรุณาลองใหม่อีกครั้ง',
      tips: off ? ['ตรวจการเชื่อมต่อ Wi-Fi หรือสัญญาณมือถือ', 'เมื่อกลับมาออนไลน์ กดปุ่มด้านล่างเพื่อลองอีกครั้ง'] : ['ลองรีเฟรชหน้าเว็บ', 'หากยังไม่หาย แจ้งผู้ดูแลระบบพร้อมเวลาที่เกิดปัญหา'],
      actions: '<button class="btn btn-primary" type="button" data-action="retry">ลองใหม่อีกครั้ง</button><a class="btn" href="#/">กลับหน้าหลัก</a>'
    }), 'เกิดข้อผิดพลาด');
    view.onclick = ev => { if (ev.target.closest('[data-action="retry"]')) { S.loaded = false; route(); } };
  }

  /* ---------- Router ---------- */
  const routes = [
    [/^#\/?$/, renderHome], [/^#\/book\/(.+)$/, renderBook], [/^#\/done\/(.+)$/, renderDone],
    [/^#\/my$/, renderMy], [/^#\/my\/(.+)$/, renderDetail], [/^#\/admin$/, renderAdmin], [/^#\/states(?:\/(\w+))?$/, renderStates]
  ];
  let token = 0;
  async function route() {
    const hash = location.hash || '#/', my = ++token, stale = () => my !== token;
    for (const [re, fn] of routes) {
      const m = hash.match(re);
      if (m) {
        updateNav();
        try { await fn(m[1] ? decodeURIComponent(m[1]) : undefined, stale); }
        catch (e) { if (!stale()) showError(e); }
        return;
      }
    }
    show(emptyState({ title: 'ไม่พบหน้าที่ต้องการ', text: 'ลิงก์อาจไม่ถูกต้อง', actions: '<a class="btn btn-primary" href="#/">กลับหน้าหลัก</a>' }), 'ไม่พบหน้า');
  }

  /* ---------- สัญญาณ + โหมดสาธิต ---------- */
  function net(off) { $('#netbanner').hidden = !off; }
  window.addEventListener('offline', () => net(true));
  window.addEventListener('online', () => net(false));
  $('#netretry').onclick = () => { if (API.sim) API.sim.offline = false; net(false); renderDemo(); S.loaded = false; route(); };
  window.addEventListener('hashchange', route);

  function renderDemo() {
    const box = $('#demo'); if (API.mode !== 'demo') { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="demobar"><span>${ic('info')} โหมดสาธิต: ข้อมูลเก็บในเบราว์เซอร์นี้ (ยังไม่ได้เชื่อม Supabase)</span>
      <button class="btn btn-sm" type="button" id="d-off">${API.sim.offline ? 'กลับมาออนไลน์' : 'ทดลองสัญญาณขาด'}</button>
      <button class="btn btn-sm" type="button" id="d-reset">รีเซ็ตข้อมูลตัวอย่าง</button></div>`;
    $('#d-off').onclick = () => { API.sim.offline = !API.sim.offline; net(API.sim.offline); renderDemo(); if (!API.sim.offline) { S.loaded = false; route(); } else toast('จำลองสัญญาณขาดแล้ว ลองกดส่งคำขอหรือรีเฟรชดู', 'err'); };
    $('#d-reset').onclick = () => { API.resetDemo(); saveMe({}); S.loaded = false; S.mine = null; toast('รีเซ็ตข้อมูลตัวอย่างแล้ว'); location.hash = '#/'; route(); };
  }

  renderDemo();
  route();
})();

/* ============================================================
   LabQ — ชั้นเชื่อมข้อมูล (data layer)
   - ถ้าใส่ SUPABASE_URL / ANON_KEY ใน config.js  => ใช้ Supabase จริง (mode = 'live')
   - ถ้าเว้นว่าง                                  => โหมดสาธิตใน localStorage (mode = 'demo')
   ทั้งสองโหมดมีหน้าตา API เดียวกัน app.js จึงไม่ต้องรู้ว่าใช้โหมดไหน
   ============================================================ */
(function () {
  'use strict';
  const C = window.LABQ_CONFIG || {};
  const configured = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
  const hasLib = !!(window.supabase && window.supabase.createClient);
  const mode = configured ? 'live' : 'demo';
  const sb = configured && hasLib
    ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

  const ACTIVE = ['pending', 'approved', 'in_use'];
  const sim = { offline: false };
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const mk = (code, msg) => Object.assign(new Error(msg), { code, labq: true });

  function norm(e) {
    if (e && e.labq) return e;
    const msg = (e && e.message) || '';
    const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|networkerror|network request|load failed/i.test(msg);
    if (offline) return mk('OFFLINE', 'สัญญาณอินเทอร์เน็ตขาดหาย');
    if (e && e.code === '23P01') return mk('CONFLICT', 'ช่วงเวลานี้เพิ่งมีคนจองไปแล้ว กรุณาเลือกช่วงเวลาอื่น');
    if (e && (e.code === 'P0001' || e.code === 'P0002')) return mk('RULE', msg);
    return mk((e && e.code) || 'UNKNOWN', msg || 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
  }

  async function live(fn) {
    if (!sb) throw mk('OFFLINE', 'โหลดไลบรารี Supabase ไม่สำเร็จ');
    try {
      const res = await fn(sb);
      if (res.error) throw res.error;
      return res.data;
    } catch (e) { throw norm(e); }
  }

  /* ---------------- โหมดสาธิต ---------------- */
  const KEY = 'labq.demo.v1';
  const rid = () => 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function seedRequests() {
    const now = new Date();
    const at = (dayOffset, h) => { const d = new Date(now); d.setDate(d.getDate() + dayOffset); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    const ago = m => new Date(now.getTime() - m * 60000).toISOString();
    const me = { student_id: '6612345678', student_name: 'สมหญิง ใจดี', phone: '0812345678' };
    const b = (o) => Object.assign({ phone: '0800000000', quantity: 1, return_reported: false, admin_note: null, updated_at: ago(30) }, o);
    return [
      // ของนักศึกษาตัวอย่าง (ให้เห็นทุกสถานะ)
      b({ id: 's1', resource_id: 'r6', kind: 'equipment', ...me, purpose: 'ทำโปรเจกต์วัดอุณหภูมิห้องเพาะเลี้ยงต้นไม้', start_at: at(-1, 8), end_at: at(2, 20), status: 'in_use', created_at: ago(3000) }),
      b({ id: 's2', resource_id: 'r1', kind: 'room', ...me, purpose: 'ทดลองวงจรขยายสัญญาณสำหรับวิชาอิเล็กทรอนิกส์', start_at: at(1, 13), end_at: at(1, 15), status: 'pending', created_at: ago(90) }),
      b({ id: 's3', resource_id: 'r9', kind: 'equipment', ...me, purpose: 'วัดแรงดันวงจรชุดทดลองที่ 3', start_at: at(-8, 8), end_at: at(-6, 20), status: 'returned', created_at: ago(14000) }),
      b({ id: 's4', resource_id: 'r2', kind: 'room', ...me, purpose: 'พิมพ์ชิ้นส่วนเคสสำหรับโปรเจกต์จบ', start_at: at(-3, 10), end_at: at(-3, 12), status: 'rejected', admin_note: 'ห้องถูกสงวนไว้สำหรับการเรียนการสอนในช่วงเวลานี้ กรุณาเลือกช่วงเวลาอื่น', created_at: ago(6000) }),
      b({ id: 's5', resource_id: 'r7', kind: 'equipment', ...me, purpose: 'ทดสอบเซิร์ฟเวอร์ขนาดเล็กสำหรับงานกลุ่ม', start_at: at(2, 8), end_at: at(4, 20), status: 'approved', created_at: ago(400) }),
      // ของคนอื่น (ทำให้ตารางว่าง/เต็มดูสมจริง)
      b({ id: 'o1', resource_id: 'r1', kind: 'room', student_id: '6601112223', student_name: 'ธนภัทร สายชล', purpose: 'ซ้อมเตรียมสอบปฏิบัติ', start_at: at(0, 10), end_at: at(0, 12), status: 'approved', created_at: ago(5000) }),
      b({ id: 'o2', resource_id: 'r1', kind: 'room', student_id: '6604445556', student_name: 'พิมพ์ชนก รัตนา', purpose: 'ประกอบวงจรสำหรับโปรเจกต์กลุ่ม', start_at: at(0, 14), end_at: at(0, 15), status: 'pending', created_at: ago(300) }),
      b({ id: 'o3', resource_id: 'r3', kind: 'room', student_id: '6607778889', student_name: 'กิตติพัฒน์ วงศ์ดี', purpose: 'เขียนโปรแกรมส่งงานรายวิชา', start_at: at(0, 13), end_at: at(0, 16), status: 'approved', created_at: ago(2000) }),
      b({ id: 'o4', resource_id: 'r10', kind: 'equipment', student_id: '6609990001', student_name: 'อรอุมา แสงทอง', purpose: 'ถ่ายวิดีโอนำเสนอผลงาน', quantity: 3, start_at: at(-1, 8), end_at: at(1, 20), status: 'in_use', created_at: ago(4000) }),
      b({ id: 'o5', resource_id: 'r7', kind: 'equipment', student_id: '6602223334', student_name: 'วีรภัทร ใจกล้า', purpose: 'ทำระบบควบคุมแสงอัตโนมัติ', quantity: 4, start_at: at(0, 8), end_at: at(2, 20), status: 'approved', created_at: ago(1500) }),
      b({ id: 'o6', resource_id: 'r6', kind: 'equipment', student_id: '6605556667', student_name: 'ภัทรพร มีสุข', purpose: 'สร้างหุ่นยนต์เดินตามเส้น', quantity: 4, start_at: at(0, 8), end_at: at(3, 20), status: 'pending', created_at: ago(120) })
    ];
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    const s = seedRequests(); save(s); return s;
  }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } }
  async function gate() { await delay(320); if (sim.offline) throw mk('OFFLINE', 'สัญญาณอินเทอร์เน็ตขาดหาย'); }
  const ov = (a, b) => new Date(a.start_at) < new Date(b.end_at) && new Date(b.start_at) < new Date(a.end_at);

  const demo = {
    async listResources() { await gate(); return JSON.parse(JSON.stringify(window.DEMO_RESOURCES)); },
    async listBookings() {
      await gate();
      const now = new Date();
      return load().filter(q => ACTIVE.includes(q.status) && new Date(q.end_at) >= now)
        .map(q => ({ resource_id: q.resource_id, kind: q.kind, start_at: q.start_at, end_at: q.end_at, quantity: q.quantity, status: q.status }));
    },
    async createRequest(p) {
      await gate();
      const r = window.DEMO_RESOURCES.find(x => x.id === p.resource_id);
      if (!r) throw mk('RULE', 'ไม่พบรายการที่เลือก');
      const list = load();
      const clash = list.filter(q => q.resource_id === r.id && ACTIVE.includes(q.status) && ov(q, p));
      let qty = p.quantity || 1;
      const ms = new Date(p.end_at) - new Date(p.start_at);
      if (r.kind === 'room') {
        qty = 1;
        if (ms > r.max_hours * 36e5) throw mk('RULE', `จองห้องนี้ได้ครั้งละไม่เกิน ${r.max_hours} ชั่วโมง`);
        if (clash.length) throw mk('CONFLICT', 'ช่วงเวลานี้เพิ่งมีคนจองไปแล้ว กรุณาเลือกช่วงเวลาอื่น');
      } else {
        if (ms > r.max_days * 864e5) throw mk('RULE', `ยืมอุปกรณ์นี้ได้ไม่เกิน ${r.max_days} วัน`);
        const used = clash.reduce((a, q) => a + q.quantity, 0);
        if (used + qty > r.stock_total) throw mk('RULE', `จำนวนคงเหลือไม่พอ (เหลือ ${Math.max(r.stock_total - used, 0)} ชิ้น)`);
      }
      const now = new Date().toISOString();
      const rec = { id: rid(), resource_id: r.id, kind: r.kind, student_id: p.student_id, student_name: p.student_name, phone: p.phone || null,
        purpose: p.purpose, start_at: p.start_at, end_at: p.end_at, quantity: qty, status: 'pending', return_reported: false, admin_note: null, created_at: now, updated_at: now };
      list.push(rec); save(list); return rec;
    },
    async myRequests(studentId) {
      await gate();
      return load().filter(q => q.student_id === studentId).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async studentAction(id, studentId, action) {
      await gate();
      const list = load(); const q = list.find(x => x.id === id && x.student_id === studentId);
      if (!q) throw mk('RULE', 'ไม่พบคำขอนี้');
      if (action === 'cancel') {
        if (!['pending', 'approved'].includes(q.status)) throw mk('RULE', 'คำขอนี้ยกเลิกไม่ได้แล้ว');
        q.status = 'cancelled';
      } else if (action === 'report_return') {
        if (q.status !== 'in_use') throw mk('RULE', 'ยังไม่อยู่ในสถานะกำลังใช้งาน');
        q.return_reported = true;
      } else throw mk('RULE', 'คำสั่งไม่ถูกต้อง');
      q.updated_at = new Date().toISOString(); save(list); return q;
    },
    async adminSession() { await gate(); return localStorage.getItem('labq.demo.admin') === '1' ? { email: 'admin@demo.local' } : null; },
    async adminLogin() { await gate(); localStorage.setItem('labq.demo.admin', '1'); return { email: 'admin@demo.local' }; },
    async adminLogout() { localStorage.removeItem('labq.demo.admin'); },
    async adminList() { await gate(); return load().sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async adminSetStatus(id, status, note) {
      await gate();
      const list = load(); const q = list.find(x => x.id === id);
      if (!q) throw mk('RULE', 'ไม่พบคำขอนี้');
      q.status = status; if (note !== undefined) q.admin_note = note; q.updated_at = new Date().toISOString();
      if (status === 'returned') q.return_reported = false;
      save(list); return q;
    },
    resetDemo() { try { localStorage.removeItem(KEY); localStorage.removeItem('labq.demo.admin'); } catch (e) { /* ignore */ } }
  };

  /* ---------------- Supabase จริง ---------------- */
  const real = {
    listResources: () => live(s => s.from('resources').select('*').eq('active', true).order('kind').order('name')),
    listBookings: () => live(s => s.from('public_bookings').select('*').gte('end_at', new Date().toISOString())),
    createRequest: p => live(s => s.rpc('create_request', {
      p_resource: p.resource_id, p_student_id: p.student_id, p_name: p.student_name, p_phone: p.phone || '',
      p_purpose: p.purpose, p_start: p.start_at, p_end: p.end_at, p_qty: p.quantity || 1
    })),
    myRequests: id => live(s => s.rpc('my_requests', { p_student_id: id })),
    studentAction: (id, studentId, action) => live(s => s.rpc('student_action', { p_id: id, p_student_id: studentId, p_action: action })),
    async adminSession() {
      if (!sb) throw mk('OFFLINE', 'โหลดไลบรารี Supabase ไม่สำเร็จ');
      try {
        const { data } = await sb.auth.getSession();
        const user = data && data.session && data.session.user;
        if (!user) return null;
        const { data: row, error } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
        if (error) throw error;
        return row ? { email: user.email } : null;
      } catch (e) { throw norm(e); }
    },
    async adminLogin(email, password) {
      if (!sb) throw mk('OFFLINE', 'โหลดไลบรารี Supabase ไม่สำเร็จ');
      let res;
      try { res = await sb.auth.signInWithPassword({ email, password }); } catch (e) { throw norm(e); }
      if (res.error) {
        if (/invalid/i.test(res.error.message)) throw mk('AUTH', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        throw norm(res.error);
      }
      const sess = await real.adminSession();
      if (!sess) { await sb.auth.signOut(); throw mk('AUTH', 'บัญชีนี้ยังไม่ได้รับสิทธิ์ผู้ดูแล'); }
      return sess;
    },
    async adminLogout() { if (sb) await sb.auth.signOut(); },
    adminList: () => live(s => s.from('requests').select('*').order('created_at', { ascending: false }).limit(300)),
    adminSetStatus: (id, status, note) => {
      const patch = { status, updated_at: new Date().toISOString() };
      if (note !== undefined) patch.admin_note = note;
      if (status === 'returned') patch.return_reported = false;
      return live(s => s.from('requests').update(patch).eq('id', id).select().single());
    },
    resetDemo() {}
  };

  window.API = Object.assign({ mode, sim, configured }, mode === 'live' ? real : demo);
})();

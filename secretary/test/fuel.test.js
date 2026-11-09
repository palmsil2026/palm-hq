// 🧪 ⛽ บิลน้ำมัน + เลขไมล์จากกลุ่มสายรถ → แอปรถ (fleet-app fuelLine) — ข้อมูลสมมติทั้งหมด ไม่แตะชีต/ไลน์จริง
//   รัน: node secretary/test/fuel.test.js (unit.test.js เรียกต่อท้ายให้เอง)
//   สเปก: origin-hq docs/ใบสั่งงาน-palm-hq-2026-11-09-บิลน้ำมันจากไลน์.md
const assert = require('assert'), crypto = require('crypto');
const { makeEnv, ev, OTHER_GID, VAN_GID, PROD_GID, PLANT_SHEET } = require('./harness');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };
const expectToken = crypto.createHmac('sha256', PLANT_SHEET).update('lakon-line-chat-v1').digest('hex');

const RECEIPT = { kind: 'receipt', liters: '31.25', baht: '1,000.00', ppl: 32, fuel: 'ดีเซล', station: 'ปตท. ทดสอบ สาขา 1', invoice: '#INV-0001',
                  plate: 'ผก 0000 ลำปาง', buyer: 'บจก. ทดสอบ', time: '2569-11-10 08:15' };
// สมองจำลองอ่านรูป: บรรทัด "น้ำมัน:" ตามที่ขอ (มีเฉพาะเมื่อพรอมต์ขอ)
const imgAi = fuel => body => {
  const s = JSON.stringify(body);
  const asked = s.indexOf('รูปหน้าปัดรถ') !== -1;
  return 'เกี่ยวข้อง: ใช่\nบรรยาย: รูปบิลน้ำมันสมมติ\nหมวด: การเงิน-เอกสาร' + (asked ? '\nน้ำมัน: ' + (fuel === '-' ? '-' : JSON.stringify(fuel)) : '');
};
const van = () => { const e = ev('image', {}, VAN_GID); e.source.userId = 'Udriver'; e.timestamp = Date.parse('2026-11-10T01:20:00Z'); return e; };
const at = (S, iso) => { S.now = new Date(iso); };
const T0 = new Date('2026-11-10T01:20:00Z');

t('⛽ บิลน้ำมันในกลุ่มสายรถ → ส่ง fuelLine ครบช่อง (ปี พ.ศ.→ค.ศ. · ยอดมีลูกน้ำ · # หน้าเลขบิล) · อ่านในการเรียก AI ครั้งเดียว · ไม่ตอบในกลุ่ม', () => {
  const { ctx, S } = makeEnv({ now: T0, ai: imgAi(RECEIPT) });
  const e = van();
  ctx.handleEvent(e);
  assert.strictEqual(S.prompts.length, 1, 'อ่านรูปครั้งเดียว ไม่เรียก AI เพิ่ม');
  assert.ok(JSON.stringify(S.prompts[0]).indexOf('ห้ามเอาเลข trip/ความเร็ว/รอบเครื่อง') !== -1);
  assert.strictEqual((S.fleet || []).length, 1);
  const b = S.fleet[0];
  assert.strictEqual(b.token, expectToken); assert.strictEqual(b.action, 'fuelLine'); assert.strictEqual(b.kind, 'receipt');
  assert.strictEqual(b.messageId, e.message.id); assert.strictEqual(b.at, e.timestamp); assert.strictEqual(b.sender, 'แม่'); assert.strictEqual(b.group, 'sale ละกอน สายรถ');
  assert.ok(/^https:\/\/drive\.google\.com\/file\/d\/F1\/view$/.test(b.image), b.image);
  assert.deepStrictEqual(b.receipt, { liters: 31.25, baht: 1000, ppl: 32, fuel: 'ดีเซล', station: 'ปตท. ทดสอบ สาขา 1', invoice: 'INV-0001', plate: 'ผก 0000 ลำปาง', buyer: 'บจก. ทดสอบ', time: '2026-11-10 08:15' });
  assert.strictEqual(S.replies.length + S.pushes.length, 0, 'เงียบในกลุ่ม');
  assert.ok(S.logs.some(l => l[0] === '⛽ บิลน้ำมัน→แอปรถ' && /^new · 06/.test(l[3])));
});

t('⛽ หน้าปัด → ส่ง odo · อ่านไม่ชัด (null) = ไม่ส่ง · รูปอื่น (-) = ไม่ส่ง · ยอดเงินไม่มี = ไม่ส่ง', () => {
  const a = makeEnv({ now: T0, ai: imgAi({ kind: 'odo', odo: '240,330' }) });
  a.ctx.handleEvent(van());
  assert.strictEqual(a.S.fleet.length, 1); assert.strictEqual(a.S.fleet[0].kind, 'odo'); assert.strictEqual(a.S.fleet[0].odo, 240330); assert.ok(!a.S.fleet[0].receipt);
  for (const f of [{ kind: 'odo', odo: null }, '-', { kind: 'receipt', baht: '', liters: '', ppl: '' }]) {
    const b = makeEnv({ now: T0, ai: imgAi(f) });
    b.ctx.handleEvent(van());
    assert.strictEqual((b.S.fleet || []).length, 0, JSON.stringify(f));
  }
  const c = makeEnv({ now: T0, ai: imgAi({ kind: 'receipt', liters: 30, ppl: 33.3 }) });
  c.ctx.handleEvent(van());
  assert.strictEqual(c.S.fleet[0].receipt.baht, 999, 'ไม่มียอด แต่มีลิตร×ราคา = คิดยอดให้');
});

t('⛽ กลุ่มอื่น/กลุ่มฝ่ายผลิต → ไม่ขออ่านบิลน้ำมัน ไม่ส่ง · FUEL_LINE=off → ไม่ส่ง · GROUP_VAN_ID ใช้แทนชื่อกลุ่มได้', () => {
  for (const gid of [OTHER_GID, PROD_GID]) {
    const { ctx, S } = makeEnv({ now: T0, ai: imgAi(RECEIPT) });
    ctx.handleEvent(ev('image', {}, gid));
    assert.ok(!S.prompts.some(p => JSON.stringify(p).indexOf('รูปหน้าปัดรถ') !== -1), gid); assert.strictEqual((S.fleet || []).length, 0);
  }
  const off = makeEnv({ now: T0, ai: imgAi(RECEIPT), props: { FUEL_LINE: 'off' } });
  off.ctx.handleEvent(van()); assert.strictEqual((off.S.fleet || []).length, 0);
  const g = makeEnv({ props: { GROUP_VAN_ID: OTHER_GID } });
  assert.strictEqual(g.ctx.isVanGroup(OTHER_GID), true); assert.strictEqual(g.ctx.isVanGroup(VAN_GID), false);
  assert.strictEqual(makeEnv().ctx.isVanGroup(VAN_GID), true);
});

t('⛽ แอปรถยังไม่พร้อม/ล่ม → เข้าคิว FUELQ_ ลองใหม่ทุก tick จนผ่าน · ข้อมูลผิดรูปแบบ = ไม่ลองซ้ำ · เกิน 48 รอบ = ทิ้ง+จด', () => {
  const { ctx, S } = makeEnv({ now: T0, ai: imgAi(RECEIPT) });
  S.fleetResp = () => ({ success: false, error: 'ไม่รู้จัก action' });
  const e = van(); ctx.handleEvent(e);
  const k = 'FUELQ_' + e.message.id;
  assert.ok(S.props[k], 'เข้าคิว'); assert.strictEqual(JSON.parse(S.props[k]).n, 1);
  ctx.fuelOutboxTick();
  assert.strictEqual(JSON.parse(S.props[k]).n, 2, 'ยังไม่ผ่าน = นับรอบเพิ่ม');
  S.fleetResp = () => ({ success: true, act: 'merged', id: 'FU9' });
  assert.strictEqual(ctx.fuelOutboxTick(), 1); assert.ok(!S.props[k], 'ผ่านแล้วออกจากคิว');
  assert.strictEqual(S.fleet.length, 3); assert.strictEqual(S.fleet[2].messageId, e.message.id, 'messageId เดิม (แอปรถกันซ้ำ)');
  // ข้อมูลผิดรูปแบบ
  const b = makeEnv({ now: T0, ai: imgAi(RECEIPT) });
  b.S.fleetResp = () => ({ success: false, error: 'ยอดเงินไม่ถูกต้อง' });
  b.ctx.handleEvent(van());
  assert.ok(!Object.keys(b.S.props).some(x => x.indexOf('FUELQ_') === 0), 'ไม่ลองซ้ำ');
  assert.ok(b.S.logs.some(l => /แอปรถไม่รับ: ยอดเงินไม่ถูกต้อง/.test(l[3])));
  // เน็ตล่ม (throw) → เข้าคิว · ครบ 48 รอบ → ทิ้ง
  const c = makeEnv({ now: T0, ai: imgAi(RECEIPT) });
  c.S.fleetThrow = true; c.ctx.handleEvent(van());
  const ck = Object.keys(c.S.props).find(x => x.indexOf('FUELQ_') === 0);
  assert.ok(ck); const q = JSON.parse(c.S.props[ck]); q.n = 47; c.S.props[ck] = JSON.stringify(q);
  c.ctx.fuelOutboxTick();
  assert.ok(!c.S.props[ck]); assert.ok(c.S.logs.some(l => /^ทิ้ง: ส่งไม่ผ่าน 48 รอบ/.test(l[3])));
});

t('⛽ เช็คระบบ บรรทัด ⛽ — วันนี้กี่บิล/เลขไมล์ · ผลล่าสุด · ค้างส่ง = เตือน · ยังไม่รู้จักกลุ่มสายรถ = เตือน', () => {
  const run = env => { try { return env.ctx.healthCheck(); } catch (e) { return String(e && e.stack); } };
  const a = makeEnv({ now: T0 });
  assert.ok(/⚠️ ⛽ ยังไม่รู้จักกลุ่มสายรถ/.test(run(a)) && /GROUP_VAN_ID/.test(run(a)));
  const b = makeEnv({ now: T0, ai: imgAi(RECEIPT) });
  const base = b.ctx.listKnownGroups; b.ctx.listKnownGroups = () => base().concat([{ id: VAN_GID, name: 'sale ละกอน สายรถ' }]);
  b.ctx.handleEvent(van());
  let h = run(b);
  assert.ok(/✅ ⛽ ส่งบิลน้ำมันเข้าแอปรถ: วันนี้ บิล 1 · เลขไมล์ 0 · ล่าสุด 10\/11 08:20 บิล 1000 บาท #INV-0001 → new/.test(h), h);
  b.S.fleetResp = () => ({ success: false, error: 'HTTP 500' });
  b.ctx.handleEvent(van());
  h = run(b);
  assert.ok(/⚠️ ⛽ ส่งบิลน้ำมันเข้าแอปรถ: วันนี้ บิล 1 .*❌ HTTP 500 · ค้างส่ง 1 รายการ/.test(h), h);
});

t('⛽ ย้อนหลัง: อ่านคำบรรยายใน GroupChat (รุ่นเล็ก อ่านข้อความ) → ลองนับไม่ส่ง · send=1 ส่งตามลำดับเวลา (messageId คงที่ · at = เวลาเดิม · backfill:true) · ต้องใช้ LEARN_KEY', () => {
  const rows = [
    { t: Date.parse('2026-10-08T02:00:00Z'), uid: 'Uaaaaaa111111', name: 'คนขับ ก', text: '[ส่งรูป/ไฟล์] บิลน้ำมันดีเซล 1,000 บาท 31 ลิตร ปั๊มทดสอบ https://drive.google.com/file/d/A1/view' },
    { t: Date.parse('2026-10-08T02:03:00Z'), uid: 'Uaaaaaa111111', name: 'คนขับ ก', text: '[ส่งรูป/ไฟล์] หน้าปัดรถ เลขไมล์ 6,535 https://drive.google.com/file/d/A2/view' },
    { t: Date.parse('2026-10-09T03:00:00Z'), uid: 'Ubbbbbb222222', name: 'คนขับ ข', text: '[ส่งรูป/ไฟล์] รูปหน้าปัดรถ ปั๊มน้ำมัน มองไม่ชัด https://drive.google.com/file/d/A3/view' }
  ];
  const ai = body => (JSON.stringify(body).indexOf('คำบรรยายรูปที่เคยอ่านไว้') !== -1
    ? JSON.stringify([{ kind: 'receipt', baht: 1000, liters: 31, ppl: 32.26, fuel: 'ดีเซล', station: 'ปั๊มทดสอบ', invoice: '', plate: '', buyer: '', time: '' }, { kind: 'odo', odo: 6535 }, null])
    : 'SKIP');
  const { ctx, S } = makeEnv({ now: T0, ai, props: { LEARN_KEY: 'lk-test' } });
  const base = ctx.listKnownGroups; ctx.listKnownGroups = () => base().concat([{ id: VAN_GID, name: 'sale ละกอน สายรถ' }]);
  let asked; ctx.fuelHistoryRows = (gid, from) => { asked = [gid, from]; return rows; };
  const dry = ctx.fuelBackfill('2026-10-08', false);
  assert.strictEqual(asked[0], VAN_GID); assert.strictEqual(asked[1], Date.parse('2026-10-07T17:00:00Z'));
  assert.deepStrictEqual([dry.rows, dry.receipts, dry.odos, dry.baht, dry.send], [3, 1, 1, 1000, false]);
  assert.strictEqual((S.fleet || []).length, 0, 'ลองนับ = ไม่ส่ง');
  assert.ok(S.prompts.every(p => typeof p.messages[0].content === 'string'), 'อ่านข้อความ ไม่อ่านรูปซ้ำ');
  const real = ctx.fuelBackfill('2026-10-08', true);
  assert.strictEqual(S.fleet.length, 2);
  assert.deepStrictEqual(S.fleet.map(b => [b.kind, b.at, b.messageId, b.backfill, b.image]),
    [['receipt', rows[0].t, 'gc_' + rows[0].t + '_111111', true, 'https://drive.google.com/file/d/A1/view'],
     ['odo', rows[1].t, 'gc_' + rows[1].t + '_111111', true, 'https://drive.google.com/file/d/A2/view']]);
  assert.strictEqual(real.acts.new, 2);
  assert.deepStrictEqual([real.inBaht, real.inLiters, real.warns.length, real.errors.length], [1000, 31, 0, 0], 'ยอดที่เข้าแอป');
  S.fleetResp = b => (b.kind === 'odo' ? { success: false, error: 'HTTP 500' } : { success: true, act: 'new', veh: '', note: '⚠️ ไม่รู้ว่าคันไหน' });
  const r2 = ctx.fuelBackfill('2026-10-08', true);
  assert.strictEqual(r2.acts.error, 1); assert.strictEqual(r2.warns.length, 1); assert.ok(/8\/10 09:00 คนขับ ก บิล 1000 บาท: ⚠️ ไม่รู้ว่าคันไหน/.test(r2.warns[0]), r2.warns[0]);
  assert.ok(/^8\/10 09:03 เลขไมล์ 6535: HTTP 500/.test(r2.errors[0]), r2.errors[0]);
  const res = ctx.doGet({ parameter: { action: 'fuelBackfill', key: 'ผิด' } });
  assert.ok(/unauthorized/.test(res.t));
});

console.log('\n⛽ บิลน้ำมัน ผ่านทั้งหมด ' + n + ' ข้อ');

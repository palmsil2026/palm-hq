// 🧪 สมองหลัก + คำสั่ง orders + โน้ตพ่วงใบงาน (10/11 — ขัดเกลาเลขาจากบันทึกจริง) — ข้อมูลสมมติทั้งหมด ไม่แตะชีต/ไลน์/API
//   รัน: node secretary/test/brain.test.js (unit.test.js เรียกต่อท้ายให้เอง)
//   ที่มา (SecretaryLog): ① พนักงานส่งบิลทางแชทส่วนตัว เลขาตอบ "ลงให้แล้ว · ทีมเห็นเองเลย" แต่ใบงานค้าง "รอทีม AI" 3 สัปดาห์
//     ② ถาม "ออร์เดอร์ร้าน…ที่คุณ…ต้องไปส่งมีเท่าไหร่" ได้ตารางยอดทั้งวัน ③ สมองไม่ตั้งระดับการคิด + โควตาคำตอบ 4096 (เสี่ยงโดนตัด)
const assert = require('assert');
const { makeEnv, dm, ev, replyText, OWNER, OTHER_GID } = require('./harness');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };
const NOW = new Date('2026-11-10T03:00:00Z');   // 10:00 ไทย
const FEED = () => ({ sales: [
  { date: '2026-11-10', oid: 'SO1', line: 'ละกอน', qty: 100, amount: 2700, prod: 'ละกอน 600 ml', cust: 'ร้านทดสอบปัญญา', seller: 'เซลส์ก', dby: 'คนส่งข', dd: '2026-11-10', dst: '', st: 'พร้อมส่ง' },
  { date: '2026-11-10', oid: 'SO1', line: 'ละกอน', qty: 10, amount: 300, prod: 'ละกอน 250 ml', cust: 'ร้านทดสอบปัญญา', seller: 'เซลส์ก', dby: 'คนส่งข', dd: '2026-11-10', dst: '', st: 'พร้อมส่ง' },
  { date: '2026-11-10', oid: 'SO2', line: 'ละกอน', qty: 20, amount: 540, prod: 'ละกอน 600 ml', cust: 'ร้านทดสอบสอง', seller: 'เซลส์ค', dby: 'คนส่งง', dd: '2026-11-11', dst: 'ส่งแล้ว', st: 'ส่งแล้ว' },
  { date: '2026-11-09', oid: 'SO3', line: 'ละกอน', qty: 5, amount: 135, prod: 'ละกอน 600 ml', cust: 'ร้านทดสอบสาม', seller: 'เซลส์ก', dby: 'คนส่งข', dd: '2026-11-10', dst: '', st: 'พร้อมส่ง' },
  { date: '2026-10-15', oid: 'OEM1', line: 'OEM', qty: 50, amount: 2000, prod: 'OEM แบรนด์ทดสอบ 600 ml', cust: 'รีสอร์ททดสอบ', seller: 'OEM', dby: '', dd: '2026-10-20', dst: 'ส่งแล้ว', st: 'ส่งแล้ว' },
] });
const env = o => { const E = makeEnv(Object.assign({ now: NOW }, o || {})); E.ctx.plantFeed = FEED; return E; };

t('สมองหลัก: ระบุระดับการคิด medium + โควตาคำตอบ 8192 · สมองปฏิเสธ (refusal) = ขอโทษสุภาพ ไม่ใช่ "ระบบขัดข้อง"', () => {
  const { ctx, S } = env({ ai: () => 'ได้ค่ะ' });
  assert.strictEqual(ctx.askClaude('สวัสดี', []), 'ได้ค่ะ');
  const b = S.prompts[0];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(b.output_config)), { effort: 'medium' }); assert.strictEqual(b.max_tokens, 8192);
  assert.strictEqual(b.model, 'claude-sonnet-5-5'); assert.ok(!('temperature' in b) && !('thinking' in b));
  const real = ctx.UrlFetchApp.fetch;
  ctx.UrlFetchApp.fetch = (u, o) => u.indexOf('anthropic.com') !== -1
    ? { getResponseCode: () => 200, getContentText: () => JSON.stringify({ stop_reason: 'refusal', content: [] }) } : real(u, o);
  assert.ok(/ตอบให้ไม่ได้/.test(ctx.askClaude('x', [])));
});

t('orders: ถามเจาะจงร้าน → บรรทัดแรกบอกจำนวนใบ + แพ็ครวม (ไม่ใช่ตารางทั้งวัน) · รวมหลายบรรทัดของใบเดียว', () => {
  const { ctx } = env();
  const out = ctx.plantOrdersText({ range: 'today', customer: 'ปัญญา' });
  assert.ok(/^🔎 ออเดอร์โรงน้ำ ที่ลง วันนี้ · ร้าน "ปัญญา": 1 ใบ · 110 แพ็ค · 3,000 บาท/.test(out), out);
  assert.ok(/ร้านทดสอบปัญญา — 600 ml × 100, 250 ml × 10/.test(out) && /ส่งโดย คนส่งข/.test(out) && /ยังไม่ส่ง \(นัด 10\/11\)/.test(out), out);
  assert.ok(out.indexOf('ร้านทดสอบสอง') === -1);
});

t('orders: "วันนี้คนส่ง…ต้องไปส่งอะไรบ้าง" = กรองตามวันนัดส่ง + คนส่ง (รวมใบที่ลงเมื่อวาน) · ยังไม่ส่ง · OEM ตามช่วงวัน · ไม่พบ = บอกตรง ๆ', () => {
  const { ctx } = env();
  const d = ctx.plantOrdersText({ range: 'today', date: 'delivery', deliverer: 'คนส่งข' });
  assert.ok(/นัดส่ง วันนี้ · คนส่ง คนส่งข: 2 ใบ · 115 แพ็ค/.test(d), d);
  assert.ok(/ร้านทดสอบสาม/.test(d) && d.indexOf('ร้านทดสอบสอง') === -1);
  const u = ctx.plantOrdersText({ range: 'week', status: 'undelivered' });
  assert.ok(/ยังไม่ส่ง: 2 ใบ/.test(u) && u.indexOf('ร้านทดสอบสอง') === -1, u);
  const o = ctx.plantOrdersText({ from: '2026-10-01', to: '2026-10-31', customer: 'รีสอร์ท', line: 'OEM' });
  assert.ok(/1 ใบ · 50 แพ็ค/.test(o) && /ส่งแล้ว/.test(o), o);
  assert.ok(/ไม่พบค่ะ/.test(ctx.plantOrdersText({ range: 'prevmonth', customer: 'ไม่มีจริง' })));
});

t('orders ผ่านสมอง: คุณปาล์มแชทส่วนตัว = ต่อผลจริงท้ายคำตอบ · พนักงาน/ในกลุ่ม = ไม่ทำ', () => {
  const ai = () => 'ดูให้เลยค่ะ [[RUN]]{"cmd":"orders","range":"today","customer":"ปัญญา"}[[/RUN]]';
  let E = env({ ai });
  E.ctx.handleEvent(dm(OWNER, 'วันนี้ออร์เดอร์ร้านปัญญาที่ต้องไปส่งมีจำนวนเท่าไหร่'));
  assert.ok(/1 ใบ · 110 แพ็ค/.test(replyText(E.S)), replyText(E.S));
  assert.ok(/orders \{"range"/.test(E.S.prompts[0].system[0].text), 'สมองรู้จักคำสั่ง orders');
  E = env({ ai });
  E.ctx.handleEvent(dm('Ustaff1', 'ร้านปัญญาวันนี้สั่งเท่าไหร่'));
  assert.ok(replyText(E.S).indexOf('110 แพ็ค') === -1, 'พนักงานไม่ได้ผลคำสั่ง orders');
  E = env({ ai });
  const g = ev('text', { text: 'เลขา ร้านปัญญาวันนี้สั่งเท่าไหร่' }, OTHER_GID); g.source.userId = OWNER;
  E.ctx.handleEvent(g);
  assert.ok(replyText(E.S).indexOf('110 แพ็ค') === -1, 'ในกลุ่มไม่โชว์รายใบ (มียอดเงิน)');
});

t('โน้ตพ่วงใบงาน: งานยังรอ = บอกตรง ๆ ว่ายังไม่มีคนลงมือ + เตือนคุณปาล์มครั้งเดียว · งานมีคนทำแล้ว = ข้อความเดิม · คุณปาล์มส่งเอง = ไม่เตือนตัวเอง', () => {
  const ai = () => 'รับทราบค่ะ [[ADDNOTE]]{"ref":"REQ261021-0001","note":"บิลเพิ่ม 1 ใบ"}[[/ADDNOTE]]';
  let E = env({ ai });
  E.ctx.appendNoteToTask = () => ({ status: 'รอทีม AI', at: NOW.getTime() - 20 * 864e5 });
  E.ctx.handleEvent(dm('Ustaff1', 'ส่งรูปใบส่งของมาเพิ่มอีกใบค่ะ'));
  E.ctx.handleEvent(dm('Ustaff1', 'อีกใบค่ะ'));
  const r = replyText(E.S);
  assert.ok(/จดข้อมูลเพิ่มไว้ในใบงาน #REQ261021-0001 แล้วค่ะ — งานนี้ยัง "รอทีม AI" \(ยังไม่มีคนลงมือ ยังไม่ได้บันทึกเข้าระบบนะคะ\)/.test(r), r);
  assert.ok(r.indexOf('ทีมที่รับงานเห็นเองเลย') === -1);
  const pushes = E.S.pushes.filter(p => p.to === OWNER && /ยัง "รอทีม AI" มา 20 วันแล้ว/.test(p.messages[0].text));
  assert.strictEqual(pushes.length, 1, 'เตือนคุณปาล์มครั้งเดียวต่อใบงาน (กันรัว)');
  assert.ok(/ไม่ใช่คุณปาล์ม/.test(E.S.prompts[0].messages.slice(-1)[0].content), 'สมองรู้ว่าคนส่งไม่ใช่คุณปาล์ม');
  E = env({ ai });
  E.ctx.appendNoteToTask = () => ({ status: 'กำลังทำ', at: NOW.getTime() - 20 * 864e5 });
  E.ctx.handleEvent(dm('Ustaff1', 'ส่งรูปใบส่งของมาเพิ่มอีกใบค่ะ'));
  assert.ok(/แนบข้อมูลเข้างาน #REQ261021-0001 ให้เรียบร้อยค่ะ/.test(replyText(E.S))); assert.strictEqual(E.S.pushes.length, 0);
  E = env({ ai });
  E.ctx.appendNoteToTask = () => ({ status: 'รอทีม AI', at: NOW.getTime() - 20 * 864e5 });
  E.ctx.handleEvent(dm(OWNER, 'เพิ่มโน้ตในงานเดิมให้หน่อย'));
  assert.ok(/ยังไม่มีคนลงมือ/.test(replyText(E.S))); assert.strictEqual(E.S.pushes.length, 0);
});

t('พรอมต์: bill อ่านอย่างเดียว · ห้ามอ้างว่าลง/บันทึกแล้วถ้าไม่ได้ทำจริง · บิลทางแชทส่วนตัวให้ส่งกลุ่มบิล', () => {
  const { ctx, S } = env({ ai: () => 'ok' });
  ctx.askClaude('x', []);
  const sys = S.prompts[0].system[0].text;
  assert.ok(/bill อ่านได้อย่างเดียว/.test(sys) && /ห้ามบอกว่า "ลงแล้ว\/บันทึกแล้ว\/แก้แล้ว\/ส่งให้ทีมแล้ว"/.test(sys) && /กลุ่มไลน์บิลค่าใช้จ่าย/.test(sys));
});

console.log('\n🧠 สมอง + orders + โน้ตใบงาน ผ่านทั้งหมด ' + n + ' ข้อ');

// ---------- 10/11 ปลุกทีม AI ล้มเพราะโทเคน → รู้ทันที (ของจริง: 401 ตั้งแต่ 21/10 ไม่มีใครรู้) ----------
t('ปลุกทีม AI ได้ 401 → จดผลล่าสุด + แจ้งคุณปาล์มวันละครั้งพร้อมวิธีแก้ · "เช็คระบบ" เตือน · ปลุกสำเร็จ = กลับเป็นปกติ', () => {
  const FIRE = 'https://routine.example/fire';
  const E = env({ props: { ROUTINE_FIRE_URL: FIRE, ROUTINE_TOKEN: 'old' } });
  const real = E.ctx.UrlFetchApp.fetch; let code = 401;
  E.ctx.UrlFetchApp.fetch = (u, o) => u === FIRE ? { getResponseCode: () => code, getContentText: () => '{}' } : real(u, o);
  assert.strictEqual(E.ctx.fireRoutine('ทดสอบ').ok, false);
  E.ctx.fireRoutine('ทดสอบอีกรอบ');
  const warned = E.S.pushes.filter(p => p.to === OWNER && /ปลุกทีม AI ไม่ได้ค่ะ \(HTTP 401/.test(p.messages[0].text));
  assert.strictEqual(warned.length, 1, 'แจ้งวันละครั้ง'); assert.ok(/Generate token ใหม่/.test(warned[0].messages[0].text));
  assert.ok(/ปลุกทีม AI ครั้งล่าสุดไม่สำเร็จ \(HTTP 401\)/.test(E.ctx.healthCheck()), 'เช็คระบบเตือน');
  code = 200;
  assert.strictEqual(E.ctx.fireRoutine('ทดสอบ').ok, true);
  assert.ok(/ปุ่ม "เริ่มทันที" บนบอร์ดใช้ได้ \(ปลุกล่าสุดสำเร็จ/.test(E.ctx.healthCheck()));
  // Routine อื่น (นักพัฒนา/เรียนรู้) ใช้โทเคนคนละตัว — ไม่ปนกับสถานะของ Routine หลัก
  code = 401; E.ctx.fireRoutine('เคส', FIRE, 'x');
  assert.ok(/ปลุกล่าสุดสำเร็จ/.test(E.ctx.healthCheck()));
});
console.log('🧠 + ปลุกทีม AI ผ่านเพิ่ม 1 ข้อ');

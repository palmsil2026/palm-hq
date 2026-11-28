// 🔐 ประตูหน้าเว็บของ GAS เลขา (28/11) — รันต่อท้าย unit.test.js
//   เว็บแอปเปิดแบบ anonymous: หน้า HtmlService ทุกหน้าให้ google.script.run เรียกฟังก์ชันชั้นบนสุด
//   ที่ไม่ลงท้าย _ ได้ทุกตัว ใส่อาร์กิวเมนต์อะไรก็ได้ → คนไม่มีรหัสต้องไม่ได้หน้า HtmlService เลย
//   และตัวอ่านค่าลับ (Script Properties) ต้องลงท้าย _ เสมอ
const assert = require('assert');
const { makeEnv } = require('./harness');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };

t('เปิดหน้าบอร์ดด้วยรหัสผิด/ไม่มีรหัส → ตัวหนังสือธรรมดา ไม่ใช่ HtmlService', () => {
  for (const key of ['ผิด', '', undefined]) {
    const { ctx } = makeEnv();
    let html = 0;
    ctx.HtmlService = { createHtmlOutput: () => { html++; return {}; }, XFrameOptionsMode: {} };
    const res = ctx.doGet({ parameter: { page: 'board', key } });
    assert.strictEqual(html, 0, 'รหัสผิดห้ามได้หน้า HtmlService (key=' + key + ')');
    assert.ok(/รหัสไม่ถูกต้อง/.test(res.t), 'ต้องบอกว่ารหัสผิด');
  }
});

t('ตัวอ่านค่าลับลงท้าย _ — ชื่อเปิด cfg ไม่มีแล้ว', () => {
  const { ctx } = makeEnv();
  assert.strictEqual(typeof ctx.cfg, 'undefined', 'cfg ต้องไม่มี (google.script.run เรียกได้ = ค่าลับหลุด)');
  assert.strictEqual(typeof ctx.cfg_, 'function');
});

t('ยังไม่ได้ตั้ง QUEUE_KEY → รหัสว่างต้องไม่ผ่าน (บอร์ด · API)', () => {
  const { ctx } = makeEnv();
  ctx.PropertiesService.getScriptProperties().setProperty('QUEUE_KEY', '');
  assert.strictEqual(ctx.ownerKeyOk_(''), false);
  assert.strictEqual(ctx.ownerKeyOk_(undefined), false);
  const r = JSON.parse(ctx.doGet({ parameter: { action: 'board', key: '' } }).t);
  assert.strictEqual(r.ok, false);
});

t('ตั้ง QUEUE_KEY แล้ว → รหัสถูกผ่าน · รหัสผิดไม่ผ่าน', () => {
  const { ctx } = makeEnv();
  ctx.PropertiesService.getScriptProperties().setProperty('QUEUE_KEY', 'Qtest123');
  assert.strictEqual(ctx.ownerKeyOk_('Qtest123'), true);
  assert.strictEqual(ctx.ownerKeyOk_('Qtest12'), false);
});

t('ฟังก์ชันที่คืนรหัส/โทเคนลงท้าย _ ทุกตัว', () => {
  const { ctx } = makeEnv();
  for (const nm of ['cfg', 'execKey', 'learnKey', 'teamKey', 'productionChatToken', 'lakonChatToken', 'fleetToken', 'financeChatToken']) {
    assert.strictEqual(typeof ctx[nm], 'undefined', nm + ' ต้องลงท้าย _');
    assert.strictEqual(typeof ctx[nm + '_'], 'function', nm + '_ ต้องมี');
  }
});

console.log('🔐 ประตูหน้าเว็บ ผ่านเพิ่ม ' + n + ' ข้อ');

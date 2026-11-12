// 🧪 เฝ้าเครื่อง "เป่า 250 คอสั้น 6 ใบ (เพท4)" ในกลุ่ม TEAMWORK — ข้อความสมมติทั้งหมด ไม่แตะชีต/ไลน์จริง
//   รัน: node secretary/test/mw250.test.js (unit.test.js เรียกต่อท้ายให้เอง)
//   สเปก: origin-hq docs/ใบสั่งงาน-palm-hq-2026-11-12-เฝ้าเครื่อง-250คอสั้น6ใบ.md
const assert = require('assert');
const { makeEnv, ev, dm, replyText, OWNER, TW_GID } = require('./harness');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };

const at = (S, iso) => { S.now = new Date(iso); };
const m250 = S => JSON.parse(S.props.MW_PET250S6 || 'null');
const p10 = S => JSON.parse(S.props.P10_STATE || '{}');
const tw = (text, uid) => { const e = ev('text', { text }, TW_GID); e.source.userId = uid || 'Ustaff1'; return e; };
const isMw = p => typeof p.messages[0].content === 'string' && p.messages[0].content.indexOf('ข้อความใหม่ที่ต้องตัดสิน') !== -1;
const ownerPush = S => S.pushes.filter(x => x.to === OWNER).map(x => x.messages[0].text);
const health = ctx => { try { return ctx.healthCheck(); } catch (e) { return String(e && e.stack); } };

// สมองจำลอง: ตอบ JSON ตามกติกา (machine = เครื่องไหน)
const J = o => JSON.stringify(Object.assign({ about: 'ใช่', machine: 'PET250S6', sure: 'มั่นใจ', event: 'อื่น', mold: '', state_after: 'ไม่ทราบ', summary: '', who: '', eta: '' }, o));
const RULES = x => {
  if (/สกรีน|กลมเรียบ|คอยาว|กรัม/.test(x)) return { about: 'ไม่', machine: 'อื่น' };
  if (/เพท4.*1500/.test(x)) return { about: 'ไม่แน่ใจ', summary: 'เพท4 เป่าขวดอื่น?' };
  if (/PET10/.test(x)) return { machine: 'PET10', event: 'จอด', state_after: 'จอด', summary: 'PET10 จอด หัวเป่ารั่ว' };
  if (/หลอดติด/.test(x)) return { event: 'จอด', state_after: 'จอด', mold: '250 คอสั้น', summary: 'หยุดเป่า หลอดติดตรงโซ่ราง รอช่าง', who: 'กะเช้า' };
  if (/ลูกกลิ้งหลุด/.test(x)) return { event: 'จอด', state_after: 'จอด', summary: 'ลูกกลิ้งหลุด ปิดเครื่องไว้ก่อน', eta: 'พรุ่งนี้' };
  if (/หยุดๆ|โยนหลอด/.test(x)) return { event: 'ซ่อม', state_after: 'ซ่อม', summary: 'เป่าๆหยุดๆ โยนหลอดไม่ตรงลูกกลิ้ง กำลังแก้' };
  if (/เสร็จ|เดินได้/.test(x)) return { event: 'เดินเครื่อง', state_after: 'เดิน', mold: '250 คอสั้น', summary: 'แก้ไขเสร็จ เพท4 พร้อมเป่า 250 คอสั้น' };
  if (/ขวดไม่มี/.test(x)) return { event: 'ขวดไม่พอ', summary: 'ขวด 250 คอสั้นไม่มีให้โรงน้ำผลิตน้ำ' };
  return { about: 'ไม่', machine: 'อื่น' };
};
const ai = body => {
  const c = body.messages[0].content;
  if (typeof c === 'string' && c.indexOf('ข้อความใหม่ที่ต้องตัดสิน') !== -1) {
    const m = c.match(/ข้อความใหม่ที่ต้องตัดสิน — [^\n]*?: "([\s\S]*?)"\n\n/);
    return J(RULES(m ? m[1] : ''));
  }
  return 'เกี่ยวข้อง: ไม่';
};
// แท็บ MachineWatch จำลอง (ดูว่าช่อง "แจ้งคุณปาล์ม" ถูกเขียนผลจริงทับ "รอแจ้ง")
const fakeSheet = ctx => {
  const rows = [['หัว']];
  const s = { appendRow: r => rows.push(r.slice()), getLastRow: () => rows.length,
              getRange: (r, c) => ({ setValue: v => { rows[r - 1][c - 1] = v; } }) };
  ctx.learnSheet = () => s;
  return rows;
};
const D1 = '2026-11-13T01:00:00Z';   // 13/11 08:00 ไทย
const REAL = {
  stop: '250 คอสั้น6ใบหยุดเป่าครับเนื่องจากหลอดติดตรงโซ่ราง กำลังรอช่างมาแก้ไข',
  jerky: 'เพท250คอสั้น6ใบเป่าๆหยุดๆ ช่างดูแล้วโยนหลอดไม่ตรงลูกกลิ้งกำลังแก้ไข',
  off: 'ทำการปิดไปก่อนจ้าวลูกกลิ้งหลุดจ้าวเพท250คอสั้น6ใบ',
  done: 'เพท4 แก้ไขเสร็จพร้อมเปล่าครับ',
  short: 'ขวดไม่มีให้โรงน้ำผลิตน้ำเลย'
};

t('250: ชื่อเรียกหลายแบบผ่านด่าน 1 · คำเรื่องเครื่องเสีย (ลูกกลิ้ง/หลอดติด/ปิดเครื่อง) ส่ง AI · คุยเล่น/"พรุ่งนี้หยุด" ไม่ส่ง', () => {
  const { ctx } = makeEnv();
  for (const x of [REAL.stop, REAL.jerky, REAL.off, REAL.done, '250.คอสั้นหยุดเป่า', 'เพท250ml.คอสั้น6ใบ เดินได้', '250 ml คอสั้น ok', 'คอสั้น 250 หมด',
                   'เครื่อง 6 ใบ ติดโซ่', 'PET4 จอด', 'pet-4 ok', 'เพ็ท 4 เปลี่ยนโมลด์'])
    assert.strictEqual(ctx.p10Candidate(x, {}, 0, ''), 2, x);
  for (const x of ['ก้ามปูหักครับ', 'ลูกกลิ้งหลวม', 'ปิดเครื่องก่อนนะ', 'หลอดติดอีกแล้ว', 'ขวดไม่มีให้ผลิตเลย', '250 กลมเรียบ เพท2 หยุด'])
    assert.strictEqual(ctx.p10Candidate(x, {}, 0, ''), 1, x);
  for (const x of ['กินข้าวยังครับ', 'พรุ่งนี้หยุดครับ', 'เพท40 ตัว', 'PET 41'])
    assert.strictEqual(ctx.p10Candidate(x, {}, 0, ''), 0, x);
  const now = Date.now();
  assert.strictEqual(ctx.p10Candidate('ได้แล้วครับ', { state: 'เดิน', updated: now }, now, '', [{ state: 'จอด', updated: now - 3600e3 }]), 1, 'เครื่อง 250 จอดอยู่ คำตอบสั้นก็ส่ง');
  assert.strictEqual(ctx.p10Candidate('อันนี้ครับ', {}, now, 'M9', [{ ids: ['M9'] }]), 2, 'กดตอบกลับข้อความเรื่องเครื่อง 250');
});

t('250: สถานะตั้งต้น = จอด ตั้งแต่ 12/11 17:26 (ลูกกลิ้งหลุด · ช่างต่อพรุ่งนี้) ไม่แจ้ง · ถาม "เครื่อง 250" / "250 คอสั้น" / "เพท4" ตอบเครื่องนี้ · "เครื่องเป่าขวด" ตอบทั้ง 2 เครื่อง', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-12T16:00:00Z'), ai });
  const s0 = ctx.p10Load('PET250S6');
  assert.deepStrictEqual([s0.state, ctx.p10Dt(s0.since), s0.mold, !!s0.seeded], ['จอด', '12/11 17:26', '250 คอสั้น', true]);
  assert.ok(/ลูกกลิ้งหลุด/.test(s0.reason) && /พรุ่งนี้/.test(s0.eta));
  ctx.handleEvent(tw('อรุณสวัสดิ์ครับ'));
  ctx.fireDueReminders();
  assert.strictEqual(ownerPush(S).length, 0, 'สถานะตั้งต้นไม่แจ้ง');
  const before = S.prompts.length;
  for (const q of ['เครื่อง 250', '250 คอสั้น', 'เพท4', 'เพท4 เป็นไง', 'เครื่อง 250 ล่ะ', 'PET4 สถานะ']) {
    S.replies.length = 0; ctx.handleEvent(dm(OWNER, q));
    const r = replyText(S);
    assert.ok(/^🍾 เป่า 250 คอสั้น 6 ใบ \(เพท4\) — ⛔ จอดเครื่อง ตั้งแต่ 12\/11 17:26/.test(r), q + '\n' + r);
    assert.ok(/ลูกกลิ้งหลุด/.test(r) && /สถานะตั้งต้นจากแชท 12\/11/.test(r) && !/PET10/.test(r.split('แก้เองได้')[0]), r);
  }
  assert.strictEqual(S.prompts.length, before, 'ตอบจากสถานะที่จด ไม่เรียกสมอง');
  S.replies.length = 0; ctx.handleEvent(dm(OWNER, 'เครื่องเป่าขวดเป็นไงบ้าง'));
  const both = replyText(S);
  assert.ok(/🍾 PET10/.test(both) && /🍾 เป่า 250 คอสั้น 6 ใบ \(เพท4\) — ⛔ จอดเครื่อง/.test(both), both);
  S.replies.length = 0; ctx.handleEvent(dm(OWNER, 'PET10 เป็นไง'));
  assert.ok(/🍾 PET10/.test(replyText(S)) && !/250 คอสั้น 6 ใบ/.test(replyText(S)), 'ถาม PET10 = เฉพาะ PET10');
  for (const q of ['ขวด 250 คอสั้นเหลือเท่าไหร่', 'สั่งขวด 250 คอสั้นเพิ่มดีไหม', 'ช่วยร่างข้อความถึงโรงขวดเรื่องตารางเป่า 250 คอสั้นให้หน่อย'])
    assert.strictEqual(ctx.p10OwnerText(q, 'rt', OWNER), false, q);
});

t('250: ข้อความจริง — "แก้ไขเสร็จพร้อมเปล่า" = เดิน · หยุด 3 ครั้งใน 30 นาที → รวมเป็น push เดียว (หยุดกี่ครั้ง · จอดรวม) · PET10 ไม่ถูกแตะ · กลุ่มเงียบ', () => {
  const { ctx, S } = makeEnv({ now: new Date(D1), ai });
  ctx.handleEvent(tw(REAL.done));
  const p = S.prompts.filter(isMw);
  assert.strictEqual(p.length, 1); assert.strictEqual(p[0].model, 'claude-haiku-5-5');
  const c = p[0].messages[0].content;
  assert.ok(c.indexOf('"machine":"PET10|PET250S6|อื่น"') !== -1 && /PET250S6 = เครื่องเป่า 250 คอสั้น 6 ใบ \(คือ เพท4/.test(c), 'พรอมต์รู้จัก 2 เครื่อง');
  assert.ok(/สกรีน 250 คอสั้น s1/.test(c) && /250 กลมเรียบ \(เพท2\)/.test(c) && /เครื่องฉีดหลอด/.test(c), 'พรอมต์บอกเครื่องที่ไม่ใช่');
  assert.ok(c.indexOf(REAL.stop) !== -1 && /"เพท4 แก้ไขเสร็จพร้อมเปล่าครับ" → PET250S6 · เดินเครื่อง · เดิน/.test(c), 'ตัวอย่างจริงในพรอมต์');
  assert.ok(/PET250S6: จอด · โมลด์ 250 คอสั้น · ตั้งแต่ 12\/11 17:26/.test(c), 'สถานะเครื่อง 250 ในพรอมต์');
  assert.strictEqual(m250(S).state, 'เดิน'); assert.ok(!m250(S).seeded); assert.strictEqual(m250(S).pend.length, 1);
  assert.ok(!p10(S).state, 'PET10 ไม่ถูกแตะ');
  at(S, '2026-11-13T01:15:00Z'); ctx.fireDueReminders();
  assert.strictEqual(ownerPush(S).length, 0, 'เครื่อง 250 รวม 30 นาที');
  at(S, '2026-11-13T01:31:00Z'); ctx.fireDueReminders();
  let own = ownerPush(S);
  assert.strictEqual(own.length, 1);
  assert.ok(/^🍾 เป่า 250 คอสั้น 6 ใบ \(เพท4\) — ✅ เดินเครื่อง ตั้งแต่ 08:00\n/.test(own[0]), own[0]);
  assert.ok(/💬 "เพท4 แก้ไขเสร็จพร้อมเปล่าครับ"$/.test(own[0]), own[0]);
  // หยุด-เดิน-หยุด-เดิน-ซ่อม ภายใน 30 นาที
  [['02:00', REAL.stop], ['02:05', 'เพท4 เดินได้แล้วครับ'], ['02:10', REAL.off], ['02:15', REAL.done], ['02:25', REAL.jerky]]
    .forEach(([hm, x]) => { at(S, '2026-11-13T' + hm + ':00Z'); ctx.handleEvent(tw(x)); });
  at(S, '2026-11-13T02:29:00Z'); ctx.fireDueReminders();
  assert.strictEqual(ownerPush(S).length, 1, 'ยังไม่ครบ 30 นาทีจากเรื่องแรก');
  at(S, '2026-11-13T02:31:00Z'); ctx.fireDueReminders(); ctx.p10Flush(false);
  own = ownerPush(S);
  assert.strictEqual(own.length, 2, 'รวมเป็นข้อความเดียว');
  assert.ok(/^🍾 เป่า 250 คอสั้น 6 ใบ \(เพท4\) — 🔧 กำลังซ่อม ตั้งแต่ 09:25/.test(own[1]), own[1]);
  assert.ok(/เหตุการณ์ 5 เรื่อง:\n• 09:00 หยุดเป่า หลอดติดตรงโซ่ราง รอช่าง \(กะเช้า\)/.test(own[1]), own[1]);
  assert.ok(/• วันนี้หยุดแล้ว 3 ครั้ง · จอดรวม ~8 ชม\. 16 นาที/.test(own[1]), 'จอดค้างจากเมื่อวานถึง 08:00 + 5 + 5 + 6 นาที\n' + own[1]);
  assert.strictEqual(m250(S).day.stops, 3); assert.strictEqual(m250(S).pushes['2026-11'], 2);
  assert.ok(!p10(S).state && !(p10(S).pend || []).length, 'PET10 ไม่ถูกแตะ');
  assert.strictEqual(S.replies.length, 0, 'กลุ่มเงียบ 100%');
  assert.ok(S.logs.some(l => l[0] === 'เฝ้า 250คอสั้น6ใบ') && S.logs.some(l => l[0] === 'แจ้ง เครื่อง 250 คอสั้น' && l[3] === 'ส่งแล้ว'));
});

t('250: เครื่องอื่น (สกรีน 250 s1 / 250 กลมเรียบ เพท2 / 250 คอยาว / ฉีดหลอด 13.5 กรัม) → ไม่จด ไม่แจ้ง · เพท4 เป่าขวดอื่น = ไม่แน่ใจ (ไม่นับ แต่โชว์ตอนถาม)', () => {
  const { ctx, S } = makeEnv({ now: new Date(D1), ai });
  for (const x of ['สกรีน 250 คอสั้น s1 เสียครับ', '250 กลมเรียบ เพท2 หยุดเป่า', '250 คอยาวโมลด์ติด', 'เครื่องฉีดหลอด 13.5 กรัม หยุด'])
    ctx.handleEvent(tw(x));
  assert.strictEqual(S.prompts.filter(isMw).length, 3, 'ฉีดหลอด 13.5 กรัม ไม่มีคำเรื่องเครื่อง 250 = ไม่ผ่านด่าน 1 เลย');
  assert.strictEqual(m250(S), null, 'สถานะเครื่อง 250 ไม่ถูกเขียน'); assert.ok(!p10(S).state);
  ctx.handleEvent(tw('เพท4 วันนี้เป่า 1500 ครับ'));
  assert.strictEqual(m250(S).unsure.length, 1); assert.strictEqual(m250(S).state, 'จอด', 'ไม่แน่ใจ = ไม่เปลี่ยนสถานะ');
  at(S, '2026-11-13T02:00:00Z'); ctx.fireDueReminders(); ctx.p10Flush(true);
  assert.strictEqual(ownerPush(S).length, 0);
  ctx.handleEvent(dm(OWNER, 'เพท4'));
  assert.ok(/❔ ไม่แน่ใจว่าเกี่ยว เครื่อง 250 คอสั้น \(ยังไม่นับ\):\n• 13\/11 08:00 .*"เพท4 วันนี้เป่า 1500 ครับ"/.test(replyText(S)), replyText(S));
  assert.strictEqual(S.replies.length, 1, 'ตอบเฉพาะคุณปาล์มในแชทส่วนตัว');
  // parse: machine อื่น = ไม่เกี่ยวเสมอ · รูปแบบเดิม (about_pet10) = PET10 · เขียน PET4/250 = เครื่อง 250
  assert.deepStrictEqual(['about', 'machine'].map(k => ctx.p10Parse('{"about":"ใช่","machine":"อื่น"}')[k]), ['ไม่', 'อื่น']);
  assert.strictEqual(ctx.p10Parse('{"about_pet10":"ใช่"}').machine, 'PET10');
  assert.strictEqual(ctx.p10Parse('{"about":"ใช่","machine":"PET 4"}').machine, 'PET250S6');
  assert.strictEqual(ctx.p10Parse('{"about":"ใช่","machine":"pet250s6"}').machine, 'PET250S6');
});

t('250: "ขวดไม่มีให้โรงน้ำผลิตน้ำเลย" → แจ้งคุณปาล์มทันที (ไม่รอรวม 30 นาที) · ใน 3 ชม. ไม่แจ้งซ้ำ', () => {
  const { ctx, S } = makeEnv({ now: new Date(D1), ai });
  ctx.handleEvent(tw(REAL.short));
  const own = ownerPush(S);
  assert.strictEqual(own.length, 1, 'ส่งทันที');
  assert.ok(/^🍾 เป่า 250 คอสั้น 6 ใบ \(เพท4\)/.test(own[0]) && /⚠️ มีคนบอกว่าขวดไม่พอ\/เป่าไม่ทัน/.test(own[0]) && /ขวด 250 คอสั้นไม่มีให้โรงน้ำผลิตน้ำ/.test(own[0]), own[0]);
  at(S, '2026-11-13T02:00:00Z'); ctx.handleEvent(tw(REAL.short));
  at(S, '2026-11-13T02:40:00Z'); ctx.p10Flush(false);
  assert.strictEqual(ownerPush(S).length, 1, 'ภายใน 3 ชม. ไม่แจ้งซ้ำ');
  assert.strictEqual(m250(S).day.short, 2); assert.strictEqual(S.replies.length, 0);
});

t('250: เรื่อง PET10 ยังไปเครื่อง PET10 เหมือนเดิม (รวม 10 นาที) · ไม่แตะเครื่อง 250', () => {
  const { ctx, S } = makeEnv({ now: new Date(D1), ai });
  ctx.handleEvent(tw('PET10 จอดครับ'));
  assert.strictEqual(p10(S).state, 'จอด'); assert.strictEqual(m250(S), null);
  at(S, '2026-11-13T01:11:00Z'); ctx.fireDueReminders();
  const own = ownerPush(S);
  assert.strictEqual(own.length, 1); assert.ok(/^🍾 PET10 \(โรงขวด\) — ⛔ จอดเครื่อง ตั้งแต่ 08:00/.test(own[0]), own[0]);
});

t('250: คุณปาล์มแก้เอง "เพท4 เดินแล้ว" / "เครื่อง 250 จอด" → จดเครื่อง 250 (PET10 ไม่เปลี่ยน) · ล้างคิวแจ้ง · ไม่ push', () => {
  const { ctx, S } = makeEnv({ now: new Date(D1), ai });
  ctx.handleEvent(tw(REAL.stop.replace('หยุดเป่า', 'หยุดเป่าอีก')));
  ctx.handleEvent(tw('PET10 จอดครับ'));
  at(S, '2026-11-13T01:05:00Z'); ctx.handleEvent(dm(OWNER, 'เพท4 เดินแล้ว'));
  assert.ok(/จดสถานะ เครื่อง 250 คอสั้น เป็น ✅ เดินเครื่อง · โมลด์ 250 คอสั้น/.test(replyText(S)), replyText(S));
  assert.deepStrictEqual([m250(S).state, m250(S).by, m250(S).pend.length], ['เดิน', 'คุณปาล์ม', 0]);
  assert.strictEqual(p10(S).state, 'จอด', 'PET10 ไม่เปลี่ยน');
  ctx.handleEvent(dm(OWNER, 'เครื่อง 250 จอด'));
  assert.strictEqual(m250(S).state, 'จอด');
  at(S, '2026-11-13T02:00:00Z'); ctx.p10Flush(false, 'PET250S6');
  assert.strictEqual(ownerPush(S).filter(x => /250/.test(x)).length, 0);
});

t('250: สรุปรายวัน 18:30 — วันมีปัญหา: หยุดกี่ครั้ง · จอดรวม · สาเหตุ · สาเหตุซ้ำหลายวัน · แผนพรุ่งนี้มี 250 คอสั้น/600 mk ไหม · วันละครั้ง', () => {
  const d = Date.parse('2026-11-13T00:00:00+07:00');
  const props = { GROUP_TEAMWORK_ID: TW_GID,
    P10_STATE: JSON.stringify({ watchFrom: d - 86400e3, state: 'เดิน', mold: '600 mk คอสั้น', updated: d, since: d - 86400e3 }),
    MW_PET250S6: JSON.stringify({ state: 'เดิน', mold: '250 คอสั้น', updated: d + 10 * 3600e3, since: d + 10 * 3600e3,
      day: { d: '2026-11-13', stops: 2, downMs: 50 * 60000, downSince: 0, causes: ['หลอดติดตรงโซ่ราง', 'ลูกกลิ้งหลุด'], short: 0 },
      hist: [{ d: '2026-11-12', k: ['ลูกกลิ้ง'] }] })
  };
  const { ctx, S } = makeEnv({ now: new Date('2026-11-13T11:00:00Z') /* 18:00 */, ai, props });
  ctx.recentGroupRows = () => [{ t: Date.parse('2026-11-13T16:40:00+07:00'), name: 'หัวหน้ากะ', text: 'พรุ่งนี้เป่า 600 mk คอสั้น กับ 1500 นะครับ' }];
  ctx.fireDueReminders();
  assert.strictEqual(ownerPush(S).length, 0, 'ก่อน 18:30 ไม่ส่ง');
  at(S, '2026-11-13T11:31:00Z'); ctx.fireDueReminders();
  const own = ownerPush(S);
  assert.strictEqual(own.length, 1, JSON.stringify(own));
  assert.ok(/^🍾 สรุปเครื่องเป่าขวดวันนี้ \(13\/11\)\n\nเป่า 250 คอสั้น 6 ใบ \(เพท4\) — หยุด 2 ครั้ง · จอดรวม ~50 นาที · ตอนนี้ ✅ เดินเครื่อง/.test(own[0]), own[0]);
  assert.ok(/• สาเหตุ: หลอดติดตรงโซ่ราง · ลูกกลิ้งหลุด/.test(own[0]) && /• ⚠️ สาเหตุซ้ำ: ลูกกลิ้ง \(2 วัน\)/.test(own[0]), own[0]);
  assert.ok(/📋 แผนพรุ่งนี้ \(16:40 หัวหน้ากะ\): "พรุ่งนี้เป่า 600 mk คอสั้น กับ 1500 นะครับ"\n⚠️ ไม่มี 250 คอสั้น · ✅ มี 600 mk/.test(own[0]), own[0]);
  assert.ok(!/PET10 \(โรงขวด\) — หยุด/.test(own[0]), 'PET10 ไม่มีปัญหา = ไม่ใส่');
  at(S, '2026-11-13T11:46:00Z'); ctx.fireDueReminders(); ctx.mwDailySummary(false);
  assert.strictEqual(ownerPush(S).length, 1, 'วันละครั้ง');
  assert.strictEqual(S.props.MW_DAILY_SENT, '2026-11-13');
});

t('250: สรุปรายวัน — วันปกติ + แผนพรุ่งนี้ครบ = ไม่ส่ง · ปกติแต่แผนพรุ่งนี้ไม่มี 250 คอสั้น = ส่งเตือนแผน · เปลี่ยนวัน = เก็บสาเหตุไว้เทียบ', () => {
  const d = Date.parse('2026-11-13T00:00:00+07:00');
  const props = { GROUP_TEAMWORK_ID: TW_GID, P10_STATE: JSON.stringify({ watchFrom: d - 86400e3 }), MW_PET250S6: JSON.stringify({ state: 'เดิน', mold: '250 คอสั้น', updated: d - 3600e3, since: d - 3600e3 }) };
  const a = makeEnv({ now: new Date('2026-11-13T11:31:00Z'), ai, props });
  a.ctx.recentGroupRows = () => [{ t: d + 16 * 3600e3, name: 'หัวหน้ากะ', text: 'พรุ่งนี้เป่า 250 คอสั้น 6 ใบ กับ 600mk คอสั้นครับ' }];
  a.ctx.fireDueReminders();
  assert.strictEqual(ownerPush(a.S).length, 0, 'วันปกติไม่ส่ง (ประหยัดโควตาไลน์)'); assert.strictEqual(a.S.props.MW_DAILY_SENT, '2026-11-13');
  const b = makeEnv({ now: new Date('2026-11-13T11:31:00Z'), ai, props });
  b.ctx.recentGroupRows = () => [{ t: d + 16 * 3600e3, name: 'หัวหน้ากะ', text: 'พรุ่งนี้เป่า 1500 ทั้งวันครับ' }];
  b.ctx.fireDueReminders();
  const own = ownerPush(b.S);
  assert.strictEqual(own.length, 1); assert.ok(/เครื่องไม่มีปัญหาวันนี้/.test(own[0]) && /⚠️ ไม่มี 250 คอสั้น · ⚠️ ไม่มี 600 mk/.test(own[0]), own[0]);
  const c = makeEnv({ now: new Date(D1) });
  const s = { state: 'เดิน', day: { d: '2026-11-12', stops: 4, downMs: 0, downSince: 0, causes: ['ลูกกลิ้งหลุด ปิดเครื่อง', 'หลอดติดโซ่ราง'], short: 0 } };
  const day = c.ctx.mwDayTouch(s, Date.parse(D1));
  assert.strictEqual(day.d, '2026-11-13'); assert.strictEqual(day.stops, 0);
  // ไม่มีใครพูดถึงทั้งวัน (สถานะตั้งต้นจอด) → สรุปบอกตรง ๆ ว่านับจากสถานะล่าสุด ไม่เดา
  const e = makeEnv({ now: new Date('2026-11-13T11:31:00Z'), ai, props: { GROUP_TEAMWORK_ID: TW_GID, P10_STATE: JSON.stringify({ watchFrom: d - 86400e3 }) } });
  e.ctx.recentGroupRows = () => [];
  e.ctx.fireDueReminders();
  const eo = ownerPush(e.S);
  assert.strictEqual(eo.length, 1);
  assert.ok(/เป่า 250 คอสั้น 6 ใบ \(เพท4\) — หยุด 0 ครั้ง · จอดรวม ~18 ชม\. 31 นาที · ตอนนี้ ⛔ จอดเครื่อง\n• วันนี้ไม่มีใครพูดถึงเครื่องนี้ — นับจากสถานะล่าสุด 12\/11 17:26 \(สถานะตั้งต้น\) อาจไม่ตรงของจริง/.test(eo[0]), eo[0]);
  assert.ok(/📋 ยังไม่เห็นแผน "พรุ่งนี้เป่า…" ในกลุ่มวันนี้/.test(eo[0]), eo[0]);
  assert.strictEqual(JSON.stringify(s.hist), JSON.stringify([{ d: '2026-11-12', k: ['ลูกกลิ้ง', 'โซ่', 'หลอดติด'] }]));
});

t('250: ช่อง "แจ้งคุณปาล์ม" ใน MachineWatch — ส่งได้ = "แจ้งแล้ว เวลา" · คุณปาล์มถามเอง = "คุณปาล์มรู้แล้ว" (ไม่ค้าง "รอแจ้ง")', () => {
  const { ctx, S } = makeEnv({ now: new Date(D1), ai });
  const rows = fakeSheet(ctx);
  ctx.handleEvent(tw(REAL.done));
  assert.deepStrictEqual([rows[1][1], rows[1][11]], ['PET250S6', 'รอแจ้ง']);
  assert.strictEqual(m250(S).pend[0].row, 2, 'จำเลขแถวไว้');
  at(S, '2026-11-13T01:31:00Z'); ctx.p10Flush(false);
  assert.strictEqual(rows[1][11], 'แจ้งแล้ว 13/11 08:31');
  at(S, '2026-11-13T02:00:00Z'); ctx.handleEvent(tw(REAL.stop));
  assert.strictEqual(rows[2][11], 'รอแจ้ง');
  ctx.handleEvent(dm(OWNER, 'เครื่อง 250'));
  assert.ok(/^คุณปาล์มรู้แล้ว \(ถาม\/แก้เอง 13\/11 09:00\)$/.test(rows[2][11]), rows[2][11]);
  assert.strictEqual(m250(S).pend.length, 0);
});

t('250: โควตาไลน์เดือนนี้หมด (429 monthly limit) → จดธง หยุดยิงซ้ำทุก tick · ช่องชีต = ส่งไม่ออก · เช็คระบบ/ตอบถามบอกว่าโควตาหมด · 6 ชม. ลองใหม่ · เกิน 6 ชม. เลิก', () => {
  const run = JSON.stringify({ state: 'เดิน', mold: '250 คอสั้น', updated: Date.parse(D1) - 3600e3, since: Date.parse(D1) - 3600e3 });
  const { ctx, S } = makeEnv({ now: new Date(D1), ai, props: { MW_PET250S6: run } });
  const rows = fakeSheet(ctx);
  ctx.handleEvent(tw(REAL.stop));
  S.pushCode = 429; S.pushResp = { message: 'You have reached your monthly limit.' };
  at(S, '2026-11-13T01:31:00Z'); assert.strictEqual(ctx.p10Flush(false), false);
  const tries = S.pushes.length;
  assert.ok(S.props.LINE_QUOTA_OUT); assert.strictEqual(m250(S).pushErr, 'โควตาไลน์เดือนนี้หมด (LINE 429 monthly limit)');
  assert.strictEqual(m250(S).pend.length, 1, 'ยังเก็บไว้ลองใหม่');
  assert.ok(/^ส่งไม่ออก: โควตาไลน์หมด 13\/11 08:31 — จะลองใหม่$/.test(rows[1][11]), rows[1][11]);
  for (const hm of ['01:46', '02:01', '02:16']) { at(S, '2026-11-13T' + hm + ':00Z'); ctx.fireDueReminders(); }
  ctx.handleEvent(tw(REAL.done)); ctx.p10Flush(true);
  assert.strictEqual(S.pushes.length, tries, 'ธงโควตาหมด = ไม่ยิงซ้ำ');
  const h = health(ctx);
  assert.ok(/⚠️ 🍾 โควตาไลน์เดือนนี้หมด — แจ้งเครื่องเป่าขวดส่งเองไม่ได้/.test(h) && /⚠️ 🍾 แจ้ง เครื่อง 250 คอสั้น ล่าสุดส่งไม่ออก: โควตาไลน์เดือนนี้หมด/.test(h), h);
  S.replies.length = 0; ctx.handleEvent(dm(OWNER, 'เครื่อง 250'));
  assert.ok(/⚠️ โควตาไลน์เดือนนี้หมด — ดิฉันส่งแจ้งเตือนเองไม่ได้/.test(replyText(S)), replyText(S));
  assert.strictEqual(m250(S).pend.length, 0, 'คุณปาล์มถามเองแล้ว = ล้างคิว');
  // ลองใหม่หลัง 6 ชม. (ยังหมดอยู่) → เรื่องค้างเกิน 6 ชม. = เลิกลอง ช่องชีตบอกว่าเลิก
  ctx.handleEvent(tw(REAL.off));   // 09:16 เข้าคิวใหม่
  at(S, '2026-11-13T08:10:00Z'); ctx.p10Flush(false);   // 15:10 ธง (08:31) ครบ 6 ชม. → ลองอีกครั้ง · เรื่องค้าง 5 ชม. 54 นาที = ยังเก็บไว้
  assert.strictEqual(S.pushes.length, tries + 1, 'ครบ 6 ชม. ลองอีกครั้ง'); assert.strictEqual(m250(S).pend.length, 1);
  at(S, '2026-11-13T08:40:00Z'); ctx.p10Flush(false);
  assert.strictEqual(S.pushes.length, tries + 1, 'ธงใหม่ (15:10) = ไม่ยิงซ้ำ');
  at(S, '2026-11-13T14:15:00Z'); ctx.p10Flush(false);   // 21:15 ลองอีกครั้ง → เรื่องค้างเกิน 6 ชม. = เลิก
  assert.strictEqual(S.pushes.length, tries + 2);
  assert.strictEqual(m250(S).pend.length, 0, 'เกิน 6 ชม. = เลิก');
  assert.ok(/\(เลิกลองแล้ว\)$/.test(rows[3][11]), rows[3][11]);
  // ซื้อโควตาเพิ่ม/ขึ้นเดือนใหม่ → ส่งได้ตามปกติ
  S.pushCode = 200; delete S.pushResp; delete S.props.LINE_QUOTA_OUT;
  at(S, '2026-11-13T15:00:00Z'); ctx.handleEvent(tw(REAL.done));
  at(S, '2026-11-13T15:31:00Z'); assert.strictEqual(ctx.p10Flush(false), true);
});

t('250: เช็คระบบ บรรทัด 🍾 เครื่อง 250 — สถานะล่าสุด (ตั้งต้น) · หยุดวันนี้ · แจ้งเดือนนี้ · สรุปรายวัน 18:30 · บรรทัด PET10 ยังอยู่', () => {
  const { ctx } = makeEnv({ now: new Date('2026-11-12T16:00:00Z'), ai });
  const base = ctx.listKnownGroups; ctx.listKnownGroups = () => base().concat([{ id: TW_GID, name: 'TEAMWORK โรงขวด' }]);
  const h = health(ctx);
  assert.ok(/✅ 🍾 เฝ้า PET10: รู้จักกลุ่ม TEAMWORK แล้ว/.test(h), h);
  assert.ok(/✅ 🍾 เฝ้า เป่า 250 คอสั้น 6 ใบ \(เพท4\): ล่าสุด ⛔ จอดเครื่อง \(12\/11 17:26 · สถานะตั้งต้น\) · วันนี้หยุด 0 ครั้ง · แจ้งเดือนนี้ 0 ครั้ง \(ถาม "เครื่อง 250" ได้ · สรุปรายวัน 18:30 เฉพาะวันที่มีปัญหา\)/.test(h), h);
});

console.log('\n🍾 เครื่อง 250 คอสั้น 6 ใบ ผ่านทั้งหมด ' + n + ' ข้อ');

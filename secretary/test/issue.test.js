// 🧪 นักพัฒนา — คนแท็กคุณปาล์มแจ้งปัญหาแอป → ชีต AppIssues → Routine ดึง/รับ/ส่งผล (ข้อมูลสมมติ ชีตจำลอง ไม่แตะของจริง)
//   รัน: node secretary/test/issue.test.js (unit.test.js เรียกต่อท้ายให้เอง)
const assert = require('assert');
const { makeEnv, OWNER, OTHER_GID } = require('./harness');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };

const STAFF = 'Ustaff00000000000000000000000000';
const H = ['Issue_ID', 'เวลา', 'groupId', 'กลุ่ม', 'senderId', 'ผู้แจ้ง', 'ข้อความ', 'รูป', 'สถานะ', 'รับเมื่อ', 'เสร็จเมื่อ', 'ตอบในกลุ่ม', 'สรุปคุณปาล์ม', 'PR', 'เวอร์ชัน'];   // หัวชีต AppIssues ตามสเปก
const ACK = 'รับเรื่องแล้วค่ะ 🛠️ ส่งให้นักพัฒนาตรวจแล้วนะคะ ได้ผลแล้วจะแจ้งในนี้ค่ะ';
const IMG = 'https://drive.google.com/file/d/Fimg1/view';
const FIRE = 'https://api.anthropic.com/v1/claude_code/routines/trig_test/fire';

// ชีตจำลอง (getRange/appendRow/getLastRow แบบที่โค้ดใช้)
function fakeSheet(rows) {
  const d = rows.map(r => r.slice());
  return {
    d,
    getLastRow: () => d.length,
    getLastColumn: () => d.reduce((m, r) => Math.max(m, r.length), 0),
    appendRow: r => { d.push(r.slice()); },
    getRange: (r, c, nr, nc) => ({
      getValues: () => d.slice(r - 1, r - 1 + (nr || 1)).map(row => { const o = []; for (let j = 0; j < (nc || 1); j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); return o; }),
      setValue: v => { d[r - 1][c - 1] = v; }
    })
  };
}

function env(opts) {
  opts = opts || {};
  const E = makeEnv({ props: Object.assign({ LEARN_KEY: 'Lkey' }, opts.props || {}), ai: opts.ai, now: opts.now });
  const { ctx } = E;
  E.issues = fakeSheet([H.slice()].concat(opts.issueRows || []));
  E.chat = opts.chat || [];   // {t, chat, uid, name, text}
  ctx.issueSheet = () => E.issues;
  ctx.recentGroupRows = (chat, from, to) => E.chat.filter(m => m.chat === chat && m.t >= from && m.t <= to);
  ctx.issueImage = url => ({ name: 'x.jpg', mime: 'image/jpeg', b64: 'B64:' + url });
  ctx.lineUserName = uid => (uid === STAFF ? 'น้องเซลส์' : 'LINE');
  return E;
}
const col = (E, name) => H.indexOf(name);
const cell = (E, row, name) => E.issues.d[row][col(E, name)];
const tag = (text, extra) => ({ type: 'message', replyToken: 'rtI', timestamp: 1760000000000,
  source: { type: 'group', groupId: OTHER_GID, userId: (extra && extra.uid) || STAFF },
  message: Object.assign({ id: 'MI' + Math.random().toString(36).slice(2, 8), type: 'text', text,
    mention: { mentionees: [{ index: 0, length: 5, userId: OWNER, type: 'user' }] } }, (extra && extra.msg) || {}) });
const fires = S => S.fetches.filter(f => f.url === FIRE);
const ISSUE_AI = () => 'ISSUE';
const NOW = new Date('2026-10-19T01:30:00Z').getTime();   // ตรงกับ now ของ harness (08:30 ไทย)

t('แท็กคุณปาล์มแจ้งปัญหาแอป → เปิดเคส AppIssues (รูปก่อนแท็กติดมา) + ตอบรับด้วย reply ฟรี + ปลุก Routine นักพัฒนา', () => {
  const E = env({ ai: ISSUE_AI, props: { ISSUE_ROUTINE_FIRE_URL: FIRE, ISSUE_ROUTINE_TOKEN: 'tok' },
    chat: [{ t: NOW - 3 * 60000, chat: OTHER_GID, uid: STAFF, name: 'น้องเซลส์', text: '[ส่งรูป/ไฟล์] หน้าจอแอปเซลส์ค้าง ' + IMG },
           { t: NOW - 2 * 60000, chat: OTHER_GID, uid: 'Uother', name: 'คนอื่น', text: '[ส่งรูป/ไฟล์] รูปคนอื่น https://drive.google.com/file/d/Fnot/view' }] });
  const { ctx, S } = E;
  ctx.handleEvent(tag('@Palm แอปเซลส์กดบันทึกบิลแล้วค้างค่ะ'));
  assert.strictEqual(E.issues.d.length, 2);
  assert.strictEqual(cell(E, 1, 'Issue_ID'), 'IS261019-001');
  assert.strictEqual(cell(E, 1, 'สถานะ'), 'ใหม่');
  assert.strictEqual(cell(E, 1, 'groupId'), OTHER_GID);
  assert.strictEqual(cell(E, 1, 'senderId'), STAFF);
  assert.strictEqual(cell(E, 1, 'ผู้แจ้ง'), 'น้องเซลส์');
  assert.strictEqual(cell(E, 1, 'กลุ่ม'), 'กลุ่มคุยเล่น');
  assert.strictEqual(cell(E, 1, 'รูป'), IMG, 'เอาเฉพาะรูปของคนแจ้ง');
  assert.deepStrictEqual(S.replies.map(r => [r.replyToken, r.messages[0].text]), [['rtI', ACK]]);
  assert.strictEqual(S.pushes.length, 0, 'ตอบรับไม่กินโควตา push');
  const f = fires(S);
  assert.strictEqual(f.length, 1); assert.deepStrictEqual(f[0].body, { text: 'เคสใหม่ IS261019-001' });
  assert.strictEqual(f[0].o.headers.Authorization, 'Bearer tok');
  assert.ok(/แท็กคุณปาล์ม/.test(S.prompts[0].messages.slice(-1)[0].content), 'คัดด้วยสมองเลขา');
});

t('ยังไม่ตั้ง ISSUE_ROUTINE_FIRE_URL/TOKEN → เปิดเคส + ตอบรับ แต่ไม่ยิง (รอรอบชั่วโมง) · ยิงซ้ำภายใน 2 นาทีไม่ได้', () => {
  const E = env({ ai: ISSUE_AI });
  E.ctx.handleEvent(tag('@Palm เข้าแอปคลังไม่ได้'));
  assert.strictEqual(E.issues.d.length, 2); assert.strictEqual(fires(E.S).length, 0);
  assert.strictEqual(E.S.replies.length, 1);
  const F = env({ ai: ISSUE_AI, props: { ISSUE_ROUTINE_FIRE_URL: FIRE, ISSUE_ROUTINE_TOKEN: 'tok' } });
  F.ctx.handleEvent(tag('@Palm แอปค้าง')); F.ctx.handleEvent(tag('@Palm แอปค้างเหมือนกัน', { uid: 'Uanother000000000000000000000000' }));
  assert.strictEqual(F.issues.d.length, 3, 'คนละคน = คนละเคส'); assert.strictEqual(fires(F.S).length, 1, 'debounce 2 นาที');
  assert.strictEqual(F.issues.d[2][0], 'IS261019-002');
});

t('"@Palm โทรหาเขาหน่อย" (ไม่ใช่เรื่องแอป) → ไม่เปิดเคส เงียบเหมือนเดิม', () => {
  const E = env({ ai: () => 'SKIP' });
  E.ctx.handleEvent(tag('@Palm โทรหาเขาหน่อย'));
  assert.strictEqual(E.issues.d.length, 1); assert.strictEqual(E.S.replies.length, 0); assert.strictEqual(E.S.pushes.length, 0);
});

t('ถามวิธีใช้ที่เลขาตอบได้ชัวร์ → ตอบเองในกลุ่ม ไม่เปิดเคส', () => {
  const E = env({ ai: () => 'HOWTO\n1) กดเมนู ☰\n2) เลือก "ของแถม" ค่ะ' });
  E.ctx.handleEvent(tag('@ปาล์ม ลงของแถมยังไงคะ', { msg: { mention: undefined } }));
  assert.strictEqual(E.issues.d.length, 1);
  assert.deepStrictEqual(E.S.replies.map(r => r.messages[0].text), ['1) กดเมนู ☰\n2) เลือก "ของแถม" ค่ะ']);
});

t('คุณปาล์มพิมพ์เอง / ไม่ได้แท็ก / แชทส่วนตัว → ไม่เข้านักพัฒนา', () => {
  const E = env({ ai: ISSUE_AI });
  E.ctx.handleEvent(tag('@Palm แอปค้าง', { uid: OWNER }));
  E.ctx.handleEvent(tag('แอปค้างอีกแล้ว', { msg: { mention: undefined } }));
  E.ctx.handleEvent({ type: 'message', replyToken: 'rtD', source: { type: 'user', userId: STAFF }, message: { id: 'D1', type: 'text', text: '@Palm แอปค้าง' } });
  assert.strictEqual(E.issues.d.length, 1);
  assert.ok(!E.S.prompts.some(p => /แท็กคุณปาล์ม/.test(JSON.stringify(p))));
});

t('แท็กซ้ำภายใน 30 นาที (คนเดิม กลุ่มเดิม) → เติมเคสเดิม ไม่คิดซ้ำ ไม่ปลุกซ้ำ · webhook ซ้ำ = ไม่ทำซ้ำ', () => {
  const E = env({ ai: ISSUE_AI, props: { ISSUE_ROUTINE_FIRE_URL: FIRE, ISSUE_ROUTINE_TOKEN: 'tok' } });
  const e1 = tag('@Palm แอปเซลส์ค้าง');
  E.ctx.handleEvent(e1); E.ctx.handleEvent(JSON.parse(JSON.stringify(e1)));
  delete E.S.cache.issue_fire_lock;
  const ai = E.S.anthropic;
  E.ctx.handleEvent(tag('@Palm ตอนกดปุ่มส่งบิลค่ะ'));
  assert.strictEqual(E.issues.d.length, 2);
  assert.ok(/แอปเซลส์ค้าง\n\+ \d\d:\d\d @Palm ตอนกดปุ่มส่งบิลค่ะ$/.test(cell(E, 1, 'ข้อความ')), cell(E, 1, 'ข้อความ'));
  assert.strictEqual(E.S.anthropic, ai); assert.strictEqual(fires(E.S).length, 1);
  assert.strictEqual(E.S.replies.length, 2); assert.ok(/รับข้อมูลเพิ่มแล้ว/.test(E.S.replies[1].messages[0].text));
});

t('รูปที่ส่งตามมาหลังแท็ก → เก็บเสมอ (แม้สมองบอกไม่เกี่ยว) + เติมเข้าเคส', () => {
  const E = env({ ai: b => (JSON.stringify(b).indexOf('แท็กคุณปาล์ม') !== -1 ? 'ISSUE' : 'เกี่ยวข้อง: ไม่\nบรรยาย: รูปจอ') });
  E.ctx.handleEvent(tag('@Palm แอปค้าง'));
  E.ctx.handleEvent({ type: 'message', replyToken: 'rtM', source: { type: 'group', groupId: OTHER_GID, userId: STAFF }, message: { id: 'IMG1', type: 'image' } });
  assert.strictEqual(E.S.files.length, 1);
  assert.strictEqual(cell(E, 1, 'รูป'), E.S.files[0].getUrl());
  // คนอื่นส่งรูป → ไม่เติม
  E.ctx.handleEvent({ type: 'message', replyToken: 'rtM', source: { type: 'group', groupId: OTHER_GID, userId: 'Uother' }, message: { id: 'IMG2', type: 'image' } });
  assert.strictEqual(cell(E, 1, 'รูป'), E.S.files[0].getUrl());
});

const row = (o) => H.map(h => (h in o ? o[h] : ''));
const seed = () => [
  row({ Issue_ID: 'IS261019-001', 'เวลา': new Date(NOW - 5 * 60000), groupId: OTHER_GID, 'กลุ่ม': 'กลุ่มเซลส์', senderId: STAFF, 'ผู้แจ้ง': 'น้องเซลส์', 'ข้อความ': '@Palm แอปค้าง', 'รูป': IMG, 'สถานะ': 'ใหม่' }),
  row({ Issue_ID: 'IS261019-002', 'เวลา': new Date(NOW - 60 * 60000), groupId: OTHER_GID, senderId: STAFF, 'สถานะ': 'กำลังแก้', 'รับเมื่อ': new Date(NOW - 30 * 60000) }),
  row({ Issue_ID: 'IS261018-001', 'เวลา': new Date(NOW - 9 * 3600000), groupId: OTHER_GID, senderId: STAFF, 'ข้อความ': 'ค้างนาน', 'สถานะ': 'กำลังแก้', 'รับเมื่อ': new Date(NOW - 4 * 3600000) }),
  row({ Issue_ID: 'IS261018-002', 'เวลา': new Date(NOW - 9 * 3600000), groupId: OTHER_GID, senderId: STAFF, 'สถานะ': 'แก้แล้ว' })
];
const gp = (E, q) => JSON.parse(E.ctx.doGet({ parameter: q }).t);
const pp = (E, q) => JSON.parse(E.ctx.doPost({ parameter: q }).t);

t('issueFeed: ต้องมีรหัส · ส่งเฉพาะ "ใหม่" + "กำลังแก้" ที่ค้างเกิน 3 ชม. พร้อมแชทรอบ ๆ และรูป (≤3)', () => {
  const E = env({ issueRows: seed(), chat: [
    { t: NOW - 7 * 60000, chat: OTHER_GID, uid: STAFF, name: 'น้องเซลส์', text: 'กดส่งบิลไม่ไป' },
    { t: NOW - 4 * 60000, chat: OTHER_GID, uid: STAFF, name: 'น้องเซลส์', text: '[ส่งรูป/ไฟล์] จอขาว https://drive.google.com/file/d/Fimg2/view' },
    { t: NOW - 30 * 60000, chat: OTHER_GID, uid: STAFF, name: 'น้องเซลส์', text: 'เก่าเกินหน้าต่าง' }] });
  assert.deepStrictEqual(gp(E, { action: 'issueFeed', key: 'ผิด' }), { ok: false, error: 'unauthorized' });
  const f = gp(E, { action: 'issueFeed', key: 'Lkey' });
  assert.strictEqual(f.ok, true);
  assert.deepStrictEqual(f.issues.map(i => i.id), ['IS261019-001', 'IS261018-001']);
  const a = f.issues[0];
  assert.strictEqual(a.group, 'กลุ่มเซลส์'); assert.strictEqual(a.groupId, OTHER_GID); assert.strictEqual(a.sender, 'น้องเซลส์');
  assert.strictEqual(a.at, '2026-10-19 08:25'); assert.strictEqual(a.text, '@Palm แอปค้าง');
  assert.deepStrictEqual(a.context.map(c => c.text), ['กดส่งบิลไม่ไป', '[ส่งรูป/ไฟล์] จอขาว https://drive.google.com/file/d/Fimg2/view']);
  assert.deepStrictEqual(a.images.map(i => i.b64), ['B64:' + IMG, 'B64:https://drive.google.com/file/d/Fimg2/view']);
});

t('issueClaim: ใหม่ → กำลังแก้ · รับซ้ำไม่ได้ · ค้างเกิน 3 ชม. รับใหม่ได้ · ปิดแล้วรับไม่ได้', () => {
  const E = env({ issueRows: seed() });
  assert.strictEqual(pp(E, { action: 'issueClaim', key: 'ผิด', id: 'IS261019-001' }).ok, false);
  assert.deepStrictEqual(pp(E, { action: 'issueClaim', key: 'Lkey', id: 'IS261019-001' }), { ok: true, id: 'IS261019-001' });
  assert.strictEqual(cell(E, 1, 'สถานะ'), 'กำลังแก้'); assert.ok(cell(E, 1, 'รับเมื่อ') instanceof Date);
  assert.strictEqual(pp(E, { action: 'issueClaim', key: 'Lkey', id: 'IS261019-001' }).ok, false);
  assert.strictEqual(pp(E, { action: 'issueClaim', key: 'Lkey', id: 'IS261019-002' }).ok, false, 'อีกรอบกำลังทำอยู่');
  assert.strictEqual(pp(E, { action: 'issueClaim', key: 'Lkey', id: 'IS261018-001' }).ok, true, 'ค้างเกิน 3 ชม.');
  assert.strictEqual(pp(E, { action: 'issueClaim', key: 'Lkey', id: 'IS261018-002' }).ok, false);
  assert.strictEqual(pp(E, { action: 'issueClaim', key: 'Lkey', id: 'ไม่มี' }).ok, false);
  assert.strictEqual(E.S.pushes.length + E.S.replies.length, 0);
});

t('issueSave: บันทึกชีต → ตอบในกลุ่มเดิมขึ้นต้น @ผู้แจ้ง (mention) + สรุปคุณปาล์มแชทส่วนตัว · ส่งซ้ำไม่ส่งข้อความซ้ำ', () => {
  const E = env({ issueRows: seed() });
  const res = JSON.stringify({ status: 'แก้แล้ว', reply: 'แก้แล้วค่ะ ปิดแอปแล้วเปิดใหม่ ดูมุมล่างต้องขึ้น v40.7 นะคะ',
    palm: 'แอปเซลส์ v40.7 · ปุ่มส่งบิลค้างเพราะ… · แก้แล้ว', pr: 'https://github.com/palmsil2026/origin-hq/pull/999', version: 'v40.7' });
  assert.strictEqual(pp(E, { action: 'issueSave', key: 'ผิด', id: 'IS261019-001', result: res }).ok, false);
  assert.strictEqual(pp(E, { action: 'issueSave', key: 'Lkey', id: 'IS261019-001', result: '{"status":"มั่ว"}' }).ok, false);
  const r = pp(E, { action: 'issueSave', key: 'Lkey', id: 'IS261019-001', result: res });
  assert.deepStrictEqual(r, { ok: true, id: 'IS261019-001', status: 'แก้แล้ว', sent: { group: true, palm: true } });
  assert.strictEqual(cell(E, 1, 'สถานะ'), 'แก้แล้ว'); assert.strictEqual(cell(E, 1, 'PR'), 'https://github.com/palmsil2026/origin-hq/pull/999');
  assert.strictEqual(cell(E, 1, 'เวอร์ชัน'), 'v40.7'); assert.ok(cell(E, 1, 'เสร็จเมื่อ') instanceof Date);
  const [g, o] = E.S.pushes;
  assert.strictEqual(g.to, OTHER_GID);
  assert.strictEqual(g.messages[0].type, 'textV2'); assert.ok(/^\{u\} แก้แล้วค่ะ/.test(g.messages[0].text));
  assert.deepStrictEqual(g.messages[0].substitution.u.mentionee, { type: 'user', userId: STAFF });
  assert.strictEqual(o.to, OWNER);
  assert.ok(/^🛠️ แก้แล้ว · กลุ่มเซลส์ · น้องเซลส์\n/.test(o.messages[0].text), o.messages[0].text);
  assert.ok(/pull\/999/.test(o.messages[0].text) && /IS261019-001/.test(o.messages[0].text));
  assert.strictEqual(pp(E, { action: 'issueSave', key: 'Lkey', id: 'IS261019-001', result: res }).ok, false);
  assert.strictEqual(E.S.pushes.length, 2);
});

t('issueSave: "ถามคุณปาล์ม" → แชทส่วนตัวคุณปาล์มเสมอ (palm ว่างก็ส่งเรื่องที่แจ้ง) · reply ว่าง = ไม่ส่งในกลุ่ม', () => {
  const E = env({ issueRows: seed() });
  const r = pp(E, { action: 'issueSave', key: 'Lkey', id: 'IS261019-001', result: JSON.stringify({ status: 'ถามคุณปาล์ม', reply: '' }) });
  assert.deepStrictEqual(r.sent, { group: null, palm: true });
  assert.strictEqual(E.S.pushes.length, 1); assert.strictEqual(E.S.pushes[0].to, OWNER);
  assert.ok(/เรื่องที่แจ้ง: "@Palm แอปค้าง"/.test(E.S.pushes[0].messages[0].text));
  const F = env({ issueRows: seed() });
  pp(F, { action: 'issueSave', key: 'Lkey', id: 'IS261019-001', result: JSON.stringify({ status: 'ไม่ใช่ปัญหาแอป' }) });
  assert.strictEqual(F.S.pushes.length, 0);
});

t('โควตาไลน์เต็ม (429) → ผลยังบันทึกชีต + "เช็คระบบ" โชว์ส่งไม่ออก · เคสค้าง · ยังไม่ตั้งปลุกนักพัฒนา', () => {
  const E = env({ issueRows: seed() }); E.S.pushCode = 429;
  const r = pp(E, { action: 'issueSave', key: 'Lkey', id: 'IS261019-001', result: JSON.stringify({ status: 'แก้แล้ว', reply: 'แก้แล้วค่ะ', palm: 'สรุป' }) });
  assert.deepStrictEqual(r.sent, { group: false, palm: false });
  assert.strictEqual(E.S.pushes.length, 2, 'mention 429 แล้วไม่ลองแบบไม่มี mention ซ้ำ');
  assert.strictEqual(cell(E, 1, 'ตอบในกลุ่ม'), 'แก้แล้วค่ะ');
  const out = E.ctx.healthCheck();
  assert.ok(/ส่งผลนักพัฒนาถึงคุณปาล์มไม่ออก \(เคส IS261019-001 .*โควตาข้อความไลน์เดือนนี้เต็ม\)/.test(out), out);
  assert.ok(/✅ 🛠️ นักพัฒนา: เคสค้าง 2 เคส \(ใหม่ 0 · กำลังแก้ 2\)/.test(out), out);
  assert.ok(/⚠️ ปลุกนักพัฒนาทันทีไม่ได้/.test(out));
  const F = env({ props: { ISSUE_ROUTINE_FIRE_URL: FIRE, ISSUE_ROUTINE_TOKEN: 'tok' } });
  assert.ok(/✅ ปลุกนักพัฒนาทันทีได้/.test(F.ctx.healthCheck()));
});

t('mention ใช้ไม่ได้ (400) → ส่งในกลุ่มแบบขึ้นต้นด้วยชื่อแทน', () => {
  const E = env({ issueRows: seed() });
  let k = 0; const orig = E.ctx.UrlFetchApp.fetch;
  E.ctx.UrlFetchApp.fetch = (u, o) => { const r = orig(u, o); if (u.indexOf('/message/push') !== -1 && k++ === 0) return { getResponseCode: () => 400, getContentText: () => '{}' }; return r; };
  pp(E, { action: 'issueSave', key: 'Lkey', id: 'IS261019-001', result: JSON.stringify({ status: 'ตอบวิธีใช้', reply: 'กดปุ่ม ☰ ค่ะ' }) });
  assert.strictEqual(E.S.pushes[1].messages[0].text, '@น้องเซลส์ กดปุ่ม ☰ ค่ะ');
  assert.strictEqual(E.S.pushes[1].to, OTHER_GID);
});

console.log('\nนักพัฒนา ผ่านทั้งหมด ' + n + ' ข้อ');

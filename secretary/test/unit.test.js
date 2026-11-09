// 🧪 เทสต์เส้นทางของคุณเลขา (ไม่ใช้สมองจริง) — รัน: node secretary/test/unit.test.js
//   ล้ม = exit 1 → workflow ไม่ deploy · เพิ่มเคสใหม่ทุกครั้งที่แก้บั๊ก/เพิ่มคำสั่ง (PALM-WAY §7.3)
const assert = require('assert'), crypto = require('crypto');
const { makeEnv, finCalls, ev, dm, replyText, OWNER, EXP_GID, PROD_GID, OTHER_GID, PLANT_SHEET } = require('./harness');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };

// รหัสเชื่อม = สูตรเดียวกับ finance-app chatToken(): HMAC-SHA256(key=SPREADSHEET_ID, "lakon-line-chat-v1") เป็น hex
const expectToken = crypto.createHmac('sha256', PLANT_SHEET).update('lakon-line-chat-v1').digest('hex');

t('ข้อความตัวหนังสือในกลุ่มบิล → expenseChat ครบช่อง + quotedMessageId · ไม่เรียก AI เลขา · ไม่จด GroupChat', () => {
  const { ctx, S } = makeEnv({ financeResp: () => ({ success: true, act: 'update' }) });
  const e = ev('text', { text: ' โรงขวด ค่าฝา ', quotedMessageId: 'Q123' });
  ctx.handleEvent(e);
  const b = finCalls(S);
  assert.strictEqual(b.length, 1);
  assert.deepStrictEqual(Object.assign({}, b[0], { at: b[0].at }), { token: expectToken, action: 'expenseChat', sender: 'แม่', groupName: 'บิลค่าใช้จ่าย 🧾',
    messageId: e.message.id, at: 1760000000000, text: 'โรงขวด ค่าฝา', quotedMessageId: 'Q123' });
  assert.strictEqual(S.anthropic, 0); assert.strictEqual(S.replies.length, 0); assert.strictEqual(S.pushes.length, 0);
  assert.strictEqual(S.groupChat.length, 0);
});

t('รูปในกลุ่มบิล → เก็บ Drive โฟลเดอร์บิล (ไม่แชร์สาธารณะ) → ส่ง fileId · ไม่ส่ง text ภาษาเลขา', () => {
  const { ctx, S } = makeEnv({ financeResp: () => ({ success: true, act: 'saved', saved: true, id: 'EXP1', reply: 'รับแล้วค่ะ' }) });
  ctx.handleEvent(ev('image', {}));
  assert.strictEqual(S.files.length, 1); assert.strictEqual(S.files[0].folder, 'บิลค่าใช้จ่าย'); assert.strictEqual(S.files[0].shared, false);
  assert.ok(/^บิล-\d{6}-\d{6}\.jpg$/.test(S.files[0].name), S.files[0].name);
  const b = finCalls(S)[0];
  assert.strictEqual(b.fileId, 'F1'); assert.strictEqual(b.mime, 'image/jpeg'); assert.strictEqual(b.text, '');
  assert.strictEqual(S.anthropic, 0, 'ไม่ให้ analyzeImage ของเลขาตัดสินรูปบิล');
  assert.strictEqual(S.replies.length + S.pushes.length, 0, 'reply = รออนุมัติ ห้ามส่ง');
});

t('ไฟล์ (PDF) ในกลุ่มบิล → ใช้ชื่อไฟล์เดิม', () => {
  const { ctx, S } = makeEnv();
  ctx.handleEvent(ev('file', { fileName: 'ใบแจ้งหนี้.pdf' }));
  assert.strictEqual(S.files[0].name, 'ใบแจ้งหนี้.pdf'); assert.strictEqual(finCalls(S)[0].fileName, 'ใบแจ้งหนี้.pdf');
});

t('say → ตอบลงกลุ่มด้วย replyToken · notify+notice → ส่งหาคุณปาล์ม', () => {
  const { ctx, S } = makeEnv({ financeResp: () => ({ success: true, act: 'ask', say: 'บิลนี้ของโรงไหนคะ', notify: true, notice: 'มีบิลใหม่', reply: 'รับแล้วค่ะ' }) });
  ctx.handleEvent(ev('text', { text: 'อันนี้จ่ายแล้วนะ' }));
  assert.deepStrictEqual(S.replies.map(r => [r.replyToken, r.messages[0].text]), [['rt1', 'บิลนี้ของโรงไหนคะ']]);
  assert.deepStrictEqual(S.pushes.map(p => [p.to, p.messages[0].text]), [[OWNER, 'มีบิลใหม่']]);
});

t('replyToken ใช้ไม่ได้ (เช่น AI อ่านนานจนหมดอายุ) → push ลงกลุ่มแทน', () => {
  const { ctx, S } = makeEnv({ replyCode: 400, financeResp: () => ({ success: true, act: 'answer', say: 'เดือนนี้ค่าไฟ 12,000 บาทค่ะ' }) });
  ctx.handleEvent(ev('text', { text: 'ค่าไฟเดือนนี้เท่าไหร่' }));
  assert.deepStrictEqual(S.pushes.map(p => [p.to, p.messages[0].text]), [[EXP_GID, 'เดือนนี้ค่าไฟ 12,000 บาทค่ะ']]);
});

t('ไลน์ส่ง webhook ซ้ำ → ไม่ส่งแอปบัญชีซ้ำ ไม่ตอบซ้ำ', () => {
  const { ctx, S } = makeEnv({ financeResp: () => ({ success: true, act: 'ask', say: 'ถามค่ะ' }) });
  const e = ev('image', {});
  ctx.handleEvent(e); ctx.handleEvent(JSON.parse(JSON.stringify(e)));
  assert.strictEqual(finCalls(S).length, 1); assert.strictEqual(S.files.length, 1); assert.strictEqual(S.replies.length, 1);
});

t('รอบก่อนหมดเวลา (เลขาไม่ได้คำตอบ) แอปบัญชีตอบ duplicate พร้อม say เดิม → ต้องส่ง say', () => {
  const { ctx, S } = makeEnv({ financeResp: () => ({ success: true, act: 'ask', say: 'บิลนี้ของโรงไหนคะ', duplicate: true }) });
  ctx.handleEvent(ev('text', { text: 'x' }));
  assert.strictEqual(S.replies.length, 1);
});

t('ส่งรูปเข้าแอปบัญชีไม่สำเร็จ → แจ้งคุณปาล์มพร้อมลิงก์ไฟล์ (ครั้งเดียวใน 30 นาที)', () => {
  const { ctx, S } = makeEnv({ financeResp: () => ({ success: false, error: 'รหัสเชื่อมไม่ถูกต้อง' }) });
  ctx.handleEvent(ev('image', {})); ctx.handleEvent(ev('image', {}));
  assert.strictEqual(S.pushes.length, 1); assert.strictEqual(S.pushes[0].to, OWNER);
  assert.ok(/รหัสเชื่อมไม่ถูกต้อง/.test(S.pushes[0].messages[0].text) && /drive\.google\.com\/file\/d\/F1/.test(S.pushes[0].messages[0].text));
  assert.ok(!S.cache['expfw_' + 'x'], 'ไม่สำเร็จ = ไม่จดว่าส่งแล้ว');
});

t('ดาวน์โหลดรูปจากไลน์ไม่ได้ → แจ้งคุณปาล์ม ไม่เรียกแอปบัญชี', () => {
  const { ctx, S } = makeEnv({ downloadFail: true });
  ctx.handleEvent(ev('image', {}));
  assert.strictEqual(finCalls(S).length, 0); assert.strictEqual(S.pushes.length, 1); assert.strictEqual(S.pushes[0].to, OWNER);
});

t('แอปบัญชีล่ม (exception) ตอนส่งข้อความตัวหนังสือ → เงียบ ไม่พัง ไม่ตอบในกลุ่ม', () => {
  const { ctx, S } = makeEnv({ financeThrow: true });
  ctx.handleEvent(ev('text', { text: 'ค่าน้ำมัน' }));
  assert.strictEqual(S.replies.length + S.pushes.length, 0);
  assert.ok(S.logs.some(l => l[0] === 'กลุ่มบิล' && /✗ Error: timeout/.test(l[3])));
});

t('กลุ่มอื่นไม่ถูกส่งไปแอปบัญชี (กลุ่มคุยเล่น/ทีมผลิต)', () => {
  const { ctx, S } = makeEnv();
  ctx.handleEvent(ev('text', { text: 'บิลค่าไฟมาแล้ว' }, OTHER_GID));
  ctx.handleEvent(ev('text', { text: 'เครื่องจอด' }, PROD_GID));
  assert.strictEqual(finCalls(S).length, 0);
});

t('GROUP_EXPENSE_ID ตั้งไว้ → ใช้ id นั้นอย่างเดียว', () => {
  const { ctx, S } = makeEnv({ props: { GROUP_EXPENSE_ID: OTHER_GID } });
  ctx.handleEvent(ev('text', { text: 'a' }, EXP_GID)); assert.strictEqual(finCalls(S).length, 0);
  ctx.handleEvent(ev('text', { text: 'b' }, OTHER_GID)); assert.strictEqual(finCalls(S).length, 1);
});

t('สติกเกอร์ในกลุ่มบิล → ไม่ส่ง ไม่ตอบ', () => {
  const { ctx, S } = makeEnv();
  ctx.handleEvent(ev('sticker', {}));
  assert.strictEqual(finCalls(S).length + S.replies.length + S.anthropic, 0);
});

t('FINANCE_CHAT_TOKEN / FINANCE_APP_URL ใน Script Properties ใช้แทนค่าตั้งต้นได้', () => {
  const { ctx } = makeEnv({ props: { FINANCE_CHAT_TOKEN: 'own-token-1234567890' } });
  assert.strictEqual(ctx.financeChatToken(), 'own-token-1234567890');
  assert.strictEqual(makeEnv({ props: { PRODUCTION_CHAT_TOKEN: 'prod-only' } }).ctx.financeChatToken(), expectToken, 'รหัสแอปทีมผลิตแยก ไม่ปนกัน');
});

t('expenseDue: ช่วง 8–11 โมง เรียกวันละครั้ง → notice หาคุณปาล์ม · ไม่ส่ง reply ลงกลุ่ม', () => {
  const { ctx, S } = makeEnv({ financeResp: b => b.action === 'expenseDue'
    ? { success: true, act: 'due', notify: true, overdue: 1, today: 0, soon: 2, notice: '⏰ บิลที่ต้องจ่าย ...', reply: '⏰ เตือนบิลในกลุ่ม' } : { success: true } });
  ctx.fireDueReminders(); ctx.fireDueReminders();
  assert.strictEqual(finCalls(S).filter(b => b.action === 'expenseDue').length, 1);
  assert.deepStrictEqual(S.pushes.map(p => [p.to, p.messages[0].text]), [[OWNER, '⏰ บิลที่ต้องจ่าย ...']]);
  assert.strictEqual(S.props.EXPENSE_DUE_DAY, '2026-10-19');
});

t('expenseDue: ก่อน 8 โมง / หลังเที่ยง ไม่เรียก', () => {
  for (const iso of ['2026-10-19T00:50:00Z' /* 07:50 */, '2026-10-19T05:10:00Z' /* 12:10 */]) {
    const { ctx, S } = makeEnv({ now: new Date(iso) });
    ctx.fireDueReminders(); assert.strictEqual(finCalls(S).filter(b => b.action === 'expenseDue').length, 0, iso);
  }
});

t('expenseDue: แอปบัญชีพัง → ไม่จดวัน รอบถัดไปลองใหม่', () => {
  let fail = true;
  const { ctx, S } = makeEnv({ financeResp: () => (fail ? { success: false, error: 'x' } : { success: true, act: 'none', notify: false }) });
  ctx.fireDueReminders(); assert.ok(!S.props.EXPENSE_DUE_DAY);
  fail = false; ctx.fireDueReminders(); assert.strictEqual(S.props.EXPENSE_DUE_DAY, '2026-10-19');
  assert.strictEqual(S.pushes.length, 0, 'ไม่มีบิลครบกำหนด = ไม่ส่ง');
});

t('isBillQuestion: จับคำถามเรื่องบิล ไม่จับสั่งงาน/บิลขาย/ค่าสมอง', () => {
  const { ctx } = makeEnv();
  const yes = ['มีบิลค้างจ่ายไหม', 'บิลค่าไฟเดือนนี้เท่าไหร่', 'ยอดบิลเดือนนี้', 'สรุปรายจ่ายเดือนนี้', 'เลขบัญชีโอนของผู้ขายฝาเบอร์อะไร',
               'เลขา บิลไหนครบกำหนดบ้าง', 'จ่ายบิลค่าน้ำยัง', 'ค่าใช้จ่ายโรงขวดเดือนก่อนเท่าไร?'];
  const no = ['ฝากทำบิลให้หน่อย', 'ประกาศในกลุ่มว่าส่งบิลให้ครบ', 'ค่าใช้จ่ายสมองเลขาวันนี้เท่าไหร่', 'บิลขายวรินธรเดือนนี้เท่าไหร่',
              'ออกบิลให้ลูกค้าหรือยัง', 'ยอดขายวันนี้', 'สวัสดี', 'เตือนจ่ายบิลพรุ่งนี้ 9 โมง'];
  yes.forEach(s => assert.ok(ctx.isBillQuestion(s), 'ควรจับ: ' + s));
  no.forEach(s => assert.ok(!ctx.isBillQuestion(s), 'ไม่ควรจับ: ' + s));
});

t('คุณปาล์มถามเรื่องบิลแชทส่วนตัว → expenseAsk แล้วตอบด้วย answer (ไม่ผ่านสมองเลขา ไม่ไปสรุปยอดขาย)', () => {
  const { ctx, S } = makeEnv({ financeResp: b => (b.action === 'expenseAsk' ? { success: true, act: 'answer', answer: 'ค้างจ่าย 2 ใบ รวม 5,400 บาทค่ะ' } : {}) });
  ctx.handleEvent({ type: 'message', replyToken: 'rtP', source: { type: 'user', userId: OWNER }, message: { id: 'P1', type: 'text', text: 'ยอดบิลค้างจ่ายเดือนนี้เท่าไหร่' } });
  const b = finCalls(S);
  assert.deepStrictEqual(b, [{ token: expectToken, action: 'expenseAsk', text: 'ยอดบิลค้างจ่ายเดือนนี้เท่าไหร่', sender: 'คุณปาล์ม' }]);
  assert.deepStrictEqual(S.replies.map(r => r.messages[0].text), ['🧾 ค้างจ่าย 2 ใบ รวม 5,400 บาทค่ะ']);
  assert.strictEqual(S.anthropic, 0);
});

t('ถามบิลแต่แอปบัญชีตอบไม่ได้ → บอกตรง ๆ ไม่เดาตัวเลข', () => {
  const { ctx, S } = makeEnv({ financeThrow: true });
  ctx.handleEvent({ type: 'message', replyToken: 'rtP', source: { type: 'user', userId: OWNER }, message: { id: 'P2', type: 'text', text: 'มีบิลค้างจ่ายไหม' } });
  assert.ok(/ถามแอปบัญชีไม่สำเร็จ/.test(S.replies[0].messages[0].text)); assert.strictEqual(S.anthropic, 0);
});

t('คนอื่น (ไม่ใช่คุณปาล์ม) ถามเรื่องบิลแชทส่วนตัว → ไม่เรียก expenseAsk', () => {
  const { ctx, S } = makeEnv();
  try { ctx.handleEvent({ type: 'message', replyToken: 'rtX', source: { type: 'user', userId: 'Ustaff' }, message: { id: 'X1', type: 'text', text: 'มีบิลค้างจ่ายไหม' } }); } catch (e) {}
  assert.strictEqual(finCalls(S).length, 0);
});

t('เช็คระบบ: ขึ้นสถานะแอปบัญชี + เตือนถ้าเวอร์ชันต่ำกว่า v0.10', () => {
  for (const [v, re] of [['v0.10', /✅ เชื่อมแอปบัญชีได้ ✓ \(v0\.10 · AI อ่านบิลได้\)/], ['v0.9', /⚠️ แอปบัญชีเป็น v0\.9/]]) {
    const { ctx } = makeEnv({ financeResp: b => (b.action === 'ping' ? { success: true, app: 'บัญชี', version: v, ai: true } : {}) });
    let out = '';
    try { out = ctx.healthCheck(); } catch (e) { out = String(e && e.stack); }
    assert.ok(re.test(out), v + '\n' + out.split('\n').filter(l => /บัญชี|บิล/.test(l)).join('\n'));
    assert.ok(/✅ รู้จักกลุ่มบิลค่าใช้จ่ายแล้ว/.test(out));
  }
});


// ───────── อ่านเจตนา / คำสั่งระบบ ─────────

t('isHealthCheckAsk: รับคำใกล้เคียง ไม่จับเรื่องอื่น', () => {
  const { ctx } = makeEnv();
  ['เช็คสุขภาพระบบ', 'เช็คระบบ', 'เลขา เช็คระบบหน่อยค่ะ', 'ระบบโอเคไหม', 'ระบบโอเคมั้ย?', 'ระบบปกติดีไหม', 'ระบบล่มรึเปล่า',
   'ตรวจสถานะระบบ', 'สถานะระบบ', 'สุขภาพระบบ', 'status', 'ช่วยเช็คระบบให้หน่อยครับ', 'ระบบเลขาโอเคไหม']
    .forEach(x => assert.ok(ctx.isHealthCheckAsk(x), 'ควรจับ: ' + x));
  ['เช็คหน่อย', 'เช็คระบบขายให้หน่อยว่าออเดอร์ลูกค้าวรินธรเข้ายัง', 'ระบบขายมีปัญหาไหม', 'สรุปยอดวันนี้', 'ระบบสั่งน้ำใช้ยังไง']
    .forEach(x => assert.ok(!ctx.isHealthCheckAsk(x), 'ไม่ควรจับ: ' + x));
});

t('คุณปาล์มพิมพ์ "เช็คสุขภาพระบบ" → ได้ผลเช็คระบบจริงทันที ไม่ผ่านสมอง AI', () => {
  const { ctx, S } = makeEnv();
  ctx.handleEvent(dm(OWNER, 'เช็คสุขภาพระบบ'));
  assert.ok(/โค้ดเวอร์ชัน: /.test(replyText(S)), replyText(S));
  assert.ok(S.prompts.every(b => !b.system), 'ไม่ผ่านสมองแชท (มีแค่ ping สมองของเช็คระบบ)');
});

t('คุณปาล์มพิมพ์ "เช็คหน่อย" → สมองอ่านเจตนาแล้วเรียก RUN health → ต่อผลจริงท้ายคำตอบ', () => {
  const { ctx, S } = makeEnv({ ai: () => 'ได้ค่ะ เช็คให้เลยนะคะ\n[[RUN]]{"cmd":"health"}[[/RUN]]' });
  ctx.handleEvent(dm(OWNER, 'เช็คหน่อย'));
  const r = replyText(S);
  assert.ok(/^ได้ค่ะ เช็คให้เลยนะคะ\n\n/.test(r) && /โค้ดเวอร์ชัน: /.test(r) && !/\[\[RUN/.test(r), r);
});

t('prompt สอนให้เรียกคำสั่งเอง ไม่ใช่ให้ผู้ใช้พิมพ์ใหม่', () => {
  const { ctx, S } = makeEnv({ ai: () => 'โอเคค่ะ' });
  ctx.handleEvent(dm(OWNER, 'ระบบวันนี้เป็นไงบ้าง ทุกอย่างปกติดีใช่ปะ'));
  const sys = JSON.stringify(S.prompts[0].system);
  assert.ok(/\[\[RUN\]\]/.test(sys) && /"cmd\\":\\"<ชื่อคำสั่ง>/.test(sys) && /ห้ามบอกให้ผู้ใช้ไปพิมพ์คำสั่งใหม่/.test(sys));
  assert.ok(!/แนะนำคำสั่ง เช่น/.test(sys), 'ต้องเลิกสอนให้แนะนำคำสั่ง');
});

t('พนักงาน (ไม่ใช่คุณปาล์ม) → สมองเผลอเรียก RUN health ก็ไม่ทำ', () => {
  const { ctx, S } = makeEnv({ ai: () => 'ได้ค่ะ\n[[RUN]]{"cmd":"health"}[[/RUN]]' });
  ctx.handleEvent(dm('Ustaff', 'ระบบโอเคไหม'));
  assert.ok(!/โค้ดเวอร์ชัน/.test(replyText(S)), replyText(S));
});

t('RUN bill: แชทส่วนตัวคุณปาล์ม → ถามแอปบัญชี · ในกลุ่ม → ไม่ทำ (ข้อมูลเงิน)', () => {
  const ai = () => 'ดูให้ค่ะ\n[[RUN]]{"cmd":"bill","q":"เดือนนี้จ่ายค่าฝาไปเท่าไหร่"}[[/RUN]]';
  const fr = b => (b.action === 'expenseAsk' ? { success: true, answer: 'ค่าฝา 8,000 บาทค่ะ' } : {});
  let e = makeEnv({ ai, financeResp: fr });
  e.ctx.handleEvent(dm(OWNER, 'ฝาเดือนนี้หมดไปเท่าไหร่แล้ว'));
  assert.deepStrictEqual(finCalls(e.S).map(b => [b.action, b.text]), [['expenseAsk', 'เดือนนี้จ่ายค่าฝาไปเท่าไหร่']]);
  assert.ok(/ค่าฝา 8,000 บาทค่ะ/.test(replyText(e.S)));
  e = makeEnv({ ai, financeResp: fr });
  e.ctx.handleEvent({ type: 'message', replyToken: 'rtG', source: { type: 'group', groupId: OTHER_GID, userId: OWNER }, message: { id: 'G1', type: 'text', text: 'เลขา ฝาเดือนนี้หมดไปเท่าไหร่' } });
  assert.strictEqual(finCalls(e.S).length, 0);
});

t('RUN sales จากสมอง: "เมื่อวานขายน้ำได้เท่าไหร่" → ยอดโรงน้ำเมื่อวานจริง', () => {
  const { ctx, S } = makeEnv({ ai: () => '[[RUN]]{"cmd":"sales","which":"yesterday","biz":"plant"}[[/RUN]]' });
  ctx.handleEvent(dm(OWNER, 'เมื่อวานขายน้ำได้เท่าไหร่'));
  assert.strictEqual(replyText(S), '💧 ยอดโรงน้ำ(yesterday)');
});

t('ทางลัดสรุปยอดเดิมยังเหมือนเดิม: เจ้าของ "สรุปยอดวันนี้" = ทั้งสองธุรกิจ · พนักงานแชทส่วนตัว = ไม่ได้', () => {
  let e = makeEnv(); e.ctx.handleEvent(dm(OWNER, 'สรุปยอดวันนี้'));
  assert.strictEqual(replyText(e.S), '☕ ยอดร้าน(today)\n\n💧 ยอดโรงน้ำ(today)');
  e = makeEnv(); e.ctx.handleEvent(dm(OWNER, 'ยอดโรงน้ำเมื่อวาน')); assert.strictEqual(replyText(e.S), '💧 ยอดโรงน้ำ(yesterday)');
  e = makeEnv({ ai: () => 'ขออภัยค่ะ' }); e.ctx.handleEvent(dm('Ustaff', 'ยอดขายวันนี้'));
  assert.ok(!/ยอดร้าน|ยอดโรงน้ำ/.test(replyText(e.S)));
});

t('RUN หลายบล็อก/ซ้ำ/ชื่อมั่ว → ทำครบที่ถูก ไม่ซ้ำ ไม่พัง', () => {
  const { ctx, S } = makeEnv({ ai: () => '[[RUN]]{"cmd":"groups"}[[/RUN]][[RUN]]{"cmd":"groups"}[[/RUN]][[RUN]]{"cmd":"rm -rf"}[[/RUN]][[RUN]]{"cmd":"chatid"}[[/RUN]]' });
  ctx.handleEvent(dm(OWNER, 'อยู่กลุ่มอะไรมั่ง แล้วไอดีห้องนี้ด้วย'));
  const r = replyText(S);
  assert.strictEqual((r.match(/กลุ่มที่ดิฉันอยู่ตอนนี้/g) || []).length, 1); assert.ok(/chat id ของที่นี่:\nUowner/.test(r), r);
});

t('แชทบอร์ด (เจ้าของ) เรียก RUN health ได้', () => {
  const { ctx } = makeEnv({ ai: () => 'ได้ค่ะ\n[[RUN]]{"cmd":"health"}[[/RUN]]' });
  ctx.buildBoardContext = () => ''; ctx.readBoard = () => [];
  const r = ctx.boardChat('ระบบเป็นไงบ้าง');
  assert.ok(r.ok && /โค้ดเวอร์ชัน: /.test(r.reply), JSON.stringify(r).slice(0, 300));
});

t('กลุ่ม Old Days: พนักงานถามยอด = ยอดร้านอย่างเดียว · เจ้าของถาม "สรุปยอด" ในกลุ่มร้าน = ยอดร้าน', () => {
  const OD = 'Cod00000000000000000000000000000000';
  const g = (uid, text) => ({ type: 'message', replyToken: 'rO', source: { type: 'group', groupId: OD, userId: uid }, message: { id: 'O' + Math.random(), type: 'text', text } });
  for (const [uid, txt, want] of [['Ustaff', 'ยอดวันนี้', '☕ ยอดร้าน(today)'], ['Ustaff', 'ยอดโรงน้ำวันนี้', '☕ ยอดร้าน(today)'], [OWNER, 'สรุปยอด', '☕ ยอดร้าน(latest)']]) {
    const { ctx, S } = makeEnv();
    const base = ctx.listKnownGroups; ctx.listKnownGroups = () => base().concat([{ id: OD, name: 'Old Days ทีมร้าน' }]);
    ctx.handleEvent(g(uid, txt)); assert.strictEqual(replyText(S), want, uid + ' ' + txt);
  }
});

t('cleanOut: ตัด **ตัวหนา** และบรรทัด "Powered by …" ก่อนส่งไลน์ (แชทจริงเคยหลุด)', () => {
  const { ctx } = makeEnv();
  assert.strictEqual(ctx.cleanOut('**สรุป** งาน\n\n\n\nPowered by Kimi K2.5 by MoonshotAI.'), 'สรุป งาน');
  assert.strictEqual(ctx.cleanOut('ราคา 5*3 = 15'), 'ราคา 5*3 = 15');
});

t('isSalesAsk: ขอยอดสั้นๆ = ทางลัด · สั่งงาน/บ่น/เสนอที่มีคำว่ายอดขาย = ให้สมองคิด', () => {
  const { ctx } = makeEnv();
  ['สรุปยอดวันนี้', 'ยอดร้านเมื่อวาน', 'เลขา ยอดขายวันนี้', 'ยอดโรงน้ำล่าสุด'].forEach(x => assert.ok(ctx.isSalesAsk(x), 'ควรจับ: ' + x));
  ['ช่วยแจ้งทีม AI ให้ทำระบบส่งสรุปยอดขายประจำวันลงกลุ่มได้หน่อย', 'วันนี้ขาดทุนอีกแล้ว ยอดขายไม่พอค่าใช้จ่ายเลยครับ',
   'เสนอว่าอาทิตย์หน้าเปิดร้านสายลงได้ไหม ช่วงเช้ายอดขายน้อยมาก'].forEach(x => assert.ok(!ctx.isSalesAsk(x), 'ไม่ควรจับ: ' + x));
});

t('RUN board (คุณปาล์ม) → แนบปุ่มบอร์ดท้ายคำตอบ · พนักงานเรียกไม่ได้', () => {
  let e = makeEnv({ ai: () => 'ได้ค่ะ\n[[RUN]]{"cmd":"board"}[[/RUN]]' });
  e.ctx.handleEvent(dm(OWNER, 'งานในบอร์ดดูตรงไหนนะ'));
  assert.strictEqual(e.S.replies[0].messages.length, 2);
  e = makeEnv({ ai: () => 'ได้ค่ะ\n[[RUN]]{"cmd":"board"}[[/RUN]]' });
  e.ctx.handleEvent(dm('Ustaff', 'งานในบอร์ดดูตรงไหน'));
  assert.ok(!e.S.replies.length || e.S.replies[0].messages.length === 1);
});

t('สมองรู้เวลาปัจจุบัน: ต่อท้ายข้อความล่าสุด (ไม่ใส่ system กันแคชพัง)', () => {
  const { ctx, S } = makeEnv({ ai: () => 'ได้ค่ะ' });
  ctx.handleEvent(dm(OWNER, 'วันนี้วันอะไรนะ'));
  const msgs = S.prompts.find(b => b.system).messages;
  assert.ok(/\(เวลาตอนนี้: .+ น\. เวลาไทย\)$/.test(msgs[msgs.length - 1].content));
  assert.ok(!/เวลาตอนนี้/.test(JSON.stringify(S.prompts.find(b => b.system).system)));
});

t('หากลุ่มจากชื่อเรียกอื่น: "ร้านกาแฟ"/"คาเฟ่" = กลุ่ม Old Days (แชทจริงเคยหาไม่เจอ) · ไม่มีกลุ่มร้าน = ไม่เดา', () => {
  const { ctx } = makeEnv();
  const base = ctx.listKnownGroups;
  ctx.listKnownGroups = () => base().concat([{ id: 'Cod0000000000000000000000000000000', name: 'Old Days ทีมร้าน ☕' }]);
  ['ร้านกาแฟ', 'กลุ่มร้านกาแฟ', 'คาเฟ่'].forEach(x => assert.strictEqual(ctx.findGroupByName(x), 'Cod0000000000000000000000000000000', x));
  ctx.listKnownGroups = base;
  assert.strictEqual(ctx.findGroupByName('ร้านกาแฟ'), '');
});

// ── 🏭 กลุ่มฝ่ายผลิต: ส่งต่อทุกข้อความ + ถามเมื่อแจ้งจอดแล้วเงียบ (คุณปาล์ม 05/10 · ยืนยัน 19/10) ──
const PROD_URL_PART = 'AKfycbyz9gSSkms44VWcnD3wtZx9C33aG1r5LAjxVPMjD_EcqzwzxU2UBtVVd15qfO_idObE';
const prodCalls = S => S.fetches.filter(f => f.url.indexOf(PROD_URL_PART) !== -1).map(f => f.body);

t('กลุ่มฝ่ายผลิต: คำตอบสั้นที่ไม่มีคำเรื่องเครื่อง ("ช่างเปลี่ยนแล้วครับ ทำงานได้ปกติ" "ได้แล้วครับ") ก็ส่งต่อแอปทีมผลิต · เลขาเงียบ', () => {
  for (const text of ['ช่างเปลี่ยนแล้วครับ ทำงานได้ปกติ', 'ได้แล้วครับ', 'ยังครับ']) {
    const { ctx, S } = makeEnv();
    ctx.handleEvent(ev('text', { text }, PROD_GID));
    const b = prodCalls(S);
    assert.strictEqual(b.length, 1, text);
    assert.strictEqual(b[0].action, 'lineChat'); assert.strictEqual(b[0].text, text); assert.strictEqual(b[0].token, expectToken);
    assert.strictEqual(S.replies.length + S.pushes.length, 0, 'ไม่ตอบในกลุ่ม');
  }
});

t('กลุ่มอื่น / แชทส่วนตัว ไม่ส่งต่อแอปทีมผลิต', () => {
  const { ctx, S } = makeEnv();
  ctx.handleEvent(ev('text', { text: 'ขออนุญาตจอดเครื่อง' }, OTHER_GID));
  ctx.handleEvent(dm('Ustaff1', 'ขออนุญาตจอดเครื่อง'));
  assert.strictEqual(prodCalls(S).length, 0);
});

t('productionNudge: แอปบอก ask → ส่งข้อความตามแอปเป๊ะลงกลุ่มฝ่ายผลิต 1 ครั้ง + จด log', () => {
  const text = '🔧 สอบถามค่ะ เครื่องที่แจ้งจอดตอน 10:00 น. ผ่านมา 1 ชม. 5 นาทีแล้ว ตอนนี้เดินเครื่องได้หรือยังคะ?';
  const { ctx, S } = makeEnv({ prodResp: b => (b.action === 'lineNudge' ? { success: true, ask: true, id: 'LE9', kind: 'จอดเครื่อง', text } : {}) });
  ctx.productionNudge();
  const b = prodCalls(S); assert.strictEqual(b.length, 1); assert.strictEqual(b[0].action, 'lineNudge'); assert.strictEqual(b[0].token, expectToken);
  assert.strictEqual(S.pushes.length, 1); assert.strictEqual(S.pushes[0].to, PROD_GID); assert.strictEqual(S.pushes[0].messages[0].text, text);
  assert.ok(S.logs.some(l => l[0] === 'ถามจอดเครื่อง' && /LE9/.test(l[2])));
});

t('productionNudge: ask:false / ตอบพัง / แอปล่ม → ไม่ส่งอะไรลงกลุ่ม ไม่พัง', () => {
  for (const o of [{ prodResp: () => ({ success: true, ask: false }) }, { prodResp: () => ({ success: false, error: 'รหัสเชื่อมไม่ถูกต้อง', ask: true, text: 'x' }) },
                   { prodResp: () => ({ success: true, ask: true }) }, { prodThrow: true }]) {
    const { ctx, S } = makeEnv(o);
    ctx.productionNudge();
    assert.strictEqual(S.pushes.length, 0, JSON.stringify(o.prodResp ? o.prodResp({}) : 'throw'));
  }
});

t('หลังเลขาถามจอดเครื่อง พนักงานกดตอบกลับ/พิมพ์เป็นคำถาม → ส่งแอปทีมผลิต แต่สมองเลขาไม่พูดแทรกในกลุ่ม', () => {
  const { ctx, S } = makeEnv({ prodResp: b => (b.action === 'lineNudge' ? { success: true, ask: true, id: 'LE1', kind: 'จอดเครื่อง', text: 'เดินเครื่องได้หรือยังคะ?' } : { success: true, saved: true, act: 'ปิดการจอด' }),
                               ai: () => 'รับทราบค่ะ ขอบคุณนะคะ' });
  ctx.productionNudge();
  ctx.handleEvent(ev('text', { text: 'เดินแล้วครับ ต้องแจ้งใครอีกไหม?', quotedMessageId: 'Q1' }, PROD_GID));
  assert.strictEqual(prodCalls(S).filter(b => b.action === 'lineChat').length, 1);
  assert.strictEqual(S.anthropic, 0, 'ไม่เรียกสมอง'); assert.strictEqual(S.replies.length, 0); assert.strictEqual(S.pushes.length, 1, 'มีแค่ข้อความถามของแอป');
});

t('productionNudge: ไม่รู้จักกลุ่มฝ่ายผลิต → ไม่ถามแอป ไม่ส่ง', () => {
  const { ctx, S } = makeEnv({ prodResp: () => ({ success: true, ask: true, text: 'x' }) });
  ctx.listKnownGroups = () => [{ id: OTHER_GID, name: 'กลุ่มคุยเล่น' }];
  ctx.productionNudge();
  assert.strictEqual(prodCalls(S).length, 0); assert.strictEqual(S.pushes.length, 0);
});

// ── 📨 สรุปบิล + คำถาม ลงกลุ่มบิล (แอปบัญชี v0.12 · คุณปาล์ม 20/10) ──
const SAY = '🧾 สรุปบิลวันนี้ค่ะ\n**โรงน้ำ**\n1) ค่าไฟ 0,000 บาท\n2) ??? ร้านไหนคะ\n\n\n(ตอบเลขข้อได้เลย)';
t('expenseOutbox: ได้ say → ส่งลงกลุ่มบิลตามตัวอักษรเป๊ะ (ไม่ตัด ** ไม่ยุบบรรทัด) → แจ้ง expenseOutboxSent ok+msgId → notice หาคุณปาล์ม', () => {
  let n2 = 0;
  const { ctx, S } = makeEnv({ financeResp: b => {
    if (b.action === 'expenseOutbox') return n2++ === 0 ? { success: true, act: 'say', outId: 'OUT1', say: SAY } : { success: true, act: 'none' };
    if (b.action === 'expenseOutboxSent') return { success: true, notify: true, notice: 'ส่งสรุปบิลลงกลุ่มแล้วค่ะ' };
    return {}; } });
  S.pushResp = { sentMessages: [{ id: 'LM777' }] };
  ctx.expenseOutboxTick();
  const g = S.pushes.filter(p => p.to === EXP_GID);
  assert.strictEqual(g.length, 1); assert.strictEqual(g[0].messages[0].text, SAY);
  const back = finCalls(S).filter(b => b.action === 'expenseOutboxSent');
  assert.strictEqual(back.length, 1); assert.strictEqual(back[0].outId, 'OUT1'); assert.strictEqual(back[0].ok, true); assert.strictEqual(back[0].msgId, 'LM777'); assert.strictEqual(back[0].token, expectToken);
  assert.ok(S.pushes.some(p => p.to === OWNER && /ส่งสรุปบิลลงกลุ่มแล้ว/.test(p.messages[0].text)));
  assert.strictEqual(S.anthropic, 0);
});

t('fireDueReminders: ชีตเตือนว่าง → ยังรันสรุปบิลลงกลุ่มต่อ (เคย return ออกทั้งฟังก์ชัน สรุปค้าง "รอส่ง")', () => {
  let n2 = 0;
  const { ctx, S } = makeEnv({ now: new Date('2026-10-19T07:00:00Z') /* 14:00 พ้นช่วงเตือนบิล */, financeResp: b => {
    if (b.action === 'expenseOutbox') return n2++ === 0 ? { success: true, act: 'say', outId: 'OUT9', say: 'สรุปบิล' } : { success: true, act: 'none' };
    return { success: true }; } });
  ctx.fireDueReminders();
  assert.ok(finCalls(S).some(b => b.action === 'expenseOutbox'), 'ต้องถาม expenseOutbox');
  assert.strictEqual(S.pushes.filter(p => p.to === EXP_GID && p.messages[0].text === 'สรุปบิล').length, 1);
  assert.ok(finCalls(S).some(b => b.action === 'expenseOutboxSent' && b.outId === 'OUT9'));
});

t('expenseOutbox: act none → ไม่ส่งอะไร ไม่แจ้งกลับ', () => {
  const { ctx, S } = makeEnv({ financeResp: () => ({ success: true, act: 'none' }) });
  ctx.expenseOutboxTick();
  assert.strictEqual(S.pushes.length, 0); assert.strictEqual(finCalls(S).filter(b => b.action === 'expenseOutboxSent').length, 0);
});

t('expenseOutbox: ไม่รู้จักกลุ่มบิล → ไม่ส่ง และไม่แจ้งกลับ (แอปบัญชีส่งใหม่เอง)', () => {
  const { ctx, S } = makeEnv({ financeResp: b => (b.action === 'expenseOutbox' ? { success: true, act: 'say', outId: 'O2', say: 'x' } : {}) });
  ctx.listKnownGroups = () => [{ id: OTHER_GID, name: 'กลุ่มคุยเล่น' }];
  ctx.expenseOutboxTick();
  assert.strictEqual(S.pushes.length, 0); assert.strictEqual(finCalls(S).filter(b => b.action === 'expenseOutboxSent').length, 0);
});

t('expenseOutbox: ไลน์ส่งไม่ผ่าน / ข้อความยาวเกิน → แจ้งกลับ ok:false + สาเหตุ', () => {
  const { ctx, S } = makeEnv({ financeResp: b => (b.action === 'expenseOutbox' ? { success: true, act: 'say', outId: 'O3', say: 'ก'.repeat(5001) } : { success: true }) });
  ctx.expenseOutboxTick();
  const back = finCalls(S).filter(b => b.action === 'expenseOutboxSent');
  assert.strictEqual(back.length, 1); assert.strictEqual(back[0].ok, false); assert.ok(/5,000/.test(back[0].error));
  assert.strictEqual(S.pushes.length, 0);
});

t('คนในกลุ่มบิล Reply ใส่ข้อความสรุป ("1 โอนแล้ว") → expenseChat พร้อม quotedMessageId · เลขาไม่ตอบเอง', () => {
  const { ctx, S } = makeEnv({ financeResp: () => ({ success: true, act: 'update' }) });
  ctx.handleEvent(ev('text', { text: '1 โอนแล้ว', quotedMessageId: 'LM777' }));
  const b = finCalls(S).filter(x => x.action === 'expenseChat');
  assert.strictEqual(b.length, 1); assert.strictEqual(b[0].quotedMessageId, 'LM777'); assert.strictEqual(S.anthropic, 0);
});

// ⛔ เลิกรายงานเช้า / ตามงานค้าง / เฝ้าบอร์ด (20/10) — เหลือหน้าร้าน "มีปัญหาเท่านั้น"
const fakeTriggers = (names, deleted) => ({
  getProjectTriggers: () => names.map(fn => ({ getHandlerFunction: () => fn })),
  deleteTrigger: tr => deleted.push(tr.getHandlerFunction()),
  newTrigger: fn => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => deleted.push('+' + fn) }),
                                          atHour: () => ({ everyDays: () => ({ create: () => deleted.push('+' + fn) }) }) }) }) });

t('setupTriggers: ตั้งแค่ fireDueReminders · ลบ morningBrief/boardWatch/nudgeStaleTasks ที่ค้าง', () => {
  const { ctx } = makeEnv(); const log = [];
  ctx.ScriptApp = fakeTriggers(['morningBrief', 'boardWatch', 'nudgeStaleTasks', 'fireDueReminders', 'อื่น'], log);
  ctx.setupTriggers();
  assert.deepStrictEqual(log, ['morningBrief', 'boardWatch', 'nudgeStaleTasks', 'fireDueReminders', '+fireDueReminders']);
});

t('fireDueReminders: ลบ trigger ที่เลิกแล้วที่ติดตั้งอยู่จริงเอง ครั้งเดียว (ไม่แตะ fireDueReminders)', () => {
  const { ctx, S } = makeEnv(); const del = []; let reads = 0;
  const f = fakeTriggers(['morningBrief', 'boardWatch', 'nudgeStaleTasks', 'fireDueReminders'], del);
  ctx.ScriptApp = Object.assign({}, f, { getProjectTriggers: () => { reads++; return f.getProjectTriggers(); } });
  ctx.fireDueReminders(); ctx.fireDueReminders();
  assert.deepStrictEqual(del, ['morningBrief', 'boardWatch', 'nudgeStaleTasks']);
  assert.strictEqual(reads, 1, 'จดว่าลบแล้ว รอบถัดไปไม่อ่าน trigger ซ้ำ');
  assert.ok(S.props.TRIGGERS_RETIRED);
});

t('morningBrief/boardWatch/nudgeStaleTasks โดน trigger เก่ายิง → ไม่ส่งอะไร และลบ trigger ทิ้ง', () => {
  for (const fn of ['morningBrief', 'boardWatch', 'nudgeStaleTasks']) {
    const { ctx, S } = makeEnv(); const del = [];
    ctx.ScriptApp = fakeTriggers([fn], del);
    ctx.readBoard = () => [['1', '', 'ใหม่', 'ด่วนมาก', '', '', '', '', 'งาน']];
    ctx[fn]({ triggerUid: 'T1' });
    assert.strictEqual(S.pushes.length, 0, fn); assert.deepStrictEqual(del, [fn]);
  }
});

const shopData = (closed) => ({ bills: [{ oid: 'S1', date: '2026-10-18', cust: 'ป้าแดง', amt: 120, paySt: 'ชำระแล้ว' }],
                                 closes: closed ? { '2026-10-18': { diff: 0 } } : {} });

t('หน้าร้าน: มีปัญหา (วานนี้ยังไม่ปิดยอด) → ส่งคุณปาล์มวันละครั้ง ช่วงเช้า', () => {
  const { ctx, S } = makeEnv(); ctx.plantShopData = () => shopData(false);
  ctx.fireDueReminders(); ctx.fireDueReminders();
  const own = S.pushes.filter(p => p.to === OWNER);
  assert.strictEqual(own.length, 1); assert.ok(/หน้าร้านโรงน้ำ/.test(own[0].messages[0].text) && /ยังไม่ปิดยอด/.test(own[0].messages[0].text));
  assert.strictEqual(S.props.SHOP_ALERT_DAY, '2026-10-19');
});

t('หน้าร้าน: ไม่มีปัญหา → เงียบ (ไม่ส่ง "ทุกอย่างปกติ")', () => {
  const { ctx, S } = makeEnv(); ctx.plantShopData = () => shopData(true);
  ctx.fireDueReminders();
  assert.strictEqual(S.pushes.length, 0); assert.strictEqual(S.props.SHOP_ALERT_DAY, '2026-10-19');
});

t('หน้าร้าน: ส่งไม่ผ่าน (โควต้าไลน์หมด 429) → ไม่จดวัน รอบหน้าลองใหม่ · นอกช่วงเช้าไม่ส่ง', () => {
  const { ctx, S } = makeEnv(); ctx.plantShopData = () => shopData(false);
  S.pushCode = 429; ctx.fireDueReminders(); assert.ok(!S.props.SHOP_ALERT_DAY);
  S.pushCode = 200; ctx.fireDueReminders(); assert.strictEqual(S.props.SHOP_ALERT_DAY, '2026-10-19');
  const late = makeEnv({ now: new Date('2026-10-19T07:00:00Z') /* 14:00 */ }); late.ctx.plantShopData = () => shopData(false);
  late.ctx.fireDueReminders(); assert.strictEqual(late.S.pushes.length, 0);
});

// ── 🧪 ค่า pH ฝ่ายผลิต: เลขาตอบรับ/จด/ทวงแบบ reply เท่านั้น (คุณปาล์ม 02/11) ──
const phAi = v => body => (JSON.stringify(body).indexOf('ค่าpH') !== -1
  ? 'เกี่ยวข้อง: ใช่\nบรรยาย: รูปชุดตรวจค่า pH\nหมวด: โรงน้ำ-ละกอน\nค่าpH: ' + v
  : 'เกี่ยวข้อง: ใช่\nบรรยาย: รูปงาน\nหมวด: โรงน้ำ-ละกอน');
const at = (S, iso) => { S.now = new Date(iso); };
const phLog = S => JSON.parse(S.props.PH_LOG || '{}');
const prodTxt = (text, uid) => { const e = ev('text', { text }, PROD_GID); if (uid) e.source.userId = uid; return e; };

t('pH: ตั้มส่งรูปชุดตรวจตอนเช้า → เลขาอ่านค่าจากรูป ตอบรับในกลุ่ม (reply) + จด + ส่งแอปทีมผลิต · ไม่ push', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T01:20:00Z') /* 08:20 */, ai: phAi('7.5') });
  ctx.handleEvent(ev('image', {}, PROD_GID));
  assert.strictEqual(S.replies.length, 1); assert.ok(/รับทราบ.*รอบเช้า.*7\.5.*อยู่ในเกณฑ์/.test(replyText(S)), replyText(S));
  assert.strictEqual(S.pushes.length, 0);
  assert.ok(S.prompts.some(p => JSON.stringify(p).indexOf('ค่าpH') !== -1), 'ขอให้ AI อ่านค่า pH');
  const q = prodCalls(S).filter(b => b.action === 'lineQc');
  assert.strictEqual(q.length, 1); assert.strictEqual(q[0].ph, 7.5); assert.strictEqual(q[0].slot, 'am'); assert.strictEqual(q[0].how, 'photo');
  assert.strictEqual(phLog(S)['2026-11-03'].am.ph, 7.5);
});

t('pH: กลุ่มอื่นส่งรูป → ไม่ขอให้อ่าน pH ไม่ตอบ · PH_WATCH=off → กลุ่มผลิตก็เงียบ', () => {
  const a = makeEnv({ now: new Date('2026-11-03T01:20:00Z'), ai: phAi('7.5') });
  a.ctx.handleEvent(ev('image', {}, OTHER_GID));
  assert.ok(!a.S.prompts.some(p => JSON.stringify(p).indexOf('ค่าpH') !== -1)); assert.strictEqual(a.S.replies.length, 0);
  const b = makeEnv({ now: new Date('2026-11-03T01:20:00Z'), ai: phAi('7.5'), props: { PH_WATCH: 'off' } });
  b.ctx.handleEvent(ev('image', {}, PROD_GID));
  assert.strictEqual(b.S.replies.length + b.S.pushes.length, 0);
});

t('pH: นอกเกณฑ์ → บอกในกลุ่มให้วัดซ้ำ + แจ้งคุณปาล์มส่วนตัว 1 ครั้ง (รูปซ้ำรอบเดิมไม่แจ้งซ้ำ)', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T01:20:00Z'), ai: phAi('9.5') });
  ctx.handleEvent(ev('image', {}, PROD_GID)); ctx.handleEvent(ev('image', {}, PROD_GID));
  assert.strictEqual(S.replies.length, 2); assert.ok(/⚠️.*นอกเกณฑ์ \(6\.5–8\.5\)/.test(S.replies[0].messages[0].text));
  const own = S.pushes.filter(p => p.to === OWNER);
  assert.strictEqual(own.length, 1); assert.ok(/9\.5.*อ่านจากรูป/.test(own[0].messages[0].text));
});

t('pH: อ่านสีจากรูปไม่ได้ → ขอให้พิมพ์ตัวเลข · พิมพ์ "ph 7" ตามมา → ตอบรับ + จดเป็นค่าพิมพ์', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T01:20:00Z'), ai: phAi('อ่านไม่ได้') });
  ctx.handleEvent(ev('image', {}, PROD_GID));
  assert.ok(/เทียบสีจากรูปไม่ชัด.*พิมพ์ตัวเลข/.test(replyText(S)));
  ctx.handleEvent(prodTxt('ph 7 ครับ'));
  assert.ok(/รับทราบค่ะ ✅ pH รอบเช้า 7\.0 อยู่ในเกณฑ์/.test(S.replies[1].messages[0].text), replyText(S));
  const d = phLog(S)['2026-11-03']; assert.strictEqual(d.am.ph, 7); assert.strictEqual(d.am.how, 'typed');
  assert.strictEqual(prodCalls(S).filter(b => b.action === 'lineChat').length, 1, 'ข้อความยังส่งต่อแอปทีมผลิตตามเดิม');
});

t('pH: ตัวเลขที่ไม่ใช่ค่า pH ไม่ถูกจด', () => {
  const { ctx } = makeEnv();
  assert.strictEqual(ctx.phTypedValue('ค่าน้ำphเช้านี้ครับ'), null);
  assert.strictEqual(ctx.phTypedValue('ph 7.5'), 7.5); assert.strictEqual(ctx.phTypedValue('PH7'), 7);
  assert.strictEqual(ctx.phTypedValue('ค่า pH เช้านี้ 6.8 ครับ'), 6.8);
  for (const x of ['วัด ph ทุก 10 นาที', 'ตรวจ ph 2 รอบ', 'ผลิต 600ml 313 โหล', 'กรด-ด่าง หยด 3 หยด / 10 ml'])
    assert.strictEqual(ctx.phTypedValue(x), null, x);
});

t('pH: เลย 9 โมงยังไม่มีค่า + ทีมโพสต์อะไรก็ได้ → ทวงด้วยการตอบกลับ ครั้งเดียว · ก่อน 9 โมง/คุณปาล์มโพสต์/ส่งแล้ว = ไม่ทวง', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T01:50:00Z') /* 08:50 */ });
  ctx.handleEvent(prodTxt('แจ้งเดินเครื่องผลิตน้ำครับ'));
  assert.strictEqual(S.replies.length, 0, 'ก่อน 9 โมง');
  at(S, '2026-11-03T02:30:00Z');   // 09:30
  ctx.handleEvent(prodTxt('ทำ 250 ก่อนครับ', OWNER));
  assert.strictEqual(S.replies.length, 0, 'คุณปาล์มโพสต์ ไม่ทวง');
  ctx.handleEvent(prodTxt('ขวดล้มครับ'));
  assert.strictEqual(S.replies.length, 1); assert.ok(/เช้านี้ยังไม่เห็นค่า pH/.test(replyText(S)));
  ctx.handleEvent(prodTxt('แก้แล้วครับ'));
  assert.strictEqual(S.replies.length, 1, 'ทวงรอบละครั้ง');
  const c = makeEnv({ now: new Date('2026-11-03T02:10:00Z') /* 09:10 */, ai: phAi('7.5') });
  c.ctx.handleEvent(prodTxt('ค่าน้ำphเช้านี้ครับ')); c.ctx.handleEvent(ev('image', {}, PROD_GID));
  assert.strictEqual(c.S.replies.length, 1, 'พิมพ์คำบรรยายก่อนรูป ไม่โดนทวง'); assert.ok(/รับทราบ/.test(replyText(c.S)));
  assert.strictEqual(S.pushes.length, 0, 'ไม่ push เข้ากลุ่ม');
  const b = makeEnv({ now: new Date('2026-11-03T01:20:00Z'), ai: phAi('7.5') });
  b.ctx.handleEvent(ev('image', {}, PROD_GID)); at(b.S, '2026-11-03T02:30:00Z'); b.ctx.handleEvent(prodTxt('ขวดล้มครับ'));
  assert.strictEqual(b.S.replies.length, 1, 'ส่งแล้ว ไม่ทวง (มีแค่คำตอบรับรูป)');
});

t('pH: รอบบ่าย — เลย 15:00 ยังไม่มีค่า → ทวงรอบบ่าย · ก่อนวันเริ่ม (PH_FROM 3/11) ไม่ทวงทั้งเช้าและบ่าย', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T01:20:00Z'), ai: phAi('7.5') });
  ctx.handleEvent(ev('image', {}, PROD_GID));
  at(S, '2026-11-03T08:30:00Z');   // 15:30
  ctx.handleEvent(prodTxt('เปลี่ยนไปผลิต 600 ครับ'));
  assert.ok(/รอบบ่ายยังไม่เห็นค่า pH/.test(S.replies[1].messages[0].text));
  const b = makeEnv({ now: new Date('2026-11-02T08:30:00Z') });
  b.ctx.handleEvent(prodTxt('เปลี่ยนไปผลิต 600 ครับ'));
  assert.strictEqual(b.S.replies.length, 0);
  const c = makeEnv({ now: new Date('2026-11-02T04:55:00Z') /* 11:55 วันที่ระบบขึ้น */ });
  c.ctx.handleEvent(prodTxt('ขวดล้มครับ'));
  assert.strictEqual(c.S.replies.length, 0, 'วันที่ขึ้นระบบ (เช้าส่งไปแล้วก่อนระบบขึ้น) ไม่ทวง');
  assert.deepStrictEqual(Array.from(c.ctx.phMissed('2026-11-02', { actAm: 1 })), [], 'ไม่นับขาดวันก่อน PH_FROM');
});

t('pH: แจ้งเติมโซดาแอช → ขอให้วัดซ้ำทันที · เกิน 1 ชม. ยังไม่ส่ง → ทวง · ส่งรูปแล้ว = นับเป็นค่าหลังเปลี่ยนสาร', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T01:20:00Z'), ai: phAi('7.5') });
  ctx.handleEvent(ev('image', {}, PROD_GID));                       // รอบเช้า
  at(S, '2026-11-03T03:00:00Z'); ctx.handleEvent(prodTxt('เติมโซดาแอชแล้วครับ'));
  assert.ok(/วัด pH ซ้ำ/.test(S.replies[1].messages[0].text));
  at(S, '2026-11-03T04:10:00Z'); ctx.handleEvent(prodTxt('เดินเครื่องปกติครับ'));
  assert.ok(/หลังเปลี่ยนสารยังไม่เห็นค่า pH/.test(S.replies[2].messages[0].text));
  at(S, '2026-11-03T04:20:00Z'); ctx.handleEvent(ev('image', {}, PROD_GID));
  assert.ok(/หลังเปลี่ยนสาร 7\.5|หลังเปลี่ยนสาร ประมาณ 7\.5/.test(S.replies[3].messages[0].text), S.replies[3].messages[0].text);
  const d = phLog(S)['2026-11-03']; assert.strictEqual(d.chemDone, true);
});

t('pH: ค่ำ — ขาดส่ง 2 วันทำงานติด → แจ้งคุณปาล์ม 1 ข้อความ · เรียกซ้ำไม่ส่งซ้ำ · ขาดวันเดียวไม่แจ้ง', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-04T13:30:00Z') /* 20:30 */,
    props: { PH_LOG: JSON.stringify({ '2026-11-03': { actAm: 1, actPm: 1, am: { ph: 7, t: '08:20' } }, '2026-11-04': { actAm: 1, am: { ph: 7.5, t: '08:10' }, actPm: 1 } }) } });
  ctx.phEveningCheck(); ctx.phEveningCheck();
  const own = S.pushes.filter(p => p.to === OWNER);
  assert.strictEqual(own.length, 1); assert.ok(/ขาดส่ง 2 วันทำงานติดกัน[\s\S]*4\/11 ขาดรอบบ่าย[\s\S]*3\/11 ขาดรอบบ่าย/.test(own[0].messages[0].text), own[0].messages[0].text);
  const b = makeEnv({ now: new Date('2026-11-04T13:30:00Z'),
    props: { PH_LOG: JSON.stringify({ '2026-11-03': { actAm: 1, am: { ph: 7, t: '08:20' } }, '2026-11-04': { actAm: 1, actPm: 1 } }) } });
  b.ctx.phEveningCheck();
  assert.strictEqual(b.S.pushes.length, 0, 'เมื่อวานครบ');
});

t('pH: คุณปาล์มพิมพ์ "สรุป pH" ในแชทส่วนตัว → ตารางย้อนหลัง (ไม่ผ่านสมอง)', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-04T05:00:00Z'),
    props: { PH_LOG: JSON.stringify({ '2026-11-03': { actAm: 1, actPm: 1, am: { ph: 7, t: '08:20' } }, '2026-11-04': { actAm: 1, am: { ph: 9, t: '08:10' } } }) } });
  ctx.handleEvent(dm(OWNER, 'สรุป pH'));
  const r = replyText(S);
  assert.ok(/ค่า pH ฝ่ายผลิต/.test(r) && /อ 3\/11 · เช้า 7\.0 \(08:20\) · บ่าย ❌/.test(r) && /9\.0⚠️/.test(r), r);
  assert.strictEqual(S.anthropic, 0);
});

t('pH รูปซ้ำ ชั้น 1: ส่งไฟล์รูปเดิมเป๊ะ → บอกในกลุ่มให้วัดใหม่ ไม่นับเป็นการวัด + แจ้งคุณปาล์ม · รอบนั้นยังทวงได้', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T01:20:00Z'), ai: phAi('7.5') });
  S.imgBytes = () => [9, 9, 9];
  ctx.handleEvent(ev('image', {}, PROD_GID));                      // 3/11 08:20 ของจริง
  at(S, '2026-11-04T01:10:00Z'); ctx.handleEvent(ev('image', {}, PROD_GID));   // 4/11 ส่งรูปเดิมมาอีก
  assert.ok(/รูปเดียวกับรูปค่า pH ที่ส่งเมื่อ 3\/11 08:20 น\..*วัดใหม่/.test(S.replies[1].messages[0].text), S.replies[1].messages[0].text);
  const own = S.pushes.filter(p => p.to === OWNER);
  assert.strictEqual(own.length, 1); assert.ok(/🔁 รูป pH ซ้ำ \(ไฟล์เดิมเป๊ะ\)/.test(own[0].messages[0].text));
  const d = phLog(S)['2026-11-04']; assert.ok(!d.am, 'ไม่นับเป็นการวัด'); assert.strictEqual(d.dup.length, 1);
  assert.strictEqual(prodCalls(S).filter(b => b.action === 'lineQc').length, 1, 'ไม่ส่งรูปซ้ำเข้าแอป');
  at(S, '2026-11-04T02:30:00Z'); ctx.handleEvent(prodTxt('เดินเครื่องครับ'));
  assert.ok(/เช้านี้ยังไม่เห็นค่า pH/.test(S.replies[2].messages[0].text), 'รอบนั้นยังทวงได้');
  at(S, '2026-11-04T03:00:00Z'); ctx.handleEvent(dm(OWNER, 'สรุป pH'));
  assert.ok(/🔁 ส่งรูปเดิมซ้ำ 1 ครั้ง/.test(replyText(S)));
});

t('pH รูปซ้ำ ชั้น 2: AI ว่าเหมือนรูปเก่า (แคป/ครอป) → ในกลุ่มตอบรับปกติ (ไม่กล่าวหา) · ติดธง + แจ้งคุณปาล์มพร้อมลิงก์ 2 รูป', () => {
  const ai = body => (JSON.stringify(body).indexOf('ภาพถ่ายใบเดียวกัน') !== -1 ? 'ซ้ำ: 2' : phAi('7.5')(body));
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T01:20:00Z'), ai });
  ctx.handleEvent(ev('image', {}, PROD_GID));
  assert.strictEqual(S.anthropic, 1, 'รูปแรก ไม่มีรูปเก่าให้เทียบ');
  at(S, '2026-11-03T08:10:00Z'); ctx.handleEvent(ev('image', {}, PROD_GID));
  assert.ok(/รับทราบค่ะ ✅ pH รอบบ่าย/.test(S.replies[1].messages[0].text), 'ในกลุ่มตอบรับตามปกติ');
  const cmp = S.prompts.filter(p => JSON.stringify(p).indexOf('ภาพถ่ายใบเดียวกัน') !== -1);
  assert.strictEqual(cmp.length, 1); assert.strictEqual(cmp[0].messages[0].content.filter(c => c.type === 'image').length, 2);
  const own = S.pushes.filter(p => p.to === OWNER);
  assert.strictEqual(own.length, 1); assert.ok(/อาจเป็นรูปเดิม[\s\S]*3\/11 08:20 น\.[\s\S]*ใหม่: https[\s\S]*เก่า: https/.test(own[0].messages[0].text), own[0].messages[0].text);
  assert.strictEqual(phLog(S)['2026-11-03'].pm.sus, '2026-11-03 08:20');
  at(S, '2026-11-03T09:00:00Z'); ctx.handleEvent(dm(OWNER, 'สรุป pH'));
  assert.ok(/บ่าย 7\.5 \(15:10\) 🔁\?/.test(replyText(S)), replyText(S));
});

t('pH รูปซ้ำ: AI ตอบว่าไม่ซ้ำ → ไม่แจ้งใคร', () => {
  const ai = body => (JSON.stringify(body).indexOf('ภาพถ่ายใบเดียวกัน') !== -1 ? 'ซ้ำ: ไม่' : phAi('7.5')(body));
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T01:20:00Z'), ai });
  ctx.handleEvent(ev('image', {}, PROD_GID)); at(S, '2026-11-03T08:10:00Z'); ctx.handleEvent(ev('image', {}, PROD_GID));
  assert.strictEqual(S.pushes.length, 0); assert.ok(!phLog(S)['2026-11-03'].pm.sus);
});

// ── 🏖️ วันไม่ผลิตน้ำ ไม่ต้องวัด (คุณปาล์ม 02/11: เวียนไปช่วยโรงขวด / สลับวันหยุด) ──
t('pH วันไม่ผลิต: พี่ดาวบอก "พรุ่งนี้มาช่วยงานสกรีน" → รับทราบ · พรุ่งนี้ทีมโพสต์ก็ไม่ทวง', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T10:00:00Z') /* 17:00 */ });
  ctx.handleEvent(prodTxt('พรุ่งนี้แผนกโรงน้ำมาช่วยงานสกรีนอีก1วัน'));
  assert.ok(/รับทราบค่ะ 🙏 พรุ่งนี้ไม่ได้ผลิตน้ำ ไม่ต้องวัด pH/.test(replyText(S)), replyText(S));
  assert.deepStrictEqual(phLog(S)['2026-11-04'].off, { am: 1, pm: 1 });
  at(S, '2026-11-04T02:30:00Z'); ctx.handleEvent(prodTxt('กำลังสกรีนขวดครับ'));
  at(S, '2026-11-04T08:30:00Z'); ctx.handleEvent(prodTxt('สกรีนเสร็จแล้วครับ'));
  assert.strictEqual(S.replies.length, 1, 'ไม่ทวงทั้งเช้าและบ่าย');
});

t('pH วันไม่ผลิต: ตอบคำทวงว่า "วันนี้ไม่ผลิตครับ" → หยุดทวงทั้งวัน · คำทวงบอกวิธีตอบไว้ · คุณปาล์มบอกเอง = จดเงียบ', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T02:30:00Z') /* 09:30 */ });
  ctx.handleEvent(prodTxt('ไปช่วยโรงขวดก่อนนะ'));   // "ไปช่วย…โรงขวด"
  assert.ok(/ไม่ต้องวัด pH/.test(replyText(S)), 'จับคำว่าไปช่วยโรงขวด');
  const b = makeEnv({ now: new Date('2026-11-03T02:30:00Z') });
  b.ctx.handleEvent(prodTxt('ขวดล้มครับ'));
  assert.ok(/วันนี้ไม่ผลิต/.test(b.S.replies[0].messages[0].text), 'คำทวงบอกวิธีตอบ');
  b.ctx.handleEvent(prodTxt('วันนี้ไม่ผลิตครับ'));
  assert.ok(/รับทราบค่ะ 🙏 วันนี้ไม่ได้ผลิตน้ำ/.test(b.S.replies[1].messages[0].text));
  at(b.S, '2026-11-03T08:30:00Z'); b.ctx.handleEvent(prodTxt('เลิกงานครับ'));
  assert.strictEqual(b.S.replies.length, 2, 'บ่ายไม่ทวงต่อ');
  const c = makeEnv({ now: new Date('2026-11-03T01:00:00Z') });
  c.ctx.handleEvent(prodTxt('วันนี้หยุดผลิตน้ำทั้งวันนะ', OWNER));
  assert.strictEqual(c.S.replies.length, 0, 'คุณปาล์มพิมพ์เอง ไม่ตอบ'); assert.ok(phLog(c.S)['2026-11-03'].off.am);
});

t('pH วันไม่ผลิต: แจ้งจอดเครื่องชั่วคราว / "ยังไม่ผลิต" / มาช่วยแพ็คน้ำ ไม่ใช่วันหยุด', () => {
  const { ctx } = makeEnv({ now: new Date('2026-11-03T02:30:00Z') });
  const n = ctx.phNow();
  for (const x of ['ขออนุญาตแจ้งหยุดการผลิตน้ำครับ เนื่องจากขวดล้ม', 'ยังไม่ผลิตครับ รอขวด', 'มาช่วยแพ็คน้ำครับ', 'หยุดเครื่องแป๊บครับ'])
    assert.strictEqual(ctx.phOffParse(x, n), null, x);
  assert.strictEqual(ctx.phOffParse('บ่ายนี้ไม่ผลิตครับ', n).slot, 'pm');
  assert.strictEqual(ctx.phOffParse('เปลี่ยนวันหยุดเป็นพรุ่งนี้ วันอาทิตย์มาทำงานปกติ', n).day, '2026-11-04');
});

t('pH ค่ำ: ใช้รอบผลิตในแอปตัดสิน — วันมีรอบผลิตแต่ไม่มี pH เลย = ขาด · วันไม่มีรอบผลิต = ไม่นับ และไม่ตัดความติดกัน', () => {
  // 3/11 ผลิตแต่ไม่มีใครส่ง pH (ไม่มีโพสต์ในกลุ่มเลย) · 4/11 ไม่ผลิต · 5/11 ผลิต ส่งแค่เช้า
  const { ctx, S } = makeEnv({ now: new Date('2026-11-05T13:30:00Z'),
    props: { PH_LOG: JSON.stringify({ '2026-11-05': { actAm: 1, am: { ph: 7.5, t: '08:10' } } }) } });
  ctx.phMadeDays = () => ({ '2026-11-03': 1, '2026-11-05': 1 });
  ctx.phEveningCheck();
  const own = S.pushes.filter(p => p.to === OWNER);
  assert.strictEqual(own.length, 1); assert.ok(/5\/11 ขาดรอบบ่าย[\s\S]*3\/11 ขาดรอบเช้า, บ่าย/.test(own[0].messages[0].text), own[0].messages[0].text);
  const b = makeEnv({ now: new Date('2026-11-05T13:30:00Z'),
    props: { PH_LOG: JSON.stringify({ '2026-11-05': { actAm: 1, actPm: 1 } }) } });
  b.ctx.phMadeDays = () => ({ '2026-11-03': 1 });   // 5/11 ไม่มีรอบผลิต (ไปช่วยโรงขวดทั้งวัน แต่มีคนโพสต์)
  b.ctx.phEveningCheck();
  assert.strictEqual(b.S.pushes.length, 0); assert.strictEqual(phLog(b.S)['2026-11-05'].made, false);
  b.ctx.handleEvent(dm(OWNER, 'สรุป pH'));
  assert.ok(/พฤ 5\/11 · ไม่มีรอบผลิตในแอป/.test(replyText(b.S)) && /อ 3\/11 · เช้า ❌ · บ่าย ❌/.test(replyText(b.S)), replyText(b.S));
});

// ── 📘 ตอบวิธีใช้แอปเซลส์จากคู่มือจริง (คุณปาล์ม 19/10 · 03/11) ──
const helpAi = (kind, text) => body => {
  const sys = JSON.stringify(body.system || '');
  if (sys.indexOf('คู่มือแอปเซลส์') === -1) return 'SKIP';
  return kind + (text ? '\n' + text : '');
};
const isHelpCall = p => JSON.stringify(p.system || '').indexOf('คู่มือแอปเซลส์ v40.43') !== -1;

t('แอปเซลส์: พนักงานทักส่วนตัวถามวิธีใช้ → ตอบจากคู่มือฉบับที่รันจริง (ตัดคอมเมนต์หัวไฟล์) · ไม่ผ่านสมองหลัก', () => {
  const ans = 'ลงออเดอร์แบบนี้ค่ะ\n1. กด ลงออเดอร์ → เลือกร้าน';
  const { ctx, S } = makeEnv({ ai: helpAi('ANSWER', ans) });
  ctx.handleEvent(dm('Ustaff1', 'ลงออเดอร์ยังไงครับ งงมาก'));
  assert.strictEqual(replyText(S), ans);
  assert.strictEqual(S.anthropic, 1); assert.ok(isHelpCall(S.prompts[0]));
  const sys = JSON.stringify(S.prompts[0].system);
  assert.ok(sys.indexOf('ห้ามมีข้อมูลลับ') === -1, 'ตัดคอมเมนต์หัวไฟล์'); assert.ok(sys.indexOf('ไม่เกิน 5 บรรทัด') !== -1);
  ctx.handleEvent(dm('Ustaff1', 'แล้วกดส่งแล้วตรงไหนครับ'));
  assert.strictEqual(S.helpFetches, 1, 'แคชคู่มือ ไม่ดึงซ้ำทุกคำถาม');
});

t('แอปเซลส์: ในกลุ่มเซลส์ไม่ได้เรียกเลขา แต่ถามเรื่องแอป → ตอบ · คุยงานทั่วไป/ถามเงิน ไม่เรียก AI ไม่ตอบ', () => {
  const { ctx, S } = makeEnv({ ai: helpAi('ANSWER', 'ทำแบบนี้ค่ะ\n1. กด ✅ ส่งแล้ว') });
  ctx.handleEvent(ev('text', { text: 'กดส่งแล้วไม่ได้ ทำไงครับ' }, OTHER_GID));
  assert.strictEqual(S.replies.length, 1); assert.ok(/ส่งแล้ว/.test(replyText(S)));
  for (const x of ['บิลนี้โอนยังครับ?', 'พรุ่งนี้ไปสายแม่เมาะนะ', 'ร้านป้าแดงเอา 600 สองแพ็ค']) ctx.handleEvent(ev('text', { text: x }, OTHER_GID));
  assert.strictEqual(S.replies.length, 1); assert.strictEqual(S.anthropic, 1, 'กรองคำก่อนเรียก AI');
});

t('แอปเซลส์: AI ว่าไม่ใช่คำถามวิธีใช้ (SKIP) → ในกลุ่มเงียบ', () => {
  const { ctx, S } = makeEnv({ ai: helpAi('SKIP') });
  ctx.handleEvent(ev('text', { text: 'แอปวันนี้เร็วดีนะ ไม่ค้างเลย?' }, OTHER_GID));
  assert.strictEqual(S.replies.length, 0);
});

t('แอปเซลส์: คู่มือไม่มีคำตอบ → แชทส่วนตัวบอกให้ถามตามหัวข้อส่งต่อ · ในกลุ่มเงียบ · จดไว้ให้เติมคู่มือ', () => {
  const { ctx, S } = makeEnv({ ai: helpAi('NOTDOC', 'เรื่องนี้ดิฉันยังไม่มีข้อมูลค่ะ ถามหัวหน้าสายนะคะ') });
  ctx.handleEvent(dm('Ustaff1', 'แอปพิมพ์ใบเสนอราคาได้ไหมครับ'));
  assert.ok(/ถามหัวหน้าสาย/.test(replyText(S)));
  ctx.handleEvent(ev('text', { text: 'แอปพิมพ์ใบเสนอราคาได้ไหมครับ' }, OTHER_GID));
  assert.strictEqual(S.replies.length, 1, 'ในกลุ่มไม่ตอบว่าไม่รู้');
  assert.strictEqual(S.logs.filter(l => l[0] === 'คำถามแอป(คู่มือยังไม่มี)').length, 2);
});

t('แอปเซลส์: เปิดคู่มือไม่ได้ → แชทส่วนตัวบอกให้ถามหัวหน้าสาย · ในกลุ่มเงียบ · ไม่เรียก AI', () => {
  const { ctx, S } = makeEnv({ helpFail: true, ai: helpAi('ANSWER', 'x') });
  ctx.handleEvent(dm('Ustaff1', 'ลงออเดอร์ยังไงครับ'));
  assert.ok(/เปิดคู่มือแอปเซลส์ไม่ได้/.test(replyText(S)));
  ctx.handleEvent(ev('text', { text: 'ลงออเดอร์ยังไงครับ' }, OTHER_GID));
  assert.strictEqual(S.replies.length, 1); assert.strictEqual(S.anthropic, 0);
});

t('แอปเซลส์: กลุ่มฝ่ายผลิต/กลุ่มบิล/คุณปาล์ม ไม่เข้าทางนี้ · เกินโควต้า AI ต่อ 6 ชม. = หยุดเรียก', () => {
  const { ctx, S } = makeEnv({ ai: helpAi('ANSWER', 'ตอบค่ะ') });
  ctx.handleEvent(ev('text', { text: 'แอปกดไม่ได้ ทำไงครับ' }, PROD_GID));
  ctx.handleEvent(dm(OWNER, 'แอปเซลส์ปุ่มส่งแล้วกดไม่ได้ ทำไง'));
  assert.ok(!S.prompts.some(isHelpCall));
  const b = makeEnv({ ai: helpAi('ANSWER', 'ตอบค่ะ'), props: { APP_HELP_MAX: '1' } });
  b.ctx.handleEvent(ev('text', { text: 'ลงออเดอร์ยังไงครับ' }, OTHER_GID)); b.ctx.handleEvent(ev('text', { text: 'ออกบิลตรงไหนครับ' }, OTHER_GID));
  assert.strictEqual(b.S.replies.length, 1);
});

t('แอปเซลส์: แท็กคุณปาล์มถามวิธีใช้ → ตัวคัดเรื่อง (นักพัฒนา) ได้คู่มือฉบับจริงไปด้วย', () => {
  const { ctx, S } = makeEnv({ ai: () => 'HOWTO\nกด ลงออเดอร์ ค่ะ' });
  ctx.issueRead = () => ({ data: [[]], col: {}, nc: 0 }); ctx.issueFindOpen = () => -1;
  ctx.handleAppIssueMention(ev('text', { text: '@Palm ลงออเดอร์ยังไงครับ' }, OTHER_GID), OTHER_GID, 'Umom', '@Palm ลงออเดอร์ยังไงครับ', 'rt1');
  assert.ok(S.prompts.some(p => JSON.stringify(p).indexOf('คู่มือแอปเซลส์ v40.43') !== -1));
  assert.ok(/ลงออเดอร์/.test(replyText(S)));
});

// ── 💸 คัดรูปด้วยรุ่นเล็ก (ใบสั่งงาน origin-hq 06/11 ลดค่าอ่านรูป) ──
const imgCalls = S => S.prompts.filter(p => JSON.stringify(p.messages || []).indexOf('"type":"image"') !== -1);
const imgAi = (small, big) => body => (body.model === 'claude-haiku-5-5' ? small : big);

t('อ่านรูป: ยังไม่ตั้ง IMAGE_MODEL → ใช้รุ่นหลักเหมือนเดิม (ไม่มี effort) · ตั้งเป็นรุ่นเล็ก → Haiku + effort low', () => {
  const a = makeEnv({ ai: () => 'เกี่ยวข้อง: ใช่\nบรรยาย: สลิปโอน 1,350.00 บาท\nหมวด: การเงิน-เอกสาร' });
  a.ctx.handleEvent(ev('image', {}, OTHER_GID));
  const c1 = imgCalls(a.S); assert.strictEqual(c1.length, 1); assert.strictEqual(c1[0].model, 'claude-sonnet-5-5'); assert.ok(!c1[0].output_config);
  const b = makeEnv({ props: { IMAGE_MODEL: 'claude-haiku-5-5' }, ai: () => 'เกี่ยวข้อง: ใช่\nบรรยาย: สลิปโอน\nหมวด: การเงิน-เอกสาร' });
  b.ctx.handleEvent(ev('image', {}, OTHER_GID));
  const c2 = imgCalls(b.S); assert.strictEqual(c2.length, 1); assert.strictEqual(c2[0].model, 'claude-haiku-5-5');
  assert.deepStrictEqual(c2[0].output_config, { effort: 'low' });
  assert.strictEqual(b.S.files.length, 1, 'เก็บรูปตามปกติ');
});

t('อ่านรูป: รูปตรวจ pH ในกลุ่มฝ่ายผลิตใช้รุ่นหลักเสมอ แม้ตั้งรุ่นเล็ก', () => {
  const { ctx, S } = makeEnv({ now: new Date('2026-11-03T01:20:00Z'), props: { IMAGE_MODEL: 'claude-haiku-5-5' },
    ai: () => 'เกี่ยวข้อง: ใช่\nบรรยาย: ชุดตรวจ pH\nหมวด: โรงน้ำ-ละกอน\nค่าpH: 7.5' });
  ctx.handleEvent(ev('image', {}, PROD_GID));
  const c = imgCalls(S).filter(p => JSON.stringify(p).indexOf('ค่าpH') !== -1);
  assert.strictEqual(c.length, 1); assert.strictEqual(c[0].model, 'claude-sonnet-5-5'); assert.ok(!c[0].output_config);
});

t('อ่านรูป: รุ่นเล็กตอบไม่ตามรูปแบบ/ปฏิเสธ → ให้รุ่นหลักอ่านซ้ำ ไม่ทิ้งรูป', () => {
  const { ctx, S } = makeEnv({ props: { IMAGE_MODEL: 'claude-haiku-5-5' },
    ai: imgAi('', 'เกี่ยวข้อง: ใช่\nบรรยาย: บิลขายละกอน 2,450.00 บาท\nหมวด: การเงิน-เอกสาร') });
  ctx.handleEvent(ev('image', {}, OTHER_GID));
  assert.deepStrictEqual(imgCalls(S).map(p => p.model), ['claude-haiku-5-5', 'claude-sonnet-5-5']);
  assert.strictEqual(S.files.length, 1); assert.ok(S.groupChat.some(g => /2,450\.00/.test(g[1])));
});

t('ค่าสมอง: คิดราคาตามรุ่นที่ตอบจริง (Haiku ถูกกว่า ~20 เท่า) · ก้อนเดิมก่อนเปลี่ยนยังคิดราคา Sonnet', () => {
  const { ctx, S } = makeEnv();
  const day = 'AIU_2026-10-19';
  S.props[day] = JSON.stringify({ 'อ่านรูป': { n: 1, in: 1e6, cw: 0, cr: 0, out: 0 } });   // ก่อนอัปเดต = $2
  ctx.AI_TAG = 'อ่านรูป';
  ctx.trackUsage({ model: 'claude-haiku-5-5', usage: { input_tokens: 1e6, output_tokens: 1e6 } });   // $0.10 + $0.50
  ctx.trackUsage({ model: 'claude-sonnet-5-5', usage: { input_tokens: 1e6, output_tokens: 0 } });    // $2
  const t1 = JSON.parse(S.props[day])['อ่านรูป'];
  assert.strictEqual(t1.n, 3); assert.ok(Math.abs(t1.usd - 4.6) < 1e-9, String(t1.usd));
  assert.ok(Math.abs(ctx.aiUsageDay('2026-10-19').byTag['อ่านรูป'].thb - 4.6 * ctx.usdThb()) < 1e-6);
});

t('ลองรุ่นเล็ก: ตัวเลขที่ไม่ใช่เงิน (ลิตร) ไม่นับเป็นยอด · 1,000.00 = 1000 · cat เลือกหมวด · สลิปอ่านยอดผิด = ไม่ผ่าน', () => {
  const lib = [
    [new Date(), 'การเงิน-เอกสาร', 'บิลน้ำมัน', 'ใบเสร็จน้ำมันดีเซล 23.590 ลิตร รวม 1,000.00 บาท', 'https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAA1/view', 'แม่', 'ไลน์'],
    [new Date(), 'การเงิน-เอกสาร', 'สลิป', 'สลิปโอนเงินสำเร็จ 660.00 บาท', 'https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAA2/view', 'แม่', 'ไลน์'],
    [new Date(), 'โรงน้ำ-ละกอน', 'สต๊อก', 'กองน้ำละกอน', 'https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAA3/view', 'แม่', 'ไลน์']];
  const sheet = { getLastRow: () => lib.length + 1, getRange: (r, c, nr) => ({ getValues: () => lib.slice(r - 2, r - 2 + nr) }) };
  const run = desc => {
    const { ctx, S } = makeEnv({ ai: () => 'เกี่ยวข้อง: ใช่\nบรรยาย: ' + desc + '\nหมวด: การเงิน-เอกสาร' });
    ctx.libSheet = () => sheet;
    ctx.DriveApp.getFileById = () => ({ getBlob: () => ({ getBytes: () => [1], getContentType: () => 'image/jpeg' }) });
    return ctx.imageModelTrial(2, false, 'การเงิน-เอกสาร');
  };
  const good = run('ใบเสร็จดีเซล 23.590 ลิตร 1000 บาท และสลิป 660 บาท');
  assert.strictEqual(good.n, 2, 'เลือกเฉพาะหมวดเอกสารเงิน'); assert.strictEqual(good.amountChecked, 2);
  assert.deepStrictEqual(Array.from(good.items.map(x => x.amount)).sort(), ['1,000.00', '660.00']);
  assert.strictEqual(good.amountOk, 2); assert.strictEqual(good.slipChecked, 1); assert.strictEqual(good.pass, true);
  const bad = run('ใบเสร็จดีเซล 1,000.00 บาท สลิป 600 บาท');
  assert.strictEqual(bad.slipOk, 0); assert.strictEqual(bad.pass, false);
});

t('ลองรุ่นเล็ก (imgTrial): ต้องมีรหัส · ผสมหมวด · ผ่านเกณฑ์ + apply → ตั้ง IMAGE_MODEL · ยอดเงินอ่านผิด = ไม่ผ่าน ไม่เปิด', () => {
  const lib = [];
  for (let i = 0; i < 12; i++) lib.push([new Date(), 'การเงิน-เอกสาร', 'สลิป', 'สลิปโอน ยอด 1,' + (100 + i) + '.00 บาท', 'https://drive.google.com/file/d/FILEID' + String(i).padStart(20, '0') + '/view', 'แม่', 'ไลน์']);
  for (let i = 0; i < 12; i++) lib.push([new Date(), 'โรงน้ำ-ละกอน', 'สต๊อก', 'กองน้ำละกอน', 'https://drive.google.com/file/d/STOCKID' + String(i).padStart(20, '0') + '/view', 'แม่', 'ไลน์']);
  const sheet = { getLastRow: () => lib.length + 1, getRange: (r, c, nr) => ({ getValues: () => lib.slice(r - 2, r - 2 + nr) }) };
  const run = (aiFn, apply) => {
    const { ctx, S } = makeEnv({ ai: aiFn, props: { LEARN_KEY: 'Lk1' } });
    ctx.libSheet = () => sheet; ctx.learnKeyOk = k => k === 'Lk1';
    ctx.DriveApp.getFileById = id => ({ getBlob: () => ({ getBytes: () => [1, 2, 3], getContentType: () => 'image/jpeg', _id: id }) });
    return { ctx, S, out: ctx.imageModelTrial(20, apply) };
  };
  const amounts = lib.map(r => (r[3].match(/[\d,]+\.\d{2}/) || [''])[0]).filter(Boolean);
  // ทุกรูป "เกี่ยวข้อง" แต่คำบรรยายไม่มียอดเงิน → ไม่ผ่าน
  const good = run(() => 'เกี่ยวข้อง: ใช่\nบรรยาย: สลิปโอนเงิน\nหมวด: การเงิน-เอกสาร', true);
  assert.strictEqual(good.out.n, 20); assert.ok(good.out.items.some(x => x.cat === 'โรงน้ำ-ละกอน') && good.out.items.some(x => x.cat === 'การเงิน-เอกสาร'), 'ผสมหมวด');
  assert.ok(good.S.prompts.every(p => p.model === 'claude-haiku-5-5'));
  assert.strictEqual(good.out.pass, false, 'บรรยายไม่มียอดเงิน = ไม่ผ่าน'); assert.ok(!good.S.props.IMAGE_MODEL);
  // คำบรรยายมียอดของทุกรูปในคลัง (ตัวที่ตรงกับรูปนั้นอยู่ในนั้นแน่) → ผ่าน + เปิดใช้
  const ok = run(() => 'เกี่ยวข้อง: ใช่\nบรรยาย: สลิป ' + amounts.join(' ') + '\nหมวด: การเงิน-เอกสาร', true);
  assert.strictEqual(ok.out.pass, true); assert.strictEqual(ok.out.applied, true); assert.strictEqual(ok.S.props.IMAGE_MODEL, 'claude-haiku-5-5');
  const res = ok.ctx.doGet({ parameter: { action: 'imgTrial', key: 'ผิด' } });
  assert.ok(/unauthorized/.test(res.t));
});

console.log('\nผ่านทั้งหมด ' + n + ' ข้อ');

// 🛠️ นักพัฒนา — ไฟล์แยก แต่รันในคำสั่งเดียวกัน (CI + ก่อน deploy เรียกแค่ unit.test.js)
require('./issue.test.js');

// 🍾 เฝ้าเครื่องเป่าขวด PET10 (กลุ่ม TEAMWORK) — ไฟล์แยก รันต่อท้าย
require('./pet10.test.js');

// ⛽ บิลน้ำมันจากกลุ่มสายรถ → แอปรถ — ไฟล์แยก รันต่อท้าย
require('./fuel.test.js');

// 🧠 สมองหลัก + คำสั่ง orders + โน้ตพ่วงใบงาน (10/11) — ไฟล์แยก รันต่อท้าย
require('./brain.test.js');

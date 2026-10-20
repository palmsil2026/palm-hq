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

console.log('\nผ่านทั้งหมด ' + n + ' ข้อ');

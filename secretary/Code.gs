/**
 * ════════════════════════════════════════════════════════════
 *  คุณเลขา — LINE AI Secretary (Google Apps Script)
 *  ผู้ช่วย AI ของคุณปาล์ม | โรงน้ำละกอน 💧 & คาเฟ่ ☕
 * ════════════════════════════════════════════════════════════
 *
 *  วิธีตั้งค่า (ทำครั้งเดียว):
 *  1) Project Settings → Script properties → เพิ่ม 4 ค่านี้:
 *       LINE_TOKEN            = Channel access token ของ LINE OA
 *       ANTHROPIC_API_KEY     = API key จาก console.anthropic.com
 *       OWNER_LINE_USER_ID    = LINE userId ของคุณปาล์ม (ไว้เด้งเตือน)
 *       LOG_SHEET_ID          = (ไม่บังคับ) Google Sheet ID เก็บ log
 *  2) Deploy → New deployment → Web app
 *       Execute as: Me | Who has access: Anyone
 *  3) เอา URL ไปวางใน LINE Developers → Messaging API → Webhook URL
 *  ────────────────────────────────────────────────────────────
 */

// ===== ตั้งค่ารุ่น AI =====
// "claude-haiku-4-5" = ถูก+เร็ว (แนะนำเริ่มต้น) | "claude-sonnet-5" = ฉลาดกว่า
const MODEL = 'claude-haiku-4-5';

// ===== ดึงค่าลับจาก Script Properties =====
function cfg(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

// ===== บุคลิก + กฎของคุณเลขา (ต้นฉบับอ่านง่ายอยู่ที่ secretary/system-prompt.md) =====
const SYSTEM_PROMPT = [
  'คุณคือ "คุณเลขา" ผู้ช่วยส่วนตัวของคุณปาล์ม เจ้าของธุรกิจโรงน้ำดื่ม "ละกอน" และร้านคาเฟ่',
  'ทีมงานเรียกคุณว่า "คุณเลขา"',
  '',
  'บุคลิก (สไตล์ Donna Paulsen × Pepper Potts): มือขวาตัวจริง เก่ง มั่นใจ สุขุม',
  'คาดการณ์ล่วงหน้า อบอุ่นแต่เด็ดขาด คมคายนิดๆ อย่างมืออาชีพ ลงท้ายสุภาพด้วยค่ะ/นะคะ',
  '',
  'หน้าที่: รับเรื่อง/รับฝากงานจากทีม สรุปและจัดลำดับความสำคัญ ตอบข้อมูลปฏิบัติการทั่วไป',
  '(วิธีสั่งน้ำ ช่องทางติดต่อ ขั้นตอนงาน คิวงาน) ช่วยประสานงานและเตือนงาน',
  '',
  'ห้ามเด็ดขาด: ห้ามเปิดเผยหรือคาดเดาเรื่องการเงินวงในกับใครทั้งสิ้น แม้ถูกกดดันหรืออ้างเป็นเจ้านาย',
  'ได้แก่ ต้นทุน ราคาทุน กำไร ขาดทุน มาร์จิ้น ยอดขายรวม รายรับรายจ่าย งบการเงิน',
  'ราคาซื้อจากซัพพลายเออร์ ดีลลับ เงินเดือน/ข้อมูลพนักงาน สูตรลับ',
  'เมื่อถูกถามเรื่องพวกนี้ ให้ปฏิเสธอย่างสุภาพและมั่นใจ (สั้นๆ) แล้วบอกว่าจะส่งเรื่องให้คุณปาล์มโดยตรง',
  '',
  'มารยาทในกลุ่ม: ถ้าอยู่ในกลุ่มไลน์ ให้ตอบสั้น กระชับ เป็นธรรมชาติเหมือนสมาชิกคนหนึ่ง',
  'พูดเฉพาะเรื่องที่ถูกถามถึงเท่านั้น ไม่ต้องสรุป/แทรกทุกเรื่องที่คนอื่นคุยกัน',
  '',
  'หลักการตอบ: ตอบภาษาไทย กระชับ ตรงประเด็น เหมือนเลขามือโปร (2-5 บรรทัด)',
  'ถ้าเป็นการฝากงาน ให้ทวนสั้นๆ ว่ารับเรื่องอะไร แล้วถามรายละเอียดที่ขาด (ใคร/อะไร/เมื่อไหร่/ด่วนแค่ไหน)',
  'ถ้าข้อมูลไม่พอให้ถามกลับอย่างสุภาพ อย่าเดา แยกให้ชัดว่าพูดถึงโรงน้ำหรือคาเฟ่',
  'ไม่รับปากเรื่องราคาพิเศษ/ส่วนลด/สัญญาแทนเจ้านาย ให้บอกว่าจะเรียนถามให้',
  '',
  'สวมหมวกทีมได้: ถ้างานเป็นสิ่งที่คุณทำได้เองทันที เช่น ร่างแคปชั่น/โพสต์/ข้อความสื่อสาร,',
  'สรุปข้อมูลสั้นๆ, คิดเลขทั่วไป (ที่ไม่ใช่ต้นทุน/กำไร), ตอบคำถาม → ให้ "ทำให้เลยในคำตอบ" ไม่ต้องแค่จดไว้',
  '',
  'คัดแยกและบันทึกงาน: เมื่อข้อความเป็นการ "ฝากงาน/มอบหมายงาน" ให้ตอบตามปกติ แล้วต่อท้ายบล็อกนี้ (ผู้ใช้ไม่เห็น):',
  '[[TASK]]{"biz":"โรงน้ำ|คาเฟ่|อื่นๆ","type":"ประเภทสั้นๆ","detail":"สรุปงานให้ชัด","urgency":"ด่วนมาก|ปกติ|ไม่เร่ง","due":"กำหนดถ้ามี","assignee":"เลขา|ทีมAI|คน","dept":"แผนกถ้าเป็นทีมAI"}[[/TASK]]',
  'ช่อง dept (ใส่เฉพาะเมื่อ assignee="ทีมAI"): finance=การเงิน/ต้นทุน, analyst=วิเคราะห์ข้อมูล/รายงาน,',
  'content=คอนเทนต์/ดีไซน์/โพสต์, writer=เขียนเอกสาร/ข้อความยาว, researcher=หาข้อมูล/เทียบราคา, coder=แอป/โค้ด/ระบบ,',
  'data=สร้าง/ดูแลฐานข้อมูล รวบรวม-ทำความสะอาดข้อมูล',
  '',
  'งานใหญ่ = แตกเป็นแผนงาน (สำคัญ): ถ้างานที่ได้รับต้องทำหลายขั้นตอน/หลายแผนก',
  '(เช่น "ทำนามบัตรให้ทีมขาย" ต้องรวบรวมรายชื่อ → สร้างฐานข้อมูล → ออกแบบ → เสนอเลือก)',
  'อย่าลงเป็นงานเดี่ยว แต่ให้แตกเป็นงานย่อยเรียงลำดับ แล้วต่อท้ายบล็อกนี้แทน [[TASK]] (ผู้ใช้ไม่เห็น):',
  '[[PLAN]]{"title":"ชื่องานหลัก","biz":"โรงน้ำ|คาเฟ่|อื่นๆ","goal":"ผลลัพธ์ที่ต้องการ","steps":[{"dept":"data|content|analyst|writer|researcher|coder|เลขา","detail":"งานย่อยทำอะไร","needs":"ข้อมูล/สิ่งที่ต้องมีก่อน ถ้าไม่มีเว้นว่าง"}]}[[/PLAN]]',
  'ตอบผู้ส่งว่ารับเรื่องและจะร่างแผนเสนอคุณปาล์มก่อน (ระบบจะส่งแผนให้เขาอนุมัติเอง)',
  'แผนที่ดี: 3-6 ขั้น เรียงตามลำดับที่ต้องทำจริง ระบุแผนกให้ตรงงาน และบอกว่าขั้นไหนต้องรอข้อมูลอะไร',
  'กติกาช่อง assignee:',
  '- "เลขา" = งานเบาที่คุณทำเสร็จให้แล้วในคำตอบนี้ (ไม่ต้องมีใครทำต่อ)',
  '- "ทีมAI" = งานหนักที่ต้องใช้ AI ทำต่อ เช่น วิเคราะห์ยอดขายเชิงลึก ทำสไลด์ เขียนโค้ด ค้นข้อมูลเชิงลึก ร่างเอกสารยาว',
  '- "คน" = งานที่คนต้องลงมือ เช่น ส่งของ ซ่อมเครื่อง ซื้อของ ประสานงานนอกสถานที่',
  'ถ้าเป็นแค่คำถาม/คุยเล่น/ยังฝากไม่ครบ ไม่ต้องใส่บล็อกนี้',
  '',
  'ส่งเรื่องถึงคุณปาล์ม: เมื่อข้อความเป็น (ก) ข้อเสนอที่ต้องให้คุณปาล์มตัดสินใจ เช่น ขอลดราคา/ส่วนลด/ดีล/ข้อเสนอพิเศษ',
  '(ข) การทวงงาน/ตามงานที่ค้าง หรือ (ค) เรื่องด่วนที่เจ้าของควรรู้ทันที',
  'ให้ตอบผู้ส่งอย่างสุภาพว่ารับเรื่องและจะเรียนคุณปาล์มให้ (อย่าตัดสินใจแทน) แล้วต่อท้ายบล็อกนี้ (ผู้ใช้ไม่เห็น):',
  '[[ALERT]]{"reason":"ประเภทสั้นๆ เช่น ขอลดราคา|ทวงงาน|ข้อเสนอ|ด่วน","summary":"สรุปสั้นๆ ให้คุณปาล์มเข้าใจใน 1 บรรทัด"}[[/ALERT]]',
  'ใช้ ALERT เท่าที่จำเป็นจริงๆ อย่าเด้งพร่ำเพรื่อ',
  '',
  'ส่งข้อความเข้ากลุ่ม (เฉพาะเมื่อคุณปาล์มสั่ง): ถ้าคุณปาล์มสั่งให้ประกาศ/ส่งข้อความไปกลุ่มอื่น',
  'เช่น "บอกในกลุ่มคาเฟ่ว่า...", "แจ้งทีมเซลล์ว่า..." ให้ตอบรับ แล้วต่อท้ายบล็อกนี้ (ผู้ใช้ไม่เห็น):',
  '[[SENDGROUP]]{"target":"cafe|sales|<group id>","message":"ข้อความที่จะส่งเข้ากลุ่ม"}[[/SENDGROUP]]',
  'target: "cafe"=กลุ่มคาเฟ่, "sales"=กลุ่มทีมเซลล์ หรือใส่ group id ตรงๆ ก็ได้',
  '',
  'บริบทธุรกิจ: โรงน้ำดื่ม "ละกอน" ผลิต/ส่งน้ำดื่ม สั่งผ่าน LINE app | ร้านคาเฟ่ กาแฟ/เครื่องดื่ม'
].join('\n');

// ===== คำที่ถือว่าเป็น "เรื่องการเงินวงใน" → ปฏิเสธ + เด้งเตือนคุณปาล์ม =====
// ⚠️ ระวังคำที่เป็น "ส่วนหนึ่ง" ของคำอื่น เช่น "ดีล" อยู่ใน "ดีลิเวอรี่", "งบ" อยู่ใน "งบประมาณโครงการ"
// จึงใช้คำที่เจาะจงพอ ไม่ให้จับผิดคำทั่วไปในงานประจำวัน
const FINANCE_KEYWORDS = [
  'ต้นทุน', 'ราคาทุน', 'กำไร', 'ขาดทุน', 'มาร์จิ้น', 'margin',
  'ยอดขาย', 'รายรับ', 'รายจ่าย', 'งบการเงิน', 'งบกำไร', 'งบดุล', 'บัญชีบริษัท',
  'ซัพพลายเออร์', 'supplier', 'ดีลลับ', 'ราคาซื้อ', 'ราคาส่ง', 'ราคาต้นทุน',
  'เงินเดือน', 'ค่าจ้าง', 'สูตรลับ', 'สูตรผลิต', 'กี่บาททุน'
];

// ข้อความปฏิเสธสไตล์ดอนน่า
const FINANCE_DECLINE =
  'เรื่องตัวเลขการเงินกับต้นทุน ดิฉันไม่เปิดเผยค่ะ — เป็นเรื่องที่คุณปาล์มดูแลเองโดยตรง 🔒\n' +
  'ดิฉันส่งเรื่องถึงเขาให้แล้ว เดี๋ยวเขาติดต่อกลับนะคะ 🙏';

// ════════════════════════════════════════════════════════════
//  Webhook entry
// ════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    // ช่องเชื่อมกับทีม AI ใน Claude Code: ส่งผลงานกลับมาปิดงาน
    if (body.action === 'completeTask') return handleCompleteTask(body);
    if (body.action === 'startTask') return handleStartTask(body);
    if (body.action === 'askInfo') return handleAskInfo(body);
    // นอกนั้น = webhook จาก LINE
    (body.events || []).forEach(handleEvent);
  } catch (err) {
    console.error('doPost error: ' + err);
  }
  return ContentService.createTextOutput('OK');
}

// เปิด URL ในเบราว์เซอร์จะเจอข้อความนี้ / หรือให้ Claude Code ดึงคิวงาน AI
function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  if (p.action === 'aiqueue') {
    if (p.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, error: 'unauthorized' });
    return jsonOut({ ok: true, tasks: getAIQueue() });
  }
  // ให้ทีม AI อ่านข้อมูลธุรกิจจากชีต (DATA_SHEET_ID)
  // ?action=data&key=...            → รายชื่อแท็บทั้งหมด
  // ?action=data&key=...&tab=ชื่อแท็บ[&limit=200] → ข้อมูลในแท็บนั้น
  if (p.action === 'data') {
    if (p.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, error: 'unauthorized' });
    return jsonOut(readDataSheet(p.tab, p.limit));
  }
  // หน้าบอร์ดงาน (board.html) เรียกดูงานทั้งหมด
  if (p.action === 'board') {
    if (p.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, error: 'unauthorized' });
    return jsonOut({ ok: true, tasks: readBoardAll() });
  }
  // หน้าบอร์ดงาน เปิดจากมือถือได้เลย: ...exec?page=board&key=<QUEUE_KEY>
  if (p.page === 'board') {
    if (p.key !== cfg('QUEUE_KEY')) return HtmlService.createHtmlOutput('<h3>รหัสไม่ถูกต้องค่ะ</h3>');
    return HtmlService.createHtmlOutput(boardHtml(p.key))
      .setTitle('บอร์ดงาน — ละกอน & คาเฟ่')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return ContentService.createTextOutput('คุณเลขาพร้อมทำงานค่ะ ✅  (endpoint นี้ไว้รับ webhook จาก LINE)');
}

// อ่านชีตข้อมูลธุรกิจ (ตั้ง DATA_SHEET_ID ใน Script properties — ลิงก์เต็มก็ได้)
function readDataSheet(tab, limit) {
  const id = cfg('DATA_SHEET_ID');
  if (!id) return { ok: false, error: 'ยังไม่ได้ตั้ง DATA_SHEET_ID' };
  try {
    const ss = SpreadsheetApp.openById(sheetIdFrom(id));
    if (!tab) {
      return { ok: true, tabs: ss.getSheets().map(function (s) { return { name: s.getName(), rows: s.getLastRow() }; }) };
    }
    const sheet = ss.getSheetByName(tab);
    if (!sheet) return { ok: false, error: 'ไม่พบแท็บ: ' + tab };
    const max = Math.min(parseInt(limit, 10) || 200, 500);
    const lastRow = sheet.getLastRow();
    const lastCol = Math.min(sheet.getLastColumn(), 30);
    if (lastRow < 1) return { ok: true, header: [], rows: [] };
    const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const startRow = Math.max(2, lastRow - max + 1); // เอาแถวล่าสุดเป็นหลัก
    const n = lastRow - startRow + 1;
    const rows = n > 0 ? sheet.getRange(startRow, 1, n, lastCol).getValues() : [];
    return { ok: true, tab: tab, totalRows: lastRow - 1, returned: rows.length, header: header, rows: rows };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isOwner(senderId) {
  return !!senderId && senderId === cfg('OWNER_LINE_USER_ID');
}

// ในกลุ่ม/ห้อง เลขาจะพูดเฉพาะตอนถูกเรียกหา "เลขา" (หรือถูก mention)
function isAddressedToSecretary(ev, text) {
  if (/เลขา/i.test(text)) return true;
  const botId = cfg('BOT_USER_ID'); // ตั้งได้ถ้าอยากให้จับ @mention แม่นขึ้น
  const men = ev.message && ev.message.mention;
  if (botId && men && men.mentionees) {
    return men.mentionees.some(function (m) { return m.userId === botId; });
  }
  return false;
}

function handleEvent(ev) {
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;

  const text = String(ev.message.text || '').trim();
  const replyToken = ev.replyToken;
  const src = ev.source || {};
  const senderId = src.userId || '';
  const inGroup = (src.type === 'group' || src.type === 'room');
  const chatId = src.groupId || src.roomId || senderId; // คีย์ห้อง + ความจำ
  const owner = isOwner(senderId);

  // คำสั่งช่วยหา chat/group id (ไว้ตั้งค่าส่งรายงานเข้ากลุ่ม)
  if (/^(เลขา\s*)?(group\s*id|groupid|chat\s*id|ไอดีกลุ่ม)$/i.test(text)) {
    lineReply(replyToken, 'chat id ของที่นี่:\n' + chatId + '\n(type: ' + (src.type || 'user') + ')');
    return;
  }

  // บันทึกทุกข้อความในกลุ่ม (ไว้ให้เลขาสรุปแชทย้อนหลัง + เด็กปั้นเรียนรู้)
  if (inGroup) logGroupChat(chatId, ev, text);

  // ในกลุ่ม: ถ้าไม่ได้เรียกหาเลขา → เงียบ ปล่อยให้คนคุยกันเอง (ทำตัวเป็นธรรมชาติ)
  if (inGroup && !isAddressedToSecretary(ev, text)) {
    return;
  }

  const history = memGet(chatId);

  // 0.1) คุณปาล์มอนุมัติ/แก้แผนงาน (เฉพาะเจ้าของ)
  if (owner) {
    const pv = handlePlanVerdict(text, replyToken, chatId);
    if (pv) return;
  }

  // 0.1b) ปิดงานที่คน/เลขาทำเอง: "เสร็จ <เลขงาน>" หรือ "ปิดงาน <เลขงาน>"
  if (owner && handleManualDone(text, replyToken)) return;

  // 0.2) มีคำถามค้างอยู่ในห้องนี้ → ถือว่าข้อความนี้คือคำตอบ → ปลดล็อกงาน
  if (tryAnswerPendingQuestion(chatId, senderId, text, replyToken)) return;

  // 0.3) ขอสรุปแชทในกลุ่ม
  if (inGroup && isChatSummaryRequest(text)) {
    const log = readGroupChat(chatId, 120);
    const q = 'นี่คือบทสนทนาล่าสุดในกลุ่มนี้ (เก่า→ใหม่):\n' + log
            + '\n\nคำขอ: ' + text + '\nช่วยสรุปให้กระชับแบบเลขามือโปร: ประเด็นสำคัญ / สิ่งที่ตกลงกัน / งานที่ต้องทำต่อและใครรับผิดชอบ';
    const reply = parseBlocks(askClaude(q, [])).reply;
    lineReply(replyToken, reply);
    logRow(['สรุปแชทกลุ่ม', senderId, text, reply]);
    return;
  }

  // 1) เรื่องการเงินวงใน → ปฏิเสธ + เด้งเตือนคุณปาล์ม (โหมด A + B)
  //    เจ้าของถามเองไม่ต้องปิดกั้น (เป็นข้อมูลของเขา) — กันเฉพาะคนอื่น
  if (!owner && isFinanceTopic(text)) {
    lineReply(replyToken, FINANCE_DECLINE);
    alertOwner(senderId, text);
    memAppend(chatId, text, FINANCE_DECLINE);
    logRow(['การเงิน(ปฏิเสธ)', senderId, text, '']);
    return;
  }

  // 2) ถามงานจากบอร์ด → ดึงข้อมูลมาสรุป (เจ้าของเห็นทั้งทีม / พนักงานเห็นเฉพาะของตัวเอง)
  if (isBoardQuery(text)) {
    const rows = readBoard(senderId, owner);
    const ctx = buildBoardContext(rows, owner);
    const q = 'ข้อมูลงานจากบอร์ด ณ ตอนนี้' + (owner ? ' (ทั้งทีม)' : ' (เฉพาะงานที่คุณฝาก)') + ':\n'
              + ctx + '\n\nคำถาม: ' + text + '\nช่วยสรุปตอบตามคำถาม เรียงตามความเร่งด่วน กระชับแบบเลขามือโปร';
    const reply = parseBlocks(askClaude(q, history)).reply;
    lineReply(replyToken, reply);
    memAppend(chatId, text, reply);
    logRow(['ถามบอร์ด', senderId, text, reply]);
    return;
  }

  // 3) เรื่องทั่วไป → ให้คุณเลขา (Claude) ตอบ พร้อมความจำ + คลังข้อมูลธุรกิจ
  const p = parseBlocks(askClaude(text, history));
  let reply = p.reply;

  // 3.1 ถ้าเป็นการฝากงาน → คัดแยกตาม assignee
  if (p.blocks.TASK) {
    const assignee = p.blocks.TASK.assignee || 'คน';
    if (assignee !== 'เลขา') { // "เลขา" = ทำเสร็จเองแล้วในคำตอบ ไม่ต้องลงบอร์ด
      const ref = logTaskToBoard(p.blocks.TASK, senderId);
      if (ref) {
        reply += (assignee === 'ทีมAI')
          ? '\n\n🤖 ส่งเข้าคิวทีม AI แล้วค่ะ (งาน #' + ref + ')'
          : '\n\n📋 บันทึกเป็นงาน #' + ref + ' ลงบอร์ดให้แล้วค่ะ';
        if (String(p.blocks.TASK.urgency) === 'ด่วนมาก' && !owner) {
          alertOwnerUrgentTask(p.blocks.TASK, ref, senderId);
        }
      }
    }
  }
  // 3.2 ถ้าเป็นข้อเสนอ/ตามงาน/เรื่องด่วน → ส่งสรุปถึงคุณปาล์ม
  if (p.blocks.ALERT && !owner) {
    alertOwnerProposal(p.blocks.ALERT, senderId);
  }
  // 3.1b เป็นงานใหญ่ → เลขาแตกเป็นแผนงาน แล้วเสนอคุณปาล์มอนุมัติทางไลน์
  if (p.blocks.PLAN) {
    const pid = createProjectPlan(p.blocks.PLAN, senderId);
    if (pid) {
      reply += '\n\n📁 ร่างแผนงานเป็นโปรเจกต์ ' + pid + ' แล้วค่ะ — ส่งให้คุณปาล์มพิจารณาอยู่นะคะ';
      pushPlanForApproval(pid, p.blocks.PLAN, senderId);
    }
  }
  // 3.3 คุณปาล์มสั่งให้ส่งข้อความเข้ากลุ่ม (อนุญาตเฉพาะเจ้าของ)
  if (p.blocks.SENDGROUP) {
    if (owner) {
      const sent = sendToGroupByTarget(p.blocks.SENDGROUP);
      reply += sent
        ? '\n\n📤 ส่งข้อความเข้ากลุ่มให้แล้วค่ะ'
        : '\n\n⚠️ ยังไม่ได้ตั้ง id กลุ่มปลายทาง (ตั้ง GROUP_CAFE_ID / GROUP_SALES_ID ก่อนนะคะ)';
    } else {
      reply += '\n\n(ขออภัยค่ะ การส่งข้อความเข้ากลุ่มทำได้เฉพาะคุณปาล์มเท่านั้น)';
    }
  }

  lineReply(replyToken, reply);
  memAppend(chatId, text, reply);
  logRow(['ทั่วไป', senderId, text, reply]);
}

// ════════════════════════════════════════════════════════════
//  ส่งข้อความเข้ากลุ่ม (ไว้ให้รายงานประจำวัน/แจ้งเตือนเรียกใช้)
//  ตั้ง Script property ชื่อกลุ่มไว้ เช่น GROUP_CAFE_ID, GROUP_SALES_ID
//  แล้วเรียก pushToGroup('GROUP_CAFE_ID', 'ข้อความ...')
// ════════════════════════════════════════════════════════════
function pushToGroup(propName, text) {
  const gid = cfg(propName);
  if (!gid) { console.warn('ยังไม่ได้ตั้ง ' + propName); return; }
  linePush(gid, text);
}

// ส่งเข้ากลุ่มตาม target ที่คุณปาล์มสั่ง (cafe / sales / group id ตรงๆ / ชื่อ property)
function sendToGroupByTarget(sg) {
  const map = {
    'cafe': 'GROUP_CAFE_ID', 'คาเฟ่': 'GROUP_CAFE_ID', 'กลุ่มคาเฟ่': 'GROUP_CAFE_ID',
    'sales': 'GROUP_SALES_ID', 'เซลล์': 'GROUP_SALES_ID', 'ทีมเซลล์': 'GROUP_SALES_ID'
  };
  const t = String(sg.target || '').trim();
  let gid = '';
  if (map[t]) gid = cfg(map[t]);
  else if (/^[CRU][0-9a-fA-F]{20,}$/.test(t)) gid = t;   // ใส่ group id ตรงๆ
  else if (cfg(t)) gid = cfg(t);                          // เผื่อใส่ชื่อ property
  if (!gid) return false;
  linePush(gid, String(sg.message || ''));
  return true;
}

// ทดสอบส่งเข้ากลุ่มคาเฟ่ (ตั้ง GROUP_CAFE_ID ก่อน)
function testPushCafe() {
  pushToGroup('GROUP_CAFE_ID', 'สวัสดีค่ะ คุณเลขาทดสอบส่งข้อความเข้ากลุ่มนะคะ ✅');
}

// ════════════════════════════════════════════════════════════
//  งานอัตโนมัติตามเวลา (Time-driven triggers)
//  ⚠️ ตั้ง Time zone ของโปรเจกต์เป็น (GMT+07:00) Bangkok ก่อน
//     (Project Settings → Time zone) แล้วรัน setupTriggers() 1 ครั้ง
// ════════════════════════════════════════════════════════════

// 🌅 รายงานเช้า 8 โมง — สรุปงานค้าง/ด่วน ส่งหาคุณปาล์ม
function morningBrief() {
  const owner = cfg('OWNER_LINE_USER_ID');
  if (!owner) { console.warn('ยังไม่ได้ตั้ง OWNER_LINE_USER_ID'); return; }

  const rows = readBoard('', true); // เจ้าของเห็นทั้งหมด
  const today = Utilities.formatDate(new Date(), 'GMT+7', 'd/M');

  if (!rows.length) {
    linePush(owner, '☀️ สวัสดีตอนเช้าค่ะคุณปาล์ม (' + today + ')\nวันนี้ไม่มีงานค้างในบอร์ด เคลียร์หมดค่ะ ✨');
    return;
  }

  const urgent = rows.filter(function (r) { return String(r[3]) === 'ด่วนมาก'; });
  const waitAI = rows.filter(function (r) { return String(r[2]) === 'รอทีม AI'; });

  let msg = '☀️ สรุปงานเช้านี้ค่ะคุณปาล์ม (' + today + ')\n\n';
  msg += '📋 งานค้างทั้งหมด: ' + rows.length + ' งาน\n';
  if (urgent.length) {
    msg += '\n🔴 ด่วนมาก ' + urgent.length + ' งาน:\n'
         + urgent.slice(0, 5).map(function (r) { return '  • #' + r[0] + ' ' + r[8]; }).join('\n') + '\n';
  }
  if (waitAI.length) msg += '\n🤖 รอทีม AI ทำ: ' + waitAI.length + ' งาน';
  msg += '\n\nพิมพ์ "เลขา สรุปงาน" เพื่อดูละเอียดได้ค่ะ 🙏';
  linePush(owner, msg);
}

// 🔍 เฝ้าบอร์ดทุก 30 นาที — เจองานด่วน "ใหม่" → เตือนคุณปาล์ม (กันสแปม เตือนเฉพาะงานด่วน)
function boardWatch() {
  const owner = cfg('OWNER_LINE_USER_ID');
  if (!owner) return;
  const id = boardSheetId();
  if (!id) return;

  const ss = SpreadsheetApp.openById(sheetIdFrom(id));
  const sheet = ss.getSheetByName('Requests');
  if (!sheet) return;

  const lastRow = sheet.getLastRow(); // รวม header
  const props = PropertiesService.getScriptProperties();
  const seenStr = props.getProperty('BOARD_LAST_ROW');

  // ครั้งแรก: จำตำแหน่งไว้เฉยๆ ไม่เตือนย้อนหลัง
  if (seenStr === null) { props.setProperty('BOARD_LAST_ROW', String(lastRow)); return; }

  const seen = parseInt(seenStr, 10);
  if (lastRow <= seen) return; // ไม่มีงานใหม่

  const data = sheet.getRange(seen + 1, 1, lastRow - seen, 12).getValues();
  props.setProperty('BOARD_LAST_ROW', String(lastRow));

  const newUrgent = data.filter(function (r) { return String(r[3]) === 'ด่วนมาก'; });
  if (!newUrgent.length) return;

  const msg = '🔔 มีงานด่วนใหม่เข้าบอร์ด ' + newUrgent.length + ' งานค่ะคุณปาล์ม\n'
    + newUrgent.slice(0, 5).map(function (r) { return '🔴 #' + r[0] + ' ' + r[4] + ' : ' + r[8]; }).join('\n');
  linePush(owner, msg);
}

// ⚙️ ติดตั้ง trigger (รันครั้งเดียวใน editor)
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (fn === 'morningBrief' || fn === 'boardWatch') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('morningBrief').timeBased().atHour(8).everyDays(1).create();
  ScriptApp.newTrigger('boardWatch').timeBased().everyMinutes(30).create();
  Logger.log('✅ ตั้ง trigger แล้ว: morningBrief (8 โมง/วัน), boardWatch (ทุก 30 นาที)');
}

function isFinanceTopic(text) {
  const t = text.toLowerCase();
  return FINANCE_KEYWORDS.some(function (k) { return t.indexOf(k.toLowerCase()) !== -1; });
}

// ════════════════════════════════════════════════════════════
//  Claude API — สมองของคุณเลขา
// ════════════════════════════════════════════════════════════
function askClaude(userText, history) {
  const apiKey = cfg('ANTHROPIC_API_KEY');
  if (!apiKey) return 'ระบบยังไม่ได้ตั้งค่า API key ค่ะ (แจ้งผู้ดูแลระบบด้วยนะคะ)';

  const kb = loadKB();
  const pb = loadPlaybook();
  let sys = SYSTEM_PROMPT;
  if (kb) sys += '\n\nคลังข้อมูลธุรกิจ/โรงงาน (ใช้อ้างอิงตอบได้ แต่ยังห้ามเปิดเผยการเงินวงในตามกฎ):\n' + kb;
  if (pb) sys += '\n\n📓 Playbook — วิธีคิด/หลักการตัดสินใจของคุณปาล์ม (ยึดตามนี้เวลาวางแผนหรือเสนอทางเลือก):\n' + pb;

  // Prompt caching: system prompt (บุคลิก+คลังข้อมูล+Playbook) เหมือนเดิมแทบทุกครั้ง
  // ติด cache_control ไว้ → 5 นาทีถัดไป Claude "อ่านจากแคช" แทนอ่านใหม่ทั้งก้อน (ถูกลง ~90%)
  const messages = (history || []).concat([{ role: 'user', content: userText }]);
  const payload = {
    model: MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
    messages: messages
  };

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  try {
    const data = JSON.parse(res.getContentText());
    if (data && data.content && data.content[0] && data.content[0].text) {
      return data.content[0].text;
    }
    console.error('Claude response: ' + res.getContentText());
  } catch (err) {
    console.error('askClaude parse error: ' + err);
  }
  return 'ขออภัยค่ะ ตอนนี้ระบบขัดข้องชั่วคราว รบกวนลองใหม่อีกครั้งนะคะ 🙏';
}

// ════════════════════════════════════════════════════════════
//  LINE messaging
// ════════════════════════════════════════════════════════════
function lineReply(replyToken, text) {
  if (!replyToken) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + cfg('LINE_TOKEN') },
    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: text }] }),
    muteHttpExceptions: true
  });
}

function linePush(to, text) {
  if (!to) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + cfg('LINE_TOKEN') },
    payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] }),
    muteHttpExceptions: true
  });
}

// เด้งเตือนคุณปาล์มเมื่อมีคนถามเรื่องการเงิน
function alertOwner(senderId, text) {
  const owner = cfg('OWNER_LINE_USER_ID');
  if (!owner) return;
  linePush(owner,
    '📩 มีคนถามเรื่องการเงิน/ต้นทุน — คุณเลขาปฏิเสธไปแล้วค่ะ\n' +
    'จาก: ' + (senderId || 'ไม่ทราบ userId') + '\n' +
    'ข้อความ: "' + text + '"\n' +
    'ฝากคุณปาล์มดูให้ด้วยนะคะ 🙏'
  );
}

// ════════════════════════════════════════════════════════════
//  Log ลง Google Sheet (ไม่บังคับ)
// ════════════════════════════════════════════════════════════
// รับได้ทั้ง Sheet ID ล้วนๆ หรือลิงก์เต็ม (จะดึง ID ให้เอง)
function sheetIdFrom(v) {
  const m = String(v).match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : String(v).trim();
}

function logRow(arr) {
  const sheetId = cfg('LOG_SHEET_ID');
  if (!sheetId) return;
  try {
    const ss = SpreadsheetApp.openById(sheetIdFrom(sheetId));
    let sheet = ss.getSheetByName('SecretaryLog');
    if (!sheet) {
      sheet = ss.insertSheet('SecretaryLog');
      sheet.appendRow(['เวลา', 'ประเภท', 'ผู้ส่ง(userId)', 'ข้อความ', 'คำตอบ']);
    }
    sheet.appendRow([new Date()].concat(arr));
  } catch (err) {
    console.error('logRow error: ' + err);
  }
}

// ════════════════════════════════════════════════════════════
//  บันทึกงานลงบอร์ดรับงาน (แท็บ Requests เดียวกับ request.html)
// ════════════════════════════════════════════════════════════
function boardSheetId() {
  return cfg('REQUEST_SHEET_ID') || cfg('LOG_SHEET_ID'); // ไม่ตั้งแยกก็ใช้ชีตเดียวกับ log
}

// แยกบล็อกซ่อน [[TASK]]{...}[[/TASK]] และ [[ALERT]]{...}[[/ALERT]] ออกจากคำตอบ
function parseBlocks(raw) {
  let reply = String(raw);
  const blocks = {};
  ['TASK', 'ALERT', 'SENDGROUP', 'PLAN'].forEach(function (name) {
    const re = new RegExp('\\[\\[' + name + '\\]\\]([\\s\\S]*?)\\[\\[\\/' + name + '\\]\\]');
    const m = reply.match(re);
    if (m) {
      reply = reply.replace(m[0], '');
      try { blocks[name] = JSON.parse(m[1].trim()); } catch (e) { console.error(name + ' parse: ' + e); }
    }
  });
  return { reply: reply.trim(), blocks: blocks };
}

// เด้งสรุปข้อเสนอ/ตามงานถึงคุณปาล์ม
function alertOwnerProposal(alert, senderId) {
  const owner = cfg('OWNER_LINE_USER_ID');
  if (!owner) return;
  linePush(owner,
    '📣 เรื่องฝากเรียนคุณปาล์ม\n' +
    'ประเภท: ' + (alert.reason || 'ข้อเสนอ/ตามงาน') + '\n' +
    'สรุป: ' + (alert.summary || '') + '\n' +
    'จาก: ' + (senderId || 'ไม่ทราบ') + '\n' +
    '(คุณเลขาแจ้งเพราะเห็นว่าควรให้คุณตัดสินใจ/รับทราบค่ะ)'
  );
}

// เด้งเตือนงานด่วนมากที่เพิ่งเข้ามา
function alertOwnerUrgentTask(task, ref, senderId) {
  const owner = cfg('OWNER_LINE_USER_ID');
  if (!owner) return;
  linePush(owner,
    '🔴 งานด่วนมากเข้าใหม่ #' + ref + '\n' +
    (task.biz || '') + ' | ' + (task.detail || '') + '\n' +
    'จาก: ' + (senderId || 'ไม่ทราบ') + '\n' +
    'ฝากดูด่วนนะคะ 🙏'
  );
}

// ════════════════════════════════════════════════════════════
//  อ่านบอร์ดงาน (ให้เลขาสรุปได้)
// ════════════════════════════════════════════════════════════
// คำที่ถือว่า "ขอดู/สรุปบอร์ด" (การทวงงาน/ตามงานจะปล่อยให้ AI ตัดสินใจส่งต่อเอง)
const BOARD_QUERY_KEYWORDS = [
  'งานค้าง', 'มีงานอะไร', 'มีงานไหน', 'สรุปงาน', 'งานวันนี้', 'คิวงาน',
  'งานทั้งหมด', 'เช็คงาน', 'ดูงาน', 'งานที่ฝาก', 'รายการงาน'
];

function isBoardQuery(text) {
  const t = String(text).toLowerCase();
  return BOARD_QUERY_KEYWORDS.some(function (k) { return t.indexOf(k.toLowerCase()) !== -1; });
}

// คืนงานทุกสถานะ (สำหรับหน้า board.html)
function readBoardAll() {
  const id = boardSheetId();
  if (!id) return [];
  try {
    const ss = SpreadsheetApp.openById(sheetIdFrom(id));
    const sheet = ss.getSheetByName('Requests');
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    const out = [];
    for (let i = data.length - 1; i >= 1 && out.length < 200; i--) {
      const r = data[i];
      out.push({
        ref: r[0], time: r[1], status: r[2], urgency: r[3], biz: r[4],
        type: r[5], from: r[6], detail: r[8], due: r[9], assignee: r[11] || '', result: r[12] || '', dept: r[13] || '',
        project: r[14] || '', step: r[15] || '', projectTitle: r[16] || '', blocked: r[17] || ''
      });
    }
    return out;
  } catch (err) { console.error('readBoardAll: ' + err); return []; }
}

// คืนแถวงานที่ยังไม่ปิด (เจ้าของ = ทั้งหมด, พนักงาน = เฉพาะที่ตัวเองฝาก)
function readBoard(senderId, owner) {
  const id = boardSheetId();
  if (!id) return [];
  try {
    const ss = SpreadsheetApp.openById(sheetIdFrom(id));
    const sheet = ss.getSheetByName('Requests');
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    // คอลัมน์: 0 เลขงาน,1 เวลา,2 สถานะ,3 ด่วน,4 ธุรกิจ,5 ประเภท,6 ผู้ฝาก,7 ติดต่อ,8 รายละเอียด,9 กำหนด
    const rows = [];
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      const status = String(r[2] || '');
      if (status === 'เสร็จ' || status === 'ปิด' || status === 'ยกเลิก') continue;
      if (!owner && String(r[7]) !== senderId) continue; // พนักงานเห็นเฉพาะของตัวเอง
      rows.push(r);
    }
    const order = { 'ด่วนมาก': 0, 'ปกติ': 1, 'ไม่เร่ง': 2 };
    rows.sort(function (a, b) { return (order[a[3]] == null ? 1 : order[a[3]]) - (order[b[3]] == null ? 1 : order[b[3]]); });
    return rows.slice(0, 30);
  } catch (err) {
    console.error('readBoard error: ' + err);
    return [];
  }
}

function buildBoardContext(rows, owner) {
  if (!rows.length) return '(ไม่มีงานค้างในบอร์ด)';
  return rows.map(function (r) {
    return '- #' + r[0] + ' [' + r[3] + '] ' + r[4] + ' | ' + r[5] + ' : ' + r[8]
      + (r[9] ? (' (กำหนด ' + r[9] + ')') : '')
      + ' — สถานะ ' + r[2]
      + (r[11] ? (' — ' + r[11]) : '')
      + (owner ? (' — โดย ' + (r[6] || r[7] || '')) : '');
  }).join('\n');
}

// ════════════════════════════════════════════════════════════
//  คลังข้อมูลธุรกิจ/โรงงาน (แท็บ "ข้อมูลโรงงาน" — คุณปาล์มกรอกเอง)
// ════════════════════════════════════════════════════════════
function loadKB() {
  const id = boardSheetId();
  if (!id) return '';
  try {
    const ss = SpreadsheetApp.openById(sheetIdFrom(id));
    let s = ss.getSheetByName('ข้อมูลโรงงาน');
    if (!s) {
      s = ss.insertSheet('ข้อมูลโรงงาน');
      s.appendRow(['หัวข้อ', 'รายละเอียด']);
      s.appendRow(['เวลาทำการ', 'จ-ส 8:00-17:00 (ตัวอย่าง แก้ได้)']);
      s.appendRow(['พื้นที่ส่งน้ำ', 'ในเขตอำเภอเมือง (ตัวอย่าง)']);
      s.appendRow(['วิธีสั่งน้ำ', 'สั่งผ่าน LINE app ละกอน']);
      s.appendRow(['⚠️ หมายเหตุ', 'ใส่เฉพาะข้อมูลที่พนักงาน/ลูกค้ารู้ได้ — ห้ามใส่ต้นทุน/กำไร/ยอดขาย']);
      return '';
    }
    const data = s.getDataRange().getValues();
    const lines = [];
    for (let i = 1; i < data.length; i++) {
      const topic = String(data[i][0] || '').trim();
      const detail = String(data[i][1] || '').trim();
      if (!topic && !detail) continue;
      if (topic.indexOf('หมายเหตุ') !== -1) continue; // ข้ามบรรทัดหมายเหตุ
      lines.push('- ' + topic + ': ' + detail);
    }
    let text = lines.join('\n');
    if (text.length > 4000) text = text.slice(0, 4000);
    return text;
  } catch (err) {
    console.error('loadKB error: ' + err);
    return '';
  }
}

// เขียนงานลงแท็บ Requests แล้วคืนเลขงาน
function logTaskToBoard(task, senderId) {
  const id = boardSheetId();
  if (!id) return '';
  try {
    const ss = SpreadsheetApp.openById(sheetIdFrom(id));
    let sheet = ss.getSheetByName('Requests');
    if (!sheet) {
      sheet = ss.insertSheet('Requests');
      sheet.appendRow(['เลขงาน', 'เวลาที่ส่ง', 'สถานะ', 'ความเร่งด่วน', 'ธุรกิจ',
                       'ประเภท', 'ผู้ฝาก', 'ติดต่อ', 'รายละเอียด', 'กำหนดเสร็จ', 'ลิงก์รูป', 'ผู้รับผิดชอบ', 'ผลงาน', 'แผนก']);
    }
    const now = new Date();
    const ref = 'REQ' + Utilities.formatDate(now, 'GMT+7', 'yyMMdd')
                + '-' + Math.floor(1000 + Math.random() * 9000);
    const assignee = task.assignee || 'คน';
    const status = (assignee === 'ทีมAI') ? 'รอทีม AI' : 'ใหม่';
    const dept = (assignee === 'ทีมAI') ? (task.dept || '') : '';
    sheet.appendRow([
      ref, now, status, task.urgency || 'ปกติ', task.biz || '',
      task.type || '', 'LINE', senderId || '', task.detail || '', task.due || '', '', assignee, '', dept
    ]);
    return ref;
  } catch (err) {
    console.error('logTaskToBoard error: ' + err);
    return '';
  }
}

// ════════════════════════════════════════════════════════════
//  📋 หน้าบอร์ดงาน (เสิร์ฟจาก GAS — ฝังข้อมูลมาเลย ไม่ต้อง fetch)
// ════════════════════════════════════════════════════════════
function boardHtml(key) {
  const tasks = readBoardAll();
  const json = JSON.stringify(tasks).replace(/</g, '\\u003c');
  return '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">'
+ '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap" rel="stylesheet">'
+ '<style>'
+ '*{box-sizing:border-box;margin:0;padding:0}'
+ ':root{--navy:#1B3558;--navy-d:#122540;--navy-l:#EAF0F7;--gold:#C8A96E;--gold-l:#F5EDD9;--teal:#5B9BA0;--teal-l:#E0EEEF;--cream:#F8F5EF;--text:#1B2B3B;--sub:#7A8A9B;--bd:#D8D0C4;--green:#3D9970;--orange:#C8842A;--red:#C0392B}'
+ 'body{font-family:Sarabun,sans-serif;background:var(--cream);color:var(--text);padding-bottom:50px}'
+ '.hd{background:linear-gradient(135deg,var(--navy),var(--navy-d));color:#fff;padding:18px 16px;border-bottom:3px solid var(--gold)}'
+ '.hd h1{font-size:1.15rem}.hd .s{font-size:.75rem;color:var(--gold-l);font-weight:300}'
+ '.wrap{max-width:1000px;margin:0 auto;padding:14px}'
+ '.tt{font-size:.8rem;font-weight:700;color:var(--navy);margin:4px 0 8px}'
+ '.team{display:flex;gap:9px;overflow-x:auto;padding-bottom:6px;margin-bottom:12px}'
+ '.mb{min-width:132px;flex:0 0 auto;background:#fff;border:1px solid var(--bd);border-radius:11px;padding:10px 8px;text-align:center}'
+ '.mb.busy{border-color:var(--gold);background:linear-gradient(180deg,#fff,var(--gold-l))}'
+ '.av{font-size:1.5rem}.mn{font-size:.78rem;font-weight:700;color:var(--navy);margin-top:4px}'
+ '.ms{font-size:.66rem;margin-top:3px;color:var(--sub);min-height:2em}'
+ '.dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:3px}'
+ '.dot.g{background:var(--green)}.dot.o{background:var(--orange);animation:p 1.2s infinite}.dot.a{background:var(--gold)}'
+ '@keyframes p{0%,100%{opacity:1}50%{opacity:.35}}'
+ '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:9px;margin-bottom:12px}'
+ '.st{background:#fff;border:1px solid var(--bd);border-radius:11px;padding:10px;text-align:center}'
+ '.st .n{font-size:1.35rem;font-weight:700;color:var(--navy)}.st .l{font-size:.7rem;color:var(--sub)}'
+ '.st.red .n{color:var(--red)}.st.ai .n{color:var(--teal)}.st.dn .n{color:var(--green)}'
+ '.fl{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}'
+ '.ch{padding:6px 13px;border-radius:99px;border:1.5px solid var(--bd);background:#fff;color:var(--sub);font-family:inherit;font-size:.8rem;font-weight:600;cursor:pointer}'
+ '.ch.on{background:var(--navy);border-color:var(--navy);color:#fff}'
+ '.prj{background:#fff;border:1px solid var(--bd);border-left:5px solid var(--navy);border-radius:12px;padding:13px 15px;margin-bottom:11px}'
+ '.prj h3{font-size:.95rem;color:var(--navy);margin-bottom:3px}'
+ '.bar{height:7px;background:var(--navy-l);border-radius:99px;overflow:hidden;margin:8px 0}'
+ '.bar i{display:block;height:100%;background:var(--green)}'
+ '.sub{font-size:.83rem;padding:6px 0;border-top:1px dashed var(--bd);display:flex;gap:7px;align-items:flex-start}'
+ '.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:11px}'
+ '.cd{background:#fff;border:1px solid var(--bd);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:7px}'
+ '.cd.u{border-left:5px solid var(--red)}.cd.n{border-left:5px solid var(--orange)}.cd.l{border-left:5px solid var(--green)}'
+ '.rf{font-size:.72rem;font-weight:700;color:var(--sub)}'
+ '.bg{font-size:.66rem;font-weight:700;padding:2px 8px;border-radius:99px;display:inline-block}'
+ '.dt{font-size:.88rem;line-height:1.45}.mt{font-size:.72rem;color:var(--sub);display:flex;gap:10px;flex-wrap:wrap}'
+ '.rs{background:var(--cream);border:1px dashed var(--bd);border-radius:8px;padding:7px 9px;font-size:.78rem}'
+ '.em{text-align:center;color:var(--sub);padding:45px 20px}'
+ '</style></head><body>'
+ '<div class="hd"><h1>📋 บอร์ดงาน</h1><div class="s">โรงน้ำละกอน 💧 &amp; คาเฟ่ ☕ — <span id="up"></span></div></div>'
+ '<div class="wrap"><div class="tt">👥 ทีมงาน AI</div><div class="team" id="tm"></div>'
+ '<div class="stats" id="sx"></div><div class="fl" id="fx"></div>'
+ '<div id="pj"></div><div class="cards" id="cx"></div><div class="em" id="ex" style="display:none">ไม่มีงานในหมวดนี้ ✨</div></div>'
+ '<script>var ALL=' + json + ';var F="open";'
+ 'var TEAM=[{k:"data",e:"🗄️",n:"ฝ่ายข้อมูล"},{k:"finance",e:"💰",n:"การเงิน"},{k:"analyst",e:"📈",n:"นักวิเคราะห์"},{k:"content",e:"🎨",n:"ดีไซน์"},{k:"writer",e:"✍️",n:"นักเขียน"},{k:"researcher",e:"🔍",n:"นักวิจัย"},{k:"coder",e:"💻",n:"โค้ด"}];'
+ 'var FS=[["open","ค้างอยู่"],["urgent","🔴 ด่วนมาก"],["wait","⏳ รออนุมัติ"],["ai","🤖 รอทีม AI"],["doing","⚙️ กำลังทำ"],["blocked","⏸️ รอข้อมูล"],["human","👤 งานคน"],["done","✅ เสร็จแล้ว"],["all","ทั้งหมด"]];'
+ 'function E(s){return String(s==null?"":s).replace(/[&<>"]/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[m]})}'
+ 'function done(t){return /เสร็จ|ปิด|ยกเลิก/.test(t.status||"")}'
+ 'function mt(t){if(F=="all")return 1;if(F=="open")return !done(t);if(F=="urgent")return t.urgency=="ด่วนมาก"&&!done(t);'
+ 'if(F=="wait")return t.status=="รออนุมัติ";if(F=="ai")return t.status=="รอทีม AI";if(F=="doing")return t.status=="กำลังทำ (AI)";'
+ 'if(F=="blocked")return t.status=="รอข้อมูล";if(F=="human")return (t.assignee=="คน"||!t.assignee)&&!done(t);if(F=="done")return done(t);return 1}'
+ 'function team(){var h="",nw=ALL.filter(function(t){return t.status=="ใหม่"||t.status=="รออนุมัติ"}).length;'
+ 'h+=\'<div class="mb\'+(nw?" busy":"")+\'"><div class="av">🗓️</div><div class="mn">คุณเลขา</div><div class="ms">\'+(nw?\'<span class="dot o"></span>จัดคิว/รออนุมัติ \'+nw:\'<span class="dot g"></span>เฝ้าบอร์ดอยู่ค่ะ\')+\'</div></div>\';'
+ 'TEAM.forEach(function(m){var w=null,q=0,d=0;ALL.forEach(function(t){if(t.dept!=m.k)return;if(t.status=="กำลังทำ (AI)")w=t;if(t.status=="รอทีม AI")q++;if(t.status=="เสร็จ (AI)")d++});'
+ 'var s=w?\'<span class="dot o"></span>ทำ #\'+E(w.ref):(q?\'<span class="dot a"></span>คิว \'+q+\' งาน\':\'<span class="dot g"></span>ว่าง\');'
+ 'h+=\'<div class="mb\'+(w?" busy":"")+\'"><div class="av">\'+m.e+\'</div><div class="mn">\'+m.n+\'</div><div class="ms">\'+s+\'</div></div>\'});'
+ 'document.getElementById("tm").innerHTML=h}'
+ 'function render(){team();var op=ALL.filter(function(t){return !done(t)});'
+ 'var S=[[op.length,"งานค้าง",""],[op.filter(function(t){return t.urgency=="ด่วนมาก"}).length,"ด่วนมาก","red"],'
+ '[ALL.filter(function(t){return t.status=="รอทีม AI"}).length,"รอทีม AI","ai"],[ALL.filter(done).length,"เสร็จแล้ว","dn"]];'
+ 'document.getElementById("sx").innerHTML=S.map(function(s){return \'<div class="st \'+s[2]+\'"><div class="n">\'+s[0]+\'</div><div class="l">\'+s[1]+\'</div></div>\'}).join("");'
+ 'document.getElementById("fx").innerHTML=FS.map(function(f){return \'<button class="ch\'+(f[0]==F?" on":"")+\'" onclick="F=\\\'\'+f[0]+\'\\\';render()">\'+f[1]+\'</button>\'}).join("");'
+ 'var list=ALL.filter(mt),ph="",seen={};'
+ 'list.filter(function(t){return t.project}).forEach(function(t){if(seen[t.project])return;seen[t.project]=1;'
+ 'var st=ALL.filter(function(x){return x.project==t.project}).sort(function(a,b){return a.step-b.step});'
+ 'var dn=st.filter(done).length,pc=Math.round(dn/st.length*100);'
+ 'ph+=\'<div class="prj"><h3>📁 \'+E(t.projectTitle||t.project)+\'</h3><div class="mt">\'+E(t.project)+\' · \'+dn+\'/\'+st.length+\' เสร็จ</div>\'+'
+ '\'<div class="bar"><i style="width:\'+pc+\'%"></i></div>\'+st.map(function(s){var ic=done(s)?"✅":(s.status=="กำลังทำ (AI)"?"⚙️":(s.status=="รอข้อมูล"?"⏸️":(s.status=="รออนุมัติ"?"📝":"⏳")));'
+ 'return \'<div class="sub"><span>\'+ic+\'</span><span><b>\'+s.step+\'.</b> \'+E(s.detail)+\' <span style="color:#7A8A9B">— \'+E(s.dept||s.assignee)+\' · \'+E(s.status)+\'</span>\'+(s.blocked?\'<br><span style="color:#C8842A;font-size:.75rem">\'+E(s.blocked)+\'</span>\':"")+\'</span></div>\'}).join("")+\'</div>\'});'
+ 'document.getElementById("pj").innerHTML=ph;'
+ 'var solo=list.filter(function(t){return !t.project});'
+ 'var ord={"ด่วนมาก":0,"ปกติ":1,"ไม่เร่ง":2};solo.sort(function(a,b){return (ord[a.urgency]==null?1:ord[a.urgency])-(ord[b.urgency]==null?1:ord[b.urgency])});'
+ 'document.getElementById("ex").style.display=(list.length?"none":"block");'
+ 'document.getElementById("cx").innerHTML=solo.map(function(t){var u=t.urgency=="ด่วนมาก"?"u":(t.urgency=="ไม่เร่ง"?"l":"n");'
+ 'var ub=t.urgency=="ด่วนมาก"?"background:#FBE9E7;color:#C0392B":(t.urgency=="ไม่เร่ง"?"background:#E8F5EC;color:#3D9970":"background:#FFF3E0;color:#C8842A");'
+ 'return \'<div class="cd \'+u+\'"><div style="display:flex;justify-content:space-between;gap:6px"><span class="rf">#\'+E(t.ref)+\'</span>\'+'
+ '\'<span><span class="bg" style="\'+ub+\'">\'+E(t.urgency||"ปกติ")+\'</span> <span class="bg" style="background:#EAF0F7;color:#1B3558">\'+E(t.status)+\'</span></span></div>\'+'
+ '\'<div class="dt">\'+E(t.detail)+\'</div><div class="mt">\'+(t.biz?"<span>🏢 "+E(t.biz)+"</span>":"")+(t.dept?"<span>🤖 "+E(t.dept)+"</span>":"")+(t.due?"<span>⏳ "+E(t.due)+"</span>":"")+\'</div>\'+'
+ '(t.result?\'<div class="rs">💬 \'+E(String(t.result).slice(0,300))+\'</div>\':"")+\'</div>\'}).join("")}'
+ 'document.getElementById("up").textContent="อัปเดต "+new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});'
+ 'render();setTimeout(function(){location.reload()},120000);'
+ '</scr' + 'ipt></body></html>';
}

// ════════════════════════════════════════════════════════════
//  📁 โปรเจกต์ = งานหลัก + งานย่อย (เสนอแผน → คุณปาล์มอนุมัติ → ทีมลงมือ)
// ════════════════════════════════════════════════════════════
function reqSheet() {
  const id = boardSheetId();
  if (!id) return null;
  const ss = SpreadsheetApp.openById(sheetIdFrom(id));
  let sheet = ss.getSheetByName('Requests');
  if (!sheet) {
    sheet = ss.insertSheet('Requests');
    sheet.appendRow(['เลขงาน', 'เวลาที่ส่ง', 'สถานะ', 'ความเร่งด่วน', 'ธุรกิจ', 'ประเภท', 'ผู้ฝาก',
                     'ติดต่อ', 'รายละเอียด', 'กำหนดเสร็จ', 'ลิงก์รูป', 'ผู้รับผิดชอบ', 'ผลงาน', 'แผนก',
                     'โปรเจกต์', 'ลำดับ', 'ชื่อโปรเจกต์', 'ติดขัด', 'โน้ตจากเจ้าของ']);
  }
  return sheet;
}

// สร้างโปรเจกต์ + งานย่อย (สถานะเริ่มต้น "รออนุมัติ")
function createProjectPlan(plan, senderId) {
  const sheet = reqSheet();
  if (!sheet || !plan || !plan.steps || !plan.steps.length) return '';
  try {
    const now = new Date();
    const pid = 'PRJ' + Utilities.formatDate(now, 'GMT+7', 'yyMMdd') + '-' + Math.floor(1000 + Math.random() * 9000);
    plan.steps.slice(0, 10).forEach(function (s, i) {
      const ref = pid + '.' + (i + 1);
      const dept = String(s.dept || '');
      const assignee = (dept === 'เลขา') ? 'เลขา' : 'ทีมAI';
      sheet.appendRow([
        ref, now, 'รออนุมัติ', plan.urgency || 'ปกติ', plan.biz || '', 'งานย่อย', 'LINE',
        senderId || '', s.detail || '', '', '', assignee, '', (dept === 'เลขา' ? '' : dept),
        pid, i + 1, plan.title || '', s.needs || ''
      ]);
    });
    return pid;
  } catch (err) { console.error('createProjectPlan: ' + err); return ''; }
}

// ส่งแผนให้คุณปาล์มดูในไลน์ เพื่ออนุมัติ/สั่งแก้
function pushPlanForApproval(pid, plan, senderId) {
  const owner = cfg('OWNER_LINE_USER_ID');
  if (!owner) return;
  const DEPT = { data:'📊 ฝ่ายข้อมูล', analyst:'📈 นักวิเคราะห์', content:'🎨 ดีไซน์',
                 writer:'✍️ นักเขียน', researcher:'🔍 นักวิจัย', coder:'💻 โค้ด',
                 finance:'💰 การเงิน', 'เลขา':'🗓️ คุณเลขา' };
  let msg = '📋 ขออนุมัติแผนงานค่ะคุณปาล์ม\n'
          + '📁 ' + (plan.title || '') + '  (' + pid + ')\n'
          + (plan.goal ? ('🎯 ' + plan.goal + '\n') : '')
          + (plan.biz ? ('🏢 ' + plan.biz + '\n') : '') + '\nแผนที่วางไว้:\n';
  plan.steps.slice(0, 10).forEach(function (s, i) {
    msg += (i + 1) + '. ' + (DEPT[s.dept] || s.dept || '') + ' — ' + (s.detail || '')
         + (s.needs ? ('\n     ต้องมีก่อน: ' + s.needs) : '') + '\n';
  });
  msg += '\nอนุมัติไหมคะ?\n'
       + '• พิมพ์ "อนุมัติ ' + pid + '" เพื่อให้ทีมเริ่มงาน\n'
       + '• หรือบอกได้เลยว่าอยากแก้ตรงไหน (พิมพ์ "แก้ ' + pid + ' : ...")';
  linePush(owner, msg);
}

// คุณปาล์มตอบกลับ: อนุมัติ / แก้ / ยกเลิก
function handlePlanVerdict(text, replyToken, chatId) {
  const t = String(text).trim();
  // ⚠️ ต้องระบุเจาะจง — กันเผลออนุมัติจากคำว่า "โอเค/ok" ที่พิมพ์ในบทสนทนาปกติ
  // รับเฉพาะ: มีเลข PRJ ชัดเจน  หรือ  ขึ้นต้นด้วยคำว่า "อนุมัติ/ยกเลิก" ตรง ๆ (ไม่มีอย่างอื่นต่อท้าย)
  const mApprove = t.match(/^อนุมัติ\s*(PRJ[\w.-]+)?\s*$/i) || t.match(/^(?:อนุมัติ|ok|โอเค|เอาเลย)\s+(PRJ[\w.-]+)\s*$/i);
  const mRevise  = t.match(/^(?:แก้|ปรับ|แก้ไข)\s*(PRJ[\w.-]+)\s*[:：]?\s*([\s\S]*)$/i);
  const mCancel  = t.match(/^ยกเลิก\s*(PRJ[\w.-]+)?\s*$/i);
  if (!mApprove && !mRevise && !mCancel) return false;

  const pid = (mApprove && mApprove[1]) || (mRevise && mRevise[1]) || (mCancel && mCancel[1]) || latestPendingProject();
  if (!pid) { lineReply(replyToken, 'ตอนนี้ไม่มีแผนงานที่รออนุมัติอยู่ค่ะ'); return true; }

  if (mCancel) {
    setProjectStatus(pid, 'ยกเลิก');
    lineReply(replyToken, 'ยกเลิกแผน ' + pid + ' ให้แล้วค่ะ');
    return true;
  }
  if (mRevise) {
    const note = (mRevise[2] || '').trim();
    appendProjectNote(pid, note);
    lineReply(replyToken, 'รับทราบค่ะ จดข้อแก้ไขของ ' + pid + ' ไว้แล้ว:\n"' + note + '"\n'
      + 'เดี๋ยวทีมปรับตามนี้ พิมพ์ "อนุมัติ ' + pid + '" เมื่อพร้อมให้เริ่มได้เลยค่ะ');
    return true;
  }
  const n = approveProject(pid);
  lineReply(replyToken, n
    ? ('✅ อนุมัติแล้วค่ะ ' + pid + ' — ทีมจะเริ่มงานย่อย ' + n + ' รายการในรอบถัดไปนะคะ')
    : ('ไม่พบแผน ' + pid + ' ที่รออนุมัติค่ะ'));
  return true;
}

// ปิดงานที่ "คน" หรือ "เลขา" รับผิดชอบ (ทีม AI ปิดเองผ่าน endpoint อยู่แล้ว)
// เจ้าของพิมพ์: "เสร็จ PRJ260812-1234.3" หรือ "ปิดงาน REQ260812-4821"
function handleManualDone(text, replyToken) {
  const m = String(text).trim().match(/^(?:เสร็จ|ปิดงาน|ทำแล้ว)\s+((?:REQ|PRJ)[\w.-]+)\s*([\s\S]*)$/i);
  if (!m) return false;
  const ref = m[1], note = (m[2] || '').trim();
  const sheet = reqSheet();
  if (!sheet) { lineReply(replyToken, 'ยังไม่ได้ตั้งชีตบอร์ดค่ะ'); return true; }
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== ref) continue;
    sheet.getRange(i + 1, 3).setValue('เสร็จ');
    if (note) sheet.getRange(i + 1, 13).setValue(note);
    const pid = String(data[i][14] || '');
    lineReply(replyToken, '✅ ปิดงาน ' + ref + ' ให้แล้วค่ะ' + (note ? ('\nโน้ต: ' + note) : ''));
    if (pid) advanceProject(pid);
    return true;
  }
  lineReply(replyToken, 'ไม่พบงาน ' + ref + ' ในบอร์ดค่ะ');
  return true;
}

function latestPendingProject() {
  const sheet = reqSheet(); if (!sheet) return '';
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][2]) === 'รออนุมัติ' && data[i][14]) return String(data[i][14]);
  }
  return '';
}

// อนุมัติ → งานย่อยขั้นแรกเข้าคิวทีม AI, ขั้นถัดไปเป็น "รอลำดับ"
function approveProject(pid) {
  const sheet = reqSheet(); if (!sheet) return 0;
  const data = sheet.getDataRange().getValues();
  let count = 0, firstStep = 999;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14]) === pid && String(data[i][2]) === 'รออนุมัติ') {
      firstStep = Math.min(firstStep, Number(data[i][15]) || 1);
    }
  }
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14]) === pid && String(data[i][2]) === 'รออนุมัติ') {
      const step = Number(data[i][15]) || 1;
      const isAI = String(data[i][11]) === 'ทีมAI';
      const active = (step === firstStep);
      sheet.getRange(i + 1, 3).setValue(active ? (isAI ? 'รอทีม AI' : 'ใหม่') : 'รอลำดับ');
      if (active && !isAI) notifyHumanStep(data[i][0], data[i][8]);
      count++;
    }
  }
  return count;
}

// ขั้นนี้เป็นงานของคน/เลขา → เตือนคุณปาล์มว่าถึงคิวแล้ว (ไม่งั้นโปรเจกต์จะค้าง)
function notifyHumanStep(ref, detail) {
  const owner = cfg('OWNER_LINE_USER_ID');
  if (!owner) return;
  linePush(owner, '👤 ถึงคิวงานที่ต้องให้คนทำแล้วค่ะ\n'
    + '#' + ref + ' — ' + (detail || '') + '\n\n'
    + 'ทำเสร็จแล้วพิมพ์ "เสร็จ ' + ref + '" เพื่อให้โปรเจกต์เดินต่อนะคะ');
}

function setProjectStatus(pid, status) {
  const sheet = reqSheet(); if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14]) === pid) sheet.getRange(i + 1, 3).setValue(status);
  }
}

// จดข้อสั่งแก้จากเจ้าของ → คอลัมน์ 19 "โน้ตจากเจ้าของ" (ทุกงานย่อยของโปรเจกต์นั้น ทีมจะได้เห็น)
function appendProjectNote(pid, note) {
  const sheet = reqSheet(); if (!sheet) return;
  if (sheet.getRange(1, 19).getValue() !== 'โน้ตจากเจ้าของ') sheet.getRange(1, 19).setValue('โน้ตจากเจ้าของ');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14]) === pid) {
      const cur = String(data[i][18] || '');
      sheet.getRange(i + 1, 19).setValue((cur ? cur + ' | ' : '') + note);
    }
  }
}

// เมื่องานย่อยเสร็จ → ปลดล็อกขั้นถัดไปของโปรเจกต์เดียวกัน
function advanceProject(pid) {
  if (!pid) return;
  const sheet = reqSheet(); if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  let nextStep = 9999, rows = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14]) !== pid) continue;
    const st = String(data[i][2]);
    if (st === 'รอลำดับ') { const s = Number(data[i][15]) || 0; if (s < nextStep) nextStep = s; rows.push({ i: i, step: s, ai: String(data[i][11]) === 'ทีมAI' }); }
    if (st === 'รอทีม AI' || st === 'กำลังทำ (AI)' || st === 'ใหม่' || st === 'รอข้อมูล') return; // ยังมีงานค้างอยู่
  }
  rows.filter(function (r) { return r.step === nextStep; })
      .forEach(function (r) {
        sheet.getRange(r.i + 1, 3).setValue(r.ai ? 'รอทีม AI' : 'ใหม่');
        if (!r.ai) notifyHumanStep(data[r.i][0], data[r.i][8]);
      });
  // ไม่เหลือขั้นไหนเลย = โปรเจกต์จบ
  if (!rows.length) {
    const title = (function () {
      for (let k = 1; k < data.length; k++) if (String(data[k][14]) === pid) return String(data[k][16] || pid);
      return pid;
    })();
    const owner = cfg('OWNER_LINE_USER_ID');
    if (owner) linePush(owner, '🎉 โปรเจกต์เสร็จครบทุกขั้นแล้วค่ะ\n📁 ' + title + ' (' + pid + ')');
  }
}

// ════════════════════════════════════════════════════════════
//  ❓ คำถามค้าง — AI ขาดข้อมูล → เลขาไปถามให้ → ได้คำตอบ → ปลดล็อก
// ════════════════════════════════════════════════════════════
function qSheet() {
  const id = boardSheetId(); if (!id) return null;
  const ss = SpreadsheetApp.openById(sheetIdFrom(id));
  let s = ss.getSheetByName('Questions');
  if (!s) { s = ss.insertSheet('Questions'); s.appendRow(['Q_ID', 'เวลา', 'งาน', 'ถามใคร(chatId)', 'คำถาม', 'สถานะ', 'คำตอบ', 'ผู้ตอบ', 'เวลาตอบ']); }
  return s;
}

// ทีม AI เรียกผ่าน endpoint: ขอให้เลขาไปถามข้อมูลที่ขาด
function handleAskInfo(body) {
  if (body.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, error: 'unauthorized' });
  const s = qSheet(); if (!s) return jsonOut({ ok: false, error: 'no sheet' });
  const target = String(body.target || 'owner');
  const chatId = resolveChatTarget(target);
  if (!chatId) return jsonOut({ ok: false, error: 'ไม่รู้จักปลายทาง: ' + target });

  const qid = 'Q' + Utilities.formatDate(new Date(), 'GMT+7', 'yyMMdd') + '-' + Math.floor(100 + Math.random() * 900);
  s.appendRow([qid, new Date(), body.ref || '', chatId, body.question || '', 'รอตอบ', '', '', '']);

  // ตั้งงานเป็น "รอข้อมูล"
  const sheet = reqSheet();
  if (sheet && body.ref) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(body.ref)) {
        sheet.getRange(i + 1, 3).setValue('รอข้อมูล');
        sheet.getRange(i + 1, 18).setValue('รอคำตอบ: ' + (body.question || ''));
        break;
      }
    }
  }
  linePush(chatId, '🙋‍♀️ ขอรบกวนสอบถามค่ะ (เกี่ยวกับงาน ' + (body.ref || '') + ')\n\n'
    + (body.question || '')
    + '\n\n📝 ตอบโดย**ขึ้นต้นว่า "ตอบ"** นะคะ เช่น "ตอบ ..." '
    + '(ถ้าอยู่ในกลุ่มพิมพ์ "เลขา ตอบ ...") 🙏');
  return jsonOut({ ok: true, qid: qid });
}

function resolveChatTarget(target) {
  const t = String(target).trim();
  if (t === 'owner' || t === 'เจ้าของ' || t === 'คุณปาล์ม') return cfg('OWNER_LINE_USER_ID');
  const map = { cafe:'GROUP_CAFE_ID', 'คาเฟ่':'GROUP_CAFE_ID', sales:'GROUP_SALES_ID', 'เซลล์':'GROUP_SALES_ID', 'ทีมเซลล์':'GROUP_SALES_ID' };
  if (map[t]) return cfg(map[t]);
  if (/^[CRU][0-9a-fA-F]{20,}$/.test(t)) return t;
  return cfg(t) || '';
}

// มีคำถามค้างในห้องนี้ไหม → รับเป็น "คำตอบ" เฉพาะเมื่อผู้ใช้ระบุชัดว่าตอบ
// (ขึ้นต้นด้วย "ตอบ" / อ้างเลขงาน / อ้าง Q_ID) — กันข้อความทั่วไปโดนกินเป็นคำตอบ
function tryAnswerPendingQuestion(chatId, senderId, text, replyToken) {
  const s = qSheet(); if (!s) return false;
  const raw = String(text).replace(/^เลขา\s*/i, '').trim();
  const data = s.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][3]) === String(chatId) && String(data[i][5]) === 'รอตอบ') {
      const qid = String(data[i][0] || '');
      const qref = String(data[i][2] || '');
      const isAnswer =
        /^(ตอบ|คำตอบ)\b/i.test(raw) ||
        /^(ตอบ|คำตอบ)[\s:：]/i.test(raw) ||
        (qid && raw.indexOf(qid) !== -1) ||
        (qref && raw.indexOf(qref) !== -1);
      if (!isAnswer) return false; // ไม่ใช่การตอบ → ปล่อยให้ไหลไปตามปกติ
      const answer = raw.replace(/^(ตอบ|คำตอบ)[\s:：]*/i, '').replace(qid, '').replace(qref, '').trim();
      if (answer.length < 2) return false;
      s.getRange(i + 1, 6).setValue('ตอบแล้ว');
      s.getRange(i + 1, 7).setValue(answer);
      s.getRange(i + 1, 8).setValue(senderId);
      s.getRange(i + 1, 9).setValue(new Date());

      const ref = String(data[i][2] || '');
      const sheet = reqSheet();
      if (sheet && ref) {
        const rows = sheet.getDataRange().getValues();
        for (let j = 1; j < rows.length; j++) {
          if (String(rows[j][0]) === ref) {
            const isAI = String(rows[j][11]) === 'ทีมAI';
            sheet.getRange(j + 1, 3).setValue(isAI ? 'รอทีม AI' : 'ใหม่');
            sheet.getRange(j + 1, 18).setValue('ได้ข้อมูลแล้ว: ' + answer.slice(0, 500));
            break;
          }
        }
      }
      lineReply(replyToken, 'ได้รับข้อมูลแล้วค่ะ ขอบคุณมากนะคะ 🙏\nเดี๋ยวส่งต่อให้ทีมทำงาน ' + ref + ' ต่อเลยค่ะ');
      const owner = cfg('OWNER_LINE_USER_ID');
      if (owner && String(chatId) !== String(owner)) {
        linePush(owner, '✅ ได้คำตอบสำหรับงาน ' + ref + ' แล้วค่ะ\n"' + answer.slice(0, 300) + '"');
      }
      return true;
    }
  }
  return false;
}

// ════════════════════════════════════════════════════════════
//  💬 บันทึกแชทกลุ่ม (ให้เลขาสรุปย้อนหลัง + เด็กปั้นเรียนรู้)
// ════════════════════════════════════════════════════════════
const CHAT_KEEP = 1000; // เก็บกี่แถวล่าสุด

function logGroupChat(chatId, ev, text) {
  if (cfg('LOG_GROUP_CHAT') === 'off') return;
  try {
    const id = boardSheetId(); if (!id) return;
    const ss = SpreadsheetApp.openById(sheetIdFrom(id));
    let s = ss.getSheetByName('GroupChat');
    if (!s) { s = ss.insertSheet('GroupChat'); s.appendRow(['เวลา', 'chatId', 'ผู้พูด(userId)', 'ชื่อ', 'ข้อความ']); }
    // ชื่อคนพูด: cache ไว้ 6 ชม. (เดิมยิง LINE API ทุกข้อความ = ช้าและเปลืองโควตา)
    let name = '';
    try {
      const uid = (ev.source && ev.source.userId) || '';
      if (uid) {
        const cache = CacheService.getScriptCache();
        const ck = 'nm_' + chatId + '_' + uid;
        name = cache.get(ck) || '';
        if (!name) {
          const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/group/' + chatId + '/member/' + uid, {
            headers: { Authorization: 'Bearer ' + cfg('LINE_TOKEN') }, muteHttpExceptions: true
          });
          if (res.getResponseCode() === 200) {
            name = JSON.parse(res.getContentText()).displayName || '';
            if (name) cache.put(ck, name, 21600); // 6 ชั่วโมง
          }
        }
      }
    } catch (e) {}
    s.appendRow([new Date(), chatId, (ev.source && ev.source.userId) || '', name, text]);
    if (s.getLastRow() > CHAT_KEEP + 200) s.deleteRows(2, s.getLastRow() - CHAT_KEEP);
  } catch (err) { console.error('logGroupChat: ' + err); }
}

function readGroupChat(chatId, limit) {
  try {
    const id = boardSheetId(); if (!id) return '(ยังไม่มีบันทึกแชท)';
    const ss = SpreadsheetApp.openById(sheetIdFrom(id));
    const s = ss.getSheetByName('GroupChat');
    if (!s || s.getLastRow() < 2) return '(ยังไม่มีบันทึกแชทในกลุ่มนี้)';
    const data = s.getDataRange().getValues();
    const out = [];
    for (let i = data.length - 1; i >= 1 && out.length < (limit || 100); i--) {
      if (String(data[i][1]) !== String(chatId)) continue;
      const t = data[i][0] ? Utilities.formatDate(new Date(data[i][0]), 'GMT+7', 'd/M HH:mm') : '';
      out.push('[' + t + '] ' + (data[i][3] || data[i][2] || 'ไม่ทราบชื่อ') + ': ' + data[i][4]);
    }
    return out.reverse().join('\n') || '(ยังไม่มีบันทึกแชทในกลุ่มนี้)';
  } catch (err) { return '(อ่านแชทไม่สำเร็จ)'; }
}

function isChatSummaryRequest(text) {
  return /สรุป.*(แชท|คุย|กลุ่ม|ข้อความ|ที่คุยกัน)|(แชท|ที่คุยกัน).*สรุป|เมื่อกี้คุยอะไร|คุยอะไรกันบ้าง/i.test(String(text));
}

// ════════════════════════════════════════════════════════════
//  📓 Playbook — วิธีคิดของคุณปาล์ม (เด็กปั้นเป็นคนเขียน)
// ════════════════════════════════════════════════════════════
function loadPlaybook() {
  try {
    const id = boardSheetId(); if (!id) return '';
    const ss = SpreadsheetApp.openById(sheetIdFrom(id));
    let s = ss.getSheetByName('Playbook');
    if (!s) {
      s = ss.insertSheet('Playbook');
      s.appendRow(['หัวข้อ', 'หลักการ', 'ที่มา(หลักฐาน)', 'ความมั่นใจ', 'อัปเดตเมื่อ']);
      s.appendRow(['การตัดสินใจ', 'งานใหญ่ให้เสนอแผนก่อนลงมือ เจ้าของชอบดูแล้วปรับเอง', 'คุยกันตอนวางระบบ', 'สูง', new Date()]);
      s.appendRow(['การออกแบบ', 'ต้องมีคอนเซปอธิบายได้ ห้ามสุ่มมั่ว และต้องใช้สี/ภาพจากคลังแบรนด์', 'คุยกันตอนวางระบบ', 'สูง', new Date()]);
      s.appendRow(['ต้นทุน', 'เลือกทางที่ประหยัดและเริ่มได้ก่อน ค่อยขยายทีหลัง', 'เลือกโมเดลบาง + รอบทุก 1 ชม.', 'กลาง', new Date()]);
      return '';
    }
    const data = s.getDataRange().getValues();
    const lines = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][1]) continue;
      lines.push('- [' + (data[i][0] || '') + '] ' + data[i][1] + (data[i][3] ? (' (มั่นใจ:' + data[i][3] + ')') : ''));
    }
    let txt = lines.join('\n');
    if (txt.length > 3000) txt = txt.slice(0, 3000);
    return txt;
  } catch (err) { return ''; }
}

// ════════════════════════════════════════════════════════════
//  ช่องเชื่อมกับทีม AI ใน Claude Code (คิวงาน + ปิดงาน)
// ════════════════════════════════════════════════════════════

// คืนงานที่สถานะ "รอทีม AI" (ให้ Claude Code ดึงไปทำ)
function getAIQueue() {
  const id = boardSheetId();
  if (!id) return [];
  try {
    const ss = SpreadsheetApp.openById(sheetIdFrom(id));
    const sheet = ss.getSheetByName('Requests');
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    const out = [];
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (String(r[2]) === 'รอทีม AI') {
        out.push({ ref: r[0], biz: r[4], type: r[5], detail: r[8], urgency: r[3], due: r[9],
                   dept: r[13] || '', project: r[14] || '', step: r[15] || '', projectTitle: r[16] || '', needs: r[17] || '' });
      }
    }
    return out;
  } catch (err) { console.error('getAIQueue error: ' + err); return []; }
}

// ทีม AI "เช็คอิน" ก่อนเริ่มทำงาน → สถานะ "กำลังทำ (AI)" + บันทึกแผนก (บอร์ดเห็นสดๆ)
function handleStartTask(body) {
  if (body.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, error: 'unauthorized' });
  const id = boardSheetId();
  if (!id) return jsonOut({ ok: false, error: 'no sheet' });
  const ss = SpreadsheetApp.openById(sheetIdFrom(id));
  const sheet = ss.getSheetByName('Requests');
  if (!sheet) return jsonOut({ ok: false, error: 'no board' });
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.ref)) {
      sheet.getRange(i + 1, 3).setValue('กำลังทำ (AI)');
      if (sheet.getRange(1, 14).getValue() !== 'แผนก') sheet.getRange(1, 14).setValue('แผนก');
      if (body.dept) sheet.getRange(i + 1, 14).setValue(String(body.dept));
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: 'ref not found' });
}

// ทีม AI ส่งผลงานกลับมาปิดงาน → อัปเดตสถานะ + แจ้งคุณปาล์ม
function handleCompleteTask(body) {
  if (body.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, error: 'unauthorized' });
  const id = boardSheetId();
  if (!id) return jsonOut({ ok: false, error: 'no sheet' });
  const ss = SpreadsheetApp.openById(sheetIdFrom(id));
  const sheet = ss.getSheetByName('Requests');
  if (!sheet) return jsonOut({ ok: false, error: 'no board' });

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.ref)) {
      sheet.getRange(i + 1, 3).setValue('เสร็จ (AI)');       // สถานะ
      if (sheet.getRange(1, 13).getValue() !== 'ผลงาน') sheet.getRange(1, 13).setValue('ผลงาน');
      sheet.getRange(i + 1, 13).setValue(String(body.result || '').slice(0, 5000));
      const pid = String(data[i][14] || '');
      const owner = cfg('OWNER_LINE_USER_ID');
      if (owner) linePush(owner, '✅ ทีม AI ทำงาน #' + body.ref + ' เสร็จแล้วค่ะ\n' + String(body.result || '').slice(0, 500));
      if (pid) advanceProject(pid); // ปลดล็อกงานย่อยขั้นถัดไป
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: 'ref not found' });
}

// ════════════════════════════════════════════════════════════
//  ความจำบทสนทนา (เก็บ 10 ข้อความล่าสุดต่อคน ในแท็บ Memory)
// ════════════════════════════════════════════════════════════
const MEM_MAX = 6; // จำนวนข้อความล่าสุดที่เก็บ (user+assistant นับรวมกัน) — ลดจาก 10 เพื่อประหยัด token

function memSheet() {
  const id = boardSheetId();
  if (!id) return null;
  const ss = SpreadsheetApp.openById(sheetIdFrom(id));
  let s = ss.getSheetByName('Memory');
  if (!s) {
    s = ss.insertSheet('Memory');
    s.appendRow(['userId', 'history(json)', 'updatedAt']);
  }
  return s;
}

function memGet(userId) {
  if (!userId) return [];
  try {
    const sheet = memSheet();
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        try { return JSON.parse(data[i][1]) || []; } catch (e) { return []; }
      }
    }
  } catch (err) { console.error('memGet error: ' + err); }
  return [];
}

function memAppend(userId, userText, assistantText) {
  if (!userId) return;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = memSheet();
    if (!sheet) return;
    let history = memGet(userId);
    history.push({ role: 'user', content: userText });
    history.push({ role: 'assistant', content: assistantText });
    history = history.slice(-MEM_MAX);
    const json = JSON.stringify(history);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        sheet.getRange(i + 1, 2).setValue(json);
        sheet.getRange(i + 1, 3).setValue(new Date());
        return;
      }
    }
    sheet.appendRow([userId, json, new Date()]);
  } catch (err) {
    console.error('memAppend error: ' + err);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ════════════════════════════════════════════════════════════
//  ทดสอบเร็ว: รันฟังก์ชันนี้ใน editor เพื่อเช็คว่า Claude ตอบได้
// ════════════════════════════════════════════════════════════
function testClaude() {
  const out = askClaude('สวัสดีครับ คุณเลขา ช่วยแนะนำตัวหน่อย');
  Logger.log(out);
}

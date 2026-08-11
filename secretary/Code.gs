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
  '[[TASK]]{"biz":"โรงน้ำ|คาเฟ่|อื่นๆ","type":"ประเภทสั้นๆ","detail":"สรุปงานให้ชัด","urgency":"ด่วนมาก|ปกติ|ไม่เร่ง","due":"กำหนดถ้ามี","assignee":"เลขา|ทีมAI|คน"}[[/TASK]]',
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
const FINANCE_KEYWORDS = [
  'ต้นทุน', 'ราคาทุน', 'กำไร', 'ขาดทุน', 'มาร์จิ้น', 'margin',
  'ยอดขาย', 'รายรับ', 'รายจ่าย', 'งบ', 'งบการเงิน', 'บัญชี',
  'ซัพพลายเออร์', 'ซัพพลาย', 'supplier', 'ดีล', 'ราคาซื้อ', 'ราคาส่ง',
  'เงินเดือน', 'ค่าจ้าง', 'สูตร', 'กี่บาททุน'
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
  return ContentService.createTextOutput('คุณเลขาพร้อมทำงานค่ะ ✅  (endpoint นี้ไว้รับ webhook จาก LINE)');
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

  // ในกลุ่ม: ถ้าไม่ได้เรียกหาเลขา → เงียบ ปล่อยให้คนคุยกันเอง (ทำตัวเป็นธรรมชาติ)
  if (inGroup && !isAddressedToSecretary(ev, text)) {
    return;
  }

  const history = memGet(chatId);

  // 1) เรื่องการเงินวงใน → ปฏิเสธ + เด้งเตือนคุณปาล์ม (โหมด A + B)
  if (isFinanceTopic(text)) {
    lineReply(replyToken, FINANCE_DECLINE);
    if (!owner) alertOwner(senderId, text);
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
  const sys = kb
    ? SYSTEM_PROMPT + '\n\nคลังข้อมูลธุรกิจ/โรงงาน (ใช้อ้างอิงตอบได้ แต่ยังห้ามเปิดเผยการเงินวงในตามกฎ):\n' + kb
    : SYSTEM_PROMPT;

  const messages = (history || []).concat([{ role: 'user', content: userText }]);
  const payload = {
    model: MODEL,
    max_tokens: 1024,
    system: sys,
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
  ['TASK', 'ALERT', 'SENDGROUP'].forEach(function (name) {
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
                       'ประเภท', 'ผู้ฝาก', 'ติดต่อ', 'รายละเอียด', 'กำหนดเสร็จ', 'ลิงก์รูป', 'ผู้รับผิดชอบ']);
    }
    const now = new Date();
    const ref = 'REQ' + Utilities.formatDate(now, 'GMT+7', 'yyMMdd')
                + '-' + Math.floor(1000 + Math.random() * 9000);
    const assignee = task.assignee || 'คน';
    const status = (assignee === 'ทีมAI') ? 'รอทีม AI' : 'ใหม่';
    sheet.appendRow([
      ref, now, status, task.urgency || 'ปกติ', task.biz || '',
      task.type || '', 'LINE', senderId || '', task.detail || '', task.due || '', '', assignee
    ]);
    return ref;
  } catch (err) {
    console.error('logTaskToBoard error: ' + err);
    return '';
  }
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
        out.push({ ref: r[0], biz: r[4], type: r[5], detail: r[8], urgency: r[3], due: r[9] });
      }
    }
    return out;
  } catch (err) { console.error('getAIQueue error: ' + err); return []; }
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
      const owner = cfg('OWNER_LINE_USER_ID');
      if (owner) linePush(owner, '✅ ทีม AI ทำงาน #' + body.ref + ' เสร็จแล้วค่ะ\n' + String(body.result || '').slice(0, 500));
      return jsonOut({ ok: true });
    }
  }
  return jsonOut({ ok: false, error: 'ref not found' });
}

// ════════════════════════════════════════════════════════════
//  ความจำบทสนทนา (เก็บ 10 ข้อความล่าสุดต่อคน ในแท็บ Memory)
// ════════════════════════════════════════════════════════════
const MEM_MAX = 10; // จำนวนข้อความล่าสุดที่เก็บ (user+assistant นับรวมกัน)

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

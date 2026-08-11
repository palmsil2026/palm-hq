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
  'หลักการตอบ: ตอบภาษาไทย กระชับ ตรงประเด็น เหมือนเลขามือโปร (2-5 บรรทัด)',
  'ถ้าเป็นการฝากงาน ให้ทวนสั้นๆ ว่ารับเรื่องอะไร แล้วถามรายละเอียดที่ขาด (ใคร/อะไร/เมื่อไหร่/ด่วนแค่ไหน)',
  'ถ้าข้อมูลไม่พอให้ถามกลับอย่างสุภาพ อย่าเดา แยกให้ชัดว่าพูดถึงโรงน้ำหรือคาเฟ่',
  'ไม่รับปากเรื่องราคาพิเศษ/ส่วนลด/สัญญาแทนเจ้านาย ให้บอกว่าจะเรียนถามให้',
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
    (body.events || []).forEach(handleEvent);
  } catch (err) {
    console.error('doPost error: ' + err);
  }
  return ContentService.createTextOutput('OK');
}

// เปิด URL ในเบราว์เซอร์จะเจอข้อความนี้ (LINE ใช้ doPost ต่างหาก)
function doGet(e) {
  return ContentService.createTextOutput('คุณเลขาพร้อมทำงานค่ะ ✅  (endpoint นี้ไว้รับ webhook จาก LINE)');
}

function handleEvent(ev) {
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;

  const text = String(ev.message.text || '').trim();
  const replyToken = ev.replyToken;
  const senderId = (ev.source && ev.source.userId) || '';

  // 1) เจอเรื่องการเงิน → ปฏิเสธ + เด้งเตือนคุณปาล์ม (โหมด A + B)
  if (isFinanceTopic(text)) {
    lineReply(replyToken, FINANCE_DECLINE);
    alertOwner(senderId, text);
    logRow(['การเงิน(ปฏิเสธ)', senderId, text, '']);
    return;
  }

  // 2) เรื่องทั่วไป → ให้คุณเลขา (Claude) ตอบ
  const answer = askClaude(text);
  lineReply(replyToken, answer);
  logRow(['ทั่วไป', senderId, text, answer]);
}

function isFinanceTopic(text) {
  const t = text.toLowerCase();
  return FINANCE_KEYWORDS.some(function (k) { return t.indexOf(k.toLowerCase()) !== -1; });
}

// ════════════════════════════════════════════════════════════
//  Claude API — สมองของคุณเลขา
// ════════════════════════════════════════════════════════════
function askClaude(userText) {
  const apiKey = cfg('ANTHROPIC_API_KEY');
  if (!apiKey) return 'ระบบยังไม่ได้ตั้งค่า API key ค่ะ (แจ้งผู้ดูแลระบบด้วยนะคะ)';

  const payload = {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userText }]
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
//  ทดสอบเร็ว: รันฟังก์ชันนี้ใน editor เพื่อเช็คว่า Claude ตอบได้
// ════════════════════════════════════════════════════════════
function testClaude() {
  const out = askClaude('สวัสดีครับ คุณเลขา ช่วยแนะนำตัวหน่อย');
  Logger.log(out);
}

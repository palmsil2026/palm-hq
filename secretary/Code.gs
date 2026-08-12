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
  '[[TASK]]{"biz":"โรงน้ำ|คาเฟ่|อื่นๆ","type":"ประเภทสั้นๆ","detail":"สรุปงานให้ชัด","urgency":"ด่วนมาก|ปกติ|ไม่เร่ง","due":"กำหนดถ้ามี","assignee":"เลขา|ทีมAI|คน","dept":"แผนกถ้าเป็นทีมAI","comment":"ความเห็นของคุณเลขาต่องานนี้"}[[/TASK]]',
  'ช่อง comment: ให้ใส่ความเห็นมืออาชีพสั้น ๆ (1-3 บรรทัด) ว่าคุณมองงานนี้ยังไง —',
  'เช่น ควรทำไหม เสี่ยง/กระทบอะไร ควรทำอะไรก่อน มีทางที่ง่ายกว่าไหม หรือข้อมูลอะไรที่ยังขาด',
  'ใส่เสมอเมื่องานเป็นของ coder หรือ data เพราะคุณปาล์มจะอ่านก่อนตัดสินใจอนุมัติ',
  '',
  'งานที่ต้องขออนุมัติก่อนเสมอ: งานแก้ระบบ/เขียนโค้ด (dept=coder) และงานฐานข้อมูล (dept=data)',
  'งานสองกลุ่มนี้ห้ามส่งเข้าคิวทีม AI ทันที ระบบจะพักไว้ให้คุณปาล์มอนุมัติเอง — ให้บอกผู้ฝากงานว่า',
  '"ขอเสนอคุณปาล์มพิจารณาก่อนนะคะ" อย่ารับปากว่าจะทำเลย',
  'ช่อง dept (ใส่เฉพาะเมื่อ assignee="ทีมAI"): finance=การเงิน/ต้นทุน, analyst=วิเคราะห์ข้อมูล/รายงาน,',
  'content=คอนเทนต์/ดีไซน์/โพสต์, writer=เขียนเอกสาร/ข้อความยาว, researcher=หาข้อมูล/เทียบราคา, coder=แอป/โค้ด/ระบบ,',
  'data=สร้าง/ดูแลฐานข้อมูล รวบรวม-ทำความสะอาดข้อมูล, procurement=ฝากซื้อของ/หาอะไหล่/เทียบราคาร้าน',
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
  '[[SENDGROUP]]{"target":"<ชื่อกลุ่มตามที่คุณปาล์มพูด>","message":"ข้อความที่จะส่งเข้ากลุ่ม"}[[/SENDGROUP]]',
  'target: ใส่ชื่อกลุ่มตามที่คุณปาล์มเรียกได้เลย (เช่น "ทดสอบเลขา", "คาเฟ่", "ทีมเซลล์") ระบบจะหากลุ่มที่ดิฉันอยู่ให้เอง',
  '',
  'ความสามารถที่มี (บอกได้ถ้ามีคนถามว่าทำอะไรได้): รับฝากงานลงบอร์ด, ตอบเรื่องงานในบอร์ด,',
  'รับรูป/ไฟล์เก็บลง Drive แล้วแนบกับงาน, ตั้งเตือนความจำ ("เตือนฉันพรุ่งนี้ 9 โมง ..."),',
  'ประกาศเข้ากลุ่มไลน์ตามชื่อกลุ่ม, สรุปแชทในกลุ่ม, ตามงานค้างให้ทุกเย็น',
  'เฉพาะคุณปาล์ม: "เช็คระบบ" (ตรวจสุขภาพระบบ), "รายชื่อกลุ่ม", "อนุมัติ <เลขงาน>", "เสร็จ <เลขงาน>"',
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
  // ปุ่มบนบอร์ดยิงมาทางนี้ (fetch) → ตอบ JSON กลับ ไม่ต้องโหลดหน้าใหม่
  if (p.action === 'boardDo') {
    if (p.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, msg: 'รหัสไม่ถูกต้อง' });
    const r = String(boardAction(p['do'], p.ref) || '⚠️|ทำรายการไม่สำเร็จ');
    const parts = r.split('|');
    return jsonOut({ ok: parts[0] === '✅', msg: parts.slice(1).join('|') });
  }
  // หน้าบอร์ดงาน เปิดจากมือถือได้เลย: ...exec?page=board&key=<QUEUE_KEY>
  if (p.page === 'board') {
    if (p.key !== cfg('QUEUE_KEY')) return HtmlService.createHtmlOutput('<h3>รหัสไม่ถูกต้องค่ะ</h3>');
    const notice = (p['do'] && p.ref) ? boardAction(p['do'], p.ref) : '';
    return HtmlService.createHtmlOutput(boardHtml(p.key, notice))
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
    const ss = ssById(id);
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

// ════════════════════════════════════════════════════════════
//  ปุ่มบนบอร์ด: ยกเลิกงาน / สั่งทีม AI เริ่มทันที
// ════════════════════════════════════════════════════════════
// คืนข้อความแจ้งผลไปโชว์บนบอร์ด (ข้อความว่าง = ไม่ต้องโชว์)
function boardAction(action, ref) {
  try {
    const sheet = reqSheet();
    if (!sheet) return '⚠️|ยังไม่ได้ตั้งค่าชีตงาน';
    const row = findRefRow(sheet, ref);
    if (!row) return '⚠️|ไม่พบงาน #' + ref;
    ensureTimeCols(sheet);
    const status = String(sheet.getRange(row, 3).getValue() || '');
    const pid = String(sheet.getRange(row, 15).getValue() || '');

    if (action === 'cancel') {
      if (/เสร็จ|ปิด|ยกเลิก/.test(status)) return '⚠️|งาน #' + ref + ' ปิดไปแล้ว (' + status + ')';
      sheet.getRange(row, 3).setValue('ยกเลิก');
      sheet.getRange(row, 21).setValue(new Date());
      logRow(['ยกเลิกงาน(บอร์ด)', '', ref, 'สถานะเดิม: ' + status]);
      if (pid) advanceProject(pid);   // ปลดล็อกงานย่อยขั้นถัดไป ไม่ให้โปรเจกต์ค้าง
      return '✅|ยกเลิกงาน #' + ref + ' แล้ว';
    }

    if (action === 'runnow') {
      if (/เสร็จ|ปิด|ยกเลิก/.test(status)) return '⚠️|งาน #' + ref + ' ปิดไปแล้ว (' + status + ')';
      // กันกดซ้ำ/ชนกับรอบปกติ — ถ้าเพิ่งเริ่มทำไปไม่นาน ไม่ต้องปลุกอีก ไม่งั้นจะได้งานซ้ำสองชุด
      if (status === 'กำลังทำ (AI)') {
        const sAt = sheet.getRange(row, 20).getValue();
        const ms = (sAt instanceof Date) ? (Date.now() - sAt.getTime()) : 0;
        if (sAt instanceof Date && ms < STALE_MIN * 60000) {
          return '⚠️|ทีม AI กำลังทำงาน #' + ref + ' อยู่แล้ว (เริ่ม ' + fmtTime(sAt) + ') ไม่ต้องสั่งซ้ำค่ะ';
        }
      }
      if (status !== 'รอทีม AI') sheet.getRange(row, 3).setValue('รอทีม AI'); // ดันเข้าคิวก่อน แล้วค่อยปลุก
      const r = fireRoutine('คุณปาล์มกดสั่งให้เริ่มงาน #' + ref + ' ทันทีจากบอร์ด — ให้ดึงคิวมาทำเลยโดยไม่ต้องรอรอบถัดไป');
      logRow(['สั่งเริ่มทันที(บอร์ด)', '', ref, r.msg]);
      return (r.ok ? '✅|' : '⚠️|') + r.msg + ' (งาน #' + ref + ')';
    }
    return '';
  } catch (err) {
    console.error('boardAction: ' + err);
    return '⚠️|ทำรายการไม่สำเร็จ: ' + err;
  }
}

// ปลุก Claude Code Routine ให้รันทันที (ตั้ง 2 ค่านี้ใน Script properties ก่อนใช้งาน)
//   ROUTINE_FIRE_URL = URL จากหน้า Edit routine → Select a trigger → API
//   ROUTINE_TOKEN    = token ที่กด Generate ในหน้าเดียวกัน (แสดงครั้งเดียว เก็บให้ดี)
function fireRoutine(note) {
  const url = cfg('ROUTINE_FIRE_URL');
  const tok = cfg('ROUTINE_TOKEN');
  if (!url || !tok) {
    return { ok: false, msg: 'งานเข้าคิวแล้ว แต่ยังปลุกทีม AI ทันทีไม่ได้ (ยังไม่ได้ตั้ง ROUTINE_FIRE_URL / ROUTINE_TOKEN)' };
  }
  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + tok,
        'anthropic-beta': 'experimental-cc-routine-2026-04-01',
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({ text: String(note || '') }),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true, msg: 'สั่งทีม AI เริ่มทำทันทีแล้ว' };
    console.error('fireRoutine ' + code + ': ' + res.getContentText().slice(0, 300));
    return { ok: false, msg: 'ปลุกทีม AI ไม่สำเร็จ (HTTP ' + code + ') — งานยังอยู่ในคิวรอบถัดไป' };
  } catch (err) {
    return { ok: false, msg: 'ปลุกทีม AI ไม่สำเร็จ: ' + err };
  }
}

// ลิงก์บอร์ดของ deployment ปัจจุบันเสมอ (ไม่ต้องจำ URL เอง ต่อให้ deploy ใหม่ก็ยังถูก)
function boardUrl() {
  return ScriptApp.getService().getUrl() + '?page=board&key=' + encodeURIComponent(cfg('QUEUE_KEY'));
}

// ปุ่ม "เปิดบอร์ดงาน" แบบ LINE template message — แนบต่อท้ายข้อความได้เลย
function boardButtonMessage() {
  return {
    type: 'template',
    altText: '📋 เปิดบอร์ดงาน — ' + boardUrl(),
    template: {
      type: 'buttons',
      text: 'บอร์ดงานละกอน 💧 & คาเฟ่ ☕',
      actions: [{ type: 'uri', label: '📋 เปิดบอร์ดงาน', uri: boardUrl() }]
    }
  };
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
  // ถูกเชิญเข้ากลุ่มใหม่ → จำกลุ่มทันที + ทักทาย
  if (ev.type === 'join' && ev.source && (ev.source.groupId || ev.source.roomId)) {
    const gid = ev.source.groupId || ev.source.roomId;
    registerGroup(gid);
    lineReply(ev.replyToken, 'สวัสดีค่ะ ดิฉันคุณเลขา ผู้ช่วยของคุณปาล์มนะคะ 🙋‍♀️\n'
      + 'มีอะไรให้ช่วยเรียก "เลขา" ได้เลยค่ะ (จำกลุ่มนี้ไว้เรียบร้อยแล้ว)');
    return;
  }
  // 📷 รับรูป/ไฟล์ → เซฟลง Drive แล้วแนบกับงานล่าสุดของคนส่ง
  if (ev.type === 'message' && ev.message && (ev.message.type === 'image' || ev.message.type === 'file')) {
    handleMediaMessage(ev);
    return;
  }
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;

  const text = String(ev.message.text || '').trim();
  const replyToken = ev.replyToken;
  const src = ev.source || {};
  const senderId = src.userId || '';
  const inGroup = (src.type === 'group' || src.type === 'room');
  const chatId = src.groupId || src.roomId || senderId; // คีย์ห้อง + ความจำ
  const owner = isOwner(senderId);

  // 🩺 เช็คระบบ (เฉพาะเจ้าของ)
  if (owner && /^(เลขา\s*)?(เช็คระบบ|เชคระบบ|ตรวจระบบ|สุขภาพระบบ|status)$/i.test(text)) {
    lineReply(replyToken, healthCheck());
    return;
  }

  // ดูรายชื่อกลุ่มที่เลขาอยู่/รู้จัก (เฉพาะเจ้าของ)
  if (owner && /^(เลขา\s*)?(รายชื่อกลุ่ม|กลุ่มไหนบ้าง|อยู่กลุ่มไหนบ้าง)$/i.test(text)) {
    const gs = listKnownGroups();
    lineReply(replyToken, gs.length
      ? 'กลุ่มที่ดิฉันอยู่ตอนนี้ค่ะ:\n' + gs.map(function (g, i) { return (i + 1) + '. ' + (g.name || '(ไม่ทราบชื่อ) ' + g.id); }).join('\n')
        + '\n\nสั่งประกาศได้เลย เช่น "เลขา ประกาศในกลุ่ม' + (gs[0].name ? ' ' + gs[0].name : '') + ' ว่า ..."'
      : 'ยังไม่รู้จักกลุ่มไหนเลยค่ะ — เชิญดิฉันเข้ากลุ่มก่อน แล้วให้ใครก็ได้ทักในกลุ่มสัก 1 ข้อความนะคะ');
    return;
  }

  // คำสั่งช่วยหา chat/group id (ไว้ตั้งค่าส่งรายงานเข้ากลุ่ม)
  if (/^(เลขา\s*)?(group\s*id|groupid|chat\s*id|ไอดีกลุ่ม)$/i.test(text)) {
    lineReply(replyToken, 'chat id ของที่นี่:\n' + chatId + '\n(type: ' + (src.type || 'user') + ')');
    return;
  }

  // บันทึกทุกข้อความในกลุ่ม (ไว้ให้เลขาสรุปแชทย้อนหลัง + เด็กปั้นเรียนรู้) + จำกลุ่มเข้าทะเบียน
  if (inGroup) { logGroupChat(chatId, ev, text); registerGroup(chatId); }

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

  // 1.4) ตั้งเตือนความจำ
  if (handleReminder(text, chatId, senderId, replyToken)) {
    logRow(['ตั้งเตือน', senderId, text, '']);
    return;
  }

  // 1.5) ขอลิงก์บอร์ดตรงๆ → ส่งปุ่มเปิดบอร์ดเลย ไม่ต้องให้ Claude สรุป (เร็ว+ประหยัด token)
  if (/^(เลขา\s*)?(เปิด)?(บอร์ด|board)(งาน)?$/i.test(text) || /ลิงก์บอร์ด|link บอร์ด/i.test(text)) {
    lineReply(replyToken, 'นี่เลยค่ะ 📋', [boardButtonMessage()]);
    logRow(['เปิดบอร์ด', senderId, text, boardUrl()]);
    return;
  }

  // 2) ถามงานจากบอร์ด → ดึงข้อมูลมาสรุป (เจ้าของเห็นทั้งทีม / พนักงานเห็นเฉพาะของตัวเอง) + แนบปุ่มเปิดบอร์ด
  if (isBoardQuery(text)) {
    const rows = readBoard(senderId, owner);
    const ctx = buildBoardContext(rows, owner);
    const q = 'ข้อมูลงานจากบอร์ด ณ ตอนนี้' + (owner ? ' (ทั้งทีม)' : ' (เฉพาะงานที่คุณฝาก)') + ':\n'
              + ctx + '\n\nคำถาม: ' + text + '\nช่วยสรุปตอบตามคำถาม เรียงตามความเร่งด่วน กระชับแบบเลขามือโปร';
    const reply = parseBlocks(askClaude(q, history)).reply;
    lineReply(replyToken, reply, [boardButtonMessage()]);
    memAppend(chatId, text, reply);
    logRow(['ถามบอร์ด', senderId, text, reply]);
    return;
  }

  // 3) เรื่องทั่วไป → ให้คุณเลขา (Claude) ตอบ พร้อมความจำ + คลังข้อมูลธุรกิจ
  const p = parseBlocks(askClaude(text, history));
  let reply = p.reply;

  // 3.1 ถ้าเป็นการฝากงาน → คัดแยกตาม assignee
  let taskLogged = false;
  if (p.blocks.TASK) {
    const assignee = p.blocks.TASK.assignee || 'คน';
    if (assignee !== 'เลขา') { // "เลขา" = ทำเสร็จเองแล้วในคำตอบ ไม่ต้องลงบอร์ด
      const ref = logTaskToBoard(p.blocks.TASK, senderId);
      if (ref) {
        taskLogged = true;
        const gated = (assignee === 'ทีมAI') && needsApproval(p.blocks.TASK.dept);
        reply += gated
          ? '\n\n📝 งานนี้แตะระบบ/ข้อมูล ขอเสนอคุณปาล์มพิจารณาก่อนนะคะ (งาน #' + ref + ')'
          : (assignee === 'ทีมAI')
            ? '\n\n🤖 ส่งเข้าคิวทีม AI แล้วค่ะ (งาน #' + ref + ')'
            : '\n\n📋 บันทึกเป็นงาน #' + ref + ' ลงบอร์ดให้แล้วค่ะ';
        if (gated) pushTaskForApproval(ref, p.blocks.TASK, senderId);
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
        : '\n\n⚠️ ดิฉันยังไม่รู้จักกลุ่ม "' + String(p.blocks.SENDGROUP.target || '') + '" ค่ะ — '
          + 'เช็คว่าดิฉันถูกเชิญเข้ากลุ่มนั้นแล้ว และมีคนทักในกลุ่มอย่างน้อย 1 ข้อความ '
          + '(พิมพ์ "เลขา รายชื่อกลุ่ม" เพื่อดูกลุ่มที่ดิฉันรู้จักได้ค่ะ)';
    } else {
      reply += '\n\n(ขออภัยค่ะ การส่งข้อความเข้ากลุ่มทำได้เฉพาะคุณปาล์มเท่านั้น)';
    }
  }

  lineReply(replyToken, reply, taskLogged ? [boardButtonMessage()] : null);
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
// ════════════════════════════════════════════════════════════
//  ⏰ ตามงานค้าง — งานที่ "รอข้อมูล"/"รออนุมัติ" นานเกินไป เลขาเด้งเตือนเอง
//  ตั้งจำนวนวันได้ที่ NUDGE_DAYS (ค่าเริ่มต้น 2 วัน) — รันวันละครั้งผ่าน trigger
// ════════════════════════════════════════════════════════════
function nudgeStaleTasks() {
  const owner = cfg('OWNER_LINE_USER_ID');
  if (!owner) return;
  const days = Number(cfg('NUDGE_DAYS')) || 2;
  const limit = days * 86400000;
  try {
    const sheet = reqSheet(); if (!sheet) return;
    const d = sheet.getDataRange().getValues();
    const now = Date.now();
    const wait = [], blocked = [], human = [];
    for (let i = 1; i < d.length; i++) {
      const st = String(d[i][2]);
      if (['รออนุมัติ', 'รอข้อมูล', 'ใหม่'].indexOf(st) === -1) continue;
      const t = (d[i][1] instanceof Date) ? d[i][1].getTime() : 0;
      if (!t || (now - t) < limit) continue;
      const age = Math.floor((now - t) / 86400000);
      const line = '• #' + d[i][0] + ' (' + age + ' วัน) ' + String(d[i][8] || '').slice(0, 60);
      if (st === 'รออนุมัติ') wait.push(line);
      else if (st === 'รอข้อมูล') blocked.push(line + (d[i][17] ? ('\n     ' + String(d[i][17]).slice(0, 80)) : ''));
      else human.push(line);
    }
    if (!wait.length && !blocked.length && !human.length) return;
    let msg = '⏰ ขอตามงานค้างหน่อยนะคะ (ค้างเกิน ' + days + ' วัน)\n';
    if (wait.length)    msg += '\n📝 รออนุมัติจากคุณปาล์ม:\n' + wait.slice(0, 5).join('\n') + '\n   → พิมพ์ "อนุมัติ <เลขงาน>"\n';
    if (blocked.length) msg += '\n⏸️ รอข้อมูล/คำตอบ:\n' + blocked.slice(0, 5).join('\n') + '\n   → พิมพ์ "ตอบ ..." ให้ดิฉันนะคะ\n';
    if (human.length)   msg += '\n👤 งานที่คนต้องทำ:\n' + human.slice(0, 5).join('\n') + '\n   → ทำเสร็จแล้วพิมพ์ "เสร็จ <เลขงาน>"\n';
    linePush(owner, msg);
  } catch (err) { console.error('nudgeStaleTasks: ' + err); }
}

// ════════════════════════════════════════════════════════════
//  🔔 เตือนความจำ — "เลขา เตือนฉันพรุ่งนี้ 9 โมง โทรหาซัพพลายเออร์"
//  เก็บในแท็บ Reminders แล้วมี trigger เช็คทุก 15 นาที
// ════════════════════════════════════════════════════════════
function remSheet() {
  const id = boardSheetId(); if (!id) return null;
  const ss = ssById(id);
  let sh = ss.getSheetByName('Reminders');
  if (!sh) { sh = ss.insertSheet('Reminders'); sh.appendRow(['เวลาเตือน', 'chatId', 'ผู้สั่ง', 'เรื่อง', 'สถานะ', 'สร้างเมื่อ']); }
  return sh;
}

// แปลงภาษาคนเป็นเวลา — คืน Date หรือ null
function parseThaiWhen(text) {
  const t = String(text);
  const now = new Date();
  let d = new Date(now.getTime());
  let hasDay = false, hasTime = false;

  if (/มะรืน/.test(t)) { d.setDate(d.getDate() + 2); hasDay = true; }
  else if (/พรุ่งนี้|พรุงนี้/.test(t)) { d.setDate(d.getDate() + 1); hasDay = true; }
  else if (/วันนี้|เย็นนี้|คืนนี้/.test(t)) hasDay = true;
  const mDay = t.match(/อีก\s*(\d+)\s*วัน/);
  if (mDay) { d.setDate(d.getDate() + Number(mDay[1])); hasDay = true; }
  const mHr = t.match(/อีก\s*(\d+)\s*(ชม|ชั่วโมง)/);
  if (mHr) { return new Date(now.getTime() + Number(mHr[1]) * 3600000); }
  const mMin = t.match(/อีก\s*(\d+)\s*นาที/);
  if (mMin) { return new Date(now.getTime() + Number(mMin[1]) * 60000); }

  // เวลา: "9 โมง", "9 โมงเช้า", "บ่าย 2", "5 โมงเย็น", "14:30", "20.00", "เที่ยง"
  let hh = -1, mm = 0;
  const mClock = t.match(/(\d{1,2})[:.](\d{2})/);
  const mMong  = t.match(/(?:บ่าย\s*)?(\d{1,2})\s*โมง(?:\s*(เช้า|เย็น))?/);
  const mTum   = t.match(/(\d{1,2})\s*ทุ่ม/);
  const mBai   = t.match(/บ่าย\s*(\d{1,2})/);          // "บ่าย 2" (ไม่มีคำว่าโมง)
  const mYen   = t.match(/(\d{1,2})\s*โมงเย็น|เย็น\s*(\d{1,2})\s*โมง/);
  if (mClock) { hh = Number(mClock[1]); mm = Number(mClock[2]); }
  else if (mTum) { hh = Number(mTum[1]) + 18; }
  else if (mMong) {
    hh = Number(mMong[1]);
    const isAfternoon = /บ่าย/.test(t) || mMong[2] === 'เย็น';
    if (isAfternoon && hh < 12) hh += 12;
  }
  else if (mBai) { hh = Number(mBai[1]); if (hh < 12) hh += 12; }
  else if (mYen) { hh = Number(mYen[1] || mYen[2]); if (hh < 12) hh += 12; }
  else if (/เที่ยง/.test(t)) hh = 12;
  if (hh >= 0 && hh <= 23) { d.setHours(hh, mm, 0, 0); hasTime = true; }

  if (!hasDay && !hasTime) return null;
  if (!hasTime) d.setHours(9, 0, 0, 0);            // บอกแต่วัน → เตือน 9 โมง
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);  // เวลาผ่านไปแล้ว → วันถัดไป
  return d;
}

// จับคำสั่งเตือน คืน true ถ้าจัดการแล้ว
function handleReminder(text, chatId, senderId, replyToken) {
  const m = String(text).trim().match(/^(?:เลขา\s*)?เตือน(?:ฉัน|ผม|หน่อย)?\s*(.+)$/i);
  if (!m) return false;
  const rest = m[1].trim();
  const when = parseThaiWhen(rest);
  if (!when) {
    lineReply(replyToken, 'ได้ค่ะ แต่ขอเวลาชัด ๆ หน่อยนะคะ เช่น\n'
      + '• "เตือนฉันพรุ่งนี้ 9 โมง โทรหาซัพพลายเออร์"\n• "เตือนฉันอีก 30 นาที เช็คเตาต้มน้ำ"');
    return true;
  }
  // ตัดคำบอกเวลาออกจากเนื้อเรื่อง
  const what = rest
    .replace(/พรุ่งนี้|พรุงนี้|มะรืน|วันนี้|เย็นนี้|คืนนี้/g, '')
    .replace(/อีก\s*\d+\s*(วัน|ชม|ชั่วโมง|นาที)/g, '')
    .replace(/(?:บ่าย|เย็น)\s*\d{1,2}\s*โมง(?:\s*(?:เช้า|เย็น))?|\d{1,2}\s*โมง(?:\s*(?:เช้า|เย็น))?|บ่าย\s*\d{1,2}|\d{1,2}\s*ทุ่ม|\d{1,2}[:.]\d{2}|เที่ยง/g, '')
    .replace(/^[\s,ว่าที่]+|[\s,]+$/g, '').trim();
  const sh = remSheet();
  if (!sh) { lineReply(replyToken, 'ขออภัยค่ะ ยังตั้งค่าชีตไม่เรียบร้อย'); return true; }
  sh.appendRow([when, chatId, senderId, what || '(ไม่ได้ระบุเรื่อง)', 'รอเตือน', new Date()]);
  lineReply(replyToken, '🔔 จดไว้แล้วค่ะ — จะเตือนเรื่อง "' + (what || '-') + '"\n'
    + '🗓️ ' + Utilities.formatDate(when, 'GMT+7', 'd/M/yyyy เวลา HH:mm') + ' น.');
  return true;
}

// trigger ทุก 15 นาที — ยิงเตือนที่ถึงเวลาแล้ว
function fireDueReminders() {
  try {
    const sh = remSheet(); if (!sh || sh.getLastRow() < 2) return;
    const n = sh.getLastRow() - 1;
    const d = sh.getRange(2, 1, n, 5).getValues();
    const now = Date.now();
    for (let i = 0; i < d.length; i++) {
      if (String(d[i][4]) !== 'รอเตือน') continue;
      const t = (d[i][0] instanceof Date) ? d[i][0].getTime() : 0;
      if (!t || t > now) continue;
      linePush(String(d[i][1]), '🔔 ถึงเวลาแล้วค่ะ — ' + String(d[i][3] || ''));
      sh.getRange(i + 2, 5).setValue('เตือนแล้ว');
    }
  } catch (err) { console.error('fireDueReminders: ' + err); }
}

// ════════════════════════════════════════════════════════════
//  📷 รับรูป/ไฟล์จากไลน์ → เก็บลง Google Drive → แนบลิงก์กับงาน
//  โฟลเดอร์ปลายทาง: ตั้ง MEDIA_FOLDER_ID ได้ ถ้าไม่ตั้งจะสร้าง "ละกอน-รูปจากไลน์" ให้เอง
// ════════════════════════════════════════════════════════════
function mediaFolder() {
  const fid = cfg('MEDIA_FOLDER_ID');
  if (fid) { try { return DriveApp.getFolderById(sheetIdFrom(fid)); } catch (e) {} }
  const name = 'ละกอน-รูปจากไลน์';
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function handleMediaMessage(ev) {
  const replyToken = ev.replyToken;
  const src = ev.source || {};
  const senderId = src.userId || '';
  const inGroup = (src.type === 'group' || src.type === 'room');
  const chatId = src.groupId || src.roomId || senderId;
  if (inGroup) registerGroup(chatId);
  try {
    const res = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + ev.message.id + '/content', {
      headers: { Authorization: 'Bearer ' + cfg('LINE_TOKEN') }, muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) { lineReply(replyToken, 'ขออภัยค่ะ ดาวน์โหลดไฟล์ไม่สำเร็จ รบกวนส่งอีกครั้งนะคะ 🙏'); return; }

    const blob = res.getBlob();
    const stamp = Utilities.formatDate(new Date(), 'GMT+7', 'yyMMdd-HHmmss');
    const base = (ev.message.type === 'image') ? ('รูป-' + stamp) : ((ev.message.fileName || ('ไฟล์-' + stamp)));
    const file = mediaFolder().createFile(blob.setName(base));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const url = file.getUrl();

    // แนบกับงานล่าสุดที่คนนี้ฝากไว้และยังไม่ปิด
    const ref = attachMediaToLatestTask(senderId, url);
    lineReply(replyToken, ref
      ? ('📎 เก็บไฟล์ให้แล้วค่ะ แนบไว้กับงาน #' + ref + ' เรียบร้อย\n' + url)
      : ('📎 เก็บไฟล์ไว้ให้แล้วค่ะ\n' + url + '\n\nยังไม่มีงานค้างของคุณให้แนบ — เล่ารายละเอียดงานมาได้เลยนะคะ เดี๋ยวดิฉันผูกไฟล์นี้ให้'));
    logRow(['รับไฟล์', senderId, ev.message.type + ' ' + base, url]);
  } catch (err) {
    console.error('handleMediaMessage: ' + err);
    lineReply(replyToken, 'ขออภัยค่ะ เก็บไฟล์ไม่สำเร็จ (' + err + ')');
  }
}

// หางานล่าสุดของคนส่งที่ยังไม่ปิด แล้วต่อลิงก์รูปในคอลัมน์ "ลิงก์รูป" (K)
function attachMediaToLatestTask(senderId, url) {
  if (!senderId) return '';
  try {
    const sheet = reqSheet(); if (!sheet) return '';
    const last = sheet.getLastRow(); if (last < 2) return '';
    const start = Math.max(2, last - 199);
    const d = sheet.getRange(start, 1, last - start + 1, 12).getValues();
    for (let i = d.length - 1; i >= 0; i--) {
      if (String(d[i][7]) !== String(senderId)) continue;           // คอลัมน์ ติดต่อ = userId ผู้ฝาก
      if (/เสร็จ|ปิด|ยกเลิก/.test(String(d[i][2]))) continue;
      const row = start + i;
      const cur = String(sheet.getRange(row, 11).getValue() || '');
      sheet.getRange(row, 11).setValue(cur ? (cur + '\n' + url) : url);
      return String(d[i][0]);
    }
  } catch (err) { console.error('attachMediaToLatestTask: ' + err); }
  return '';
}

// ════════════════════════════════════════════════════════════
//  🩺 "เลขา เช็คระบบ" — ไล่ตรวจว่าอะไรพร้อม อะไรยังขาด พร้อมวิธีแก้
// ════════════════════════════════════════════════════════════
function healthCheck() {
  const L = [];
  function ok(t) { L.push('✅ ' + t); }
  function bad(t, fix) { L.push('❌ ' + t + (fix ? ('\n     → ' + fix) : '')); }
  function warn(t, fix) { L.push('⚠️ ' + t + (fix ? ('\n     → ' + fix) : '')); }

  // 1. LINE
  cfg('LINE_TOKEN') ? ok('LINE token ตั้งแล้ว') : bad('ไม่มี LINE_TOKEN', 'ออก Channel access token ใหม่ใน LINE Developers');
  const owner = cfg('OWNER_LINE_USER_ID');
  if (!owner) bad('ไม่รู้ userId ของคุณปาล์ม', 'ทักหาดิฉันแล้วพิมพ์ "chat id" เอาค่าไปใส่ OWNER_LINE_USER_ID');
  else if (!/^U[0-9a-f]{20,}$/i.test(owner)) bad('OWNER_LINE_USER_ID รูปแบบผิด (' + owner + ')', 'ต้องขึ้นต้นด้วย U และเป็นรหัสยาว');
  else ok('รู้จักคุณปาล์มแล้ว (เด้งเตือนได้)');

  // 2. Claude API — ยิงจริงเพื่อดูว่า key ใช้ได้
  const key = cfg('ANTHROPIC_API_KEY');
  if (!key) bad('ไม่มี ANTHROPIC_API_KEY', 'สร้าง key ที่ console.anthropic.com');
  else {
    try {
      const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post', contentType: 'application/json',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        payload: JSON.stringify({ model: MODEL, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
        muteHttpExceptions: true
      });
      const c = r.getResponseCode();
      if (c === 200) ok('สมองดิฉันทำงานปกติ (' + MODEL + ')');
      else if (c === 401) bad('API key ใช้ไม่ได้แล้ว (401)', 'สร้าง key ใหม่แล้วเปลี่ยนใน Script properties');
      else if (c === 429) warn('โควตา Claude เต็มชั่วคราว (429)', 'รอสักครู่แล้วลองใหม่');
      else bad('เรียก Claude ไม่ผ่าน (HTTP ' + c + ')');
    } catch (e) { bad('เรียก Claude ไม่ได้: ' + e); }
  }

  // 3. ชีต
  const bid = boardSheetId();
  if (!bid) bad('ไม่มี LOG_SHEET_ID', 'ใส่ลิงก์ Google Sheet กลางใน Script properties');
  else {
    try {
      const sh = ssById(bid).getSheetByName('Requests');
      ok('บอร์ดงานต่อติด (' + (sh ? Math.max(0, sh.getLastRow() - 1) : 0) + ' งานในระบบ)');
    } catch (e) { bad('เปิดชีตบอร์ดไม่ได้', 'เช็คว่า LOG_SHEET_ID ถูกต้องและแชร์สิทธิ์ให้สคริปต์'); }
  }
  const did = cfg('DATA_SHEET_ID');
  if (!did) warn('ยังไม่ได้ตั้ง DATA_SHEET_ID', 'ทีม AI จะดูข้อมูลธุรกิจโรงน้ำไม่ได้');
  else {
    try { ok('ชีตข้อมูลธุรกิจต่อติด (' + ssById(did).getSheets().length + ' แท็บ)'); }
    catch (e) { bad('เปิดชีตข้อมูลธุรกิจไม่ได้', 'เช็ค DATA_SHEET_ID'); }
  }

  // 4. กลุ่ม
  const gs = listKnownGroups();
  gs.length ? ok('รู้จัก ' + gs.length + ' กลุ่ม: ' + gs.map(function (g) { return g.name || g.id.slice(0, 8); }).join(', '))
            : warn('ยังไม่รู้จักกลุ่มไหนเลย', 'เชิญดิฉันเข้ากลุ่ม แล้วให้ใครทักในกลุ่ม 1 ข้อความ');

  // 5. ปลุกทีม AI ทันที
  (cfg('ROUTINE_FIRE_URL') && cfg('ROUTINE_TOKEN'))
    ? ok('ปุ่ม "เริ่มทันที" บนบอร์ดใช้ได้')
    : warn('ปลุกทีม AI ทันทีไม่ได้', 'ตั้ง ROUTINE_FIRE_URL + ROUTINE_TOKEN (หน้า Edit routine → API)');

  // 6. คิว + งานค้าง
  try {
    const sheet = reqSheet();
    if (sheet) {
      const d = sheet.getDataRange().getValues();
      let q = 0, doing = 0, wait = 0, blocked = 0;
      for (let i = 1; i < d.length; i++) {
        const st = String(d[i][2]);
        if (st === 'รอทีม AI') q++;
        else if (st === 'กำลังทำ (AI)') doing++;
        else if (st === 'รออนุมัติ') wait++;
        else if (st === 'รอข้อมูล') blocked++;
      }
      L.push('📊 คิวตอนนี้: รอทีม AI ' + q + ' · กำลังทำ ' + doing + ' · รออนุมัติ ' + wait + ' · รอข้อมูล ' + blocked);
      if (wait) L.push('     (พิมพ์ "อนุมัติ <เลขงาน>" เพื่อปล่อยงานที่รออนุมัติ)');
    }
  } catch (e) {}

  // 7. trigger
  try {
    const fns = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
    fns.length ? ok('งานอัตโนมัติทำงานอยู่: ' + fns.join(', ')) : warn('ยังไม่ได้ตั้ง trigger', 'รันฟังก์ชัน setupTriggers ใน Apps Script');
  } catch (e) {}

  return '🩺 รายงานสุขภาพระบบค่ะ\n\n' + L.join('\n');
}

// ทะเบียนกลุ่ม — เลขาจำเอง ไม่ต้องตั้ง Script property ทีละกลุ่ม
// บันทึกลงแท็บ Groups ทุกครั้งที่ (1) ถูกเชิญเข้ากลุ่ม (2) มีคนพูดในกลุ่ม (แคช 6 ชม. กันเขียนถี่)
function registerGroup(chatId) {
  if (!chatId || !/^[CR]/.test(String(chatId))) return;
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('grp_' + chatId)) return;
    let name = '';
    if (String(chatId).charAt(0) === 'C') {   // room (R...) ไม่มี API ชื่อ
      const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/group/' + chatId + '/summary', {
        headers: { Authorization: 'Bearer ' + cfg('LINE_TOKEN') }, muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) name = JSON.parse(res.getContentText()).groupName || '';
    }
    const id = boardSheetId(); if (!id) return;
    const ss = ssById(id);
    let sh = ss.getSheetByName('Groups');
    if (!sh) { sh = ss.insertSheet('Groups'); sh.appendRow(['chatId', 'ชื่อกลุ่ม', 'อัปเดตเมื่อ']); }
    const last = sh.getLastRow();
    let row = 0;
    if (last >= 2) {
      const ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(chatId)) { row = i + 2; break; }
    }
    if (row) sh.getRange(row, 2, 1, 2).setValues([[name || sh.getRange(row, 2).getValue(), new Date()]]);
    else sh.appendRow([chatId, name, new Date()]);
    cache.put('grp_' + chatId, '1', 21600);
  } catch (err) { console.error('registerGroup: ' + err); }
}

// อ่านทะเบียนกลุ่มทั้งหมด → [{id, name}]
function listKnownGroups() {
  try {
    const id = boardSheetId(); if (!id) return [];
    const sh = ssById(id).getSheetByName('Groups');
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
             .map(function (r) { return { id: String(r[0]), name: String(r[1] || '') }; })
             .filter(function (g) { return g.id; });
  } catch (err) { return []; }
}

// หากลุ่มจากชื่อ (ตรงตัวก่อน แล้วค่อยแบบมีคำนั้นอยู่ในชื่อ)
function findGroupByName(name) {
  const q = String(name || '').trim().toLowerCase();
  if (!q) return '';
  const gs = listKnownGroups();
  for (let i = 0; i < gs.length; i++) if (gs[i].name.toLowerCase() === q) return gs[i].id;
  for (let i = 0; i < gs.length; i++) if (gs[i].name && gs[i].name.toLowerCase().indexOf(q) !== -1) return gs[i].id;
  return '';
}

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
  if (!gid) gid = findGroupByName(t);                     // หาในทะเบียนกลุ่มที่เลขาอยู่
  if (!gid && map[t]) return false;
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

  const ss = ssById(id);
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
    if (['morningBrief', 'boardWatch', 'nudgeStaleTasks', 'fireDueReminders'].indexOf(fn) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('morningBrief').timeBased().atHour(8).everyDays(1).create();
  ScriptApp.newTrigger('boardWatch').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('nudgeStaleTasks').timeBased().atHour(17).everyDays(1).create();
  ScriptApp.newTrigger('fireDueReminders').timeBased().everyMinutes(15).create();
  Logger.log('✅ ตั้ง trigger แล้ว: morningBrief (8 โมง), boardWatch (ทุก 30 นาที), nudgeStaleTasks (17 โมง), fireDueReminders (ทุก 15 นาที)');
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

  const kb = loadKBCached();
  const pb = loadPlaybookCached();
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
// extraMessages: array ของ message object เพิ่มเติม (เช่นปุ่มเปิดบอร์ด) ต่อท้ายข้อความปกติ — รวมกันได้สูงสุด 5 ข้อความ/ครั้งตามลิมิตของ LINE
function lineReply(replyToken, text, extraMessages) {
  if (!replyToken) return;
  const messages = [{ type: 'text', text: text }].concat(extraMessages || []).slice(0, 5);
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + cfg('LINE_TOKEN') },
    payload: JSON.stringify({ replyToken: replyToken, messages: messages }),
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

// ⚡ เปิด Spreadsheet ครั้งเดียวต่อการรัน แล้วใช้ซ้ำ (openById แพงมากใน GAS ~300-600ms/ครั้ง)
var _SS_CACHE_ = {};
function ssById(v) {
  const id = sheetIdFrom(v);
  if (!id) return null;
  if (!_SS_CACHE_[id]) _SS_CACHE_[id] = SpreadsheetApp.openById(id);
  return _SS_CACHE_[id];
}

function logRow(arr) {
  const sheetId = cfg('LOG_SHEET_ID');
  if (!sheetId) return;
  try {
    const ss = ssById(sheetId);
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

// แปลงเวลาเป็นข้อความไทยสั้นๆ (ว/ด HH:MM) — ทำฝั่งเซิร์ฟเวอร์ให้เลย ฝั่งหน้าเว็บจะได้ไม่ต้องคำนวณ
function fmtTime(v) {
  if (!v) return '';
  try {
    const d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return Utilities.formatDate(d, 'GMT+7', 'd/M HH:mm');
  } catch (e) { return String(v); }
}

// คืนงานทุกสถานะ (สำหรับหน้า board.html)
function readBoardAll() {
  const id = boardSheetId();
  if (!id) return [];
  try {
    const ss = ssById(id);
    const sheet = ss.getSheetByName('Requests');
    if (!sheet) return [];
    // ⚡ อ่านแค่ 300 แถวล่าสุด แทนที่จะลากทั้งชีต (getDataRange ช้าขึ้นเรื่อยๆ ตามจำนวนงาน)
    const last = sheet.getLastRow();
    if (last < 2) return [];
    const start = Math.max(2, last - 299);
    const data = sheet.getRange(start, 1, last - start + 1, 21).getValues();
    const out = [];
    for (let i = data.length - 1; i >= 0 && out.length < 200; i--) {
      const r = data[i];
      if (!r[0]) continue;
      out.push({
        ref: r[0], time: fmtTime(r[1]), status: r[2], urgency: r[3], biz: r[4],
        type: r[5], from: r[6], detail: r[8], due: r[9], assignee: r[11] || '', result: r[12] || '', dept: r[13] || '',
        project: r[14] || '', step: r[15] || '', projectTitle: r[16] || '', blocked: r[17] || '',
        startedAt: fmtTime(r[19]), doneAt: fmtTime(r[20])
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
    const ss = ssById(id);
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
    const ss = ssById(id);
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
    const ss = ssById(id);
    let sheet = ss.getSheetByName('Requests');
    if (!sheet) {
      sheet = ss.insertSheet('Requests');
      sheet.appendRow(['เลขงาน', 'เวลาที่ส่ง', 'สถานะ', 'ความเร่งด่วน', 'ธุรกิจ',
                       'ประเภท', 'ผู้ฝาก', 'ติดต่อ', 'รายละเอียด', 'กำหนดเสร็จ', 'ลิงก์รูป', 'ผู้รับผิดชอบ', 'ผลงาน', 'แผนก',
                       'โปรเจกต์', 'ลำดับ', 'ชื่อโปรเจกต์', 'ติดขัด', 'โน้ตจากเจ้าของ', 'เริ่มทำเมื่อ', 'เสร็จเมื่อ']);
    }
    const now = new Date();
    const ref = 'REQ' + Utilities.formatDate(now, 'GMT+7', 'yyMMdd')
                + '-' + Math.floor(1000 + Math.random() * 9000);
    const assignee = task.assignee || 'คน';
    const dept = (assignee === 'ทีมAI') ? (task.dept || '') : '';
    // งานเปลี่ยนระบบ/โค้ด/ฐานข้อมูล = พักรออนุมัติก่อน ไม่เข้าคิวทีม AI ทันที
    const status = (assignee !== 'ทีมAI') ? 'ใหม่'
                 : (needsApproval(dept) ? 'รออนุมัติ' : 'รอทีม AI');
    sheet.appendRow([
      ref, now, status, task.urgency || 'ปกติ', task.biz || '',
      task.type || '', 'LINE', senderId || '', task.detail || '', task.due || '', '', assignee, '', dept,
      '', '', '', '', (task.comment ? ('💬 เลขา: ' + task.comment) : '')
    ]);
    return ref;
  } catch (err) {
    console.error('logTaskToBoard error: ' + err);
    return '';
  }
}

// แผนกที่ต้องให้คุณปาล์มอนุมัติก่อนเสมอ (งานเปลี่ยนระบบ / โค้ด / ฐานข้อมูล)
const APPROVE_DEPTS = ['coder', 'data'];
function needsApproval(dept) {
  return APPROVE_DEPTS.indexOf(String(dept || '').toLowerCase()) !== -1;
}

// ส่งงานเดี่ยวให้คุณปาล์มพิจารณา พร้อมความเห็นของคุณเลขา
function pushTaskForApproval(ref, task, senderId) {
  const owner = cfg('OWNER_LINE_USER_ID');
  if (!owner) return;
  const DEPT = { coder: '💻 โค้ด/ระบบ', data: '🗄️ ฝ่ายข้อมูล' };
  let msg = '📝 ขออนุมัติก่อนจ่ายงานค่ะคุณปาล์ม\n'
          + '#' + ref + '  ' + (DEPT[task.dept] || task.dept || '') + '\n'
          + (task.biz ? ('🏢 ' + task.biz + '\n') : '')
          + (task.urgency ? ('🚩 ' + task.urgency + '\n') : '')
          + '\n📌 งานที่ขอมา:\n' + (task.detail || '') + '\n';
  if (task.comment) msg += '\n💬 ความเห็นของดิฉัน:\n' + task.comment + '\n';
  msg += '\nเอายังไงดีคะ?\n'
       + '• "อนุมัติ ' + ref + '" — ให้ทีมลงมือเลย\n'
       + '• "แก้ ' + ref + ' : ..." — บอกที่อยากปรับ\n'
       + '• "ยกเลิก ' + ref + '" — ไม่ทำ';
  linePush(owner, msg);
}

// ════════════════════════════════════════════════════════════
//  📋 หน้าบอร์ดงาน (เสิร์ฟจาก GAS — ฝังข้อมูลมาเลย ไม่ต้อง fetch)
// ════════════════════════════════════════════════════════════
// ทีม AI (Claude Code Routine) ทำงานเป็นรอบ — คำนวณว่ารอบถัดไปประมาณกี่โมง
// ตั้งช่วงเวลาทำงานได้ที่ Script property: AI_ROUND_HOURS (ค่าเริ่มต้น "8-18" เวลาไทย)
function nextRoundText() {
  try {
    const rng = (cfg('AI_ROUND_HOURS') || '8-18').split('-');
    const from = parseInt(rng[0], 10), to = parseInt(rng[1], 10);
    const nowH = parseInt(Utilities.formatDate(new Date(), 'GMT+7', 'H'), 10);
    if (nowH < from) return String(from).padStart(2, '0') + ':15 น. วันนี้';
    if (nowH >= to) return String(from).padStart(2, '0') + ':15 น. พรุ่งนี้';
    return String(nowH + 1).padStart(2, '0') + ':15 น. (ทุกชั่วโมง ' + from + ':00-' + to + ':00)';
  } catch (e) { return 'ทุกชั่วโมงในเวลาทำการ'; }
}

function boardHtml(key, notice) {
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
+ '.mb{cursor:pointer;transition:transform .12s,box-shadow .12s;-webkit-tap-highlight-color:transparent}'
+ '.mb:hover{transform:translateY(-2px);box-shadow:0 3px 10px rgba(27,53,88,.13)}'
+ '.mb.sel{border-color:var(--navy);border-width:2px;background:linear-gradient(180deg,#fff,var(--navy-l));box-shadow:0 3px 10px rgba(27,53,88,.18)}'
+ '.av{font-size:1.5rem}.mn{font-size:.78rem;font-weight:700;color:var(--navy);margin-top:4px}'
+ '.ms{font-size:.66rem;margin-top:3px;color:var(--sub);min-height:2em}'
+ '.dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:3px}'
+ '.dot.g{background:var(--green)}.dot.o{background:var(--orange);animation:p 1.2s infinite}.dot.a{background:var(--gold)}'
+ '@keyframes p{0%,100%{opacity:1}50%{opacity:.35}}'
+ '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:9px;margin-bottom:12px}'
+ '.st{background:#fff;border:1px solid var(--bd);border-radius:11px;padding:10px;text-align:center}'
+ '.st .n{font-size:1.35rem;font-weight:700;color:var(--navy)}.st .l{font-size:.7rem;color:var(--sub)}'
+ '.st.red .n{color:var(--red)}.st.ai .n{color:var(--teal)}.st.dn .n{color:var(--green)}'
+ '.st{cursor:pointer;transition:transform .12s,box-shadow .12s;-webkit-tap-highlight-color:transparent}'
+ '.st:hover{transform:translateY(-2px);box-shadow:0 3px 10px rgba(27,53,88,.12)}'
+ '.st.on{border-color:var(--navy);border-width:2px;background:var(--navy-l);box-shadow:0 3px 10px rgba(27,53,88,.18)}'
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
+ '.mt.tl{font-size:.68rem;color:#98A6B4;border-top:1px dashed var(--bd);padding-top:5px}'
+ '.rs{background:var(--cream);border:1px dashed var(--bd);border-radius:8px;padding:7px 9px;font-size:.78rem}'
+ '.em{text-align:center;color:var(--sub);padding:45px 20px}'
+ '.act{display:flex;gap:7px;margin-top:2px}'
+ '.bt{flex:1;padding:7px 10px;border-radius:8px;border:1.5px solid var(--bd);background:#fff;font-family:inherit;font-size:.76rem;font-weight:600;cursor:pointer;color:var(--sub)}'
+ '.bt.run{border-color:var(--teal);color:var(--teal);background:var(--teal-l)}'
+ '.bt.run:hover{background:var(--teal);color:#fff}'
+ '.bt.cancel:hover{border-color:var(--red);color:var(--red);background:#FBE9E7}'
+ '.sub .act{margin:6px 0 2px;max-width:280px}'
+ '.notice{background:#E8F5EC;border:1px solid var(--green);color:#26694E;border-radius:10px;padding:10px 13px;margin-bottom:12px;font-size:.85rem}'
+ '.notice.warn{background:#FFF3E0;border-color:var(--orange);color:#8A5A12}'
+ '.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:26px;max-width:90%;background:#26694E;color:#fff;padding:11px 18px;border-radius:12px;font-size:.87rem;box-shadow:0 6px 18px rgba(0,0,0,.25);z-index:99;transition:opacity .5s}'
+ '.toast.warn{background:#8A5A12}'
+ '</style></head><body>'
+ '<div class="hd"><h1>📋 บอร์ดงาน</h1><div class="s">โรงน้ำละกอน 💧 &amp; คาเฟ่ ☕ — <span id="up"></span></div></div>'
+ '<div class="wrap"><div class="tt">👥 ทีมงาน AI <span style="font-weight:400;color:#7A8A9B">— รอบทำงานถัดไป: ' + nextRoundText() + ' · แตะการ์ดเพื่อดูงานเฉพาะฝ่าย</span></div><div class="team" id="tm"></div>'
+ '<div class="stats" id="sx"></div><div class="fl" id="fx"></div>'
+ '<div id="pj"></div><div class="cards" id="cx"></div><div class="em" id="ex" style="display:none">ไม่มีงานในหมวดนี้ ✨</div></div>'
+ '<script>' + boardScript(json, key, notice) + '</scr' + 'ipt></body></html>';
}

// ── สคริปต์ฝั่งหน้าเว็บของบอร์ด (แยกออกมาให้อ่าน/แก้ง่ายกว่าเดิม) ──────────
// ตัวกรองมี 2 ชั้นที่ใช้ร่วมกันได้:
//   FD = ฝ่าย  ("" = ทุกฝ่าย, "_sec" = คุณเลขา, นอกนั้นคือรหัสแผนก)
//   F  = สถานะ (open/urgent/wait/ai/doing/blocked/human/done/all)
// เช่น เลือกฝ่ายดีไซน์ แล้วกดไทล์ "เสร็จแล้ว" = เห็นเฉพาะงานดีไซน์ที่เสร็จแล้ว
function boardScript(json, key, notice) {
  return [
    'var ALL=' + json + ';',
    'var KEY=' + JSON.stringify(String(key || '')) + ';',
    'var BASE=' + JSON.stringify(ScriptApp.getService().getUrl()) + ';',
    'var NOTICE=' + JSON.stringify(String(notice || '')) + ';',
    'var NEXT=' + JSON.stringify(nextRoundText()) + ';',
    'var F="open";var FD="";',
    'var TEAM=[{k:"data",e:"🗄️",n:"ฝ่ายข้อมูล"},{k:"finance",e:"💰",n:"การเงิน"},{k:"analyst",e:"📈",n:"นักวิเคราะห์"},{k:"content",e:"🎨",n:"ดีไซน์"},{k:"writer",e:"✍️",n:"นักเขียน"},{k:"researcher",e:"🔍",n:"นักวิจัย"},{k:"procurement",e:"🛒",n:"จัดซื้อ"},{k:"coder",e:"💻",n:"โค้ด"}];',
    'var FS=[["open","ค้างอยู่"],["urgent","🔴 ด่วนมาก"],["wait","⏳ รออนุมัติ"],["ai","🤖 รอทีม AI"],["doing","⚙️ กำลังทำ"],["blocked","⏸️ รอข้อมูล"],["human","👤 งานคน"],["done","✅ เสร็จแล้ว"],["all","ทั้งหมด"]];',
    'function E(s){return String(s==null?"":s).replace(/[&<>"]/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[m]})}',
    'function done(t){return /เสร็จ|ปิด|ยกเลิก/.test(t.status||"")}',

    // ตัวกรอง: ฝ่าย × สถานะ
    'function inDept(t){if(!FD)return 1;return FD=="_sec"?!t.dept:t.dept==FD}',
    'function stMatch(t){if(F=="all")return 1;if(F=="open")return !done(t);if(F=="urgent")return t.urgency=="ด่วนมาก"&&!done(t);'
    + 'if(F=="wait")return t.status=="รออนุมัติ";if(F=="ai")return t.status=="รอทีม AI";if(F=="doing")return t.status=="กำลังทำ (AI)";'
    + 'if(F=="blocked")return t.status=="รอข้อมูล";if(F=="human")return (t.assignee=="คน"||!t.assignee)&&!done(t);if(F=="done")return done(t);return 1}',
    'function mt(t){return inDept(t)&&stMatch(t)}',

    // กดเลือก: การ์ดฝ่าย (กดซ้ำ = ยกเลิก) / ไทล์สถิติ / ชิปสถานะ
    'function pick(k){if(FD==k){FD="";F="open"}else{FD=k;F="all"}render();window.scrollTo(0,0)}',
    'function setF(f){F=f;render()}',
    'function bind(sel,fn){Array.prototype.forEach.call(document.querySelectorAll(sel),function(el){el.onclick=function(){fn(el)}})}',
    'function deptName(k){if(k=="_sec")return "🗓️ คุณเลขา";for(var i=0;i<TEAM.length;i++)if(TEAM[i].k==k)return TEAM[i].e+" "+TEAM[i].n;return k}',

    // แถบทีม AI
    'function team(){var h="",nw=ALL.filter(function(t){return t.status=="ใหม่"||t.status=="รออนุมัติ"}).length;'
    + 'h+=\'<div class="mb\'+(nw?" busy":"")+(FD=="_sec"?" sel":"")+\'" data-k="_sec"><div class="av">🗓️</div><div class="mn">คุณเลขา</div><div class="ms">\'+(nw?\'<span class="dot o"></span>จัดคิว/รออนุมัติ \'+nw:\'<span class="dot g"></span>เฝ้าบอร์ดอยู่ค่ะ\')+\'</div></div>\';'
    + 'TEAM.forEach(function(m){var w=null,q=0,d=0;ALL.forEach(function(t){if(t.dept!=m.k)return;if(t.status=="กำลังทำ (AI)")w=t;if(t.status=="รอทีม AI")q++;if(t.status=="เสร็จ (AI)")d++});'
    + 'var s=w?\'<span class="dot o"></span>ทำ #\'+E(w.ref)+(w.startedAt?\'<br><span style="color:#C8842A">เริ่ม \'+E(w.startedAt)+\'</span>\':"")'
    + ':(q?\'<span class="dot a"></span>คิว \'+q+\' งาน<br><span style="color:#7A8A9B">รอบหน้า \'+NEXT+\'</span>\':\'<span class="dot g"></span>ว่าง\'+(d?\'<br><span style="color:#3D9970">เสร็จแล้ว \'+d+\'</span>\':""));'
    + 'h+=\'<div class="mb\'+(w?" busy":"")+(FD==m.k?" sel":"")+\'" data-k="\'+m.k+\'"><div class="av">\'+m.e+\'</div><div class="mn">\'+m.n+\'</div><div class="ms">\'+s+\'</div></div>\'});'
    + 'document.getElementById("tm").innerHTML=h;bind("#tm .mb",function(el){pick(el.getAttribute("data-k"))})}',

    // วาดบอร์ด — ไทล์สถิตินับเฉพาะขอบเขตฝ่ายที่เลือกอยู่ และกดเพื่อกรองสถานะได้
    'function render(){team();'
    + 'var scope=ALL.filter(inDept),op=scope.filter(function(t){return !done(t)});'
    + 'var S=[["open",op.length,"งานค้าง",""],["urgent",op.filter(function(t){return t.urgency=="ด่วนมาก"}).length,"ด่วนมาก","red"],'
    + '["ai",scope.filter(function(t){return t.status=="รอทีม AI"}).length,"รอทีม AI","ai"],["done",scope.filter(done).length,"เสร็จแล้ว","dn"]];'
    + 'document.getElementById("sx").innerHTML=S.map(function(s){return \'<div class="st \'+s[3]+(F==s[0]?" on":"")+\'" data-f="\'+s[0]+\'"><div class="n">\'+s[1]+\'</div><div class="l">\'+s[2]+\'</div></div>\'}).join("");'
    + 'bind("#sx .st",function(el){setF(el.getAttribute("data-f"))});'
    + 'var chips=FS.map(function(f){return \'<button class="ch\'+(f[0]==F?" on":"")+\'" data-f="\'+f[0]+\'">\'+f[1]+\'</button>\'}).join("");'
    + 'if(FD)chips=\'<button class="ch on" data-d="\'+FD+\'">\'+deptName(FD)+\' ✕</button>\'+chips;'
    + 'document.getElementById("fx").innerHTML=chips;'
    + 'bind("#fx .ch",function(el){var d=el.getAttribute("data-d");if(d)pick(d);else setF(el.getAttribute("data-f"))});'
    + 'var list=ALL.filter(mt),ph="",seen={};'
    + 'list.filter(function(t){return t.project}).forEach(function(t){if(seen[t.project])return;seen[t.project]=1;'
    + 'var st=ALL.filter(function(x){return x.project==t.project}).sort(function(a,b){return a.step-b.step});'
    + 'var dn=st.filter(done).length,pc=Math.round(dn/st.length*100);'
    + 'ph+=\'<div class="prj"><h3>📁 \'+E(t.projectTitle||t.project)+\'</h3><div class="mt">\'+E(t.project)+\' · \'+dn+\'/\'+st.length+\' เสร็จ</div>\'+'
    + '\'<div class="bar"><i style="width:\'+pc+\'%"></i></div>\'+st.map(function(s){var ic=done(s)?"✅":(s.status=="กำลังทำ (AI)"?"⚙️":(s.status=="รอข้อมูล"?"⏸️":(s.status=="รออนุมัติ"?"📝":"⏳")));'
    + 'return \'<div class="sub"><span>\'+ic+\'</span><span><b>\'+s.step+\'.</b> \'+E(s.detail)+\' <span style="color:#7A8A9B">— \'+E(s.dept||s.assignee)+\' · \'+E(s.status)+(s.startedAt?\' · เริ่ม \'+E(s.startedAt):"")+(s.doneAt?\' · เสร็จ \'+E(s.doneAt):"")+\'</span>\'+(s.blocked?\'<br><span style="color:#C8842A;font-size:.75rem">\'+E(s.blocked)+\'</span>\':"")'
    + '+(done(s)?"":\'<div class="act"><button class="bt run" data-run="\'+E(s.ref)+\'">⚡ เริ่มทันที</button><button class="bt cancel" data-cancel="\'+E(s.ref)+\'">✕ ยกเลิก</button></div>\')+\'</span></div>\'}).join("")+\'</div>\'});'
    + 'document.getElementById("pj").innerHTML=ph;'
    + 'var solo=list.filter(function(t){return !t.project});'
    + 'var ord={"ด่วนมาก":0,"ปกติ":1,"ไม่เร่ง":2};solo.sort(function(a,b){return (ord[a.urgency]==null?1:ord[a.urgency])-(ord[b.urgency]==null?1:ord[b.urgency])});'
    + 'document.getElementById("ex").style.display=(list.length?"none":"block");'
    + 'document.getElementById("cx").innerHTML=solo.map(function(t){var u=t.urgency=="ด่วนมาก"?"u":(t.urgency=="ไม่เร่ง"?"l":"n");'
    + 'var ub=t.urgency=="ด่วนมาก"?"background:#FBE9E7;color:#C0392B":(t.urgency=="ไม่เร่ง"?"background:#E8F5EC;color:#3D9970":"background:#FFF3E0;color:#C8842A");'
    + 'return \'<div class="cd \'+u+\'"><div style="display:flex;justify-content:space-between;gap:6px"><span class="rf">#\'+E(t.ref)+\'</span>\'+'
    + '\'<span><span class="bg" style="\'+ub+\'">\'+E(t.urgency||"ปกติ")+\'</span> <span class="bg" style="background:#EAF0F7;color:#1B3558">\'+E(t.status)+\'</span></span></div>\'+'
    + '\'<div class="dt">\'+E(t.detail)+\'</div><div class="mt">\'+(t.biz?"<span>🏢 "+E(t.biz)+"</span>":"")+(t.dept?"<span>🤖 "+E(t.dept)+"</span>":"")+(t.due?"<span>⏳ "+E(t.due)+"</span>":"")+\'</div>\'+'
    + '\'<div class="mt tl">\'+(t.time?"<span>📥 รับ "+E(t.time)+"</span>":"")+(t.status=="รอทีม AI"?\'<span style="color:#C8842A">⏰ คิวเริ่ม \'+E(NEXT)+\'</span>\':"")+(t.startedAt?"<span>⚙️ เริ่ม "+E(t.startedAt)+"</span>":"")+(t.doneAt?"<span>✅ เสร็จ "+E(t.doneAt)+"</span>":"")+\'</div>\'+'
    + '(t.result?\'<div class="rs">💬 \'+E(String(t.result).slice(0,300))+\'</div>\':"")'
    + '+(done(t)?"":\'<div class="act"><button class="bt run" data-run="\'+E(t.ref)+\'">⚡ เริ่มทันที</button><button class="bt cancel" data-cancel="\'+E(t.ref)+\'">✕ ยกเลิก</button></div>\')'
    + '+\'</div>\'}).join("");'
    + 'bindActions()}',

    // ป๊อปอัปแจ้งผลมุมล่าง (หายเองใน 4 วิ)
    'function toast(msg,ok){var t=document.createElement("div");t.className="toast"+(ok?"":" warn");'
    + 't.textContent=(ok?"✅ ":"⚠️ ")+msg;document.body.appendChild(t);'
    + 'setTimeout(function(){t.style.opacity="0"},3400);setTimeout(function(){t.remove()},4000)}',
    // ปุ่ม: ยืนยันก่อน → ยิง fetch อยู่หน้าเดิม → อัปเดตการ์ดทันที + ป๊อปอัปแจ้งผล
    'function go(a,r){fetch(BASE+"?action=boardDo&key="+encodeURIComponent(KEY)+"&do="+a+"&ref="+encodeURIComponent(r))'
    + '.then(function(x){return x.json()}).then(function(j){toast(j.msg,j.ok);'
    + 'if(j.ok){ALL.forEach(function(t){if(t.ref==r){if(a=="cancel")t.status="ยกเลิก";if(a=="runnow")t.status="รอทีม AI"}});render()}})'
    + '.catch(function(){toast("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งนะคะ",false)})}',
    'function bindActions(){'
    + 'bind("#cx [data-cancel],#pj [data-cancel]",function(el){var r=el.getAttribute("data-cancel");'
    + 'if(confirm("ยืนยันยกเลิกงาน #"+r+" ?\\n\\nงานนี้จะถูกปิดและทีม AI จะไม่ทำต่อ"))go("cancel",r)});'
    + 'bind("#cx [data-run],#pj [data-run]",function(el){var r=el.getAttribute("data-run");'
    + 'if(confirm("ให้ทีม AI เริ่มทำงาน #"+r+" ทันทีเลยไหม ?\\n\\nไม่ต้องรอรอบ "+NEXT))go("runnow",r)})}',
    'if(NOTICE){var pr=NOTICE.split("|");toast(pr.slice(1).join("|"),pr[0]=="✅")}',
    'document.getElementById("up").textContent="อัปเดต "+new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});',
    'render();setTimeout(function(){location.reload()},120000);'
  ].join('\n');
}

// ════════════════════════════════════════════════════════════
//  📁 โปรเจกต์ = งานหลัก + งานย่อย (เสนอแผน → คุณปาล์มอนุมัติ → ทีมลงมือ)
// ════════════════════════════════════════════════════════════
function reqSheet() {
  const id = boardSheetId();
  if (!id) return null;
  const ss = ssById(id);
  let sheet = ss.getSheetByName('Requests');
  if (!sheet) {
    sheet = ss.insertSheet('Requests');
    sheet.appendRow(['เลขงาน', 'เวลาที่ส่ง', 'สถานะ', 'ความเร่งด่วน', 'ธุรกิจ', 'ประเภท', 'ผู้ฝาก',
                     'ติดต่อ', 'รายละเอียด', 'กำหนดเสร็จ', 'ลิงก์รูป', 'ผู้รับผิดชอบ', 'ผลงาน', 'แผนก',
                     'โปรเจกต์', 'ลำดับ', 'ชื่อโปรเจกต์', 'ติดขัด', 'โน้ตจากเจ้าของ', 'เริ่มทำเมื่อ', 'เสร็จเมื่อ']);
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
  const mApprove = t.match(/^อนุมัติ\s*((?:PRJ|REQ)[\w.-]+)?\s*$/i) || t.match(/^(?:อนุมัติ|ok|โอเค|เอาเลย)\s+((?:PRJ|REQ)[\w.-]+)\s*$/i);
  const mRevise  = t.match(/^(?:แก้|ปรับ|แก้ไข)\s*((?:PRJ|REQ)[\w.-]+)\s*[:：]?\s*([\s\S]*)$/i);
  const mCancel  = t.match(/^ยกเลิก\s*((?:PRJ|REQ)[\w.-]+)?\s*$/i);
  if (!mApprove && !mRevise && !mCancel) return false;

  const pid = (mApprove && mApprove[1]) || (mRevise && mRevise[1]) || (mCancel && mCancel[1]) || latestPendingProject();
  if (!pid) { lineReply(replyToken, 'ตอนนี้ไม่มีงานหรือแผนงานที่รออนุมัติอยู่ค่ะ'); return true; }

  // งานเดี่ยว (REQ) — อนุมัติทีละงาน ไม่ใช่ทั้งโปรเจกต์
  if (/^REQ/i.test(pid)) {
    const sheet = reqSheet();
    const row = sheet ? findRefRow(sheet, pid) : 0;
    if (!row) { lineReply(replyToken, 'ไม่พบงาน ' + pid + ' ค่ะ'); return true; }
    if (String(sheet.getRange(row, 3).getValue()) !== 'รออนุมัติ') {
      lineReply(replyToken, 'งาน ' + pid + ' ไม่ได้อยู่ในสถานะรออนุมัติค่ะ (ตอนนี้: ' + sheet.getRange(row, 3).getValue() + ')');
      return true;
    }
    if (mCancel) {
      sheet.getRange(row, 3).setValue('ยกเลิก');
      sheet.getRange(row, 21).setValue(new Date());
      lineReply(replyToken, 'ยกเลิกงาน ' + pid + ' ให้แล้วค่ะ');
      return true;
    }
    if (mRevise) {
      const note = (mRevise[2] || '').trim();
      appendTaskNote(sheet, row, note);
      lineReply(replyToken, 'รับทราบค่ะ จดไว้แล้ว:\n"' + note + '"\n'
        + 'พิมพ์ "อนุมัติ ' + pid + '" เมื่อพร้อมให้ทีมเริ่มได้เลยค่ะ');
      return true;
    }
    const isAI = String(sheet.getRange(row, 12).getValue()) === 'ทีมAI';
    sheet.getRange(row, 3).setValue(isAI ? 'รอทีม AI' : 'ใหม่');
    lineReply(replyToken, '✅ อนุมัติแล้วค่ะ ' + pid
      + (isAI ? ' — ส่งเข้าคิวทีม AI แล้ว จะเริ่มทำรอบถัดไป (หรือกด "เริ่มทันที" บนบอร์ดก็ได้ค่ะ)' : ' — ขึ้นบอร์ดให้แล้วนะคะ'));
    return true;
  }

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
    if (String(data[i][2]) !== 'รออนุมัติ') continue;
    return String(data[i][14] || data[i][0]);   // อยู่ในโปรเจกต์ → คืนเลขโปรเจกต์, ไม่งั้นคืนเลขงานเดี่ยว
  }
  return '';
}

// จดโน้ตของเจ้าของลงงานเดี่ยว
function appendTaskNote(sheet, row, note) {
  if (sheet.getRange(1, 19).getValue() !== 'โน้ตจากเจ้าของ') sheet.getRange(1, 19).setValue('โน้ตจากเจ้าของ');
  const cur = String(sheet.getRange(row, 19).getValue() || '');
  sheet.getRange(row, 19).setValue((cur ? cur + ' | ' : '') + note);
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
  const ss = ssById(id);
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
    const ss = ssById(id);
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
    const ss = ssById(id);
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
// ⚡ แคชข้อความที่เปลี่ยนไม่บ่อย (ข้อมูลโรงงาน / Playbook) ไว้ 30 นาที
function cachedText(key, ttlSec, producer) {
  try {
    const c = CacheService.getScriptCache();
    const hit = c.get(key);
    if (hit !== null) return hit === ' ' ? '' : hit;
    const val = String(producer() || '');
    c.put(key, val === '' ? ' ' : val, ttlSec);
    return val;
  } catch (e) { return String(producer() || ''); }
}

// เรียกใช้ตัวนี้ในงานปกติ (อ่านจากแคช) — ถ้าแก้ชีตแล้วอยากให้เห็นทันที ให้รัน clearCache()
function loadKBCached() { return cachedText('KB_V1', 1800, loadKB); }
function loadPlaybookCached() { return cachedText('PB_V1', 1800, loadPlaybook); }

function clearCache() {
  CacheService.getScriptCache().removeAll(['KB_V1', 'PB_V1']);
  return 'ล้างแคชแล้ว';
}

function loadPlaybook() {
  try {
    const id = boardSheetId(); if (!id) return '';
    const ss = ssById(id);
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

// งานที่ขึ้น "กำลังทำ (AI)" นานเกินกี่นาที ถือว่ารอบนั้นตายกลางทาง → ดึงกลับเข้าคิว
const STALE_MIN = 30;

// กู้งานค้าง: ถ้ารอบทำงานตายกลางคัน (session หมดเวลา/เน็ตหลุด/โควตาหมด) งานจะค้าง
// สถานะ "กำลังทำ (AI)" ตลอดไป เพราะคิวหยิบเฉพาะ "รอทีม AI" — และโปรเจกต์จะค้างตามไปด้วย
function recoverStuckTasks(sheet, data) {
  const now = Date.now();
  const revived = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]) !== 'กำลังทำ (AI)') continue;
    const sAt = data[i][19];
    const ms = (sAt instanceof Date) ? (now - sAt.getTime()) : Infinity; // ไม่มีเวลาเริ่ม = ของเก่า ให้กู้เลย
    if (ms > STALE_MIN * 60000) {
      sheet.getRange(i + 1, 3).setValue('รอทีม AI');
      data[i][2] = 'รอทีม AI';
      revived.push(String(data[i][0]));
    }
  }
  if (revived.length) logRow(['กู้งานค้าง', '', revived.join(','), 'ค้างเกิน ' + STALE_MIN + ' นาที → กลับเข้าคิว']);
  return revived;
}

// คืนงานที่สถานะ "รอทีม AI" (ให้ Claude Code ดึงไปทำ)
function getAIQueue() {
  const id = boardSheetId();
  if (!id) return [];
  try {
    const ss = ssById(id);
    const sheet = ss.getSheetByName('Requests');
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    recoverStuckTasks(sheet, data);   // ดึงงานที่ค้างจากรอบก่อนกลับเข้าคิวก่อนเสมอ
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

// ⚡ หาแถวของเลขงาน โดยอ่านแค่คอลัมน์ A (ไม่ลากทั้งชีต)
function findRefRow(sheet, ref) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const refs = sheet.getRange(2, 1, last - 1, 1).getValues();
  const target = String(ref);
  for (let i = 0; i < refs.length; i++) if (String(refs[i][0]) === target) return i + 2;
  return 0;
}

// ตรวจว่ามีหัวคอลัมน์เวลาเริ่ม/เวลาเสร็จแล้ว (คอลัมน์ T, U)
function ensureTimeCols(sheet) {
  const h = sheet.getRange(1, 13, 1, 9).getValues()[0]; // M..U
  if (h[0] !== 'ผลงาน') sheet.getRange(1, 13).setValue('ผลงาน');
  if (h[1] !== 'แผนก') sheet.getRange(1, 14).setValue('แผนก');
  if (h[7] !== 'เริ่มทำเมื่อ') sheet.getRange(1, 20).setValue('เริ่มทำเมื่อ');
  if (h[8] !== 'เสร็จเมื่อ') sheet.getRange(1, 21).setValue('เสร็จเมื่อ');
}

// ทีม AI "เช็คอิน" ก่อนเริ่มทำงาน → สถานะ "กำลังทำ (AI)" + บันทึกแผนก (บอร์ดเห็นสดๆ)
function handleStartTask(body) {
  if (body.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, error: 'unauthorized' });
  const id = boardSheetId();
  if (!id) return jsonOut({ ok: false, error: 'no sheet' });
  const ss = ssById(id);
  const sheet = ss.getSheetByName('Requests');
  if (!sheet) return jsonOut({ ok: false, error: 'no board' });
  const row = findRefRow(sheet, body.ref);
  if (!row) return jsonOut({ ok: false, error: 'ref not found' });
  ensureTimeCols(sheet);
  sheet.getRange(row, 3).setValue('กำลังทำ (AI)');
  if (body.dept) sheet.getRange(row, 14).setValue(String(body.dept));
  sheet.getRange(row, 20).setValue(new Date());   // ⏱️ เริ่มทำเมื่อ
  return jsonOut({ ok: true });
}

// ทีม AI ส่งผลงานกลับมาปิดงาน → อัปเดตสถานะ + แจ้งคุณปาล์ม
function handleCompleteTask(body) {
  if (body.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, error: 'unauthorized' });
  const id = boardSheetId();
  if (!id) return jsonOut({ ok: false, error: 'no sheet' });
  const ss = ssById(id);
  const sheet = ss.getSheetByName('Requests');
  if (!sheet) return jsonOut({ ok: false, error: 'no board' });

  const row = findRefRow(sheet, body.ref);
  if (!row) return jsonOut({ ok: false, error: 'ref not found' });
  ensureTimeCols(sheet);
  sheet.getRange(row, 3).setValue('เสร็จ (AI)');       // สถานะ
  sheet.getRange(row, 13).setValue(String(body.result || '').slice(0, 5000));
  sheet.getRange(row, 21).setValue(new Date());       // ⏱️ เสร็จเมื่อ
  const pid = String(sheet.getRange(row, 15).getValue() || '');
  const owner = cfg('OWNER_LINE_USER_ID');
  if (owner) linePush(owner, '✅ ทีม AI ทำงาน #' + body.ref + ' เสร็จแล้วค่ะ\n' + String(body.result || '').slice(0, 500));
  if (pid) advanceProject(pid); // ปลดล็อกงานย่อยขั้นถัดไป
  return jsonOut({ ok: true });
}

// ════════════════════════════════════════════════════════════
//  ความจำบทสนทนา (เก็บ 10 ข้อความล่าสุดต่อคน ในแท็บ Memory)
// ════════════════════════════════════════════════════════════
const MEM_MAX = 6; // จำนวนข้อความล่าสุดที่เก็บ (user+assistant นับรวมกัน) — ลดจาก 10 เพื่อประหยัด token

function memSheet() {
  const id = boardSheetId();
  if (!id) return null;
  const ss = ssById(id);
  let s = ss.getSheetByName('Memory');
  if (!s) {
    s = ss.insertSheet('Memory');
    s.appendRow(['userId', 'history(json)', 'updatedAt']);
  }
  return s;
}

// หาแถวของ userId โดยอ่านแค่คอลัมน์ A (ไม่ลากคอลัมน์ history ที่ยาวมาทั้งชีต)
function memFindRow(sheet, userId) {
  const n = sheet.getLastRow();
  if (n < 2) return 0;
  const ids = sheet.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === userId) return i + 2;
  return 0;
}

function memGet(userId) {
  if (!userId) return [];
  try {
    const sheet = memSheet();
    if (!sheet) return [];
    const row = memFindRow(sheet, userId);
    if (!row) return [];
    try { return JSON.parse(sheet.getRange(row, 2).getValue()) || []; } catch (e) { return []; }
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
    const row = memFindRow(sheet, userId);           // หาแถวครั้งเดียว ใช้ทั้งอ่านและเขียน
    let history = [];
    if (row) { try { history = JSON.parse(sheet.getRange(row, 2).getValue()) || []; } catch (e) { history = []; } }
    history.push({ role: 'user', content: userText });
    history.push({ role: 'assistant', content: assistantText });
    history = history.slice(-MEM_MAX);
    const json = JSON.stringify(history);
    if (row) sheet.getRange(row, 2, 1, 2).setValues([[json, new Date()]]);  // เขียนทีเดียว 2 ช่อง
    else sheet.appendRow([userId, json, new Date()]);
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

// ════════════════════════════════════════════════════════════
//  ⏱️ วัดความเร็ว — รันใน editor แล้วดู Execution log ว่าขั้นไหนช้า (หน่วย: มิลลิวินาที)
// ════════════════════════════════════════════════════════════
function speedTest() {
  const t = [];
  let m = Date.now();
  function mark(name) { t.push(name + ': ' + (Date.now() - m) + ' ms'); m = Date.now(); }

  ssById(boardSheetId());        mark('เปิด Spreadsheet ครั้งแรก');
  ssById(boardSheetId());        mark('เปิดซ้ำ (ควรใกล้ 0 = แคชทำงาน)');
  clearCache();                  mark('ล้างแคช');
  loadKBCached();                mark('โหลดข้อมูลโรงงาน (ครั้งแรก)');
  loadKBCached();                mark('โหลดข้อมูลโรงงาน (จากแคช)');
  loadPlaybookCached();          mark('โหลด Playbook (ครั้งแรก)');
  loadPlaybookCached();          mark('โหลด Playbook (จากแคช)');
  const board = readBoardAll();  mark('อ่านบอร์ด ' + board.length + ' งาน');
  getAIQueue();                  mark('อ่านคิวทีม AI');
  memGet('speedtest-user');      mark('อ่านความจำ');
  boardHtml(cfg('QUEUE_KEY'));   mark('สร้างหน้าบอร์ด HTML');
  askClaude('ทดสอบความเร็ว ตอบสั้นๆ ว่า ok'); mark('เรียก Claude API');

  const out = t.join('\n');
  Logger.log(out);
  return out;
}

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
// "claude-haiku-4-5" = ถูก+เร็ว | "claude-sonnet-5" = ฉลาดกว่า (ใช้อยู่ — ต้องตีความคำสั่งกำกวม/ตัดสินใจถามหรือลุยเลย)
const MODEL = 'claude-sonnet-5';

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
  'ห้ามกุข้อมูลระบบ: รายชื่อกลุ่มที่อยู่ สถานะระบบ คิวงาน — ระบบตอบเองเมื่อถูกถาม',
  'ถ้าผู้ใช้ถามเรื่องพวกนี้แล้วมาถึงคุณ แปลว่าระบบไม่มีข้อมูล ให้ตอบว่าไม่ทราบและแนะนำคำสั่ง เช่น "รายชื่อกลุ่ม" "เช็คระบบ"',
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
  'งานใหญ่ = ชี้ว่าเป็นงานหลายขั้น (สำคัญมาก): ถ้างานต้องทำหลายขั้นตอนหรือใช้หลายแผนกกว่าจะเสร็จ',
  '(เช่น "ทำนามบัตรทีมขาย" = รวบรวมรายชื่อ→ออกแบบ→เลือกแบบ→พิมพ์, "เปิดเมนูใหม่", "จัดโปรโมชั่น", "ทำระบบ...")',
  'คุณไม่ต้องออกแบบขั้นตอนเอง — แค่ใส่ "multiStep":true ในบล็อก TASK ตามปกติ',
  'ระบบจะส่งต่อให้นักวางแผนร่างขั้นตอนแล้วเสนอคุณปาล์มอนุมัติเอง',
  'ตอบผู้ส่งว่า "รับเรื่องแล้ว กำลังร่างแผนงานเสนอคุณปาล์มค่ะ" อย่ารับปากว่าจะเริ่มทำเลย',
  'สัญญาณว่าเป็นงานหลายขั้น: มีของต้องผลิต/พิมพ์/ติดตั้ง, ต้องรวบรวมข้อมูลก่อนแล้วค่อยทำ,',
  'ต้องมีคนเลือก/ตัดสินใจกลางทาง, หรือเดาได้ว่าแผนกเดียวทำไม่จบ — ถ้าลังเลให้ถือว่าใช่ (multiStep:true)',
  'กติกาช่อง assignee:',
  '- "เลขา" = งานเบาที่คุณทำเสร็จให้แล้วในคำตอบนี้ (ไม่ต้องมีใครทำต่อ)',
  '- "ทีมAI" = งานหนักที่ต้องใช้ AI ทำต่อ เช่น วิเคราะห์ยอดขายเชิงลึก ทำสไลด์ เขียนโค้ด ค้นข้อมูลเชิงลึก ร่างเอกสารยาว',
  '- "คน" = งานที่คนต้องลงมือ เช่น ส่งของ ซ่อมเครื่อง ซื้อของ ประสานงานนอกสถานที่',
  'ถ้าเป็นแค่คำถาม/คุยเล่น/ยังฝากไม่ครบ ไม่ต้องใส่บล็อกนี้',
  '',
  '➕ ห้ามเปิดงานซ้ำ (สำคัญมาก): ก่อนใส่ TASK ให้เช็คก่อนว่าเรื่องนี้เป็น "ข้อมูลเพิ่ม/เงื่อนไข/ไฟล์ประกอบ',
  'ของงานที่เปิดไว้แล้ว" หรือเปล่า — ถ้าใช่และรู้เลขงานจากบริบท (#REQ...) ให้ใช้บล็อกนี้แทน TASK:',
  '[[ADDNOTE]]{"ref":"REQ260813-4785","note":"ข้อมูลที่จะแนบเข้างานเดิม"}[[/ADDNOTE]]',
  'ระบบจะต่อข้อมูลเข้าใบงานเดิมให้ ทีมที่รับงานนั้นเห็นเองอัตโนมัติ — เปิด TASK ใหม่เฉพาะงานคนละชิ้นจริงๆ เท่านั้น',
  '',
  'ส่งเรื่องถึงคุณปาล์ม: เมื่อข้อความเป็น (ก) ข้อเสนอที่ต้องให้คุณปาล์มตัดสินใจ เช่น ขอลดราคา/ส่วนลด/ดีล/ข้อเสนอพิเศษ',
  '(ข) การทวงงาน/ตามงานที่ค้าง หรือ (ค) เรื่องด่วนที่เจ้าของควรรู้ทันที',
  'ให้ตอบผู้ส่งอย่างสุภาพว่ารับเรื่องและจะเรียนคุณปาล์มให้ (อย่าตัดสินใจแทน) แล้วต่อท้ายบล็อกนี้ (ผู้ใช้ไม่เห็น):',
  '[[ALERT]]{"reason":"ประเภทสั้นๆ เช่น ขอลดราคา|ทวงงาน|ข้อเสนอ|ด่วน","summary":"สรุปสั้นๆ ให้คุณปาล์มเข้าใจใน 1 บรรทัด"}[[/ALERT]]',
  'ใช้ ALERT เท่าที่จำเป็นจริงๆ อย่าเด้งพร่ำเพรื่อ',
  '',
  '🛠️ การรับ Feedback ระบบ/แอป (ทำแทนคุณปาล์มได้เลย — สำคัญ):',
  'เมื่อทีมงานแจ้งปัญหา/ติดขัด/ข้อเสนอเกี่ยวกับระบบหรือแอป (เช่น "อันนี้ยังไม่ได้", "ไม่ขึ้น", "กดแล้วไม่เซฟ", "น่าจะมีปุ่ม...")',
  'ให้ทำตัวเหมือนคุณปาล์มตอนรับฟีดแบ็ก:',
  '1) อย่าเพิ่งรีบจดลงบอร์ด — ถ้าอาการยังกำกวม ให้ "ถามเจาะกลับพร้อมสมมติฐาน" ให้เลือกง่ายๆ ก่อน',
  '   เช่น "ไม่ได้ คือข้อมูลไม่ซิงก์กัน หรือกดบันทึกแล้วไม่เซฟคะ?" / "เกิดที่หน้าจอไหน เครื่อง PC หรือแอปทีมเซลล์คะ?"',
  '   ถามทีละ 1-2 คำถามที่ตรงจุดที่สุด อย่าถามรัวเป็นแบบสอบถาม',
  '2) เก็บให้ครบก่อนสรุป: ใคร | แอป/หน้าจอไหน | ทำอะไรอยู่ตอนเกิด | คาดหวังอะไร vs ได้อะไร | มีรูปประกอบไหม',
  '3) พอชัดแล้ว → ทวนอาการสั้นๆ ให้ผู้แจ้งยืนยัน แล้วบันทึกด้วยบล็อก TASK: type="ฟีดแบ็กระบบ" dept="coder" assignee="ทีมAI"',
  '   detail ต้องละเอียดพอที่ช่างจะทำตามซ้ำได้ (อาการ+ขั้นตอน+หน้าจอ+ผู้แจ้ง) และใส่ comment ความเห็นของคุณเสมอ',
  '4) ตอบผู้แจ้งว่า "รับเรื่องแล้ว จะเสนอคุณปาล์มพิจารณาค่ะ" — ห้ามรับปากว่าจะแก้ได้/แก้เมื่อไหร่',
  '   ถ้าปัญหาทำให้ทำงานต่อไม่ได้เลย (งานสะดุดทั้งทีม) → ใส่ urgency="ด่วนมาก" + ALERT ถึงคุณปาล์มด้วย',
  '5) ถ้าเป็นแค่คำถามวิธีใช้ (ไม่ใช่บั๊ก) แล้วคุณรู้คำตอบจากบริบท → ตอบเลย ไม่ต้องลงบอร์ด',
  '',
  'ส่งข้อความเข้ากลุ่ม (เฉพาะเมื่อคุณปาล์มสั่ง): ถ้าคุณปาล์มสั่งให้ประกาศ/ส่งข้อความไปกลุ่มอื่น',
  'เช่น "บอกในกลุ่มคาเฟ่ว่า...", "แจ้งทีมเซลล์ว่า..." ให้ตอบรับ แล้วต่อท้ายบล็อกนี้ (ผู้ใช้ไม่เห็น):',
  '[[SENDGROUP]]{"target":"<ชื่อกลุ่มตามที่คุณปาล์มพูด>","message":"ข้อความที่จะส่งเข้ากลุ่ม"}[[/SENDGROUP]]',
  'target: ใส่ชื่อกลุ่มตามที่คุณปาล์มเรียกได้เลย (เช่น "ทดสอบเลขา", "คาเฟ่", "ทีมเซลล์") ระบบจะหากลุ่มที่ดิฉันอยู่ให้เอง',
  '⚠️ SENDGROUP = ส่งออกทันทีเท่านั้น! ถ้าคุณปาล์มระบุเวลาส่ง ให้ใช้บล็อก SCHEDULE แทน (ผู้ใช้ไม่เห็น):',
  '[[SCHEDULE]]{"target":"<ชื่อกลุ่ม>","when":"<เวลา เช่น พรุ่งนี้ 8 โมงครึ่ง | วันนี้ 18:00 | อีก 2 ชั่วโมง>","message":"ข้อความเต็มที่จะส่ง","replace":false}[[/SCHEDULE]]',
  'SCHEDULE ใช้ได้ทั้งตั้งประกาศใหม่ และแก้ประกาศที่ตั้งค้างไว้ — ถ้าคุณปาล์มขอแก้เนื้อหา/เวลาของประกาศเดิม ใส่ "replace":true (= แทนที่ประกาศค้างล่าสุดของกลุ่มนั้น)',
  'สั่งหลายกลุ่มพร้อมกัน: ใส่หลายบล็อกได้เลย (SENDGROUP/SCHEDULE บล็อกละกลุ่ม) ห้ามทำแค่กลุ่มเดียวแล้วปล่อยกลุ่มที่เหลือหาย',
  'ตอบรับสั้นๆ พอ ระบบจะต่อท้ายผลการส่ง/ตั้งเวลาให้เอง — ห้ามเคลมเองว่าส่ง/ตั้งเสร็จแล้ว',
  '',
  '📝 หลักการทำประกาศ (นโยบายคุณปาล์ม — สำคัญมาก):',
  '1) อ่านคำสั่งแล้ว "ประเมินเจตนา" ก่อนเสมอว่าคุณปาล์มต้องการอะไร อย่าทำตามตัวอักษรดิบๆ',
  '2) เนื้อหาประกาศต้อง "เรียบเรียงใหม่เป็นภาษาของดิฉันเอง" สุภาพ น่ารัก อ่อนน้อม แบบเลขามือโปรเสมอ',
  '   ห้ามก็อปคำพูดคุณปาล์มไปส่งตรงๆ เด็ดขาด — แต่ใจความ ตัวเลข วันเวลา ชื่อ และลิงก์ที่ให้มา ต้องครบไม่เพี้ยน',
  '   และห้ามเติมข้อมูล/ลิงก์/คำเคลมที่เขาไม่ได้ให้มา | ยกเว้นสั่งว่า "ตามนี้เป๊ะๆ/ห้ามแก้คำ" → ใช้ข้อความเดิมทั้งดุ้น',
  '3) ไม่ระบุเวลาส่ง หรือบอก "ตอนนี้/เดี๋ยวนี้" = ส่งทันที (SENDGROUP) | ระบุเวลา = ตั้งเวลา (SCHEDULE)',
  '4) เรื่องใหม่/เรื่องสำคัญ หรือไม่มั่นใจว่าสำนวนเหมาะไหม → ร่างข้อความให้ดูก่อน แล้วถามสั้นๆ ว่า "ส่งแบบนี้เลยไหมคะ"',
  '   รอคุณปาล์มยืนยันค่อยส่ง | แต่ถ้าเป็นแพตเทิร์นเดิมที่เคยทำ/แนวที่คุณปาล์มเคยโอเคไปแล้ว → ทำต่อเองเลย ไม่ต้องถามซ้ำ',
  '5) อ่านแล้วงง ไม่เข้าใจความหมายของคำสั่งหรือเนื้อหา → ถามกลับสั้นๆ ตรงจุดก่อน อย่าเดามั่วแล้วส่งออก',
  '',
  '💡 บอร์ดไอเดีย (เฉพาะคุณปาล์ม): คุณปาล์มเป็นคนไอเดียฟุ้งเยอะและไว — หน้าที่คุณคือ "รับลูกให้ทัน" ไม่ให้ไอเดียหล่นหาย',
  'ถ้าคุณปาล์มเล่าไอเดียใหม่ลอยๆ (ยังไม่ได้สั่งให้ลงมือทำตอนนี้ เช่น "ว่าจะ...", "คิดว่าน่าจะลอง...", "มีไอเดียว่า...")',
  'ให้ตอบรับสั้นๆ + ความเห็นแวบเดียว แล้วต่อท้ายบล็อกนี้ (ผู้ใช้ไม่เห็น):',
  '[[IDEA]]{"idea":"สรุปไอเดียกระชับแต่ครบใจความ","biz":"โรงน้ำ|คาเฟ่|กลาง","take":"ความเห็นสั้นๆ: น่าทำแค่ไหน ใช้แผนกไหน ก้าวแรกคืออะไร"}[[/IDEA]]',
  'ระบบจะแปะขึ้นบอร์ดไอเดียให้เอง — ห้ามเปิดเป็นงาน/แผนทันที รอคุณปาล์มสั่ง "ทำไอเดีย <เลข>" ก่อน',
  'ถ้าเป็นคำสั่งให้ทำเลย (ไม่ใช่ไอเดียลอยๆ) → ใช้ TASK ตามปกติ ไม่ต้องใช้ IDEA | ถ้าก้ำกึ่งให้ถามสั้นๆ ว่า "แปะบอร์ดไอเดียไว้ก่อน หรือให้เริ่มเลยคะ?"',
  '',
  '🚫 กฎเหล็กเรื่องความจริง:',
  '- ห้ามแต่งลิงก์/URL ขึ้นเองเด็ดขาด ใช้ได้เฉพาะลิงก์ที่ระบบให้ไว้ในบริบทเท่านั้น ถ้าไม่มีให้บอกตรงๆ ว่ายังไม่มีลิงก์',
  '- ห้ามเคลมว่าระบบ/แอป/งานใด "เสร็จแล้ว" หรือ "พร้อมใช้" ถ้าไม่มีข้อมูลยืนยันในบริบท — ยิ่งในข้อความที่จะส่งถึงพนักงาน ยิ่งห้ามเด็ดขาด',
  '- ถ้ากำลังคุยเรื่องประกาศ/งานที่ค้างอยู่ ให้ตีความข้อความถัดไปตามบริบทเดิมก่อน อย่ารีบเปิดโปรเจกต์/แผนงานใหม่ ถ้าไม่แน่ใจให้ถามสั้นๆ ก่อน',
  '- ก่อนจะตอบว่า "ยังไม่เห็น/ไม่มีข้อมูล" หรือขอข้อมูลจากคุณปาล์ม ให้ย้อนอ่านประวัติบทสนทนาก่อนเสมอ —',
  '  สิ่งที่คุณเคยร่าง สรุป หรือตกลงกันไว้ในแชทนี้ (เช่น ร่างประกาศ เงื่อนไข ชื่อกลุ่มเป้าหมาย) ถือว่ามีอยู่แล้ว',
  '  ให้หยิบมาใช้ต่อทันที ห้ามถามซ้ำหรือทำเป็นไม่รู้จักสิ่งที่ตัวเองเพิ่งเขียน',
  '',
  'ความสามารถที่มี (บอกได้ถ้ามีคนถามว่าทำอะไรได้): รับฝากงานลงบอร์ด, ตอบเรื่องงานในบอร์ด,',
  'รับรูป/ไฟล์เก็บลง Drive แล้วแนบกับงาน, ตั้งเตือนความจำ ("เตือนฉันพรุ่งนี้ 9 โมง ..."),',
  'รับ Feedback ปัญหา/ข้อเสนอเรื่องระบบและแอป (ถามอาการให้ชัดแล้วส่งต่อคุณปาล์ม),',
  'ประกาศเข้ากลุ่มไลน์ตามชื่อกลุ่ม, สรุปแชทในกลุ่ม, ตามงานค้างให้ทุกเย็น',
  'บอร์ดไอเดีย: "ไอเดีย <ข้อความ>" แปะทันที, "ดูไอเดีย", "ทำไอเดีย <เลข>", "พับไอเดีย <เลข>"',
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
    // LINE ส่งรูปกับข้อความมาเป็นคนละ event แต่มาใน webhook ก้อนเดียวกัน
    // เก็บข้อความในก้อนนี้ไว้ก่อน เพื่อให้ตอนวิเคราะห์รูปรู้ว่าคนส่ง "พิมพ์อะไรมาพร้อมรูป"
    stashBatchCaptions(body.events || []);
    // ช่องเชื่อมกับทีม AI ใน Claude Code: ส่งผลงานกลับมาปิดงาน
    if (body.action === 'completeTask') return handleCompleteTask(body);
    if (body.action === 'startTask') return handleStartTask(body);
    if (body.action === 'askInfo') return handleAskInfo(body);
    // ฟอร์มฝากงาน (request.html) — เขียนลงชีตตรง ๆ ไม่เรียก Claude = ไม่กิน token
    if (body.action === 'submitRequest') return handleSubmitRequest(body);
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
  // เพิ่มงานจากบอร์ด (สำรองของ google.script.run)
  if (p.action === 'addTask') {
    if (p.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, msg: 'รหัสไม่ถูกต้อง' });
    return jsonOut(rpcAddTask(p.key, {
      biz: p.biz, type: p.type, detail: p.detail, urgency: p.urgency,
      due: p.due, assignee: p.assignee, dept: p.dept
    }));
  }
  // คอมเมนต์ปรับแผน (สำรองของ google.script.run)
  if (p.action === 'comment') {
    if (p.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, msg: 'รหัสไม่ถูกต้อง' });
    return jsonOut(rpcComment(p.key, p.ref, p.text, p.redo === '1'));
  }
  // แก้/ยกเลิกประกาศตั้งเวลาจากบอร์ด (สำรองของ google.script.run)
  if (p.action === 'schedDo') {
    if (p.key !== cfg('QUEUE_KEY')) return jsonOut({ ok: false, msg: 'รหัสไม่ถูกต้อง' });
    return jsonOut(rpcSchedAction(p.key, p['do'], p.row, p.when || '', p.content || ''));
  }
  // หน้าบอร์ดงาน เปิดจากมือถือได้เลย: ...exec?page=board&key=<QUEUE_KEY>
  if (p.page === 'board') {
    if (p.key !== cfg('QUEUE_KEY')) return HtmlService.createHtmlOutput('<h3>รหัสไม่ถูกต้องค่ะ</h3>');
    const notice = (p['do'] && p.ref) ? boardAction(p['do'], p.ref) : '';
    return HtmlService.createHtmlOutput(boardHtml(p.key, notice, p.prj || ''))
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

// ════════════════════════════════════════════════════════════
//  ⚡ ยิง Routine เมื่อ "มีงานเข้าคิว" แทนการตั้งเวลาถามทุกชั่วโมง
//  เดิม: 11 รอบ/วัน ส่วนใหญ่คิวว่าง = เผา token ฟรี
//  ใหม่: มีงานเมื่อไหร่ทำเมื่อนั้น + cron สำรองวันละ 2 รอบกันตกหล่น
// ════════════════════════════════════════════════════════════
const AUTO_FIRE_DEBOUNCE_SEC = 300;  // ฝากงานรัว ๆ ในช่วงนี้ = ยิงรอบเดียว
const AUTO_FIRE_DAILY_MAX = 20;      // เพดานกันลูป/กันบานปลาย

function autoFireCount(inc) {
  const key = 'AUTOFIRE_' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd');
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty(key) || 0);
  if (inc) props.setProperty(key, String(n + 1));
  return n;
}

// เรียกทุกจุดที่งานเปลี่ยนเป็น "รอทีม AI" — ตัดสินใจเองว่าจะยิงหรือข้าม
function maybeFireRoutine(reason) {
  try {
    if (!cfg('ROUTINE_FIRE_URL') || !cfg('ROUTINE_TOKEN')) return false;
    if (cfg('AUTO_FIRE') === 'off') return false;
    const cache = CacheService.getScriptCache();
    if (cache.get('autofire_lock')) return false;                  // เพิ่งยิงไป รอรอบนั้นทำก่อน
    if (autoFireCount(false) >= AUTO_FIRE_DAILY_MAX) {
      console.warn('autoFire: ถึงเพดานวันละ ' + AUTO_FIRE_DAILY_MAX + ' ครั้งแล้ว');
      return false;
    }
    cache.put('autofire_lock', '1', AUTO_FIRE_DEBOUNCE_SEC);
    autoFireCount(true);
    const r = fireRoutine('มีงานเข้าคิวใหม่ (' + (reason || '') + ') — ดึงคิวมาทำได้เลยค่ะ');
    logRow(['ยิงทีม AI อัตโนมัติ', '', reason || '', r.msg]);
    return r.ok;
  } catch (err) {
    console.error('maybeFireRoutine: ' + err);
    return false;
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

// หน้าต่างคุยต่อในกลุ่ม: ถ้าเลขาเพิ่งถามคำถามใครไป ให้คนนั้นตอบกลับได้เลย
// ภายใน 5 นาที โดยไม่ต้องพิมพ์ "เลขา" นำหน้า (ไม่งั้นบทสนทนารับ Feedback จะขาดตอน)
function markAwaitingReply(chatId, senderId, replyText) {
  try {
    if (!/\?|ไหมคะ|มั้ยคะ|หรือเปล่าคะ|รึเปล่าคะ|อะไรคะ|แบบไหน|อันไหน|ตรงไหน|หน้าจอไหน|เมื่อไหร่คะ|กี่โมงคะ/.test(String(replyText))) return;
    CacheService.getScriptCache().put('FU_' + chatId + '_' + senderId, '1', 300);
  } catch (e) {}
}
function isAwaitingReply(chatId, senderId) {
  try { return !!CacheService.getScriptCache().get('FU_' + chatId + '_' + senderId); } catch (e) { return false; }
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

  let text = String(ev.message.text || '').trim();   // let: "ทำไอเดีย N" จะถูกแปลงเป็นคำสั่งเต็มก่อนเข้าสมอง AI
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
  if (owner && /(รายชื่อกลุ่ม|กลุ่มไหนบ้าง|อยู่กลุ่มไหนบ้าง|รู้จักกลุ่มไหน)/i.test(text)) {
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
  // ยกเว้นเลขาเพิ่งถามคำถามคนนี้ค้างไว้ → ถือว่าข้อความนี้คือคำตอบ คุยต่อได้เลย
  if (inGroup && !isAddressedToSecretary(ev, text) && !isAwaitingReply(chatId, senderId)) {
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

  // 0.3) ขอสรุปแชทในกลุ่ม (พิมพ์ในกลุ่มนั้นเอง)
  if (inGroup && isChatSummaryRequest(text)) {
    const log = readGroupChat(chatId, 120);
    const q = 'นี่คือบทสนทนาล่าสุดในกลุ่มนี้ (เก่า→ใหม่):\n' + log
            + '\n\nคำขอ: ' + text + '\nช่วยสรุปให้กระชับแบบเลขามือโปร: ประเด็นสำคัญ / สิ่งที่ตกลงกัน / งานที่ต้องทำต่อและใครรับผิดชอบ';
    const reply = parseBlocks(askClaude(q, [])).reply;
    lineReply(replyToken, reply);
    logRow(['สรุปแชทกลุ่ม', senderId, text, reply]);
    return;
  }

  // 0.4) เจ้าของถามถึง "กลุ่ม" จากแชทเดี่ยว → ดึงล็อกแชทกลุ่มนั้นมาประกอบคำตอบ
  //      (ครอบทั้งถามข้อมูล "ผลิตได้กี่โหล" และสั่ง "สรุปแชทกลุ่ม...")
  let groupCtx = '';
  if (owner && !inGroup) {
    const g = matchGroupInText(text);
    if (g) {
      const log = readGroupChat(g.id, 100);
      if (log) groupCtx = 'บทสนทนาล่าสุดในกลุ่ม "' + g.name + '" (เก่า→ใหม่ รวมคำบรรยายรูปที่คนส่ง):\n' + log
                        + '\n\nใช้ข้อมูลข้างบนตอบ ถ้าไม่มีข้อมูลที่ถามให้บอกตรงๆ ว่าไม่พบในแชทกลุ่ม ห้ามเดา\n\n';
      else groupCtx = '(หมายเหตุระบบ: กลุ่ม "' + g.name + '" ยังไม่มีข้อความในล็อกเลย ให้ตอบตามนี้ ห้ามแต่งเนื้อหา)\n\n';
    }
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

  // 1.45) ตั้งประกาศ/สรุปงานเข้ากลุ่มล่วงหน้า + ดู/ยกเลิกรายการ (เฉพาะเจ้าของ)
  if (handleScheduledPost(text, chatId, senderId, replyToken, owner)) return;

  // 1.46) 💡 บอร์ดไอเดีย — แปะไว ดู พับ สั่งทำ
  const ideaR = handleIdeaBoard(text, senderId, replyToken, owner);
  if (ideaR === true) return;
  if (typeof ideaR === 'string') text = ideaR;   // "ทำไอเดีย N" → แปลงเป็นคำสั่งงานเต็ม ปล่อยเข้าท่อ TASK/PLAN ปกติ

  // 1.5) ขอลิงก์บอร์ด/ขอดูบอร์ด → ส่งปุ่มเปิดบอร์ดเลย ไม่ต้องให้ Claude สรุป (เร็ว+ประหยัด token)
  // รับทุกการสะกด ลิงก์/ลิ้งค์/ลิงค์/link และประโยคสุภาพ "ขอดูบอร์ดงานหน่อยครับ"
  if (/^(เลขา\s*)?(ขอ)?\s*(ดู|เปิด)?\s*(บอร์ด|board)(งาน)?[\sก-๎a-z]{0,12}$/i.test(text)
      || /(ลิงก์|ลิ้งค์|ลิงค์|link)[^\n]{0,15}(บอร์ด|board)|(บอร์ด|board)(งาน)?[^\n]{0,15}(ลิงก์|ลิ้งค์|ลิงค์|link)/i.test(text)) {
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
    if (inGroup) markAwaitingReply(chatId, senderId, reply);
    memAppend(chatId, text, reply);
    logRow(['ถามบอร์ด', senderId, text, reply]);
    return;
  }

  // 2.5) เจ้าของคุยมา + มีประกาศค้างในคิว → ป้อนคิวจริงให้สมอง AI เห็น "เสมอ" (ไม่ผูกกับคำในข้อความ
  // เพราะคำตอบสั้นๆ อย่าง "7" หรือ "อันเมื่อกี้" จะไม่มีคำว่า ประกาศ แล้วเลขาจะตาบอดทันที)
  let schedCtx = '';
  if (owner) {
    const pend = listPendingPosts(400);
    if (pend.length) {
      schedCtx = '(ประกาศที่ตั้งเวลาค้างอยู่ในระบบตอนนี้ — ข้อมูลจริง ใช้อ้างอิงแทนความจำแชท:\n' + pend.join('\n')
               + '\nถ้าคุณปาล์มขอแก้เนื้อหา/เลื่อนเวลาของรายการพวกนี้ ให้ใช้บล็อก SCHEDULE พร้อม "replace":true)\n\n';
    }
  }

  // 3) เรื่องทั่วไป → ให้คุณเลขา (Claude) ตอบ พร้อมความจำ + คลังข้อมูลธุรกิจ (+ล็อกกลุ่ม/คิวประกาศถ้าเกี่ยว)
  const preCtx = groupCtx + schedCtx;
  const p = parseBlocks(askClaude(preCtx ? (preCtx + 'คำถาม/คำสั่ง: ' + text) : text, history));
  let reply = p.reply;

  // 3.1 ถ้าเป็นการฝากงาน → คัดแยกตาม assignee
  let taskLogged = false;
  // งานหลายขั้น → ส่งให้นักวางแผน (Sonnet) ร่างแผน แล้วเสนอคุณปาล์มอนุมัติ
  if (p.blocks.TASK && p.blocks.TASK.multiStep === true) {
    const plan = askPlanner(text);
    if (plan) {
      const pid = createProjectPlan(plan, senderId);
      if (pid) {
        reply += '\n\n📋 ร่างแผนงาน ' + (plan.steps.length) + ' ขั้นเป็นโปรเจกต์ ' + pid + ' แล้วค่ะ'
               + ' — ส่งให้คุณปาล์มพิจารณาอยู่นะคะ';
        pushPlanForApproval(pid, plan, senderId);
        lineReply(replyToken, reply);
        memAppend(chatId, text, reply);
        logRow(['แผนงานใหม่', senderId, text, pid]);
        return;
      }
    }
    // วางแผนไม่สำเร็จ → ตกลงมาเป็นงานเดี่ยวตามปกติ (ดีกว่าเงียบหาย)
  }
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
        else if (assignee === 'ทีมAI') maybeFireRoutine('ฝากงานทางไลน์ #' + ref);
        if (String(p.blocks.TASK.urgency) === 'ด่วนมาก' && !owner) {
          alertOwnerUrgentTask(p.blocks.TASK, ref, senderId);
        }
      }
    }
  }
  // 3.1c ➕ ข้อมูลเพิ่มของงานเดิม → ต่อเข้าใบงานเดิม ไม่เปิดใบใหม่
  if (p.all.ADDNOTE && p.all.ADDNOTE.length) {
    p.all.ADDNOTE.forEach(function (an) {
      const rr = String(an.ref || '').replace(/^#/, '').trim();
      if (appendNoteToTask(rr, an.note)) reply += '\n\n➕ แนบข้อมูลเข้างาน #' + rr + ' ให้เรียบร้อยค่ะ (ทีมที่รับงานเห็นเองเลย)';
      else reply += '\n\n⚠️ หางาน #' + rr + ' ไม่เจอค่ะ เลยยังไม่ได้แนบ — เช็คเลขงานอีกทีนะคะ';
    });
  }
  // 3.2 ถ้าเป็นข้อเสนอ/ตามงาน/เรื่องด่วน → ส่งสรุปถึงคุณปาล์ม
  if (p.blocks.ALERT && !owner) {
    alertOwnerProposal(p.blocks.ALERT, senderId);
  }
  // 3.2b 💡 คุณปาล์มเล่าไอเดียลอยๆ → เลขาแปะบอร์ดไอเดียให้เอง
  if (owner && p.all.IDEA && p.all.IDEA.length) {
    p.all.IDEA.forEach(function (idg) {
      const n = addIdea(idg.idea || '', senderId, idg.biz || '', idg.take || '');
      if (n) reply += '\n\n💡 แปะบอร์ดไอเดีย #' + n + ' ให้แล้วค่ะ — พร้อมลุยเมื่อไหร่สั่ง "ทำไอเดีย ' + n + '" นะคะ';
    });
  }
  // 3.1b เป็นงานใหญ่ → เลขาแตกเป็นแผนงาน แล้วเสนอคุณปาล์มอนุมัติทางไลน์
  if (p.blocks.PLAN) {
    const pid = createProjectPlan(p.blocks.PLAN, senderId);
    if (pid) {
      reply += '\n\n📁 ร่างแผนงานเป็นโปรเจกต์ ' + pid + ' แล้วค่ะ — ส่งให้คุณปาล์มพิจารณาอยู่นะคะ';
      pushPlanForApproval(pid, p.blocks.PLAN, senderId);
    }
  }
  // 3.25 ตั้ง/แก้ประกาศตามเวลา ผ่านบทสนทนา — AI แต่งข้อความ+ระบุเวลาให้ ระบบบันทึกและยืนยันเอง
  // รองรับหลายบล็อกในคำตอบเดียว (สั่งประกาศหลายกลุ่มพร้อมกัน → ทำครบทุกกลุ่ม ไม่ตกหล่น)
  if (p.all.SCHEDULE && p.all.SCHEDULE.length) {
    if (owner) {
      p.all.SCHEDULE.forEach(function (sc) {
        const gid = resolveGroupTarget(sc.target);
        const when = parseThaiWhen(String(sc.when || ''));
        const msg2 = String(sc.message || '').trim();
        const sh = schedSheet();
        if (!sh) { reply += '\n\n⚠️ ยังตั้งค่าชีตไม่เรียบร้อยค่ะ ตั้งเวลาไม่สำเร็จ'; return; }
        if (!gid) { reply += '\n\n⚠️ ดิฉันยังไม่รู้จักกลุ่ม "' + String(sc.target || '') + '" ค่ะ — พิมพ์ "เลขา รายชื่อกลุ่ม" เช็คชื่อได้นะคะ'; return; }
        if (!when) { reply += '\n\n⚠️ ดิฉันอ่านเวลา "' + String(sc.when || '') + '" ไม่ออกค่ะ ขอแบบ "พรุ่งนี้ 8 โมงครึ่ง" หรือ "วันนี้ 18:00" นะคะ'; return; }
        if (!msg2) { reply += '\n\n⚠️ ยังไม่มีเนื้อหาที่จะส่งค่ะ'; return; }
        // replace: ยกเลิกประกาศค้างล่าสุดของกลุ่มเดียวกันก่อน (= แก้ไขรายการเดิม)
        let replaced = 0;
        const n2 = sh.getLastRow() - 1;
        if (sc.replace && n2 > 0) {
          const d2 = sh.getRange(2, 1, n2, 7).getValues();
          for (let i2 = d2.length - 1; i2 >= 0; i2--) {
            if (String(d2[i2][6]) === 'รอส่ง' && String(d2[i2][1]) === String(gid)) {
              sh.getRange(i2 + 2, 7).setValue('ยกเลิก(แก้ไข)');
              replaced++;
              break;
            }
          }
        }
        const gname = (listKnownGroups().filter(function (x) { return x.id === gid; })[0] || {}).name || String(sc.target || '');
        sh.appendRow([when, gid, gname, 'ข้อความ', /ทุกวัน/.test(String(sc.when || '')) ? 'ทุกวัน' : 'ครั้งเดียว',
                      msg2, 'รอส่ง', senderId, new Date()]);
        reply += '\n\n📣 ' + (replaced ? 'แก้ประกาศเดิมเรียบร้อย — ' : '') + 'ตั้งเวลาส่งแล้วค่ะ'
          + '\n🗓️ ' + Utilities.formatDate(when, 'GMT+7', 'd/M/yyyy เวลา HH:mm') + ' น. → ' + gname
          + '\n💬 ' + msg2.slice(0, 200) + (msg2.length > 200 ? '…' : '');
        logRow(['ตั้งประกาศ(AI)', senderId, String(text).slice(0, 80), gname + ' @ ' + when]);
      });
      reply += '\n(คลาดเคลื่อนได้ ~15 นาที · เช็คด้วย "เลขา ดูประกาศ" หรือดูบนบอร์ด)';
    } else {
      reply += '\n\n(ขออภัยค่ะ การตั้งประกาศเข้ากลุ่มทำได้เฉพาะคุณปาล์มเท่านั้น)';
    }
  }
  // 3.3 คุณปาล์มสั่งให้ส่งข้อความเข้ากลุ่ม (อนุญาตเฉพาะเจ้าของ) — หลายกลุ่มพร้อมกันได้
  if (p.all.SENDGROUP && p.all.SENDGROUP.length) {
    if (owner) {
      const okN = [], badN = [];
      p.all.SENDGROUP.forEach(function (sg) {
        if (sendToGroupByTarget(sg)) okN.push(String(sg.target || ''));
        else badN.push(String(sg.target || ''));
      });
      if (okN.length) reply += '\n\n📤 ส่งข้อความเข้ากลุ่มให้แล้วค่ะ' + (okN.length > 1 ? ' (' + okN.join(', ') + ')' : '');
      if (badN.length) {
        const known = listKnownGroups().map(function (g) { return g.name; }).filter(String);
        reply += '\n\n⚠️ ดิฉันยังไม่รู้จักกลุ่ม "' + badN.join('", "') + '" ค่ะ\n'
          + (known.length ? ('กลุ่มที่รู้จักตอนนี้: ' + known.join(', ') + '\n') : 'ตอนนี้ยังไม่รู้จักกลุ่มไหนเลยค่ะ\n')
          + 'วิธีให้ดิฉันรู้จักกลุ่ม: ให้ใครก็ได้พิมพ์อะไรก็ได้ในกลุ่มนั้น 1 ข้อความ แล้วสั่งใหม่อีกครั้งนะคะ';
      }
    } else {
      reply += '\n\n(ขออภัยค่ะ การส่งข้อความเข้ากลุ่มทำได้เฉพาะคุณปาล์มเท่านั้น)';
    }
  }

  lineReply(replyToken, reply, taskLogged ? [boardButtonMessage()] : null);
  if (inGroup) markAwaitingReply(chatId, senderId, reply);
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
  // "8 โมงครึ่ง" / "2 ทุ่มครึ่ง" / "บ่าย 2 ครึ่ง" → +30 นาที (เฉพาะตอนไม่ได้เขียนนาทีตรงๆ แบบ 8:30)
  if (!mClock && hh >= 0 && /(?:โมง|ทุ่ม|เที่ยง|\d)\s*(?:เช้า|เย็น)?\s*ครึ่ง/.test(t)) mm = 30;
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
  // heartbeat: จดเวลาที่รันล่าสุดไว้ ให้ "เช็คระบบ" ฟ้องได้ถ้า trigger ตั้งไว้แต่ไม่รันจริง (เช่น สิทธิ์ค้าง)
  try { PropertiesService.getScriptProperties().setProperty('LAST_TICK', String(Date.now())); } catch (e) {}
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
  // ยิงประกาศ/สรุปงานที่ตั้งเวลาไว้ด้วย (เกาะ trigger เดิม ไม่ต้องตั้ง trigger ใหม่)
  try { fireDuePosts(); } catch (err) { console.error('fireDuePosts: ' + err); }
}

// ════════════════════════════════════════════════════════════
//  📣 ตั้งประกาศ/สรุปงานเข้ากลุ่มล่วงหน้า (เฉพาะคุณปาล์มสั่ง)
//  "เลขา ตั้งประกาศเข้ากลุ่ม ออริจิ้นแล็บ พรุ่งนี้ 8 โมงครึ่ง ว่า ..."
//  "เลขา ตั้งสรุปงานเข้ากลุ่ม ออริจิ้นแล็บ ทุกวัน 18:00"
//  "เลขา ดูประกาศ" / "เลขา ยกเลิกประกาศ 2"
//  ⏱️ ความละเอียด ~15 นาที (เกาะ trigger fireDueReminders)
// ════════════════════════════════════════════════════════════
function schedSheet() {
  const id = boardSheetId(); if (!id) return null;
  const ss = ssById(id);
  let sh = ss.getSheetByName('ScheduledPosts');
  if (!sh) {
    sh = ss.insertSheet('ScheduledPosts');
    sh.appendRow(['ส่งเมื่อ', 'groupId', 'ชื่อกลุ่ม', 'ประเภท', 'ซ้ำ', 'เนื้อหา', 'สถานะ', 'ผู้สั่ง', 'สร้างเมื่อ']);
  }
  return sh;
}

// รายการประกาศที่ยัง "รอส่ง" (ใช้ทั้งคำสั่ง "ดูประกาศ" และป้อนบริบทให้สมอง AI)
// maxLen = ความยาวเนื้อหาที่โชว์ (ดูผ่านไลน์เอาสั้น / ป้อนให้ AI เอายาว จะได้แก้สำนวนได้จริง)
function listPendingPosts(maxLen) {
  const L = Number(maxLen) || 80;
  try {
    const sh = schedSheet(); if (!sh || sh.getLastRow() < 2) return [];
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
    const items = [];
    rows.forEach(function (r, i) {
      if (String(r[6]) !== 'รอส่ง') return;
      const c = String(r[5] || '');
      items.push('#' + (i + 1) + ' 🗓️ ' + Utilities.formatDate(new Date(r[0]), 'GMT+7', 'd/M HH:mm')
        + (String(r[4]) === 'ทุกวัน' ? ' (ทุกวัน)' : '')
        + ' → ' + (r[2] || r[1]) + '\n   ' + (String(r[3]) === 'สรุปงาน' ? '📊 สรุปงานจากบอร์ด (สร้างสดตอนส่ง)' : c.slice(0, L) + (c.length > L ? '…' : '')));
    });
    return items;
  } catch (e) { return []; }
}

// จับคำสั่งตั้งประกาศ/ดู/ยกเลิก — คืน true ถ้าจัดการแล้ว
function handleScheduledPost(text, chatId, senderId, replyToken, owner) {
  const t = String(text).replace(/^เลขา\s*/i, '').trim();

  // ดูรายการที่ตั้งไว้
  if (/^(ดู|เช็ค|รายการ)(ประกาศ|กำหนดส่ง|โพสต์)/.test(t)) {
    const items = listPendingPosts();
    lineReply(replyToken, items.length
      ? '📣 ประกาศที่ตั้งไว้ค่ะ:\n' + items.join('\n') + '\n\nยกเลิกได้ด้วย "เลขา ยกเลิกประกาศ <เลข>"'
      : 'ยังไม่มีประกาศที่ตั้งเวลาไว้ค่ะ');
    return true;
  }

  // ยกเลิก
  const mCancel = t.match(/^ยกเลิก(?:ประกาศ|กำหนดส่ง|โพสต์)\s*#?(\d+)/);
  if (mCancel) {
    if (!owner) { lineReply(replyToken, 'ขออภัยค่ะ การจัดการประกาศทำได้เฉพาะคุณปาล์มเท่านั้น 🙏'); return true; }
    const sh = schedSheet(); const row = Number(mCancel[1]) + 1;
    if (!sh || row < 2 || row > sh.getLastRow() || String(sh.getRange(row, 7).getValue()) !== 'รอส่ง') {
      lineReply(replyToken, 'ไม่พบประกาศ #' + mCancel[1] + ' ที่ยังรอส่งค่ะ — พิมพ์ "เลขา ดูประกาศ" เช็คเลขก่อนนะคะ');
      return true;
    }
    sh.getRange(row, 7).setValue('ยกเลิก');
    lineReply(replyToken, '✅ ยกเลิกประกาศ #' + mCancel[1] + ' ให้แล้วค่ะ');
    return true;
  }

  // ส่งเดี๋ยวนี้ ไม่รอเวลา: "ส่งประกาศ 3 เลย" / "ส่งประกาศ #3" / "ส่งประกาศ 3 ตอนนี้"
  const mNow = t.match(/^ส่ง(?:ประกาศ|โพสต์)\s*#?(\d+)(?:\s*(?:เลย|ตอนนี้|ทันที))?\s*$/);
  if (mNow) {
    if (!owner) { lineReply(replyToken, 'ขออภัยค่ะ การจัดการประกาศทำได้เฉพาะคุณปาล์มเท่านั้น 🙏'); return true; }
    const res = sendScheduledNow(Number(mNow[1]));
    lineReply(replyToken, res.msg + (res.ok ? '' : ' — พิมพ์ "เลขา ดูประกาศ" เช็คเลขก่อนนะคะ'));
    return true;
  }

  // ตั้งใหม่ — จับจาก "เจตนา" ไม่ยึดรูปประโยค: มีคำส่ง/ประกาศ + พูดถึงกลุ่ม + ระบุเวลา = ตั้งเวลา
  // รองรับภาษาพูด: "ฝากคุณส่งข้อความลงกลุ่ม ทดสอบเลขา ตอน 4:21 ได้มั้ย ว่า ..." ก็เข้าใจ
  // แยกหัวคำสั่ง (กลุ่ม+เวลา) กับเนื้อหา ที่ตัวคั่น "ว่า" (รับทั้ง " ว่า " และ "มั้ยว่า/หน่อยว่า" ติดกัน)
  let head = t, body = '';
  let vm = t.match(/(?<!ก)ว่า\s+/);   // "ว่า" ที่ตามด้วยช่องว่าง (กันชนกับคำว่า "กว่า") — รวมเคส "กลุ่มคาเฟ่ว่า ..."
  if (vm) { head = t.slice(0, vm.index); body = t.slice(vm.index + vm[0].length).trim(); }
  else {
    vm = t.match(/(มั้ย|ไหม|หน่อย|ด้วย|นะ|ที|เลย)\s*ว่า\s*/);   // "ได้มั้ยว่า..." เขียนติดกันหมด
    if (vm) { head = t.slice(0, vm.index + vm[1].length); body = t.slice(vm.index + vm[0].length).trim(); }
  }
  body = body.replace(/^["'“”]+|["'“”]+$/g, '').trim();   // ลอกเครื่องหมายคำพูดที่ครอบมา

  const isSummary = /สรุปงาน|รายงานงาน|สรุปบอร์ด/.test(head);
  const sendVerb = /ส่ง|ประกาศ|โพสต์|แจ้ง/.test(head);
  const explicit = /^(?:ขอ|รบกวน)?\s*(?:ตั้ง|ฝาก|นัด)/.test(t);   // ขึ้นต้นแบบสั่งตั้งชัดๆ
  const verbatim = /ตามนี้เป๊ะ|เป๊ะๆ|เป๊ะ ๆ|ตามข้อความนี้|ตามที่พิมพ์เลย|ห้ามแก้คำ/.test(t);   // สั่งให้ใช้ข้อความเดิมทั้งดุ้น
  if ((!sendVerb && !isSummary) || !/กลุ่ม/.test(head)) return false;
  // นโยบายคุณปาล์ม: ประกาศทุกชิ้นต้องผ่านสมอง AI เรียบเรียงเป็นภาษาเลขาก่อนเสมอ
  // regex ตรงนี้เก็บเองเฉพาะ "สรุปงาน" (ระบบสรุปสดตอนส่ง) กับเคสสั่ง "ตามนี้เป๊ะๆ/ห้ามแก้คำ" เท่านั้น
  if (!isSummary && !verbatim) return false;

  // หา "ทุกกลุ่ม" ที่พูดถึง — สั่งทีเดียวหลายกลุ่มได้ (เช่น "กลุ่ม A กับกลุ่ม B")
  let targets = matchGroupsInText(head);
  if (!targets.length) { const g1 = matchGroupInText(head); if (g1) targets = [g1]; }
  // หาเวลาโดยตัดชื่อกลุ่มออกก่อน กันตัวเลขในชื่อกลุ่มปนกับเวลา
  let headNoGroup = head;
  targets.forEach(function (g) { if (g.name) headNoGroup = headNoGroup.split(g.name).join(' '); });
  const when = parseThaiWhen(headNoGroup);

  // ไม่ระบุเวลา = อยากส่งทันที → ปล่อยให้สมอง AI ส่งเองผ่าน SENDGROUP (ห้ามวนถามเวลา)
  // ยกเว้นสั่งตั้ง "สรุปงาน" ชัดๆ (ตั้ง/ฝาก/นัด) แต่ลืมบอกเวลา → ค่อยถามเวลากลับ
  if (!when && !(isSummary && explicit)) return false;
  if (!owner) { lineReply(replyToken, 'ขออภัยค่ะ การตั้งประกาศเข้ากลุ่มทำได้เฉพาะคุณปาล์มเท่านั้น 🙏'); return true; }

  if (!targets.length) {
    const known = listKnownGroups().map(function (x) { return x.name; }).filter(String);
    lineReply(replyToken, 'ดิฉันไม่แน่ใจว่ากลุ่มไหนค่ะ 🙏\n'
      + (known.length ? 'กลุ่มที่รู้จักตอนนี้: ' + known.join(', ') : 'ยังไม่รู้จักกลุ่มไหนเลยค่ะ — ให้ใครสักคนทักในกลุ่มนั้นก่อน 1 ข้อความนะคะ'));
    return true;
  }
  if (!when) {
    lineReply(replyToken, 'ขอเวลาชัดๆ หน่อยนะคะ เช่น "พรุ่งนี้ 8 โมงครึ่ง", "วันนี้ 18:00", "อีก 2 ชั่วโมง"');
    return true;
  }
  if (!isSummary && !body) {
    lineReply(replyToken, 'เกือบได้แล้วค่ะ — ขอเนื้อหาที่จะประกาศด้วยนะคะ รูปแบบ:\n'
      + '"เลขา ตั้งประกาศเข้ากลุ่ม <ชื่อกลุ่ม> <วัน เวลา> ว่า <ข้อความ>"');
    return true;
  }

  const daily = /ทุกวัน/.test(head);
  const sh = schedSheet();
  if (!sh) { lineReply(replyToken, 'ขออภัยค่ะ ยังตั้งค่าชีตไม่เรียบร้อย'); return true; }
  targets.forEach(function (g) {
    sh.appendRow([when, g.id, g.name, isSummary ? 'สรุปงาน' : 'ข้อความ', daily ? 'ทุกวัน' : 'ครั้งเดียว',
                  body, 'รอส่ง', senderId, new Date()]);
    logRow(['ตั้งประกาศ', senderId, text, g.name + ' @ ' + when]);
  });

  lineReply(replyToken, '📣 รับทราบค่ะ ตั้งเวลาส่งให้แล้ว\n'
    + '🗓️ ' + Utilities.formatDate(when, 'GMT+7', 'd/M/yyyy เวลา HH:mm') + ' น.' + (daily ? ' (ทุกวัน)' : '') + '\n'
    + '👥 กลุ่ม: ' + targets.map(function (g) { return g.name || g.id; }).join(', ') + (targets.length > 1 ? ' (' + targets.length + ' กลุ่ม)' : '') + '\n'
    + (isSummary ? '📊 เนื้อหา: สรุปงานจากบอร์ด (ดิฉันจะสรุปสดๆ ตอนถึงเวลาส่ง)'
        : '💬 เนื้อหา: ' + body.slice(0, 200) + (body.length > 200 ? '… (เก็บเนื้อหาเต็มไว้ครบแล้วค่ะ)' : ''))
    + '\n\n(เวลาส่งจริงอาจคลาดเคลื่อนได้ไม่เกิน ~15 นาทีนะคะ)\nดูรายการ: "เลขา ดูประกาศ" | ยกเลิก: "เลขา ยกเลิกประกาศ <เลข>"');
  return true;
}

// ════════════════════════════════════════════════════════════
//  💡 บอร์ดไอเดีย — ที่รองรับไอเดียคุณปาล์มที่มาไวกว่ามือทำ
//  แปะไว → บ่มไว้บนบอร์ด → พร้อมเมื่อไหร่ "ทำไอเดีย <เลข>" ค่อยวิ่งเข้าท่อทีม AI
// ════════════════════════════════════════════════════════════
function ideaSheet() {
  const id = boardSheetId(); if (!id) return null;
  const ss = ssById(id);
  let s = ss.getSheetByName('Ideas');
  if (!s) { s = ss.insertSheet('Ideas'); s.appendRow(['เมื่อ', 'ผู้แปะ', 'ไอเดีย', 'ธุรกิจ', 'สถานะ', 'ความเห็นเลขา']); }
  return s;
}

function addIdea(idea, senderId, biz, take) {
  try {
    const sh = ideaSheet(); if (!sh || !String(idea || '').trim()) return 0;
    sh.appendRow([new Date(), lineUserName(senderId) || senderId, String(idea).slice(0, 1000), biz || '', 'ใหม่', String(take || '').slice(0, 500)]);
    return sh.getLastRow() - 1;
  } catch (e) { console.error('addIdea: ' + e); return 0; }
}

function readIdeasAll() {
  try {
    const sh = ideaSheet(); if (!sh || sh.getLastRow() < 2) return [];
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
    const out = [];
    rows.forEach(function (r, i) {
      const st = String(r[4] || 'ใหม่');
      if (st === 'ตัดทิ้ง') return;
      out.push({ row: i + 1, time: Utilities.formatDate(new Date(r[0]), 'GMT+7', 'd/M HH:mm'),
                 by: String(r[1] || ''), idea: String(r[2] || ''), biz: String(r[3] || ''),
                 status: st, take: String(r[5] || '') });
    });
    return out;
  } catch (e) { return []; }
}

// คืน true = จบแล้ว | คืน string = ข้อความใหม่ให้ส่งเข้าสมอง AI ต่อ | false = ไม่ใช่เรื่องไอเดีย
function handleIdeaBoard(text, senderId, replyToken, owner) {
  const t = String(text).replace(/^เลขา\s*/i, '').trim();

  // ดูรายการ (เช็คก่อนแปะ กันชนกับ "ดูไอเดีย")
  if (/^(?:ดู|รายการ|เช็ค)ไอเดีย/.test(t)) {
    const items = readIdeasAll();
    if (!items.length) { lineReply(replyToken, 'บอร์ดไอเดียยังว่างค่ะ — แปะได้เลย: "เลขา ไอเดีย <เรื่องที่คิดออก>" 💡'); return true; }
    const icon = { 'ใหม่': '🌱', 'ส่งเข้าทีมแล้ว': '🚀', 'พับไว้': '📦' };
    lineReply(replyToken, '💡 บอร์ดไอเดีย (' + items.length + '):\n'
      + items.slice(-25).map(function (x) {
          return '#' + x.row + ' ' + (icon[x.status] || '🌱') + ' ' + x.idea.slice(0, 70) + (x.idea.length > 70 ? '…' : '')
               + (x.status !== 'ใหม่' ? ' — ' + x.status : '');
        }).join('\n')
      + '\n\nพร้อมลุยอันไหน: "ทำไอเดีย <เลข>" | เก็บไว้ก่อน: "พับไอเดีย <เลข>"');
    return true;
  }

  // พับเก็บ / ตัดทิ้ง (เฉพาะเจ้าของ)
  const mFold = t.match(/^(พับ|ตัด|ลบ)ไอเดีย\s*#?(\d+)/);
  if (mFold) {
    if (!owner) { lineReply(replyToken, 'ขออภัยค่ะ จัดการบอร์ดไอเดียได้เฉพาะคุณปาล์มค่ะ 🙏'); return true; }
    const sh = ideaSheet(); const row = Number(mFold[2]) + 1;
    if (!sh || row < 2 || row > sh.getLastRow()) { lineReply(replyToken, 'ไม่พบไอเดีย #' + mFold[2] + ' ค่ะ — พิมพ์ "ดูไอเดีย" เช็คเลขก่อนนะคะ'); return true; }
    const st = (mFold[1] === 'พับ') ? 'พับไว้' : 'ตัดทิ้ง';
    sh.getRange(row, 5).setValue(st);
    lineReply(replyToken, st === 'พับไว้'
      ? '📦 พับไอเดีย #' + mFold[2] + ' เก็บไว้ก่อนแล้วค่ะ (ยังอยู่บนบอร์ด พร้อมเมื่อไหร่สั่ง "ทำไอเดีย ' + mFold[2] + '" ได้เลย)'
      : '🗑️ ตัดไอเดีย #' + mFold[2] + ' ออกจากบอร์ดแล้วค่ะ');
    return true;
  }

  // สั่งลงมือทำ (เฉพาะเจ้าของ) → แปลงเป็นคำสั่งงานเต็ม แล้วปล่อยเข้าท่อ TASK/PLAN/อนุมัติ ตามปกติ
  const mRun = t.match(/^(?:ทำ|เริ่ม|ลุย)ไอเดีย\s*#?(\d+)\s*(.*)$/);
  if (mRun) {
    if (!owner) { lineReply(replyToken, 'ขออภัยค่ะ สั่งทำไอเดียได้เฉพาะคุณปาล์มค่ะ 🙏'); return true; }
    const sh = ideaSheet(); const row = Number(mRun[1]) + 1;
    if (!sh || row < 2 || row > sh.getLastRow()) { lineReply(replyToken, 'ไม่พบไอเดีย #' + mRun[1] + ' ค่ะ — พิมพ์ "ดูไอเดีย" เช็คเลขก่อนนะคะ'); return true; }
    const idea = String(sh.getRange(row, 3).getValue());
    sh.getRange(row, 5).setValue('ส่งเข้าทีมแล้ว');
    logRow(['ทำไอเดีย', senderId, '#' + mRun[1], idea.slice(0, 120)]);
    return 'คุณปาล์มสั่งเริ่มลงมือทำไอเดีย #' + mRun[1] + ' จากบอร์ดไอเดีย: "' + idea + '"'
         + (mRun[2] ? ('\nรายละเอียดเพิ่มเติมจากคุณปาล์ม: ' + mRun[2]) : '')
         + '\nช่วยประเมินแล้วเปิดเป็นงานเข้าบอร์ด (บล็อก TASK — ถ้าเป็นงานหลายขั้นใส่ multiStep:true) ให้เหมาะสมเลยค่ะ';
  }

  // แปะไอเดียแบบไว: "ไอเดีย ..." / "จดไอเดีย ..." / "แปะไอเดีย ..." — บันทึกทันที ไม่เสียเวลาเรียก AI
  const mAdd = t.match(/^(?:จด|แปะ)?\s*ไอเดีย\s*[:：]?\s+([\s\S]+)/);
  if (mAdd) {
    const n = addIdea(mAdd[1].trim(), senderId, '', '');
    lineReply(replyToken, n
      ? '💡 แปะไอเดีย #' + n + ' ขึ้นบอร์ดแล้วค่ะ\nฟุ้งต่อได้เลยนะคะ — พร้อมลุยเมื่อไหร่สั่ง "ทำไอเดีย ' + n + '" ดิฉันจัดทีมให้ทันที'
      : 'ขออภัยค่ะ ชีตไอเดียยังไม่พร้อม (แจ้งคุณปาล์มเช็คการตั้งค่าชีตนะคะ)');
    return true;
  }

  return false;
}

// รายการประกาศตั้งเวลา (รอส่ง) สำหรับโชว์บนบอร์ดงาน — row ใช้เลขเดียวกับ "เลขา ยกเลิกประกาศ <เลข>"
function readScheduledAll() {
  try {
    const sh = schedSheet(); if (!sh || sh.getLastRow() < 2) return [];
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
    const out = [];
    rows.forEach(function (r, i) {
      if (String(r[6]) !== 'รอส่ง') return;
      out.push({
        row: i + 1,
        time: Utilities.formatDate(new Date(r[0]), 'GMT+7', 'd/M/yyyy HH:mm'),
        group: String(r[2] || r[1]),
        type: String(r[3]),
        repeat: String(r[4]),
        content: String(r[5] || '')
      });
    });
    return out;
  } catch (e) { return []; }
}

// ปุ่มแก้/ยกเลิกประกาศจากหน้าบอร์ด (google.script.run + fetch fallback ผ่าน action=schedDo)
function rpcSchedAction(key, action, row, when, content) {
  if (key !== cfg('QUEUE_KEY')) return { ok: false, msg: 'รหัสไม่ถูกต้อง' };
  try {
    const sh = schedSheet();
    const r = Number(row) + 1;   // แถวจริงในชีต (แถว 1 = หัวตาราง)
    if (!sh || r < 2 || r > sh.getLastRow() || String(sh.getRange(r, 7).getValue()) !== 'รอส่ง') {
      return { ok: false, msg: 'ไม่พบประกาศรายการนี้ (อาจส่ง/ยกเลิกไปแล้ว) — รีเฟรชหน้าดูนะคะ' };
    }
    if (action === 'cancel') {
      sh.getRange(r, 7).setValue('ยกเลิก');
      logRow(['ยกเลิกประกาศ(บอร์ด)', '', String(sh.getRange(r, 3).getValue() || ''), '']);
      return { ok: true, msg: 'ยกเลิกประกาศแล้วค่ะ' };
    }
    if (action === 'sendnow') return sendScheduledNow(Number(row));
    if (action === 'edit') {
      let newWhen = null;
      if (when) {
        newWhen = parseThaiWhen(String(when));
        if (!newWhen) return { ok: false, msg: 'อ่านเวลา "' + when + '" ไม่ออกค่ะ — ลอง "พรุ่งนี้ 8 โมงครึ่ง" หรือ "วันนี้ 18:00"' };
        sh.getRange(r, 1).setValue(newWhen);
      }
      if (content) sh.getRange(r, 6).setValue(String(content));
      if (!when && !content) return { ok: false, msg: 'ไม่มีอะไรเปลี่ยนค่ะ' };
      logRow(['แก้ประกาศ(บอร์ด)', '', String(sh.getRange(r, 3).getValue() || ''), (when || '') + ' ' + String(content || '').slice(0, 60)]);
      return { ok: true, msg: 'แก้ประกาศเรียบร้อยค่ะ',
               time: Utilities.formatDate(new Date(sh.getRange(r, 1).getValue()), 'GMT+7', 'd/M/yyyy HH:mm'),
               content: String(sh.getRange(r, 6).getValue() || '') };
    }
    return { ok: false, msg: 'ไม่รู้จักคำสั่งนี้' };
  } catch (err) { return { ok: false, msg: 'ทำรายการไม่สำเร็จ: ' + err }; }
}

// ส่งประกาศรายการนี้ "เดี๋ยวนี้" ไม่ต้องรอเวลา — ใช้ทั้งปุ่ม 📤 บนบอร์ดและคำสั่ง "เลขา ส่งประกาศ <เลข> เลย"
// (ยิงจากช่องทางแชท/บอร์ดโดยตรง ทำงานได้แม้ trigger ตามเวลาจะพัง)
function sendScheduledNow(row) {
  const sh = schedSheet();
  const r = Number(row) + 1;   // แถวจริงในชีต
  if (!sh || r < 2 || r > sh.getLastRow() || String(sh.getRange(r, 7).getValue()) !== 'รอส่ง') {
    return { ok: false, msg: 'ไม่พบประกาศรายการนี้ (อาจส่ง/ยกเลิกไปแล้ว)' };
  }
  const d = sh.getRange(r, 1, 1, 7).getValues()[0];
  const msg = (String(d[3]) === 'สรุปงาน') ? buildGroupWorkSummary() : String(d[5] || '');
  if (!msg) return { ok: false, msg: 'ประกาศนี้ไม่มีเนื้อหาค่ะ' };
  linePush(String(d[1]), msg);
  if (String(d[4]) === 'ทุกวัน') {
    // ส่งรอบนี้แล้ว เลื่อนคิวไปวันถัดไปเวลาเดิม (รอบทุกวันยังเดินต่อ)
    const next = new Date((d[0] instanceof Date ? d[0] : new Date()).getTime());
    do { next.setDate(next.getDate() + 1); } while (next.getTime() <= Date.now());
    sh.getRange(r, 1).setValue(next);
  } else {
    sh.getRange(r, 7).setValue('ส่งแล้ว');
  }
  logRow(['ส่งประกาศ(สั่งส่งเลย)', '', String(d[2] || d[1]), msg.slice(0, 100)]);
  return { ok: true, msg: '📤 ส่งเข้ากลุ่ม ' + (d[2] || d[1]) + ' เรียบร้อยแล้วค่ะ'
           + (String(d[4]) === 'ทุกวัน' ? ' (รอบทุกวันถัดไปยังตั้งอยู่)' : '') };
}

// สรุปงานจากบอร์ดสำหรับโพสต์ลงกลุ่ม (เวอร์ชันพนักงาน — ไม่มีตัวเลขการเงินวงใน)
function buildGroupWorkSummary() {
  try {
    const rows = readBoard('', true);
    if (!rows.length) return '📊 สรุปงานวันนี้ค่ะ — ไม่มีงานค้างในบอร์ด เคลียร์หมดแล้ว ✨';
    const ctx = buildBoardContext(rows, true);
    const q = 'ข้อมูลงานจากบอร์ด ณ ตอนนี้:\n' + ctx
      + '\n\nช่วยสรุปสถานะงานสำหรับโพสต์แจ้งในกลุ่มพนักงาน: งานเสร็จ/คืบหน้า/ค้าง เรียงตามความเร่งด่วน '
      + 'กระชับ อ่านง่าย ห้ามใส่ตัวเลขการเงินหรือข้อมูลวงใน ขึ้นต้นว่า "📊 สรุปงานประจำวันค่ะ"';
    return parseBlocks(askClaude(q, [])).reply;
  } catch (err) {
    console.error('buildGroupWorkSummary: ' + err);
    return '📊 สรุปงานประจำวันค่ะ — ขออภัย ระบบสรุปขัดข้องชั่วคราว รบกวนเช็คที่บอร์ดโดยตรงนะคะ';
  }
}

// ยิงประกาศที่ถึงเวลา (ถูกเรียกจาก fireDueReminders ทุก 15 นาที)
function fireDuePosts() {
  const sh = schedSheet(); if (!sh || sh.getLastRow() < 2) return;
  const n = sh.getLastRow() - 1;
  const d = sh.getRange(2, 1, n, 7).getValues();
  const now = Date.now();
  for (let i = 0; i < d.length; i++) {
    if (String(d[i][6]) !== 'รอส่ง') continue;
    const t = (d[i][0] instanceof Date) ? d[i][0].getTime() : 0;
    if (!t || t > now) continue;
    sh.getRange(i + 2, 7).setValue('กำลังส่ง');   // กันส่งซ้ำถ้า trigger ซ้อน
    const msg = (String(d[i][3]) === 'สรุปงาน') ? buildGroupWorkSummary() : String(d[i][5] || '');
    if (msg) linePush(String(d[i][1]), msg);
    if (String(d[i][4]) === 'ทุกวัน') {
      // เลื่อนไปวันถัดไปเวลาเดิม แล้วกลับเป็น "รอส่ง"
      const next = new Date(t);
      do { next.setDate(next.getDate() + 1); } while (next.getTime() <= now);
      sh.getRange(i + 2, 1).setValue(next);
      sh.getRange(i + 2, 7).setValue('รอส่ง');
    } else {
      sh.getRange(i + 2, 7).setValue('ส่งแล้ว');
    }
    logRow(['ส่งประกาศ', 'ระบบ', String(d[i][2] || d[i][1]), msg.slice(0, 100)]);
  }
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

// ── ข้อความที่มาพร้อมรูปใน webhook ก้อนเดียวกัน (LINE แยกรูปกับข้อความเป็นคนละ event) ──
// เก็บไว้ชั่วคราว 5 นาที เพื่อให้ตอนวิเคราะห์รูปรู้ว่า "คนส่งพิมพ์อะไรมาด้วย"
function captionKey(chatId, senderId) { return 'cap:' + chatId + ':' + senderId; }
function stashBatchCaptions(events) {
  try {
    const cache = CacheService.getScriptCache();
    events.forEach(function (ev) {
      if (!ev || ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
      const src = ev.source || {};
      const chatId = src.groupId || src.roomId || src.userId || '';
      const senderId = src.userId || '';
      if (!chatId) return;
      cache.put(captionKey(chatId, senderId), String(ev.message.text || '').slice(0, 500), 300);
    });
  } catch (err) { console.error('stashBatchCaptions: ' + err); }
}
// รวมบริบทรอบตัวรูป: ข้อความที่ส่งมาพร้อมกัน + สิ่งที่คุยกันล่าสุด (ให้ AI เข้าใจว่า "ทำไมส่งรูปนี้มา")
function mediaContext(chatId, senderId) {
  const parts = [];
  try {
    const cap = CacheService.getScriptCache().get(captionKey(chatId, senderId));
    if (cap) parts.push('ข้อความที่คนส่งพิมพ์มาพร้อมรูป: "' + cap + '"');
  } catch (e) {}
  try {
    const hist = memGet(chatId);
    if (hist && hist.length) {
      const recent = hist.slice(-4).map(function (m) {
        return (m.role === 'user' ? 'คน: ' : 'เลขา: ') + String(m.content || '').slice(0, 200);
      }).join('\n');
      if (recent) parts.push('บทสนทนาล่าสุดก่อนหน้านี้:\n' + recent);
    }
  } catch (e) {}
  try {
    if (hasPendingQuestion(chatId)) parts.push('หมายเหตุ: มีคำถามของเลขา/ทีมค้างรอคำตอบอยู่ในห้องนี้ — รูปนี้อาจเป็นคำตอบ');
  } catch (e) {}
  return parts.join('\n\n');
}

// ให้ AI ดูรูป + บริบทข้อความรอบตัว แล้วตัดสินว่า "เกี่ยวกับงานควรเก็บไหม" + บรรยายสั้นๆ ในทีเดียว
// บริบทสำคัญกว่าหน้าตารูป เช่นรูปอาหารจานเดียวกัน ถ้าคนพิมพ์ว่า "เมนูใหม่คาเฟ่ ลองดู" = เกี่ยวข้อง
// แต่ถ้าไม่พิมพ์อะไรเลย/คุยเล่น = ไม่เกี่ยวข้อง
function analyzeImage(blob, context) {
  try {
    const apiKey = cfg('ANTHROPIC_API_KEY');
    if (!apiKey) return { relevant: true, desc: '' }; // วิเคราะห์ไม่ได้ → เก็บไว้ก่อนดีกว่าเสียของสำคัญไป
    const bytes = blob.getBytes();
    if (bytes.length > 3500000) return { relevant: true, desc: '(รูปใหญ่เกินอ่าน)' };
    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: MODEL, max_tokens: 2048,   // เผื่อโควตาให้โหมดคิดก่อนตอบ ไม่งั้นคิดจนหมดโควตาแล้วไม่เหลือคำตอบ
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: blob.getContentType(), data: Utilities.base64Encode(bytes) } },
          { type: 'text', text: 'คุณเป็นเลขาของธุรกิจโรงน้ำดื่ม "ละกอน" และร้านคาเฟ่ '
              + 'มีคนส่งรูปนี้เข้ามาในแชท ช่วยตัดสินว่าควรเก็บรูปนี้ไว้ใช้ทำงานต่อไหม\n\n'
              + (context ? ('บริบทตอนที่ส่งรูปมา:\n' + context + '\n\n') : '(คนส่งไม่ได้พิมพ์ข้อความอะไรมาพร้อมรูป)\n\n')
              + 'ตอบตามรูปแบบนี้เป๊ะๆ 2 บรรทัด ห้ามมีอย่างอื่นเพิ่ม:\n'
              + 'เกี่ยวข้อง: ใช่ หรือ ไม่\n'
              + 'บรรยาย: (1-2 ประโยคภาษาไทย บอกว่าในรูปมีอะไรและคนส่งน่าจะส่งมาทำไม ถ้ามีตัวเลข/ยอด/ราคา/ชื่อสำคัญ ให้ระบุครบ)\n\n'
              + 'ให้น้ำหนัก "บริบทข้อความ" มากกว่าหน้าตาของรูป — รูปแบบเดียวกันอาจเกี่ยวหรือไม่เกี่ยวก็ได้ ขึ้นกับว่าคนส่งพูดว่าอะไร\n'
              + 'ตอบ "ใช่" เมื่อ: คนส่งพูดถึงงาน/สั่งงาน/ขอให้ดู-ตรวจ-ทำอะไรต่อกับรูปนี้ เป็นคำตอบของคำถามที่ค้างอยู่ '
              + 'หรือเนื้อรูปเป็นเรื่องธุรกิจชัดเจน (ใบเสร็จ บิล สลิปโอนเงิน สินค้า-วัตถุดิบ เมนู ราคา สต๊อก เอกสาร สกรีนช็อตแชท/ระบบ ตัวอย่างงาน)\n'
              + 'ตอบ "ไม่" เมื่อ: ส่งมาคุยเล่นเฉยๆ ไม่มีบริบทงาน (รูปอาหารที่กิน เซลฟี่ วิว มีม การ์ตูน) และไม่มีใครขออะไรกับรูปนั้น' }
        ] }]
      }),
      muteHttpExceptions: true
    });
    const d = JSON.parse(res.getContentText());
    const t = claudeText(d).trim();
    const relevant = /เกี่ยวข้อง\s*:\s*ใช่/i.test(t);
    const m = t.match(/บรรยาย\s*:\s*([\s\S]*)/i);
    return { relevant: relevant, desc: (m ? m[1].trim() : t) };
  } catch (err) { console.error('analyzeImage: ' + err); return { relevant: true, desc: '' }; } // วิเคราะห์พลาด → เก็บไว้ก่อนกันเสียของ
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
    if (res.getResponseCode() !== 200) { if (!inGroup) lineReply(replyToken, 'ขออภัยค่ะ ดาวน์โหลดไฟล์ไม่สำเร็จ รบกวนส่งอีกครั้งนะคะ 🙏'); return; }

    const blob = res.getBlob();

    // 📷 รูปภาพ: ให้ AI ดูก่อนว่าเกี่ยวกับงานไหม ไม่เกี่ยว (เช่นรูปอาหาร/เซลฟี่คุยเล่น) → ปล่อยผ่าน ไม่เซฟกันเปลืองที่
    // 📄 ไฟล์อื่น (เอกสาร/สเปรดชีตฯลฯ): ถือว่าตั้งใจส่งมาทำงานอยู่แล้ว → เก็บเลยไม่ต้องวิเคราะห์
    let relevant = true, desc = '';
    if (ev.message.type === 'image') {
      const a = analyzeImage(blob, mediaContext(chatId, senderId));
      relevant = a.relevant;
      desc = a.desc;
    }
    if (!relevant) {
      if (!inGroup) {
        lineReply(replyToken, '👀 ดูรูปแล้วค่ะ ดูไม่น่าเกี่ยวกับงาน เลยยังไม่เก็บไว้นะคะ'
          + (desc ? ('\n(' + desc + ')') : '')
          + '\nถ้าจริง ๆ อยากให้เก็บไว้ บอกดิฉันได้เลยค่ะ 😊');
      }
      // ในกลุ่ม: เงียบไว้ ไม่รบกวนวงคุยด้วยรูปที่ไม่เกี่ยวงาน
      logRow(['รับรูป(ไม่เกี่ยว-ไม่เซฟ)', senderId, desc, '']);
      return;
    }

    const stamp = Utilities.formatDate(new Date(), 'GMT+7', 'yyMMdd-HHmmss');
    const base = (ev.message.type === 'image') ? ('รูป-' + stamp) : ((ev.message.fileName || ('ไฟล์-' + stamp)));
    const file = mediaFolder().createFile(blob.setName(base));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const url = file.getUrl();

    if (inGroup) {
      // ในกลุ่ม: เก็บเงียบๆ ลงล็อกแชทกลุ่ม (พร้อมคำบรรยายภาพ) ไม่เด้งตอบรบกวนวงคุย
      logGroupChat(chatId, ev, '[ส่งรูป/ไฟล์] ' + (desc || base) + ' ' + url);
      attachMediaToLatestTask(senderId, url);
      logRow(['รับไฟล์(กลุ่ม)', senderId, base, (desc ? desc + ' ' : '') + url]);
      return;
    }

    // แชทเดี่ยว: แนบกับงานล่าสุดที่คนนี้ฝากไว้และยังไม่ปิด + บอกว่าเห็นอะไรในรูป
    const ref = attachMediaToLatestTask(senderId, url, desc);
    lineReply(replyToken, (ref
      ? ('📎 เก็บไฟล์ให้แล้วค่ะ แนบไว้กับงาน #' + ref + ' เรียบร้อย')
      : ('📎 เก็บไฟล์ไว้ให้แล้วค่ะ (ยังไม่มีงานค้างให้แนบ — เล่ารายละเอียดงานมาได้เลยนะคะ)'))
      + (desc ? ('\n👁️ ที่เห็นในรูป: ' + desc) : '')
      + '\n' + url);
    // จำลงความจำแชท — คุยต่อจากรูปได้ เช่น "เอาตามภาพนี้เลย"
    memAppend(chatId, '[ส่งรูปมา 1 รูป]', '(รับรูปแล้ว' + (desc ? ' — ในรูป: ' + desc : '') + (ref ? ' แนบกับงาน #' + ref : '') + ')');
    logRow(['รับไฟล์', senderId, ev.message.type + ' ' + base, (desc ? desc + ' ' : '') + url]);
  } catch (err) {
    console.error('handleMediaMessage: ' + err);
    if (!inGroup) lineReply(replyToken, 'ขออภัยค่ะ เก็บไฟล์ไม่สำเร็จ (' + err + ')');
  }
}

// หางานล่าสุดของคนส่งที่ยังไม่ปิด แล้วต่อลิงก์รูปในคอลัมน์ "ลิงก์รูป" (K)
// desc (ถ้ามี) จะถูกจดลงช่อง "ติดขัด" (R) ซึ่งส่งให้ทีม AI ผ่านฟิลด์ needs อยู่แล้ว
function attachMediaToLatestTask(senderId, url, desc) {
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
      if (desc) {
        const note = String(sheet.getRange(row, 18).getValue() || '');
        sheet.getRange(row, 18).setValue((note ? note + ' | ' : '') + '🖼️ รูปแนบ: ' + String(desc).slice(0, 300));
      }
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

  // 7. trigger — เช็คทั้ง "ตั้งไว้" และ "รันจริง" (heartbeat จาก fireDueReminders)
  try {
    const fns = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
    fns.length ? ok('งานอัตโนมัติตั้งไว้: ' + fns.join(', ')) : bad('ยังไม่ได้ตั้ง trigger เลย', 'รันฟังก์ชัน setupTriggers ใน Apps Script 1 ครั้ง');
    if (fns.indexOf('fireDueReminders') !== -1) {
      const tick = Number(PropertiesService.getScriptProperties().getProperty('LAST_TICK') || 0);
      if (!tick) {
        warn('ยังไม่มีหลักฐานว่า trigger รันจริง (เพิ่งติดตั้งตัวตรวจ)',
             'รอ 15 นาทีแล้วเช็คระบบอีกครั้ง — ถ้ายังขึ้นแบบนี้ = trigger ค้าง ให้เปิด Apps Script → Run ฟังก์ชัน fireDueReminders แล้วกด Allow สิทธิ์ทั้งหมด');
      } else {
        const age = Math.round((Date.now() - tick) / 60000);
        if (age <= 20) ok('trigger รันจริง ล่าสุด ' + age + ' นาทีก่อน');
        else bad('trigger ไม่ได้รันมา ' + age + ' นาทีแล้ว (ปกติต้องทุก 15 นาที) — เตือน/ประกาศตามเวลาจะไม่ออก',
                 'เปิด Apps Script → Executions ดู error สีแดง — ส่วนใหญ่คือสิทธิ์ค้าง: Run ฟังก์ชัน fireDueReminders เอง 1 ครั้งแล้วกด Allow ทั้งหมด');
      }
    }
  } catch (e) {}

  // 8. ประกาศตั้งเวลา — มีอันเลยกำหนดแต่ยังไม่ถูกส่งไหม (สัญญาณชัดสุดว่าตัวยิงพัง)
  try {
    const shp = schedSheet();
    if (shp && shp.getLastRow() >= 2) {
      const rows = shp.getRange(2, 1, shp.getLastRow() - 1, 7).getValues();
      let pend = 0, overdue = 0;
      const nowT = Date.now();
      rows.forEach(function (r) {
        if (String(r[6]) !== 'รอส่ง') return;
        pend++;
        const t = (r[0] instanceof Date) ? r[0].getTime() : 0;
        if (t && nowT - t > 20 * 60000) overdue++;
      });
      if (overdue) bad('มีประกาศเลยกำหนดแต่ยังไม่ถูกส่ง ' + overdue + ' อัน', 'ตัวยิงตามเวลาไม่ทำงาน — ดูวิธีแก้ที่ข้อ trigger ด้านบน');
      else if (pend) ok('ประกาศตั้งเวลารอส่ง ' + pend + ' อัน (ยังไม่ถึงกำหนด)');
    }
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
function normGroupName(x) {
  return String(x || '').toLowerCase()
    .replace(/["'\u201c\u201d\u2018\u2019]/g, '')   // เครื่องหมายคำพูด
    .replace(/^\s*กลุ่ม\s*/, '')                      // คำนำหน้า "กลุ่ม..."
    .replace(/\s+/g, '');                              // ช่องว่างทั้งหมด (กัน "ทดสอบ เลขา")
}

// คำที่ไม่ช่วยแยกกลุ่ม (รูปแบบบริษัท/คำนำหน้า) — ตัดทิ้งก่อนเทียบ จะได้ไม่พลาดเพราะ "บริษัท" ↔ "บจก"
function stripCorpWords(s) {
  return String(s || '').replace(/บริษัท|บจก\.?|หจก\.?|จำกัด(?:\s*\(?มหาชน\)?)?|กลุ่ม/g, ' ');
}

// ให้คะแนน 0-1 ว่าข้อความพูดถึงกลุ่มนี้แค่ไหน (นับคำในชื่อกลุ่มที่โผล่ในข้อความ)
function groupMatchScore(text, name) {
  const t = normGroupName(stripCorpWords(text));
  if (!t) return 0;
  const tokens = stripCorpWords(name).split(/\s+/)
    .map(normGroupName).filter(function (x) { return x && x.length >= 2; });
  if (!tokens.length) return 0;
  let hit = 0;
  tokens.forEach(function (k) { if (t.indexOf(k) !== -1) hit++; });
  return hit / tokens.length;
}

// หาว่าในข้อความพูดถึงกลุ่มไหนที่เลขารู้จักบ้าง (ใช้ทั้งดึงล็อกกลุ่มและหากลุ่มปลายทางประกาศ)
function matchGroupInText(text) {
  const t = normGroupName(text);
  if (!t) return null;
  const gs = listKnownGroups();
  // 1) ชื่อเต็มอยู่ในข้อความ — ชัวร์สุด
  for (let i = 0; i < gs.length; i++) {
    const n = normGroupName(gs[i].name);
    if (n && t.indexOf(n) !== -1) return { id: gs[i].id, name: gs[i].name };
  }
  // 2) เทียบรายคำ เผื่อพิมพ์ไม่ตรงทั้งชื่อ (เช่น "บริษัท"↔"บจก", เรียกชื่อย่อ "กลุ่มออริจิ้น")
  let best = null, bestScore = 0, second = 0, hitGroups = 0;
  gs.forEach(function (g) {
    if (!g.name) return;
    const sc = groupMatchScore(text, g.name);
    if (sc > 0) hitGroups++;
    if (sc > bestScore) { second = bestScore; bestScore = sc; best = g; }
    else if (sc > second) second = sc;
  });
  if (!best) return null;
  if (bestScore === second) return null;                    // คะแนนเท่ากันหลายกลุ่ม = กำกวม ให้ถามกลับ
  if (bestScore >= 0.6 || hitGroups === 1) return { id: best.id, name: best.name };
  return null;
}

// หา "ทุกกลุ่ม" ที่ถูกพูดถึงในข้อความ (เช่น "ประกาศเข้ากลุ่ม A กับกลุ่ม B") — คืน array
function matchGroupsInText(text) {
  const t = normGroupName(text);
  if (!t) return [];
  const hits = [];
  listKnownGroups().forEach(function (g) {
    if (!g.name) return;
    const n = normGroupName(g.name);
    if (n && t.indexOf(n) !== -1) { hits.push({ id: g.id, name: g.name }); return; }   // ชื่อเต็มอยู่ในข้อความ
    if (groupMatchScore(text, g.name) >= 0.6) hits.push({ id: g.id, name: g.name });   // เทียบรายคำ
  });
  return hits;
}

function findGroupByName(name) {
  const q = normGroupName(name);
  if (!q) return '';
  const gs = listKnownGroups().map(function (g) { return { id: g.id, n: normGroupName(g.name) }; })
                              .filter(function (g) { return g.n; });
  for (let i = 0; i < gs.length; i++) if (gs[i].n === q) return gs[i].id;                 // ตรงตัว
  for (let i = 0; i < gs.length; i++) if (gs[i].n.indexOf(q) !== -1) return gs[i].id;     // ชื่อกลุ่มมีคำที่พิมพ์
  for (let i = 0; i < gs.length; i++) if (q.indexOf(gs[i].n) !== -1) return gs[i].id;     // คำที่พิมพ์มีชื่อกลุ่ม
  const m = matchGroupInText(name);                                                       // เทียบรายคำ (บริษัท↔บจก ฯลฯ)
  return m ? m.id : '';
}

// แปลง "ชื่อกลุ่มตามที่พูด" → group id (ใช้ทั้งส่งทันทีและตั้งเวลา)
function resolveGroupTarget(target) {
  const map = {
    'cafe': 'GROUP_CAFE_ID', 'คาเฟ่': 'GROUP_CAFE_ID', 'กลุ่มคาเฟ่': 'GROUP_CAFE_ID',
    'sales': 'GROUP_SALES_ID', 'เซลล์': 'GROUP_SALES_ID', 'ทีมเซลล์': 'GROUP_SALES_ID'
  };
  const t = String(target || '').trim();
  let gid = '';
  if (map[t]) gid = cfg(map[t]);
  else if (/^[CRU][0-9a-fA-F]{20,}$/.test(t)) gid = t;   // ใส่ group id ตรงๆ
  else if (cfg(t)) gid = cfg(t);                          // เผื่อใส่ชื่อ property
  if (!gid) gid = findGroupByName(t);                     // หาในทะเบียนกลุ่มที่เลขาอยู่
  return gid;
}

function sendToGroupByTarget(sg) {
  const gid = resolveGroupTarget(sg.target);
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
//  🧠 นักวางแผน (Planner) — เลขา "สวมหมวกอีกใบ" ใช้โมเดลฉลาดกว่า
//  เรียกเฉพาะตอนเจองานหลายขั้น (~5-10% ของข้อความ) ครั้งละ ~6K token
// ════════════════════════════════════════════════════════════
const PLANNER_MODEL = 'claude-sonnet-5';

const PLANNER_PROMPT = [
  'คุณคือนักวางแผนงานของธุรกิจโรงน้ำดื่ม "ละกอน" และร้านคาเฟ่',
  'หน้าที่เดียว: รับคำขอ 1 งาน แล้วออกแบบขั้นตอนการทำงานที่ปฏิบัติได้จริง',
  '',
  'ทีมที่มี: data=ฐานข้อมูล/รวบรวมข้อมูล, content=ออกแบบ/คอนเทนต์, writer=เขียนเอกสาร/ข้อความ,',
  'analyst=วิเคราะห์/รายงาน, researcher=ค้นข้อมูล/เทียบราคา, coder=โค้ด/ระบบ, finance=การเงิน,',
  'procurement=หาซื้อของ/เทียบร้าน, เจ้าของ=ขั้นที่คุณปาล์มต้องทำเอง (เลือก/อนุมัติ/ลงมือจริง)',
  '',
  'ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON:',
  '{"title":"ชื่องานสั้น","biz":"โรงน้ำ|คาเฟ่|อื่นๆ","goal":"ผลลัพธ์สุดท้ายที่จับต้องได้",',
  ' "why":"ทำไมงานนี้สำคัญ (1 ประโยค)","risks":["จุดเสี่ยงที่ควรรู้ก่อนอนุมัติ"],',
  ' "openQuestions":["คำถามที่ต้องถามคุณปาล์มก่อนเริ่ม ถ้าไม่มีให้ []"],',
  ' "steps":[{"no":1,"dept":"data|content|writer|analyst|researcher|coder|finance|procurement|เจ้าของ",',
  '   "detail":"ขั้นนี้ทำอะไร ระบุให้คนที่ไม่รู้บริบททำตามได้",',
  '   "inputs":[{"kind":"sheet|drive|ask|step","ref":"ชื่อแท็บ/โฟลเดอร์/กลุ่มที่ถาม/เลขขั้น","note":"สั้นๆ"}],',
  '   "output":"ขั้นนี้เสร็จแล้วได้อะไร","dependsOn":[เลขขั้นที่ต้องเสร็จก่อน],"estMinutes":10}]}',
  '',
  'กติกา:',
  '- 3-6 ขั้น ห้ามเกิน อย่าซอยละเอียดเกินจำเป็น',
  '- dependsOn ให้คิดจริง: ขั้นที่ไม่ต้องรอใครใส่ [] จะได้ทำขนานกันได้ (ประหยัดเวลาและเงิน)',
  '- ขั้นที่ต้องให้คนเลือก/ตัดสินใจ/ลงมือจริง ใส่ dept="เจ้าของ"',
  '- inputs ระบุแหล่งข้อมูลจริง: sheet=แท็บในชีตข้อมูล, drive=คลังแบรนด์, ask=ต้องถามคน (ref: owner|sales|cafe), step=ผลจากขั้นอื่น',
  '- ถ้าข้อมูลสำคัญไม่รู้ (จำนวนคน งบ ขนาด) อย่าเดา — ใส่ลง openQuestions',
  '- แยกให้ชัดว่าโรงน้ำหรือคาเฟ่'
].join('\n');

// ดึงข้อความจากคำตอบของ Claude — ต้องไล่หาบล็อกชนิด text ห้ามอ่าน content[0] ตรง ๆ
// เพราะโมเดลรุ่นใหม่ (Sonnet 5 / Opus 5) เปิดโหมดคิดก่อนตอบอัตโนมัติ เวลาเจอคำสั่งซับซ้อน
// บล็อกแรกจะเป็น thinking (ข้อความว่าง) แล้วข้อความจริงอยู่บล็อกถัดไป
function claudeText(data) {
  if (!data || !data.content || !data.content.length) return '';
  for (let i = 0; i < data.content.length; i++) {
    const b = data.content[i];
    if (b && b.type === 'text' && b.text) return b.text;
  }
  return '';
}

// เรียกนักวางแผน — คืน object แผนงาน หรือ null ถ้าไม่สำเร็จ
function askPlanner(userText) {
  const apiKey = cfg('ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  try {
    const kb = loadKBCached();
    let sys = PLANNER_PROMPT;
    if (kb) sys += '\n\nข้อมูลธุรกิจ (ใช้ตัดสินใจว่าข้อมูลไหนมีอยู่แล้ว):\n' + kb;
    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: PLANNER_MODEL,
        max_tokens: 8192,   // เผื่อโควตาให้โหมดคิดก่อนตอบด้วย ไม่งั้นคำตอบจะถูกตัดกลางคัน
        system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: 'ออกแบบแผนงานสำหรับคำขอนี้: ' + userText }]
      }),
      muteHttpExceptions: true
    });
    const data = JSON.parse(res.getContentText());
    let raw = claudeText(data);
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) { console.error('askPlanner: no JSON in ' + raw.slice(0, 200)); return null; }
    const plan = JSON.parse(m[0]);
    if (!plan.steps || !plan.steps.length) return null;
    return plan;
  } catch (err) {
    console.error('askPlanner: ' + err);
    return null;
  }
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
  try { sys += '\n\nลิงก์บอร์ดงานจริง (ลิงก์เดียวที่มี — มีคนขอลิงก์บอร์ด/ขอดูบอร์ด ให้ส่งอันนี้เลย ห้ามบอกว่าไม่มี): ' + boardUrl(); } catch (e) {}

  // Prompt caching: system prompt (บุคลิก+คลังข้อมูล+Playbook) เหมือนเดิมแทบทุกครั้ง
  // ติด cache_control ไว้ → 5 นาทีถัดไป Claude "อ่านจากแคช" แทนอ่านใหม่ทั้งก้อน (ถูกลง ~90%)
  const messages = (history || []).concat([{ role: 'user', content: userText }]);
  const payload = {
    model: MODEL,
    max_tokens: 4096,   // เผื่อโควตาให้โหมดคิดก่อนตอบด้วย ไม่งั้นคำตอบยาว ๆ จะถูกตัดกลางคัน
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
    const text = claudeText(data);
    if (text) return text;
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

// แยกบล็อกซ่อน [[TASK]]{...}[[/TASK]] ฯลฯ ออกจากคำตอบ
// บล็อกชนิดเดียวกันมีได้หลายอัน (เช่น SENDGROUP/SCHEDULE บล็อกละกลุ่ม) — blocks = อันแรก, all = ทุกอัน
function parseBlocks(raw) {
  let reply = String(raw);
  const blocks = {};
  const all = {};
  ['TASK', 'ALERT', 'SENDGROUP', 'SCHEDULE', 'PLAN', 'IDEA', 'ADDNOTE'].forEach(function (name) {
    const re = new RegExp('\\[\\[' + name + '\\]\\]([\\s\\S]*?)\\[\\[\\/' + name + '\\]\\]');
    let m;
    while ((m = reply.match(re))) {
      reply = reply.replace(m[0], '');   // ตัดออกก่อนเสมอ กันวนลูปถ้า JSON เพี้ยน
      try {
        const obj = JSON.parse(m[1].trim());
        if (!blocks[name]) blocks[name] = obj;
        (all[name] = all[name] || []).push(obj);
      } catch (e) { console.error(name + ' parse: ' + e); }
    }
  });
  return { reply: reply.trim(), blocks: blocks, all: all };
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
    const data = sheet.getRange(start, 1, last - start + 1, 24).getValues();
    const out = [];
    for (let i = data.length - 1; i >= 0 && out.length < 200; i--) {
      const r = data[i];
      if (!r[0]) continue;
      out.push({
        ref: r[0], time: fmtTime(r[1]), status: r[2], urgency: r[3], biz: r[4],
        type: r[5], from: r[6], detail: r[8], due: r[9], assignee: r[11] || '', result: r[12] || '', dept: r[13] || '',
        project: r[14] || '', step: r[15] || '', projectTitle: r[16] || '', blocked: r[17] || '',
        notes: r[18] || '', startedAt: fmtTime(r[19]), doneAt: fmtTime(r[20]),
        deps: r[21] || '', inputsTxt: r[22] || '', output: r[23] || ''
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
// ดึงชื่อ LINE ของคนฝากงาน (cache 6 ชม.) — จะได้โชว์บนบอร์ดว่าใครเป็นคนแจ้ง ไม่ใช่แค่ "LINE"
function lineUserName(uid) {
  if (!uid) return 'LINE';
  try {
    const cache = CacheService.getScriptCache();
    const ck = 'unm_' + uid;
    let name = cache.get(ck);
    if (name) return name;
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + uid, {
      headers: { Authorization: 'Bearer ' + cfg('LINE_TOKEN') }, muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      name = JSON.parse(res.getContentText()).displayName || '';
      if (name) { cache.put(ck, name, 21600); return name; }
    }
  } catch (e) {}
  return 'LINE';   // ดึงชื่อไม่ได้ (เช่น ยังไม่ได้แอดเลขาเป็นเพื่อน) → ใช้ค่าเดิม
}

// ➕ เติมข้อมูลเข้างานเดิมตามเลขอ้างอิง (กันเปิดงานซ้ำ) — ต่อท้ายช่อง "รายละเอียด" (คอลัมน์ I)
// ทีม AI ดึงงานผ่านช่องนี้อยู่แล้ว ข้อมูลที่เติมจึงไปถึงคนทำเองอัตโนมัติ
function appendNoteToTask(ref, note) {
  try {
    const r = String(ref || '').replace(/^#/, '').trim();
    const sheet = reqSheet(); if (!sheet || !r || !String(note || '').trim()) return false;
    const n = sheet.getLastRow(); if (n < 2) return false;
    const ids = sheet.getRange(2, 1, n - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]).trim() === r) {
        const row = i + 2;
        const cur = String(sheet.getRange(row, 9).getValue() || '');
        const stamp = Utilities.formatDate(new Date(), 'GMT+7', 'd/M HH:mm');
        sheet.getRange(row, 9).setValue(cur + '\n➕ เพิ่มเติม (' + stamp + '): ' + String(note).slice(0, 1500));
        return true;
      }
    }
    return false;
  } catch (e) { console.error('appendNoteToTask: ' + e); return false; }
}

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
      task.type || '', lineUserName(senderId), senderId || '', task.detail || '', task.due || '', '', assignee, '', dept,
      '', '', '', '', (task.comment ? ('💬 เลขา: ' + task.comment) : '')
    ]);
    return ref;
  } catch (err) {
    console.error('logTaskToBoard error: ' + err);
    return '';
  }
}

// ════════════════════════════════════════════════════════════
//  ➕ ฝากงานแบบไม่ผ่าน Claude (0 token) — ใช้ทั้งฟอร์มบนบอร์ดและ request.html
// ════════════════════════════════════════════════════════════
// t = { biz, type, detail, urgency, due, assignee, dept, from, contact, image }
// preApproved = true เมื่อคุณปาล์มกรอกเองจากบอร์ด (เขาเป็นคนอนุมัติอยู่แล้ว)
function createTaskDirect(t, preApproved) {
  const sheet = reqSheet();
  if (!sheet) return { ok: false, msg: 'ยังไม่ได้ตั้งค่าชีตงาน' };
  const detail = String(t.detail || '').trim();
  if (!detail) return { ok: false, msg: 'กรุณากรอกรายละเอียดงาน' };

  const now = new Date();
  const ref = 'REQ' + Utilities.formatDate(now, 'GMT+7', 'yyMMdd') + '-' + Math.floor(1000 + Math.random() * 9000);
  const assignee = (String(t.assignee || '') === 'ทีมAI') ? 'ทีมAI' : 'คน';
  const dept = (assignee === 'ทีมAI') ? String(t.dept || '') : '';
  const status = (assignee !== 'ทีมAI') ? 'ใหม่'
               : ((needsApproval(dept) && !preApproved) ? 'รออนุมัติ' : 'รอทีม AI');

  sheet.appendRow([
    ref, now, status, String(t.urgency || 'ปกติ'), String(t.biz || ''),
    String(t.type || 'ฝากงาน'), String(t.from || 'บอร์ด'), String(t.contact || ''),
    detail, String(t.due || ''), String(t.image || ''), assignee, '', dept
  ]);

  // งานที่ต้องอนุมัติ หรือ งานด่วนมากจากคนอื่น → เด้งบอกคุณปาล์ม
  if (status === 'รออนุมัติ') pushTaskForApproval(ref, { dept: dept, detail: detail, biz: t.biz, urgency: t.urgency }, '');
  else if (String(t.urgency) === 'ด่วนมาก' && !preApproved) {
    const owner = cfg('OWNER_LINE_USER_ID');
    if (owner) linePush(owner, '🔴 งานด่วนมากเข้าใหม่ค่ะ\n#' + ref + ' ' + (t.biz || '') + '\n' + detail
      + (t.from ? ('\nโดย ' + t.from) : ''));
  }
  if (status === 'รอทีม AI') maybeFireRoutine('ฝากงานผ่านฟอร์ม #' + ref);
  return { ok: true, ref: ref, status: status,
           msg: 'บันทึกงาน #' + ref + ' แล้ว' + (status === 'รออนุมัติ' ? ' (รออนุมัติ)' : status === 'รอทีม AI' ? ' — เข้าคิวทีม AI' : '') };
}

// ฟอร์มฝากงานของทีม (request.html) → ไม่ pre-approve, ผ่านด่านอนุมัติปกติ
function handleSubmitRequest(body) {
  const r = createTaskDirect({
    biz: body.biz, type: body.type, detail: body.detail, urgency: body.urgency,
    due: body.due, assignee: body.assignee, dept: body.dept,
    from: body.name || body.from || 'ฟอร์มฝากงาน', contact: body.contact || '', image: body.image || ''
  }, false);
  return jsonOut(r);
}

// ── RPC ให้หน้าบอร์ดเรียกผ่าน google.script.run (ไม่ติด CORS) ──
function rpcAddTask(key, t) {
  if (key !== cfg('QUEUE_KEY')) return { ok: false, msg: 'รหัสไม่ถูกต้อง' };
  const r = createTaskDirect(t, true);   // คุณปาล์มกรอกเอง = อนุมัติแล้ว
  if (r.ok) {
    r.task = { ref: r.ref, time: fmtTime(new Date()), status: r.status, urgency: String(t.urgency || 'ปกติ'),
               biz: String(t.biz || ''), type: String(t.type || ''), detail: String(t.detail || ''),
               due: String(t.due || ''), assignee: (String(t.assignee) === 'ทีมAI' ? 'ทีมAI' : 'คน'),
               result: '', dept: (String(t.assignee) === 'ทีมAI' ? String(t.dept || '') : ''),
               project: '', step: '', projectTitle: '', blocked: '', startedAt: '', doneAt: '' };
  }
  return r;
}

// 💬 คอมเมนต์เพื่อปรับแผน — จดลงคอลัมน์ "โน้ตจากเจ้าของ" ให้ทีม AI อ่านก่อนลงมือ
// redo = true → ส่งงานกลับเข้าคิวให้ทำใหม่ตามคอมเมนต์ (ใช้กับงานที่เสร็จแล้วหรือรออนุมัติ)
function rpcComment(key, ref, text, redo) {
  if (key !== cfg('QUEUE_KEY')) return { ok: false, msg: 'รหัสไม่ถูกต้อง' };
  const note = String(text || '').trim();
  if (!note) return { ok: false, msg: 'กรุณาพิมพ์คอมเมนต์' };
  try {
    const sheet = reqSheet();
    if (!sheet) return { ok: false, msg: 'ยังไม่ได้ตั้งค่าชีตงาน' };
    const isProject = /^PRJ/i.test(String(ref)) && String(ref).indexOf('.') === -1;
    const stamp = Utilities.formatDate(new Date(), 'GMT+7', 'd/M HH:mm');
    const line = '[' + stamp + '] ' + note;

    // คอมเมนต์ที่หัวโปรเจกต์ → ลงทุกงานย่อยของโปรเจกต์นั้น
    if (isProject) {
      appendProjectNote(String(ref), line);
      let n = 0;
      if (redo) {
        const data = sheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][14]) !== String(ref)) continue;
          if (/เสร็จ|ยกเลิก/.test(String(data[i][2]))) continue;
          sheet.getRange(i + 1, 3).setValue(String(data[i][11]) === 'ทีมAI' ? 'รอทีม AI' : 'ใหม่');
          n++;
        }
      }
      logRow(['คอมเมนต์แผน', '', String(ref), note]);
      return { ok: true, msg: 'จดคอมเมนต์ลงโปรเจกต์ ' + ref + ' แล้ว' + (redo ? (' และส่งกลับให้ทีม ' + n + ' งาน') : ''), notes: line };
    }

    const row = findRefRow(sheet, ref);
    if (!row) return { ok: false, msg: 'ไม่พบงาน #' + ref };
    ensureTimeCols(sheet);
    if (sheet.getRange(1, 19).getValue() !== 'โน้ตจากเจ้าของ') sheet.getRange(1, 19).setValue('โน้ตจากเจ้าของ');
    const cur = String(sheet.getRange(row, 19).getValue() || '');
    const all = (cur ? cur + '\n' : '') + line;
    sheet.getRange(row, 19).setValue(all);

    let status = String(sheet.getRange(row, 3).getValue() || '');
    if (redo) {
      if (String(sheet.getRange(row, 12).getValue()) === 'ทีมAI') {
        sheet.getRange(row, 3).setValue('รอทีม AI');
        sheet.getRange(row, 20).setValue('');   // ล้างเวลาเริ่ม/เสร็จ ให้รอบใหม่จับเวลาใหม่
        sheet.getRange(row, 21).setValue('');
        status = 'รอทีม AI';
        maybeFireRoutine('สั่งแก้ตามคอมเมนต์ ' + ref);
      } else {
        sheet.getRange(row, 3).setValue('ใหม่');
        status = 'ใหม่';
      }
    }
    logRow(['คอมเมนต์งาน', '', String(ref), note + (redo ? ' [สั่งทำใหม่]' : '')]);
    return { ok: true, status: status, notes: all,
             msg: 'จดคอมเมนต์ลงงาน #' + ref + ' แล้ว' + (redo ? ' — ส่งกลับให้ทีมทำใหม่ตามนี้' : '') };
  } catch (err) {
    return { ok: false, msg: 'บันทึกคอมเมนต์ไม่สำเร็จ: ' + err };
  }
}

function rpcBoardAction(key, action, ref) {
  if (key !== cfg('QUEUE_KEY')) return { ok: false, msg: 'รหัสไม่ถูกต้อง' };
  const parts = String(boardAction(action, ref) || '⚠️|ทำรายการไม่สำเร็จ').split('|');
  return { ok: parts[0] === '✅', msg: parts.slice(1).join('|') };
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
    // โหมดยิงทันที: งานใหม่เริ่มภายในไม่กี่นาที รอบตั้งเวลาเหลือแค่กันตกหล่น
    if (cfg('ROUTINE_FIRE_URL') && cfg('ROUTINE_TOKEN') && cfg('AUTO_FIRE') !== 'off') {
      return 'ทันทีที่งานเข้าคิว ⚡ (สำรอง 8:15 / 17:15 น.)';
    }
    const nowH = parseInt(Utilities.formatDate(new Date(), 'GMT+7', 'H'), 10);
    if (nowH < 8) return '08:15 น. วันนี้';
    if (nowH < 17) return '17:15 น. วันนี้';
    return '08:15 น. พรุ่งนี้';
  } catch (e) { return 'รอบถัดไปตามตาราง'; }
}

function boardHtml(key, notice, prj) {
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
+ '.bt.cmt{border-color:var(--gold);color:#8A6A22;background:var(--gold-l)}'
+ '.bt.cmt:hover{background:var(--gold);color:#fff}'
+ '.sub .act{margin:6px 0 2px;max-width:280px}'
+ '.notice{background:#E8F5EC;border:1px solid var(--green);color:#26694E;border-radius:10px;padding:10px 13px;margin-bottom:12px;font-size:.85rem}'
+ '.notice.warn{background:#FFF3E0;border-color:var(--orange);color:#8A5A12}'
+ '.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:26px;max-width:90%;background:#26694E;color:#fff;padding:11px 18px;border-radius:12px;font-size:.87rem;box-shadow:0 6px 18px rgba(0,0,0,.25);z-index:99;transition:opacity .5s}'
+ '.toast.warn{background:#8A5A12}'
+ '.bar2{display:flex;align-items:center;gap:11px;margin-bottom:11px;flex-wrap:wrap}'
+ '.add{padding:9px 17px;border-radius:99px;border:none;background:var(--navy);color:#fff;font-family:inherit;font-size:.85rem;font-weight:700;cursor:pointer}'
+ '.add:hover{background:var(--navy-d)}'
+ '.hint{font-size:.7rem;color:var(--sub)}'
+ '.mask{display:none;position:fixed;inset:0;background:rgba(18,37,64,.55);z-index:100;align-items:center;justify-content:center;padding:16px}'
+ '.mask.on{display:flex}'
+ '.modal{background:#fff;border-radius:15px;padding:19px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto}'
+ '.modal h2{font-size:1rem;color:var(--navy);margin-bottom:13px}'
+ '.modal label{display:block;font-size:.74rem;font-weight:700;color:var(--sub);margin-bottom:10px}'
+ '.modal input,.modal select,.modal textarea{width:100%;margin-top:4px;padding:9px 11px;border:1.5px solid var(--bd);border-radius:9px;font-family:inherit;font-size:.87rem;color:var(--text);background:#fff}'
+ '.modal textarea{resize:vertical}'
+ '.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
+ '.acts{display:flex;gap:9px;margin-top:5px}.acts .bt{padding:10px}'
+ '.cref{font-size:.78rem;color:var(--sub);margin-bottom:9px;padding-bottom:9px;border-bottom:1px dashed var(--bd)}'
+ '.modal label.chk{display:flex;align-items:center;gap:7px;font-weight:400;color:var(--text);font-size:.8rem}'
+ '.modal label.chk input{width:auto;margin:0}'
+ '.notes{background:#FFFDF5;border:1px dashed var(--gold);border-radius:8px;padding:7px 9px;font-size:.76rem;color:#7A5A18;white-space:pre-line}'
+ '.prevbox{max-height:120px;overflow-y:auto;margin-bottom:11px}'
+ '</style></head><body>'
+ '<div class="hd"><h1>📋 บอร์ดงาน</h1><div class="s">โรงน้ำละกอน 💧 &amp; คาเฟ่ ☕ — <span id="up"></span></div></div>'
+ '<div class="wrap"><div class="tt">👥 ทีมงาน AI <span style="font-weight:400;color:#7A8A9B">— รอบทำงานถัดไป: ' + nextRoundText() + ' · แตะการ์ดเพื่อดูงานเฉพาะฝ่าย</span></div><div class="team" id="tm"></div>'
+ '<div class="stats" id="sx"></div>'
+ '<div class="bar2"><button class="add" id="addBtn">➕ ฝากงานใหม่</button>'
+ '<span class="hint">กรอกเองไม่ผ่าน AI — ไม่กิน token</span></div>'
+ '<div class="fl" id="fx"></div>'
+ '<div class="mask" id="mask"><div class="modal">'
+ '<h2>➕ ฝากงานใหม่</h2>'
+ '<label>รายละเอียดงาน *<textarea id="f_detail" rows="3" placeholder="อยากให้ทำอะไร บอกให้ชัดที่สุด"></textarea></label>'
+ '<div class="row2"><label>ธุรกิจ<select id="f_biz"><option>โรงน้ำ</option><option>คาเฟ่</option><option>อื่นๆ</option></select></label>'
+ '<label>ความเร่งด่วน<select id="f_urg"><option>ปกติ</option><option>ด่วนมาก</option><option>ไม่เร่ง</option></select></label></div>'
+ '<div class="row2"><label>หัวข้อสั้น ๆ<input id="f_type" placeholder="เช่น ทำโพสต์, หาอะไหล่"></label>'
+ '<label>กำหนดเสร็จ<input id="f_due" placeholder="เช่น ศุกร์นี้ (ไม่ใส่ก็ได้)"></label></label></div>'
+ '<div class="row2"><label>ใครทำ<select id="f_who"><option value="ทีมAI">🤖 ทีม AI</option><option value="คน">👤 คน</option></select></label>'
+ '<label id="deptWrap">แผนก<select id="f_dept"></select></label></div>'
+ '<div class="acts"><button class="bt cancel" id="fClose">ยกเลิก</button><button class="bt run" id="fSave">บันทึกงาน</button></div>'
+ '</div></div>'
+ '<div class="mask" id="cmask"><div class="modal">'
+ '<h2>💬 คอมเมนต์ / ปรับแผน</h2><div class="cref" id="c_ref"></div>'
+ '<div id="c_prev"></div>'
+ '<label>คอมเมนต์ของคุณ *<textarea id="c_text" rows="4" placeholder="เช่น ขอให้เน้นกลุ่มร้านอาหารก่อน / เปลี่ยนโทนให้เป็นทางการกว่านี้ / ตัดขั้นที่ 3 ออก"></textarea></label>'
+ '<label class="chk"><input type="checkbox" id="c_redo"> <span>ส่งกลับให้ทีมทำใหม่ตามคอมเมนต์นี้เลย</span></label>'
+ '<div class="acts"><button class="bt cancel" id="cClose">ปิด</button><button class="bt run" id="cSave">บันทึกคอมเมนต์</button></div>'
+ '</div></div>'
+ '<div id="ib"></div><div id="sd"></div><div id="pj"></div><div class="cards" id="cx"></div><div class="em" id="ex" style="display:none">ไม่มีงานในหมวดนี้ ✨</div></div>'
+ '<script>' + boardScript(json, key, notice, prj) + '</scr' + 'ipt></body></html>';
}

// ── สคริปต์ฝั่งหน้าเว็บของบอร์ด (แยกออกมาให้อ่าน/แก้ง่ายกว่าเดิม) ──────────
// ตัวกรองมี 2 ชั้นที่ใช้ร่วมกันได้:
//   FD = ฝ่าย  ("" = ทุกฝ่าย, "_sec" = คุณเลขา, นอกนั้นคือรหัสแผนก)
//   F  = สถานะ (open/urgent/wait/ai/doing/blocked/human/done/all)
// เช่น เลือกฝ่ายดีไซน์ แล้วกดไทล์ "เสร็จแล้ว" = เห็นเฉพาะงานดีไซน์ที่เสร็จแล้ว
function boardScript(json, key, notice, prj) {
  return [
    'var ALL=' + json + ';',
    'var SCHED=' + JSON.stringify(readScheduledAll()).replace(/</g, '\\u003c') + ';',
    'var IDEAS=' + JSON.stringify(readIdeasAll()).replace(/</g, '\\u003c') + ';',
    'var KEY=' + JSON.stringify(String(key || '')) + ';',
    'var BASE=' + JSON.stringify(ScriptApp.getService().getUrl()) + ';',
    'var NOTICE=' + JSON.stringify(String(notice || '')) + ';',
    'var PRJ=' + JSON.stringify(String(prj || '')) + ';',   // เปิดแบบเจาะโปรเจกต์เดียว (โหมด Workflow)
    'var NEXT=' + JSON.stringify(nextRoundText()) + ';',
    'var F="open";var FD="";',
    'var TEAM=[{k:"data",e:"🗄️",n:"ฝ่ายข้อมูล"},{k:"finance",e:"💰",n:"การเงิน"},{k:"analyst",e:"📈",n:"นักวิเคราะห์"},{k:"content",e:"🎨",n:"ดีไซน์"},{k:"writer",e:"✍️",n:"นักเขียน"},{k:"researcher",e:"🔍",n:"นักวิจัย"},{k:"procurement",e:"🛒",n:"จัดซื้อ"},{k:"coder",e:"💻",n:"โค้ด"}];',
    'var FS=[["open","ค้างอยู่"],["urgent","🔴 ด่วนมาก"],["wait","⏳ รออนุมัติ"],["ai","🤖 รอทีม AI"],["doing","⚙️ กำลังทำ"],["blocked","⏸️ รอข้อมูล"],["human","👤 งานคน"],["prj","📁 Workflow"],["done","✅ เสร็จแล้ว"],["cancelled","🗑️ ที่ยกเลิก"],["all","ทั้งหมด"]];',
    'function E(s){return String(s==null?"":s).replace(/[&<>"]/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[m]})}',
    'function done(t){return /เสร็จ|ปิด|ยกเลิก/.test(t.status||"")}',
    'function canc(t){return /ยกเลิก/.test(t.status||"")}',

    // ตัวกรอง: ฝ่าย × สถานะ — งาน "ยกเลิก" ไม่โผล่ในมุมมองปกติ (ดูได้จากชิป 🗑️ ที่ยกเลิก เท่านั้น)
    'function inDept(t){if(!FD)return 1;return FD=="_sec"?!t.dept:t.dept==FD}',
    'function stMatch(t){if(F=="all")return !canc(t);if(F=="open")return !done(t);if(F=="urgent")return t.urgency=="ด่วนมาก"&&!done(t);'
    + 'if(F=="wait")return t.status=="รออนุมัติ";if(F=="ai")return t.status=="รอทีม AI";if(F=="doing")return t.status=="กำลังทำ (AI)";'
    + 'if(F=="blocked")return t.status=="รอข้อมูล";if(F=="human")return (t.assignee=="คน"||!t.assignee)&&!done(t);'
    + 'if(F=="prj")return !!t.project&&!canc(t);if(F=="done")return done(t)&&!canc(t);if(F=="cancelled")return canc(t);return 1}',
    'function mt(t){if(PRJ)return t.project==PRJ;return inDept(t)&&stMatch(t)}',

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

    // 📣 กล่องประกาศตั้งเวลา — แก้เวลา/เนื้อหา หรือยกเลิกได้จากบอร์ดเลย
    'function schedBox(){var el=document.getElementById("sd");if(!SCHED.length){el.innerHTML="";return}'
    + 'el.innerHTML=\'<div class="prj" style="border-left-color:var(--gold)"><h3>📣 ประกาศตั้งเวลา (\'+SCHED.length+\')</h3>\'+SCHED.map(function(s,i){'
    + 'return \'<div class="sub"><span>🕐</span><span><b>\'+E(s.time)+\'</b>\'+(s.repeat=="ทุกวัน"?" · ส่งซ้ำทุกวัน":"")+\' → 👥 \'+E(s.group)+\'<br>\''
    + '+(s.type=="สรุปงาน"?\'<span style="color:#5B9BA0">📊 สรุปงานจากบอร์ด (สร้างสดตอนส่ง)</span>\':\'<span style="color:#7A8A9B">\'+E(String(s.content).slice(0,160))+(s.content.length>160?"…":"")+"</span>")'
    + '+\'<div class="act" style="max-width:380px;margin-top:6px"><button class="bt run" data-snow="\'+i+\'">📤 ส่งเลย</button><button class="bt cmt" data-sedit="\'+i+\'">✏️ แก้ไข</button><button class="bt cancel" data-scancel="\'+i+\'">✕ ยกเลิก</button></div></span></div>\'}).join("")+"</div>"}',

    // 💡 กล่องบอร์ดไอเดีย — ไอเดียที่คุณปาล์มแปะไว้ รอวันหยิบมาลุย (จัดการผ่านไลน์: ทำไอเดีย/พับไอเดีย <เลข>)
    'function ideaBox(){var el=document.getElementById("ib");if(!IDEAS.length){el.innerHTML="";return}'
    + 'var ic={"ใหม่":"🌱","ส่งเข้าทีมแล้ว":"🚀","พับไว้":"📦"};'
    + 'el.innerHTML=\'<div class="prj" style="border-left-color:var(--teal)"><h3>💡 บอร์ดไอเดีย (\'+IDEAS.length+\')</h3>\'+IDEAS.map(function(s){'
    + 'return \'<div class="sub"><span>\'+(ic[s.status]||"🌱")+\'</span><span><b>#\'+s.row+\'</b> \'+E(s.idea)'
    + '+(s.take?\'<br><span style="color:#5B9BA0">💬 เลขา: \'+E(s.take)+"</span>":"")'
    + '+\'<br><span style="color:#7A8A9B;font-size:12px">\'+E(s.time)+(s.by?" · "+E(s.by):"")+(s.status!="ใหม่"?" · "+E(s.status):"")+"</span></span></div>"}).join("")'
    + '+\'<div style="color:#7A8A9B;font-size:12px;margin-top:8px">สั่งในไลน์: "ทำไอเดีย เลข" เริ่มลงมือ · "พับไอเดีย เลข" เก็บไว้ก่อน · "ไอเดีย ..." แปะเพิ่ม</div></div>\'}',

    // วาดบอร์ด — ไทล์สถิตินับเฉพาะขอบเขตฝ่ายที่เลือกอยู่ และกดเพื่อกรองสถานะได้
    'function render(){team();ideaBox();schedBox();'
    + 'var scope=ALL.filter(inDept),op=scope.filter(function(t){return !done(t)});'
    + 'var S=[["open",op.length,"งานค้าง",""],["urgent",op.filter(function(t){return t.urgency=="ด่วนมาก"}).length,"ด่วนมาก","red"],'
    + '["ai",scope.filter(function(t){return t.status=="รอทีม AI"}).length,"รอทีม AI","ai"],["done",scope.filter(function(t){return done(t)&&!canc(t)}).length,"เสร็จแล้ว","dn"]];'
    + 'document.getElementById("sx").innerHTML=S.map(function(s){return \'<div class="st \'+s[3]+(F==s[0]?" on":"")+\'" data-f="\'+s[0]+\'"><div class="n">\'+s[1]+\'</div><div class="l">\'+s[2]+\'</div></div>\'}).join("");'
    + 'bind("#sx .st",function(el){setF(el.getAttribute("data-f"))});'
    + 'var chips=FS.map(function(f){return \'<button class="ch\'+(f[0]==F?" on":"")+\'" data-f="\'+f[0]+\'">\'+f[1]+\'</button>\'}).join("");'
    + 'if(PRJ)chips=\'<button class="ch on" id="prjOff">📁 \'+E(PRJ)+\' ✕ ดูทั้งบอร์ด</button>\';'
    + 'if(FD)chips=\'<button class="ch on" data-d="\'+FD+\'">\'+deptName(FD)+\' ✕</button>\'+chips;'
    + 'document.getElementById("fx").innerHTML=chips;'
    + 'bind("#fx .ch",function(el){if(el.id=="prjOff"){PRJ="";render();return}var d=el.getAttribute("data-d");if(d)pick(d);else setF(el.getAttribute("data-f"))});'
    + 'var list=ALL.filter(mt),ph="",seen={};'
    + 'list.filter(function(t){return t.project}).forEach(function(t){if(seen[t.project])return;seen[t.project]=1;'
    + 'var st=ALL.filter(function(x){return x.project==t.project}).sort(function(a,b){return a.step-b.step});'
    + 'var dn=st.filter(done).length,pc=Math.round(dn/st.length*100);'
    + 'ph+=\'<div class="prj"><h3>📁 \'+E(t.projectTitle||t.project)+\'</h3><div class="mt">\'+E(t.project)+\' · \'+dn+\'/\'+st.length+\' เสร็จ\'+(t.from&&t.from!="LINE"?\' · 👤 แจ้งโดย \'+E(t.from):"")+\'</div>\'+'
    + '\'<div class="bar"><i style="width:\'+pc+\'%"></i></div>\'+st.map(function(s){var ic=done(s)?"✅":(s.status=="กำลังทำ (AI)"?"⚙️":(s.status=="รอข้อมูล"?"⏸️":(s.status=="รออนุมัติ"?"📝":"⏳")));'
    + 'return \'<div class="sub"><span>\'+ic+\'</span><span><b>\'+s.step+\'.</b> \'+E(s.detail)+\' <span style="color:#7A8A9B">— \'+E(s.dept||s.assignee)+\' · \'+E(s.status)+(s.startedAt?\' · เริ่ม \'+E(s.startedAt):"")+(s.doneAt?\' · เสร็จ \'+E(s.doneAt):"")+\'</span>\'+(s.blocked?\'<br><span style="color:#C8842A;font-size:.75rem">\'+E(s.blocked)+\'</span>\':"")'
    + '+(s.inputsTxt?\'<br><span style="color:#5B9BA0;font-size:.73rem">📥 \'+E(s.inputsTxt)+\'</span>\':"")'
    + '+(s.output?\'<br><span style="color:#3D9970;font-size:.73rem">📤 \'+E(s.output)+\'</span>\':"")'
    + '+(s.notes?\'<div class="notes" style="margin-top:5px">💬 \'+E(s.notes)+\'</div>\':"")'
    + '+(done(s)?"":\'<div class="act"><button class="bt run" data-run="\'+E(s.ref)+\'">⚡ เริ่มทันที</button><button class="bt cmt" data-cmt="\'+E(s.ref)+\'">💬</button><button class="bt cancel" data-cancel="\'+E(s.ref)+\'">✕</button></div>\')+\'</span></div>\'}).join("")'
    + '+\'<div class="act" style="max-width:330px"><button class="bt run" data-wf="\'+E(t.project)+\'">🗂️ ดู Workflow</button><button class="bt cmt" data-cmt="\'+E(t.project)+\'">💬 คอมเมนต์ทั้งโปรเจกต์</button></div>\'+\'</div>\'});'
    + 'document.getElementById("pj").innerHTML=ph;'
    + 'var solo=list.filter(function(t){return !t.project});'
    + 'var ord={"ด่วนมาก":0,"ปกติ":1,"ไม่เร่ง":2};solo.sort(function(a,b){return (ord[a.urgency]==null?1:ord[a.urgency])-(ord[b.urgency]==null?1:ord[b.urgency])});'
    + 'var exEl=document.getElementById("ex");exEl.style.display=(list.length?"none":"block");'
    + 'exEl.textContent=(F=="prj"?"ยังไม่มีโปรเจกต์แบบหลายขั้นค่ะ — ลองฝากงานใหญ่ให้ดิฉันวางแผน (เช่น สั่งทางไลน์ว่า ทำแคมเปญเปิดตัวสินค้าใหม่) แล้ว Workflow จะมาแสดงตรงนี้ให้คอมเมนต์/ปรับได้เลยค่ะ ✨":(F=="cancelled"?"ไม่มีงานที่ยกเลิกค่ะ ✨":"ไม่มีงานในหมวดนี้ ✨"));'
    + 'document.getElementById("cx").innerHTML=solo.map(function(t){var u=t.urgency=="ด่วนมาก"?"u":(t.urgency=="ไม่เร่ง"?"l":"n");'
    + 'var ub=t.urgency=="ด่วนมาก"?"background:#FBE9E7;color:#C0392B":(t.urgency=="ไม่เร่ง"?"background:#E8F5EC;color:#3D9970":"background:#FFF3E0;color:#C8842A");'
    + 'return \'<div class="cd \'+u+\'"><div style="display:flex;justify-content:space-between;gap:6px"><span class="rf">#\'+E(t.ref)+\'</span>\'+'
    + '\'<span><span class="bg" style="\'+ub+\'">\'+E(t.urgency||"ปกติ")+\'</span> <span class="bg" style="background:#EAF0F7;color:#1B3558">\'+E(t.status)+\'</span></span></div>\'+'
    + '\'<div class="dt">\'+E(t.detail)+\'</div><div class="mt">\'+(t.from&&t.from!="LINE"?"<span>👤 แจ้งโดย "+E(t.from)+"</span>":"")+(t.biz?"<span>🏢 "+E(t.biz)+"</span>":"")+(t.dept?"<span>🤖 "+E(t.dept)+"</span>":"")+(t.due?"<span>⏳ "+E(t.due)+"</span>":"")+\'</div>\'+'
    + '\'<div class="mt tl">\'+(t.time?"<span>📥 รับ "+E(t.time)+"</span>":"")+(t.status=="รอทีม AI"?\'<span style="color:#C8842A">⏰ คิวเริ่ม \'+E(NEXT)+\'</span>\':"")+(t.startedAt?"<span>⚙️ เริ่ม "+E(t.startedAt)+"</span>":"")+(t.doneAt?"<span>✅ เสร็จ "+E(t.doneAt)+"</span>":"")+\'</div>\'+'
    + '(t.result?\'<div class="rs">💬 \'+E(String(t.result).slice(0,300))+\'</div>\':"")'
    + '+(t.notes?\'<div class="notes">💬 \'+E(t.notes)+\'</div>\':"")'
    + '+\'<div class="act">\'+(done(t)?"":\'<button class="bt run" data-run="\'+E(t.ref)+\'">⚡ เริ่มทันที</button>\')'
    + '+\'<button class="bt cmt" data-cmt="\'+E(t.ref)+\'">💬 คอมเมนต์</button>\''
    + '+(done(t)?"":\'<button class="bt cancel" data-cancel="\'+E(t.ref)+\'">✕ ยกเลิก</button>\')+\'</div>\''
    + '+\'</div>\'}).join("");'
    + 'bindActions()}',

    // ป๊อปอัปแจ้งผลมุมล่าง (หายเองใน 4 วิ)
    'function toast(msg,ok){var t=document.createElement("div");t.className="toast"+(ok?"":" warn");'
    + 't.textContent=(ok?"✅ ":"⚠️ ")+msg;document.body.appendChild(t);'
    + 'setTimeout(function(){t.style.opacity="0"},3400);setTimeout(function(){t.remove()},4000)}',
    // เรียกฟังก์ชันบนเซิร์ฟเวอร์ — ใช้ google.script.run ก่อน (ไม่ติด CORS) ถ้าไม่มีค่อย fallback เป็น fetch
    'function rpc(fn,args,qs,cb){'
    + 'try{if(window.google&&google.script&&google.script.run){'
    + 'google.script.run.withSuccessHandler(cb).withFailureHandler(function(e){cb({ok:false,msg:String(e&&e.message||e)})})[fn].apply(null,args);return}}catch(e){}'
    + 'fetch(BASE+"?"+qs).then(function(x){return x.json()}).then(cb)'
    + '.catch(function(){cb({ok:false,msg:"เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งนะคะ"})})}',
    // ปุ่มยกเลิก/เริ่มทันที — อยู่หน้าเดิม อัปเดตการ์ดทันที + ป๊อปอัปแจ้งผล
    'function go(a,r){rpc("rpcBoardAction",[KEY,a,r],'
    + '"action=boardDo&key="+encodeURIComponent(KEY)+"&do="+a+"&ref="+encodeURIComponent(r),'
    + 'function(j){toast(j.msg,j.ok);'
    + 'if(j.ok){ALL.forEach(function(t){if(t.ref==r){if(a=="cancel")t.status="ยกเลิก";if(a=="runnow")t.status="รอทีม AI"}});render()}})}',

    // ── ฟอร์มฝากงาน (เขียนลงชีตตรง ๆ ไม่เรียก Claude) ──
    'var DEPTS=[["","— ให้เลือกให้ —"],["content","🎨 ดีไซน์/คอนเทนต์"],["writer","✍️ นักเขียน"],["analyst","📈 นักวิเคราะห์"],'
    + '["researcher","🔍 นักวิจัย"],["procurement","🛒 จัดซื้อ"],["finance","💰 การเงิน"],["data","🗄️ ฝ่ายข้อมูล"],["coder","💻 โค้ด/ระบบ"]];',
    'function initForm(){'
    + 'document.getElementById("f_dept").innerHTML=DEPTS.map(function(d){return \'<option value="\'+d[0]+\'">\'+d[1]+"</option>"}).join("");'
    + 'var mask=document.getElementById("mask"),who=document.getElementById("f_who");'
    + 'function tgl(){document.getElementById("deptWrap").style.display=(who.value=="ทีมAI"?"block":"none")}'
    + 'who.onchange=tgl;tgl();'
    + 'document.getElementById("addBtn").onclick=function(){mask.className="mask on";document.getElementById("f_detail").focus()};'
    + 'document.getElementById("fClose").onclick=function(){mask.className="mask"};'
    + 'mask.onclick=function(e){if(e.target===mask)mask.className="mask"};'
    + 'document.getElementById("fSave").onclick=function(){'
    + 'var d=document.getElementById("f_detail").value.trim();'
    + 'if(!d){toast("กรอกรายละเอียดงานก่อนนะคะ",false);return}'
    + 'var t={detail:d,biz:document.getElementById("f_biz").value,urgency:document.getElementById("f_urg").value,'
    + 'type:document.getElementById("f_type").value,due:document.getElementById("f_due").value,'
    + 'assignee:who.value,dept:(who.value=="ทีมAI"?document.getElementById("f_dept").value:"")};'
    + 'var b=this;b.disabled=true;b.textContent="กำลังบันทึก...";'
    + 'rpc("rpcAddTask",[KEY,t],"action=addTask&key="+encodeURIComponent(KEY)+"&detail="+encodeURIComponent(t.detail)'
    + '+"&biz="+encodeURIComponent(t.biz)+"&urgency="+encodeURIComponent(t.urgency)+"&type="+encodeURIComponent(t.type)'
    + '+"&due="+encodeURIComponent(t.due)+"&assignee="+encodeURIComponent(t.assignee)+"&dept="+encodeURIComponent(t.dept),'
    + 'function(j){b.disabled=false;b.textContent="บันทึกงาน";toast(j.msg,j.ok);'
    + 'if(j.ok){if(j.task)ALL.unshift(j.task);mask.className="mask";'
    + 'document.getElementById("f_detail").value="";document.getElementById("f_type").value="";document.getElementById("f_due").value="";'
    + 'F="open";FD="";render()}})}}',
    'function bindActions(){'
    + 'bind("#cx [data-cancel],#pj [data-cancel]",function(el){var r=el.getAttribute("data-cancel");'
    + 'if(confirm("ยืนยันยกเลิกงาน #"+r+" ?\\n\\nงานนี้จะถูกปิดและทีม AI จะไม่ทำต่อ"))go("cancel",r)});'
    + 'bind("#cx [data-run],#pj [data-run]",function(el){var r=el.getAttribute("data-run");'
    + 'if(confirm("ให้ทีม AI เริ่มทำงาน #"+r+" ทันทีเลยไหม ?\\n\\nไม่ต้องรอรอบ "+NEXT))go("runnow",r)});'
    + 'bind("#cx [data-cmt],#pj [data-cmt]",function(el){openCmt(el.getAttribute("data-cmt"))});'
    + 'bind("#pj [data-wf]",function(el){PRJ=el.getAttribute("data-wf");render();window.scrollTo(0,0)});'
    // ปุ่มบนกล่องประกาศตั้งเวลา
    + 'bind("#sd [data-snow]",function(el){var i=+el.getAttribute("data-snow"),s=SCHED[i];'
    + 'if(!confirm("ส่งประกาศนี้เข้ากลุ่ม "+s.group+" เดี๋ยวนี้เลยไหม?\\n\\n"+(s.type=="สรุปงาน"?"(สรุปงานจะถูกสร้างสดตอนกดส่ง)":String(s.content).slice(0,120))))return;'
    + 'rpc("rpcSchedAction",[KEY,"sendnow",s.row,"",""],'
    + '"action=schedDo&key="+encodeURIComponent(KEY)+"&do=sendnow&row="+s.row,'
    + 'function(j){toast(j.msg,j.ok);if(j.ok){if(s.repeat!="ทุกวัน")SCHED.splice(i,1);render()}})});'
    + 'bind("#sd [data-scancel]",function(el){var i=+el.getAttribute("data-scancel"),s=SCHED[i];'
    + 'if(!confirm("ยกเลิกประกาศ "+s.time+" → "+s.group+" ?"))return;'
    + 'rpc("rpcSchedAction",[KEY,"cancel",s.row,"",""],'
    + '"action=schedDo&key="+encodeURIComponent(KEY)+"&do=cancel&row="+s.row,'
    + 'function(j){toast(j.msg,j.ok);if(j.ok){SCHED.splice(i,1);render()}})});'
    + 'bind("#sd [data-sedit]",function(el){var i=+el.getAttribute("data-sedit"),s=SCHED[i];'
    + 'var w=prompt("เวลาส่งใหม่ (เว้นว่าง = ใช้เวลาเดิม "+s.time+")\\nเช่น พรุ่งนี้ 8 โมงครึ่ง / วันนี้ 18:00 / อีก 2 ชั่วโมง","");if(w===null)return;'
    + 'var c="";if(s.type!="สรุปงาน"){c=prompt("เนื้อหาใหม่ (เว้นว่าง = ใช้เนื้อหาเดิม)",s.content);if(c===null)return}'
    + 'if(!w&&(!c||c==s.content)){toast("ไม่มีอะไรเปลี่ยนค่ะ",false);return}'
    + 'rpc("rpcSchedAction",[KEY,"edit",s.row,w||"",(c&&c!=s.content)?c:""],'
    + '"action=schedDo&key="+encodeURIComponent(KEY)+"&do=edit&row="+s.row+"&when="+encodeURIComponent(w||"")+"&content="+encodeURIComponent((c&&c!=s.content)?c:""),'
    + 'function(j){toast(j.msg,j.ok);if(j.ok){if(j.time)s.time=j.time;if(j.content)s.content=j.content;render()}})})}',

    // ── กล่องคอมเมนต์ปรับแผน ──
    'var CREF="";',
    'function openCmt(r){CREF=r;var t=null;ALL.forEach(function(x){if(x.ref==r)t=x});'
    + 'document.getElementById("c_ref").innerHTML=t?("#"+E(r)+" — "+E(t.detail)):("โปรเจกต์ "+E(r)+" (ลงทุกงานย่อย)");'
    + 'document.getElementById("c_prev").innerHTML=(t&&t.notes)?\'<div class="notes prevbox">\'+E(t.notes)+"</div>":"";'
    + 'document.getElementById("c_text").value="";document.getElementById("c_redo").checked=false;'
    + 'document.getElementById("cmask").className="mask on";document.getElementById("c_text").focus()}',
    'function initCmt(){var m=document.getElementById("cmask");'
    + 'document.getElementById("cClose").onclick=function(){m.className="mask"};'
    + 'm.onclick=function(e){if(e.target===m)m.className="mask"};'
    + 'document.getElementById("cSave").onclick=function(){'
    + 'var tx=document.getElementById("c_text").value.trim(),rd=document.getElementById("c_redo").checked;'
    + 'if(!tx){toast("พิมพ์คอมเมนต์ก่อนนะคะ",false);return}'
    + 'var b=this;b.disabled=true;b.textContent="กำลังบันทึก...";'
    + 'rpc("rpcComment",[KEY,CREF,tx,rd],"action=comment&key="+encodeURIComponent(KEY)+"&ref="+encodeURIComponent(CREF)'
    + '+"&text="+encodeURIComponent(tx)+"&redo="+(rd?"1":"0"),'
    + 'function(j){b.disabled=false;b.textContent="บันทึกคอมเมนต์";toast(j.msg,j.ok);'
    + 'if(j.ok){ALL.forEach(function(x){if(x.ref==CREF){if(j.notes)x.notes=j.notes;if(j.status)x.status=j.status}});'
    + 'm.className="mask";render()}})}}',
    'if(NOTICE){var pr=NOTICE.split("|");toast(pr.slice(1).join("|"),pr[0]=="✅")}',
    'document.getElementById("up").textContent="อัปเดต "+new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});',
    'initForm();initCmt();render();setTimeout(function(){location.reload()},120000);'
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
    if (sheet.getRange(1, 22).getValue() !== 'ต้องรอขั้น') {
      sheet.getRange(1, 22, 1, 3).setValues([['ต้องรอขั้น', 'ใช้ข้อมูลจาก', 'ผลลัพธ์ที่คาด']]);
    }
    plan.steps.slice(0, 10).forEach(function (s, i) {
      const ref = pid + '.' + (i + 1);
      const dept = String(s.dept || '');
      const human = (dept === 'เจ้าของ' || dept === 'คน');
      const assignee = human ? 'คน' : (dept === 'เลขา' ? 'เลขา' : 'ทีมAI');
      const deps = (s.dependsOn || []).map(Number).filter(function (n) { return n > 0; }).join(',');
      const inputs = (s.inputs || []).map(function (x) {
        const K = { sheet: '📄ชีต', drive: '📁ไดรฟ์', ask: '🙋ถาม', step: '↩️ขั้น' };
        return (K[x.kind] || x.kind) + ':' + (x.ref || '') + (x.note ? ' (' + x.note + ')' : '');
      }).join(' · ');
      sheet.appendRow([
        ref, now, 'รออนุมัติ', plan.urgency || 'ปกติ', plan.biz || '', 'งานย่อย', lineUserName(senderId),
        senderId || '', s.detail || '', '', '', assignee, '', (human || dept === 'เลขา') ? '' : dept,
        pid, i + 1, plan.title || '', s.needs || '', '', '', '',
        deps, inputs, s.output || ''
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
          + (plan.why ? ('💡 ' + plan.why + '\n') : '')
          + (plan.biz ? ('🏢 ' + plan.biz + '\n') : '') + '\nแผนที่วางไว้:\n';
  plan.steps.slice(0, 10).forEach(function (s, i) {
    const par = (s.dependsOn && s.dependsOn.length) ? (' (รอขั้น ' + s.dependsOn.join(',') + ')') : ' (เริ่มได้เลย)';
    msg += (i + 1) + '. ' + (DEPT[s.dept] || s.dept || '') + ' — ' + (s.detail || '') + par + '\n';
    if (s.inputs && s.inputs.length) {
      msg += '     📥 ' + s.inputs.map(function (x) { return (x.ref || '') + (x.note ? '(' + x.note + ')' : ''); }).join(', ') + '\n';
    } else if (s.needs) { msg += '     ต้องมีก่อน: ' + s.needs + '\n'; }
  });
  if (plan.risks && plan.risks.length) msg += '\n⚠️ จุดเสี่ยง: ' + plan.risks.join(' / ') + '\n';
  if (plan.openQuestions && plan.openQuestions.length) {
    msg += '\n❓ ขอถามก่อนเริ่ม:\n' + plan.openQuestions.map(function (q, i) { return '  ' + (i + 1) + '. ' + q; }).join('\n') + '\n';
  }
  msg += '\n🔗 ดู Workflow: ' + boardUrl() + '&prj=' + encodeURIComponent(pid)
       + '\n\nอนุมัติไหมคะ?\n'
       + '• "อนุมัติ ' + pid + '" — ให้ทีมเริ่มเลย\n'
       + '• "แก้ ' + pid + ' : ..." — บอกที่อยากปรับ (หรือกด 💬 บนบอร์ด)\n'
       + '• "ยกเลิก ' + pid + '"';
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
    if (isAI) maybeFireRoutine('อนุมัติงาน ' + pid);
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
  if (n) maybeFireRoutine('อนุมัติแผน ' + pid);
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
  // มีข้อมูล dependsOn ไหม (แผนจากนักวางแผน) — ถ้าไม่มีใช้วิธีเดิม (เรียงเลขขั้น)
  let hasDeps = false, firstStep = 999;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14]) !== pid || String(data[i][2]) !== 'รออนุมัติ') continue;
    firstStep = Math.min(firstStep, Number(data[i][15]) || 1);
    if (String(data[i][21] || '') !== '') hasDeps = true;
  }
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14]) !== pid || String(data[i][2]) !== 'รออนุมัติ') continue;
    const step = Number(data[i][15]) || 1;
    const isAI = String(data[i][11]) === 'ทีมAI';
    // ปลดล็อกถ้า: (มี deps → ขั้นนี้ไม่ต้องรอใคร) / (ไม่มี deps → ขั้นแรกสุด)
    const active = hasDeps ? (String(data[i][21] || '') === '') : (step === firstStep);
    sheet.getRange(i + 1, 3).setValue(active ? (isAI ? 'รอทีม AI' : 'ใหม่') : 'รอลำดับ');
    if (active && !isAI) notifyHumanStep(data[i][0], data[i][8]);
    count++;
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
  // รวบรวมสถานะรายขั้น + เช็คว่าโปรเจกต์นี้มีข้อมูล dependsOn ไหม
  let waiting = [], doneSteps = {}, hasDeps = false, anyWorking = false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14]) !== pid) continue;
    const st = String(data[i][2]);
    const stepNo = Number(data[i][15]) || 0;
    if (String(data[i][21] || '') !== '') hasDeps = true;
    if (/เสร็จ|ยกเลิก/.test(st)) doneSteps[stepNo] = true;
    if (st === 'รอลำดับ') waiting.push({ i: i, step: stepNo, ai: String(data[i][11]) === 'ทีมAI',
                                          deps: String(data[i][21] || '').split(',').map(Number).filter(Boolean) });
    if (st === 'รอทีม AI' || st === 'กำลังทำ (AI)' || st === 'ใหม่' || st === 'รอข้อมูล') anyWorking = true;
  }
  const rows = waiting;
  let unlock = [];
  if (hasDeps) {
    // ปลดทุกขั้นที่ "ขั้นที่ต้องรอ" เสร็จครบแล้ว — ไม่ต้องรอให้ขั้นอื่นที่ไม่เกี่ยวเสร็จ
    unlock = rows.filter(function (r) { return r.deps.every(function (d) { return doneSteps[d]; }); });
  } else {
    if (anyWorking) return; // วิธีเดิม: รอให้งานค้างเสร็จหมดก่อน แล้วปลดขั้นถัดไปตามเลข
    let nextStep = 9999;
    rows.forEach(function (r) { if (r.step < nextStep) nextStep = r.step; });
    unlock = rows.filter(function (r) { return r.step === nextStep; });
  }
  let unlockedAI = false;
  unlock.forEach(function (r) {
    sheet.getRange(r.i + 1, 3).setValue(r.ai ? 'รอทีม AI' : 'ใหม่');
    if (r.ai) unlockedAI = true; else notifyHumanStep(data[r.i][0], data[r.i][8]);
  });
  if (unlockedAI) maybeFireRoutine('ปลดล็อกขั้นถัดไปของ ' + pid);
  if (hasDeps && (anyWorking || unlock.length)) return; // ยังไม่จบโปรเจกต์
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
// มีคำถามที่ยัง "รอตอบ" ในห้องนี้ไหม
function hasPendingQuestion(chatId) {
  try {
    const s = qSheet(); if (!s) return false;
    const data = s.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][3]) === String(chatId) && String(data[i][5]) === 'รอตอบ') return true;
    }
  } catch (e) {}
  return false;
}

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
            const prevNote = String(sheet.getRange(j + 1, 18).getValue() || '').replace(/^รอคำตอบ:[^|]*/, '').trim();
            sheet.getRange(j + 1, 18).setValue((prevNote ? prevNote + ' | ' : '') + 'ได้ข้อมูลแล้ว: ' + answer.slice(0, 500));
            if (isAI) maybeFireRoutine('ได้คำตอบแล้ว ' + ref);
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
                   dept: r[13] || '', project: r[14] || '', step: r[15] || '', projectTitle: r[16] || '', needs: r[17] || '',
                   ownerNotes: r[18] || '',            // 💬 คอมเมนต์/คำสั่งแก้จากคุณปาล์ม — ต้องทำตามนี้ก่อน
                   previousResult: r[12] || '',        // ผลงานรอบก่อน (กรณีสั่งทำใหม่)
                   image: r[10] || '' });              // ลิงก์รูปแนบ (คำบรรยายรูปอยู่ใน needs)
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
  // งานเดี่ยว → แจ้งทันที / งานย่อยในโปรเจกต์ → ไม่เด้งรายชิ้น (กันสแปม)
  // ความคืบหน้าดูในหน้า Workflow และจะแจ้งรวมตอนถึงขั้นของคน/จบโปรเจกต์
  if (owner && !pid) linePush(owner, '✅ ทีม AI ทำงาน #' + body.ref + ' เสร็จแล้วค่ะ\n' + String(body.result || '').slice(0, 500));
  if (pid) advanceProject(pid); // ปลดล็อกงานย่อยขั้นถัดไป
  return jsonOut({ ok: true });
}

// ════════════════════════════════════════════════════════════
//  ความจำบทสนทนา (เก็บ 10 ข้อความล่าสุดต่อคน ในแท็บ Memory)
// ════════════════════════════════════════════════════════════
const MEM_MAX = 24;      // จำนวนข้อความล่าสุดที่เก็บ (user+assistant นับรวมกัน) — 12 รอบสนทนา
                         // เดิม 6 ทำให้ร่างประกาศที่คุยกันไว้หลุดความจำใน 3 รอบ เลขาเลย "ลืม" สิ่งที่เพิ่งร่างเอง
const MEM_ITEM_MAX = 2000; // ตัดความยาวต่อข้อความแทน เพื่อคุม token (เก็บหลายรอบแต่ไม่บวม)

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
    history.push({ role: 'user', content: String(userText || '').slice(0, MEM_ITEM_MAX) });
    history.push({ role: 'assistant', content: String(assistantText || '').slice(0, MEM_ITEM_MAX) });
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

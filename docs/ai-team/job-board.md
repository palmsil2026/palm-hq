# 📋 บอร์ดรับงาน (Job Intake Board) — คู่มือตั้งค่า & ใช้งาน

หน้า `request.html` คือฟอร์มให้ **คนอื่นฝากงานมาให้คุณ** — กรอกรายละเอียด แนบรูป ระบุความเร่งด่วน
ข้อมูลจะถูกส่งเข้า **Google Sheet** แล้วให้เลขา (`assistant`) ช่วยจัดสรร/จัดลำดับความสำคัญให้

```
[ คนฝากงาน ] --กรอกฟอร์ม--> request.html --ส่ง JSON--> GAS --บันทึก--> Google Sheet
                                                                          |
                                                        เลขา (assistant) อ่าน + จัดลำดับ
```

---

## 🧩 ข้อมูลที่ฟอร์มเก็บ

| ช่อง | บังคับ | ตัวอย่าง |
|---|---|---|
| ชื่อผู้ฝากงาน | ✅ | คุณเอ / แผนกจัดส่ง |
| ช่องทางติดต่อ | ✅ | 08x-xxx-xxxx / LINE |
| ธุรกิจ | ✅ | โรงน้ำละกอน / คาเฟ่ / อื่นๆ |
| ประเภทงาน | — | จัดส่ง, การเงิน, การตลาด ฯลฯ |
| รายละเอียด | ✅ | ข้อความอิสระ |
| ความเร่งด่วน | ✅ | 🔴 ด่วนมาก / 🟠 ปกติ / 🟢 ไม่เร่ง |
| กำหนดเสร็จ | — | วันที่ |
| แนบรูป | — | หลายรูป (ย่อขนาดอัตโนมัติ) |

---

## ⚙️ วิธีตั้งค่า Backend (Google Apps Script)

หน้าเว็บส่งข้อมูลเข้า GAS ที่ตัวแปร `GAS_URL` ใน `request.html`
ให้เพิ่มโค้ดนี้ใน GAS project (จะใช้ Sheet เดียวกับแอปสั่งน้ำ หรือสร้าง Sheet ใหม่ก็ได้):

```javascript
// ===== Job Intake Board =====
const REQUEST_SHEET_ID = 'ใส่ Google Sheet ID ที่นี่';
const REQUEST_TAB      = 'Requests';       // ชื่อแท็บ
const IMAGE_FOLDER_ID  = 'ใส่ Drive Folder ID สำหรับเก็บรูป'; // ไม่บังคับ

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'submitRequest') {
      return handleSubmitRequest(data);
    }
    return jsonOut({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function handleSubmitRequest(data) {
  const ss = SpreadsheetApp.openById(REQUEST_SHEET_ID);
  let sheet = ss.getSheetByName(REQUEST_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(REQUEST_TAB);
    sheet.appendRow(['เลขงาน','เวลาที่ส่ง','สถานะ','ความเร่งด่วน','ธุรกิจ',
                     'ประเภท','ผู้ฝาก','ติดต่อ','รายละเอียด','กำหนดเสร็จ','ลิงก์รูป']);
  }

  // สร้างเลขงาน เช่น REQ260811-4821
  const now = new Date();
  const ref = 'REQ' + Utilities.formatDate(now, 'GMT+7', 'yyMMdd')
              + '-' + Math.floor(1000 + Math.random() * 9000);

  // บันทึกรูปลง Drive (ถ้ามีและตั้ง Folder ไว้)
  let imageLinks = '';
  if (IMAGE_FOLDER_ID && Array.isArray(data.images) && data.images.length) {
    const folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    const links = [];
    data.images.forEach((dataUrl, i) => {
      const m = String(dataUrl).match(/^data:(image\/\w+);base64,(.+)$/);
      if (!m) return;
      const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], ref + '-' + (i + 1) + '.jpg');
      const f = folder.createFile(blob);
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      links.push(f.getUrl());
    });
    imageLinks = links.join('\n');
  }

  sheet.appendRow([
    ref, now, 'ใหม่', data.urgency || '', data.biz || '',
    data.type || '', data.name || '', data.contact || '',
    data.detail || '', data.due || '', imageLinks
  ]);

  return jsonOut({ ok: true, ref: ref });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

**ขั้นตอน:**
1. เปิด Google Apps Script project ที่ผูกกับแอปละกอน (หรือสร้างใหม่)
2. วางโค้ดด้านบน แก้ `REQUEST_SHEET_ID` (และ `IMAGE_FOLDER_ID` ถ้าต้องการเก็บรูป)
3. **Deploy → New deployment → Web app** → Execute as: *Me*, Who has access: *Anyone*
4. คัดลอก URL มาใส่ `GAS_URL` ใน `request.html` (ถ้าใช้ตัวเดียวกับแอปสั่งน้ำ ไม่ต้องเปลี่ยน)
5. เปิด `request.html` แล้วส่งทดสอบ 1 งาน → เช็คว่าขึ้นใน Sheet

> ⚠️ ถ้า GAS เดิมมี `doPost` อยู่แล้ว ให้รวม logic เข้าด้วยกัน (เช็ค `data.action`) อย่าประกาศ `doPost` ซ้ำ

---

## 📲 วิธีแจกให้คนฝากงาน

- deploy `request.html` (เช่น GitHub Pages) แล้วส่งลิงก์ให้ทีม/ลูกค้า
- หรือทำเป็น **QR code** ติดหน้าร้าน/ท้ายรถส่งน้ำ
- หรือฝังลิงก์ใน LINE OA / bio

---

## 🗓️ ให้เลขาช่วยจัดสรรงาน

เมื่อมีงานเข้ามาใน Sheet แล้ว สั่งเลขาได้เลย เช่น:

- **"สรุปงานที่ฝากเข้ามาวันนี้ เรียงตามความเร่งด่วน"**
- **"มีงานด่วนมากค้างอยู่กี่งาน อะไรบ้าง"**
- **"จัดตารางว่าควรทำงานไหนก่อน-หลังวันนี้"**
- **"งานของโรงน้ำกับคาเฟ่ อย่างละกี่งาน"**

### เกณฑ์จัดลำดับของเลขา
เลขาจะจัดลำดับจาก **ความเร่งด่วน + กำหนดเสร็จ + ผลกระทบต่อธุรกิจ**:

1. 🔴 **ด่วนมาก / เลยกำหนดหรือใกล้ครบ** → ทำก่อน
2. 🟠 **ปกติ** → จัดคิวตามกำหนดเสร็จ
3. 🟢 **ไม่เร่ง** → ทำเมื่อว่าง

พร้อมสรุปเป็นตาราง "ทำก่อน–รอได้" และเสนอ next step ให้ตัดสินใจง่าย

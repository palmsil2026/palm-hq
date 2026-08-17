# STATUS — สถานะระบบจริง ณ ตอนนี้ (เขียนทับไฟล์นี้เสมอ **ห้าม append ต่อท้าย**)

> ไฟล์นี้ตอบคำถามเดียว: **"โค้ดใน repo กับของที่รันจริง ตรงกันรึยัง"**
> ประวัติว่าใครแก้อะไรเมื่อไหร่ → ดู `git log` (ไม่ต้องจดซ้ำที่นี่ เลยไม่ต้อง compact)
> อัปเดตล่าสุด: 2026-08-16 โดยแชทโรงน้ำ (ตอนวางงาน HR — ดูแถว "รอ deploy")

## ของจริงที่รันอยู่ เทียบกับ repo

| ชิ้นส่วน | ที่รันจริง | สถานะเทียบ repo |
|---|---|---|
| หน้าเว็บทั้งหมด (`index.html`, `board/`, `exec/`, `request.html`) | GitHub Pages ของ repo นี้ `palmsil2026.github.io/palm-hq/` | ✅ push `main` = ขึ้นจริงใน ~1 นาที |
| GAS คุณเลขา (`secretary/Code.gs`) — บอท LINE + บอร์ด + exec API | Apps Script deployment `AKfycbwgxZ_yxK21-GcB0yuZSFw-uT7yr9J322ZyMT2H3QsHgcnEuvvhUP3I-yJH3hq9dC9J` | ⏳ **มีงานรอวาง 2 ชุด** (ตารางล่าง) — วางทีเดียวจากไฟล์ใน `main` หลัง commit ครบ |

### รอ deploy GAS เลขา (วางจาก `secretary/Code.gs` ใน `main` **หลัง**ทั้งสองชุด commit แล้ว)
| ชุด | อะไร | สถานะ commit |
|---|---|---|
| จากแชทร้านกาแฟ | เลขาจำเจ้าของจาก userId + คำสั่ง "สรุปยอด/ยอดขาย" ตอบสดจากชีตร้าน — ต้องตั้ง Script Property `OLDDAYS_SHEET_ID = 1LidMLDKb3zI672cZlIHzf-8d1rw1V8t4YRNgJr98jXA` | ✅ อยู่ใน `main` แล้ว |
| จากแชทโรงน้ำ (HR ห้องผู้บริหาร) | endpoints `hrDetail/hrSave/hrLeave/hrLeaveDel/hrPay/hrPayroll` + `execDashboard` ใช้ทะเบียน HR — เขียนชีต `Staff` ของโรงน้ำ + สร้าง `HR_Staff`/`HR_Payroll` (ต้องมี `PLANT_SHEET_ID` — มีแล้ว) — คู่กับ `exec/index.html` หมวดพนักงานใหม่ | ⏳ **แก้แล้วใน `D:\palm-hq` แต่ยังไม่ commit** — แชทโรงน้ำจะ commit หลังคุณปาล์มลอง; ถ้าใครจะวาง GAS ก่อนหน้านั้น ให้ commit ชุดนี้ก่อน (`git status` เห็น 2 ไฟล์) |

⚠️ ไฟล์ `secretary/Code.gs` มี **3 แชทแก้** (ร้านกาแฟ / HR โรงน้ำ / เลขา) — **pull ก่อนแก้ทุกครั้ง และวาง GAS จากไฟล์ใน `main` เท่านั้น** ห้ามวางจากไฟล์ที่เก็บไว้ในเครื่องเก่า ๆ (งานอีกแชทจะหายเงียบ ๆ)

## Config ที่ระบบต้องมี (ครบแล้ว = ✅)

| ที่ | ค่า | สถานะ |
|---|---|---|
| GAS เลขา · `PLANT_SHEET_ID` | ชีตกลางโรงน้ำ | ✅ (exec ดึง KPI สดอยู่แล้ว) |
| GAS เลขา · `OLDDAYS_SHEET_ID` | `1LidMLDKb3zI672cZlIHzf-8d1rw1V8t4YRNgJr98jXA` | ⏳ ต้องตั้ง (คู่กับชุดร้านกาแฟด้านบน) |
| GAS เลขา · `EXEC_KEY` / `QUEUE_KEY` | รหัสเข้าห้องผู้บริหาร / รหัส CEO | ✅ ใช้งานอยู่ |
| ปุ่ม ☕ บนบอร์ด → ร้านกาแฟ | `https://palmsil2026.github.io/olddays-hq/` | ✅ merge แล้ว (`95f3db2`) |

## วิธีดูแลไฟล์นี้
แก้ `secretary/Code.gs` แล้วยังไม่วาง GAS → เพิ่มแถวในตาราง "รอ deploy" · คุณปาล์มวาง+New version เสร็จ → ลบแถวออก · หน้าเว็บไม่ต้องจด (push = ขึ้นเอง)

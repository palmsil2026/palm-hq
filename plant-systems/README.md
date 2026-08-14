# 🏭 ระบบขาย-โรงงาน ละกอน (Apps Script)

โค้ดจริงของ 2 ระบบที่ทีมใช้งานอยู่ ดึงมาจาก Google Apps Script เพื่อให้ทีม AI ดูแล/แก้ไข/ตรวจสอบได้
(เดิมอยู่แต่ใน GAS ทีมมองไม่เห็น จึงช่วยอะไรไม่ได้เลย)

| โฟลเดอร์ | โปรเจกต์ GAS | แอป | ขอบเขต |
|---|---|---|---|
| `sales/` | **Sale System** | ละกอน Sales (ทีมเซลล์) | ลูกค้า · ใบเสนอราคา · เยี่ยมลูกค้า · รอบวิ่ง/รถแวน · ลา · คู่แข่ง · แดชบอร์ดเซลล์ |
| `factory/` | **Lakon Factory** | ละกอน โรงงาน | ออเดอร์ทุกช่องทาง · การผลิต + รอบผลิต · **คลังสินค้า/วัตถุดิบ (BOM)** · จัดส่ง · พนักงาน/ลา · แผนผลิต |

> 💡 "แอปคลังสินค้า" ไม่ได้เป็นโปรเจกต์แยก — อยู่ในแอปโรงงาน (`factory/`) แล้ว
> ดูฟังก์ชัน `getStock` · `adjustProductStock` · `moveRawMat` · `readRawMats` · `readBom` · แท็บ `Raw Materials` / `RawMatLog` / `BOM`

## ⚠️ ข้อควรระวังก่อนแก้

1. **โค้ดในโฟลเดอร์นี้คือสำเนา** — ของจริงที่รันอยู่คือใน Apps Script แก้ที่นี่แล้ว **ต้องก็อปกลับไปวางใน GAS** ถึงจะมีผล
2. **`SPREADSHEET_ID` ถูกถอดออก** เพราะ repo นี้เป็นสาธารณะ — โค้ดที่รันจริงอ่านจาก Script Properties แทน
   (ตั้งค่า: Apps Script → Project Settings → Script Properties → key `SPREADSHEET_ID`)
3. ทั้งสองระบบ **ใช้สเปรดชีตเดียวกัน** — แก้โครงสร้างชีตฝั่งหนึ่ง กระทบอีกฝั่งเสมอ ตรวจให้ครบทั้งคู่
4. ระบบนี้ทีมใช้ทำงานจริงทุกวัน — เปลี่ยนอะไรต้องผ่านคุณปาล์มก่อนเสมอ

## 🔗 การเชื่อมกับแอปผู้บริหาร

แอปผู้บริหาร (`exec/`) **อ่านชีตนี้โดยตรงแบบอ่านอย่างเดียว** ไม่มีการเขียนกลับ และไม่ก็อปข้อมูลไปเก็บซ้ำ
- ตั้งค่าใน GAS ของคุณเลขา: Script Properties → `PLANT_SHEET_ID` = ID สเปรดชีตของระบบนี้
- ดึง: ยอดขายจาก `Orders` / `Orders_LINE` / `Orders_Sales` / `Orders_OEM` · การผลิตจาก `ProductionLog` + `ProductionRuns` · พนักงานจาก `Staff`
- **ไม่ดึงคอลัมน์ PIN ของพนักงานเด็ดขาด**
- จัดสายผลิตภัณฑ์อัตโนมัติเป็น ละกอน / OEM / เพียวซ่า ตามที่ CEO แบ่งไว้

## แท็บชีตหลัก

**ขาย:** `Customers_Sales` · `SalesReps` · `Quotes` · `Visits` · `Competitors` · `Dashboard_Sales` · `Orders_Sales` · `Orders_OEM`
**โรงงาน:** `Orders` · `Orders_LINE` · `Products` · `ProductionLog` · `ProductionRuns` · `ProductionPlans` · `Raw Materials` · `RawMatLog` · `BOM` · `Deliveries` · `DeliverySchedule` · `Staff` · `Leaves`

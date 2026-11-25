# AI BOS — สรุปผลสำรวจระบบจริง (25/11/2026)

> สำรวจแบบ read-only จาก 4 repo: `palm-hq` · `origin-hq` · `pk-hq` · `olddays-hq` — ใช้ไฟล์นี้แทนการไล่อ่านโค้ดซ้ำ
> ✅ = ตรวจในโค้ด/เอกสารแล้ว · ⚠️ = ยังไม่ได้ยืนยัน · บรรทัดอ้างอิงอาจเลื่อนเมื่อโค้ดเปลี่ยน

## 1. ภาพรวม
- **LAKON (origin-hq)**: ~12 GAS web app ใช้ Google Sheet กลาง "OriginSystem" (~100 แท็บ) · push `main` = Actions deploy ขึ้น GAS
  · Cloudflare: D1 `lakon-edge` (read replica) + `lakon-db` (shadow DB, **สวิตช์ปิดหมด** — ชีตยังเป็นความจริง) + sensor worker
- **คุณเลขา (palm-hq/secretary/Code.gs)**: LINE OA hub · 9.3k บรรทัด · `CODE_VERSION 2026-11-19b` · วาง GAS เอง (ไม่มี auto deploy ฝั่ง GAS เลขา ⚠️ มี workflow clasp ใน `.github/workflows/deploy-gas.yml` — เช็ค STATUS)
- **P&K (pk-hq)**: ชีต `PKSystem` · `gas/Code.gs` · LAKON เป็นลูกค้า P&K (ซื้อขวด/ฝา/ฟิล์ม) — คนละบริษัท ห้ามปนชีต
- **Old Days (olddays-hq)**: ชีต `OldDaysSystem` · POS = FoodStory (อ่านอีเมล Close Drawer → DailyClose) · ไม่มีสูตรเมนู
- **Futopia (ตู้น้ำ)**: ไม่มี repo แยก · ยอดขายดึงจาก Impress IoT (`finance-app`) · เบิกของเติมตู้ใน `shop-app` (`ShopIssues`) · คนส่งของ P&K เติม/เก็บเงิน

## 2. AI ที่มีอยู่แล้ว (3 จุด, log แยกกัน, ไม่มีเพดานเงิน)
| จุด | ที่อยู่ | รุ่น | log ค่าใช้จ่าย |
|---|---|---|---|
| คุณเลขา (สมอง/Planner/อ่านรูป/จัดคลัง/เฝ้าเครื่อง/pH/น้ำมัน) | `secretary/Code.gs` `askClaude` ~L4922 · `askPlanner` ~L4870 · `analyzeImage` ~L1965 | Sonnet 5.5 effort medium · รูป = Haiku 5.5 (Script Prop `IMAGE_MODEL`) · pH = Sonnet | `trackUsage` → Script Prop `AIU_yyyy-MM-dd` → แท็บ `AIUsage` (~L8963) |
| น้องละกอน (ผู้ช่วยในแอปเซลส์) | `origin-hq/sales-app/Code.js` `botCallClaude_` ~L14045 · ราคา ~L13376 | Haiku/Sonnet/Opus 5.5 แบ่งตามงาน | แท็บ `BotLog` |
| อ่านบิล/สลิป | `origin-hq/finance-app/Code.gs` `expAiRead_` ~L2677 · `AI_MODEL_READ/TEXT` ใน `Fin_Settings` | ตั้งค่าได้ | แท็บ `Fin_AIUsage` |

- prompt caching: มีเฉพาะ askClaude / askPlanner / app help (system block `ephemeral`)
- เรียก API ตรงด้วย `UrlFetchApp` (`anthropic-version: 2023-06-01`) · key = Script Property `ANTHROPIC_API_KEY` ในแต่ละ project ⚠️ ไม่รู้ว่าอยู่ Console org ไหน
- ค่าอ่านรูปเดิม 20–34 บาท/วัน ≈ 85% ของค่า AI เลขา (STATUS 19/10–6/11) → ย้ายเป็น Haiku 07/11

## 3. ของที่ AI BOS ใช้ต่อได้ทันที (อยู่ในคุณเลขา)
| ความสามารถ | ของเดิม |
|---|---|
| Task board | แท็บ `Requests` (~L5068) + projects/subtasks (~L7971) |
| Human-in-the-loop | Planner → คุณปาล์มอนุมัติ (~L4839) · ถามคนเมื่อข้อมูลไม่พอ แท็บ `Questions` (~L8253) |
| Memory / learning | `Memory` (24 ข้อความ/แชท) · `Playbook` · `GroupKnowledge` `PeopleKnowledge` `GroupEvents` |
| Chat log | `GroupChat` (1000 แถว) + `GroupChat_yyyy-MM` (เก็บถาวร) |
| Scheduler | trigger เดียว `fireDueReminders` ทุก 15 นาที → tick รวมหลายงาน (~L1368) · ห้ามเพิ่ม trigger มั่ว |
| Router คำสั่ง | `SEC_COMMANDS` (~L5077) เรียกได้ทั้ง regex และ AI `[[RUN]]` |
| เรียกแอปอื่น | `doPost` → sales `crew*` · finance `expense*` · production `line*/prod*` · fleet `fuelLine` (token แยกต่อแอป) |
| อ่านข้อมูลโรงน้ำ | `plantVals(tab)` + cache 2 ชั้น (`PLANT_CACHEABLE` ~L5416) · `plantPayments()` (~L5461) |
| Claude Code Routines | `fireRoutine` (~L621) — ⚠️ token 401 ตั้งแต่ 21/10 · ใช้โควตา plan ไม่ใช่เครดิต API |
| ทีม AI (บทบาทตามหน้าที่) | `.claude/agents/*.md` (analyst, finance, plant, procurement, data, …) |

## 4. ข้อมูลหลักต่อหน้าที่
- **เงิน (LAKON)** — `Payments` (A..T): `Payment_ID, Timestamp, วันที่, Order_ID, ช่องทาง, Customer_ID, ลูกค้า, ยอด, วิธี, ผู้รับเงิน, สถานะเงิน, สลิป, Remit_ID, ผู้ยืนยัน, เวลายืนยัน, หมายเหตุ, อ้างอิง, ผู้บันทึก, แอป, บัญชี` (`sales-app/Code.js` `PAY_HEADERS` ~L12736)
  · กลับรายการ = แถวติดลบ (ห้ามแก้แถวเดิม) · เงินสดที่ `Remit_ID` ว่าง = ยังอยู่กับคน
  · `CashRemits`: `Remit_ID, Timestamp, วันที่, พนักงาน, ยอดที่แจ้ง, จำนวนรายการ, Payment_IDs, สถานะ, ยอดที่นับได้, ส่วนต่าง, ผู้รับ, เวลารับ, หมายเหตุ` (`REMIT_HEADERS` ~L12745)
  · ความเสี่ยงที่รู้แล้ว: `createRemitCore_` ไม่ atomic · เสี่ยงนับซ้ำฝั่ง finance (origin-hq STATUS)
- **เงิน (P&K)** — `Bills`, `Statements` (ชื่อคอลัมน์ถูกตรึงตามสัญญา) · ชีตบัญชีจริงอ่านอย่างเดียว
- **เงิน (Old Days)** — `DailyClose` (ยอด/เงินสด/คนละครึ่ง/โอน/ส่วนลด/void)
- **ขาย** — `Orders_Sales`, `Orders_OEM`, `Customers_Sales`, `Visits`, `FollowLog`, `VanLoads`, `DeliveryRounds` · P&K `Orders`, `Customers`
- **ผลิต/สต็อก** — `ProductionRuns/Log/Plans`, `StockMoves` (ledger append-only), `Products.Current_Stock`, `QCChecks`, `WaterSensor`
- **เครื่องจักร** — `MachineWatch` (PET10/PET250 ของ P&K ในกลุ่ม TEAMWORK) · `docs/factory-iot/machines.md` (ไลน์ BVE, Mitsubishi PLC — ยังไม่เชื่อม)
- **รถ** — fleet `FuelLog`, GPS (รออุปกรณ์จริง)

## 5. คุณภาพข้อมูล (จาก STATUS)
- ✅ พร้อม: ขาย · เงิน · LINE chat
- ❌ ไม่พร้อม: `Raw Materials` ไม่เคยนับจริง (เริ่ม 10,000 ทุกตัว ติดลบหลายตัว) · BOM ไม่มีฟิล์มหด · `ProductionTargets` ว่าง · ราคาบางสินค้าว่าง · ลูกค้าซ้ำ 37 แถว · แถวออเดอร์ขาดคอลัมน์ (bug `addOrderItems_`) · Old Days ไม่มีสูตรเมนู · sensor มีเครื่องเดียว = ถ้วยทดสอบ

## 6. ข้อจำกัด
- GAS รันได้ ≤6 นาที/ครั้ง · รัน Agent SDK ไม่ได้ · ชีตเดียว 9 project เขียนพร้อมกันไม่มี lock ข้าม project · sales project ใกล้เพดาน 200 versions
- LINE OA 15k ข้อความ/เดือน ใช้ร่วมทุกระบบ · push เข้ากลุ่มนับตามจำนวนสมาชิก · คุณปาล์ม**เลิกรายงานเช้า**แล้ว (20/10: "ไม่เคยอ่านเลย") → แจ้งเฉพาะเรื่องผิดปกติ
- เครดิต API $200/เดือน (Ultra): หมดอายุทุกรอบบิล ไม่ทบ · ใช้ได้กับ Messages API / Managed Agents / Agent SDK · **ใช้กับ Claude Code ไม่ได้** · เครดิตหมด = request หยุด (ไม่ตัดเงินถ้าไม่เปิด auto-reload) · ตั้ง spend limit ราย Workspace ได้

## 7. ความปลอดภัย (ต้องแก้ก่อนให้ AI มี tool มากขึ้น)
1. คุณเลขาไม่ตรวจ `x-line-signature` → ปลอม event ได้
2. LINE token ของ `lakon-order` อยู่ใน git history ยังไม่ rotate · `QUEUE_KEY` เคยหลุดตอน repo public
3. Old Days เชื่อ `lineUserId` จาก client โดยไม่ verify ⚠️
4. ข้อความกลุ่มไหลเข้า prompt ตรง — กัน injection แค่บาง prompt
5. key ส่งเป็น URL query (board/exec)
6. ไม่มีเพดานงบ AI

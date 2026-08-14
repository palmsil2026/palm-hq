// ============================================================
// Code.gs — ระบบโรงงาน ละกอน (ฝ่ายผลิต / รับออเดอร์ / สต๊อก / ขนส่ง)
// Google Apps Script Backend + Web App
// ============================================================
// ใช้ Spreadsheet เดียวกับระบบ LINE OA + แอปเซลส์ + AppSheet เดิม
// ชีตที่ใช้ร่วมกับระบบเดิม (อ่าน/อัปเดต):
//   Orders, Orders_LINE, Orders_Sales, Products,
//   Customers, Customers_Sales, Addresses
// ชีตของ AppSheet ฝ่ายผลิตเดิม (ใช้ต่อ ไม่ทับข้อมูล):
//   ProductionLog, Raw Materials, RawMatLog, BOM, Staff
// ชีตใหม่ที่ระบบนี้สร้าง: Deliveries (บันทึกงานส่ง)
// ============================================================
// วิธีติดตั้ง: ดูไฟล์ SETUP.md
// 1) สร้างโปรเจกต์ GAS ใหม่ (แยกจาก LIFF และแอปเซลส์ กัน doGet ชนกัน)
// 2) รันฟังก์ชัน setupFactorySheets หนึ่งครั้ง แล้วดู Log
// 3) Deploy เป็น Web app (Execute as: Me / Access: Anyone with the link)
// ============================================================

const SPREADSHEET_ID = PropertiesService.getScriptProperties()
  .getProperty("SPREADSHEET_ID");   // ⚠️ เก็บ ID จริงใน Script Properties (repo นี้เป็นสาธารณะ)

// โมเดลสต๊อก: ออเดอร์ = "จอง" (ยังไม่ตัด) → ตัดจริงตอนกด "ขึ้นรถ" หรือ "มารับเอง"
// ยกเว้นออเดอร์เซลส์ — แอปเซลส์ตัดตั้งแต่ตอนสั่งอยู่แล้ว (ไม่ตัดซ้ำตอนขึ้นรถ)
// หน้าสต๊อกจึงโชว์: คงเหลือ (ของจริงในคลัง) / จองรอส่ง / พร้อมขาย = คงเหลือ − จอง

// สต๊อกสินค้าต่ำกว่าเท่านี้ = แจ้งเตือนใกล้หมด (หน่วย: แพ็ค)
const LOW_STOCK_PRODUCT = 20;

// แบรนด์ของเราเอง — ผลิตประจำ ไม่นับเป็น OEM
// OEM = แบรนด์ลูกค้าอื่น (บุญวาทย์ หรือแบรนด์ใหม่ที่รับจ้างสกรีน)
const HOUSE_BRANDS = ["ละกอน", "เพียวซ่า"];

// แพ็คโหล = 12 ขวด/แพ็ค — ใช้กระทบยอดขวดตอนปิดรอบผลิต
// (ขวดต่อถุงจากโรงขวด: 250ml = 252 ใบ, 600ml = 200 ใบ — คำนวณฝั่งหน้าจอ)
const BOTTLES_PER_PACK = 12;

// ============================================================
// Web App entry
// ============================================================

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("ละกอน โรงงาน")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1");
}

// ============================================================
// Utility
// ============================================================

// เปิด Spreadsheet ครั้งเดียวต่อการรัน 1 ครั้ง (openById เป็นคำสั่งที่ช้าที่สุด
// ของ Apps Script — เดิมเรียกซ้ำหลายสิบครั้งต่อการโหลด 1 หน้า ทำให้แอปช้ามาก)
// ตัวแปร global รีเซ็ตเองทุกครั้งที่ google.script.run เรียกใหม่ จึงไม่ค้างข้ามคำขอ
let _ssCache = null;
function ss() {
  if (!_ssCache) _ssCache = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _ssCache;
}

const _sheetCache = {};
function getSheet(name) {
  // cache เฉพาะชีตที่มีจริง (null = ยังไม่สร้าง ให้ลองใหม่ได้)
  if (!_sheetCache[name]) _sheetCache[name] = ss().getSheetByName(name);
  return _sheetCache[name];
}

function getAllRows(sheetName) {
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1);
}

function todayStr() {
  return Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
}

function fmtDate(d) {
  return (d instanceof Date)
    ? Utilities.formatDate(d, "Asia/Bangkok", "yyyy-MM-dd") : String(d || "");
}

function fmtDateTime(d) {
  return (d instanceof Date)
    ? Utilities.formatDate(d, "Asia/Bangkok", "yyyy-MM-dd HH:mm") : String(d || "");
}

function newId(prefix) {
  const dateStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMdd");
  const randStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return prefix + dateStr + "-" + randStr;
}

// ============================================================
// เข้าถึงชีตตาม "ชื่อหัวคอลัมน์" (ไม่ล็อกตำแหน่ง)
// เพราะชีตฝ่ายผลิตเดิมสร้างจาก AppSheet — หัวคอลัมน์อาจไม่ตรงกับที่คาด
// แต่ละ field มี alias หลายชื่อ ใช้ชื่อแรกที่เจอในชีตจริง
// ============================================================

const FIELD_ALIASES = {
  "ProductionLog": {
    id:        ["Log_ID", "ID", "Production_ID"],
    timestamp: ["Timestamp", "เวลา", "Created_At"],
    date:      ["วันที่", "Date", "Production_Date"],
    productId: ["Product_ID", "สินค้า_ID"],
    product:   ["สินค้า", "Product", "Product_Name", "ชื่อสินค้า"],
    qty:       ["จำนวนผลิต", "จำนวน", "Qty", "Quantity", "Qty_Produced", "Amount"],
    staff:     ["ผู้บันทึก", "ผู้ผลิต", "Staff", "พนักงาน", "Recorded_By", "By"],
    type:      ["ประเภท", "Type"],
    note:      ["หมายเหตุ", "Note", "Notes", "Remark"],
  },
  // หัวคอลัมน์จริงจาก AppSheet: Item_ID | Item_Name | Category | Quantity_In_Hand | Unit | Min_Threshold
  "Raw Materials": {
    id:    ["Item_ID", "RawMat_ID", "Material_ID", "RM_ID", "ID", "รหัส"],
    name:  ["Item_Name", "ชื่อวัตถุดิบ", "วัตถุดิบ", "Name", "Material", "Material_Name", "Raw_Material"],
    unit:  ["หน่วย", "Unit"],
    stock: ["Quantity_In_Hand", "Current_Stock", "คงเหลือ", "Stock", "Qty", "Quantity"],
    min:   ["Min_Threshold", "Min_Stock", "ขั้นต่ำ", "Min", "Minimum", "Reorder_Level"],
  },
  // หัวคอลัมน์จริงจาก AppSheet: Status | Item_ID | OrderDate | RecievedDate | Qty_Ordered | ...
  "RawMatLog": {
    id:        ["Log_ID", "ID"],
    timestamp: ["Timestamp", "เวลา", "Created_At"],
    date:      ["วันที่", "Date"],
    matId:     ["Item_ID", "RawMat_ID", "Material_ID", "RM_ID"],
    mat:       ["วัตถุดิบ", "ชื่อวัตถุดิบ", "Material", "Material_Name"],
    qty:       ["จำนวน", "Qty", "Quantity", "Amount"],
    type:      ["ประเภท", "Type"],
    ref:       ["อ้างอิง", "Ref", "Reference"],
    staff:     ["ผู้บันทึก", "Staff", "พนักงาน", "By"],
    note:      ["หมายเหตุ", "Note", "Notes"],
  },
  // หัวคอลัมน์จริงจาก AppSheet: Product_ID | Material_Item_ID | Qty_Used
  "BOM": {
    productId: ["Product_ID", "สินค้า"],
    matId:     ["Material_Item_ID", "RawMat_ID", "Material_ID", "RM_ID", "วัตถุดิบ"],
    perUnit:   ["Qty_Used", "จำนวนต่อหน่วยผลิต", "จำนวนต่อหน่วย", "Qty_Per_Unit", "Per_Unit", "Usage", "จำนวน"],
  },
  "Staff": {
    id:     ["Staff_ID", "Employee_ID", "ID", "รหัส", "รหัสพนักงาน"],
    name:   ["ชื่อ", "Name", "Staff_Name", "ชื่อพนักงาน", "Employee", "Employee_Name"],
    role:   ["Role", "หน้าที่", "ตำแหน่ง", "Position"],
    pin:    ["PIN", "Pin"],
    active: ["Active", "ใช้งาน", "Status"],
  },
  // ชีตใหม่ของระบบนี้ — รอบผลิต (เปิดรอบ/ปิดรอบ พร้อมทีมและของเสียราย จุด)
  "ProductionRuns": {
    runId:      ["Run_ID"],
    date:       ["วันที่"],
    start:      ["เวลาเริ่ม"],
    end:        ["เวลาปิด"],
    productId:  ["Product_ID"],
    product:    ["สินค้า"],
    feeders:    ["คนป้อนขวด"],
    packers:    ["คนแพ็คโหล"],
    qc:         ["คนQC"],
    bags:       ["เบิกขวด(ถุง)"],
    bottles:    ["เบิกขวด(ใบ)"],
    returned:   ["คืนขวด(ใบ)"],
    waste1:     ["เสีย-ป้อนขวด"],
    waste2:     ["เสีย-ไลน์ผลิต"],
    waste3:     ["เสีย-แพ็คโหล"],
    wasteTotal: ["เสียรวม(ขวด)"],
    good:       ["ยอดดี(แพ็ค)"],
    diff:       ["ส่วนต่าง(ขวด)"],
    status:     ["สถานะ"],
    openedBy:   ["ผู้เปิด"],
    closedBy:   ["ผู้ปิด"],
    note:       ["หมายเหตุ"],
  },
  "Deliveries": {
    id:        ["Delivery_ID"],
    timestamp: ["Timestamp"],
    date:      ["วันที่"],
    orderId:   ["Order_ID"],
    source:    ["ช่องทาง"],
    customer:  ["ลูกค้า"],
    driver:    ["คนส่ง"],
    collected: ["เก็บเงิน(บาท)"],
    note:      ["หมายเหตุ"],
  },
  // ชีตใหม่ — วันลาพนักงาน (1 แถว = 1 ช่วงลา)
  "Leaves": {
    id:        ["Leave_ID"],
    timestamp: ["Timestamp"],
    staff:     ["พนักงาน"],
    from:      ["วันที่เริ่ม"],
    to:        ["วันที่สิ้นสุด"],
    type:      ["ประเภท"],
    note:      ["หมายเหตุ"],
    by:        ["ผู้บันทึก"],
  },
  // ชีตใหม่ — แผนผลิตล่วงหน้า (มอบหมาย 4 หน้าที่ รวมผลิตน้ำ RO)
  "ProductionPlans": {
    id:        ["Plan_ID"],
    timestamp: ["Timestamp"],
    date:      ["วันที่ผลิต"],
    productId: ["Product_ID"],
    product:   ["สินค้า"],
    target:    ["เป้า(แพ็ค)"],
    feeders:   ["คนป้อนขวด"],
    packers:   ["คนแพ็คโหล"],
    qc:        ["คนQC"],
    ro:        ["คนRO"],
    status:    ["สถานะ"],
    note:      ["หมายเหตุ"],
    by:        ["ผู้วางแผน"],
  },
  // ชีตใหม่ — นัดส่ง/กำหนดการส่งบนปฏิทิน
  "DeliverySchedule": {
    id:        ["Schedule_ID"],
    timestamp: ["Timestamp"],
    date:      ["วันที่ส่ง"],
    customer:  ["ลูกค้า"],
    detail:    ["รายละเอียด"],
    orderId:   ["Order_ID"],
    status:    ["สถานะ"],
    by:        ["ผู้บันทึก"],
  },
};

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(h => String(h).trim());
}

// คืน { field: colIndex } ของชีตนั้น (-1 = หาไม่เจอ)
// cache ต่อชีตต่อการรัน 1 ครั้ง — หัวคอลัมน์ไม่เปลี่ยนระหว่างรัน (ยกเว้น setup
// ซึ่งเพิ่มคอลัมน์เสร็จก่อนแล้วค่อยเรียก mapFields จึงยังได้ค่าล่าสุด)
const _mapCache = {};
function mapFields(sheetName) {
  if (_mapCache[sheetName]) return _mapCache[sheetName];
  const sheet = getSheet(sheetName);
  if (!sheet) return null;
  const headers = getHeaders(sheet);
  const aliases = FIELD_ALIASES[sheetName] || {};
  const map = {};
  Object.keys(aliases).forEach(field => {
    map[field] = headers.findIndex(h =>
      aliases[field].some(a => h.toLowerCase() === a.toLowerCase()));
  });
  map._width = headers.length;
  _mapCache[sheetName] = map;
  return map;
}

// อ่านทุกแถวเป็น object ตาม field ที่ map ได้
function readMapped(sheetName) {
  const map = mapFields(sheetName);
  if (!map) return [];
  return getAllRows(sheetName).map((row, i) => {
    const obj = { _row: i + 2 }; // เลขแถวจริงในชีต (นับ header)
    Object.keys(map).forEach(f => {
      if (f !== "_width") obj[f] = map[f] >= 0 ? row[map[f]] : "";
    });
    return obj;
  });
}

// ต่อแถวใหม่โดยวางค่าตรงคอลัมน์ที่ map ได้ (คอลัมน์อื่นเว้นว่าง)
function appendMapped(sheetName, values) {
  const map = mapFields(sheetName);
  if (!map) throw new Error("ไม่พบชีต " + sheetName);
  const row = new Array(map._width).fill("");
  Object.keys(values).forEach(f => {
    if (map[f] >= 0) row[map[f]] = values[f];
  });
  getSheet(sheetName).appendRow(row);
}

// อัปเดตค่า 1 ช่องตาม field ในแถวที่กำหนด
function setMapped(sheetName, rowNumber, field, value) {
  const map = mapFields(sheetName);
  if (!map || map[field] < 0) return false;
  getSheet(sheetName).getRange(rowNumber, map[field] + 1).setValue(value);
  return true;
}

// ============================================================
// API: ข้อมูลเริ่มต้น (เรียกตอนเปิดแอป)
// ============================================================

function getInit() {
  // Staff — ใช้ login (PIN ว่าง = ไม่ต้องใช้)
  const staff = readMapped("Staff")
    .filter(s => String(s.name).trim() !== "" &&
                 String(s.active).toUpperCase() !== "FALSE")
    .map(s => ({
      id: String(s.id || s.name),
      name: String(s.name),
      role: String(s.role || ""),
      hasPin: String(s.pin).trim() !== "",
    }));

  return {
    staff,
    products: readProducts(),
    rawMats: readRawMats(),
    bom: readBom(),
    customers: readCustomersAll(),
  };
}

// ลูกค้ารวม 2 ฐาน: Customers (สมัครผ่าน LINE) + Customers_Sales (เซลส์/โรงงานเพิ่ม)
function readCustomersAll() {
  const list = [];
  getAllRows("Customers").forEach(r => {
    if (!String(r[0]).trim()) return;
    list.push({
      id: String(r[0]), name: String(r[8] || r[2] || r[0]).trim(),
      phone: String(r[5] || ""), sub: "LINE", src: "line",
    });
  });
  getAllRows("Customers_Sales").forEach(r => {
    if (!String(r[0]).trim()) return;
    list.push({
      id: String(r[0]), name: String(r[1] || r[0]).trim(),
      phone: String(r[6] || ""),
      sub: [String(r[2] || ""), String(r[3] || "")].filter(Boolean).join(" · "),
      src: "sales",
    });
  });
  return list.sort((a, b) => a.name.localeCompare(b.name, "th"));
}

// เพิ่มลูกค้าใหม่ลง Customers_Sales — คอลัมน์เรียงแบบเดียวกับหน้าเพิ่มลูกค้าของแอปเซลส์
function addCustomerDb(c) {
  if (!String(c.name || "").trim()) return { success: false, error: "ใส่ชื่อลูกค้าก่อน" };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet("Customers_Sales");
    if (!sheet) return { success: false, error: "ไม่พบชีต Customers_Sales" };
    const dup = readCustomersAll().find(x =>
      x.name.trim().toLowerCase() === String(c.name).trim().toLowerCase());
    if (dup) return { success: false, error: "มีลูกค้าชื่อนี้แล้ว (" + dup.id + ")" };
    const customerId = "SC" + String(sheet.getLastRow()).padStart(3, "0");
    // Customer_ID | ชื่อ | ประเภท | อำเภอ | ที่อยู่ | ผู้ติดต่อ | โทร | เซลส์ | สาย |
    // ศักยภาพ | สถานะ | วันที่เพิ่ม | เดือน | หมายเหตุ | GPS_Lat | GPS_Lng
    sheet.appendRow([
      customerId, String(c.name).trim(), c.type || "", c.district || "", c.address || "",
      c.contact || "", c.phone || "", c.staff || "โรงงาน", "",
      "B", "ลูกค้า", todayStr(),
      Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM"),
      c.note || "", "", "",
    ]);
    return { success: true, id: customerId };
  } finally {
    lock.releaseLock();
  }
}

// เพิ่มสินค้าใหม่ลงชีต Products (เคส OEM แบรนด์ใหม่) — โครงคอลัมน์ตามชีตจริง
function addProductDb(p) {
  if (!String(p.brand || "").trim() || !String(p.size || "").trim()) {
    return { success: false, error: "ใส่แบรนด์และขนาดก่อน" };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const id = Math.random().toString(16).slice(2, 10); // 8 hex เข้าชุดกับ id เดิมจาก AppSheet
    const name = p.brand + "-" + p.size + " | Origin Labs";
    // Product_ID | Brand | Size | Category | Current_Stock | Company |
    // ราคาปลีก | Price | ราคาส่ง | ราคาตัวแทน | ราคาสวมฉลาก | Product_Name
    getSheet("Products").appendRow([
      id, String(p.brand).trim(), String(p.size).trim(), p.category || "สกรีน",
      0, "Origin Labs",
      Number(p.priceRetail) || "", "", Number(p.priceWholesale) || "", "", "", name,
    ]);
    return {
      success: true,
      product: {
        id, brand: String(p.brand).trim(), size: String(p.size).trim(),
        category: p.category || "สกรีน", stock: 0,
        price: Number(p.priceWholesale) || Number(p.priceRetail) || 0,
        priceRetail: Number(p.priceRetail) || 0, name,
      },
    };
  } finally {
    lock.releaseLock();
  }
}

// Products ใช้ร่วมกับทุกระบบ — โรงงานผลิตทุกแบรนด์ (ละกอน/เพียวซ่า/บุญวาทย์)
// โครงจริง: Product_ID(0) Brand(1) Size(2) Category(3) Current_Stock(4) Company(5)
//           ราคาปลีก(6) Price(7) ราคาส่ง(8) ราคาตัวแทน(9) ราคาสวมฉลาก(10) Product_Name(11)
function readProducts() {
  return getAllRows("Products")
    .filter(r => String(r[0]).trim() !== "")
    .map((r, i) => ({
      row: i + 2,
      id: String(r[0]), brand: String(r[1] || ""), size: String(r[2] || ""),
      category: String(r[3] || ""), stock: Number(r[4]) || 0,
      price: Number(r[8]) || Number(r[7]) || Number(r[6]) || 0, // ส่ง → Price → ปลีก
      priceRetail: Number(r[6]) || 0,
      name: String(r[11] || "").trim() ||
            (String(r[1] || "") + " " + String(r[2] || "") + " " + String(r[3] || "")).trim(),
    }));
}

function readRawMats() {
  return readMapped("Raw Materials")
    .filter(m => String(m.name).trim() !== "" || String(m.id).trim() !== "")
    .map(m => ({
      row: m._row,
      id: String(m.id || m.name), name: String(m.name || m.id),
      unit: String(m.unit || ""), stock: Number(m.stock) || 0,
      min: Number(m.min) || 0,
    }));
}

function readBom() {
  return readMapped("BOM")
    .filter(b => String(b.productId).trim() !== "")
    .map(b => ({
      productId: String(b.productId), matId: String(b.matId),
      perUnit: Number(b.perUnit) || 0,
    }));
}

// ============================================================
// API: login ด้วยชื่อ + PIN (โครงเดียวกับแอปเซลส์)
// ============================================================

function login(staffId, pin) {
  const row = readMapped("Staff").find(s =>
    String(s.id || s.name).trim() === String(staffId).trim());
  if (!row) return { success: false, error: "ไม่พบชื่อพนักงาน" };
  const realPin = String(row.pin || "").trim();
  if (realPin && realPin !== String(pin || "").trim()) {
    return { success: false, error: "PIN ไม่ถูกต้อง" };
  }
  return {
    success: true,
    staff: { id: String(row.id || row.name), name: String(row.name), role: String(row.role || "") },
  };
}

// ============================================================
// API: Dashboard หน้าหลัก
// ============================================================

// นับสถานะออเดอร์แบบเบา — อ่านเฉพาะ 3 ชีตออเดอร์ (คอลัมน์สถานะ) ไม่ join
// ลูกค้า/สินค้า/ที่อยู่ เหมือน getOrderQueue จึงเร็วกว่ามาก ใช้บนหน้าหลัก
function countOrderStatuses() {
  const seen = {}; // "sheet:orderId" -> status (ทุกแถวของออเดอร์เดียวกันสถานะเท่ากัน)
  [["Orders", 7], ["Orders_LINE", 7], ["Orders_Sales", 14], ["Orders_OEM", 15]].forEach(pair => {
    getAllRows(pair[0]).forEach(r => {
      const id = String(r[0]).trim();
      if (!id) return;
      let s = String(r[pair[1]] || "Pending");
      if (s === "เก็บเงินแล้ว") s = "ส่งแล้ว";  // ภาษาสถานะฝั่งเซลส์ OEM
      if (s === "Cancelled") s = "ยกเลิก";
      seen[pair[0] + ":" + id] = s;
    });
  });
  let pending = 0, ready = 0;
  Object.keys(seen).forEach(k => {
    const s = seen[k];
    if (s !== "ส่งแล้ว" && s !== "ยกเลิก") { pending++; if (s === "พร้อมส่ง") ready++; }
  });
  return { pending, ready };
}

function getDashboard() {
  const today = todayStr();
  const oc = countOrderStatuses();
  const producedToday = readMapped("ProductionLog")
    .filter(p => fmtDate(p.date) === today && String(p.type || "ผลิต") === "ผลิต")
    .reduce((s, p) => s + (Number(p.qty) || 0), 0);

  const products = readProducts();
  const lowProducts = products.filter(p => p.stock < LOW_STOCK_PRODUCT);
  const lowMats = readRawMats().filter(m => m.min > 0 && m.stock <= m.min);

  const deliveredToday = readMapped("Deliveries")
    .filter(d => fmtDate(d.date) === today).length;

  // คำขอรถเร่ที่รอคนนับสต๊อกยืนยัน
  let vanPending = 0;
  const vanSheet = getSheet("VanLoads");
  if (vanSheet) {
    const seen = new Set();
    vanSheet.getDataRange().getValues().slice(1).forEach(r => {
      if (r[0] && String(r[9]) === "รอเช็ค") seen.add(String(r[0]));
    });
    vanPending = seen.size;
  }

  // รอบส่งที่ทีมเซลส์วางแผนไว้ (ชีต DeliveryRounds จากแอปเซลส์ v11)
  let roundsPlanned = 0, roundsShort = 0;
  const sr = getSalesRounds();
  (sr.rounds || []).forEach(rd => {
    roundsPlanned++;
    if (rd.demand.some(d => d.short > 0)) roundsShort++;
  });

  const runRows = readMapped("ProductionRuns")
    .filter(r => String(r.status) === "กำลังผลิต");
  const activeRuns = runRows.length;
  // รอบที่เปิดค้างจากวันก่อน (ลืมปิด)
  const staleRuns = runRows.filter(r => fmtDate(r.date) < today).length;

  // แผนผลิตของวันนี้ (โชว์บนหน้าหลัก)
  const todayPlans = readMapped("ProductionPlans")
    .filter(p => String(p.id).trim() !== "" && fmtDate(p.date) === today &&
                 String(p.status || "วางแผน") === "วางแผน")
    .map(p => ({ product: String(p.product), target: Number(p.target) || 0 }));

  return {
    activeRuns,
    staleRuns,
    todayPlans,
    pendingOrders: oc.pending,
    readyToShip: oc.ready,
    producedToday,
    deliveredToday,
    lowProducts: lowProducts.map(p => ({ name: p.name, stock: p.stock })),
    lowMats: lowMats.map(m => ({ name: m.name, stock: m.stock, unit: m.unit, min: m.min })),
    vanPending,
    roundsPlanned,
    roundsShort,
  };
}

// ============================================================
// API: รอบส่งที่ทีมเซลส์จัดไว้ (อ่านอย่างเดียว — จัด/แก้ในแอปเซลส์)
// โรงงานใช้ดูล่วงหน้าว่าต้องเตรียม/ผลิตอะไรเท่าไหร่ก่อนถึงวันส่ง
// ============================================================

function getSalesRounds() {
  const drSheet = getSheet("DeliveryRounds");
  if (!drSheet) return { rounds: [] };

  const prodMap = {};
  readProducts().forEach(p => prodMap[p.id] = { name: p.name, stock: p.stock });

  // ออเดอร์เซลส์ที่ติดป้ายรอบ (คอลัมน์ Q) → รวมความต้องการต่อสินค้า
  const byRound = {};
  getAllRows("Orders_Sales").forEach(r => {
    const rid = String(r[16] || "").trim();
    if (!rid || String(r[14]) === "Cancelled") return;
    const b = (byRound[rid] = byRound[rid] || { packs: 0, orders: new Set(), need: {} });
    const pid = String(r[7] || "").trim();
    const qty = Number(r[9]) || 0;
    b.packs += qty;
    b.orders.add(String(r[0]));
    if (pid) b.need[pid] = (b.need[pid] || 0) + qty;
  });

  const rounds = drSheet.getDataRange().getValues().slice(1)
    .filter(r => r[0] && (String(r[7]) === "วางแผน" || String(r[7]) === "กำลังส่ง"))
    .map(r => {
      const rid = String(r[0]).trim();
      const b = byRound[rid] || { packs: 0, orders: new Set(), need: {} };
      const demand = Object.keys(b.need).map(pid => {
        const p = prodMap[pid] || { name: pid, stock: 0 };
        return { name: p.name, need: b.need[pid], stock: p.stock,
                 short: Math.max(b.need[pid] - Math.max(p.stock, 0), 0) };
      }).sort((x, y) => y.short - x.short);
      return { roundId: rid, date: fmtDate(r[2]), routes: String(r[3] || ""),
               capacity: Number(r[4]) || 0, status: String(r[7] || ""), by: String(r[8] || ""),
               note: String(r[9] || ""), packs: b.packs, orders: b.orders.size, demand };
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return { rounds };
}

// ============================================================
// API: คิวออเดอร์รวมทุกช่องทาง (โรงงาน + LINE + เซลส์)
// ============================================================
// Orders / Orders_LINE โครงเดียวกัน:
//   Order_ID(0) Date(1) Customer_ID(2) Product_ID(3) Qty(4) Unit_Price(5)
//   ผู้รับออเดอร์(6) Status(7) TotalPrice(8) Payment_Status(9) Payment_Type(10)
//   * Orders_LINE col10 = ที่อยู่จัดส่ง (repurposed), col11 = สลิป
// Orders_Sales:
//   Order_ID(0) Timestamp(1) วันที่(2) เดือน(3) เซลส์(4) Customer_ID(5) ชื่อลูกค้า(6)
//   Product_ID(7) สินค้า(8) จำนวน(9) หน่วย(10) ราคา/หน่วย(11) รวม(12)
//   การชำระเงิน(13) สถานะ(14) หมายเหตุ(15)
// ============================================================

function getOrderQueue() {
  const products = {};
  readProducts().forEach(p => products[p.id] = p);
  const prodName = id => (products[String(id)] || {}).name || String(id);

  // ลูกค้า LINE/โรงงาน: Customers + ที่อยู่ default จาก Addresses
  const customers = {};
  getAllRows("Customers").forEach(r => {
    customers[String(r[0]).trim()] = {
      name: String(r[8] || r[2] || "").trim() || String(r[0]),
      phone: String(r[5] || ""),
      address: String(r[7] || ""),
    };
  });
  const addrDefault = {};
  getAllRows("Addresses").forEach(r => {
    const cid = String(r[1]).trim();
    const isDef = r[7] === true || String(r[7]).toUpperCase() === "TRUE";
    if (isDef || !addrDefault[cid]) {
      addrDefault[cid] = { detail: String(r[3] || ""), lat: r[4] || "", lng: r[5] || "" };
    }
  });

  // ลูกค้าเซลส์: ชื่อ/โทร/GPS จาก Customers_Sales
  // (ออเดอร์โรงงานที่เลือกลูกค้าจากฐานนี้ก็ resolve ผ่าน map นี้ด้วย)
  const custSales = {};
  getAllRows("Customers_Sales").forEach(r => {
    custSales[String(r[0]).trim()] = {
      name: String(r[1] || ""),
      phone: String(r[6] || ""), address: String(r[4] || ""),
      lat: r[14] || "", lng: r[15] || "",
    };
  });

  const map = new Map();
  const addItem = (key, head, item) => {
    if (!map.has(key)) map.set(key, Object.assign({ items: [], total: 0 }, head));
    const o = map.get(key);
    o.items.push(item);
    o.total += item.total;
  };

  // ---- Orders (โรงงาน/AppSheet) + Orders_LINE ----
  [["factory", "Orders"], ["line", "Orders_LINE"]].forEach(([source, sheetName]) => {
    getAllRows(sheetName).forEach(r => {
      const orderId = String(r[0]).trim();
      if (!orderId) return;
      const cid = String(r[2]).trim();
      const cs = custSales[cid];
      const cust = customers[cid] ||
        (cs ? { name: cs.name || cid, phone: cs.phone, address: cs.address }
            : { name: cid, phone: "", address: "" });
      const addr = addrDefault[cid] ||
        (cs ? { detail: cs.address, lat: cs.lat, lng: cs.lng } : {});
      addItem(source + ":" + orderId, {
        source, orderId,
        date: fmtDateTime(r[1]), dateOnly: fmtDate(r[1]),
        customerId: cid, customerName: cust.name, phone: cust.phone,
        address: source === "line" ? String(r[10] || addr.detail || cust.address)
                                   : String(addr.detail || cust.address || ""),
        lat: String(addr.lat || ""), lng: String(addr.lng || ""),
        takenBy: String(r[6] || ""),
        status: String(r[7] || "Pending"),
        payStatus: String(r[9] || ""),
        payType: source === "factory" ? String(r[10] || "") : "",
        note: source === "factory" ? String(r[11] || "") : "",
        otype: source === "factory" ? String(r[12] || "") : "",
        screenDate: source === "factory" ? fmtDate(r[13]) : "",
      }, {
        productId: String(r[3]), name: prodName(r[3]),
        qty: Number(r[4]) || 0, unitPrice: Number(r[5]) || 0,
        total: Number(r[8]) || (Number(r[4]) || 0) * (Number(r[5]) || 0),
      });
    });
  });

  // ---- Orders_Sales (แอปเซลส์) ----
  getAllRows("Orders_Sales").forEach(r => {
    const orderId = String(r[0]).trim();
    if (!orderId) return;
    const cid = String(r[5]).trim();
    const cs = custSales[cid] || {};
    addItem("sales:" + orderId, {
      source: "sales", orderId,
      date: fmtDateTime(r[1]), dateOnly: fmtDate(r[2]),
      customerId: cid, customerName: String(r[6] || cid),
      phone: String(cs.phone || ""), address: String(cs.address || ""),
      lat: String(cs.lat || ""), lng: String(cs.lng || ""),
      takenBy: String(r[4] || ""),
      status: String(r[14] || "Pending"),
      payStatus: "", payType: String(r[13] || ""),
      note: String(r[15] || ""),
      otype: "", screenDate: "",
    }, {
      productId: String(r[7]), name: String(r[8]) || prodName(r[7]),
      qty: Number(r[9]) || 0, unitPrice: Number(r[11]) || 0,
      total: Number(r[12]) || 0,
    });
  });

  // ---- Orders_OEM (งาน OEM จากแอปเซลส์ — 1 แถว = 1 ออเดอร์ แบรนด์ลูกค้า ไม่มี Product_ID) ----
  // Order_ID(0) Timestamp(1) วันที่(2) เดือน(3) เซลส์(4) Customer_ID(5) ชื่อลูกค้า(6)
  // แบรนด์ลูกค้า(7) ขนาด(8) จำนวน(9) หน่วย(10) ราคา/หน่วย(11) รวม(12)
  // การชำระเงิน(13) กำหนดส่ง(14) สถานะ(15) หมายเหตุ(16)
  getAllRows("Orders_OEM").forEach(r => {
    const orderId = String(r[0]).trim();
    if (!orderId) return;
    const cid = String(r[5]).trim();
    const cs = custSales[cid] || {};
    // แปลงสถานะฝั่งเซลส์ → ภาษากลางของคิวโรงงาน
    let st = String(r[15] || "รอผลิต");
    let paid = false;
    if (st === "เก็บเงินแล้ว") { st = "ส่งแล้ว"; paid = true; }
    if (st === "Cancelled") st = "ยกเลิก";
    addItem("oem:" + orderId, {
      source: "oem", orderId,
      date: fmtDateTime(r[1]), dateOnly: fmtDate(r[2]),
      customerId: cid, customerName: String(r[6] || cid),
      phone: String(cs.phone || ""), address: String(cs.address || ""),
      lat: String(cs.lat || ""), lng: String(cs.lng || ""),
      takenBy: String(r[4] || ""),
      status: st,
      payStatus: paid ? "Paid" : "Unpaid", payType: String(r[13] || ""),
      note: String(r[16] || "") + (r[14] ? (r[16] ? " · " : "") + "กำหนดส่ง " + fmtDate(r[14]) : ""),
      otype: "OEM", screenDate: "",
    }, {
      productId: "",
      name: ((String(r[7] || "") + " " + String(r[8] || "")).trim() || "งาน OEM"),
      qty: Number(r[9]) || 0, unitPrice: Number(r[11]) || 0,
      total: Number(r[12]) || 0,
    });
  });

  const orders = Array.from(map.values())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 120);

  // ติดป้าย OEM: จากคอลัมน์ประเภท (ออเดอร์โรงงาน) หรือจากแบรนด์สินค้า
  // (เพียวซ่า/บุญวาทย์ = งานสกรีน OEM — ครอบคลุมออเดอร์ OEM ที่เซลส์ลงมาด้วย)
  orders.forEach(o => {
    o.oem = o.otype === "OEM" || o.items.some(it => {
      const p = products[String(it.productId)];
      return p && p.brand && HOUSE_BRANDS.indexOf(p.brand) < 0;
    });
  });

  // แนบสต๊อกสด ๆ ไปด้วย — หน้าออเดอร์โชว์ตัวเลขพร้อมขาย real time โดยไม่ต้องเรียกเพิ่ม
  const stock = Object.keys(products).map(id => ({
    id, name: products[id].name, brand: products[id].brand, stock: products[id].stock,
  }));

  return { orders, stock };
}

// ============================================================
// API: จองวันส่ง — หัวใจของสถานะ "พร้อมส่ง"
// เปลี่ยนสถานะ → พร้อมส่ง + ลงนัดส่งบนปฏิทิน (ผูกออเดอร์)
// สต๊อกพร้อมขายจะถูก "หักจอง" ตั้งแต่ตรงนี้ (ดู getStock)
// ============================================================

function bookDelivery(source, orderId, dateIso, staff, customerName, detail) {
  if (!dateIso) return { success: false, error: "เลือกวันส่งก่อน" };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const up = updateOrderStatus(source, orderId, "พร้อมส่ง");
    if (!up.success) return up;
    // มีนัดค้างของออเดอร์นี้อยู่แล้ว → เลื่อนวันแทนการสร้างซ้ำ
    const old = readMapped("DeliverySchedule").find(s =>
      String(s.orderId).trim() === String(orderId).trim() && String(s.status) === "นัดไว้");
    if (old) {
      setMapped("DeliverySchedule", old._row, "date", dateIso);
    } else {
      appendMapped("DeliverySchedule", {
        id: newId("DS"), timestamp: new Date(), date: dateIso,
        customer: customerName || "", detail: detail || "",
        orderId, status: "นัดไว้", by: staff || "",
      });
    }
    return { success: true, date: dateIso };
  } finally {
    lock.releaseLock();
  }
}

// คิวผลิตถัดไป (วันนี้เป็นต้นไป สถานะวางแผน) — โชว์บนแท็บผลิต
function getUpcomingPlans() {
  const today = todayStr();
  return readMapped("ProductionPlans")
    .filter(p => String(p.id).trim() !== "" &&
                 String(p.status || "วางแผน") === "วางแผน" && fmtDate(p.date) >= today)
    .map(p => ({
      id: String(p.id), date: fmtDate(p.date),
      product: String(p.product), target: Number(p.target) || 0,
      feeders: String(p.feeders || ""), packers: String(p.packers || ""),
      qc: String(p.qc || ""), ro: String(p.ro || ""), note: String(p.note || ""),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
}

// ============================================================
// API: แก้ราคาออเดอร์ (กรณีกรอกผิด) — แก้เฉพาะราคา/หน่วย
// prices = ราคาใหม่เรียงตามลำดับรายการในออเดอร์
// ============================================================

function editOrderPrices(source, orderId, prices) {
  const CFG = {
    factory: { sheet: "Orders",       qtyCol: 5,  priceCol: 6,  totalCol: 9 },
    line:    { sheet: "Orders_LINE",  qtyCol: 5,  priceCol: 6,  totalCol: 9 },
    sales:   { sheet: "Orders_Sales", qtyCol: 10, priceCol: 12, totalCol: 13 },
    oem:     { sheet: "Orders_OEM",   qtyCol: 10, priceCol: 12, totalCol: 13 },
  }[source];
  if (!CFG) return { success: false, error: "ไม่รู้จักช่องทาง " + source };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet(CFG.sheet);
    const data = sheet.getDataRange().getValues();
    let idx = 0, updated = 0, grandTotal = 0;
    for (let i = 1; i < data.length && idx < prices.length; i++) {
      if (String(data[i][0]).trim() !== String(orderId).trim()) continue;
      const newPrice = Number(prices[idx]);
      idx++;
      if (isNaN(newPrice) || newPrice < 0) continue;
      const qty = Number(data[i][CFG.qtyCol - 1]) || 0;
      sheet.getRange(i + 1, CFG.priceCol).setValue(newPrice);
      sheet.getRange(i + 1, CFG.totalCol).setValue(qty * newPrice);
      grandTotal += qty * newPrice;
      updated++;
    }
    return updated > 0
      ? { success: true, updated, grandTotal }
      : { success: false, error: "ไม่พบออเดอร์ " + orderId };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// API: อัปเดตสถานะออเดอร์ (ทุกแถวของ Order_ID นั้น)
// ============================================================

// itemCols = ตำแหน่ง Product_ID/Qty ในแถว
// deductAt: "load" = ตัดสต๊อกตอนขึ้นรถ (โรงงาน/LINE) | "order" = ตัดตั้งแต่ตอนสั่ง (เซลส์)
const ORDER_SHEETS = {
  factory: { sheet: "Orders",       statusCol: 8,  payCol: 10, itemCols: { pid: 3, qty: 4 }, deductAt: "load" },
  line:    { sheet: "Orders_LINE",  statusCol: 8,  payCol: 10, itemCols: { pid: 3, qty: 4 }, deductAt: "load" },
  sales:   { sheet: "Orders_Sales", statusCol: 15, payCol: -1, itemCols: { pid: 7, qty: 9 }, deductAt: "order" }, // ชำระเงินของเซลส์ = วิธีชำระ ไม่ใช่สถานะ
  // งาน OEM จากแอปเซลส์ — ผลิตตามสั่ง ไม่ผูกกับสต๊อกสำเร็จรูป (deductAt: none)
  oem:     { sheet: "Orders_OEM",   statusCol: 16, payCol: -1, itemCols: null, deductAt: "none" },
};

// สถานะขาออก: ชีต Orders_OEM เป็นของแอปเซลส์ ใช้ "Cancelled" (สูตร Dashboard เซลส์กรองคำนี้)
function outStatus(source, status) {
  if (source === "oem" && status === "ยกเลิก") return "Cancelled";
  return status;
}

function updateOrderStatus(source, orderId, status) {
  const cfg = ORDER_SHEETS[source];
  if (!cfg) return { success: false, error: "ไม่รู้จักช่องทาง " + source };
  const sheet = getSheet(cfg.sheet);
  const data = sheet.getDataRange().getValues();
  let updated = 0;
  let restored = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(orderId).trim()) {
      // ยกเลิกครั้งแรก → คืนสต๊อกเฉพาะกรณีที่ตัดไปแล้วจริง:
      //  เซลส์ตัดตอนสั่ง → คืนเสมอ / โรงงาน+LINE ตัดตอนขึ้นรถ → คืนเมื่อขึ้นรถ/ส่งแล้วเท่านั้น
      const prevStatus = String(data[i][cfg.statusCol - 1] || "");
      if (status === "ยกเลิก" && prevStatus !== "ยกเลิก" && cfg.itemCols) {
        // ยกเว้นออเดอร์ขายหน้ารถ (VS...) — ตัดจากของบนรถเร่ ไม่เคยตัดคลัง จึงไม่คืนคลัง
        const isVanSale = String(orderId).indexOf("VS") === 0;
        const wasDeducted = !isVanSale && (cfg.deductAt === "order" ||
          prevStatus === "ขึ้นรถแล้ว" || prevStatus === "ส่งแล้ว");
        if (wasDeducted) {
          const pid = data[i][cfg.itemCols.pid];
          const qty = Number(data[i][cfg.itemCols.qty]) || 0;
          if (pid && qty > 0) { addToProductStock(pid, qty); restored += qty; }
        }
      }
      sheet.getRange(i + 1, cfg.statusCol).setValue(outStatus(source, status));
      updated++;
    }
  }
  return updated > 0
    ? { success: true, updated, restored }
    : { success: false, error: "ไม่พบออเดอร์ " + orderId };
}

// ============================================================
// API: ขึ้นรถ — เปลี่ยนสถานะ + ตัดสต๊อกจริง ณ จุดที่ของออกจากคลัง
// (คนนับสต๊อก/คนยกของกดตอนเอาของขึ้นรถ — กดซ้ำไม่ตัดซ้ำ)
// ============================================================

function loadOrder(source, orderId, staff) {
  const cfg = ORDER_SHEETS[source];
  if (!cfg) return { success: false, error: "ไม่รู้จักช่องทาง " + source };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet(cfg.sheet);
    const data = sheet.getDataRange().getValues();

    // รอบแรก: เช็คก่อนว่าออเดอร์นี้ยังไม่เคยขึ้นรถ (กันตัดสต๊อกซ้ำ)
    const rows = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() !== String(orderId).trim()) continue;
      const prev = String(data[i][cfg.statusCol - 1] || "");
      if (prev === "ขึ้นรถแล้ว") return { success: false, error: "ออเดอร์นี้ขึ้นรถไปแล้ว" };
      if (prev === "ส่งแล้ว" || prev === "ยกเลิก") {
        return { success: false, error: "ออเดอร์นี้ " + prev + " ไปแล้ว" };
      }
      rows.push(i);
    }
    if (!rows.length) return { success: false, error: "ไม่พบออเดอร์ " + orderId };

    // รอบสอง: ตัดสต๊อก (เฉพาะช่องทางที่ยังไม่เคยตัด) + เปลี่ยนสถานะ
    let deducted = 0;
    rows.forEach(i => {
      if (cfg.deductAt === "load" && cfg.itemCols) {
        const pid = data[i][cfg.itemCols.pid];
        const qty = Number(data[i][cfg.itemCols.qty]) || 0;
        if (pid && qty > 0) { addToProductStock(pid, -qty); deducted += qty; }
      }
      sheet.getRange(i + 1, cfg.statusCol).setValue("ขึ้นรถแล้ว");
    });

    return { success: true, deducted };
  } finally {
    lock.releaseLock();
  }
}

// สต๊อกของออเดอร์นี้ "ถูกตัดไปแล้วหรือยัง" ในสถานะที่กำหนด
//  - ยกเลิก = ไม่ถูกตัด (คืนของแล้ว)
//  - เซลส์ (deductAt=order) = ตัดตั้งแต่สั่ง จึงถูกตัดทุกสถานะยกเว้นยกเลิก
//  - โรงงาน/LINE (deductAt=load) = ตัดตอนขึ้นรถ → ถูกตัดเมื่อ ขึ้นรถแล้ว/ส่งแล้ว
function isDeducted(status, cfg) {
  if (status === "ยกเลิก") return false;
  if (cfg.deductAt === "order") return true;
  return status === "ขึ้นรถแล้ว" || status === "ส่งแล้ว";
}

function deleteDeliveriesFor(orderId) {
  const sheet = getSheet("Deliveries");
  if (!sheet) return 0;
  const map = mapFields("Deliveries");
  if (!map || map.orderId < 0) return 0;
  const data = sheet.getDataRange().getValues();
  const del = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][map.orderId]).trim() === String(orderId).trim()) del.push(i);
  }
  del.sort((a, b) => b - a).forEach(i => sheet.deleteRow(i + 1));
  return del.length;
}

// แก้/ย้อนสถานะออเดอร์แบบตั้งค่าตรง ๆ (กันเคสกดพลาด) + ปรับสต๊อกให้ถูก
// ย้อนจาก "ส่งแล้ว" จะลบบันทึกงานส่งของออเดอร์นั้นให้ด้วย (เพราะจริง ๆ ยังไม่ได้ส่ง)
function changeOrderStatus(source, orderId, newStatus) {
  const cfg = ORDER_SHEETS[source];
  if (!cfg) return { success: false, error: "ไม่รู้จักช่องทาง " + source };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet(cfg.sheet);
    const data = sheet.getDataRange().getValues();
    const rows = [];
    let oldStatus = "";
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(orderId).trim()) {
        rows.push(i);
        oldStatus = String(data[i][cfg.statusCol - 1] || "");
      }
    }
    if (!rows.length) return { success: false, error: "ไม่พบออเดอร์ " + orderId };
    if (oldStatus === newStatus) return { success: true, changed: false, restored: 0, deducted: 0, removedDeliv: 0 };

    // ปรับสต๊อกตามการเปลี่ยน "ถูกตัด → ไม่ถูกตัด" (คืน) หรือ "ไม่ถูกตัด → ถูกตัด" (ตัด)
    const was = isDeducted(oldStatus, cfg), will = isDeducted(newStatus, cfg);
    let restored = 0, deducted = 0;
    if (cfg.itemCols && was !== will) {
      rows.forEach(i => {
        const pid = data[i][cfg.itemCols.pid], q = Number(data[i][cfg.itemCols.qty]) || 0;
        if (!pid || q <= 0) return;
        if (was && !will) { addToProductStock(pid, q); restored += q; }
        else { addToProductStock(pid, -q); deducted += q; }
      });
    }

    // ย้อนจาก "ส่งแล้ว" → ลบบันทึกงานส่งของออเดอร์นี้
    let removedDeliv = 0;
    if (oldStatus === "ส่งแล้ว" && newStatus !== "ส่งแล้ว") {
      removedDeliv = deleteDeliveriesFor(orderId);
    }

    rows.forEach(i => sheet.getRange(i + 1, cfg.statusCol).setValue(outStatus(source, newStatus)));
    return { success: true, changed: true, restored, deducted, removedDeliv };
  } finally {
    lock.releaseLock();
  }
}

function markPaid(source, orderId) {
  const cfg = ORDER_SHEETS[source];
  // OEM: ชีตเซลส์ใช้สถานะ "เก็บเงินแล้ว" แทนคอลัมน์ Payment_Status
  if (source === "oem") {
    const sheet = getSheet(cfg.sheet);
    const data = sheet.getDataRange().getValues();
    let updated = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(orderId).trim()) {
        sheet.getRange(i + 1, cfg.statusCol).setValue("เก็บเงินแล้ว");
        updated++;
      }
    }
    return { success: updated > 0, updated };
  }
  if (!cfg || cfg.payCol < 0) {
    return { success: false, error: "ออเดอร์เซลส์บันทึกรับเงินตอนปิดงานส่งแทน" };
  }
  const sheet = getSheet(cfg.sheet);
  const data = sheet.getDataRange().getValues();
  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(orderId).trim()) {
      sheet.getRange(i + 1, cfg.payCol).setValue("Paid");
      updated++;
    }
  }
  return { success: updated > 0, updated };
}

// ============================================================
// API: รับออเดอร์หน้าโรงงาน/โทรศัพท์ → ชีต Orders
// ============================================================

// แปลงวันที่ (yyyy-MM-dd จากฟอร์ม) เป็น Date — ไม่ระบุ = ตอนนี้ (real time)
function orderDateValue(orderDate) {
  if (!orderDate) return new Date();
  const d = new Date(orderDate + "T09:00:00+07:00"); // กันเพี้ยน timezone
  return isNaN(d) ? new Date() : d;
}

function addFactoryOrder(o) {
  const now = orderDateValue(o.orderDate);
  const orderId = newId("FO");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet("Orders");
    let grandTotal = 0;

    (o.items || []).forEach(item => {
      const rowTotal = Number(item.qty) * Number(item.unitPrice);
      grandTotal += rowTotal;
      // Order_ID|Date|Customer_ID|Product_ID|Qty|Unit_Price|ผู้รับออเดอร์|Status|TotalPrice|Payment_Status|Payment_Type|หมายเหตุ
      sheet.appendRow([
        orderId, now,
        // เลือกจากฐานข้อมูล → เก็บรหัส (C.../SC...) / ขาจร → เก็บชื่อ
        o.customerId || o.customerName || "ลูกค้าหน้าโรงงาน",
        item.productId || "", Number(item.qty), Number(item.unitPrice),
        o.staff || "โรงงาน",
        o.pickup ? "ส่งแล้ว" : "Pending", rowTotal,   // มารับเอง = จบงานทันที
        o.paid ? "Paid" : "Unpaid",
        o.payType || "เงินสด",
        (o.phone ? "โทร " + o.phone + " " : "") + (o.note || ""),
        o.orderType === "OEM" ? "OEM" : "ปกติ",       // M: หมวดออเดอร์
        o.screenDate || "",                            // N: วันนัดสกรีนขวด (OEM)
      ]);
    });

    // มารับเอง = ของออกจากคลังทันที → ตัดสต๊อกเลย
    // ออเดอร์ปกติ = จองไว้ก่อน ตัดจริงตอนกด "ขึ้นรถ"
    if (o.pickup) deductProductStock(o.items || []);

    // มารับเอง → ลงบันทึกงานส่งให้เลย ไม่ต้องไล่กดสถานะอีก 3 จอ
    if (o.pickup) {
      appendMapped("Deliveries", {
        id: newId("DV"), timestamp: now, date: todayStr(),
        orderId, source: "factory",
        customer: o.customerName || "ลูกค้าหน้าโรงงาน", driver: o.staff || "",
        collected: o.paid ? grandTotal : 0, note: "มารับเอง",
      });
    }

    return { success: true, orderId, grandTotal };
  } finally {
    lock.releaseLock();
  }
}

// แก้ไขออเดอร์โรงงานเต็มรูปแบบ (ลูกค้า/รายการ/ราคา/ชำระเงิน/หมวด/วันที่)
// เขียนแถวใหม่แทนของเดิม + ปรับสต๊อกให้ถูกถ้าออเดอร์เคยตัดไปแล้ว
function updateFactoryOrder(orderId, o) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet("Orders");
    const data = sheet.getDataRange().getValues();

    const rows = [];
    let oldStatus = "", oldDate = null, oldTakenBy = "";
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() !== String(orderId).trim()) continue;
      rows.push(i);
      oldStatus = String(data[i][7] || "");
      oldDate = data[i][1];
      oldTakenBy = String(data[i][6] || "");
    }
    if (!rows.length) return { success: false, error: "ไม่พบออเดอร์ " + orderId };
    if (oldStatus === "ยกเลิก") return { success: false, error: "ออเดอร์ถูกยกเลิกแล้ว แก้ไขไม่ได้" };

    // เคยตัดสต๊อกไปแล้วไหม (ขึ้นรถ/ส่งแล้ว) → ต้องคืนของเก่าก่อน แล้วตัดของใหม่
    const wasDeducted = (oldStatus === "ขึ้นรถแล้ว" || oldStatus === "ส่งแล้ว");
    if (wasDeducted) {
      rows.forEach(i => {
        const pid = data[i][3], qty = Number(data[i][4]) || 0;
        if (pid && qty > 0) addToProductStock(pid, qty); // คืนของเก่า
      });
    }

    // ลบแถวเดิม (ล่างขึ้นบน กันเลขแถวเลื่อน)
    rows.sort((a, b) => b - a).forEach(i => sheet.deleteRow(i + 1));

    // เขียนแถวใหม่ (คง Order_ID/สถานะ/ผู้รับเดิม, ใช้วันที่ใหม่ถ้าระบุ)
    const useDate = o.orderDate ? orderDateValue(o.orderDate) : (oldDate || new Date());
    let grandTotal = 0;
    (o.items || []).forEach(item => {
      const rowTotal = Number(item.qty) * Number(item.unitPrice);
      grandTotal += rowTotal;
      sheet.appendRow([
        orderId, useDate,
        o.customerId || o.customerName || "ลูกค้าหน้าโรงงาน",
        item.productId || "", Number(item.qty), Number(item.unitPrice),
        oldTakenBy || o.staff || "โรงงาน",
        oldStatus || "Pending", rowTotal,
        o.paid ? "Paid" : "Unpaid",
        o.payType || "เงินสด",
        (o.phone ? "โทร " + o.phone + " " : "") + (o.note || ""),
        o.orderType === "OEM" ? "OEM" : "ปกติ",
        o.screenDate || "",
      ]);
    });

    if (wasDeducted) deductProductStock(o.items || []); // ตัดของใหม่

    return { success: true, orderId, grandTotal };
  } finally {
    lock.releaseLock();
  }
}

function deductProductStock(items) {
  const sheet = getSheet("Products");
  const data = sheet.getDataRange().getValues();
  items.forEach(item => {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(item.productId).trim()) {
        const current = Number(data[i][4]) || 0;
        sheet.getRange(i + 1, 5).setValue(current - Number(item.qty)); // col 5 = Current_Stock
        break;
      }
    }
  });
}

// ============================================================
// API: บันทึกการผลิต
//  - เติม Products.Current_Stock (+qty)
//  - ตัดวัตถุดิบตาม BOM แล้วลง RawMatLog (ถ้า useBom)
// ============================================================

function addProduction(p) {
  const now = new Date();
  const logId = "PL" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMddHHmmss");
  const qty = Number(p.qty) || 0;
  if (qty <= 0) return { success: false, error: "จำนวนผลิตต้องมากกว่า 0" };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    appendMapped("ProductionLog", {
      id: logId, timestamp: now, date: todayStr(),
      productId: p.productId, product: p.productName || "",
      qty, staff: p.staff || "", type: "ผลิต", note: p.note || "",
    });

    // เติมสต๊อกสินค้า
    addToProductStock(p.productId, qty);

    // ตัดวัตถุดิบตาม BOM
    const used = [];
    if (p.useBom !== false) {
      const bomRows = readBom().filter(b => b.productId === String(p.productId));
      const mats = readRawMats();
      bomRows.forEach(b => {
        const need = b.perUnit * qty;
        if (need <= 0) return;
        const mat = mats.find(m => m.id === b.matId || m.name === b.matId);
        if (!mat) return;
        setMapped("Raw Materials", mat.row, "stock", mat.stock - need);
        appendMapped("RawMatLog", {
          id: "RL" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMddHHmmss") + used.length,
          timestamp: now, date: todayStr(),
          matId: mat.id, mat: mat.name,
          qty: -need, type: "ใช้ผลิต", ref: logId,
          staff: p.staff || "", note: (p.productName || p.productId) + " x" + qty,
        });
        used.push({ name: mat.name, qty: need, unit: mat.unit, left: mat.stock - need });
      });
    }

    return { success: true, logId, used };
  } finally {
    lock.releaseLock();
  }
}

function addToProductStock(productId, delta) {
  const sheet = getSheet("Products");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(productId).trim()) {
      const current = Number(data[i][4]) || 0;
      sheet.getRange(i + 1, 5).setValue(current + Number(delta));
      return current + Number(delta);
    }
  }
  return null;
}

// การผลิตวันนี้ (แสดงใต้ฟอร์มผลิต)
function getProductionToday() {
  const today = todayStr();
  return readMapped("ProductionLog")
    .filter(p => fmtDate(p.date) === today)
    .map(p => ({
      time: fmtDateTime(p.timestamp).slice(-5),
      product: String(p.product || p.productId), qty: Number(p.qty) || 0,
      staff: String(p.staff || ""), type: String(p.type || "ผลิต"),
      note: String(p.note || ""),
    }))
    .reverse();
}

// ============================================================
// API: รอบผลิต (เปิดรอบ → เบิกขวด → ปิดรอบส่งยอดดี/เสีย)
// ============================================================
// Flow หน้างาน:
//  1) เปิดรอบ: สแตมป์เวลาเริ่ม + ลงชื่อทีม 3 จุด (ป้อนขวด/แพ็คโหล/QC)
//     + เบิกขวดเปล่าเป็นถุง → ตัดสต๊อกขวดทันที
//  2) ระหว่างรอบ: เบิกขวดเพิ่มได้
//  3) ปิดรอบ: สแตมป์เวลาปิด + ยอดดี(แพ็ค) + ของเสียแยก 3 จุด(ขวด) + คืนขวดเหลือ
//     → เติมสต๊อกสินค้า, ตัดวัตถุดิบอื่นตาม BOM (ยกเว้นขวด เพราะตัดตอนเบิกแล้ว),
//       กระทบยอด: เบิก − ดี×12 − เสีย − คืน = ส่วนต่าง
// ============================================================

const RUN_HEADERS = ["Run_ID", "วันที่", "เวลาเริ่ม", "เวลาปิด", "Product_ID", "สินค้า",
  "คนป้อนขวด", "คนแพ็คโหล", "คนQC", "เบิกขวด(ถุง)", "เบิกขวด(ใบ)", "คืนขวด(ใบ)",
  "เสีย-ป้อนขวด", "เสีย-ไลน์ผลิต", "เสีย-แพ็คโหล", "เสียรวม(ขวด)", "ยอดดี(แพ็ค)",
  "ส่วนต่าง(ขวด)", "สถานะ", "ผู้เปิด", "ผู้ปิด", "หมายเหตุ"];

function ensureRunsSheet() {
  const spreadsheet = ss();
  if (spreadsheet.getSheetByName("ProductionRuns")) return;
  const sheet = spreadsheet.insertSheet("ProductionRuns");
  sheet.appendRow(RUN_HEADERS);
  sheet.getRange(1, 1, 1, RUN_HEADERS.length).setFontWeight("bold").setBackground("#DCFCE7");
  sheet.setFrozenRows(1);
}

// หา "ขวด" ของสินค้านี้จาก BOM (matId ขึ้นต้นด้วย "ขวด")
function bottleMatForProduct(productId) {
  const bomRow = readBom().find(b =>
    b.productId === String(productId) && String(b.matId).indexOf("ขวด") === 0);
  if (!bomRow) return null;
  return readRawMats().find(m => m.id === bomRow.matId || m.name === bomRow.matId) || null;
}

// ตัด/คืนสต๊อกขวด + ลง RawMatLog
function moveBottles(productId, delta, type, staff, ref, note) {
  const mat = bottleMatForProduct(productId);
  if (!mat) return null;
  setMapped("Raw Materials", mat.row, "stock", mat.stock + delta);
  appendMapped("RawMatLog", {
    id: "RL" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyMMddHHmmssSSS"),
    timestamp: new Date(), date: todayStr(),
    matId: mat.id, mat: mat.name,
    qty: delta, type: type, ref: ref || "",
    staff: staff || "", note: note || "",
  });
  return { name: mat.name, left: mat.stock + delta };
}

// แปลงแถวรอบผลิตเป็นรูปที่หน้าจอใช้ (ทั้งรอบที่เปิดอยู่และประวัติ)
function runShape(r) {
  let mins = "";
  if (r.start instanceof Date && r.end instanceof Date) {
    mins = Math.round((r.end - r.start) / 60000); // ระยะเวลาผลิต (นาที)
  }
  return {
    runId: String(r.runId), date: fmtDate(r.date),
    start: fmtDateTime(r.start).slice(-5),
    end: r.end ? fmtDateTime(r.end).slice(-5) : "",
    mins,
    productId: String(r.productId), product: String(r.product),
    feeders: String(r.feeders || ""), packers: String(r.packers || ""),
    qc: String(r.qc || ""),
    bags: Number(r.bags) || 0, bottles: Number(r.bottles) || 0,
    returned: Number(r.returned) || 0,
    waste1: Number(r.waste1) || 0, waste2: Number(r.waste2) || 0,
    waste3: Number(r.waste3) || 0, wasteTotal: Number(r.wasteTotal) || 0,
    good: Number(r.good) || 0,
    diff: (r.diff === "" || r.diff == null) ? "" : Number(r.diff),
    status: String(r.status),
    openedBy: String(r.openedBy || ""), closedBy: String(r.closedBy || ""),
    note: String(r.note || ""),
  };
}

function getActiveRuns() {
  return readMapped("ProductionRuns")
    .filter(r => String(r.status) === "กำลังผลิต")
    .map(runShape);
}

// ประวัติรอบผลิตที่ปิดแล้ว — ใหม่สุดก่อน (หน้าจอจัดกลุ่มตามวันที่เอง)
function getRunHistory() {
  return readMapped("ProductionRuns")
    .filter(r => String(r.runId).trim() !== "" && String(r.status) !== "กำลังผลิต")
    .map(runShape)
    .reverse()
    .slice(0, 100);
}

// จดของเสียสดๆ ระหว่างรอบ (สะสมลงคอลัมน์ของจุดนั้น → prefill ตอนปิดรอบ)
// point: 1=ป้อนขวด 2=ไลน์ผลิต 3=แพ็คโหล
function addRunWaste(runId, point, qty, staff) {
  const q = Number(qty) || 0;
  if (q <= 0) return { success: false, error: "จำนวนต้องมากกว่า 0" };
  const field = { 1: "waste1", 2: "waste2", 3: "waste3" }[Number(point)];
  if (!field) return { success: false, error: "จุดของเสียไม่ถูกต้อง" };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const run = readMapped("ProductionRuns").find(r =>
      String(r.runId) === String(runId) && String(r.status) === "กำลังผลิต");
    if (!run) return { success: false, error: "ไม่พบรอบผลิตที่เปิดอยู่" };

    const w = {
      waste1: Number(run.waste1) || 0,
      waste2: Number(run.waste2) || 0,
      waste3: Number(run.waste3) || 0,
    };
    w[field] += q;
    setMapped("ProductionRuns", run._row, field, w[field]);
    return { success: true, waste1: w.waste1, waste2: w.waste2, waste3: w.waste3 };
  } finally {
    lock.releaseLock();
  }
}

function startProductionRun(r) {
  ensureRunsSheet();
  const now = new Date();
  const runId = "PR" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMddHHmmss");
  const bottles = Number(r.bottles) || 0;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    appendMapped("ProductionRuns", {
      runId, date: todayStr(), start: now, end: "",
      productId: r.productId, product: r.productName || "",
      feeders: (r.feeders || []).join(", "),
      packers: (r.packers || []).join(", "),
      qc: (r.qc || []).join(", "),
      bags: Number(r.bags) || 0, bottles, returned: "",
      waste1: "", waste2: "", waste3: "", wasteTotal: "", good: "",
      status: "กำลังผลิต", openedBy: r.staff || "", closedBy: "",
      note: r.note || "",
    });

    // ตัดสต๊อกขวดตามที่เบิก
    let bottleMat = null;
    if (bottles > 0) {
      bottleMat = moveBottles(r.productId, -bottles, "เบิกผลิต", r.staff, runId,
        "เปิดรอบ เบิก " + (r.bags || "?") + " ถุง (" + bottles + " ใบ)");
    }

    return {
      success: true, runId,
      start: Utilities.formatDate(now, "Asia/Bangkok", "HH:mm"),
      bottleWarn: (bottles > 0 && !bottleMat)
        ? "ไม่พบ 'ขวด' ของสินค้านี้ใน BOM — บันทึกเบิกไว้ในรอบแล้ว แต่ยังไม่ได้ตัดสต๊อกขวด"
        : "",
    };
  } finally {
    lock.releaseLock();
  }
}

function addBottleWithdraw(runId, bags, bottles, staff) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const run = readMapped("ProductionRuns").find(r =>
      String(r.runId) === String(runId) && String(r.status) === "กำลังผลิต");
    if (!run) return { success: false, error: "ไม่พบรอบผลิตที่เปิดอยู่" };

    const newBags = (Number(run.bags) || 0) + (Number(bags) || 0);
    const newBottles = (Number(run.bottles) || 0) + (Number(bottles) || 0);
    setMapped("ProductionRuns", run._row, "bags", newBags);
    setMapped("ProductionRuns", run._row, "bottles", newBottles);

    if (Number(bottles) > 0) {
      moveBottles(run.productId, -Number(bottles), "เบิกผลิต", staff, runId,
        "เบิกเพิ่ม " + bags + " ถุง (" + bottles + " ใบ)");
    }
    return { success: true, bags: newBags, bottles: newBottles };
  } finally {
    lock.releaseLock();
  }
}

function closeProductionRun(c) {
  const now = new Date();
  const good = Number(c.good) || 0;
  const w1 = Number(c.waste1) || 0, w2 = Number(c.waste2) || 0, w3 = Number(c.waste3) || 0;
  const wasteTotal = w1 + w2 + w3;
  const returned = Number(c.returned) || 0;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const run = readMapped("ProductionRuns").find(r =>
      String(r.runId) === String(c.runId) && String(r.status) === "กำลังผลิต");
    if (!run) return { success: false, error: "ไม่พบรอบผลิตที่เปิดอยู่" };

    // กระทบยอดขวด: เบิก − ดี×12 − เสีย − คืน (เก็บลงชีตด้วย ไว้ดูย้อนหลังว่ารอบไหนขวดหาย)
    const bottles = Number(run.bottles) || 0;
    const diff = bottles - (good * BOTTLES_PER_PACK) - wasteTotal - returned;

    // สแตมป์เวลาปิด + ยอดทั้งหมดลงแถวรอบผลิต
    setMapped("ProductionRuns", run._row, "end", now);
    setMapped("ProductionRuns", run._row, "good", good);
    setMapped("ProductionRuns", run._row, "waste1", w1);
    setMapped("ProductionRuns", run._row, "waste2", w2);
    setMapped("ProductionRuns", run._row, "waste3", w3);
    setMapped("ProductionRuns", run._row, "wasteTotal", wasteTotal);
    setMapped("ProductionRuns", run._row, "returned", returned);
    setMapped("ProductionRuns", run._row, "diff", diff);
    setMapped("ProductionRuns", run._row, "status", "ปิดแล้ว");
    setMapped("ProductionRuns", run._row, "closedBy", c.staff || "");
    if (c.note) {
      setMapped("ProductionRuns", run._row, "note",
        String(run.note || "") ? run.note + " | ปิดรอบ: " + c.note : c.note);
    }

    // เติมสต๊อกสินค้า (ของดี)
    if (good > 0) addToProductStock(run.productId, good);

    // ตัดวัตถุดิบอื่นตาม BOM × ยอดดี (ยกเว้นขวด — ตัดไปแล้วตอนเบิก)
    const used = [];
    if (good > 0) {
      const bomRows = readBom().filter(b =>
        b.productId === String(run.productId) && String(b.matId).indexOf("ขวด") !== 0);
      const mats = readRawMats();
      bomRows.forEach(b => {
        const need = b.perUnit * good;
        if (need <= 0) return;
        const mat = mats.find(m => m.id === b.matId || m.name === b.matId);
        if (!mat) return;
        setMapped("Raw Materials", mat.row, "stock", mat.stock - need);
        appendMapped("RawMatLog", {
          id: "RL" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMddHHmmss") + used.length,
          timestamp: now, date: todayStr(),
          matId: mat.id, mat: mat.name,
          qty: -need, type: "ใช้ผลิต", ref: String(c.runId),
          staff: c.staff || "", note: run.product + " x" + good + " แพ็ค",
        });
        used.push({ name: mat.name, qty: need, unit: mat.unit, left: mat.stock - need });
      });
    }

    // ขวดเหลือคืนสต๊อก
    if (returned > 0) {
      moveBottles(run.productId, returned, "คืนขวด", c.staff, String(c.runId),
        "ขวดเหลือจากรอบผลิต");
    }

    // ลง ProductionLog ให้สรุปวันนี้/Dashboard เห็นเหมือนเดิม
    appendMapped("ProductionLog", {
      id: "PL" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMddHHmmss"),
      timestamp: now, date: todayStr(),
      productId: run.productId, product: run.product,
      qty: good, staff: c.staff || "", type: "ผลิต",
      note: c.runId + " เสีย " + wasteTotal + " ขวด" + (c.note ? " | " + c.note : ""),
    });

    return {
      success: true, good, wasteTotal, returned, bottles, diff, used,
      end: Utilities.formatDate(now, "Asia/Bangkok", "HH:mm"),
    };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// API: สต๊อก — ดู + ปรับยอด + รับวัตถุดิบเข้า
// ============================================================

function getStock() {
  // pending = ค้างส่งรวมทุกช่องทาง (ยังไม่ส่ง)
  // reserved = จองรอตัดสต๊อก — เฉพาะโรงงาน+LINE ที่ยังไม่ขึ้นรถ
  //            (เซลส์ตัดตอนสั่งไปแล้ว สะท้อนใน Current_Stock อยู่แล้ว ไม่นับซ้ำ)
  const pendingByProduct = {};
  const reservedByProduct = {};
  getOrderQueue().orders
    .filter(o => o.status !== "ส่งแล้ว" && o.status !== "ยกเลิก")
    .forEach(o => o.items.forEach(it => {
      pendingByProduct[it.productId] = (pendingByProduct[it.productId] || 0) + it.qty;
      // จอง = เฉพาะออเดอร์ที่ "จองวันส่งแล้ว" (พร้อมส่ง) — ออเดอร์ตอนนี้ยังไม่หักจอง
      // (ขึ้นรถ = ตัดจริงไปแล้ว / เซลส์ตัดตั้งแต่สั่ง ไม่นับซ้ำ)
      if (o.source !== "sales" && o.status === "พร้อมส่ง") {
        reservedByProduct[it.productId] = (reservedByProduct[it.productId] || 0) + it.qty;
      }
    }));

  return {
    products: readProducts().map(p => Object.assign(p, {
      pending: pendingByProduct[p.id] || 0,
      reserved: reservedByProduct[p.id] || 0,
      available: p.stock - (reservedByProduct[p.id] || 0),
    })),
    rawMats: readRawMats(),
  };
}

// ปรับสต๊อกสินค้าเป็นยอดที่นับได้จริง → log ใน ProductionLog ประเภท "ปรับสต๊อก"
function adjustProductStock(productId, productName, newQty, staff, reason) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = readProducts().find(x => x.id === String(productId));
    if (!p) return { success: false, error: "ไม่พบสินค้า" };
    const delta = Number(newQty) - p.stock;
    getSheet("Products").getRange(p.row, 5).setValue(Number(newQty));
    appendMapped("ProductionLog", {
      id: "PL" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyMMddHHmmss"),
      timestamp: new Date(), date: todayStr(),
      productId, product: productName || p.name,
      qty: delta, staff: staff || "", type: "ปรับสต๊อก",
      note: reason || ("นับจริง " + newQty),
    });
    return { success: true, stock: Number(newQty) };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// API: รถเร่ (Van Sales) — ฝั่งคนนับสต๊อก
// เซลส์เร่ส่งคำขอ ขึ้นของ/เติมของ/คืนของ จากแอปทีมเซลส์ (ชีต VanLoads สถานะ "รอเช็ค")
// คนนับสต๊อกนับของจริงแล้วกดยืนยันที่นี่ → ตัด/คืนสต๊อกคลัง ณ จุดนั้น
// VanLoads: A Load_ID, B Timestamp, C วันที่, D เดือน, E เซลส์, F ประเภท,
//           G Product_ID, H สินค้า, I จำนวน, J สถานะ, K ผู้เช็ค, L เวลาเช็ค, M หมายเหตุ
// ============================================================

function ensureVanSheet() {
  let sheet = getSheet("VanLoads");
  if (!sheet) {
    sheet = ss().insertSheet("VanLoads");
    const headers = ["Load_ID", "Timestamp", "วันที่", "เดือน", "เซลส์", "ประเภท",
                     "Product_ID", "สินค้า", "จำนวน", "สถานะ", "ผู้เช็ค", "เวลาเช็ค", "หมายเหตุ"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#E0F2FE");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getVanQueue() {
  ensureVanSheet();
  const map = new Map();
  const today = todayStr();
  getAllRows("VanLoads").forEach(r => {
    if (!r[0]) return;
    const id = String(r[0]);
    if (!map.has(id)) {
      map.set(id, { loadId: id, rep: String(r[4]), type: String(r[5]), date: fmtDate(r[2]),
                    status: String(r[9]), checker: String(r[10] || ""), note: String(r[12] || ""), items: [] });
    }
    map.get(id).items.push({ productId: String(r[6]), name: r[7], qty: Number(r[8]) || 0 });
  });
  const all = Array.from(map.values());
  return {
    pending: all.filter(l => l.status === "รอเช็ค").reverse(),
    doneToday: all.filter(l => l.status !== "รอเช็ค" && l.date === today).reverse(),
  };
}

function confirmVanLoad(loadId, staff) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet("VanLoads");
    const data  = sheet.getDataRange().getValues();
    const now   = new Date();
    let type = "", n = 0;
    const items = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() !== String(loadId).trim()) continue;
      if (String(data[i][9]) !== "รอเช็ค") return { success: false, error: "รายการนี้ถูกเช็คไปแล้ว" };
      type = String(data[i][5]);
      items.push({ productId: data[i][6], qty: Number(data[i][8]) || 0 });
      sheet.getRange(i + 1, 10).setValue("ยืนยันแล้ว");
      sheet.getRange(i + 1, 11).setValue(staff || "");
      sheet.getRange(i + 1, 12).setValue(now);
      n++;
    }
    if (!n) return { success: false, error: "ไม่พบรายการ " + loadId };
    // ขึ้นของ/เติมของ = ของออกจากคลัง → ตัดสต๊อก / คืนของ = กลับเข้าคลัง → บวกคืน
    items.forEach(it => {
      if (it.productId && it.qty > 0) {
        addToProductStock(it.productId, (type === "คืนของ" ? 1 : -1) * it.qty);
      }
    });
    return { success: true, type, lines: n };
  } finally {
    lock.releaseLock();
  }
}

function rejectVanLoad(loadId, staff) {
  const sheet = getSheet("VanLoads");
  const data  = sheet.getDataRange().getValues();
  const now   = new Date();
  let n = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(loadId).trim()) continue;
    if (String(data[i][9]) !== "รอเช็ค") return { success: false, error: "รายการนี้ถูกเช็คไปแล้ว" };
    sheet.getRange(i + 1, 10).setValue("ปฏิเสธ");
    sheet.getRange(i + 1, 11).setValue(staff || "");
    sheet.getRange(i + 1, 12).setValue(now);
    n++;
  }
  return n ? { success: true } : { success: false, error: "ไม่พบรายการ " + loadId };
}

// รับวัตถุดิบเข้า (+) หรือปรับยอด — log ใน RawMatLog
function moveRawMat(matId, qty, type, staff, note) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const mat = readRawMats().find(m => m.id === String(matId));
    if (!mat) return { success: false, error: "ไม่พบวัตถุดิบ" };
    const delta = Number(qty) || 0;
    const newStock = type === "ปรับยอด" ? delta : mat.stock + delta;
    setMapped("Raw Materials", mat.row, "stock", newStock);
    appendMapped("RawMatLog", {
      id: "RL" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyMMddHHmmss"),
      timestamp: new Date(), date: todayStr(),
      matId: mat.id, mat: mat.name,
      qty: type === "ปรับยอด" ? (newStock - mat.stock) : delta,
      type: type || "รับเข้า", ref: "",
      staff: staff || "", note: note || "",
    });
    return { success: true, stock: newStock };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// API: ปิดงานส่ง — ลง Deliveries + สถานะ "ส่งแล้ว" + เก็บเงิน
// ============================================================

function completeDelivery(d) {
  const now = new Date();
  const cfg = ORDER_SHEETS[d.source];

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // กันเคสข้ามขั้น: ปิดงานส่งโดยไม่ได้กด "ขึ้นรถ" → ตัดสต๊อกให้ตรงนี้แทน
    if (cfg && cfg.deductAt === "load" && cfg.itemCols) {
      const sheet = getSheet(cfg.sheet);
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() !== String(d.orderId).trim()) continue;
        const prev = String(data[i][cfg.statusCol - 1] || "");
        if (prev !== "ขึ้นรถแล้ว" && prev !== "ส่งแล้ว" && prev !== "ยกเลิก") {
          const pid = data[i][cfg.itemCols.pid];
          const qty = Number(data[i][cfg.itemCols.qty]) || 0;
          if (pid && qty > 0) addToProductStock(pid, -qty);
        }
      }
    }

    appendMapped("Deliveries", {
      id: newId("DV"), timestamp: now, date: todayStr(),
      orderId: d.orderId, source: d.source,
      customer: d.customerName || "", driver: d.driver || "",
      collected: Number(d.collected) || 0, note: d.note || "",
    });

    updateOrderStatus(d.source, d.orderId, "ส่งแล้ว");

    // จ่ายครบยอดถึงติ๊ก Paid — จ่ายบางส่วน/ยังไม่พร้อมจ่าย คงสถานะติดเงินไว้ตามทวงต่อ
    const collected = Number(d.collected) || 0;
    if (collected > 0 && d.source !== "sales" && collected >= (Number(d.total) || 0)) {
      markPaid(d.source, d.orderId);
    }

    // นัดส่งบนปฏิทินที่ผูกออเดอร์นี้ → ปิดให้อัตโนมัติ
    readMapped("DeliverySchedule")
      .filter(s => String(s.orderId).trim() === String(d.orderId).trim() &&
                   String(s.status) === "นัดไว้")
      .forEach(s => setMapped("DeliverySchedule", s._row, "status", "ส่งแล้ว"));

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// งานส่งที่ปิดแล้ววันนี้
function getDeliveriesToday() {
  const today = todayStr();
  return readMapped("Deliveries")
    .filter(d => fmtDate(d.date) === today)
    .map(d => ({
      time: fmtDateTime(d.timestamp).slice(-5),
      orderId: String(d.orderId), customer: String(d.customer),
      driver: String(d.driver), collected: Number(d.collected) || 0,
    }))
    .reverse();
}

// ============================================================
// API: พนักงาน — เพิ่ม / พักงาน (soft delete เก็บประวัติไว้)
// ============================================================

function getStaffFull() {
  return readMapped("Staff")
    .filter(s => String(s.name).trim() !== "")
    .map(s => ({
      id: String(s.id || s.name), name: String(s.name),
      role: String(s.role || ""), hasPin: String(s.pin).trim() !== "",
      active: String(s.active).toUpperCase() !== "FALSE",
    }));
}

function addStaff(name, role, pin, by) {
  if (!String(name || "").trim()) return { success: false, error: "ใส่ชื่อพนักงานก่อน" };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rows = readMapped("Staff");
    if (rows.some(s => String(s.name).trim() === String(name).trim())) {
      return { success: false, error: "มีชื่อนี้อยู่แล้ว" };
    }
    // Staff_ID ถัดไปจากเลขสูงสุดที่มี (S01, S02, ...)
    let maxN = 0;
    rows.forEach(s => {
      const m = String(s.id).match(/^S(\d+)$/i);
      if (m) maxN = Math.max(maxN, Number(m[1]));
    });
    const id = "S" + String(maxN + 1 || rows.length + 1).padStart(2, "0");
    appendMapped("Staff", {
      id, name: String(name).trim(), role: role || "", pin: pin || "", active: "TRUE",
    });
    return { success: true, id };
  } finally {
    lock.releaseLock();
  }
}

function setStaffActive(staffId, active) {
  const s = readMapped("Staff").find(x =>
    String(x.id || x.name).trim() === String(staffId).trim());
  if (!s) return { success: false, error: "ไม่พบพนักงาน" };
  setMapped("Staff", s._row, "active", active ? "TRUE" : "FALSE");
  return { success: true };
}

// ============================================================
// API: วันลา
// ============================================================

function addLeave(l) {
  if (!l.staff || !l.from) return { success: false, error: "เลือกพนักงานและวันที่ก่อน" };
  const id = newId("LV");
  appendMapped("Leaves", {
    id, timestamp: new Date(),
    staff: l.staff, from: l.from, to: l.to || l.from,
    type: l.type || "ลากิจ", note: l.note || "", by: l.by || "",
  });
  return { success: true, id };
}

function deleteLeave(leaveId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const row = readMapped("Leaves").find(x => String(x.id) === String(leaveId));
    if (!row) return { success: false, error: "ไม่พบรายการลา" };
    getSheet("Leaves").deleteRow(row._row);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// วันลาที่ยังไม่จบ (วันนี้เป็นต้นไป) — โชว์ในหน้าพนักงาน
function getUpcomingLeaves() {
  const today = todayStr();
  return readMapped("Leaves")
    .filter(l => String(l.id).trim() !== "" && fmtDate(l.to || l.from) >= today)
    .map(l => ({
      id: String(l.id), staff: String(l.staff),
      from: fmtDate(l.from), to: fmtDate(l.to || l.from),
      type: String(l.type || ""), note: String(l.note || ""),
    }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

// ============================================================
// API: ปฏิทินแผนงาน — แผนผลิต + นัดส่ง + วันลา ของเดือนนั้น
// ============================================================

function getPlanner(month) { // month = "2026-07"
  const start = month + "-01", end = month + "-31";

  const plans = readMapped("ProductionPlans")
    .filter(p => String(p.id).trim() !== "" &&
                 fmtDate(p.date) >= start && fmtDate(p.date) <= end)
    .map(p => ({
      id: String(p.id), date: fmtDate(p.date),
      productId: String(p.productId), product: String(p.product),
      target: Number(p.target) || 0,
      feeders: String(p.feeders || ""), packers: String(p.packers || ""),
      qc: String(p.qc || ""), ro: String(p.ro || ""),
      status: String(p.status || "วางแผน"), note: String(p.note || ""),
      by: String(p.by || ""),
    }));

  const deliveries = readMapped("DeliverySchedule")
    .filter(d => String(d.id).trim() !== "" &&
                 fmtDate(d.date) >= start && fmtDate(d.date) <= end)
    .map(d => ({
      id: String(d.id), date: fmtDate(d.date),
      customer: String(d.customer), detail: String(d.detail || ""),
      orderId: String(d.orderId || ""),
      status: String(d.status || "นัดไว้"), by: String(d.by || ""),
    }));

  const leaves = readMapped("Leaves")
    .filter(l => String(l.id).trim() !== "" &&
                 fmtDate(l.from) <= end && fmtDate(l.to || l.from) >= start)
    .map(l => ({
      id: String(l.id), staff: String(l.staff),
      from: fmtDate(l.from), to: fmtDate(l.to || l.from),
      type: String(l.type || ""),
    }));

  // งานสกรีน OEM — ออเดอร์โรงงานที่บุ๊ควันสกรีน (คอลัมน์ N) ในเดือนนี้
  const prodNames = {};
  readProducts().forEach(p => prodNames[p.id] = p.name);
  const scrMap = new Map();
  getAllRows("Orders").forEach(r => {
    const sd = fmtDate(r[13]);
    if (!sd || sd < start || sd > end) return;
    const id = String(r[0]).trim();
    if (!scrMap.has(id)) {
      scrMap.set(id, {
        orderId: id, date: sd,
        customer: String(r[2] || ""), status: String(r[7] || ""), items: [],
      });
    }
    scrMap.get(id).items.push(
      (prodNames[String(r[3])] || String(r[3])) + "×" + (Number(r[4]) || 0));
  });
  const screens = Array.from(scrMap.values());

  return { plans, deliveries, leaves, screens };
}

function addPlan(p) {
  if (!p.date || !p.productId) return { success: false, error: "เลือกวันและสินค้าก่อน" };
  const id = newId("PN");
  appendMapped("ProductionPlans", {
    id, timestamp: new Date(), date: p.date,
    productId: p.productId, product: p.product || "",
    target: Number(p.target) || 0,
    feeders: (p.feeders || []).join(", "), packers: (p.packers || []).join(", "),
    qc: (p.qc || []).join(", "), ro: (p.ro || []).join(", "),
    status: "วางแผน", note: p.note || "", by: p.by || "",
  });
  return { success: true, id };
}

function setPlanStatus(planId, status) {
  const p = readMapped("ProductionPlans").find(x => String(x.id) === String(planId));
  if (!p) return { success: false, error: "ไม่พบแผน" };
  setMapped("ProductionPlans", p._row, "status", status);
  return { success: true };
}

// แก้ไขแผนผลิต (วัน/สินค้า/เป้า/ผู้รับผิดชอบ/หมายเหตุ) จากปฏิทิน
function updatePlan(planId, p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const row = readMapped("ProductionPlans").find(x => String(x.id) === String(planId));
    if (!row) return { success: false, error: "ไม่พบแผน" };
    const set = (f, v) => setMapped("ProductionPlans", row._row, f, v);
    if (p.date) set("date", p.date);
    if (p.productId != null) { set("productId", p.productId); set("product", p.product || ""); }
    if (p.target != null) set("target", Number(p.target) || 0);
    set("feeders", (p.feeders || []).join(", "));
    set("packers", (p.packers || []).join(", "));
    set("qc", (p.qc || []).join(", "));
    set("ro", (p.ro || []).join(", "));
    if (p.note != null) set("note", p.note);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function addDeliverySchedule(d) {
  if (!d.date || !String(d.customer || "").trim()) {
    return { success: false, error: "ใส่วันและชื่อลูกค้าก่อน" };
  }
  const id = newId("DS");
  appendMapped("DeliverySchedule", {
    id, timestamp: new Date(), date: d.date,
    customer: d.customer, detail: d.detail || "", orderId: d.orderId || "",
    status: "นัดไว้", by: d.by || "",
  });
  return { success: true, id };
}

function setDeliveryScheduleStatus(id, status) {
  const d = readMapped("DeliverySchedule").find(x => String(x.id) === String(id));
  if (!d) return { success: false, error: "ไม่พบนัดส่ง" };
  setMapped("DeliverySchedule", d._row, "status", status);
  return { success: true };
}

// ============================================================
// setupFactorySheets — รันครั้งเดียวก่อนใช้งาน
// ปลอดภัยกับข้อมูล AppSheet เดิม:
//  - ชีตที่มีอยู่แล้ว → ไม่แตะข้อมูล เติมเฉพาะหัวคอลัมน์ที่ขาด (ต่อท้าย)
//  - ชีตที่ไม่มี → สร้างใหม่พร้อมหัวคอลัมน์มาตรฐาน
// เสร็จแล้วดู Log ว่าคอลัมน์ไหน map เจอ/ไม่เจอ
// ============================================================

function setupFactorySheets() {
  const spreadsheet = ss();

  const DEFAULT_HEADERS = {
    "ProductionLog": ["Log_ID", "Timestamp", "วันที่", "Product_ID", "สินค้า",
                      "จำนวนผลิต", "ผู้บันทึก", "ประเภท", "หมายเหตุ"],
    "Raw Materials": ["RawMat_ID", "ชื่อวัตถุดิบ", "หน่วย", "Current_Stock", "Min_Stock"],
    "RawMatLog":     ["Log_ID", "Timestamp", "วันที่", "RawMat_ID", "วัตถุดิบ",
                      "จำนวน", "ประเภท", "อ้างอิง", "ผู้บันทึก", "หมายเหตุ"],
    "BOM":           ["Product_ID", "RawMat_ID", "จำนวนต่อหน่วยผลิต"],
    "Staff":         ["Staff_ID", "ชื่อ", "Role", "PIN", "Active"],
    "Deliveries":    ["Delivery_ID", "Timestamp", "วันที่", "Order_ID", "ช่องทาง",
                      "ลูกค้า", "คนส่ง", "เก็บเงิน(บาท)", "หมายเหตุ"],
    "ProductionRuns": RUN_HEADERS,
    "Leaves":        ["Leave_ID", "Timestamp", "พนักงาน", "วันที่เริ่ม", "วันที่สิ้นสุด",
                      "ประเภท", "หมายเหตุ", "ผู้บันทึก"],
    "ProductionPlans": ["Plan_ID", "Timestamp", "วันที่ผลิต", "Product_ID", "สินค้า",
                      "เป้า(แพ็ค)", "คนป้อนขวด", "คนแพ็คโหล", "คนQC", "คนRO",
                      "สถานะ", "หมายเหตุ", "ผู้วางแผน"],
    "DeliverySchedule": ["Schedule_ID", "Timestamp", "วันที่ส่ง", "ลูกค้า", "รายละเอียด",
                      "Order_ID", "สถานะ", "ผู้บันทึก"],
  };

  Object.keys(DEFAULT_HEADERS).forEach(name => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
      sheet.appendRow(DEFAULT_HEADERS[name]);
      sheet.getRange(1, 1, 1, DEFAULT_HEADERS[name].length)
        .setFontWeight("bold").setBackground("#DCFCE7");
      sheet.setFrozenRows(1);
      Logger.log("สร้างชีตใหม่: " + name);
    }
    // เติมหัวคอลัมน์ที่ app ต้องใช้แต่ยังไม่มี (ต่อท้าย ไม่ขยับของเดิม)
    const aliases = FIELD_ALIASES[name];
    const headers = getHeaders(sheet);
    Object.keys(aliases).forEach(field => {
      const found = headers.some(h =>
        aliases[field].some(a => h.toLowerCase() === String(a).toLowerCase()));
      if (!found) {
        const newCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, newCol).setValue(aliases[field][0])
          .setFontWeight("bold").setBackground("#FEF3C7");
        headers.push(aliases[field][0]);
        Logger.log(name + ": เพิ่มคอลัมน์ " + aliases[field][0] +
                   " (ถ้าข้อมูลนี้มีอยู่แล้วใต้ชื่ออื่น ให้เปลี่ยนชื่อหัวคอลัมน์เดิมเป็นชื่อนี้แล้วลบอันที่เพิ่มมา)");
      }
    });
  });

  // Staff ว่างเปล่า → ใส่ตัวอย่างให้แก้
  const staffSheet = spreadsheet.getSheetByName("Staff");
  if (staffSheet.getLastRow() < 2) {
    appendMapped("Staff", { id: "S01", name: "Palm", role: "แอดมิน", pin: "9999", active: "TRUE" });
    appendMapped("Staff", { id: "S02", name: "พนักงาน 1 (แก้ชื่อในชีต)", role: "ผลิต", pin: "1111", active: "TRUE" });
    Logger.log("Staff ว่าง → ใส่พนักงานตัวอย่าง 2 คน (แก้ชื่อ/PIN ในชีตได้เลย)");
  }

  // Orders: เติมคอลัมน์ที่แอปใช้ — L=หมายเหตุ, M=ประเภท (ปกติ/OEM), N=วันสกรีน
  const ordersSheet = spreadsheet.getSheetByName("Orders");
  if (ordersSheet) {
    [["หมายเหตุ", 12], ["ประเภท", 13], ["วันสกรีน", 14]].forEach(pair => {
      if (ordersSheet.getLastColumn() < pair[1]) {
        ordersSheet.getRange(1, pair[1]).setValue(pair[0])
          .setFontWeight("bold").setBackground("#FEF3C7");
        Logger.log("Orders: เพิ่มคอลัมน์ " + pair[0]);
      }
    });
  }

  // รายงานผล map คอลัมน์ทุกชีต
  Object.keys(DEFAULT_HEADERS).forEach(name => {
    const map = mapFields(name);
    const missing = Object.keys(map).filter(f => f !== "_width" && map[f] < 0);
    Logger.log(name + " → " + (missing.length ? "ยังหาไม่เจอ: " + missing.join(", ") : "ครบทุกคอลัมน์ ✓"));
  });

  Logger.log("setupFactorySheets เสร็จสมบูรณ์");
}

// ============================================================
// Code.gs — ระบบทีมเซลส์ ละกอน/เพียวซ่า (จ.ลำปาง) — v3
// Google Apps Script Backend + Web App
// ============================================================
// ใช้ Spreadsheet เดียวกับระบบ LINE OA + AppSheet ฝ่ายผลิต
// ชีตของระบบนี้: SalesReps, Routes, Customers_Sales, Visits,
//                Orders_Sales, Orders_OEM, Quotes, Dashboard_Sales
// ชีตที่ใช้ร่วม: Products (อ่านราคา/สต๊อก + ตัดสต๊อกเมื่อขาย)
// ============================================================
// ติดตั้งครั้งแรก: รัน setupSalesSheets
// อัปเกรดจาก v1: รัน upgradeToV2 แล้วตามด้วย upgradeToV3
// อัปเกรดจาก v2: รัน upgradeToV3
// จากนั้น Deploy → Manage deployments → New version ทุกครั้งที่แก้โค้ด
// ============================================================

const SPREADSHEET_ID = PropertiesService.getScriptProperties()
  .getProperty("SPREADSHEET_ID");   // ⚠️ เก็บ ID จริงใน Script Properties (repo นี้เป็นสาธารณะ)

// แบรนด์ที่ทีมเซลส์ขายได้ (แบรนด์ของเราเอง)
const SALE_BRANDS = ["ละกอน", "เพียวซ่า"];

// ⚠️ ข้อมูลบริษัทบนหัวใบเสนอราคา PDF — แก้ให้เป็นข้อมูลจริงก่อนใช้งาน
const COMPANY = {
  nameTh: "บริษัท ออริจิน แล็บส์ จำกัด",
  nameEn: "Origin Labs Co., Ltd.",
  address: "จังหวัดลำปาง (⚠️ แก้ที่อยู่จริงตรงนี้)",
  phone: "08x-xxx-xxxx (⚠️ แก้)",
  taxId: "x-xxxx-xxxxx-xx-x (⚠️ แก้)",
};

// ตัดสต๊อก Products.Current_Stock ทันทีที่เซลส์ลงออเดอร์แบรนด์เรา
// ⚠️ ตั้งเป็น false ถ้าไปตั้ง Automation ตัดสต๊อกใน AppSheet แล้ว (กันตัดซ้ำสองที่)
// หมายเหตุ: ออเดอร์ OEM ไม่ตัดสต๊อก (ผลิตตามสั่ง)
const DEDUCT_STOCK = true;

// ============================================================
// forceAuth — รันครั้งเดียวในตัวแก้ไข เพื่อขอสิทธิ์ Google Drive
// (จำเป็นสำหรับฟีเจอร์อัปโหลดรูปหน้าร้าน)
// เมื่อรัน จะเด้ง popup ขอสิทธิ์ → กด Allow ให้ครบทุกข้อ (รวม Google Drive)
// ============================================================

function forceAuth() {
  const folderName = "ละกอน_SalesPhotos";
  const iter = DriveApp.getFoldersByName(folderName);
  const folder = iter.hasNext() ? iter.next() : DriveApp.createFolder(folderName);
  SpreadsheetApp.openById(SPREADSHEET_ID).getName();
  Logger.log("✅ ได้สิทธิ์ครบแล้ว โฟลเดอร์เก็บรูป: " + folder.getName());
}

// ============================================================
// รันครั้งเดียวจาก Editor: ย้ายข้อมูลเก่าที่บันทึกใต้ชื่อเซลส์เดิม
// ไปเป็นชื่อใหม่ (เช่น "หัวหน้าทีม" → "คุณกอล์ฟ") เพื่อให้ยอดสะสม/สถิติ
// ส่วนตัวนับข้อมูลเก่าด้วย — แก้ค่า OLD_NAME / NEW_NAME ก่อนรัน
// ============================================================

function fixLegacyRepName() {
  const OLD_NAME = "หัวหน้าทีม";   // ← ชื่อเดิมที่อยู่ในข้อมูลเก่า
  const NEW_NAME = "คุณซาย";     // ← ชื่อจริงใน SalesReps ที่จะรับข้อมูลนี้ไป

  // ชีต → คอลัมน์ชื่อเซลส์ (1-based)
  const targets = [
    ["Visits", 5], ["Orders_Sales", 5], ["Orders_OEM", 5],
    ["Quotes", 5], ["Appointments", 5], ["Leaves", 5],
    ["Customers_Sales", 8],
  ];
  let total = 0;
  targets.forEach(([name, col]) => {
    const sheet = getSheet(name);
    if (!sheet) return;
    const rng = sheet.getRange(2, col, Math.max(sheet.getLastRow() - 1, 1), 1);
    const vals = rng.getValues();
    let n = 0;
    vals.forEach(v => { if (String(v[0]).trim() === OLD_NAME) { v[0] = NEW_NAME; n++; } });
    if (n) { rng.setValues(vals); total += n; }
    Logger.log(name + ": แก้ " + n + " แถว");
  });
  Logger.log("✅ ย้าย \"" + OLD_NAME + "\" → \"" + NEW_NAME + "\" รวม " + total + " แถว");
}

// ============================================================
// Web App entry
// ============================================================

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("ละกอน Sales")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1");
}

// ============================================================
// Utility
// ============================================================

function ss() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  return ss().getSheetByName(name);
}

function getAllRows(sheetName) {
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1);
}

function todayStr() {
  return Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
}

function monthStr() {
  return Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM");
}

function fmtDate(d) {
  return (d instanceof Date)
    ? Utilities.formatDate(d, "Asia/Bangkok", "yyyy-MM-dd") : String(d);
}

// คอลัมน์ "เดือน" ในชีตถูก Sheets แปลงเป็นวันที่อัตโนมัติ (พิมพ์ "2026-08" → 1 ส.ค. 2026)
// ต้องแปลงกลับก่อนเทียบเสมอ ห้ามเทียบ String(cell) ตรงๆ
function fmtMonth(d) {
  return (d instanceof Date)
    ? Utilities.formatDate(d, "Asia/Bangkok", "yyyy-MM") : String(d || "").trim();
}

// ============================================================
// API: ข้อมูลเริ่มต้น (เรียกตอนเปิดแอป)
// ============================================================

// repName (หลังล็อกอิน) → กรองข้อมูลลูกค้าตามสิทธิ์:
//   เซลส์/หัวหน้าสาย เห็นเฉพาะลูกค้าในสายตัวเอง / ผู้จัดการ เห็นทุกสาย
// ยังไม่ล็อกอิน → ได้แค่รายชื่อเซลส์กับสินค้า (ลูกค้าเป็นลิสต์ว่าง)
function getInit(repName) {
  const reps = getAllRows("SalesReps")
    .filter(r => r[0] && String(r[4]).toUpperCase() !== "FALSE")
    .map(r => ({ id: r[0], name: r[1], route: String(r[2]), hasPin: String(r[3]).trim() !== "" }));

  const routes = getAllRows("Routes")
    .filter(r => r[0])
    .map(r => ({ route: String(r[0]), zone: r[1], districts: r[2], target: r[3] }));

  let routeFilter = null; // null = เห็นทุกสาย
  if (!repName) {
    routeFilter = []; // ยังไม่ล็อกอิน → ไม่เห็นลูกค้าเลย
  } else {
    const sc = getScopeReps(repName);
    if (!sc.all) routeFilter = sc.routes;
  }

  const customers = getAllRows("Customers_Sales")
    .filter(r => r[0])
    .filter(r => {
      if (routeFilter === null) return true;
      return splitRoutes(r[8]).some(rt => routeFilter.indexOf(rt) !== -1);
    })
    .map(r => ({
      id: r[0], name: r[1], type: r[2], district: r[3], address: r[4],
      contact: r[5], phone: String(r[6] || ""), rep: r[7], route: String(r[8] || ""),
      grade: r[9], status: r[10], note: r[13] || "",
      lat: r[14] || "", lng: r[15] || "", mapsUrl: r[21] || "",
    }));

  // ข้อมูลคู่แข่ง: หลายรายการต่อลูกค้า (ชีต Competitors, 1 แถว = 1 รายการ)
  const compMap = {};
  getAllRows("Competitors").filter(r => r[0]).forEach(r => {
    const key = String(r[0]).trim();
    (compMap[key] = compMap[key] || []).push({
      brand: r[2], size: r[3], buy: r[4], sell: r[5], volume: r[6], freq: r[7],
    });
  });
  customers.forEach(c => c.compItems = compMap[String(c.id).trim()] || []);

  // Products ใช้ร่วมกับระบบ LINE + AppSheet ฝ่ายผลิต
  // โครงจริง: Product_ID(0) Brand(1) Size(2) Category(3) Current_Stock(4) Company(5)
  //           ราคาปลีก(6) Price(7) ราคาส่ง(8) ราคาตัวแทน(9) ราคาสวมฉลาก(10) Product_Name(11)
  // สินค้าหมดสต๊อกยังแสดง (ขายล่วงหน้าได้ ฝ่ายผลิตผลิตตามออเดอร์)
  const products = getAllRows("Products")
    .filter(r => SALE_BRANDS.indexOf(String(r[1]).trim()) !== -1 && String(r[0]).trim() !== "")
    .map(r => ({
      id: r[0], brand: String(r[1]).trim(), size: r[2], category: r[3],
      stock: Number(r[4]) || 0,
      // เซลส์ขายโรงน้ำ/ร้านค้า → ใช้ราคาส่งก่อน ไม่มีค่อย fallback
      price: Number(r[8]) || Number(r[7]) || Number(r[6]) || 0,
      priceRetail: Number(r[6]) || 0,
      name: String(r[11] || (r[1] + " " + r[2] + " " + (r[3] || ""))).trim(),
    }));

  return { reps, routes, customers, products };
}

// ============================================================
// API: login ด้วยชื่อ + PIN (PIN ว่าง = ไม่ต้องใช้)
// ============================================================

function login(repId, pin) {
  const row = getAllRows("SalesReps").find(r => String(r[0]) === String(repId));
  if (!row) return { success: false, error: "ไม่พบชื่อเซลส์" };
  const realPin = String(row[3] || "").trim();
  if (realPin && realPin !== String(pin || "").trim()) {
    return { success: false, error: "PIN ไม่ถูกต้อง" };
  }
  const sc = getScopeReps(row[1]);
  return { success: true, rep: {
    id: row[0], name: row[1], route: String(row[2]),
    role: sc.raw || sc.role, routes: sc.routes, teamSize: sc.reps.length,
  }};
}

// ============================================================
// บทบาทและขอบเขตการมองเห็น
//   เซลส์      → เห็นเฉพาะงานของตัวเอง
//   หัวหน้าสาย → เห็นทุกคนในสายที่ดูแล (ใส่หลายสายได้ คั่นด้วย , เช่น "2,3")
//   ผู้จัดการ  → เห็นทั้งโรงน้ำ
// ============================================================

const ROLE_REP  = "เซลส์";
const ROLE_SUP  = "หัวหน้าสาย";
const ROLE_MGR  = "ผู้จัดการ";

function splitRoutes(v) {
  return String(v || "").split(/[,/]/).map(s => s.trim()).filter(String);
}

function getScopeReps(repName) {
  const rows = getAllRows("SalesReps").filter(r => r[1]);
  const me = rows.find(r => String(r[1]).trim() === String(repName).trim());
  if (!me) return { role: ROLE_REP, reps: [String(repName)], routes: [], all: false };

  const role = String(me[5] || ROLE_REP).trim() || ROLE_REP;
  const myRoutes = splitRoutes(me[2]);

  if (role === ROLE_MGR) {
    return { role, raw: role, reps: rows.map(r => String(r[1]).trim()), routes: [], all: true };
  }
  if (role === ROLE_SUP) {
    const reps = rows
      .filter(r => splitRoutes(r[2]).some(rt => myRoutes.indexOf(rt) !== -1))
      .map(r => String(r[1]).trim());
    if (reps.indexOf(String(me[1]).trim()) === -1) reps.push(String(me[1]).trim());
    return { role, raw: role, reps, routes: myRoutes, all: false };
  }
  // บทบาทอื่นๆ เช่น "เซลส์เร่" — สิทธิ์ข้อมูลเท่าเซลส์ปกติ แต่ส่ง raw ให้หน้าแอปจัดเมนูตามบทบาทได้
  return { role: ROLE_REP, raw: role, reps: [String(me[1]).trim()], routes: myRoutes, all: false };
}

// scope: "me" | "team" | "all" → คืน array ชื่อเซลส์ที่ดูได้ (null = ทุกคน)
function resolveScope(repName, scope) {
  const sc = getScopeReps(repName);
  if (scope === "all" && sc.role === ROLE_MGR) return { reps: null, sc };
  if (scope === "team" && sc.role !== ROLE_REP) return { reps: sc.reps, sc };
  return { reps: [String(repName).trim()], sc };
}

function inScope(repsAllowed, repName) {
  return !repsAllowed || repsAllowed.indexOf(String(repName).trim()) !== -1;
}

// ============================================================
// API: ยอดขายสะสมรายเดือน (ตามขอบเขตของบทบาท)
// ============================================================

function getSalesSummary(repName, month, scope) {
  const m = month || monthStr();
  const { reps, sc } = resolveScope(repName, scope);

  const repRoute = {};
  getAllRows("SalesReps").filter(r => r[1]).forEach(r => {
    repRoute[String(r[1]).trim()] = splitRoutes(r[2])[0] || "-";
  });

  const units = {};         // หน่วย → จำนวน (โหล / แพ็ค)
  const byRep = {};         // ชื่อเซลส์ → { total, units, orders }
  const byRoute = {};       // สาย → total
  const byProduct = {};     // สินค้า → { qty, unit, total }
  const orderIds = new Set();
  const customers = new Set();
  let total = 0;

  const addRow = (rep, cust, product, qty, unit, amount, orderId) => {
    unit = "แพ็ค"; // โหล = แพ็ค (12 ขวด) — รวมเป็นหน่วยเดียวตามที่ทีมใช้จริง
    total += amount;
    units[unit] = (units[unit] || 0) + qty;
    if (!byRep[rep]) byRep[rep] = { rep, total: 0, units: {}, orders: new Set() };
    byRep[rep].total += amount;
    byRep[rep].units[unit] = (byRep[rep].units[unit] || 0) + qty;
    byRep[rep].orders.add(orderId);
    const rt = repRoute[rep] || "-";
    byRoute[rt] = (byRoute[rt] || 0) + amount;
    if (product) {
      if (!byProduct[product]) byProduct[product] = { name: product, qty: 0, unit: unit, total: 0 };
      byProduct[product].qty += qty;
      byProduct[product].total += amount;
    }
    orderIds.add(orderId);
    if (cust) customers.add(String(cust).trim());
  };

  getAllRows("Orders_Sales").forEach(r => {
    if (!r[0] || fmtMonth(r[3]) !== m || String(r[14]) === "Cancelled") return;
    if (!inScope(reps, r[4])) return;
    addRow(String(r[4]).trim(), r[5], r[8], Number(r[9]) || 0,
           String(r[10] || "แพ็ค"), Number(r[12]) || 0, String(r[0]));
  });

  getAllRows("Orders_OEM").forEach(r => {
    if (!r[0] || fmtMonth(r[3]) !== m || String(r[15]) === "Cancelled") return;
    if (!inScope(reps, r[4])) return;
    addRow(String(r[4]).trim(), r[5], "OEM " + (r[7] || ""), Number(r[9]) || 0,
           String(r[10] || "โหล"), Number(r[12]) || 0, String(r[0]));
  });

  let visits = 0, newCust = 0;
  getAllRows("Visits").forEach(r => {
    if (fmtMonth(r[3]) === m && inScope(reps, r[4])) visits++;
  });
  getAllRows("Customers_Sales").forEach(r => {
    if (fmtMonth(r[12]) === m && inScope(reps, r[7])) newCust++;
  });

  const repList = Object.keys(byRep).map(k => ({
    rep: k, total: byRep[k].total, units: byRep[k].units,
    orders: byRep[k].orders.size, route: repRoute[k] || "-",
  })).sort((a, b) => b.total - a.total);

  const productList = Object.keys(byProduct)
    .map(k => byProduct[k]).sort((a, b) => b.total - a.total).slice(0, 8);

  const routeList = Object.keys(byRoute)
    .map(k => ({ route: k, total: byRoute[k] })).sort((a, b) => b.total - a.total);

  return {
    month: m, role: sc.role, scope: scope || "me",
    total, units, orders: orderIds.size, customers: customers.size,
    visits, newCust, byRep: repList, byRoute: routeList, byProduct: productList,
  };
}

// ============================================================
// API: แปลงลิงก์ Google Maps → พิกัด (รองรับ short link maps.app.goo.gl)
// ============================================================

function resolveMapsLink(url) {
  const parse = s => {
    const pats = [
      /@(-?\d+\.\d{4,}),(-?\d+\.\d{4,})/,        // /maps/@lat,lng,17z
      /!3d(-?\d+\.\d{4,})!4d(-?\d+\.\d{4,})/,    // data=!3dlat!4dlng (แม่นสุด — พิกัดหมุด)
      /[?&]q=(-?\d+\.\d{4,}),\s*(-?\d+\.\d{4,})/,
      /[?&]ll=(-?\d+\.\d{4,}),\s*(-?\d+\.\d{4,})/,
      /(-?\d{1,2}\.\d{4,}),\s*(-?\d{1,3}\.\d{4,})/, // พิกัดดิบที่ก๊อปมา
    ];
    for (let i = 0; i < pats.length; i++) {
      const mm = String(s).match(pats[i]);
      if (mm) return { lat: Number(mm[1]), lng: Number(mm[2]) };
    }
    return null;
  };

  let target = String(url || "").trim();
  if (!target) return { success: false, error: "ยังไม่ได้วางลิงก์" };

  // ลิงก์ยาวอาจมีพิกัดอยู่แล้ว
  let hit = parse(target);
  if (hit) return { success: true, lat: hit.lat, lng: hit.lng, mapsUrl: target };

  // ลิงก์ย่อ → ตาม redirect (สูงสุด 5 ชั้น)
  try {
    for (let i = 0; i < 5; i++) {
      const res = UrlFetchApp.fetch(target, {
        followRedirects: false, muteHttpExceptions: true,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const h = res.getHeaders();
      const loc = h["Location"] || h["location"] || "";
      if (loc) {
        target = loc;
        hit = parse(target);
        if (hit) return { success: true, lat: hit.lat, lng: hit.lng, mapsUrl: String(url).trim() };
        continue;
      }
      hit = parse(res.getContentText().slice(0, 200000));
      if (hit) return { success: true, lat: hit.lat, lng: hit.lng, mapsUrl: String(url).trim() };
      break;
    }
  } catch (e) {
    return { success: false, error: "เปิดลิงก์ไม่ได้: " + e.message };
  }
  return { success: false, error: "อ่านพิกัดจากลิงก์นี้ไม่ได้ — ลองใช้เมนู แชร์ > คัดลอกลิงก์ ใน Google Maps" };
}

// ============================================================
// API: สถิติวันนี้ของเซลส์ (แสดงหน้า Home)
// ============================================================

function getMyStats(repName) {
  const today = todayStr();

  const visits = getAllRows("Visits")
    .filter(r => String(r[4]) === String(repName) && fmtDate(r[2]) === today);

  const orderRows = getAllRows("Orders_Sales")
    .filter(r => String(r[4]) === String(repName) && fmtDate(r[2]) === today &&
                 String(r[14]) !== "Cancelled");
  const oemRows = getAllRows("Orders_OEM")
    .filter(r => String(r[4]) === String(repName) && fmtDate(r[2]) === today &&
                 String(r[15]) !== "Cancelled");

  const orderIds = new Set(orderRows.map(r => r[0]).concat(oemRows.map(r => r[0])));
  const sales = orderRows.reduce((s, r) => s + Number(r[12] || 0), 0) +
                oemRows.reduce((s, r) => s + Number(r[12] || 0), 0);

  return { visits: visits.length, orders: orderIds.size, sales };
}

// ============================================================
// API: รายการของฉันวันนี้ (สำหรับหน้าแก้ไข/ยกเลิก)
// ============================================================

function getMyToday(repName) {
  const today = todayStr();

  const visits = getAllRows("Visits")
    .filter(r => String(r[4]) === String(repName) && fmtDate(r[2]) === today)
    .map(r => ({
      visitId: r[0], customerId: r[5], customerName: r[6], outcome: r[7],
      interest: r[8], note: r[9], followUp: r[10] ? fmtDate(r[10]) : "",
      probability: r[11] || "", photoUrl: r[12] || "",
    }));

  const orderMap = new Map();
  getAllRows("Orders_Sales")
    .filter(r => String(r[4]) === String(repName) && fmtDate(r[2]) === today)
    .forEach(r => {
      const id = String(r[0]);
      if (!orderMap.has(id)) {
        orderMap.set(id, { orderId: id, customerName: r[6], total: 0,
                           payment: r[13], status: r[14], type: "brand", items: [] });
      }
      const o = orderMap.get(id);
      o.total += Number(r[12] || 0);
      o.items.push({ name: r[8], qty: Number(r[9]) || 0, unit: r[10] || "", unitPrice: Number(r[11]) || 0 });
    });

  getAllRows("Orders_OEM")
    .filter(r => String(r[4]) === String(repName) && fmtDate(r[2]) === today)
    .forEach(r => {
      orderMap.set(String(r[0]), {
        orderId: String(r[0]), customerName: r[6],
        total: Number(r[12] || 0), payment: r[13], status: r[15], type: "oem",
        due: r[14] ? fmtDate(r[14]) : "",
        items: [{ name: (r[7] || "") + " " + (r[8] || ""), qty: Number(r[9]) || 0,
                  unit: r[10] || "", unitPrice: Number(r[11]) || 0 }],
      });
    });

  return { visits: visits.reverse(), orders: Array.from(orderMap.values()).reverse() };
}

// ============================================================
// API: นัดติดตามที่ถึงกำหนด (แจ้งเตือนในแอป)
// ใช้บันทึกเข้าพบ "ล่าสุด" ของลูกค้าแต่ละราย — ถ้าเข้าพบครั้งใหม่แล้ว
// นัดเก่าถือว่าจบไป ใช้นัดของครั้งล่าสุดแทน
// ============================================================

function getFollowUps(repName) {
  const latest = new Map(); // customerId → แถวเข้าพบล่าสุด (แถวหลังทับแถวก่อน)
  getAllRows("Visits").forEach(r => {
    if (String(r[4]) !== String(repName) || !r[5]) return;
    latest.set(String(r[5]).trim(), r);
  });
  const items = [];
  latest.forEach((r, cid) => {
    if (!r[10]) return; // ไม่มีนัด
    items.push({
      customerId: cid, customerName: r[6], followUp: fmtDate(r[10]),
      outcome: r[7], note: r[9], probability: r[11] || "",
    });
  });
  items.sort((a, b) => String(a.followUp).localeCompare(String(b.followUp)));
  return { today: todayStr(), items };
}

// ============================================================
// API: ปฏิทิน — รวม 4 ชนิด: นัดติดตาม, กำหนดส่ง OEM, ประวัติเข้าพบ, นัดเอง
// month รูปแบบ "yyyy-MM" / overdue = นัดติดตามที่เลยกำหนด (ทุกเดือน)
// ============================================================

function getCalendar(repName, month) {
  const today = todayStr();
  const events = [];
  const overdue = [];

  const visitRows = getAllRows("Visits")
    .filter(r => String(r[4]) === String(repName) && r[5]);

  // 1) นัดติดตาม — จากบันทึกเข้าพบล่าสุดของลูกค้าแต่ละราย
  const latest = new Map();
  visitRows.forEach(r => latest.set(String(r[5]).trim(), r));
  latest.forEach((r, cid) => {
    if (!r[10]) return;
    const fu = fmtDate(r[10]);
    const ev = { type: "fu", date: fu, customerId: cid, customerName: r[6],
                 outcome: r[7], probability: r[11] || "", note: r[9] || "" };
    if (fu < today) overdue.push(ev);
    if (fu.slice(0, 7) === month) events.push(ev);
  });

  // 2) ประวัติเข้าพบในเดือนที่ดู
  visitRows.forEach(r => {
    const d = fmtDate(r[2]);
    if (d.slice(0, 7) === month) {
      events.push({ type: "visit", date: d, customerId: String(r[5]).trim(),
                    customerName: r[6], outcome: r[7] });
    }
  });

  // 3) กำหนดส่งงาน OEM (ไม่นับที่ยกเลิก)
  getAllRows("Orders_OEM").forEach(r => {
    if (String(r[4]) !== String(repName) || !r[14] || String(r[15]) === "Cancelled") return;
    const d = fmtDate(r[14]);
    if (d.slice(0, 7) === month) {
      events.push({ type: "oem", date: d, orderId: String(r[0]), customerName: r[6],
                    clientBrand: r[7] || "", total: Number(r[12]) || 0, status: r[15] });
    }
  });

  // 4) นัดเอง (เฉพาะ Active)
  getAllRows("Appointments").forEach(r => {
    if (String(r[4]) !== String(repName) || String(r[9]) !== "Active") return;
    const d = fmtDate(r[2]);
    if (d.slice(0, 7) === month) {
      events.push({ type: "appt", date: d, apptId: r[0], customerId: r[5] || "",
                    customerName: r[6] || "", title: r[7] || "", note: r[8] || "" });
    }
  });

  // 5) นัดส่งจากโรงงาน (ชีต DeliverySchedule ของแอปโรงงาน) — เห็นทุกคน
  //    Schedule_ID(0) Timestamp(1) วันที่ส่ง(2) ลูกค้า(3) รายละเอียด(4) Order_ID(5) สถานะ(6) ผู้บันทึก(7)
  getAllRows("DeliverySchedule").forEach(r => {
    if (!r[0] || String(r[6]) === "ยกเลิก") return;
    const d = fmtDate(r[2]);
    if (d.slice(0, 7) === month) {
      events.push({ type: "fdeliv", date: d, orderId: String(r[5] || ""),
                    customerName: String(r[3] || ""), detail: String(r[4] || ""),
                    status: String(r[6] || "นัดไว้") });
    }
  });

  // 6) วันสกรีนขวด OEM ของโรงงาน (ชีต Orders คอลัมน์ N) — จัดกลุ่มต่อออเดอร์
  const scr = new Map();
  getAllRows("Orders").forEach(r => {
    const d = fmtDate(r[13]);
    if (!d || d.slice(0, 7) !== month) return;
    const id = String(r[0]).trim();
    if (!scr.has(id)) {
      scr.set(id, { type: "screen", date: d, orderId: id,
                    customerName: String(r[2] || ""), status: String(r[7] || "") });
    }
  });
  scr.forEach(ev => events.push(ev));

  // 7) แผนผลิตของโรงงาน (ชีต ProductionPlans) — เซลส์เห็นว่าวันไหนของจะออก
  //    Plan_ID(0) Timestamp(1) วันที่ผลิต(2) Product_ID(3) สินค้า(4) เป้า(5) ... สถานะ(10)
  getAllRows("ProductionPlans").forEach(r => {
    if (!r[0] || String(r[10] || "วางแผน") !== "วางแผน") return;
    const d = fmtDate(r[2]);
    if (d.slice(0, 7) === month) {
      events.push({ type: "fplan", date: d, product: String(r[4] || ""),
                    target: Number(r[5]) || 0 });
    }
  });

  return { month, today, events, overdue };
}

// ============================================================
// API: รถเร่ (Van Sales)
// วงจร: เซลส์ขอขึ้นของ/เติม/คืน (สถานะ "รอเช็ค") → คนนับสต๊อกยืนยันในแอปโรงงาน
// (ตัด/คืนสต๊อกคลังตอนยืนยัน) → ขายหน้ารถบันทึกเข้า Orders_Sales ไม่ตัดสต๊อกซ้ำ
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

function getVanState(repName) {
  ensureVanSheet();
  const me = String(repName).trim();
  const stock = {};              // productId → { name, qty บนรถ }
  const pendingMap = new Map();  // คำขอที่รอคนนับสต๊อกยืนยัน

  getAllRows("VanLoads").forEach(r => {
    if (!r[0] || String(r[4]).trim() !== me) return;
    const type = String(r[5]), status = String(r[9]);
    const pid = String(r[6]), qty = Number(r[8]) || 0;
    if (status === "ยืนยันแล้ว") {
      const sign = type === "คืนของ" ? -1 : 1;
      (stock[pid] = stock[pid] || { name: r[7], qty: 0 }).qty += sign * qty;
      stock[pid].name = r[7];
    } else if (status === "รอเช็ค") {
      const id = String(r[0]);
      if (!pendingMap.has(id)) {
        pendingMap.set(id, { loadId: id, type, date: fmtDate(r[2]), note: r[12] || "", items: [] });
      }
      pendingMap.get(id).items.push({ productId: pid, name: r[7], qty });
    }
  });

  // หักยอดที่ขายหน้ารถไปแล้ว (ออเดอร์ VS... — ผูกลูกค้าจริงหรือขายเร่ทั่วไปก็นับ)
  let todayPacks = 0, todayCash = 0;
  const today = todayStr();
  getAllRows("Orders_Sales").forEach(r => {
    if (String(r[0]).indexOf("VS") !== 0 || String(r[4]).trim() !== me) return;
    if (String(r[14]) === "Cancelled") return;
    const pid = String(r[7]), qty = Number(r[9]) || 0;
    (stock[pid] = stock[pid] || { name: r[8], qty: 0 }).qty -= qty;
    if (fmtDate(r[2]) === today) { todayPacks += qty; todayCash += Number(r[12]) || 0; }
  });

  const vanStock = Object.keys(stock)
    .map(pid => ({ productId: pid, name: stock[pid].name, qty: stock[pid].qty }))
    .filter(x => x.qty !== 0);

  return { vanStock, pending: Array.from(pendingMap.values()).reverse(), todayPacks, todayCash };
}

function addVanLoad(a) {
  const sheet = ensureVanSheet();
  const now = new Date();
  const loadId = "VL" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMddHHmmss");
  (a.items || []).forEach(it => {
    sheet.appendRow([
      loadId, now, todayStr(), monthStr(), a.rep || "", a.type || "ขึ้นของ",
      it.productId || "", it.productName || "", Number(it.qty) || 0,
      "รอเช็ค", "", "", a.note || "",
    ]);
  });
  return { success: true, loadId };
}

function cancelVanLoad(loadId) {
  const sheet = getSheet("VanLoads");
  const data  = sheet.getDataRange().getValues();
  let n = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(loadId).trim()) {
      if (String(data[i][9]) !== "รอเช็ค") {
        return { success: false, error: "รายการนี้ถูกเช็คไปแล้ว ยกเลิกไม่ได้" };
      }
      sheet.getRange(i + 1, 10).setValue("ยกเลิก");
      n++;
    }
  }
  return n ? { success: true } : { success: false, error: "ไม่พบรายการ " + loadId };
}

// ขายหน้ารถ — เข้าระบบออเดอร์ปกติ (KPI/ยอดสะสมนับให้เอง) แต่ไม่ตัดสต๊อกคลังซ้ำ
// ผูกลูกค้าจริงได้ (ร้านประจำริมทาง) — ไม่ผูกก็ลงเป็น "ขายเร่หน้ารถ"
function addVanSale(o) {
  const now     = new Date();
  const dateStr = Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd");
  const randStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderId = "VS" + dateStr + "-" + randStr;
  const sheet   = getSheet("Orders_Sales");
  let grandTotal = 0;
  (o.items || []).forEach(item => {
    const rowTotal = Number(item.qty) * Number(item.unitPrice);
    grandTotal += rowTotal;
    sheet.appendRow([
      orderId, now, todayStr(), monthStr(),
      o.rep || "", o.customerId || "VAN", o.customerName || "ขายเร่หน้ารถ",
      item.productId || "", item.productName || "",
      Number(item.qty), "แพ็ค", Number(item.unitPrice), rowTotal,
      o.payment || "เงินสด", "เก็บเงินแล้ว", "ขายหน้ารถ (ของตัดจากรถ)",
    ]);
  });
  return { success: true, orderId, grandTotal };
}

// ============================================================
// API: ปิดยอดรถเร่รายวัน — สรุปขึ้น/ขาย/เงิน/คืน/ค้างบนรถ ให้ตรวจพร้อมกัน
// ============================================================

function getVanDaySummary(repName) {
  const me = String(repName).trim();
  const today = todayStr();
  const loads = {};        // ประเภท → แพ็ค (เฉพาะยืนยันแล้ว วันนี้)
  let pendingPacks = 0;    // ค้างรอเช็ค
  const byProduct = {};    // ชื่อสินค้า → { loaded, sold, returned }

  getAllRows("VanLoads").forEach(r => {
    if (!r[0] || String(r[4]).trim() !== me || fmtDate(r[2]) !== today) return;
    const type = String(r[5]), qty = Number(r[8]) || 0, name = String(r[7]);
    const status = String(r[9]);
    if (status === "ยืนยันแล้ว") {
      loads[type] = (loads[type] || 0) + qty;
      const p = byProduct[name] = byProduct[name] || { loaded: 0, sold: 0, returned: 0 };
      if (type === "คืนของ") p.returned += qty; else p.loaded += qty;
    } else if (status === "รอเช็ค") {
      pendingPacks += qty;
    }
  });

  let soldPacks = 0, totalCash = 0;
  const cashBy = {};
  getAllRows("Orders_Sales").forEach(r => {
    if (String(r[0]).indexOf("VS") !== 0 || String(r[4]).trim() !== me) return;
    if (fmtDate(r[2]) !== today || String(r[14]) === "Cancelled") return;
    const qty = Number(r[9]) || 0, amt = Number(r[12]) || 0;
    const pay = String(r[13] || "เงินสด");
    soldPacks += qty;
    totalCash += amt;
    cashBy[pay] = (cashBy[pay] || 0) + amt;
    const name = String(r[8]);
    const p = byProduct[name] = byProduct[name] || { loaded: 0, sold: 0, returned: 0 };
    p.sold += qty;
  });

  const van = getVanState(repName);
  const onTruck = (van.vanStock || []).reduce((s, x) => s + Number(x.qty), 0);

  return { date: today, loads, pendingPacks, soldPacks, totalCash, cashBy, byProduct, onTruck };
}

// ============================================================
// API: วันลา — บุ๊ค/ยกเลิก/ดูรายเดือน
// ============================================================

// Leaves: A Leave_ID, B Timestamp, C วันที่ลา, D เดือน, E เซลส์, F ประเภท, G หมายเหตุ, H สถานะ
// เซลส์เห็นแค่วันลาตัวเอง / หัวหน้าสายเห็นวันลาทุกคนในสาย / ผู้จัดการเห็นทั้งโรงน้ำ
function getLeaves(repName, month) {
  const m = month || monthStr();
  const rows = getAllRows("Leaves")
    .filter(r => r[0] && String(r[7] || "Active") === "Active")
    .map(r => ({ leaveId: r[0], date: fmtDate(r[2]), rep: String(r[4]).trim(),
                 type: r[5] || "ลากิจ", note: r[6] || "" }))
    .filter(l => l.date.slice(0, 7) === m);

  const me = String(repName).trim();
  const leaves = rows.filter(l => l.rep === me);

  let team = [];
  const sc = getScopeReps(repName);
  if (sc.role !== ROLE_REP) {
    team = rows
      .filter(l => l.rep !== me && inScope(sc.all ? null : sc.reps, l.rep))
      .map(l => ({ date: l.date, rep: l.rep, type: l.type }));
  }

  return { month: m, today: todayStr(), leaves, team, role: sc.role };
}

function addLeave(a) {
  const date = fmtDate(a.date || todayStr());
  // กันบุ๊คซ้ำวันเดิม
  const dup = getAllRows("Leaves").some(r =>
    String(r[4]) === String(a.rep) && fmtDate(r[2]) === date && String(r[7] || "Active") === "Active");
  if (dup) return { success: false, error: "วันนี้บุ๊คลาไว้แล้ว" };
  const now = new Date();
  const leaveId = "LV" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMddHHmmss");
  getSheet("Leaves").appendRow([
    leaveId, now, date, String(date).slice(0, 7),
    a.rep || "", a.type || "ลากิจ", a.note || "", "Active",
  ]);
  return { success: true, leaveId };
}

function cancelLeave(leaveId) {
  const sheet = getSheet("Leaves");
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(leaveId).trim()) {
      sheet.getRange(i + 1, 8).setValue("Cancelled"); // col H = สถานะ
      return { success: true };
    }
  }
  return { success: false, error: "ไม่พบรายการลา" };
}

function addAppointment(a) {
  const now = new Date();
  const apptId = "AP" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMddHHmmss");
  const date = a.date || todayStr();
  getSheet("Appointments").appendRow([
    apptId, now, date, String(date).slice(0, 7),
    a.rep || "", a.customerId || "", a.customerName || "",
    a.title || "", a.note || "", "Active",
  ]);
  return { success: true, apptId };
}

function updateAppointment(apptId, status) {
  const sheet = getSheet("Appointments");
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(apptId).trim()) {
      sheet.getRange(i + 1, 10).setValue(status); // col J = สถานะ
      return { success: true };
    }
  }
  return { success: false, error: "ไม่พบนัด " + apptId };
}

// ============================================================
// API: รวมออเดอร์ทั้งหมด (ล่าสุด 100 รายการ) + แก้ไขสถานะ/ชำระเงิน/หมายเหตุ
// ============================================================

function getMyOrders(repName, allReps) {
  // ขอบเขตตามบทบาท: เซลส์=ตัวเอง / หัวหน้าสาย=ทั้งสาย / ผู้จัดการ=ทุกคน
  const { reps } = resolveScope(repName, allReps ? "all" : "me");
  const repsView = allReps ? (reps || null) : [String(repName)];
  // หัวหน้าสายกด "ทุกคน" แต่ไม่ใช่ผู้จัดการ → เห็นแค่สายตัวเอง
  const scoped = allReps && reps === null ? null : (allReps ? getScopeReps(repName).reps : repsView);

  // พิกัดลูกค้า (ปุ่มนำทางในหน้าออเดอร์)
  const custLoc = {};
  getAllRows("Customers_Sales").forEach(r => {
    if (r[0]) custLoc[String(r[0]).trim()] = { lat: r[14] || "", lng: r[15] || "", mapsUrl: r[21] || "" };
  });
  const loc = cid => custLoc[String(cid || "").trim()] || { lat: "", lng: "", mapsUrl: "" };

  const orderMap = new Map();
  getAllRows("Orders_Sales").forEach(r => {
    if (!r[0]) return;
    if (!inScope(scoped, r[4])) return;
    const id = String(r[0]);
    if (!orderMap.has(id)) {
      const l = loc(r[5]);
      orderMap.set(id, { orderId: id, date: fmtDate(r[2]), rep: r[4], customerName: r[6],
        customerId: String(r[5] || ""), lat: l.lat, lng: l.lng, mapsUrl: l.mapsUrl,
        total: 0, payment: r[13], status: r[14], type: "brand", note: r[15] || "", items: [] });
    }
    const o = orderMap.get(id);
    o.total += Number(r[12] || 0);
    o.items.push({ name: r[8], qty: Number(r[9]) || 0, unit: r[10] || "", unitPrice: Number(r[11]) || 0 });
  });
  getAllRows("Orders_OEM").forEach(r => {
    if (!r[0]) return;
    if (!inScope(scoped, r[4])) return;
    const l = loc(r[5]);
    orderMap.set(String(r[0]), { orderId: String(r[0]), date: fmtDate(r[2]), rep: r[4],
      customerName: r[6], customerId: String(r[5] || ""), lat: l.lat, lng: l.lng, mapsUrl: l.mapsUrl,
      total: Number(r[12]) || 0, payment: r[13], status: r[15], type: "oem",
      note: r[16] || "", due: r[14] ? fmtDate(r[14]) : "",
      items: [{ name: (r[7] || "") + " " + (r[8] || ""), qty: Number(r[9]) || 0,
                unit: r[10] || "", unitPrice: Number(r[11]) || 0 }] });
  });
  return Array.from(orderMap.values()).reverse().slice(0, 100);
}

function updateOrderMeta(orderId, meta) {
  const isOem = String(orderId).indexOf("OEM") === 0;
  const sheet = getSheet(isOem ? "Orders_OEM" : "Orders_Sales");
  const data  = sheet.getDataRange().getValues();
  const payCol    = 14;               // N = การชำระเงิน (ทั้งสองชีต)
  const statusCol = isOem ? 16 : 15;  // OEM: P / แบรนด์เรา: O
  const noteCol   = isOem ? 17 : 16;  // OEM: Q / แบรนด์เรา: P
  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(orderId).trim()) {
      if (meta.status)             sheet.getRange(i + 1, statusCol).setValue(meta.status);
      if (meta.payment)            sheet.getRange(i + 1, payCol).setValue(meta.payment);
      if (meta.note !== undefined) sheet.getRange(i + 1, noteCol).setValue(meta.note);
      updated++;
    }
  }
  return updated ? { success: true } : { success: false, error: "ไม่พบออเดอร์ " + orderId };
}

// ============================================================
// v11: ย้ายลีด + จัดรอบส่งตามความจุรถ (หัวหน้าสาย/ผู้จัดการ)
// ============================================================

function ensureV11Sheets() {
  if (!getSheet("LeadTransfers")) {
    const sheet = ss().insertSheet("LeadTransfers");
    const headers = ["Transfer_ID", "Timestamp", "วันที่", "Order_ID",
                     "จากเซลส์", "ไปเซลส์", "โดย", "เหตุผล"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#E0F2FE");
    sheet.setFrozenRows(1);
  }
  if (!getSheet("DeliveryRounds")) {
    const sheet = ss().insertSheet("DeliveryRounds");
    const headers = ["Round_ID", "Timestamp", "วันที่ส่ง", "สาย", "ความจุ(แพ็ค)",
                     "รวมแพ็ค", "จำนวนออเดอร์", "สถานะ", "ผู้จัด", "หมายเหตุ"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#E0F2FE");
    sheet.setFrozenRows(1);
  }
  // Orders_Sales คอลัมน์ Q = Round_ID (ป้ายรอบส่งของออเดอร์)
  const os = getSheet("Orders_Sales");
  if (os && String(os.getRange("Q1").getValue()) !== "Round_ID") {
    os.getRange("Q1").setValue("Round_ID").setFontWeight("bold").setBackground("#E0F2FE");
  }
}

// ย้ายลีด: เปลี่ยนเจ้าของออเดอร์ (มีผลต่อยอดสะสม/ค่าคอม จึงลง log ทุกครั้ง)
function reassignOrder(orderId, newRep, byName, reason) {
  const sc = getScopeReps(byName);
  if (sc.role === ROLE_REP) return { success: false, error: "เฉพาะหัวหน้าสาย/ผู้จัดการเท่านั้น" };
  ensureV11Sheets();

  const isOem = String(orderId).indexOf("OEM") === 0;
  const sheet = getSheet(isOem ? "Orders_OEM" : "Orders_Sales");
  const data  = sheet.getDataRange().getValues();
  const nu    = String(newRep).trim();

  let oldRep = "";
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(orderId).trim()) {
      if (!oldRep) oldRep = String(data[i][4]).trim();
      rows.push(i);
    }
  }
  if (!rows.length) return { success: false, error: "ไม่พบออเดอร์ " + orderId };
  if (oldRep === nu) return { success: false, error: "ออเดอร์นี้เป็นของ " + nu + " อยู่แล้ว" };
  // หัวหน้าสายย้ายได้เฉพาะภายในสายตัวเอง — ผู้จัดการย้ายได้ทุกคน
  if (!sc.all && (sc.reps.indexOf(oldRep) === -1 || sc.reps.indexOf(nu) === -1)) {
    return { success: false, error: "หัวหน้าสายย้ายลีดได้เฉพาะเซลส์ในสายตัวเองนะครับ" };
  }
  rows.forEach(i => sheet.getRange(i + 1, 5).setValue(nu));

  const now = new Date();
  getSheet("LeadTransfers").appendRow([
    "LT" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMddHHmmss"), now, todayStr(),
    String(orderId), oldRep, nu, String(byName || ""), reason || "",
  ]);
  return { success: true, from: oldRep, to: nu };
}

// ข้อมูลหน้าจัดรอบส่ง: ออเดอร์รอจัด + รอบที่มีอยู่ + สต๊อก (ไว้เช็คผลิตทัน)
function getRoundPlanning(repName) {
  const sc = getScopeReps(repName);
  if (sc.role === ROLE_REP) return { success: false, error: "เฉพาะหัวหน้าสาย/ผู้จัดการเท่านั้น" };
  ensureV11Sheets();
  const scoped = sc.all ? null : sc.reps;

  const custRoute = {};
  getAllRows("Customers_Sales").forEach(r => {
    if (r[0]) custRoute[String(r[0]).trim()] = String(r[8] || "").trim();
  });

  // ออเดอร์แบรนด์เราที่ต้องจัดส่ง (ไม่รวมขายหน้ารถ VS — ของถึงมือลูกค้าแล้ว)
  const orderMap = new Map();
  getAllRows("Orders_Sales").forEach(r => {
    if (!r[0]) return;
    const id = String(r[0]).trim();
    if (id.indexOf("VS") === 0) return;
    const st = String(r[14]);
    if (st === "Cancelled" || st === "เก็บเงินแล้ว") return;
    if (!inScope(scoped, r[4])) return;
    const roundId = String(r[16] || "").trim();
    if (st !== "Pending" && !roundId) return; // กำลังส่ง/ส่งแล้วนอกรอบ = จัดการไปแล้ว
    if (!orderMap.has(id)) {
      orderMap.set(id, { orderId: id, date: fmtDate(r[2]), rep: String(r[4]).trim(),
        customerId: String(r[5] || "").trim(), customerName: r[6],
        route: custRoute[String(r[5] || "").trim()] || "-",
        status: st, packs: 0, total: 0, roundId, products: {} });
    }
    const o = orderMap.get(id);
    o.packs += Number(r[9]) || 0;
    o.total += Number(r[12]) || 0;
    const pid = String(r[7] || "").trim();
    if (pid) o.products[pid] = (o.products[pid] || 0) + (Number(r[9]) || 0);
  });

  const pending = [];
  const tagged  = {};
  orderMap.forEach(o => {
    if (o.roundId) (tagged[o.roundId] = tagged[o.roundId] || []).push(o);
    else pending.push(o);
  });
  pending.sort((a, b) => String(a.route).localeCompare(String(b.route), "th"));

  const rounds = getAllRows("DeliveryRounds")
    .filter(r => r[0] && String(r[7]) !== "ยกเลิก")
    .map(r => ({ roundId: String(r[0]).trim(), date: fmtDate(r[2]), routes: String(r[3] || ""),
                 capacity: Number(r[4]) || 0, status: String(r[7] || "วางแผน"),
                 by: String(r[8] || ""), note: String(r[9] || ""),
                 orders: tagged[String(r[0]).trim()] || [] }))
    .reverse().slice(0, 15);

  const stock = {};
  getAllRows("Products").forEach(r => {
    const pid = String(r[0] || "").trim();
    if (pid) stock[pid] = { name: String(r[11] || (r[1] + " " + r[2])).trim(), stock: Number(r[4]) || 0 };
  });

  return { success: true, pending, rounds, stock };
}

// สร้างรอบส่ง: ป้าย Round_ID ลงออเดอร์ที่เลือก + ลงชีต DeliveryRounds
function saveRound(a) {
  const sc = getScopeReps(a.rep);
  if (sc.role === ROLE_REP) return { success: false, error: "เฉพาะหัวหน้าสาย/ผู้จัดการเท่านั้น" };
  if (!a.date) return { success: false, error: "เลือกวันที่ส่งก่อนนะครับ" };
  if (!a.orderIds || !a.orderIds.length) return { success: false, error: "ยังไม่ได้เลือกออเดอร์" };
  ensureV11Sheets();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet("Orders_Sales");
    const data  = sheet.getDataRange().getValues();
    const want  = new Set(a.orderIds.map(s => String(s).trim()));

    const custRoute = {};
    getAllRows("Customers_Sales").forEach(r => {
      if (r[0]) custRoute[String(r[0]).trim()] = String(r[8] || "").trim();
    });

    // ตรวจให้ครบก่อนค่อยเขียน: กันสองคนจัดรอบพร้อมกันแล้วออเดอร์ซ้ำ
    const rows = [];
    let packs = 0;
    const routes = new Set(), found = new Set();
    for (let i = 1; i < data.length; i++) {
      const id = String(data[i][0]).trim();
      if (!want.has(id)) continue;
      if (String(data[i][16] || "").trim()) {
        return { success: false, error: "ออเดอร์ " + id + " ถูกจัดรอบไปแล้ว — กดรีเฟรชหน้านี้ก่อนนะครับ" };
      }
      rows.push(i);
      packs += Number(data[i][9]) || 0;
      routes.add(custRoute[String(data[i][5] || "").trim()] || "-");
      found.add(id);
    }
    if (!found.size) return { success: false, error: "ไม่พบออเดอร์ที่เลือก" };

    const now = new Date();
    const roundId = "RD" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMddHHmmss");
    rows.forEach(i => sheet.getRange(i + 1, 17).setValue(roundId));
    getSheet("DeliveryRounds").appendRow([
      roundId, now, a.date, Array.from(routes).join(","), Number(a.capacity) || 0,
      packs, found.size, "วางแผน", String(a.rep || ""), a.note || "",
    ]);
    return { success: true, roundId, packs, orders: found.size };
  } finally {
    lock.releaseLock();
  }
}

// เปลี่ยนสถานะรอบ: กำลังส่ง (ออกรถ) / ส่งแล้ว (ปิดรอบ) / ยกเลิก (ปลดป้ายออเดอร์คืน)
// อัปเดตสถานะออเดอร์ในรอบให้ด้วย — ไม่แตะออเดอร์ที่เก็บเงินแล้ว/ยกเลิกไปแล้ว
function setRoundStatus(roundId, status, byName) {
  const sc = getScopeReps(byName);
  if (sc.role === ROLE_REP) return { success: false, error: "เฉพาะหัวหน้าสาย/ผู้จัดการเท่านั้น" };
  const rid = String(roundId).trim();

  const drSheet = getSheet("DeliveryRounds");
  const dr = drSheet.getDataRange().getValues();
  let hit = 0;
  for (let i = 1; i < dr.length; i++) {
    if (String(dr[i][0]).trim() === rid) { drSheet.getRange(i + 1, 8).setValue(status); hit++; }
  }
  if (!hit) return { success: false, error: "ไม่พบรอบ " + rid };

  const os = getSheet("Orders_Sales");
  const data = os.getDataRange().getValues();
  let moved = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][16] || "").trim() !== rid) continue;
    const st = String(data[i][14]);
    if (status === "ยกเลิก") {
      os.getRange(i + 1, 17).setValue("");
      moved++;
    } else if (status === "กำลังส่ง" && st === "Pending") {
      os.getRange(i + 1, 15).setValue("กำลังส่ง");
      moved++;
    } else if (status === "ส่งแล้ว" && (st === "Pending" || st === "กำลังส่ง")) {
      os.getRange(i + 1, 15).setValue("ส่งแล้ว");
      moved++;
    }
  }
  return { success: true, orders: moved };
}

// ============================================================
// API: ประวัติของลูกค้ารายตัว (หน้า "ลูกค้าของฉัน" → กดดูรายละเอียด)
// ============================================================

function getCustomerHistory(customerId) {
  const cid = String(customerId).trim();

  const visits = getAllRows("Visits")
    .filter(r => String(r[5]).trim() === cid)
    .map(r => ({
      visitId: r[0], date: fmtDate(r[2]), rep: r[4], outcome: r[7],
      interest: r[8], note: r[9], followUp: r[10] ? fmtDate(r[10]) : "",
      probability: r[11] || "", photoUrl: r[12] || "",
    }))
    .reverse().slice(0, 10);

  const orderMap = new Map();
  getAllRows("Orders_Sales")
    .filter(r => String(r[5]).trim() === cid)
    .forEach(r => {
      const id = String(r[0]);
      if (!orderMap.has(id)) orderMap.set(id, { orderId: id, date: fmtDate(r[2]), total: 0, status: r[14], oem: false });
      orderMap.get(id).total += Number(r[12] || 0);
    });
  getAllRows("Orders_OEM")
    .filter(r => String(r[5]).trim() === cid)
    .forEach(r => {
      orderMap.set(String(r[0]), { orderId: String(r[0]), date: fmtDate(r[2]),
        total: Number(r[12] || 0), status: r[15], oem: true });
    });
  const orders = Array.from(orderMap.values()).reverse().slice(0, 10);

  const quotes = getAllRows("Quotes")
    .filter(r => String(r[5]).trim() === cid)
    .map(r => ({ quoteId: r[0], date: fmtDate(r[2]), total: Number(r[8] || 0), pdfUrl: r[12] || "" }))
    .reverse().slice(0, 5);

  return { visits, orders, quotes };
}

// ============================================================
// API: บันทึกการเข้าพบ (+ อัปเดตพิกัด/ข้อมูลคู่แข่งของลูกค้า)
// ============================================================

function addVisit(v) {
  const now = new Date();
  const visitId = "V" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMddHHmmss");

  let photoUrl = "";
  if (v.photoBase64) {
    try {
      photoUrl = savePhoto(v.photoBase64, visitId + "_" + (v.customerId || "cust"));
    } catch (e) {
      photoUrl = "อัปโหลดรูปไม่สำเร็จ: " + e.message;
    }
  }

  getSheet("Visits").appendRow([
    visitId, now, todayStr(), monthStr(),
    v.rep || "", v.customerId || "", v.customerName || "",
    v.outcome || "", v.interest || "", v.note || "", v.followUp || "",
    v.probability || "", photoUrl,
  ]);

  if (v.gpsLat && v.gpsLng && v.customerId) {
    updateCustomerGps(v.customerId, v.gpsLat, v.gpsLng, v.mapsUrl || "");
  }
  if (v.compItems && v.customerId) {
    replaceCompetitors(v.customerId, v.customerName, v.compItems, v.rep);
  }

  return { success: true, visitId, photoUrl };
}

// ============================================================
// API: แก้ไขบันทึกการเข้าพบ (ค้นด้วย Visit_ID)
// ============================================================

function updateVisit(v) {
  const sheet = getSheet("Visits");
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(v.visitId).trim()) {
      sheet.getRange(i + 1, 8, 1, 4).setValues([[
        v.outcome || "", v.interest || "", v.note || "", v.followUp || "",
      ]]);
      sheet.getRange(i + 1, 12).setValue(v.probability || "");
      if (v.photoBase64) {
        try {
          sheet.getRange(i + 1, 13).setValue(savePhoto(v.photoBase64, v.visitId + "_edit"));
        } catch (e) { /* รูปเดิมคงไว้ */ }
      }
      if (v.compItems && v.customerId) replaceCompetitors(v.customerId, v.customerName, v.compItems, v.rep);
      return { success: true };
    }
  }
  return { success: false, error: "ไม่พบรายการ " + v.visitId };
}

function savePhoto(base64, name) {
  const decoded = Utilities.base64Decode(base64);
  const blob    = Utilities.newBlob(decoded, "image/jpeg", name + ".jpg");
  const iter    = DriveApp.getFoldersByName("ละกอน_SalesPhotos");
  const folder  = iter.hasNext() ? iter.next() : DriveApp.createFolder("ละกอน_SalesPhotos");
  const file    = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://drive.google.com/file/d/" + file.getId() + "/view";
}

function updateCustomerGps(customerId, lat, lng, mapsUrl) {
  const sheet = getSheet("Customers_Sales");
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(customerId).trim()) {
      sheet.getRange(i + 1, 15).setValue(lat); // col O = GPS_Lat
      sheet.getRange(i + 1, 16).setValue(lng); // col P = GPS_Lng
      if (mapsUrl) sheet.getRange(i + 1, 22).setValue(mapsUrl); // col V = Maps_URL
      return;
    }
  }
}

// ข้อมูลคู่แข่ง: เก็บชีต Competitors หลายรายการต่อลูกค้า
// วิธีซิงก์แบบง่ายและชัวร์: ลบของเดิมทั้งหมดของลูกค้ารายนั้น แล้วเขียนลิสต์ล่าสุดลงไปแทน
function replaceCompetitors(customerId, customerName, items, rep) {
  const sheet = getSheet("Competitors");
  if (!sheet) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === String(customerId).trim()) sheet.deleteRow(i + 1);
    }
    (items || []).forEach(it => {
      sheet.appendRow([
        customerId, customerName || "", it.brand || "", it.size || "",
        it.buy || "", it.sell || "", it.volume || "", it.freq || "",
        todayStr(), rep || "",
      ]);
    });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// API: ลงออเดอร์แบรนด์เรา (1 แถวต่อ 1 รายการสินค้า)
// ============================================================

function addOrder(o) {
  const now     = new Date();
  const dateStr = Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd");
  const randStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderId = "SO" + dateStr + "-" + randStr;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet("Orders_Sales");
    let grandTotal = 0;

    (o.items || []).forEach(item => {
      const rowTotal = Number(item.qty) * Number(item.unitPrice);
      grandTotal += rowTotal;
      sheet.appendRow([
        orderId, now, todayStr(), monthStr(),
        o.rep || "", o.customerId || "", o.customerName || "",
        item.productId || "", item.productName || "",
        Number(item.qty), item.unit || "แพ็ค", Number(item.unitPrice), rowTotal,
        o.payment || "เก็บหน้างาน", "Pending", o.note || "",
      ]);
    });

    if (DEDUCT_STOCK) adjustStock(o.items || [], -1);

    return { success: true, orderId, grandTotal };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// API: ลงออเดอร์ OEM / สวมฉลาก (ผลิตตามสั่ง — ไม่ตัดสต๊อกสำเร็จรูป)
// ============================================================

function addOemOrder(o) {
  const now     = new Date();
  const dateStr = Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd");
  const randStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderId = "OEM" + dateStr + "-" + randStr;

  const total = Number(o.qty) * Number(o.unitPrice);

  getSheet("Orders_OEM").appendRow([
    orderId, now, todayStr(), monthStr(),
    o.rep || "", o.customerId || "", o.customerName || "",
    o.clientBrand || "", o.size || "", Number(o.qty), o.unit || "โหล",
    Number(o.unitPrice), total,
    o.payment || "มัดจำ 50%", o.dueDate || "", "รอผลิต", o.note || "",
  ]);

  return { success: true, orderId, grandTotal: total };
}

// ============================================================
// API: ยกเลิกออเดอร์ (คืนสต๊อกถ้าเป็นออเดอร์แบรนด์เรา)
// ============================================================

function cancelOrder(orderId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const isOem = String(orderId).indexOf("OEM") === 0;
    const sheet = getSheet(isOem ? "Orders_OEM" : "Orders_Sales");
    const data  = sheet.getDataRange().getValues();
    const statusCol = isOem ? 16 : 15; // 1-based
    let cancelled = 0;
    const restoreItems = [];

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(orderId).trim()) {
        const status = String(data[i][statusCol - 1]);
        if (status === "Cancelled") return { success: false, error: "ออเดอร์นี้ถูกยกเลิกไปแล้ว" };
        sheet.getRange(i + 1, statusCol).setValue("Cancelled");
        cancelled++;
        if (!isOem) restoreItems.push({ productId: data[i][7], qty: Number(data[i][9]) });
      }
    }

    if (!cancelled) return { success: false, error: "ไม่พบออเดอร์ " + orderId };
    // ออเดอร์ขายหน้ารถ (VS...) ไม่เคยตัดสต๊อกคลัง (ตัดจากของบนรถ) → ยกเลิกแล้วไม่คืนคลัง
    // ของจะกลับไปนับเป็น "บนรถ" ให้เซลส์เร่เองอัตโนมัติ
    const isVanSale = String(orderId).indexOf("VS") === 0;
    if (!isOem && DEDUCT_STOCK && !isVanSale) adjustStock(restoreItems, +1); // คืนสต๊อก
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// ปรับสต๊อก Products.Current_Stock — direction: -1 ตัด, +1 คืน
// ติดลบได้ = ออเดอร์ขายล่วงหน้าที่ฝ่ายผลิตต้องผลิตเพิ่ม
function adjustStock(items, direction) {
  const sheet = getSheet("Products");
  const data  = sheet.getDataRange().getValues();
  items.forEach(item => {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(item.productId).trim()) {
        const current = Number(data[i][4]) || 0;
        const next = current + direction * Number(item.qty);
        sheet.getRange(i + 1, 5).setValue(next); // col 5 = Current_Stock
        data[i][4] = next;
        break;
      }
    }
  });
}

// ============================================================
// API: เพิ่ม / แก้ไขลูกค้า
// ============================================================

function addCustomer(c) {
  const sheet = getSheet("Customers_Sales");
  const nextNo = sheet.getLastRow();
  const customerId = "SC" + String(nextNo).padStart(3, "0");
  sheet.appendRow([
    customerId, c.name || "", c.type || "", c.district || "", c.address || "",
    c.contact || "", c.phone || "", c.rep || "", c.route || "",
    c.grade || "D", c.status || "Prospect", todayStr(), monthStr(), c.note || "",
    c.gpsLat || "", c.gpsLng || "", "", "", "", "", "", c.mapsUrl || "",
  ]);
  return { success: true, customerId };
}

function updateCustomer(c) {
  const sheet = getSheet("Customers_Sales");
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(c.id).trim()) {
      const row = i + 1;
      sheet.getRange(row, 2, 1, 6).setValues([[
        c.name || "", c.type || "", c.district || "", c.address || "",
        c.contact || "", c.phone || "",
      ]]);
      sheet.getRange(row, 10).setValue(c.grade || "D");
      sheet.getRange(row, 11).setValue(c.status || "Prospect");
      sheet.getRange(row, 14).setValue(c.note || "");
      if (c.gpsLat && c.gpsLng) {
        sheet.getRange(row, 15).setValue(c.gpsLat);
        sheet.getRange(row, 16).setValue(c.gpsLng);
      }
      if (c.mapsUrl) sheet.getRange(row, 22).setValue(c.mapsUrl);
      return { success: true };
    }
  }
  return { success: false, error: "ไม่พบลูกค้า " + c.id };
}

// ============================================================
// API: ออกใบเสนอราคา
// ============================================================

function addQuote(q) {
  const now     = new Date();
  const dateStr = Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd");
  const randStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  const quoteId = "QT" + dateStr + "-" + randStr;

  const total = (q.items || []).reduce((s, i) => s + Number(i.qty) * Number(i.unitPrice), 0);

  // สร้างไฟล์ PDF ทางการ เก็บใน Drive โฟลเดอร์ "ละกอน_Quotes"
  let pdfUrl = "";
  try {
    pdfUrl = createQuotePdf({
      quoteId, date: now, items: q.items || [], total,
      customerName: q.customerName || "", rep: q.rep || "",
      validDays: q.validDays || 7, note: q.note || "",
    });
  } catch (e) {
    pdfUrl = ""; // PDF พลาดก็ยังบันทึกใบเสนอราคาได้ (แอปจะ fallback เป็นข้อความ)
  }

  getSheet("Quotes").appendRow([
    quoteId, now, todayStr(), monthStr(),
    q.rep || "", q.customerId || "", q.customerName || "",
    JSON.stringify(q.items || []), total,
    q.validDays || 7, q.note || "", "ส่งแล้ว", pdfUrl,
  ]);

  return { success: true, quoteId, total, pdfUrl };
}

// ---------- แปลงจำนวนเงินเป็นตัวอักษรไทย (ใช้ท้ายตารางใบเสนอราคา) ----------
function bahtText(amount) {
  const num = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const pos = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
  function readInt(s) {
    let out = "";
    const len = s.length;
    for (let i = 0; i < len; i++) {
      const d = Number(s[i]);
      const p = len - i - 1;
      if (!d) continue;
      if (p === 1 && d === 1) out += "สิบ";
      else if (p === 1 && d === 2) out += "ยี่สิบ";
      else if (p === 0 && d === 1 && len > 1) out += "เอ็ด";
      else out += num[d] + pos[p];
    }
    return out || "ศูนย์";
  }
  const n = Math.round(Number(amount) * 100) / 100;
  let intPart = Math.floor(n);
  const satang = Math.round((n - intPart) * 100);
  let text = "";
  // รองรับเกินล้าน
  if (intPart >= 1000000) {
    text += readInt(String(Math.floor(intPart / 1000000))) + "ล้าน";
    intPart = intPart % 1000000;
    text += intPart ? readInt(String(intPart)) : "";
  } else {
    text = readInt(String(intPart));
  }
  text += "บาท";
  text += satang ? readInt(String(satang)) + "สตางค์" : "ถ้วน";
  return text;
}

// ---------- สร้าง PDF ใบเสนอราคา (HTML → PDF → Drive) ----------
function createQuotePdf(q) {
  const dateTh = Utilities.formatDate(q.date, "Asia/Bangkok", "dd/MM/yyyy");
  const validUntil = Utilities.formatDate(
    new Date(q.date.getTime() + Number(q.validDays) * 86400000), "Asia/Bangkok", "dd/MM/yyyy");

  const fmt = n => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const td = 'style="border:1px solid #444;padding:6px 8px;font-size:13px;"';

  const rowsHtml = q.items.map((it, i) =>
    "<tr>" +
    "<td " + td + ' align="center">' + (i + 1) + "</td>" +
    "<td " + td + ">" + it.productName + "</td>" +
    "<td " + td + ' align="center">' + Number(it.qty).toLocaleString("th-TH") + "</td>" +
    "<td " + td + ' align="center">' + (it.unit || "แพ็ค") + "</td>" +
    "<td " + td + ' align="right">' + fmt(it.unitPrice) + "</td>" +
    "<td " + td + ' align="right">' + fmt(it.qty * it.unitPrice) + "</td>" +
    "</tr>").join("");

  const html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="font-family:sans-serif;color:#111;margin:28px;">' +

    '<table width="100%" style="border-collapse:collapse;"><tr>' +
    '<td style="vertical-align:top;">' +
    '<div style="font-size:19px;font-weight:bold;">' + COMPANY.nameTh + "</div>" +
    '<div style="font-size:13px;">' + COMPANY.nameEn + "</div>" +
    '<div style="font-size:12px;margin-top:4px;">' + COMPANY.address + "</div>" +
    '<div style="font-size:12px;">โทร ' + COMPANY.phone + " · เลขประจำตัวผู้เสียภาษี " + COMPANY.taxId + "</div>" +
    "</td>" +
    '<td style="vertical-align:top;text-align:right;width:220px;">' +
    '<div style="border:2px solid #0284C7;border-radius:8px;padding:10px 14px;display:inline-block;text-align:left;">' +
    '<div style="font-size:17px;font-weight:bold;color:#0284C7;">ใบเสนอราคา / QUOTATION</div>' +
    '<div style="font-size:12px;margin-top:6px;">เลขที่: <b>' + q.quoteId + "</b></div>" +
    '<div style="font-size:12px;">วันที่: ' + dateTh + "</div>" +
    '<div style="font-size:12px;">ยืนราคาถึง: ' + validUntil + "</div>" +
    "</div></td></tr></table>" +

    '<div style="margin:18px 0 10px;font-size:14px;">เรียน <b>' + q.customerName + "</b><br>" +
    '<span style="font-size:12px;color:#444;">บริษัทฯ มีความยินดีเสนอราคาสินค้า ดังรายการต่อไปนี้</span></div>' +

    '<table width="100%" style="border-collapse:collapse;">' +
    '<tr style="background:#E0F2FE;">' +
    "<th " + td + ' width="36">ลำดับ</th>' +
    "<th " + td + ">รายการ</th>" +
    "<th " + td + ' width="60">จำนวน</th>' +
    "<th " + td + ' width="55">หน่วย</th>' +
    "<th " + td + ' width="85">ราคา/หน่วย</th>' +
    "<th " + td + ' width="95">จำนวนเงิน (บาท)</th>' +
    "</tr>" + rowsHtml +
    '<tr><td colspan="4" ' + td + ' style="border:1px solid #444;padding:6px 8px;font-size:12px;">(' + bahtText(q.total) + ")</td>" +
    "<td " + td + ' style="border:1px solid #444;padding:6px 8px;font-weight:bold;background:#E0F2FE;">รวมทั้งสิ้น</td>' +
    "<td " + td + ' align="right" style="border:1px solid #444;padding:6px 8px;font-weight:bold;background:#E0F2FE;">' + fmt(q.total) + "</td></tr>" +
    "</table>" +

    '<div style="font-size:12px;margin-top:14px;line-height:1.7;">' +
    "<b>เงื่อนไข:</b> ยืนราคา " + q.validDays + " วัน นับจากวันที่เสนอราคา" +
    (q.note ? "<br><b>หมายเหตุ:</b> " + q.note : "") +
    "</div>" +

    '<table width="100%" style="margin-top:44px;font-size:13px;text-align:center;"><tr>' +
    '<td width="50%">ลงชื่อ ________________________<br>(' + q.rep + ')<br>ผู้เสนอราคา<br>วันที่ ' + dateTh + "</td>" +
    '<td width="50%">ลงชื่อ ________________________<br>( ________________________ )<br>ผู้สั่งซื้อ / ผู้อนุมัติ<br>วันที่ ____/____/______</td>' +
    "</tr></table>" +

    "</body></html>";

  const blob = Utilities.newBlob(html, "text/html", q.quoteId + ".html")
    .getAs("application/pdf").setName(q.quoteId + ".pdf");
  const iter = DriveApp.getFoldersByName("ละกอน_Quotes");
  const folder = iter.hasNext() ? iter.next() : DriveApp.createFolder("ละกอน_Quotes");
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://drive.google.com/file/d/" + file.getId() + "/view";
}

// ============================================================
// setupSalesSheets — รันครั้งเดียวเพื่อสร้างชีต + ข้อมูลตั้งต้น
// ปลอดภัย: ถ้าชีตมีอยู่แล้วจะข้าม ไม่เขียนทับ
// ============================================================

function setupSalesSheets() {
  const spreadsheet = ss();

  createIfMissing(spreadsheet, "Routes",
    ["สาย", "ชื่อโซน", "อำเภอ", "เป้าเข้าพบ/วัน"],
    [
      ["1", "โซนเมือง", "เมืองลำปาง", "15-20"],
      ["2", "โซนตะวันตก", "ห้างฉัตร, เกาะคา, เสริมงาม", "10-15"],
      ["3", "โซนตะวันออก", "แม่ทะ, แม่เมาะ, แจ้ห่ม, เมืองปาน", "10-15"],
      ["4", "โซนเหนือ-ใต้", "วังเหนือ, งาว, เถิน, สบปราบ, แม่พริก", "10-15"],
      ["KA", "Key Account", "ทุกอำเภอ", "-"],
    ]);

  createIfMissing(spreadsheet, "SalesReps",
    ["Rep_ID", "ชื่อ", "สาย", "PIN", "Active", "บทบาท"],
    [
      ["R01", "เซลส์ 1 (แก้ชื่อในชีตนี้)", "1", "1111", "TRUE", "เซลส์"],
      ["R02", "เซลส์ 2", "2", "2222", "TRUE", "เซลส์"],
      ["R03", "หัวหน้าสาย 1-2", "1,2", "3333", "TRUE", "หัวหน้าสาย"],
      ["R04", "หัวหน้าสาย 3-4", "3,4", "4444", "TRUE", "หัวหน้าสาย"],
      ["R05", "ผู้จัดการ", "KA", "9999", "TRUE", "ผู้จัดการ"],
    ]);

  createIfMissing(spreadsheet, "Customers_Sales",
    ["Customer_ID", "ชื่อลูกค้า", "ประเภท", "อำเภอ", "ที่อยู่", "ผู้ติดต่อ", "โทร",
     "เซลส์", "สาย", "ศักยภาพ", "สถานะ", "วันที่เพิ่ม", "เดือน", "หมายเหตุ",
     "GPS_Lat", "GPS_Lng",
     "คู่แข่ง_แบรนด์", "คู่แข่ง_ราคาซื้อ", "คู่แข่ง_ราคาขายต่อ", "คู่แข่ง_Volume/เดือน", "คู่แข่ง_ความถี่",
     "Maps_URL"],
    [
      ["SC001", "โรงน้ำดื่มบ้านป่าเหียง", "โรงน้ำ", "เมือง", "455 ม.1 ต.บ่อแฮ้ว อ.เมือง จ.ลำปาง", "", "", "", "1", "C", "Prospect", "", "", "ขายไม่ได้เพราะเป็นรูปแบบคณะกรรมการหมู่บ้าน จะขอลองคุยในที่ประชุมก่อน", "", "", "", "", "", "", ""],
      ["SC002", "โรงน้ำดื่มบ้านบ่อแฮ้ว", "โรงน้ำ", "เมือง", "ม.2 ต.บ่อแฮ้ว อ.เมือง จ.ลำปาง", "", "084-372-3102", "", "1", "C", "ไม่สนใจ", "", "", "ลูกค้าติดน้ำดื่มเดิม", "", "", "", "", "", "", ""],
      ["SC003", "โรงน้ำดื่มบ้านท่าล้อ", "โรงน้ำ", "เมือง", "699/9 ม.9 ต.บ่อแฮ้ว อ.เมือง จ.ลำปาง", "", "063-823-3853", "", "1", "C", "ไม่สนใจ", "", "", "", "", "", "", "", "", "", ""],
      ["SC004", "โรงน้ำนัทชัย", "โรงน้ำ", "เมือง", "", "", "", "", "1", "D", "รอติดตาม", "", "", "เข้าพบแล้วไม่อยู่", "", "", "", "", "", "", ""],
      ["SC005", "โรงน้ำชานนท์", "โรงน้ำ", "เมือง", "", "", "", "", "1", "A", "สนใจ", "", "", "ราคาที่เสนอผ่าน แต่ติดขั้นต่ำในการสั่ง", "", "", "เมาท์เท่น", "20", "", "100 โหล/เดือน", "ทุกวัน"],
      ["SC006", "โรงน้ำดื่มเขลางค์ทอง", "โรงน้ำ", "เมือง", "", "", "", "", "1", "D", "รอติดตาม", "", "", "เข้าพบแล้วไม่อยู่", "", "", "", "", "", "", ""],
      ["SC007", "โรงน้ำดงสันเงิน", "โรงน้ำ", "เมือง", "", "", "", "", "1", "D", "Prospect", "", "", "", "", "", "", "", "", "", ""],
      ["SC008", "น้ำดื่มเนอเจอร์เฟรช", "โรงน้ำ", "เมือง", "", "", "", "", "1", "C", "ไม่สนใจ", "", "", "ไม่แข่ง", "", "", "", "", "", "", ""],
      ["SC009", "โรงน้ำดื่มโบว์สตาร์", "โรงน้ำ", "เมือง", "", "", "", "", "1", "C", "ไม่สนใจ", "", "", "ยังไม่สนใจ", "", "", "", "", "", "", ""],
      ["SC010", "โรงน้ำดื่มคอปแอนด์คิน", "โรงน้ำ", "เมือง", "", "", "", "", "1", "B", "รอติดตาม", "", "", "โปรคู่แข่ง: สั่ง 600+1500ml แถม 350ml 5 แพ็ค", "", "", "เมาท์เท่น", "22", "", "500 โหล/เดือน", "ทุกสัปดาห์"],
      ["SC011", "โรงเรียนจิตต์อารีย์", "โรงเรียน", "เมือง", "", "", "", "", "1", "B", "รอติดตาม", "", "", "", "", "", "เมาท์เท่น", "27", "", "100 แพ็ค/เดือน", "รายเดือน"],
      ["SC012", "น้ำดื่มสปริงเกอร์ แม่หล้า", "โรงน้ำ", "เมือง", "", "", "", "", "1", "A", "สนใจ", "", "", "สนใจมาก — ขายแค่เพียวซ่า", "", "", "", "", "", "", ""],
      ["SC013", "น้ำดื่มล้านนา", "โรงน้ำ", "เมือง", "", "", "", "", "1", "A", "สนใจ", "", "", "สนใจมาก", "", "", "", "", "", "", ""],
      ["SC014", "น้ำดื่มเอสแอล", "โรงน้ำ", "เมือง", "", "", "", "", "1", "D", "รอติดตาม", "", "", "ลูกค้าไม่อยู่ ค่อยเข้ามาใหม่", "", "", "", "", "", "", ""],
    ]);

  createIfMissing(spreadsheet, "Visits",
    ["Visit_ID", "Timestamp", "วันที่", "เดือน", "เซลส์", "Customer_ID", "ชื่อลูกค้า",
     "ผลการเข้าพบ", "สินค้าที่สนใจ", "หมายเหตุ", "วันนัดติดตาม",
     "โอกาสสั่งซื้อ(%)", "Photo_URL"], []);

  createIfMissing(spreadsheet, "Orders_Sales",
    ["Order_ID", "Timestamp", "วันที่", "เดือน", "เซลส์", "Customer_ID", "ชื่อลูกค้า",
     "Product_ID", "สินค้า", "จำนวน", "หน่วย", "ราคา/หน่วย", "รวม",
     "การชำระเงิน", "สถานะ", "หมายเหตุ"], []);

  createIfMissing(spreadsheet, "Orders_OEM",
    ["Order_ID", "Timestamp", "วันที่", "เดือน", "เซลส์", "Customer_ID", "ชื่อลูกค้า",
     "แบรนด์ลูกค้า", "ขนาด", "จำนวน", "หน่วย", "ราคา/หน่วย", "รวม",
     "การชำระเงิน", "กำหนดส่ง", "สถานะ", "หมายเหตุ"], []);

  createIfMissing(spreadsheet, "Quotes",
    ["Quote_ID", "Timestamp", "วันที่", "เดือน", "เซลส์", "Customer_ID", "ชื่อลูกค้า",
     "รายการ(JSON)", "ยอดรวม", "ยืนราคา(วัน)", "หมายเหตุ", "สถานะ", "PDF_URL"], []);

  createIfMissing(spreadsheet, "Competitors",
    ["Customer_ID", "ชื่อลูกค้า", "แบรนด์", "ขนาด", "ราคาซื้อ", "ราคาขายต่อ",
     "Volume/เดือน", "ความถี่", "อัปเดตล่าสุด", "โดย"], []);

  createIfMissing(spreadsheet, "Appointments",
    ["Appt_ID", "Timestamp", "วันที่นัด", "เดือน", "เซลส์", "Customer_ID", "ชื่อลูกค้า",
     "เรื่อง", "หมายเหตุ", "สถานะ"], []);

  createIfMissing(spreadsheet, "Leaves",
    ["Leave_ID", "Timestamp", "วันที่ลา", "เดือน", "เซลส์", "ประเภท", "หมายเหตุ", "สถานะ"], []);

  createIfMissing(spreadsheet, "VanLoads",
    ["Load_ID", "Timestamp", "วันที่", "เดือน", "เซลส์", "ประเภท",
     "Product_ID", "สินค้า", "จำนวน", "สถานะ", "ผู้เช็ค", "เวลาเช็ค", "หมายเหตุ"], []);

  createIfMissing(spreadsheet, "Products",
    ["Product_ID", "Brand", "Size", "Category", "Current_Stock", "Company", "ราคาปลีก", "Price",
     "ราคาส่ง", "ราคาตัวแทน", "ราคาสวมฉลาก", "Product_Name"],
    [
      ["P001", "ละกอน", "250 ml", "ฉลาก", 0, "", 64, "", "", "", "", ""],
      ["P002", "ละกอน", "600 ml", "ฉลาก", 0, "", 66, "", "", "", "", ""],
      ["P003", "เพียวซ่า", "250 ml", "สกรีน", 0, "", 57, "", "", "", "", ""],
      ["P004", "เพียวซ่า", "600 ml", "สกรีน", 0, "", 60, "", "", "", "", ""],
    ]);

  buildDashboard(spreadsheet);
  Logger.log("setupSalesSheets เสร็จสมบูรณ์");
}

function createIfMissing(spreadsheet, name, headers, rows) {
  if (spreadsheet.getSheetByName(name)) {
    Logger.log("ข้าม: มีชีต " + name + " อยู่แล้ว");
    return;
  }
  const sheet = spreadsheet.insertSheet(name);
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#E0F2FE");
  rows.forEach(r => sheet.appendRow(r));
  sheet.setFrozenRows(1);
}

// ---------- Dashboard_Sales: KPI ต่อเซลส์ต่อเดือน (สูตรคำนวณอัตโนมัติ) ----------

function buildDashboard(spreadsheet) {
  if (spreadsheet.getSheetByName("Dashboard_Sales")) {
    Logger.log("ข้าม: มีชีต Dashboard_Sales อยู่แล้ว");
    return;
  }
  const sheet = spreadsheet.insertSheet("Dashboard_Sales");

  sheet.getRange("A1").setValue("Dashboard ทีมเซลส์").setFontWeight("bold").setFontSize(14);
  sheet.getRange("A2").setValue("เดือน (แก้ได้ เช่น 2026-07):");
  sheet.getRange("B2").setFormula('=TEXT(TODAY(),"YYYY-MM")').setBackground("#FFFF00");

  const headers = ["เซลส์", "ยอดขายเป้า", "ยอดขายจริง", "%Achievement",
                   "ลูกค้าใหม่", "ลูกค้า Active", "Visit", "Order", "Avg/Order"];
  sheet.getRange(4, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#E0F2FE");

  for (let i = 0; i < 10; i++) {
    const r = 5 + i;
    const repRef = "SalesReps!B" + (2 + i);
    sheet.getRange(r, 1).setFormula('=IFERROR(IF(' + repRef + '="","",' + repRef + '),"")');
    sheet.getRange(r, 2).setValue("").setBackground("#FFFDE7");
    sheet.getRange(r, 3).setFormula(
      '=IF($A' + r + '="","",SUMIFS(Orders_Sales!$M:$M,Orders_Sales!$E:$E,$A' + r + ',Orders_Sales!$D:$D,$B$2,Orders_Sales!$O:$O,"<>Cancelled")' +
      '+SUMIFS(Orders_OEM!$M:$M,Orders_OEM!$E:$E,$A' + r + ',Orders_OEM!$D:$D,$B$2,Orders_OEM!$P:$P,"<>Cancelled"))');
    sheet.getRange(r, 4).setFormula(
      '=IF(OR($A' + r + '="",$B' + r + '=""),"",IFERROR($C' + r + '/$B' + r + ',""))');
    sheet.getRange(r, 5).setFormula(
      '=IF($A' + r + '="","",COUNTIFS(Customers_Sales!$H:$H,$A' + r + ',Customers_Sales!$M:$M,$B$2))');
    sheet.getRange(r, 6).setFormula(
      '=IF($A' + r + '="","",IFERROR(COUNTUNIQUEIFS(Orders_Sales!$F:$F,Orders_Sales!$E:$E,$A' + r + ',Orders_Sales!$D:$D,$B$2),0))');
    sheet.getRange(r, 7).setFormula(
      '=IF($A' + r + '="","",COUNTIFS(Visits!$E:$E,$A' + r + ',Visits!$D:$D,$B$2))');
    sheet.getRange(r, 8).setFormula(
      '=IF($A' + r + '="","",IFERROR(COUNTUNIQUEIFS(Orders_Sales!$A:$A,Orders_Sales!$E:$E,$A' + r + ',Orders_Sales!$D:$D,$B$2),0)' +
      '+IFERROR(COUNTUNIQUEIFS(Orders_OEM!$A:$A,Orders_OEM!$E:$E,$A' + r + ',Orders_OEM!$D:$D,$B$2),0))');
    sheet.getRange(r, 9).setFormula(
      '=IF($A' + r + '="","",IFERROR($C' + r + '/$H' + r + ',0))');
  }

  sheet.getRange("D5:D14").setNumberFormat("0.0%");
  sheet.getRange("B5:C14").setNumberFormat("#,##0");
  sheet.getRange("I5:I14").setNumberFormat("#,##0");

  sheet.getRange("A17").setValue("สรุปผลการเข้าพบเดือนนี้").setFontWeight("bold");
  const outcomes = ["สั่งซื้อ", "สนใจ", "ขอใบเสนอราคา", "รอติดตาม", "ไม่สนใจ", "ไม่อยู่"];
  outcomes.forEach((o, i) => {
    const r = 18 + i;
    sheet.getRange(r, 1).setValue(o);
    sheet.getRange(r, 2).setFormula(
      '=COUNTIFS(Visits!$H:$H,$A' + r + ',Visits!$D:$D,$B$2)');
  });

  sheet.setFrozenRows(4);
  sheet.getRange("A16").setValue("หมายเหตุ: ช่องสีเหลือง = กรอกเอง (เดือน B2, ยอดขายเป้า คอลัมน์ B)")
    .setFontColor("#888888").setFontSize(9);
}

// ============================================================
// upgradeToV2 — สำหรับคนที่ติดตั้ง v1 ไปแล้ว
// ============================================================

function upgradeToV2() {
  const spreadsheet = ss();

  const cust = spreadsheet.getSheetByName("Customers_Sales");
  if (cust && String(cust.getRange("O1").getValue()) !== "GPS_Lat") {
    cust.getRange("O1").setValue("GPS_Lat").setFontWeight("bold").setBackground("#E0F2FE");
    cust.getRange("P1").setValue("GPS_Lng").setFontWeight("bold").setBackground("#E0F2FE");
  }

  const visits = spreadsheet.getSheetByName("Visits");
  if (visits && String(visits.getRange("L1").getValue()) !== "โอกาสสั่งซื้อ(%)") {
    visits.getRange("L1").setValue("โอกาสสั่งซื้อ(%)").setFontWeight("bold").setBackground("#E0F2FE");
    visits.getRange("M1").setValue("Photo_URL").setFontWeight("bold").setBackground("#E0F2FE");
  }

  createIfMissing(spreadsheet, "Quotes",
    ["Quote_ID", "Timestamp", "วันที่", "เดือน", "เซลส์", "Customer_ID", "ชื่อลูกค้า",
     "รายการ(JSON)", "ยอดรวม", "ยืนราคา(วัน)", "หมายเหตุ", "สถานะ", "PDF_URL"], []);

  Logger.log("upgradeToV2 เสร็จสมบูรณ์");
}

// ============================================================
// upgradeToV3 — เพิ่มคอลัมน์คู่แข่ง + ชีต Orders_OEM + สูตร Dashboard รวม OEM
// รันหลัง upgradeToV2 (หรือหลัง setup เดิม)
// ============================================================

function upgradeToV3() {
  const spreadsheet = ss();

  const cust = spreadsheet.getSheetByName("Customers_Sales");
  if (cust && String(cust.getRange("Q1").getValue()) !== "คู่แข่ง_แบรนด์") {
    const heads = ["คู่แข่ง_แบรนด์", "คู่แข่ง_ราคาซื้อ", "คู่แข่ง_ราคาขายต่อ", "คู่แข่ง_Volume/เดือน", "คู่แข่ง_ความถี่"];
    cust.getRange(1, 17, 1, 5).setValues([heads]).setFontWeight("bold").setBackground("#E0F2FE");
  }

  createIfMissing(spreadsheet, "Orders_OEM",
    ["Order_ID", "Timestamp", "วันที่", "เดือน", "เซลส์", "Customer_ID", "ชื่อลูกค้า",
     "แบรนด์ลูกค้า", "ขนาด", "จำนวน", "หน่วย", "ราคา/หน่วย", "รวม",
     "การชำระเงิน", "กำหนดส่ง", "สถานะ", "หมายเหตุ"], []);

  // อัปเดตสูตร Dashboard: ยอดขายจริง + Order รวม OEM และไม่นับที่ Cancelled
  const dash = spreadsheet.getSheetByName("Dashboard_Sales");
  if (dash) {
    for (let i = 0; i < 10; i++) {
      const r = 5 + i;
      dash.getRange(r, 3).setFormula(
        '=IF($A' + r + '="","",SUMIFS(Orders_Sales!$M:$M,Orders_Sales!$E:$E,$A' + r + ',Orders_Sales!$D:$D,$B$2,Orders_Sales!$O:$O,"<>Cancelled")' +
        '+SUMIFS(Orders_OEM!$M:$M,Orders_OEM!$E:$E,$A' + r + ',Orders_OEM!$D:$D,$B$2,Orders_OEM!$P:$P,"<>Cancelled"))');
      dash.getRange(r, 8).setFormula(
        '=IF($A' + r + '="","",IFERROR(COUNTUNIQUEIFS(Orders_Sales!$A:$A,Orders_Sales!$E:$E,$A' + r + ',Orders_Sales!$D:$D,$B$2),0)' +
        '+IFERROR(COUNTUNIQUEIFS(Orders_OEM!$A:$A,Orders_OEM!$E:$E,$A' + r + ',Orders_OEM!$D:$D,$B$2),0))');
    }
  }

  Logger.log("upgradeToV3 เสร็จสมบูรณ์");
}

// ============================================================
// upgradeToV4 — ข้อมูลคู่แข่งแบบหลายรายการต่อลูกค้า (ชีต Competitors)
// ย้ายข้อมูลเดิมจากคอลัมน์ Q-U ของ Customers_Sales มาให้อัตโนมัติ
// ============================================================

function upgradeToV4() {
  const spreadsheet = ss();

  createIfMissing(spreadsheet, "Competitors",
    ["Customer_ID", "ชื่อลูกค้า", "แบรนด์", "ขนาด", "ราคาซื้อ", "ราคาขายต่อ",
     "Volume/เดือน", "ความถี่", "อัปเดตล่าสุด", "โดย"], []);

  // ย้ายข้อมูลคู่แข่งเดิม (ลูกค้าละ 1 ชุด) มาเป็นรายการแรกในชีตใหม่
  const compSheet = spreadsheet.getSheetByName("Competitors");
  const migrated  = new Set(getAllRows("Competitors").map(r => String(r[0]).trim()));
  const cust = spreadsheet.getSheetByName("Customers_Sales");
  if (cust) {
    cust.getDataRange().getValues().slice(1).forEach(r => {
      if (r[0] && r[16] && !migrated.has(String(r[0]).trim())) {
        compSheet.appendRow([
          r[0], r[1], r[16], "", r[17] || "", r[18] || "", r[19] || "", r[20] || "",
          todayStr(), "ย้ายจากข้อมูลเดิม",
        ]);
      }
    });
    // ทำเครื่องหมายคอลัมน์เก่าว่าเลิกใช้ (ข้อมูลใหม่อยู่ชีต Competitors)
    if (String(cust.getRange("Q1").getValue()).indexOf("เลิกใช้") === -1 &&
        String(cust.getRange("Q1").getValue()) !== "") {
      cust.getRange("Q1").setValue("คู่แข่ง_แบรนด์ (เลิกใช้→ดูชีต Competitors)");
    }
  }

  Logger.log("upgradeToV4 เสร็จสมบูรณ์");
}

// ============================================================
// upgradeToV8 — บทบาททีม (ผู้จัดการ/หัวหน้าสาย/เซลส์) + ลิงก์ Google Maps
// รันครั้งเดียว แล้วไปกรอกคอลัมน์ "บทบาท" ในชีต SalesReps ให้ตรงทีมจริง
// ============================================================

function upgradeToV8() {
  const spreadsheet = ss();

  const reps = spreadsheet.getSheetByName("SalesReps");
  if (reps && String(reps.getRange("F1").getValue()) !== "บทบาท") {
    reps.getRange("F1").setValue("บทบาท").setFontWeight("bold").setBackground("#E0F2FE");
    // ค่าเริ่มต้น: ทุกคนเป็น "เซลส์" — ไปแก้เป็น หัวหน้าสาย / ผู้จัดการ เอง
    const last = reps.getLastRow();
    if (last > 1) {
      const vals = [];
      for (let i = 2; i <= last; i++) vals.push(["เซลส์"]);
      reps.getRange(2, 6, vals.length, 1).setValues(vals);
    }
  }

  const cust = spreadsheet.getSheetByName("Customers_Sales");
  if (cust && String(cust.getRange("V1").getValue()) !== "Maps_URL") {
    cust.getRange("V1").setValue("Maps_URL").setFontWeight("bold").setBackground("#E0F2FE");
  }

  Logger.log("upgradeToV8 เสร็จสมบูรณ์ — อย่าลืมตั้งบทบาทในชีต SalesReps (เซลส์/หัวหน้าสาย/ผู้จัดการ) และหัวหน้าสายใส่หลายสายได้เช่น 1,2");
}

// ============================================================
// upgradeToV9 — ปฏิทินนัด (ชีต Appointments) + ระบบวันลา (ชีต Leaves)
// ============================================================

function upgradeToV9() {
  const spreadsheet = ss();
  createIfMissing(spreadsheet, "Appointments",
    ["Appt_ID", "Timestamp", "วันที่นัด", "เดือน", "เซลส์", "Customer_ID", "ชื่อลูกค้า",
     "เรื่อง", "หมายเหตุ", "สถานะ"], []);
  createIfMissing(spreadsheet, "Leaves",
    ["Leave_ID", "Timestamp", "วันที่ลา", "เดือน", "เซลส์", "ประเภท", "หมายเหตุ", "สถานะ"], []);
  Logger.log("upgradeToV9 เสร็จสมบูรณ์");
}

// ============================================================
// upgradeToV10 — ระบบรถเร่ (ชีต VanLoads)
// ============================================================

function upgradeToV10() {
  ensureVanSheet();
  Logger.log("upgradeToV10 เสร็จสมบูรณ์ — สร้างชีต VanLoads แล้ว (แอปโรงงานต้องอัปเดตด้วยเพื่อให้คนนับสต๊อกกดยืนยันได้)");
}

// v11: ย้ายลีด + จัดรอบส่ง — สร้างชีต LeadTransfers, DeliveryRounds + คอลัมน์ Q ใน Orders_Sales
function upgradeToV11() {
  ensureV11Sheets();
  Logger.log("upgradeToV11 เสร็จสมบูรณ์ — สร้างชีต LeadTransfers + DeliveryRounds และคอลัมน์ Round_ID ใน Orders_Sales แล้ว");
}

// ============================================================
// upgradeToV5 — ใบเสนอราคาเป็น PDF (เพิ่มคอลัมน์ PDF_URL ในชีต Quotes)
// ============================================================

function upgradeToV5() {
  const quotes = ss().getSheetByName("Quotes");
  if (quotes && String(quotes.getRange("M1").getValue()) !== "PDF_URL") {
    quotes.getRange("M1").setValue("PDF_URL").setFontWeight("bold").setBackground("#E0F2FE");
  }
  // สร้างโฟลเดอร์เก็บ PDF + เช็คสิทธิ์ Drive ไปในตัว
  const iter = DriveApp.getFoldersByName("ละกอน_Quotes");
  if (!iter.hasNext()) DriveApp.createFolder("ละกอน_Quotes");
  Logger.log("upgradeToV5 เสร็จสมบูรณ์");
}

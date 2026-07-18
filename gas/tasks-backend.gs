/**
 * ═══════════════════════════════════════════════════════
 *  ละกอน — ระบบจัดการงานครอบครัว (Family Tasks)
 *  Google Apps Script Backend
 * ═══════════════════════════════════════════════════════
 *
 *  วิธีติดตั้ง:
 *  1. สร้าง Google Sheet ใหม่ แล้วคัดลอก Sheet ID มาใส่ใน SHEET_ID ด้านล่าง
 *     (Sheet ID คือส่วนใน URL: docs.google.com/spreadsheets/d/<SHEET_ID>/edit)
 *  2. เปิด Extensions → Apps Script แล้ววางโค้ดไฟล์นี้ทั้งหมด
 *  3. รันฟังก์ชัน setup() หนึ่งครั้ง เพื่อสร้างชีต Members และ Tasks พร้อมหัวตาราง
 *  4. Deploy → New deployment → Web app
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  5. คัดลอก Web app URL ไปใส่ใน GAS_URL ของไฟล์ tasks/index.html
 */

const SHEET_ID = "PUT_YOUR_SHEET_ID_HERE";
const TZ = "Asia/Bangkok";

const MEMBER_HEADERS = ["LINE_User_ID", "Display_Name", "Nickname", "Picture_URL", "Joined_At"];
const TASK_HEADERS = [
  "Task_ID", "Title", "Detail", "Category", "Priority", "Status",
  "Owner_ID", "Owner_Name", "Helpers", "Deadline", "Notes",
  "Created_By", "Created_By_Name", "Created_At", "Updated_At", "Completed_At",
];

/** รันครั้งเดียวตอนติดตั้ง: สร้างชีตพร้อมหัวตาราง */
function setup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureSheet(ss, "Members", MEMBER_HEADERS);
  ensureSheet(ss, "Tasks", TASK_HEADERS);
}

function ensureSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
}

// ══════════════════════════════════════════
//  Entry points
// ══════════════════════════════════════════
function doGet(e) {
  return respond(route(e));
}

function doPost(e) {
  return respond(route(e));
}

function route(e) {
  try {
    let p = e.parameter || {};
    if (p.payload) p = JSON.parse(p.payload);
    else if (e.postData && e.postData.contents) p = JSON.parse(e.postData.contents);

    switch (p.action) {
      case "getBootstrap":   return getBootstrap(p);
      case "getTasks":       return { success: true, tasks: getTasks() };
      case "getMembers":     return { success: true, members: getMembers() };
      case "registerMember": return registerMember(p);
      case "createTask":     return withLock(() => createTask(p));
      case "updateTask":     return withLock(() => updateTask(p));
      case "updateStatus":   return withLock(() => updateStatus(p));
      case "addNote":        return withLock(() => addNote(p));
      default:               return { success: false, error: "unknown action: " + p.action };
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ══════════════════════════════════════════
//  Read
// ══════════════════════════════════════════

/** โหลดทุกอย่างในคำขอเดียว ให้แอปเปิดเร็ว */
function getBootstrap(p) {
  const members = getMembers();
  const me = members.find(m => m.LINE_User_ID === p.lineUserId) || null;
  return { success: true, me: me, members: members, tasks: getTasks() };
}

function getMembers() {
  return readRows("Members", MEMBER_HEADERS);
}

function getTasks() {
  return readRows("Tasks", TASK_HEADERS).map(t => {
    t.Helpers = parseJson(t.Helpers, []);
    t.Notes = parseJson(t.Notes, []);
    t.Deadline = t.Deadline ? Utilities.formatDate(new Date(t.Deadline), TZ, "yyyy-MM-dd") : "";
    return t;
  });
}

function readRows(sheetName, headers) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
  return values
    .filter(row => row[0] !== "")
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });
}

function parseJson(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

// ══════════════════════════════════════════
//  Members
// ══════════════════════════════════════════
function registerMember(p) {
  if (!p.lineUserId || !p.nickname) return { success: false, error: "missing fields" };
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Members");
  const row = findRowByValue(sh, 1, p.lineUserId);
  const now = new Date();
  if (row > 0) {
    sh.getRange(row, 2, 1, 3).setValues([[p.displayName || "", p.nickname, p.pictureUrl || ""]]);
  } else {
    sh.appendRow([p.lineUserId, p.displayName || "", p.nickname, p.pictureUrl || "", now]);
  }
  return { success: true };
}

// ══════════════════════════════════════════
//  Tasks
// ══════════════════════════════════════════
function createTask(p) {
  if (!p.title || !p.ownerId) return { success: false, error: "missing fields" };
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Tasks");
  const now = new Date();
  const taskId = "T" + Utilities.formatDate(now, TZ, "yyMMdd") + "-" + now.getTime().toString(36).slice(-4).toUpperCase();
  sh.appendRow([
    taskId,
    p.title,
    p.detail || "",
    p.category || "อื่นๆ",
    p.priority || "normal",
    "todo",
    p.ownerId,
    p.ownerName || "",
    JSON.stringify(p.helpers || []),
    p.deadline || "",
    "[]",
    p.createdBy || "",
    p.createdByName || "",
    now,
    now,
    "",
  ]);
  return { success: true, taskId: taskId };
}

function updateTask(p) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Tasks");
  const row = findRowByValue(sh, 1, p.taskId);
  if (row < 0) return { success: false, error: "task not found" };

  const set = (col, val) => sh.getRange(row, col).setValue(val);
  if (p.title != null)    set(2, p.title);
  if (p.detail != null)   set(3, p.detail);
  if (p.category != null) set(4, p.category);
  if (p.priority != null) set(5, p.priority);
  if (p.ownerId != null)  { set(7, p.ownerId); set(8, p.ownerName || ""); }
  if (p.helpers != null)  set(9, JSON.stringify(p.helpers));
  if (p.deadline != null) set(10, p.deadline);
  set(15, new Date());
  return { success: true };
}

function updateStatus(p) {
  const valid = ["todo", "doing", "done", "cancelled"];
  if (valid.indexOf(p.status) < 0) return { success: false, error: "invalid status" };
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Tasks");
  const row = findRowByValue(sh, 1, p.taskId);
  if (row < 0) return { success: false, error: "task not found" };

  const now = new Date();
  sh.getRange(row, 6).setValue(p.status);
  sh.getRange(row, 15).setValue(now);
  sh.getRange(row, 16).setValue(p.status === "done" ? now : "");

  // บันทึกลง timeline อัตโนมัติ
  appendNoteToRow(sh, row, {
    by: p.byId || "",
    byName: p.byName || "",
    text: statusLogText(p.status),
    at: now.toISOString(),
    type: "status",
  });
  return { success: true };
}

function statusLogText(status) {
  return { todo: "ย้ายกลับเป็นรอทำ", doing: "เริ่มทำงานนี้", done: "ทำเสร็จแล้ว ✅", cancelled: "ยกเลิกงานนี้" }[status] || status;
}

function addNote(p) {
  if (!p.text) return { success: false, error: "missing text" };
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Tasks");
  const row = findRowByValue(sh, 1, p.taskId);
  if (row < 0) return { success: false, error: "task not found" };
  appendNoteToRow(sh, row, {
    by: p.byId || "",
    byName: p.byName || "",
    text: p.text,
    at: new Date().toISOString(),
    type: "note",
  });
  sh.getRange(row, 15).setValue(new Date());
  return { success: true };
}

function appendNoteToRow(sh, row, note) {
  const notes = parseJson(sh.getRange(row, 11).getValue(), []);
  notes.push(note);
  sh.getRange(row, 11).setValue(JSON.stringify(notes));
}

function findRowByValue(sh, col, value) {
  if (sh.getLastRow() < 2) return -1;
  const values = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(value)) return i + 2;
  }
  return -1;
}

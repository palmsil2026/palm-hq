// 🧪 โต๊ะทดลองคุณเลขา — โหลด secretary/Code.gs จริง แล้วจำลอง GAS / LINE / Drive / แอปบัญชี / สมอง Claude
//   ไม่แตะของจริงเลย (ไม่มีเน็ต ไม่มีชีต) · ใช้โดย unit.test.js และ brain-eval.js
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const SRC = fs.readFileSync(process.env.SECRETARY_CODE || path.join(__dirname, '..', 'Code.gs'), 'utf8');

const OWNER = 'Uowner000000000000000000000000000';
const EXP_GID = 'Cexp00000000000000000000000000000';
const PROD_GID = 'Cprod0000000000000000000000000000';
const OTHER_GID = 'Cother000000000000000000000000000';
const PLANT_SHEET = '1PlantSheetIdXYZ';
const FIN_URL = 'https://script.google.com/macros/s/AKfycbwQdfDqibpZrpxEYSidLvcEO7amtO_EMND2anBXI_dpAJHpYHYHvJZwSztlzU3Q2Y7y/exec';

function fmt(d, tz, f) {
  const t = new Date(d.getTime() + 7 * 3600e3);
  const p = n => String(n).padStart(2, '0');
  return f.replace('yyyy', t.getUTCFullYear()).replace('yy', String(t.getUTCFullYear()).slice(2))
    .replace('MM', p(t.getUTCMonth() + 1)).replace('dd', p(t.getUTCDate()))
    .replace('HH', p(t.getUTCHours())).replace(/\bH\b/, String(t.getUTCHours()))
    .replace('mm', p(t.getUTCMinutes())).replace('ss', p(t.getUTCSeconds()));
}

function makeEnv(opts) {
  opts = opts || {};
  const S = { props: Object.assign({ LINE_TOKEN: 'lt', OWNER_LINE_USER_ID: OWNER, PLANT_SHEET_ID: PLANT_SHEET, ANTHROPIC_API_KEY: 'k' }, opts.props || {}),
              cache: {}, fetches: [], prompts: [], replies: [], pushes: [], files: [], logs: [], groupChat: [], anthropic: 0,
              financeResp: opts.financeResp || (() => ({ success: true, act: 'none' })), replyCode: opts.replyCode || 200,
              now: opts.now || new Date('2026-10-19T01:30:00Z') /* 08:30 ไทย */ };
  const resp = (code, body, blob) => ({ getResponseCode: () => code, getContentText: () => typeof body === 'string' ? body : JSON.stringify(body),
                                        getBlob: () => blob });
  const ctx = {
    console: { error: () => {}, log: () => {} }, Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in S.props ? S.props[k] : null), setProperty: (k, v) => { S.props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in S.cache ? S.cache[k] : null), put: (k, v) => { S.cache[k] = v; }, remove: k => { delete S.cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      formatDate: (d, tz, f) => fmt(d, tz, f),
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()).map(b => (b > 127 ? b - 256 : b)),
      base64Encode: b => Buffer.from(b).toString('base64'), sleep: () => {}
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'A' }, Permission: { VIEW: 'V' },
      getFoldersByName: name => { const it = [mkFolder(name)]; return { hasNext: () => it.length > 0, next: () => it.shift() }; },
      createFolder: name => mkFolder(name), getFolderById: id => mkFolder(id)
    },
    UrlFetchApp: { fetch: (url, o) => {
      o = o || {}; const rec = { url, o, body: o.payload ? JSON.parse(o.payload) : null }; S.fetches.push(rec);
      if (url.indexOf('api-data.line.me') !== -1) {
        if (opts.downloadFail) return resp(500, '');
        const blob = { _name: '', getContentType: () => 'image/jpeg', setName(n) { this._name = n; return this; }, getBytes: () => [1, 2] };
        return resp(200, '', blob);
      }
      if (url.indexOf('/member/') !== -1) return resp(200, { displayName: 'แม่' });
      if (url.indexOf('/summary') !== -1) { const id = url.split('/group/')[1].split('/')[0];
        return resp(200, { groupName: id === EXP_GID ? 'บิลค่าใช้จ่าย 🧾' : id === PROD_GID ? 'ทีมผลิต' : 'กลุ่มคุยเล่น' }); }
      if (url.indexOf('/message/reply') !== -1) { S.replies.push(rec.body); return resp(S.replyCode, { sentMessages: [] }); }
      if (url.indexOf('/message/push') !== -1) { S.pushes.push(rec.body); return resp(200, { sentMessages: [] }); }
      if (url.indexOf('AKfycbyz9gSSkms44VWcnD3wtZx9C33aG1r5LAjxVPMjD_EcqzwzxU2UBtVVd15qfO_idObE') !== -1) {   // แอปทีมผลิต
        if (opts.prodThrow) throw new Error('timeout');
        return resp(200, (opts.prodResp || (() => ({ success: true, saved: false, why: 'ไม่เกี่ยว' })))(rec.body)); }
      if (url === FIN_URL) { if (opts.financeThrow) throw new Error('timeout'); return resp(200, S.financeResp(rec.body)); }
      if (url.indexOf('anthropic.com') !== -1) { S.anthropic++; S.prompts.push(rec.body);
        return resp(200, { content: [{ type: 'text', text: (opts.ai || (() => 'SKIP'))(rec.body) }], usage: { input_tokens: 1, output_tokens: 1 } }); }
      return resp(404, {});
    } },
    ContentService: { createTextOutput: t => ({ setMimeType() { return this; }, t }), MimeType: { JSON: 'json' } },
    ScriptApp: { getProjectTriggers: () => [] }, Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
    SpreadsheetApp: { openById: () => { throw new Error('no sheet in test'); } },
    Date: class extends Date { constructor(...a) { a.length ? super(...a) : super(S.now.getTime()); } static now() { return S.now.getTime(); } }
  };
  function mkFolder(name) {
    return { name, getFoldersByName: n => { const it = [mkFolder(n)]; return { hasNext: () => true, next: () => it.shift() }; },
             createFolder: n => mkFolder(n),
             createFile: blob => { const f = { id: 'F' + (S.files.length + 1), folder: name, name: blob._name, shared: false,
                 getId() { return this.id; }, getUrl() { return 'https://drive.google.com/file/d/' + this.id + '/view'; },
                 setSharing() { this.shared = true; } }; S.files.push(f); return f; } };
  }
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  // ตัวช่วยที่แตะชีต → จำลอง
  ctx.listKnownGroups = () => [{ id: EXP_GID, name: 'บิลค่าใช้จ่าย 🧾' }, { id: PROD_GID, name: 'ทีมผลิต' }, { id: OTHER_GID, name: 'กลุ่มคุยเล่น' }];
  ctx.registerGroup = () => {}; ctx.registerStaff = () => {};
  ctx.logRow = a => S.logs.push(a); ctx.memAppend = () => {}; ctx.memGet = () => [];
  ctx.logGroupChat = (c, e, t) => S.groupChat.push([c, t]);
  ctx.isOwner = id => id === OWNER;
  ctx.loadKBCached = () => ''; ctx.loadPlaybookCached = () => ''; ctx.listPendingPosts = () => []; ctx.listStaff = () => [];
  ctx.boardUrl = () => 'https://board'; ctx.handleKnowledgeCommand = () => false; ctx.tryAnswerPendingQuestion = () => false;
  ctx.handlePlanVerdict = () => false; ctx.handleManualDone = () => false;
  ctx.oldDaysSummaryText = w => '☕ ยอดร้าน(' + w + ')'; ctx.plantSalesSummaryText = w => '💧 ยอดโรงน้ำ(' + w + ')'; ctx.plantSalesBreakdownText = (r, b) => '📊 ยอดแยก(' + r + ',' + b + ')';
  return { ctx, S };
}
const finCalls = S => S.fetches.filter(f => f.url === FIN_URL).map(f => f.body);
const ev = (type, extra, gid) => Object.assign({ type: 'message', replyToken: 'rt1', timestamp: 1760000000000,
  source: { type: 'group', groupId: gid || EXP_GID, userId: 'Umom' }, message: Object.assign({ id: 'M' + Math.random().toString(36).slice(2, 8), type }, extra) });

const dm = (uid, text) => ({ type: 'message', replyToken: 'rtD', source: { type: 'user', userId: uid }, message: { id: 'D' + Math.random(), type: 'text', text } });
const replyText = S => S.replies.map(r => r.messages[0].text).join('\n---\n');

module.exports = { makeEnv, finCalls, ev, dm, replyText, OWNER, EXP_GID, PROD_GID, OTHER_GID, PLANT_SHEET, FIN_URL };


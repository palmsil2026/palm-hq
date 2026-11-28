// 📒 ทะเบียนหน้าที่ของกลุ่ม + ถูกนำออกจากกลุ่ม (28/11) — รันต่อท้าย unit.test.js
//   กลุ่มรู้จักด้วย chatId + คอลัมน์ "หน้าที่" ในแท็บ Groups · ยังไม่มีกลุ่มไหนลงหน้าที่นั้น = ใช้กติกาเดิม (คำในชื่อกลุ่ม)
const assert = require('assert');
const { makeEnv, ev, OWNER, EXP_GID, PROD_GID, OTHER_GID, TW_GID, VAN_GID } = require('./harness');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };
const NEW_BILL = 'Cnewbill0000000000000000000000000', NEW_PROD = 'Cnewprod0000000000000000000000000';

// แท็บ Groups จำลอง (แถว 1 = หัว) — ใช้กับ registerGroup / markGroupLeft_ / listKnownGroups ตัวจริง
function fakeGroupsSheet(rows) {
  const data = rows.map(r => r.slice());
  const sh = {
    data,
    getLastRow: () => data.length,
    getLastColumn: () => data.reduce((m, r) => Math.max(m, r.length), 0),
    appendRow: r => { data.push(r.slice()); },
    getRange: (row, col, nr, nc) => ({
      getValues: () => { const o = []; for (let i = 0; i < (nr || 1); i++) { const a = []; for (let j = 0; j < (nc || 1); j++) a.push((data[row - 1 + i] || [])[col - 1 + j] === undefined ? '' : data[row - 1 + i][col - 1 + j]); o.push(a); } return o; },
      getValue: () => ((data[row - 1] || [])[col - 1] === undefined ? '' : data[row - 1][col - 1]),
      setValues: v => v.forEach((r, i) => r.forEach((x, j) => { data[row - 1 + i] = data[row - 1 + i] || []; data[row - 1 + i][col - 1 + j] = x; })),
      setValue: x => { data[row - 1] = data[row - 1] || []; data[row - 1][col - 1] = x; }
    })
  };
  return sh;
}
function envWithSheet(rows, opts) {
  const made = makeEnv(opts), ctx = made.ctx;
  const sh = fakeGroupsSheet(rows);
  ctx.groupSheet_ = () => sh;
  return Object.assign(made, { sh });
}
// โหลดตัวจริงของฟังก์ชันที่ harness ทับไว้ — อ่านจากซอร์สแล้วรันในบริบทเดียวกัน
function restore(ctx, names) {
  const src = require('fs').readFileSync(process.env.SECRETARY_CODE || require('path').join(__dirname, '..', 'Code.gs'), 'utf8');
  names.forEach(nm => {
    const i = src.indexOf('\nfunction ' + nm + '(');
    assert.ok(i >= 0, 'ไม่เจอ ' + nm);
    let d = 0, j = src.indexOf('{', i), k = j;
    for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
    require('vm').runInContext(nm + ' = ' + src.slice(i + 1, k + 1), ctx);
  });
}

t('ยังไม่มีกลุ่มไหนลงหน้าที่ → กติกาเดิม (คำในชื่อกลุ่ม) ใช้ต่อได้', () => {
  const { ctx } = makeEnv();
  assert.strictEqual(ctx.isExpenseGroup(EXP_GID), true);
  assert.strictEqual(ctx.productionGroupId(), PROD_GID);
  assert.strictEqual(ctx.isExpenseGroup(OTHER_GID), false);
});

t('ลงหน้าที่ในทะเบียนแล้ว → ยึด chatId ตามทะเบียน ไม่สนชื่อกลุ่ม (เปลี่ยนชื่อกลุ่มแล้วงานไม่หลุด)', () => {
  const { ctx } = makeEnv();
  ctx.listKnownGroups = () => [
    { id: EXP_GID, name: 'บิลค่าใช้จ่าย 🧾', roles: [] },                 // ชื่อตรงกติกาเดิม แต่ไม่ได้ลงหน้าที่
    { id: NEW_BILL, name: 'การเงิน-รวมบิล', roles: ['บิล'] },              // ชื่อใหม่ ไม่มีคำเดิมเลย
    { id: NEW_PROD, name: 'โรงน้ำ-หน้างาน', roles: ['ผลิต', 'อื่น'] },
    { id: PROD_GID, name: 'ทีมผลิต', roles: [] },
    { id: OTHER_GID, name: 'ห้องเครื่อง', roles: ['เฝ้าเครื่อง'] },
    { id: VAN_GID, name: 'ทีมรถ', roles: ['สายรถ'] }
  ];
  assert.strictEqual(ctx.isExpenseGroup(NEW_BILL), true);
  assert.strictEqual(ctx.isExpenseGroup(EXP_GID), false, 'มีกลุ่มลงหน้าที่บิลแล้ว กลุ่มที่แค่ชื่อเหมือนไม่นับ');
  assert.strictEqual(ctx.expenseGroupId(), NEW_BILL);
  assert.strictEqual(ctx.productionGroupId(), NEW_PROD);
  assert.strictEqual(ctx.isTeamworkGroup(OTHER_GID), true);
  assert.strictEqual(ctx.teamworkGroupId(), OTHER_GID);
  assert.strictEqual(ctx.isVanGroup(VAN_GID), true);
  assert.strictEqual(ctx.vanGroupId(), VAN_GID);
});

t('Script Property ที่ตั้งไว้ยังชนะทะเบียน', () => {
  const { ctx } = makeEnv({ props: { GROUP_EXPENSE_ID: EXP_GID } });
  ctx.listKnownGroups = () => [{ id: NEW_BILL, name: 'x', roles: ['บิล'] }];
  assert.strictEqual(ctx.isExpenseGroup(EXP_GID), true);
  assert.strictEqual(ctx.isExpenseGroup(NEW_BILL), false);
});

t('กลุ่มที่ออกแล้ว ไม่นับหน้าที่ · อ่านคอลัมน์ หน้าที่/ทีม/สถานะ จากชีต', () => {
  const { ctx } = envWithSheet([
    ['chatId', 'ชื่อกลุ่ม', 'อัปเดตเมื่อ', 'หน้าที่', 'ทีม', 'สถานะ', 'หมายเหตุ'],
    [NEW_BILL, 'บิลเก่า', '', 'บิล', 'บัญชี', 'ออกแล้ว 01/11/2026', ''],
    [EXP_GID, 'บิลค่าใช้จ่าย 🧾', '', 'บิล , สลิป', 'บัญชี', 'อยู่', '']
  ]);
  restore(ctx, ['listKnownGroups']);
  const gs = ctx.listKnownGroups();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(gs[1].roles)), ['บิล', 'สลิป']);
  assert.strictEqual(gs[0].gone, true); assert.strictEqual(gs[1].team, 'บัญชี');
  assert.strictEqual(ctx.expenseGroupId(), EXP_GID);
  assert.strictEqual(ctx.isExpenseGroup(NEW_BILL), false);
});

t('ชีตรุ่นเก่า 3 คอลัมน์ → อ่านได้ ไม่มีหน้าที่ · registerGroup เติมหัวคอลัมน์ใหม่ต่อท้าย + จดสถานะ "อยู่"', () => {
  const made = makeEnv(), ctx = made.ctx;
  const sh = fakeGroupsSheet([['chatId', 'ชื่อกลุ่ม', 'อัปเดตเมื่อ'], [EXP_GID, 'บิลค่าใช้จ่าย 🧾', 'เก่า']]);
  ctx.boardSheetId = () => 'B'; ctx.ssById = () => ({ getSheetByName: () => sh, insertSheet: () => sh });
  restore(ctx, ['listKnownGroups', 'registerGroup']);
  assert.strictEqual(ctx.listKnownGroups()[0].roles.length, 0);
  assert.strictEqual(ctx.isExpenseGroup(EXP_GID), true, 'ยังใช้กติกาชื่อเดิม');
  ctx.registerGroup(EXP_GID); ctx.registerGroup(NEW_PROD);
  assert.deepStrictEqual(sh.data[0], ['chatId', 'ชื่อกลุ่ม', 'อัปเดตเมื่อ', 'หน้าที่', 'ทีม', 'สถานะ', 'หมายเหตุ']);
  assert.strictEqual(sh.data[1][5], 'อยู่'); assert.strictEqual(sh.data[1][1], 'บิลค่าใช้จ่าย 🧾', 'ชื่อเดิมไม่หาย');
  assert.strictEqual(sh.data[2][0], NEW_PROD); assert.strictEqual(sh.data[2][5], 'อยู่');
});

t('event leave → จด "ออกแล้ว" (ไม่ลบแถว) + แจ้งคุณปาล์มทางแชทส่วนตัว · ไม่ตอบในกลุ่ม', () => {
  const { ctx, S, sh } = envWithSheet([
    ['chatId', 'ชื่อกลุ่ม', 'อัปเดตเมื่อ', 'หน้าที่', 'ทีม', 'สถานะ', 'หมายเหตุ'],
    [OTHER_GID, 'กลุ่มคุยเล่น', '', '', '', 'อยู่', '']
  ]);
  ctx.handleEvent({ type: 'leave', source: { type: 'group', groupId: OTHER_GID }, timestamp: 1760000000000 });
  assert.strictEqual(sh.data.length, 2, 'ไม่ลบแถว');
  assert.ok(/^ออกแล้ว \d\d\/\d\d\/\d{4}$/.test(sh.data[1][5]), sh.data[1][5]);
  assert.ok(S.logs.some(l => l[0] === 'ออกจากกลุ่ม' && l[2] === OTHER_GID));
  assert.strictEqual(S.replies.length, 0);
  assert.strictEqual(S.pushes.length, 1); assert.strictEqual(S.pushes[0].to, OWNER);
  assert.ok(/กลุ่มคุยเล่น/.test(JSON.stringify(S.pushes[0])));
});

t('กลุ่มที่เคยออกแล้วมีข้อความเข้ามาอีก → กลับเป็น "อยู่"', () => {
  const made = makeEnv(), ctx = made.ctx;
  const sh = fakeGroupsSheet([['chatId', 'ชื่อกลุ่ม', 'อัปเดตเมื่อ', 'หน้าที่', 'ทีม', 'สถานะ', 'หมายเหตุ'], [OTHER_GID, 'กลุ่มคุยเล่น', '', 'สายรถ', '', 'ออกแล้ว 01/11/2026', '']]);
  ctx.groupSheet_ = () => sh;
  restore(ctx, ['listKnownGroups', 'registerGroup']);
  assert.strictEqual(ctx.isVanGroup(OTHER_GID), false);
  ctx.registerGroup(OTHER_GID);
  assert.strictEqual(sh.data[1][5], 'อยู่'); assert.strictEqual(sh.data[1][3], 'สายรถ', 'หน้าที่ไม่หาย');
});

t('"กลุ่มไหนบ้าง" → บอกหน้าที่/ทีม + แยกกลุ่มที่ออกแล้ว', () => {
  const { ctx } = makeEnv();
  ctx.listKnownGroups = () => [
    { id: PROD_GID, name: 'ฝ่ายผลิตน้ำ', roles: ['ผลิต'], team: 'โรงน้ำ', gone: false },
    { id: OTHER_GID, name: 'กลุ่มเก่า', roles: [], team: '', gone: true }
  ];
  const r = ctx.groupsListText();
  assert.ok(/1\. ฝ่ายผลิตน้ำ — หน้าที่: ผลิต · ทีม: โรงน้ำ/.test(r), r);
  assert.ok(/📤 ออกแล้ว: กลุ่มเก่า/.test(r)); assert.ok(!/2\. กลุ่มเก่า/.test(r));
});

console.log('📒 ทะเบียนกลุ่ม ผ่านเพิ่ม ' + n + ' ข้อ');

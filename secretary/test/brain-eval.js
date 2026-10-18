// 🎓 ข้อสอบสถานการณ์ของคุณเลขา — ทดสอบ "ทั้งเส้นทาง" ตั้งแต่ข้อความไลน์เข้า → โค้ดจริง → สมอง → คำตอบที่ออกไลน์
//
//   node secretary/test/brain-eval.js check-routes        ข้อที่ไม่ใช้สมอง: ตรวจจริงเลย · ข้อที่ใช้สมอง: ตรวจว่าไปถึงสมองจริง (ใช้ใน CI)
//   node secretary/test/brain-eval.js dump <dir>          เขียน <dir>/cases.json = system prompt + ข้อความจริงที่จะส่งให้สมอง (ข้อที่ใช้สมอง)
//   node secretary/test/brain-eval.js grade <answers.json> เอาคำตอบสมอง {id: "ข้อความดิบ"} วิ่งกลับเข้าโค้ดจริง แล้วตรวจตามเกณฑ์
//   ANTHROPIC_API_KEY=… node secretary/test/brain-eval.js live   ถามสมองจริง (รุ่นเดียวกับ MODEL ใน Code.gs) แล้วตรวจ — เสียค่า API
//
//   เพิ่มข้อสอบที่ scenarios.js — ทุกครั้งที่เลขาตอบพลาดในไลน์จริง ให้เพิ่ม 1 ข้อ (ข้อความ anonymize ไม่ใส่ชื่อลูกค้า/ตัวเลขเงินจริง)
const fs = require('fs'), path = require('path');
const H = require('./harness');
const SCEN = require('./scenarios');

const GROUP_IDS = {};
function gid(name) {
  if (!GROUP_IDS[name]) GROUP_IDS[name] = 'C' + require('crypto').createHash('md5').update(name).digest('hex') + '0';
  return GROUP_IDS[name];
}

function runScenario(sc, brainAnswer) {
  const env = H.makeEnv(Object.assign({ ai: () => (brainAnswer == null ? '' : brainAnswer) }, sc.env || {}));
  const { ctx, S } = env;
  const groups = ctx.listKnownGroups();
  const extra = Object.keys(SCEN.GROUPS).map(n => ({ id: gid(n), name: n }));
  ctx.listKnownGroups = () => groups.concat(extra);
  ctx.listStaff = () => SCEN.STAFF;
  const hist = [];
  (sc.history || []).forEach(h => { hist.push({ role: 'user', content: h[0] }); hist.push({ role: 'assistant', content: h[1] }); });
  ctx.memGet = () => hist.slice();
  const uid = sc.who === 'owner' ? H.OWNER : ('Ustaff' + (sc.who || 'A'));
  const source = sc.where && sc.where !== 'dm'
    ? { type: 'group', groupId: sc.where === 'บิลค่าใช้จ่าย 🧾' ? H.EXP_GID : gid(sc.where), userId: uid }
    : { type: 'user', userId: uid };
  const msg = sc.msg || { type: 'text', text: sc.text };
  const event = { type: 'message', replyToken: 'rt-' + sc.id, timestamp: Date.now(), source,
                  message: Object.assign({ id: 'M-' + sc.id }, msg, sc.quoted ? { quotedMessageId: sc.quoted } : {}) };
  let crash = '';
  try { ctx.handleEvent(event); } catch (e) { crash = String(e && e.stack || e); }
  const chat = S.prompts.filter(b => b.system);     // คำขอสมองแชท (ไม่นับ ping ของเช็คระบบ)
  const raw = brainAnswer || '';
  const parsed = raw ? ctx.parseBlocks(raw) : { reply: '', all: {} };
  return {
    crash, brainCalled: chat.length > 0, request: chat[0] || null,
    raw, blocks: parsed.all || {}, runs: ((parsed.all || {}).RUN || []).map(b => String(b.cmd || '')),
    reply: H.replyText(S), pushes: S.pushes.map(p => ({ to: p.to, text: p.messages[0].text })),
    finance: H.finCalls(S), logs: S.logs
  };
}

// ── ตรวจตามเกณฑ์ (expect ใน scenarios.js) → คืนรายการที่ไม่ผ่าน ──
function check(sc, r, phase) {
  const e = sc.expect || {}, bad = [];
  if (r.crash) bad.push('โค้ดพัง: ' + r.crash.split('\n')[0]);
  if (e.brain === false && r.brainCalled) bad.push('ไม่ควรไปถึงสมอง แต่ไป');
  if (e.brain === true && !r.brainCalled) bad.push('ควรให้สมองคิด แต่โค้ดตอบเอง/เงียบ');
  if (phase === 'route' && e.brain) return bad;     // ข้อที่ใช้สมอง: รอบนี้ตรวจแค่ว่าไปถึงสมอง
  const re = x => (x instanceof RegExp ? x : new RegExp(x));
  (e.reply || []).forEach(x => { if (!re(x).test(r.reply)) bad.push('คำตอบควรมี ' + x); });
  (e.replyNot || []).forEach(x => { if (re(x).test(r.reply)) bad.push('คำตอบห้ามมี ' + x); });
  if (e.silent && r.reply) bad.push('ควรเงียบ แต่ตอบ: ' + r.reply.slice(0, 80));
  if (e.run) [].concat(e.run).forEach(c => { if (r.runs.indexOf(c) === -1) bad.push('ควรเรียกคำสั่ง ' + c + ' (ได้: ' + (r.runs.join(',') || '-') + ')'); });
  (e.noRun || []).forEach(c => { if (r.runs.indexOf(c) !== -1) bad.push('ห้ามเรียกคำสั่ง ' + c); });
  if (e.anyBlock && !e.anyBlock.some(b => r.blocks[b])) bad.push('ควรมีบล็อก ' + e.anyBlock.join('/'));
  (e.noBlock || []).forEach(b => { if (r.blocks[b]) bad.push('ห้ามมีบล็อก ' + b); });
  if (e.finance) { const a = r.finance.map(f => f.action); [].concat(e.finance).forEach(x => { if (a.indexOf(x) === -1) bad.push('ควรเรียกแอปบัญชี ' + x); }); }
  if (e.noFinance && r.finance.length) bad.push('ห้ามเรียกแอปบัญชี');
  if (e.fn) { const m = e.fn(r); if (m) bad.push(m); }
  return bad;
}

function report(rows) {
  let fail = 0;
  rows.forEach(x => {
    if (x.bad.length) fail++;
    console.log((x.bad.length ? '❌ ' : '✅ ') + x.sc.id + ' — ' + x.sc.title + (x.bad.length ? '\n     · ' + x.bad.join('\n     · ') : ''));
  });
  console.log('\n' + (rows.length - fail) + '/' + rows.length + ' ผ่าน');
  return fail;
}

async function main() {
  const mode = process.argv[2] || 'check-routes';
  const list = SCEN.SCENARIOS;
  if (mode === 'check-routes') {
    const rows = list.map(sc => ({ sc, bad: check(sc, runScenario(sc, sc.expect && sc.expect.brain ? 'โอเคค่ะ' : ''), 'route') }));
    process.exit(report(rows) ? 1 : 0);
  }
  const brainList = list.filter(sc => sc.expect && sc.expect.brain);
  if (mode === 'dump' || mode === 'live') {
    const cases = brainList.map(sc => { const r = runScenario(sc, 'โอเคค่ะ'); return { id: sc.id, title: sc.title, request: r.request }; });
    if (mode === 'dump') {
      const dir = process.argv[3] || '.';
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'cases.json'), JSON.stringify(cases, null, 1));
      console.log('เขียน ' + cases.length + ' ข้อ → ' + path.join(dir, 'cases.json'));
      return;
    }
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) { console.error('ต้องตั้ง ANTHROPIC_API_KEY'); process.exit(2); }
    const answers = {};
    for (const c of cases) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(c.request)
      });
      const d = await res.json();
      answers[c.id] = ((d.content || []).find(b => b.type === 'text') || {}).text || ('(HTTP ' + res.status + ') ' + JSON.stringify(d.error || ''));
    }
    fs.writeFileSync('brain-answers.json', JSON.stringify(answers, null, 1));
    process.exit(report(brainList.map(sc => ({ sc, bad: check(sc, runScenario(sc, answers[sc.id] || ''), 'full') }))) ? 1 : 0);
  }
  if (mode === 'grade') {
    const answers = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    const rows = brainList.filter(sc => sc.id in answers).map(sc => {
      const r = runScenario(sc, answers[sc.id]);
      return { sc, r, bad: check(sc, r, 'full') };
    });
    const fail = report(rows);
    if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(rows.map(x => ({ id: x.sc.id, title: x.sc.title, bad: x.bad, reply: x.r.reply })), null, 1));
    process.exit(fail ? 1 : 0);
  }
  console.error('ไม่รู้จักโหมด ' + mode); process.exit(2);
}
main();

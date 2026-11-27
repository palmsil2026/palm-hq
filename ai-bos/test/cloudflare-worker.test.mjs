import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Log, LogLevel, Miniflare, Response } from 'miniflare';

const businessDate = '2026-11-24';
const scheduledTime = Date.UTC(2026, 10, 24, 14, 30);
const scheduledAt = new Date(scheduledTime).toISOString();
const fixture = JSON.parse(readFileSync(new URL('./fixtures/lakon-cash.json', import.meta.url), 'utf8'));
const migration = readFileSync(new URL('../worker/migrations/0001_finance_runs.sql', import.meta.url), 'utf8');

async function startWorker(t) {
  const source = {
    requests: [],
    respond: () => Response.json(fixture),
  };
  const worker = new Miniflare({
    cf: false,
    log: new Log(LogLevel.NONE),
    modules: true,
    modulesRoot: fileURLToPath(new URL('../', import.meta.url)),
    scriptPath: fileURLToPath(new URL('../worker/index.mjs', import.meta.url)),
    modulesRules: [{ type: 'ESModule', include: ['**/*.mjs'] }],
    compatibilityDate: '2026-07-30',
    d1Databases: { AI_BOS_DB: 'finance-worker-test' },
    serviceBindings: {
      LAKON_FINANCE_SOURCE(request) {
        source.requests.push({ method: request.method, url: request.url });
        return source.respond();
      },
    },
    unsafeTriggerHandlers: true,
  });
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('AI_BOS_DB');
  await db.prepare(migration).run();
  return { worker, db, source };
}

async function trigger(worker, time = scheduledTime) {
  const url = new URL('http://worker.test/cdn-cgi/handler/scheduled');
  url.search = new URLSearchParams({ time: String(time), cron: '30 14 * * *', format: 'json' });
  const response = await worker.dispatchFetch(url);
  const { outcome } = await response.json();
  return { status: response.status, outcome };
}

async function readRuns(db) {
  const { results } = await db.prepare('SELECT * FROM finance_runs ORDER BY scheduled_at').all();
  return results;
}

function assertChecked(row) {
  const { findings_json: findingsJson, ...summary } = row;
  assert.deepEqual(summary, {
    scheduled_at: scheduledAt,
    business_date: businessDate,
    status: 'checked',
    cash_payments_checked: 4,
    remits_checked: 1,
    failure_code: null,
  });
  const findings = JSON.parse(findingsJson);
  assert.deepEqual(findings.map(({ type, sourceId }) => [type, sourceId]), [
    ['unmatched_cash_payment', 'PAY-101'],
    ['unmatched_cash_payment', 'PAY-102'],
    ['counted_remit_variance', 'REM-100'],
  ]);
  assert.equal(findings[2].varianceSatang, -5000);
}

test('Worker ตรวจเงินสดตามรอบ เก็บผลหนึ่งแถวเมื่อรันซ้ำ และปิดผลตรวจจาก HTTP', async t => {
  const { worker, db, source } = await startWorker(t);

  assert.deepEqual(await trigger(worker), { status: 200, outcome: 'ok' });
  assert.deepEqual(source.requests, [{
    method: 'GET',
    url: 'https://lakon-finance-source/snapshot?businessDate=2026-11-24',
  }]);
  const runs = await readRuns(db);
  assert.equal(runs.length, 1);
  assertChecked(runs[0]);

  assert.deepEqual(await trigger(worker), { status: 200, outcome: 'ok' });
  source.respond = () => new Response('source offline', { status: 503 });
  assert.deepEqual(await trigger(worker), { status: 200, outcome: 'ok' });
  assert.deepEqual(await readRuns(db), runs);

  const requestCount = source.requests.length;
  for (const path of ['/', '/findings', '/snapshot?businessDate=2026-11-24']) {
    const response = await worker.dispatchFetch(new URL(path, 'http://worker.test'));
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /PAY-101|REM-100|findings_json/);
  }
  assert.equal(source.requests.length, requestCount);
  assert.deepEqual(await readRuns(db), runs);
});

test('Worker บันทึกรหัสเมื่ออ่านไม่ได้หรือข้อมูลผิด แล้วแทนผลล้มเหลวเมื่อรันซ้ำสำเร็จ', async t => {
  const { worker, db, source } = await startWorker(t);

  source.respond = () => new Response('source offline', { status: 503 });
  assert.equal((await trigger(worker)).status, 500);
  const failedRun = {
    scheduled_at: scheduledAt,
    business_date: businessDate,
    status: 'check_failed',
    cash_payments_checked: null,
    remits_checked: null,
    findings_json: null,
    failure_code: 'source_unavailable',
  };
  assert.deepEqual(await readRuns(db), [failedRun]);

  source.respond = () => Response.json({ ...fixture, throughDate: '2026-11-23' });
  assert.equal((await trigger(worker)).status, 500);
  assert.deepEqual(await readRuns(db), [{ ...failedRun, failure_code: 'invalid_snapshot' }]);

  source.respond = () => Response.json(fixture);
  assert.deepEqual(await trigger(worker), { status: 200, outcome: 'ok' });
  const runs = await readRuns(db);
  assert.equal(runs.length, 1);
  assertChecked(runs[0]);
});

test('Worker ใช้วันที่กรุงเทพฯ เมื่อเวลาที่กำหนดอยู่คนละวันกับ UTC', async t => {
  const { worker, db, source } = await startWorker(t);
  const afterBangkokMidnight = Date.UTC(2026, 10, 24, 17, 5);

  assert.deepEqual(await trigger(worker, afterBangkokMidnight), { status: 200, outcome: 'ok' });
  assert.deepEqual(source.requests, [{
    method: 'GET',
    url: 'https://lakon-finance-source/snapshot?businessDate=2026-11-25',
  }]);
  const runs = await readRuns(db);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].scheduled_at, '2026-11-24T17:05:00.000Z');
  assert.equal(runs[0].business_date, '2026-11-25');
});

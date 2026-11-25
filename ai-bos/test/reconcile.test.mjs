import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { reconcileLakonCash } from '../finance/reconcile.mjs';

const businessDate = '2026-11-24';
const fixturePath = fileURLToPath(new URL('./fixtures/lakon-cash.json', import.meta.url));
const runnerPath = fileURLToPath(new URL('../finance/run-shadow.mjs', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

test('จับคู่ใบนำส่งข้ามวัน แยกรายการที่ถูกถอนออก และคืนส่วนต่างที่นับจริง', () => {
  const result = reconcileLakonCash(fixture, businessDate);
  assert.equal(result.status, 'checked');
  assert.equal(result.cashPaymentsChecked, 4);
  assert.equal(result.remitsChecked, 1);
  assert.deepEqual(result.findings.map(({ type, sourceId }) => [type, sourceId]), [
    ['unmatched_cash_payment', 'PAY-101'],
    ['unmatched_cash_payment', 'PAY-102'],
    ['counted_remit_variance', 'REM-100'],
  ]);
  assert.equal(result.findings[2].varianceSatang, -5000);
  const nextDay = reconcileLakonCash(fixture, '2026-11-25');
  assert.equal(nextDay.findings[0].id, result.findings[2].id);
  assert.equal(result.findings[0].amountSatang, 35000);
  assert.deepEqual(result.findings[1].historicalRemitIds, ['REM-100']);
});

test('เมื่อส่งใหม่ ลิงก์เก่าของใบที่นับแล้วไม่ทำให้ใบนำส่งใหม่กลายเป็นรายการขัดกัน', () => {
  const snapshot = structuredClone(fixture);
  snapshot.payments[2] = { ...snapshot.payments[2], status: 'นำส่งแล้ว', remitId: 'REM-NEW' };
  snapshot.remits.push({ id: 'REM-NEW', date: '2026-11-25', status: 'รอนับ', paymentIds: ['PAY-102'], varianceSatang: null });
  assert.ok(!reconcileLakonCash(snapshot, businessDate).findings.some(row => row.sourceId === 'PAY-102'));
});

test('รันข้อมูลชุดเดิมสลับลำดับได้ผลและรหัสเดิม', () => {
  const reversed = { ...fixture, payments: [...fixture.payments].reverse(), remits: [...fixture.remits].reverse() };
  assert.deepEqual(reconcileLakonCash(reversed, businessDate), reconcileLakonCash(fixture, businessDate));
});

test('รายการรอนับและยกเลิกไม่สร้างส่วนต่างที่ยังไม่ยืนยัน', () => {
  const snapshot = structuredClone(fixture);
  snapshot.payments[2].remitId = 'REM-101';
  snapshot.remits[0] = { ...snapshot.remits[0], status: 'รอนับ', paymentIds: ['PAY-100'], varianceSatang: null };
  snapshot.remits.push({ id: 'REM-101', date: businessDate, status: 'ยกเลิก', paymentIds: ['PAY-102'], varianceSatang: -200 });
  const result = reconcileLakonCash(snapshot, businessDate);
  assert.deepEqual(result.findings.map(({ sourceId }) => sourceId), ['PAY-101', 'PAY-102']);
});

test('ลิงก์สองทางขัดกันและใบนำส่งที่หาไม่พบต้องตรวจเพิ่มเติม', () => {
  const snapshot = structuredClone(fixture);
  snapshot.payments[0].remitId = 'REM-MISSING';
  snapshot.remits[0].status = 'รอนับ';
  snapshot.remits[0].varianceSatang = null;
  const findings = reconcileLakonCash(snapshot, businessDate).findings;
  assert.deepEqual(findings.map(({ type, sourceId }) => [type, sourceId]), [
    ['remit_link_needs_review', 'PAY-100'],
    ['remit_link_needs_review', 'PAY-102'],
    ['unmatched_cash_payment', 'PAY-101'],
  ]);
  assert.deepEqual(findings[0].relatedRemitIds, ['REM-100', 'REM-MISSING']);
});

test('กลับรายการได้ทั้งสองเครื่องหมาย และรักษารายการคืนเงินจริงไว้', () => {
  const original = { ...fixture.payments[3], amountSatang: -9900 };
  const reversal = { ...fixture.payments[4], amountSatang: 9900 };
  const refund = { ...original, id: 'PAY-REFUND', referenceId: 'RETURN-1', status: 'คืนเงินลูกค้า' };
  const snapshot = { ...fixture, payments: [original, reversal, refund], remits: [] };
  const originalDay = reconcileLakonCash(snapshot, businessDate);
  assert.deepEqual(originalDay.findings.map(({ type, sourceId, amountSatang }) => [type, sourceId, amountSatang]), [
    ['unmatched_cash_refund', 'PAY-REFUND', -9900],
  ]);
  assert.deepEqual(reconcileLakonCash(snapshot, reversal.date).findings, []);
});

test('กลับรายการที่จับคู่ไม่ได้ถูกแยกออกให้คนตรวจ', () => {
  const snapshot = { ...fixture, payments: [fixture.payments[3]], remits: [] };
  const result = reconcileLakonCash(snapshot, businessDate);
  assert.equal(result.findings[0].type, 'reversal_needs_review');
});

test('ใบนำส่งที่ขึ้นว่ารับแล้วแต่ไม่มีส่วนต่างให้ตรวจเพิ่ม', () => {
  const snapshot = structuredClone(fixture);
  snapshot.remits[0].varianceSatang = null;
  assert.ok(reconcileLakonCash(snapshot, businessDate).findings.some(row => row.type === 'remit_count_needs_review'));
});

test('แยกตรวจล้มเหลวจากตรวจสำเร็จแล้วไม่มีสิ่งผิดปกติ', () => {
  for (const snapshot of [
    { ...fixture, company: 'pk' },
    { ...fixture, throughDate: '2026-11-23' },
    { ...fixture, payments: [fixture.payments[0], fixture.payments[0]] },
    { ...fixture, remits: undefined },
  ]) assert.throws(() => reconcileLakonCash(snapshot, businessDate));
  const result = reconcileLakonCash({ ...fixture, payments: [], remits: [] }, businessDate);
  assert.equal(result.status, 'checked');
  assert.deepEqual(result.findings, []);
});

test('CLI ส่งผลตรวจที่อ่านได้ และคืนรหัสล้มเหลวเมื่อไม่มีข้อมูลครอบคลุม', () => {
  const run = date => spawnSync(process.execPath, [runnerPath, date, fixturePath], { encoding: 'utf8' });
  const success = run(businessDate);
  assert.equal(success.status, 0, success.stderr);
  assert.deepEqual(JSON.parse(success.stdout), reconcileLakonCash(fixture, businessDate));
  const failure = run('2026-11-26');
  assert.equal(failure.status, 1);
  assert.equal(JSON.parse(failure.stderr).status, 'check_failed');
  assert.equal(failure.stdout, '');
});

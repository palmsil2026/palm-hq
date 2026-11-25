import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileLakonCash } from '../finance/reconcile.mjs';
import { normalizeSheetsExport } from '../finance/sheets-export.mjs';

const serialDate = (Date.UTC(2026, 10, 24) - Date.UTC(1899, 11, 30)) / 86_400_000;
const exportData = {
  company: 'lakon',
  throughDate: '2026-11-25',
  valueRanges: [
    {
      range: 'Payments!A1:T1000',
      values: [
        ['Payment_ID', 'Timestamp', 'วันที่', 'Order_ID', 'ช่องทาง', 'Customer_ID', 'ลูกค้า', 'ยอด', 'วิธี',
          'ผู้รับเงิน', 'สถานะเงิน', 'สลิป', 'Remit_ID', 'ผู้ยืนยัน', 'เวลายืนยัน', 'หมายเหตุ', 'อ้างอิง', 'ผู้บันทึก', 'แอป', 'บัญชี'],
        ['P-1', '', serialDate + 0.75, '', '', '', '', 123.45, 'เงินสด', '', 'นำส่งแล้ว', '', 'R-1'],
        ['P-2', '', '2026-11-24', '', '', '', '', 4.01, 'เงินสด', '', 'อยู่กับพนักงาน'],
        [],
      ],
    },
    {
      range: "'CashRemits'!A1:M1000",
      values: [
        ['Remit_ID', 'Timestamp', 'วันที่', 'พนักงาน', 'ยอดที่แจ้ง', 'จำนวนรายการ', 'Payment_IDs', 'สถานะ',
          'ยอดที่นับได้', 'ส่วนต่าง', 'ผู้รับ', 'เวลารับ', 'หมายเหตุ'],
        ['R-1', '', serialDate + 1, '', 123.45, 1, 'P-1', 'รับแล้ว-ยอดไม่ตรง', 123.10, -0.35],
        ['R-2', '', '2026-11-24', '', 50, 0, '', 'รอนับ'],
      ],
    },
  ],
};

test('แปลงหัวตารางจริง รูปแบบวันที่ Sheets และยอดเป็นสตางค์ก่อนเทียบ', () => {
  const snapshot = normalizeSheetsExport(exportData);
  assert.equal(snapshot.payments[0].amountSatang, 12345);
  assert.equal(snapshot.payments[0].date, '2026-11-24');
  assert.equal(snapshot.remits[0].date, '2026-11-25');
  assert.equal(snapshot.remits[1].varianceSatang, null);
  const findings = reconcileLakonCash(snapshot, '2026-11-24').findings;
  assert.deepEqual(findings.map(row => [row.sourceId, row.varianceSatang ?? row.amountSatang]), [
    ['P-2', 401], ['R-1', -35],
  ]);
});

test('ข้อมูลส่งออกที่ขาดแท็บหรือมีหัวคอลัมน์เปลี่ยนจะหยุดตรวจ', () => {
  assert.throws(() => normalizeSheetsExport({ ...exportData, valueRanges: exportData.valueRanges.slice(0, 1) }), /CashRemits/);
  const malformed = structuredClone(exportData);
  malformed.valueRanges[0].values[0][7] = 'จำนวนเงิน';
  assert.throws(() => normalizeSheetsExport(malformed), /Payments/);
});

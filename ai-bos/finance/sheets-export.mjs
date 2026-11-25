const SHEETS_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

function dateCell(value) {
  // เลข serial ของ Sheets เป็นวันตามปฏิทินของ workbook อยู่แล้ว
  if (typeof value === 'number' && value >= 0 && value < 3_000_000) {
    return new Date(SHEETS_EPOCH + Math.floor(value) * DAY_MS).toISOString().slice(0, 10);
  }
  return String(value ?? '').trim();
}

function amountCell(value) {
  const text = String(value ?? '').trim();
  const parts = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!parts) return NaN;
  const [, sign, units, fraction = ''] = parts;
  const amount = Number(units + fraction.padEnd(2, '0'));
  return sign ? -amount : amount;
}

function textCell(value) {
  return String(value ?? '').trim();
}

function readTab(valueRanges, tab, headers, convert) {
  const matches = valueRanges.filter(table => table?.range?.split('!')[0].replace(/^'|'$/g, '') === tab);
  const table = matches[0]?.values;
  if (matches.length !== 1 || !Array.isArray(table?.[0])) throw new Error(`ไม่พบหัวตาราง ${tab} ในไฟล์ส่งออก`);

  const columns = table[0].map(textCell);
  const indexes = headers.map(header => {
    const index = columns.indexOf(header);
    if (index === -1 || index !== columns.lastIndexOf(header)) throw new Error(`หัวตาราง ${tab} ไม่ตรงกับต้นทาง`);
    return index;
  });
  return table.slice(1).filter(row => {
    if (!Array.isArray(row)) throw new Error(`รูปแบบแถว ${tab} ไม่ถูกต้อง`);
    return row.some(value => textCell(value) !== '');
  }).map(row => convert(...indexes.map(index => row[index])));
}

export function normalizeSheetsExport({ company, throughDate, valueRanges }) {
  if (!Array.isArray(valueRanges)) throw new Error('ไม่พบข้อมูลส่งออกจาก Sheets');
  return {
    company,
    throughDate,
    payments: readTab(valueRanges, 'Payments',
      ['Payment_ID', 'วันที่', 'วิธี', 'ยอด', 'สถานะเงิน', 'Remit_ID', 'อ้างอิง'],
      (id, date, method, amount, status, remitId, referenceId) => ({
        id: textCell(id), date: dateCell(date), method: textCell(method), amountSatang: amountCell(amount),
        status: textCell(status), remitId: textCell(remitId) || null, referenceId: textCell(referenceId) || null,
      })),
    remits: readTab(valueRanges, 'CashRemits',
      ['Remit_ID', 'วันที่', 'สถานะ', 'Payment_IDs', 'ส่วนต่าง'],
      (id, date, status, paymentIds, variance) => ({
        id: textCell(id), date: dateCell(date), status: textCell(status),
        paymentIds: textCell(paymentIds).split(',').map(textCell).filter(Boolean),
        varianceSatang: textCell(variance) === '' ? null : amountCell(variance),
      })),
  };
}

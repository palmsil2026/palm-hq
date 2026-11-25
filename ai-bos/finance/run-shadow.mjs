import { readFile } from 'node:fs/promises';
import { reconcileLakonCash } from './reconcile.mjs';
import { normalizeSheetsExport } from './sheets-export.mjs';

const [businessDate, inputPath] = process.argv.slice(2);

try {
  if (!businessDate || !inputPath) throw new Error('วิธีใช้: node ai-bos/finance/run-shadow.mjs YYYY-MM-DD snapshot.json');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const snapshot = input?.valueRanges ? normalizeSheetsExport(input) : input;
  console.log(JSON.stringify(reconcileLakonCash(snapshot, businessDate), null, 2));
} catch (error) {
  const reason = error instanceof SyntaxError ? 'ไฟล์ snapshot ไม่ใช่ JSON ที่ถูกต้อง'
    : error.code ? 'เปิดไฟล์ snapshot ไม่ได้' : error.message;
  console.error(JSON.stringify({ status: 'check_failed', reason }));
  process.exitCode = 1;
}

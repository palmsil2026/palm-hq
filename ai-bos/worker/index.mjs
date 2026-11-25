import { reconcileLakonCash } from '../finance/reconcile.mjs';
import { normalizeSheetsExport } from '../finance/sheets-export.mjs';

const bangkokDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const saveRunSql = `
  INSERT INTO finance_runs (
    scheduled_at, business_date, status, cash_payments_checked,
    remits_checked, findings_json, failure_code
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (scheduled_at) DO UPDATE SET
    status = excluded.status,
    cash_payments_checked = excluded.cash_payments_checked,
    remits_checked = excluded.remits_checked,
    findings_json = excluded.findings_json,
    failure_code = excluded.failure_code
  WHERE finance_runs.status = 'check_failed'
`;

async function checkFinance(source, businessDate) {
  let response;
  try {
    const url = new URL('https://lakon-finance-source/snapshot');
    url.searchParams.set('businessDate', businessDate);
    response = await source.fetch(new Request(url, { signal: AbortSignal.timeout(12_000) }));
    if (!response.ok) return { failureCode: 'source_unavailable' };
  } catch {
    return { failureCode: 'source_unavailable' };
  }

  try {
    const input = await response.json();
    const snapshot = input?.valueRanges ? normalizeSheetsExport(input) : input;
    return { result: reconcileLakonCash(snapshot, businessDate) };
  } catch {
    return { failureCode: 'invalid_snapshot' };
  }
}

async function runScheduled(scheduledTime, env) {
  const scheduledDate = new Date(scheduledTime);
  const scheduledAt = scheduledDate.toISOString();
  const parts = Object.fromEntries(bangkokDate.formatToParts(scheduledDate).map(({ type, value }) => [type, value]));
  const businessDate = `${parts.year}-${parts.month}-${parts.day}`;

  const { result, failureCode } = await checkFinance(env.LAKON_FINANCE_SOURCE, businessDate);
  const saved = await env.AI_BOS_DB.prepare(saveRunSql).bind(
    scheduledAt,
    businessDate,
    result ? 'checked' : 'check_failed',
    result?.cashPaymentsChecked ?? null,
    result?.remitsChecked ?? null,
    result ? JSON.stringify(result.findings) : null,
    failureCode ?? null,
  ).run();

  if (failureCode && saved.meta.changes > 0) throw new Error(failureCode);
}

export default {
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller.scheduledTime, env));
  },
  fetch() {
    return new Response(null, { status: 404 });
  },
};

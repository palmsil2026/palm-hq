// รับ snapshot ปัจจุบันของ LAKON ที่รวมใบนำส่งและรายการกลับรายการซึ่งเชื่อมข้ามวัน
const CASH = 'เงินสด';
const REVERSED = ' (กลับรายการแล้ว)';
const REMIT_STATUSES = new Set(['รอนับ', 'รับแล้ว', 'รับแล้ว-ยอดไม่ตรง', 'ยกเลิก']);

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

function isId(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function indexRows(rows, validRow, label) {
  if (!Array.isArray(rows)) throw new Error(`ไม่มีชุดข้อมูล ${label}`);

  const byId = new Map();
  for (const row of rows) {
    if (!row || !isId(row.id) || !isDate(row.date) || !validRow(row)) {
      throw new Error(`รูปแบบข้อมูล ${label} ไม่ครบหรือไม่ถูกต้อง`);
    }
    if (byId.has(row.id)) throw new Error(`พบรหัสซ้ำใน ${label}`);
    byId.set(row.id, row);
  }
  return byId;
}

function validPayment(row) {
  return Number.isSafeInteger(row.amountSatang)
    && typeof row.method === 'string' && row.method.trim() !== ''
    && typeof row.status === 'string'
    && (row.remitId === null || isId(row.remitId))
    && (row.referenceId === null || isId(row.referenceId));
}

function validRemit(row) {
  return REMIT_STATUSES.has(row.status)
    && Array.isArray(row.paymentIds) && row.paymentIds.every(isId)
    && (row.varianceSatang === null || Number.isSafeInteger(row.varianceSatang));
}

export function reconcileLakonCash(snapshot, businessDate) {
  if (!isDate(businessDate)) throw new Error('วันที่ต้องเป็น YYYY-MM-DD');
  if (snapshot?.company !== 'lakon') throw new Error('ชุดข้อมูลต้องเป็นของ LAKON');
  if (!isDate(snapshot.throughDate) || snapshot.throughDate < businessDate) {
    throw new Error('ชุดข้อมูลยังไม่ครอบคลุมวันที่ต้องการตรวจ');
  }

  const payments = indexRows(snapshot.payments, validPayment, 'Payments');
  const remits = indexRows(snapshot.remits, validRemit, 'CashRemits');
  const remitsByPayment = new Map();
  const reversalsByPayment = new Map();
  const findings = [];
  const remitsToReview = new Set();
  let cashPaymentsChecked = 0;

  for (const remit of remits.values()) {
    if (remit.date > snapshot.throughDate || remit.status === 'ยกเลิก') continue;
    if (remit.date === businessDate) remitsToReview.add(remit.id);
    for (const paymentId of new Set(remit.paymentIds)) {
      const linked = remitsByPayment.get(paymentId) ?? [];
      linked.push(remit.id);
      remitsByPayment.set(paymentId, linked);
    }
  }

  for (const payment of payments.values()) {
    if (payment.status !== 'กลับรายการ' || !payment.referenceId || payment.date > snapshot.throughDate) continue;
    const matches = reversalsByPayment.get(payment.referenceId) ?? [];
    matches.push(payment);
    reversalsByPayment.set(payment.referenceId, matches);
  }

  function addFinding(type, source, id, evidence) {
    const sourceDate = source === 'CashRemits' ? remits.get(id).date : businessDate;
    findings.push({
      id: JSON.stringify(['lakon', 'finance', sourceDate, type, source, id]),
      type,
      source,
      sourceId: id,
      sourceDate,
      ...evidence,
    });
  }

  function isReversalOf(original, reversal) {
    return original?.status.endsWith(REVERSED)
      && original.date <= reversal.date && original.method === reversal.method
      && original.amountSatang !== 0 && reversal.amountSatang === -original.amountSatang;
  }

  for (const payment of payments.values()) {
    if (payment.date !== businessDate || payment.method !== CASH) continue;
    cashPaymentsChecked += 1;
    const evidence = { amountSatang: payment.amountSatang };
    if (payment.status === 'กลับรายการ' || payment.status.endsWith(REVERSED) || reversalsByPayment.has(payment.id)) {
      const original = payment.status === 'กลับรายการ' ? payments.get(payment.referenceId) : payment;
      const reversals = reversalsByPayment.get(original?.id) ?? [];
      if (reversals.length !== 1 || !isReversalOf(original, reversals[0])) {
        addFinding('reversal_needs_review', 'Payments', payment.id, {
          ...evidence, relatedPaymentIds: original && original !== payment ? [original.id] : reversals.map(row => row.id).sort(),
        });
      }
      continue;
    }

    const listedRemitIds = remitsByPayment.get(payment.id) ?? [];
    const claimed = remits.get(payment.remitId);
    const missingClaim = payment.remitId && (!claimed || claimed.date > snapshot.throughDate);
    const activeClaim = claimed && !missingClaim && claimed.status !== 'ยกเลิก';
    const backInHand = payment.status === 'อยู่กับพนักงาน' && !activeClaim
      && !missingClaim && listedRemitIds.every(id => remits.get(id).status !== 'รอนับ');
    if (activeClaim) remitsToReview.add(claimed.id);

    const inconsistentLinks = activeClaim
      ? !listedRemitIds.includes(claimed.id)
        || listedRemitIds.some(id => id !== claimed.id && remits.get(id).status === 'รอนับ')
      : !backInHand && (listedRemitIds.length > 0 || ['นำส่งแล้ว', 'เข้าบริษัทแล้ว'].includes(payment.status));
    if (missingClaim || inconsistentLinks) {
      const relatedRemitIds = new Set(listedRemitIds);
      if (payment.remitId) relatedRemitIds.add(payment.remitId);
      addFinding('remit_link_needs_review', 'Payments', payment.id, {
        ...evidence, relatedRemitIds: [...relatedRemitIds].sort(),
      });
    } else if (!activeClaim && payment.amountSatang !== 0) {
      addFinding(payment.amountSatang > 0 ? 'unmatched_cash_payment' : 'unmatched_cash_refund', 'Payments', payment.id, {
        ...evidence, ...(listedRemitIds.length ? { historicalRemitIds: [...listedRemitIds].sort() } : {}),
      });
    }
  }

  for (const id of remitsToReview) {
    const remit = remits.get(id);
    if (remit.status === 'รอนับ') continue;
    if (remit.varianceSatang === null) {
      addFinding('remit_count_needs_review', 'CashRemits', id, {});
    } else if (remit.varianceSatang !== 0) {
      addFinding('counted_remit_variance', 'CashRemits', id, { varianceSatang: remit.varianceSatang });
    }
  }

  findings.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return {
    company: 'lakon',
    businessDate,
    throughDate: snapshot.throughDate,
    status: 'checked',
    cashPaymentsChecked,
    remitsChecked: remitsToReview.size,
    findings,
  };
}

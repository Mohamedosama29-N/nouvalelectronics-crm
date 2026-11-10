// 🔗 ربط التذاكر بقطع الغيار والمخزون
//
// قبل كده: القطعة كانت بتتضاف على التذكرة كسطر، والمخزون مبيتخصمش غير لو اتعملت فاتورة للتذكرة.
// يعني تذاكر الضمان (مفيش فاتورة) كانت بتستهلك قطع من غير ما المخزون ينقص.
//
// دلوقتي (في transaction واحدة):
//   - إضافة قطعة من المخزون للتذكرة ← بتتخصم من المخزن اللي اتاخدت منه فورًا، وبتتعلّم stockDeducted.
//   - شيل القطعة من التذكرة ← بترجع للمخزن نفسه.
//   - فاتورة التذكرة في نقطة البيع ← القطع المتعلّمة stockDeducted بتتحسب سعر بس من غير خصم تاني.
//   - القطع القديمة (من غير العلامة) بتفضل زي ما هي: بتتخصم مع الفاتورة.
import { arrayUnion, collection, doc, getDocs, limit, query, runTransaction, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { TICKET_TERMINAL_STATUSES } from '../constants/tickets';

const nowIso = () => new Date().toISOString();
const money = (p) => (Number(p.price) || 0) * (Number(p.quantity) || 1);

/**
 * يضيف قطعة للتذكرة ويخصمها من المخزون لو مربوطة بصنف (part.id = معرّف صنف المخزون).
 * بيرجّع { added, deducted, ticket } — ticket فيه spareParts/totalCost/remaining/history الجديدة.
 */
export async function addPartToTicket(ticketId, part, { by = '', skipIfExists = false, source = '' } = {}) {
  const qty = Math.max(1, Number(part.quantity) || 1);
  return runTransaction(db, async (tx) => {
    const tRef = doc(db, 'tickets', ticketId);
    const tSnap = await tx.get(tRef);
    if (!tSnap.exists()) throw new Error('التذكرة مش موجودة');
    const cur = tSnap.data();
    if (skipIfExists && part.id && (cur.spareParts || []).some((p) => p.id === part.id)) return { added: false, deducted: false, ticket: cur };

    let deducted = false;
    let warehouseId = null;
    let name = part.name;
    if (part.id) {
      const iRef = doc(db, 'inventory', part.id);
      const iSnap = await tx.get(iRef);
      if (iSnap.exists() && !iSnap.data().isDeleted) {
        const inv = iSnap.data();
        const have = Number(inv.quantity) || 0;
        name = name || inv.name;
        if (have < qty) {
          const e = new Error(`«${name}» مش متاحة بالكمية دي في المخزن. اطلبها من «طلب قطع غيار» جوه التذكرة.`);
          e.code = 'insufficient-stock';
          throw e;
        }
        tx.update(iRef, { quantity: have - qty, updatedAt: serverTimestamp() });
        deducted = true;
        warehouseId = inv.warehouseId || 'main';
      }
    }

    const entry = {
      ...part,
      name,
      quantity: qty,
      price: Number(part.price) || 0,
      id: part.id || `manual-${Date.now()}`,
      stockDeducted: deducted,
      ...(warehouseId ? { fromWarehouse: warehouseId } : {}),
      ...(source ? { source } : {}),
      addedAt: nowIso(),
      addedBy: by,
    };
    const spareParts = [...(cur.spareParts || []), entry];
    const totalCost = (Number(cur.totalCost) || 0) + money(entry);
    const remaining = totalCost - (Number(cur.totalPaid) || 0);
    const history = [...(cur.history || []), {
      action: `إضافة قطعة غيار: ${name} (${qty} x ${entry.price} ج)${deducted ? ` — اتخصمت من مخزن ${warehouseId}` : ' — من غير ربط بالمخزون'}`,
      timestamp: nowIso(), by,
    }];
    tx.update(tRef, { spareParts, totalCost, remaining, history, updatedAt: serverTimestamp() });
    return { added: true, deducted, ticket: { ...cur, spareParts, totalCost, remaining, history } };
  });
}

/** يشيل قطعة من التذكرة، ولو كانت اتخصمت من المخزون بترجع له. */
export async function removePartFromTicket(ticketId, partId, { by = '' } = {}) {
  return runTransaction(db, async (tx) => {
    const tRef = doc(db, 'tickets', ticketId);
    const tSnap = await tx.get(tRef);
    if (!tSnap.exists()) throw new Error('التذكرة مش موجودة');
    const cur = tSnap.data();
    const part = (cur.spareParts || []).find((p) => p.id === partId);
    if (!part) return { removed: false, ticket: cur };
    let returned = false;
    if (part.stockDeducted && part.id && !String(part.id).startsWith('manual-')) {
      const iRef = doc(db, 'inventory', part.id);
      const iSnap = await tx.get(iRef);
      if (iSnap.exists()) {
        tx.update(iRef, { quantity: (Number(iSnap.data().quantity) || 0) + (Number(part.quantity) || 1), updatedAt: serverTimestamp() });
        returned = true;
      }
    }
    const spareParts = (cur.spareParts || []).filter((p) => p.id !== partId);
    const totalCost = Math.max(0, (Number(cur.totalCost) || 0) - money(part));
    const remaining = totalCost - (Number(cur.totalPaid) || 0);
    const history = [...(cur.history || []), { action: `حذف قطعة غيار: ${part.name || ''}${returned ? ' — رجعت للمخزن' : ''}`, timestamp: nowIso(), by }];
    tx.update(tRef, { spareParts, totalCost, remaining, history, updatedAt: serverTimestamp() });
    return { removed: true, returned, ticket: { ...cur, spareParts, totalCost, remaining, history } };
  });
}

/**
 * لما التذكرة تتعمل وفيها قطع من المخزون: نخصمها واحدة واحدة.
 * القطع اللي مش متاحة بتفضل على التذكرة من غير خصم (stockDeducted=false) وبترجع في القايمة.
 */
export async function deductTicketParts(ticketId, { by = '' } = {}) {
  const missing = [];
  await runTransaction(db, async (tx) => {
    const tRef = doc(db, 'tickets', ticketId);
    const tSnap = await tx.get(tRef);
    if (!tSnap.exists()) return;
    const parts = tSnap.data().spareParts || [];
    const todo = parts.filter((p) => p.id && !p.stockDeducted && !String(p.id).startsWith('manual-'));
    const snaps = await Promise.all(todo.map((p) => tx.get(doc(db, 'inventory', p.id))));
    const done = new Map();
    todo.forEach((p, i) => {
      const s = snaps[i];
      const have = s.exists() && !s.data().isDeleted ? Number(s.data().quantity) || 0 : -1;
      const need = Math.max(1, Number(p.quantity) || 1);
      if (have >= need) { tx.update(s.ref, { quantity: have - need, updatedAt: serverTimestamp() }); done.set(p.id, s.data().warehouseId || 'main'); }
      else missing.push(p.name || p.id);
    });
    if (!done.size) return;
    const spareParts = parts.map((p) => (done.has(p.id) ? { ...p, stockDeducted: true, fromWarehouse: done.get(p.id) } : p));
    tx.update(tRef, { spareParts, updatedAt: serverTimestamp(), history: arrayUnion({ action: `خصم قطع الغيار من المخزن (${done.size})`, timestamp: nowIso(), by }) });
  });
  return { missing };
}

/** يدوّر على نسخة الصنف ده (نفس السيريال) في مخزن معيّن. */
export async function findStockItem(serialNumber, warehouseId) {
  if (!serialNumber) return null;
  const s = await getDocs(query(collection(db, 'inventory'), where('serialNumber', '==', serialNumber), where('warehouseId', '==', warehouseId || 'main'), where('isDeleted', '==', false), limit(1)));
  return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
}

/** تغيير حالة التذكرة من أداة جانبية (طلب القطع) مع تسجيلها في السجل عشان وقت الصيانة يتحسب صح. */
export async function setTicketStatusQuiet(ticket, status, { by = '', note = '' } = {}) {
  if (!ticket?.id || !status || ticket.status === status || TICKET_TERMINAL_STATUSES.includes(ticket.status)) return false;
  const ts = nowIso();
  await updateDoc(doc(db, 'tickets', ticket.id), {
    status, updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({ status, timestamp: ts, by }),
    history: arrayUnion({ action: `تغيير الحالة تلقائيًا: ${note || status}`, timestamp: ts, by }),
  });
  return true;
}

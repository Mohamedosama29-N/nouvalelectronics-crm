// 🔎 بحث موحّد في السيستم كله (تذاكر، عملاء، أصناف، فواتير) — بنفس searchTokens
// المستخدمة في الشاشات، وبنفس صلاحيات المستخدم (الفرع يشوف فرعه بس).
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { buildQueryTokens, normalizePhone } from '../utils/search';
import { classifyQuery } from './commandPalette';
import { statusLabel } from './ticketAssist';

const can = (user, perm) => user?.role === 'admin' || user?.permissions?.[perm] === true;
const seeAll = (user) => user?.role === 'admin' || user?.permissions?.viewAllWarehouses;
const own = (user) => user?.assignedWarehouseId || 'main';

export const ticketNumberVariants = (v) => {
  const raw = String(v || '').trim();
  const out = new Set([raw, raw.toUpperCase()]);
  const digits = raw.replace(/\D/g, '');
  if (digits) out.add(`TKT-${digits.padStart(6, '0')}`);
  return [...out].filter(Boolean).slice(0, 10);
};
export const invoiceNumberVariants = (v) => {
  const raw = String(v || '').trim().toUpperCase();
  const out = new Set([raw]);
  const digits = raw.replace(/\D/g, '');
  if (digits) { out.add(`INV-${digits.padStart(6, '0')}`); out.add(`INV-${digits}`); }
  return [...out].filter(Boolean).slice(0, 10);
};

const run = async (label, fn) => {
  try { return await fn(); } catch (e) { console.warn(`search ${label} failed:`, e?.code || e); return []; }
};

const mapTicket = (d) => {
  const t = d.data();
  return { kind: 'ticket', id: d.id, title: `${t.ticketNumber || 'تذكرة'} · ${t.customerName || ''}`, subtitle: [t.device, t.deviceModel, statusLabel(t.status)].filter(Boolean).join(' · ') };
};

export async function searchEverywhere(text, user) {
  const q = classifyQuery(text);
  if (q.type === 'empty') return [];
  const tasks = [];
  const tCol = collection(db, 'tickets');
  const ticketScope = seeAll(user) ? [] : [where('assignedCenter', '==', own(user))];

  if (can(user, 'manageTickets')) {
    if (q.type === 'ticket' || (q.type === 'search' && /\d/.test(q.value) && q.value.length <= 12)) {
      tasks.push(run('ticketNo', async () => (await getDocs(query(tCol, where('ticketNumber', 'in', ticketNumberVariants(q.value)), limit(5)))).docs
        .map(mapTicket).filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i)));
    }
    if (q.type === 'phone') {
      tasks.push(run('ticketPhone', async () => (await getDocs(query(tCol, where('customerPhone', '==', normalizePhone(q.value)), orderBy('createdAt', 'desc'), limit(5)))).docs.map(mapTicket)));
    }
    if (q.type === 'search') {
      const tokens = buildQueryTokens(q.value);
      if (tokens.length) {
        tasks.push(run('ticketText', async () => (await getDocs(query(tCol, ...ticketScope, where('searchTokens', 'array-contains-any', tokens), orderBy('updatedAt', 'desc'), limit(6)))).docs.map(mapTicket)));
      }
    }
  }

  if (can(user, 'viewCustomers')) {
    const cCol = collection(db, 'customers');
    const scope = seeAll(user) ? [] : [where('warehouseId', '==', own(user))];
    const tokens = q.type === 'phone' ? [normalizePhone(q.value)] : buildQueryTokens(q.value);
    if (tokens.length && q.type !== 'ticket' && q.type !== 'invoice') {
      tasks.push(run('customers', async () => (await getDocs(query(cCol, ...scope, where('searchTokens', 'array-contains-any', tokens), limit(5)))).docs.map((d) => {
        const c = d.data();
        return { kind: 'customer', id: d.id, data: { id: d.id, ...c }, title: c.name || 'عميل', subtitle: [c.phone, c.totalPurchases ? `${c.totalPurchases} عملية شراء` : ''].filter(Boolean).join(' · ') };
      })));
    }
  }

  if (can(user, 'viewInventory') && q.type === 'search') {
    const iCol = collection(db, 'inventory');
    const scope = seeAll(user) ? [] : [where('warehouseId', '==', own(user))];
    const tokens = buildQueryTokens(q.value);
    if (tokens.length) {
      tasks.push(run('inventory', async () => (await getDocs(query(iCol, ...scope, where('isDeleted', '==', false), where('searchTokens', 'array-contains-any', tokens), limit(6)))).docs.map((d) => {
        const it = d.data();
        return { kind: 'item', id: d.id, text: it.serialNumber || it.name, title: it.name || it.serialNumber, subtitle: `${it.serialNumber || ''} · الكمية ${Number(it.quantity) || 0} · ${Number(it.price) || 0} ج` };
      })));
    }
  }

  if (can(user, 'viewInvoices') && (q.type === 'invoice' || (q.type === 'search' && /^inv/i.test(q.value)))) {
    const vCol = collection(db, 'transactions');
    tasks.push(run('invoices', async () => (await getDocs(query(vCol, where('invoiceNumber', 'in', invoiceNumberVariants(q.value)), limit(5)))).docs
      .map((d) => d.data())
      .filter((t) => seeAll(user) || t.warehouseId === own(user))
      .map((t) => ({ kind: 'invoice', id: t.invoiceNumber, text: t.invoiceNumber, title: `فاتورة ${t.invoiceNumber}`, subtitle: `${t.customerName || ''} · ${Math.round(Number(t.finalTotal) || 0).toLocaleString()} ج` }))));
  }

  const results = (await Promise.all(tasks)).flat();
  const seen = new Set();
  return results.filter((r) => { const k = `${r.kind}:${r.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

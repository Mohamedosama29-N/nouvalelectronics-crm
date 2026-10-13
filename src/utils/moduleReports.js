// تعريفات تقارير كل قسم في النظام (بيانات حية).
// كل تقرير = مصادر بيانات (sources) + دالة بناء (build) نقية بترجّع:
//   { kpis, charts, table: { headers, rows }, notes }
// الواجهة (ModuleReport) بتشترك في المصادر لحظياً وتعيد استدعاء build كل ما البيانات تتغير.

import { TICKET_STATUSES, TICKET_TERMINAL_STATUSES } from '../constants/tickets';
import { USER_ROLES } from '../constants/roles';
import {
  PRIORITY_LABELS, RETURN_STATUS_LABELS, TRANSFER_STATUS_LABELS, amountOf, buildCustomerStats,
  buildFinanceStats, buildInventoryStats, buildReturnsStats, buildSalesSeriesByDays, buildTicketStats,
  buildTransferStats, buildWarrantyStats, bucketByDay, canSeeWarehouse, countBy, isReturnTx, isSale,
  startOfDay, sumBy, toDate, topProductsFrom, transferItems
} from './liveStats';

const DAY = 24 * 60 * 60 * 1000;
const fmtDate = (ts) => {
  const d = toDate(ts);
  return d ? d.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '-';
};

export const RANGE_OPTIONS = [
  { days: 7, label: 'آخر 7 أيام' },
  { days: 30, label: 'آخر 30 يوم' },
  { days: 90, label: 'آخر 90 يوم' },
  { days: 365, label: 'آخر سنة' }
];

export function formatKpi(k) {
  if (k.value === null || k.value === undefined) return '—';
  const n = Number(k.value);
  switch (k.format) {
    case 'money': return `${Math.round(n).toLocaleString('ar-EG')} ج`;
    case 'percent': return `${n.toLocaleString('ar-EG')}%`;
    case 'text': return String(k.value);
    default: return n.toLocaleString('ar-EG');
  }
}

const sinceMs = (ctx) => startOfDay(ctx.now).getTime() - (ctx.rangeDays - 1) * DAY;

// --------------------------------------------------------------------------
const sales = {
  id: 'sales', label: 'المبيعات', icon: 'receipt', permission: null, timeBound: true,
  sources: (ctx) => [{ key: 'transactions', collection: 'transactions', timeField: 'timestamp', sinceMs: sinceMs(ctx), max: 10000 }],
  build: ({ transactions = [] }, ctx) => {
    const txs = transactions.filter((t) => ctx.scope(t.warehouseId));
    const sold = txs.filter(isSale);
    const returned = txs.filter(isReturnTx);
    const revenue = sold.reduce((s, t) => s + amountOf(t), 0);
    const refunds = returned.reduce((s, t) => s + amountOf(t), 0);
    const series = buildSalesSeriesByDays(txs, ctx.rangeDays, ctx.now);
    return {
      kpis: [
        { label: 'إجمالي المبيعات', value: revenue, format: 'money', tone: 'teal' },
        { label: 'المرتجعات', value: refunds, format: 'money', tone: 'rose' },
        { label: 'صافي المبيعات', value: revenue - refunds, format: 'money', tone: 'emerald' },
        { label: 'عدد الفواتير', value: sold.length, tone: 'sky' },
        { label: 'متوسط الفاتورة', value: sold.length ? revenue / sold.length : 0, format: 'money', tone: 'violet' },
        { label: 'أعلى فاتورة', value: sold.reduce((m, t) => Math.max(m, amountOf(t)), 0), format: 'money', tone: 'amber' }
      ],
      charts: [
        { id: 'trend', title: 'المبيعات والمرتجعات', type: 'line', data: series, series: [{ key: 'sales', name: 'المبيعات', color: '#0d9488' }, { key: 'returns', name: 'المرتجعات', color: '#f43f5e' }], wide: true },
        { id: 'topProducts', title: 'أفضل الأصناف (بالإيراد)', type: 'bar', data: topProductsFrom(txs, 8) },
        { id: 'byWarehouse', title: 'المبيعات حسب المخزن/الفرع', type: 'bar', data: sumBy(sold, (t) => t.warehouseId, amountOf, ctx.warehouseName) },
        { id: 'bySeller', title: 'المبيعات حسب البائع', type: 'pie', data: sumBy(sold, (t) => t.operator, amountOf).slice(0, 6) }
      ],
      table: {
        headers: ['رقم الفاتورة', 'التاريخ', 'النوع', 'الصنف', 'العميل', 'الصافي', 'البائع', 'المخزن'],
        rows: [...txs].sort((a, b) => (toDate(b.timestamp) || 0) - (toDate(a.timestamp) || 0)).map((t) => ({
          'رقم الفاتورة': t.invoiceNumber || t.id.slice(0, 6), 'التاريخ': fmtDate(t.timestamp),
          'النوع': isReturnTx(t) ? 'مرتجع' : 'بيع',
          'الصنف': t.itemName || (Array.isArray(t.items) ? t.items.map((i) => i.name).filter(Boolean).join('، ') : '-') || '-',
          'العميل': t.customerName || '-', 'الصافي': amountOf(t), 'البائع': t.operator || '-', 'المخزن': ctx.warehouseName(t.warehouseId) || '-'
        }))
      }
    };
  }
};

// --------------------------------------------------------------------------
const inventory = {
  id: 'inventory', label: 'المخزون', icon: 'package', permission: 'viewInventory', timeBound: false,
  sources: (ctx) => [{ key: 'inventory', collection: 'inventory', wheres: ctx.isScoped ? [['warehouseId', '==', ctx.scopeWarehouse]] : [] }],
  build: ({ inventory: items = [] }, ctx) => {
    const st = buildInventoryStats(items, ctx.warehouseName);
    const showValue = ctx.canSeeValue;
    const lowSorted = [...st.lowStock].sort((a, b) => a.quantity - a.minStock - (b.quantity - b.minStock));
    return {
      kpis: [
        { label: 'عدد الأصناف', value: st.skuCount, tone: 'teal' },
        { label: 'إجمالي القطع', value: st.totalQty, tone: 'sky' },
        { label: 'قيمة المخزون', value: showValue ? st.totalValue : null, format: 'money', tone: 'emerald', hint: showValue ? undefined : 'غير متاح لصلاحياتك' },
        { label: 'نواقص تحتاج طلب', value: st.lowStock.length, tone: 'amber' },
        { label: 'نفد من المخزون', value: st.outOfStock, tone: 'rose' }
      ],
      charts: [
        { id: 'cat', title: 'القطع حسب التصنيف', type: 'pie', data: st.byCategory.slice(0, 8) },
        { id: 'wh', title: 'القطع حسب المخزن', type: 'bar', data: st.byWarehouse },
        ...(showValue ? [{ id: 'val', title: 'قيمة المخزون حسب المخزن', type: 'bar', data: st.valueByWarehouse }] : []),
        { id: 'low', title: 'أكتر النواقص (الكمية الحالية)', type: 'bar', data: lowSorted.slice(0, 8).map((i) => ({ name: i.name || i.serialNumber, value: i.quantity })) }
      ],
      table: {
        headers: ['الاسم', 'السيريال', 'التصنيف', 'الكمية', 'الحد الأدنى', ...(showValue ? ['السعر'] : []), 'المخزن', 'الحالة'],
        rows: [...st.live].sort((a, b) => (Number(a.quantity) || 0) - (Number(b.quantity) || 0)).map((i) => {
          const qty = Number(i.quantity) || 0;
          const min = Number(i.minStock) || 0;
          const row = {
            'الاسم': i.name || '-', 'السيريال': i.serialNumber || '-', 'التصنيف': i.category || 'عام', 'الكمية': qty,
            'الحد الأدنى': min
          };
          if (showValue) row['السعر'] = Number(i.price) || 0;
          row['المخزن'] = ctx.warehouseName(i.warehouseId) || '-';
          row['الحالة'] = qty <= 0 ? 'نفد' : (min > 0 && qty <= min ? 'ناقص' : 'متوفر');
          return row;
        })
      }
    };
  }
};

// --------------------------------------------------------------------------
const tickets = {
  id: 'tickets', label: 'تذاكر الصيانة', icon: 'wrench', permission: 'manageTickets', timeBound: true,
  sources: (ctx) => [{ key: 'tickets', collection: 'tickets', timeField: 'createdAt', sinceMs: sinceMs(ctx), max: 10000 }],
  build: ({ tickets: list = [] }, ctx) => {
    const rows = list.filter((t) => ctx.scope(t.warehouseId));
    const statusLabel = (s) => TICKET_STATUSES.find((x) => x.value === s)?.label || s;
    const st = buildTicketStats(rows, {
      now: ctx.now, statusLabel, terminal: TICKET_TERMINAL_STATUSES,
      isOverdue: (t) => ctx.getSLAInfo?.(t, ctx.systemSettings?.ticketSLA)?.level === 'overdue'
    });
    const open = rows.filter((t) => !TICKET_TERMINAL_STATUSES.includes(t.status));
    return {
      kpis: [
        { label: 'إجمالي التذاكر', value: st.total, tone: 'teal' },
        { label: 'مفتوحة', value: st.open, tone: 'sky' },
        { label: 'تم تسليمها/إغلاقها', value: st.closed, tone: 'emerald' },
        { label: 'بانتظار موافقة العميل', value: st.waitingApproval, tone: 'amber' },
        { label: 'متأخرة عن SLA', value: st.overdueSLA, tone: 'rose' },
        { label: 'عالية الأولوية', value: st.highPriority, tone: 'violet' }
      ],
      charts: [
        { id: 'perDay', title: 'تذاكر جديدة يومياً', type: 'line', data: bucketByDay(rows, (t) => t.createdAt, () => 1, Math.min(ctx.rangeDays, 90), ctx.now), wide: true },
        { id: 'status', title: 'التذاكر حسب الحالة', type: 'pie', data: st.byStatus.slice(0, 8) },
        { id: 'priority', title: 'حسب الأولوية', type: 'bar', data: st.byPriority },
        { id: 'tech', title: 'المفتوحة حسب الفني', type: 'bar', data: countBy(open, (t) => t.assignedTechnician).slice(0, 8) },
        { id: 'type', title: 'حسب نوع التذكرة', type: 'pie', data: countBy(rows, (t) => t.ticketType).slice(0, 6) }
      ],
      table: {
        headers: ['رقم التذكرة', 'العميل', 'الجهاز', 'الحالة', 'الأولوية', 'الفني', 'التكلفة', 'تاريخ الإنشاء'],
        rows: [...rows].sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0)).map((t) => ({
          'رقم التذكرة': t.ticketNumber || t.id.slice(0, 6), 'العميل': t.customerName || '-', 'الجهاز': t.device || t.deviceType || '-',
          'الحالة': statusLabel(t.status), 'الأولوية': PRIORITY_LABELS[t.priority] || t.priority || '-',
          'الفني': t.assignedTechnician || '-', 'التكلفة': Number(t.totalCost) || Number(t.estimatedCost) || 0,
          'تاريخ الإنشاء': fmtDate(t.createdAt)
        }))
      }
    };
  }
};

// --------------------------------------------------------------------------
const transfers = {
  id: 'transfers', label: 'التحويلات المخزنية', icon: 'truck', permission: 'viewTransfers', timeBound: true,
  sources: (ctx) => [{ key: 'transfers', collection: 'transfers', timeField: 'createdAt', sinceMs: sinceMs(ctx), max: 5000 }],
  build: ({ transfers: list = [] }, ctx) => {
    const rows = list.filter((t) => ctx.scope(t.fromWarehouseId) || ctx.scope(t.toWarehouseId));
    const st = buildTransferStats(rows, ctx.warehouseName, ctx.now);
    return {
      kpis: [
        { label: 'إجمالي الطلبات', value: st.total, tone: 'teal' },
        { label: 'بانتظار الموافقة', value: st.pending, tone: 'amber' },
        { label: 'في الطريق', value: st.inTransit, tone: 'sky' },
        { label: 'تم الاستلام', value: st.received, tone: 'emerald' },
        { label: 'مرفوض/ملغي', value: st.rejected, tone: 'rose' },
        { label: 'قطع تم استلامها', value: st.totalQty, tone: 'violet' }
      ],
      charts: [
        { id: 'perDay', title: 'طلبات التحويل يومياً', type: 'line', data: bucketByDay(rows, (t) => t.createdAt, () => 1, Math.min(ctx.rangeDays, 90), ctx.now), wide: true },
        { id: 'status', title: 'حسب الحالة', type: 'pie', data: st.byStatus },
        { id: 'dest', title: 'أكتر المخازن طلباً', type: 'bar', data: st.byDestination.slice(0, 8) },
        { id: 'src', title: 'المخازن المُرسِلة', type: 'bar', data: st.bySource.slice(0, 8) }
      ],
      table: {
        headers: ['من مخزن', 'إلى مخزن', 'الأصناف', 'عدد القطع', 'الحالة', 'تاريخ الطلب'],
        rows: [...rows].sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0)).map((t) => ({
          'من مخزن': ctx.warehouseName(t.fromWarehouseId) || '-', 'إلى مخزن': ctx.warehouseName(t.toWarehouseId) || '-',
          'الأصناف': transferItems(t).map((i) => i.name || i.itemName || i.serialNumber).filter(Boolean).join('، ') || '-',
          'عدد القطع': transferItems(t).reduce((s, i) => s + (Number(i.quantity) || 0), 0),
          'الحالة': TRANSFER_STATUS_LABELS[t.status] || t.status || '-', 'تاريخ الطلب': fmtDate(t.createdAt)
        }))
      }
    };
  }
};

// --------------------------------------------------------------------------
const customers = {
  id: 'customers', label: 'العملاء', icon: 'users', permission: 'viewCustomers', timeBound: false,
  sources: () => [{ key: 'customers', collection: 'customers', max: 10000 }],
  build: ({ customers: list = [] }, ctx) => {
    const st = buildCustomerStats(list, ctx.now);
    return {
      kpis: [
        { label: 'إجمالي العملاء', value: st.total, tone: 'teal' },
        { label: 'جدد آخر 30 يوم', value: st.newThisMonth, tone: 'emerald' },
        { label: 'اشتروا فعلياً', value: st.buyers, tone: 'sky' },
        { label: 'نسبة المشترين', value: st.repeatRate, format: 'percent', tone: 'violet' }
      ],
      charts: [
        { id: 'growth', title: 'عملاء جدد شهرياً', type: 'bar', data: st.perMonth, wide: true },
        { id: 'gov', title: 'العملاء حسب المحافظة', type: 'pie', data: st.byGovernorate },
        { id: 'top', title: 'أكتر العملاء مشتريات (عدد)', type: 'bar', data: st.topBuyers }
      ],
      table: {
        headers: ['الاسم', 'الهاتف', 'المحافظة', 'المدينة', 'عدد المشتريات', 'تاريخ التسجيل'],
        rows: [...list].sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0)).map((c) => ({
          'الاسم': c.name || '-', 'الهاتف': c.phone || '-', 'المحافظة': c.governorate || '-', 'المدينة': c.city || '-',
          'عدد المشتريات': Number(c.totalPurchases) || 0, 'تاريخ التسجيل': fmtDate(c.createdAt)
        }))
      }
    };
  }
};

// --------------------------------------------------------------------------
const returns = {
  id: 'returns', label: 'المرتجعات', icon: 'undo', permission: 'viewReturns', timeBound: true,
  sources: (ctx) => [
    { key: 'returns', collection: 'returns', timeField: 'createdAt', sinceMs: sinceMs(ctx), max: 5000 },
    { key: 'returnsWarehouse', collection: 'returnsWarehouse', max: 5000 }
  ],
  build: ({ returns: list = [], returnsWarehouse: held = [] }, ctx) => {
    const rows = list.filter((r) => ctx.scope(r.fromWarehouse));
    const st = buildReturnsStats(rows, ctx.now);
    return {
      kpis: [
        { label: 'طلبات المرتجع', value: st.total, tone: 'teal' },
        { label: 'بانتظار الموافقة', value: st.pending, tone: 'amber' },
        { label: 'تمت الموافقة', value: st.approved, tone: 'emerald' },
        { label: 'مرفوضة', value: st.rejected, tone: 'rose' },
        { label: 'قيمة المرتجعات', value: st.totalValue, format: 'money', tone: 'violet' },
        { label: 'في مخزن المرتجعات', value: held.length, tone: 'sky' }
      ],
      charts: [
        { id: 'perDay', title: 'مرتجعات يومياً', type: 'line', data: bucketByDay(rows, (r) => r.createdAt, () => 1, Math.min(ctx.rangeDays, 90), ctx.now), wide: true },
        { id: 'status', title: 'حسب الحالة', type: 'pie', data: st.byStatus },
        { id: 'reason', title: 'حسب السبب', type: 'bar', data: st.byReason.slice(0, 8) },
        { id: 'cond', title: 'حالة قطع مخزن المرتجعات', type: 'pie', data: countBy(held, (h) => h.condition || h.status || 'غير محدد') }
      ],
      table: {
        headers: ['الصنف', 'السيريال', 'السبب', 'الكمية', 'القيمة', 'الحالة', 'العميل', 'التاريخ'],
        rows: [...rows].sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0)).map((r) => ({
          'الصنف': r.productName || r.name || '-', 'السيريال': r.serialNumber || '-', 'السبب': r.reasonLabel || r.reason || '-',
          'الكمية': Number(r.quantity) || 1, 'القيمة': st.value(r), 'الحالة': RETURN_STATUS_LABELS[r.status] || r.status || '-',
          'العميل': r.customerName || '-', 'التاريخ': fmtDate(r.createdAt)
        }))
      }
    };
  }
};

// --------------------------------------------------------------------------
const finance = {
  id: 'finance', label: 'المالية والمصروفات', icon: 'wallet', permission: 'viewFinance', timeBound: true,
  sources: (ctx) => [
    { key: 'expenses', collection: 'expenses', timeField: 'date', sinceMs: sinceMs(ctx), max: 10000 },
    { key: 'transactions', collection: 'transactions', timeField: 'timestamp', sinceMs: sinceMs(ctx), max: 10000 }
  ],
  build: ({ expenses = [], transactions = [] }, ctx) => {
    const ex = expenses.filter((e) => ctx.scope(e.warehouseId));
    const tx = transactions.filter((t) => ctx.scope(t.warehouseId));
    const st = buildFinanceStats(ex, tx, ctx.now, ctx.rangeDays);
    const days = Math.min(ctx.rangeDays, 90);
    const merged = st.revenuePerDay.map((r, i) => ({ name: r.name, revenue: r.value, expenses: st.expensesPerDay[i]?.value || 0 }));
    return {
      kpis: [
        { label: 'الإيرادات', value: st.revenue, format: 'money', tone: 'teal' },
        { label: 'المرتجعات', value: st.refunds, format: 'money', tone: 'amber' },
        { label: 'المصروفات', value: st.spent, format: 'money', tone: 'rose' },
        { label: 'صافي الربح التقريبي', value: st.netProfit, format: 'money', tone: st.netProfit >= 0 ? 'emerald' : 'rose', hint: 'إيرادات − مرتجعات − مصروفات (بدون تكلفة البضاعة)' }
      ],
      charts: [
        { id: 'flow', title: `الإيرادات مقابل المصروفات (${days} يوم)`, type: 'line', data: merged, series: [{ key: 'revenue', name: 'الإيرادات', color: '#0d9488' }, { key: 'expenses', name: 'المصروفات', color: '#f43f5e' }], wide: true },
        { id: 'cat', title: 'المصروفات حسب البند', type: 'pie', data: st.byCategory },
        { id: 'wh', title: 'المصروفات حسب الفرع', type: 'bar', data: sumBy(ex, (e) => e.warehouseId, (e) => e.amount, ctx.warehouseName) }
      ],
      table: {
        headers: ['التاريخ', 'البند', 'المبلغ', 'الوصف', 'المسجّل', 'الفرع'],
        rows: [...ex].sort((a, b) => (toDate(b.date) || 0) - (toDate(a.date) || 0)).map((e) => ({
          'التاريخ': fmtDate(e.date), 'البند': e.category || '-', 'المبلغ': Number(e.amount) || 0,
          'الوصف': e.description || '-', 'المسجّل': e.createdBy || '-', 'الفرع': ctx.warehouseName(e.warehouseId) || '-'
        }))
      }
    };
  }
};

// --------------------------------------------------------------------------
const invoices = {
  id: 'invoices', label: 'الفواتير', icon: 'file', permission: 'viewInvoices', timeBound: true,
  sources: (ctx) => [{ key: 'transactions', collection: 'transactions', timeField: 'timestamp', sinceMs: sinceMs(ctx), max: 10000 }],
  build: ({ transactions = [] }, ctx) => {
    const inv = transactions.filter((t) => isSale(t) && ctx.scope(t.warehouseId));
    const total = inv.reduce((s, t) => s + amountOf(t), 0);
    const discount = inv.reduce((s, t) => s + (Number(t.discountAmount) || 0), 0);
    const tax = inv.reduce((s, t) => s + (Number(t.taxAmount) || 0), 0);
    const customersSet = new Set(inv.map((t) => t.phone || t.customerName).filter(Boolean));
    return {
      kpis: [
        { label: 'عدد الفواتير', value: inv.length, tone: 'teal' },
        { label: 'إجمالي القيمة', value: total, format: 'money', tone: 'emerald' },
        { label: 'إجمالي الخصومات', value: discount, format: 'money', tone: 'amber' },
        { label: 'إجمالي الضريبة', value: tax, format: 'money', tone: 'violet' },
        { label: 'عملاء مختلفين', value: customersSet.size, tone: 'sky' }
      ],
      charts: [
        { id: 'count', title: 'عدد الفواتير يومياً', type: 'line', data: bucketByDay(inv, (t) => t.timestamp, () => 1, Math.min(ctx.rangeDays, 90), ctx.now), wide: true },
        { id: 'topc', title: 'أكتر العملاء قيمة فواتير', type: 'bar', data: sumBy(inv, (t) => t.customerName, amountOf).slice(0, 8) },
        { id: 'disc', title: 'الخصومات حسب البائع', type: 'bar', data: sumBy(inv, (t) => t.operator, (t) => t.discountAmount).slice(0, 8) },
        { id: 'pm', title: 'طرق الدفع', type: 'pie', data: countBy(inv, (t) => t.paymentMethod) }
      ],
      table: {
        headers: ['رقم الفاتورة', 'التاريخ', 'العميل', 'الإجمالي', 'الخصم', 'الضريبة', 'البائع'],
        rows: [...inv].sort((a, b) => (toDate(b.timestamp) || 0) - (toDate(a.timestamp) || 0)).map((t) => ({
          'رقم الفاتورة': t.invoiceNumber || t.id.slice(0, 6), 'التاريخ': fmtDate(t.timestamp), 'العميل': t.customerName || '-',
          'الإجمالي': amountOf(t), 'الخصم': Number(t.discountAmount) || 0, 'الضريبة': Number(t.taxAmount) || 0, 'البائع': t.operator || '-'
        }))
      }
    };
  }
};

// --------------------------------------------------------------------------
const warranty = {
  id: 'warranty', label: 'الضمان', icon: 'shield', permission: null, timeBound: false,
  sources: () => [{ key: 'transactions', collection: 'transactions', timeField: 'timestamp', max: 2000 }],
  build: ({ transactions = [] }, ctx) => {
    const st = buildWarrantyStats(transactions.filter((t) => ctx.scope(t.warehouseId)), ctx.now);
    return {
      kpis: [
        { label: 'منتجات بضمان مسجّل', value: st.total, tone: 'teal' },
        { label: 'ساري', value: st.valid, tone: 'emerald' },
        { label: 'ينتهي خلال 30 يوم', value: st.soon30, tone: 'amber' },
        { label: 'ينتهي خلال 31-90 يوم', value: st.soon90, tone: 'sky' },
        { label: 'منتهي', value: st.expired, tone: 'rose' }
      ],
      charts: [
        { id: 'bucket', title: 'حالة الضمان', type: 'pie', data: st.byBucket },
        { id: 'exp', title: 'انتهاء الضمان خلال 6 شهور', type: 'bar', data: st.expiryPerMonth }
      ],
      table: {
        headers: ['الصنف', 'السيريال', 'العميل', 'الهاتف', 'ينتهي في', 'المتبقي (يوم)'],
        rows: st.rows.map((r) => ({
          'الصنف': r.name || '-', 'السيريال': r.serialNumber || '-', 'العميل': r.customerName || '-', 'الهاتف': r.phone || '-',
          'ينتهي في': r.endDate.toLocaleDateString('ar-EG'), 'المتبقي (يوم)': r.daysLeft
        }))
      },
      notes: 'مبني على آخر 2000 فاتورة بيع.'
    };
  }
};

// --------------------------------------------------------------------------
const roleLabel = (k) => USER_ROLES.find((r) => r.key === k)?.label || k;
const team = {
  id: 'team', label: 'الفريق والنشاط', icon: 'activity', permission: 'viewUsers', timeBound: true,
  sources: (ctx) => [
    { key: 'employees', collection: 'employees', max: 2000 },
    { key: 'activity', collection: 'activity_logs', timeField: 'timestamp', sinceMs: sinceMs(ctx), max: 5000 },
    { key: 'logins', collection: 'login_history', timeField: 'timestamp', sinceMs: sinceMs(ctx), max: 3000 }
  ],
  build: ({ employees = [], activity = [], logins = [] }, ctx) => {
    const todayStart = startOfDay(ctx.now);
    const activeToday = new Set(activity.filter((a) => (toDate(a.timestamp) || 0) >= todayStart).map((a) => a.userId || a.userName));
    return {
      kpis: [
        { label: 'عدد الموظفين', value: employees.length, tone: 'teal' },
        { label: 'نشطون اليوم', value: activeToday.size, tone: 'emerald' },
        { label: 'عمليات مسجّلة', value: activity.length, tone: 'sky' },
        { label: 'مرات تسجيل الدخول', value: logins.length, tone: 'violet' }
      ],
      charts: [
        { id: 'act', title: 'العمليات يومياً', type: 'line', data: bucketByDay(activity, (a) => a.timestamp, () => 1, Math.min(ctx.rangeDays, 90), ctx.now), wide: true },
        { id: 'byUser', title: 'أكتر الموظفين نشاطاً', type: 'bar', data: countBy(activity, (a) => a.userName).slice(0, 8) },
        { id: 'byAction', title: 'أكتر العمليات تكراراً', type: 'pie', data: countBy(activity, (a) => a.action).slice(0, 8) },
        { id: 'roles', title: 'الموظفين حسب الدور', type: 'pie', data: countBy(employees, (e) => e.role, roleLabel) },
        { id: 'logins', title: 'تسجيلات الدخول يومياً', type: 'bar', data: bucketByDay(logins, (l) => l.timestamp, () => 1, Math.min(ctx.rangeDays, 90), ctx.now) }
      ],
      table: {
        headers: ['التاريخ', 'الموظف', 'العملية', 'التفاصيل'],
        rows: [...activity].sort((a, b) => (toDate(b.timestamp) || 0) - (toDate(a.timestamp) || 0)).map((a) => ({
          'التاريخ': fmtDate(a.timestamp), 'الموظف': a.userName || '-', 'العملية': a.action || '-', 'التفاصيل': a.details || '-'
        }))
      }
    };
  }
};

// --------------------------------------------------------------------------
const warehousesReport = {
  id: 'warehouses', label: 'المخازن والفروع', icon: 'building', permission: 'admin', timeBound: true,
  sources: (ctx) => [
    { key: 'inventory', collection: 'inventory' },
    { key: 'transactions', collection: 'transactions', timeField: 'timestamp', sinceMs: sinceMs(ctx), max: 10000 },
    { key: 'tickets', collection: 'tickets', timeField: 'createdAt', sinceMs: sinceMs(ctx), max: 10000 }
  ],
  build: ({ inventory: items = [], transactions = [], tickets: tks = [] }, ctx) => {
    const inv = buildInventoryStats(items, ctx.warehouseName);
    const sold = transactions.filter(isSale);
    const ids = [...new Set([...items.map((i) => i.warehouseId), ...sold.map((t) => t.warehouseId), ...tks.map((t) => t.warehouseId), ...(ctx.warehouses || []).map((w) => w.id)])].filter(Boolean);
    const rows = ids.map((id) => {
      const mine = inv.live.filter((i) => i.warehouseId === id);
      const sales = sold.filter((t) => t.warehouseId === id);
      return {
        id,
        'المخزن': ctx.warehouseName(id),
        'عدد الأصناف': mine.length,
        'إجمالي القطع': mine.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
        ...(ctx.canSeeValue ? { 'قيمة المخزون': mine.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.price) || 0), 0) } : {}),
        'نواقص': inv.lowStock.filter((i) => i.warehouseId === id).length,
        'مبيعات الفترة': sales.reduce((s, t) => s + amountOf(t), 0),
        'فواتير الفترة': sales.length,
        'تذاكر مفتوحة': tks.filter((t) => t.warehouseId === id && !TICKET_TERMINAL_STATUSES.includes(t.status)).length
      };
    });
    const clean = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'id')));
    return {
      kpis: [
        { label: 'عدد المخازن/الفروع', value: ids.length, tone: 'teal' },
        { label: 'إجمالي القطع', value: inv.totalQty, tone: 'sky' },
        { label: 'قيمة المخزون', value: ctx.canSeeValue ? inv.totalValue : null, format: 'money', tone: 'emerald' },
        { label: 'مبيعات الفترة', value: sold.reduce((s, t) => s + amountOf(t), 0), format: 'money', tone: 'violet' }
      ],
      charts: [
        { id: 'qty', title: 'القطع حسب المخزن', type: 'bar', data: rows.map((r) => ({ name: r['المخزن'], value: r['إجمالي القطع'] })) },
        { id: 'sales', title: 'المبيعات حسب المخزن', type: 'bar', data: rows.map((r) => ({ name: r['المخزن'], value: r['مبيعات الفترة'] })) },
        { id: 'tk', title: 'التذاكر المفتوحة حسب المخزن', type: 'pie', data: rows.filter((r) => r['تذاكر مفتوحة'] > 0).map((r) => ({ name: r['المخزن'], value: r['تذاكر مفتوحة'] })) }
      ],
      table: { headers: Object.keys(clean[0] || { 'المخزن': 1 }), rows: clean }
    };
  }
};

export const MODULE_REPORTS = [sales, invoices, inventory, tickets, transfers, returns, customers, finance, warranty, team, warehousesReport];

// صلاحية ظهور التقرير للمستخدم. permission=null يعني يكفي صلاحية التقارير نفسها.
export function canViewReport(def, user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (def.permission === 'admin') return false;
  if (!def.permission) return true;
  return !!user.permissions?.[def.permission];
}

// getSLAInfo بيتمرّر من الواجهة (getTicketSLAInfo) عشان الملف ده يفضل نقي ومتختبر من غير Firebase
export function makeReportContext({ user, warehouses = [], rangeDays = 30, now = new Date(), systemSettings, getSLAInfo }) {
  const isScoped = !(user?.role === 'admin' || user?.permissions?.viewAllWarehouses);
  const names = new Map(warehouses.map((w) => [w.id, w.name]));
  return {
    now, rangeDays, user, systemSettings, warehouses, isScoped, getSLAInfo,
    scopeWarehouse: user?.assignedWarehouseId || 'main',
    scope: (wid) => canSeeWarehouse(user, wid),
    warehouseName: (id) => names.get(id) || id,
    canSeeValue: user?.role === 'admin' || !!user?.permissions?.viewInventoryValue
  };
}


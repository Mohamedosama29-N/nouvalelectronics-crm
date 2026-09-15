import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { sendPushToEmployees } from './sendPush.js';

// ==========================================================================
// 🎫 إشعار عند إنشاء تذكرة جديدة
// ==========================================================================
// بيبعت لكل الأدمن + موظفي الكول سنتر. لو عايز تستهدف فني معين بس لو
// معيّن على التذكرة، ضيف شرط هنا بعد التأكد من اسم الحقل الفعلي.
export const onNewTicket = onDocumentCreated('tickets/{ticketId}', async (event) => {
  const ticket = event.data?.data();
  if (!ticket) return;

  await sendPushToEmployees({
    roles: ['admin', 'call_center'],
    title: '🎫 تذكرة جديدة',
    body: `تذكرة جديدة رقم ${ticket.ticketNumber || event.params.ticketId} - ${ticket.customerName || ''}`,
    data: { type: 'new_ticket', ticketId: event.params.ticketId },
  });
});

// ==========================================================================
// 📦 إشعار عند نفاذ/اقتراب نفاذ صنف من المخزون
// ==========================================================================
// بيتفعّل لما أي مستند في inventory يتحدّث، وبيقارن الكمية الجديدة بحد
// الطلب (minStock) - لو عدّى الحد لأول مرة (مكنش أقل من قبل) يبعت تنبيه،
// عشان مبعتش نفس التنبيه في كل مرة تتحدث فيها بيانات الصنف.
export const onLowStockCrossed = onDocumentUpdated('inventory/{itemId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;

  const minStock = after.minStock ?? 2;
  const wasAboveThreshold = (before.quantity ?? 0) > minStock;
  const isNowAtOrBelow = (after.quantity ?? 0) <= minStock;

  if (!(wasAboveThreshold && isNowAtOrBelow)) return;

  await sendPushToEmployees({
    roles: ['admin'],
    title: '⚠️ نفاذ مخزون',
    body: `الصنف "${after.name}" وصل لحد الطلب (${after.quantity} متبقي)`,
    data: { type: 'low_stock', itemId: event.params.itemId },
  });
});

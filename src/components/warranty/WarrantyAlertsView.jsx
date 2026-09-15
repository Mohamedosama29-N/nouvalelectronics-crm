import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, orderBy, limit
} from 'firebase/firestore';
import {
  Bell,
  ShieldCheck,
  Webhook,
  Download
} from 'lucide-react';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { db } from '../../firebase/config';
import { showError, showSuccess } from '../../utils/alerts';
import { sendWebhookNotification } from '../../utils/communications';
import { exportToCSV } from '../../utils/exportUtils';

export function WarrantyAlertsView({ systemSettings }) {
  const [loading, setLoading] = useState(true);
  const [warrantyItems, setWarrantyItems] = useState([]);
  const [sendingAlert, setSendingAlert] = useState(false);
  const config = systemSettings.warrantyAlerts || {};
  const daysWindow = config.daysBeforeExpiry || 30;

  useEffect(() => {
    const loadWarrantyData = async () => {
      setLoading(true);
      try {
        // ملحوظة: warrantyEndDate حقل جوه مصفوفة items، فمينفعش نعمل عليه
        // Firestore range query مباشر. بنجيب آخر دفعة فواتير بيع ونفلتر
        // محليًا - كافي لحجم مبيعات معظم المحلات، ولو الحجم كبر جدًا
        // محتاج نظام تجميع بيانات إضافي (مثلاً collection منفصلة للضمانات).
        const q = query(
          collection(db, 'transactions'),
          where('type', '==', 'sell'),
          orderBy('timestamp', 'desc'),
          limit(2000)
        );
        const snap = await getDocs(q);
        const today = new Date();
        const windowEnd = new Date();
        windowEnd.setDate(windowEnd.getDate() + daysWindow);

        const results = [];
        snap.docs.forEach(d => {
          const data = d.data();
          (data.items || []).forEach(item => {
            if (!item.warrantyEndDate) return;
            const endDate = new Date(item.warrantyEndDate);
            if (endDate <= windowEnd) {
              const daysLeft = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
              results.push({
                id: `${d.id}_${item.id || item.serialNumber}`,
                name: item.name,
                serialNumber: item.serialNumber,
                customerName: data.customerName,
                customerPhone: data.phone,
                warrantyEndDate: item.warrantyEndDate,
                daysLeft,
                expired: daysLeft < 0
              });
            }
          });
        });

        results.sort((a, b) => a.daysLeft - b.daysLeft);
        setWarrantyItems(results);
      } catch (error) {
        console.error("Warranty alerts error:", error);
        showError("فشل تحميل بيانات الضمان");
      }
      setLoading(false);
    };
    loadWarrantyData();
  }, [daysWindow]);

  const sendAlert = async () => {
    if (!config.webhookUrl || warrantyItems.length === 0) return;
    setSendingAlert(true);
    const ok = await sendWebhookNotification(config.webhookUrl, {
      type: 'warranty_expiry_alert',
      triggeredAt: new Date().toISOString(),
      count: warrantyItems.length,
      items: warrantyItems
    });
    setSendingAlert(false);
    if (ok) showSuccess("تم إرسال تنبيه الضمان بنجاح");
    else showError("فشل إرسال التنبيه، تأكد من رابط الـ Webhook");
  };

  if (loading) return <LoadingSkeleton type="table" count={5} />;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
      <div className="p-5 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-teal-600" size={20}/>
          <h2 className="text-lg font-black">تنبيهات اقتراب انتهاء الضمان</h2>
          <span className="bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-3 py-1 rounded-lg text-xs">{warrantyItems.length} منتج</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToCSV(warrantyItems.map(item => ({
              'المنتج': item.name,
              'السيريال': item.serialNumber,
              'العميل': item.customerName || '-',
              'الهاتف': item.customerPhone || '-',
              'تاريخ انتهاء الضمان': item.warrantyEndDate,
              'الحالة': item.expired ? `منتهي منذ ${Math.abs(item.daysLeft)} يوم` : `باقي ${item.daysLeft} يوم`,
            })), 'تنبيهات_الضمان')}
            disabled={warrantyItems.length === 0}
            className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-2 disabled:opacity-50"
          >
            <Download size={14}/> تصدير CSV
          </button>
          {config.webhookUrl && (
          <button
            onClick={sendAlert}
            disabled={sendingAlert || warrantyItems.length === 0}
            className="bg-amber-50 text-amber-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-100 flex items-center gap-2 disabled:opacity-50"
          >
            <Bell size={14}/> {sendingAlert ? 'جاري الإرسال...' : 'إرسال تنبيه الآن'}
          </button>
          )}
        </div>
      </div>

      {!config.enabled && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs font-bold">
          ⚠️ ميزة تنبيهات الضمان متوقفة حاليًا. فعّلها من الإعدادات العامة.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="p-3 text-right">المنتج</th>
              <th className="p-3 text-right">السيريال</th>
              <th className="p-3 text-right">العميل</th>
              <th className="p-3 text-right">الهاتف</th>
              <th className="p-3 text-right">تاريخ انتهاء الضمان</th>
              <th className="p-3 text-right">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {warrantyItems.map(item => (
              <tr key={item.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="p-3 font-bold">{item.name}</td>
                <td className="p-3 font-mono text-xs">{item.serialNumber}</td>
                <td className="p-3">{item.customerName || '-'}</td>
                <td className="p-3 font-mono" dir="ltr">{item.customerPhone || '-'}</td>
                <td className="p-3">{item.warrantyEndDate}</td>
                <td className="p-3">
                  {item.expired ? (
                    <span className="bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-2 py-1 rounded-lg text-xs font-bold">
                      منتهي منذ {Math.abs(item.daysLeft)} يوم
                    </span>
                  ) : (
                    <span className="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-1 rounded-lg text-xs font-bold">
                      باقي {item.daysLeft} يوم
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {warrantyItems.length === 0 && (
              <tr><td colSpan="6" className="p-8 text-center text-slate-400">لا توجد منتجات قريبة من انتهاء الضمان حاليًا</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================================================
// 📦 مخزن المرتجعات - Returns Warehouse Manager
// ==========================================================================

import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, updateDoc, deleteDoc, query, where, writeBatch, Timestamp
} from 'firebase/firestore';
import {
  RefreshCw
} from 'lucide-react';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { db } from '../../firebase/config';
import { logUserActivity } from '../../utils/activityLog';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { normalizePhone, normalizeSearch } from '../../utils/search';

export function DuplicateCustomersManager({ appUser }) {
  const [loading, setLoading] = useState(true);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [selectedPrimary, setSelectedPrimary] = useState({});
  const [merging, setMerging] = useState(null);

  const scanForDuplicates = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'customers'));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // تجميع حسب رقم الهاتف الموحّد + حسب الاسم (لو الهاتف فاضي)
      const groups = {};
      all.forEach(c => {
        const key = normalizePhone(c.phone) || `name:${normalizeSearch(c.name || '')}`;
        if (!key || key === 'name:') return;
        if (!groups[key]) groups[key] = [];
        groups[key].push(c);
      });

      const dupGroups = Object.values(groups).filter(g => g.length > 1);
      // ترتيب كل مجموعة: الأقدم أولاً (مرشح طبيعي ليكون العميل الأساسي)
      dupGroups.forEach(g => g.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return aTime - bTime;
      }));

      setDuplicateGroups(dupGroups);
      const defaults = {};
      dupGroups.forEach((g, idx) => { defaults[idx] = g[0].id; });
      setSelectedPrimary(defaults);
    } catch (error) {
      console.error("Duplicate scan error:", error);
      showError("فشل فحص العملاء المكررين");
    }
    setLoading(false);
  };

  useEffect(() => { scanForDuplicates(); }, []);

  const handleMerge = async (groupIdx) => {
    const group = duplicateGroups[groupIdx];
    const primaryId = selectedPrimary[groupIdx];
    const primary = group.find(c => c.id === primaryId);
    const duplicates = group.filter(c => c.id !== primaryId);

    const confirmed = await showConfirm(
      'تأكيد الدمج',
      `سيتم دمج ${duplicates.length} سجل مكرر في سجل "${primary.name}" وحذفهم نهائيًا. كل التذاكر المرتبطة بيهم هتتنقل للسجل الأساسي. هل أنت متأكد؟`
    );
    if (!confirmed) return;

    setMerging(groupIdx);
    try {
      // 1️⃣ جمع الإحصائيات وكل الوسوم من كل السجلات المكررة
      const totalPurchases = group.reduce((sum, c) => sum + (c.totalPurchases || 0), 0);
      const allTags = [...new Set(group.flatMap(c => c.tags || []))];
      const lastPurchaseDates = group.map(c => c.lastPurchase?.toDate?.() || null).filter(Boolean);
      const latestPurchase = lastPurchaseDates.length > 0
        ? new Date(Math.max(...lastPurchaseDates.map(d => d.getTime())))
        : null;

      await updateDoc(doc(db, 'customers', primary.id), {
        totalPurchases,
        tags: allTags,
        ...(latestPurchase ? { lastPurchase: Timestamp.fromDate(latestPurchase) } : {})
      });

      // 2️⃣ نقل كل التذاكر المرتبطة بالسجلات المكررة إلى السجل الأساسي
      for (const dup of duplicates) {
        const ticketsSnap = await getDocs(query(collection(db, 'tickets'), where('customerId', '==', dup.id)));
        const batch = writeBatch(db);
        ticketsSnap.docs.forEach(t => {
          batch.update(t.ref, { customerId: primary.id });
        });
        if (ticketsSnap.docs.length > 0) await batch.commit();
      }

      // 3️⃣ حذف السجلات المكررة
      for (const dup of duplicates) {
        await deleteDoc(doc(db, 'customers', dup.id));
      }

      await logUserActivity(
        appUser,
        'دمج عملاء مكررين',
        `دمج ${duplicates.length} سجل في العميل "${primary.name}" (${primary.phone})`
      );

      showSuccess(`تم دمج ${duplicates.length} سجل بنجاح`);
      await scanForDuplicates();
    } catch (error) {
      console.error("Merge error:", error);
      showError("فشل دمج العملاء: " + error.message);
    }
    setMerging(null);
  };

  if (loading) return <LoadingSkeleton type="table" count={4} />;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          بيتم اكتشاف العملاء اللي عندهم نفس رقم الهاتف (بعد توحيد الصيغة) في أكتر من سجل منفصل.
        </p>
        <button
          onClick={scanForDuplicates}
          className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-100"
        >
          <RefreshCw size={14}/> إعادة الفحص
        </button>
      </div>

      {duplicateGroups.length === 0 ? (
        <div className="text-center p-12 text-slate-400 border-2 border-dashed rounded-2xl">
          ✅ مفيش عملاء مكررين حاليًا
        </div>
      ) : (
        duplicateGroups.map((group, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                {group.length} سجل مكرر - رقم الهاتف: {group[0].phone || 'بدون رقم'}
              </span>
              <button
                onClick={() => handleMerge(idx)}
                disabled={merging === idx}
                className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {merging === idx ? 'جاري الدمج...' : 'دمج الآن'}
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {group.map(c => (
                <label key={c.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input
                    type="radio"
                    name={`primary-${idx}`}
                    checked={selectedPrimary[idx] === c.id}
                    onChange={() => setSelectedPrimary({ ...selectedPrimary, [idx]: c.id })}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <div className="flex-1">
                    <p className="font-bold text-sm">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.email || 'بدون بريد'} · {c.totalPurchases || 0} عملية شراء</p>
                  </div>
                  {selectedPrimary[idx] === c.id && (
                    <span className="text-[10px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-full font-bold">
                      سيتم الاحتفاظ به
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ==========================================================================
// 🕵️ سجل التدقيق - Audit Log Manager
// (ميزة جديدة: صلاحية viewAuditLog كانت موجودة من غير أي شاشة فعلية تستخدمها)
// ==========================================================================

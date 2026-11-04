import React, { useEffect, useState } from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { Inbox } from 'lucide-react';
import { db } from '../../firebase/config';
import { requestNavigation } from '../../utils/appEvents';

// 📥 عدد طلبات الحجز الأونلاين الجديدة (قراءة واحدة بس — عدّاد من السيرفر)
let cache = { at: 0, n: null };
export function NewRequestsBanner() {
  const [n, setN] = useState(cache.n);
  useEffect(() => {
    if (Date.now() - cache.at < 5 * 60000) return undefined;
    let alive = true;
    getCountFromServer(query(collection(db, 'serviceRequests'), where('status', '==', 'new')))
      .then((s) => { cache = { at: Date.now(), n: s.data().count }; if (alive) setN(cache.n); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!n) return null;
  return (
    <button type="button" onClick={() => requestNavigation('callcenter', { kind: 'requests' })}
      className="w-full anim-up flex items-center gap-2 p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-indigo-800 dark:text-indigo-200 text-sm font-bold text-right">
      <Inbox size={18} /> {n} طلب صيانة جديد من صفحة الحجز أونلاين — اضغط عشان تكلّمهم
    </button>
  );
}

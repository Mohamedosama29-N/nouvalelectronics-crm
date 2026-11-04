import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

// وردية الموظف المفتوحة حاليًا (undefined = لسه بيحمّل، null = مفيش)
export function useMyShift(appUser) {
  const who = appUser?.name || appUser?.email || 'موظف';
  const [shift, setShift] = useState(undefined);
  const reload = async () => {
    try {
      const s = await getDocs(query(collection(db, 'cashShifts'), where('operator', '==', who), where('status', '==', 'open'), limit(1)));
      setShift(s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() });
    } catch (e) { console.error(e); setShift(null); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- بيتحمّل لما المستخدم يتغيّر
  useEffect(() => { const t = setTimeout(reload, 0); return () => clearTimeout(t); }, [who]);
  return [shift, reload];
}

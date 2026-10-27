import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { buildQueryTokens, normalizeSearch } from './search';
import { classifyTextMatches, codeLikeTokens, pickBestStock, serialVariants } from './productCodeMatch';

const toItem = (d) => ({ id: d.id, ...d.data() });

// بيدوّر على صنف المخزون المطابق لكود منتج. بيرجع { status, item, candidates }:
//  exact/unique → item جاهز للربط التلقائي | ambiguous → candidates للاختيار اليدوي | none
export async function resolveProductCode(productCode, myWarehouse = 'main') {
  const raw = String(productCode ?? '').trim();
  if (!raw) return { status: 'none', item: null, candidates: [] };

  const fetchBySerial = async (serial) => {
    const snap = await getDocs(query(
      collection(db, 'inventory'),
      where('serialNumber', '==', serial),
      where('isDeleted', '==', false),
      limit(10)
    ));
    return snap.docs.map(toItem);
  };
  const bySerial = async (candidates) => {
    for (const s of candidates) {
      const docs = await fetchBySerial(s);
      if (docs.length) return docs;
    }
    return [];
  };

  // 1) تطابق تام مع السيريال (بكل صيغ الحروف)، ثم أجزاء الكود اللي شكلها سيريال
  let docs = await bySerial(serialVariants(raw));
  if (!docs.length) docs = await bySerial(codeLikeTokens(raw).flatMap(serialVariants));
  if (docs.length) {
    const serials = new Set(docs.map((d) => d.serialNumber));
    if (serials.size === 1) return { status: 'exact', item: pickBestStock(docs, myWarehouse), candidates: [] };
    return { status: 'ambiguous', item: null, candidates: docs };
  }

  // 2) تطابق نصي (اسم/سيريال) على نتايج بحث الـ tokens
  const term = normalizeSearch(raw);
  const tokens = buildQueryTokens(term);
  const LIMIT = 20;
  const snap = await getDocs(query(
    collection(db, 'inventory'),
    where('isDeleted', '==', false),
    where('searchTokens', 'array-contains-any', tokens.length ? tokens : [term]),
    limit(LIMIT)
  ));
  return classifyTextMatches(snap.docs.map(toItem), raw, { truncated: snap.size >= LIMIT, myWarehouse });
}

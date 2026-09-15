import {
  collection, getDocs
} from 'firebase/firestore';
import { db } from '../firebase/config';

export const getAllDocs = async (collectionName) => {
  try {
    const snap = await getDocs(collection(db, collectionName));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error(`Error fetching ${collectionName}:`, error);
    return [];
  }
};


// ==========================================================================
// 🏷️ إدارة المنتجات والموديلات (معدل لـ 5 مستويات)
// ==========================================================================

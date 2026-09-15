import CryptoJS from 'crypto-js';
import {
  collection, getDocs, doc, updateDoc, query, where, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';

export const generateAPIKey = (user, permissions) => {
  const key = {
    id: 'key_' + Date.now().toString(36) + Math.random().toString(36).substr(2),
    key: CryptoJS.lib.WordArray.random(32).toString(),
    userId: user.id,
    userName: user.name,
    permissions,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastUsed: null,
    isActive: true
  };
  
  return key;
};

export const validateAPIKey = async (apiKey) => {
  try {
    const q = query(collection(db, 'api_keys'), where('key', '==', apiKey));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      return { valid: false, error: 'مفتاح API غير صالح' };
    }
    
    const keyData = snap.docs[0].data();
    
    if (!keyData.isActive) {
      return { valid: false, error: 'مفتاح API معطل' };
    }
    
    if (new Date(keyData.expiresAt) < new Date()) {
      return { valid: false, error: 'انتهت صلاحية المفتاح' };
    }
    
    await updateDoc(doc(db, 'api_keys', snap.docs[0].id), {
      lastUsed: serverTimestamp()
    });
    
    return { valid: true, permissions: keyData.permissions };
  } catch (error) {
    console.error('API key validation error:', error);
    return { valid: false, error: 'خطأ في التحقق' };
  }
};

// ==========================================================================
// 🌀 LOADING SKELETON
// ==========================================================================

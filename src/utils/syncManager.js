import {
  collection, addDoc, doc, updateDoc, deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { offlineDB } from './offlineDb';

export const syncManager = {
  async syncAll() {
    const result = await offlineDB.syncWithServer();
    return result;
  },

  async addOperation(operation) {
    if (navigator.onLine) {
      try {
        switch (operation.type) {
          case 'add':
            await addDoc(collection(db, operation.collection), operation.data);
            break;
          case 'update':
            await updateDoc(doc(db, operation.collection, operation.id), operation.data);
            break;
          case 'delete':
            await deleteDoc(doc(db, operation.collection, operation.id));
            break;
        }
        return { synced: true };
      } catch {
        await offlineDB.addToSyncQueue(operation);
        return { synced: false, queued: true };
      }
    } else {
      await offlineDB.addToSyncQueue(operation);
      return { synced: false, queued: true };
    }
  },

  startAutoSync(interval = 5 * 60 * 1000) {
    setInterval(async () => {
      if (navigator.onLine) {
        await this.syncAll();
      }
    }, interval);
  }
};

// ملحوظة تنظيف: تم حذف searchCache من هنا - كان معرّف لكنه مش
// مستخدم في أي مكان في التطبيق.

// ==========================================================================
// 📊 VIRTUAL TABLE COMPONENT (للجداول الكبيرة)
// ==========================================================================

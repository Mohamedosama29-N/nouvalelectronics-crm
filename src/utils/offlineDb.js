import { openDB } from 'idb';
import {
  collection, addDoc, doc, updateDoc, deleteDoc
} from 'firebase/firestore';
import {
  Save
} from 'lucide-react';
import { db } from '../firebase/config';

export const dbPromise = openDB('nouval-offline-db', 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('inventory', { keyPath: 'id' });
      db.createObjectStore('transactions', { keyPath: 'id' });
      db.createObjectStore('customers', { keyPath: 'id' });
      db.createObjectStore('tickets', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'id' });
      db.createObjectStore('warehouses', { keyPath: 'id' });
      db.createObjectStore('employees', { keyPath: 'id' });
    }
    if (oldVersion < 2) {
      const syncStore = db.createObjectStore('sync_queue', { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      syncStore.createIndex('timestamp', 'timestamp');
      syncStore.createIndex('attempts', 'attempts');
    }
    if (oldVersion < 3) {
      db.createObjectStore('search_cache', { keyPath: 'term' });
      db.createObjectStore('reports_cache', { keyPath: 'id' });
      db.createObjectStore('backups', { keyPath: 'id' });
    }
  },
});

export const offlineDB = {
  async save(store, data) {
    try {
      const db = await dbPromise;
      await db.put(store, data);
      return true;
    } catch (error) {
      console.error('Offline save error:', error);
      return false;
    }
  },

  async get(store, id) {
    try {
      const db = await dbPromise;
      return await db.get(store, id);
    } catch (error) {
      console.error('Offline get error:', error);
      return null;
    }
  },

  async getAll(store) {
    try {
      const db = await dbPromise;
      return await db.getAll(store);
    } catch (error) {
      console.error('Offline getAll error:', error);
      return [];
    }
  },

  async delete(store, id) {
    try {
      const db = await dbPromise;
      await db.delete(store, id);
      return true;
    } catch (error) {
      console.error('Offline delete error:', error);
      return false;
    }
  },

  async clear(store) {
    try {
      const db = await dbPromise;
      await db.clear(store);
      return true;
    } catch (error) {
      console.error('Offline clear error:', error);
      return false;
    }
  },

  async addToSyncQueue(operation) {
    try {
      const db = await dbPromise;
      return await db.add('sync_queue', {
        ...operation,
        timestamp: Date.now(),
        attempts: 0,
        lastAttempt: null
      });
    } catch (error) {
      console.error('Add to sync queue error:', error);
      return null;
    }
  },

  async getSyncQueue() {
    try {
      const db = await dbPromise;
      return await db.getAll('sync_queue');
    } catch (error) {
      console.error('Get sync queue error:', error);
      return [];
    }
  },

  async updateSyncQueue(id, updates) {
    try {
      const db = await dbPromise;
      const item = await db.get('sync_queue', id);
      if (item) {
        await db.put('sync_queue', { ...item, ...updates });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Update sync queue error:', error);
      return false;
    }
  },

  async removeFromSyncQueue(id) {
    try {
      const db = await dbPromise;
      await db.delete('sync_queue', id);
      return true;
    } catch (error) {
      console.error('Remove from sync queue error:', error);
      return false;
    }
  },

  async saveSearchCache(term, results) {
    try {
      const db = await dbPromise;
      await db.put('search_cache', {
        term,
        results,
        timestamp: Date.now()
      });
      return true;
    } catch (error) {
      console.error('Save search cache error:', error);
      return false;
    }
  },

  async getSearchCache(term) {
    try {
      const db = await dbPromise;
      const cached = await db.get('search_cache', term);
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return cached.results;
      }
      return null;
    } catch (error) {
      console.error('Get search cache error:', error);
      return null;
    }
  },

  async syncWithServer() {
    const queue = await this.getSyncQueue();
    let synced = 0;
    let failed = 0;

    for (const item of queue) {
      if (item.attempts >= 5) {
        failed++;
        continue;
      }

      try {
        switch (item.type) {
          case 'add':
            await addDoc(collection(db, item.collection), item.data);
            break;
          case 'update':
            await updateDoc(doc(db, item.collection, item.id), item.data);
            break;
          case 'delete':
            await deleteDoc(doc(db, item.collection, item.id));
            break;
        }
        
        await this.removeFromSyncQueue(item.id);
        synced++;
      } catch (error) {
        console.error('Sync failed:', error);
        await this.updateSyncQueue(item.id, {
          attempts: item.attempts + 1,
          lastAttempt: Date.now(),
          lastError: error.message
        });
        failed++;
      }
    }

    return { synced, failed };
  }
};

// ==========================================================================
// 🚦 RATE LIMITER
// ==========================================================================

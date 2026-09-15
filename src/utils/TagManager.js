import {
  collection, getDocs, doc, updateDoc, serverTimestamp, setDoc, increment
} from 'firebase/firestore';
import { db } from '../firebase/config';

export class TagManager {
  constructor() {
    this.tags = new Map();
    this.categories = new Set();
  }

  async loadTags() {
    try {
      const snap = await getDocs(collection(db, 'tags'));
      this.tags.clear();
      snap.docs.forEach(doc => {
        this.tags.set(doc.id, doc.data());
        this.categories.add(doc.data().category);
      });
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  }

  async addTag(tag, category = 'general') {
    try {
      const tagId = tag.toLowerCase().replace(/\s+/g, '_');
      await setDoc(doc(db, 'tags', tagId), {
        name: tag,
        category,
        usageCount: 0,
        createdAt: serverTimestamp()
      });
      this.tags.set(tagId, { name: tag, category, usageCount: 0 });
      this.categories.add(category);
      return tagId;
    } catch (error) {
      console.error('Error adding tag:', error);
      return null;
    }
  }

  async incrementUsage(tagId) {
    try {
      const tagRef = doc(db, 'tags', tagId);
      await updateDoc(tagRef, {
        usageCount: increment(1)
      });
    } catch (error) {
      console.error('Error incrementing tag usage:', error);
    }
  }

  getTagsByCategory(category) {
    const result = [];
    this.tags.forEach((tag, id) => {
      if (tag.category === category) {
        result.push({ id, ...tag });
      }
    });
    return result;
  }

  getAllCategories() {
    return Array.from(this.categories);
  }

  searchTags(query) {
    const result = [];
    const lowerQuery = query.toLowerCase();
    this.tags.forEach((tag, id) => {
      if (tag.name.toLowerCase().includes(lowerQuery)) {
        result.push({ id, ...tag });
      }
    });
    return result;
  }
}

export const tagManager = new TagManager();

// ==========================================================================
// 🛠️ دوال مساعدة
// ==========================================================================

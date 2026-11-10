// services/productService.js
import { db } from './firebase';
import { doc, updateDoc, collection, addDoc, getDocs, query, where } from 'firebase/firestore';

// توليد كلمات مفتاحية للبحث
export const generateSearchKeywords = (product) => {
  const keywords = new Set();
  
  // إضافة اسم المنتج كاملاً وأجزاء منه
  keywords.add(product.name);
  keywords.add(product.name.toLowerCase());
  
  // تجزئة الاسم (مثال: "قهوة تركي" -> "قهوة", "تركي")
  const nameParts = product.name.split(' ');
  nameParts.forEach(part => {
    if (part.length > 1) {
      keywords.add(part);
      // إضافة أول 3 حروف من كل جزء (للبحث بالأحرف الأولى)
      keywords.add(part.substring(0, 3));
    }
  });
  
  // إضافة الباركود و SKU
  if (product.barcode) {
    keywords.add(product.barcode);
    // آخر 4 أرقام من الباركود
    keywords.add(product.barcode.slice(-4));
  }
  
  if (product.sku) {
    keywords.add(product.sku);
    keywords.add(product.sku.toLowerCase());
  }
  
  // إضافة الفئات إذا وجدت
  if (product.category) {
    keywords.add(product.category);
  }
  
  // إضافة وصف المنتج (كلمات مفتاحية إضافية)
  if (product.tags && Array.isArray(product.tags)) {
    product.tags.forEach(tag => keywords.add(tag));
  }
  
  return Array.from(keywords);
};

// إضافة منتج مع الكلمات المفتاحية
export const addProductWithKeywords = async (productData) => {
  const searchKeywords = generateSearchKeywords(productData);
  const productWithKeywords = {
    ...productData,
    searchKeywords,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  const docRef = await addDoc(collection(db, 'products'), productWithKeywords);
  return { id: docRef.id, ...productWithKeywords };
};

// تحديث منتج مع إعادة توليد الكلمات المفتاحية
export const updateProductWithKeywords = async (productId, productData) => {
  const searchKeywords = generateSearchKeywords(productData);
  const updatedProduct = {
    ...productData,
    searchKeywords,
    updatedAt: new Date()
  };
  
  const productRef = doc(db, 'products', productId);
  await updateDoc(productRef, updatedProduct);
  return { id: productId, ...updatedProduct };
};

// البحث الذكي
export const smartSearch = async (searchTerm) => {
  if (!searchTerm || searchTerm.length < 1) return [];
  
  const productsRef = collection(db, 'products');
  
  // بحث بالكلمات المفتاحية
  const keywordQuery = query(
    productsRef,
    where('searchKeywords', 'array-contains', searchTerm)
  );
  
  const keywordSnapshot = await getDocs(keywordQuery);
  let results = keywordSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // إذا لم تكن هناك نتائج، جرب البحث بالاسم (جزئي)
  if (results.length === 0 && searchTerm.length > 2) {
    const nameQuery = query(
      productsRef,
      where('name', '>=', searchTerm),
      where('name', '<=', searchTerm + '\uf8ff')
    );
    const nameSnapshot = await getDocs(nameQuery);
    results = nameSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
  
  return results;
};
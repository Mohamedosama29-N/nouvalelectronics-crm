// src/services/bomService.js
import { db } from './firebase'
import { 
  collection, doc, getDoc, getDocs, addDoc, updateDoc, 
  query, where, writeBatch, increment 
} from 'firebase/firestore'

// إدارة المواد الخام
export const rawMaterialsService = {
  // إضافة مادة خام
  async addRawMaterial(material) {
    const materialData = {
      ...material,
      quantity: material.initialQuantity || 0,
      unit: material.unit || 'piece',
      reorderPoint: material.reorderPoint || 10,
      safetyStock: material.safetyStock || 5,
      leadTime: material.leadTime || 3, // أيام
      cost: material.cost || 0,
      supplier: material.supplier || '',
      location: material.location || '',
      createdAt: new Date(),
      updatedAt: new Date()
    }
    const docRef = await addDoc(collection(db, 'rawMaterials'), materialData)
    return { id: docRef.id, ...materialData }
  },

  // تحديث كمية المادة الخام
  async updateQuantity(materialId, quantity, type, reference) {
    const materialRef = doc(db, 'rawMaterials', materialId)
    const materialDoc = await getDoc(materialRef)
    const currentQuantity = materialDoc.data().quantity
    
    // تسجيل حركة المخزون
    await addDoc(collection(db, 'inventoryTransactions'), {
      materialId,
      type, // 'purchase', 'usage', 'adjustment', 'return'
      quantity,
      previousQuantity: currentQuantity,
      newQuantity: type === 'usage' ? currentQuantity - quantity : currentQuantity + quantity,
      reference,
      timestamp: new Date()
    })
    
    // تحديث الكمية
    await updateDoc(materialRef, {
      quantity: type === 'usage' ? increment(-quantity) : increment(quantity),
      updatedAt: new Date()
    })
    
    // التحقق من reorder point
    const newQuantity = type === 'usage' ? currentQuantity - quantity : currentQuantity + quantity
    if (newQuantity <= materialDoc.data().reorderPoint) {
      await this.createReorderAlert(materialId, newQuantity)
    }
  },

  // إنشاء تنبيه لإعادة الطلب
  async createReorderAlert(materialId, currentQuantity) {
    const materialRef = doc(db, 'rawMaterials', materialId)
    const material = (await getDoc(materialRef)).data()
    
    await addDoc(collection(db, 'alerts'), {
      type: 'low_stock',
      materialId,
      materialName: material.name,
      currentQuantity,
      reorderPoint: material.reorderPoint,
      status: 'pending',
      createdAt: new Date()
    })
  }
}

// إدارة الوصفات (BOM)
export const recipesService = {
  // إنشاء وصفة لمنتج
  async createRecipe(productId, recipeItems, instructions = '') {
    const recipe = {
      productId,
      items: recipeItems.map(item => ({
        materialId: item.materialId,
        quantity: item.quantity,
        unit: item.unit,
        wastage: item.wastage || 0 // نسبة الهالك
      })),
      instructions,
      version: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    const docRef = await addDoc(collection(db, 'recipes'), recipe)
    return { id: docRef.id, ...recipe }
  },

  // تحديث وصفة
  async updateRecipe(recipeId, recipeItems, instructions) {
    const recipeRef = doc(db, 'recipes', recipeId)
    const recipeDoc = await getDoc(recipeRef)
    const currentVersion = recipeDoc.data().version
    
    // حفظ الإصدار القديم في history
    await addDoc(collection(db, 'recipesHistory'), {
      ...recipeDoc.data(),
      version: currentVersion,
      archivedAt: new Date()
    })
    
    // تحديث الوصفة الحالية
    await updateDoc(recipeRef, {
      items: recipeItems,
      instructions,
      version: currentVersion + 1,
      updatedAt: new Date()
    })
  },

  // حساب تكلفة المنتج بناءً على الوصفة
  async calculateProductCost(productId) {
    const recipeQuery = query(collection(db, 'recipes'), where('productId', '==', productId), where('isActive', '==', true))
    const recipeSnapshot = await getDocs(recipeQuery)
    
    if (recipeSnapshot.empty) return null
    
    const recipe = recipeSnapshot.docs[0].data()
    let totalCost = 0
    
    for (const item of recipe.items) {
      const materialDoc = await getDoc(doc(db, 'rawMaterials', item.materialId))
      const material = materialDoc.data()
      const wastageMultiplier = 1 + (item.wastage / 100)
      totalCost += (material.cost / material.unitQuantity) * item.quantity * wastageMultiplier
    }
    
    return totalCost
  },

  // خصم المواد الخام عند بيع منتج
  async deductMaterials(productId, quantity = 1) {
    const recipeQuery = query(collection(db, 'recipes'), where('productId', '==', productId), where('isActive', '==', true))
    const recipeSnapshot = await getDocs(recipeQuery)
    
    if (recipeSnapshot.empty) return { success: true, message: 'منتج بسيط' }
    
    const recipe = recipeSnapshot.docs[0].data()
    const batch = writeBatch(db)
    const insufficientMaterials = []
    
    for (const item of recipe.items) {
      const materialRef = doc(db, 'rawMaterials', item.materialId)
      const materialDoc = await getDoc(materialRef)
      const material = materialDoc.data()
      const requiredQuantity = item.quantity * quantity * (1 + item.wastage / 100)
      
      if (material.quantity < requiredQuantity) {
        insufficientMaterials.push({
          name: material.name,
          available: material.quantity,
          required: requiredQuantity
        })
      } else {
        batch.update(materialRef, {
          quantity: increment(-requiredQuantity),
          updatedAt: new Date()
        })
      }
    }
    
    if (insufficientMaterials.length > 0) {
      return { success: false, insufficientMaterials }
    }
    
    await batch.commit()
    return { success: true }
  }
}
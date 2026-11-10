// services/inventoryService.js
import { db } from './firebase'
import {
  doc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  runTransaction,
  updateDoc,
  increment
} from 'firebase/firestore'
import { logger } from '../utils/logger'

// خطأ مخصص لحالة نقص المخزون، يستخدم لتمييزه عن أخطاء الشبكة/الاتصال
export class InsufficientStockError extends Error {
  constructor(insufficientMaterials) {
    super('مواد خام غير كافية')
    this.name = 'InsufficientStockError'
    this.insufficientMaterials = insufficientMaterials
  }
}

/**
 * خصم كميات المنتجات من مخزون كل منتج (الحقل quantity في مستند المنتج)
 * بعد إتمام عملية بيع فعلية (لما الفاتورة فعلاً تتسجل). بيستخدم transaction
 * جاهزة ممرَّرة من بره (transaction) عشان يشتغل جوه أي عملية أكبر ذرية
 * (زي تسجيل الفاتورة نفسها لحظة "تم التسليم" من المطبخ).
 *
 * - بيتجاهل تلقائياً أي صنف من غير productId، أو منتج معلّم "بدون تتبع
 *   مخزون" (trackStock: false) - زي الأصناف اللي بتتحضر أول بأول.
 * - الكمية متنزلش تحت الصفر أبداً حتى لو البيع كان أكتر من المتاح.
 *
 * ⚠️ مقسّمة قراءة/كتابة (read/commit) عن قصد: Firestore بيرفض أي transaction
 * فيها قراءة (get) بعد أي كتابة (set/update) حصلت قبلها - حتى لو من عملية
 * تانية جوه نفس الـ transaction الكبيرة. فلو الدالة دي كانت بتقرا وتكتب سوا
 * زي الأول، وبعدها أي كود تاني في نفس الـ transaction محتاج يقرا حاجة
 * (زي حجز رقم فاتورة)، الـ transaction كلها كانت بتفشل بخطأ غامض. الحل:
 * كل القراءات في كل الـ transaction الأول، وبعدين كل الكتابات.
 */
export const readStockDeductions = async (transaction, items = []) => {
  // تجميع الكميات لو نفس المنتج اتكرر في الفاتورة (وإلا آخر سطر كان بيكتب فوق الباقي)
  const soldByProduct = new Map()
  items.forEach(it => {
    if (!it.productId || it.trackStock === false) return
    soldByProduct.set(it.productId, (soldByProduct.get(it.productId) || 0) + (Number(it.quantity) || 0))
  })
  if (soldByProduct.size === 0) return []

  const productIds = Array.from(soldByProduct.keys())
  const productRefs = productIds.map(id => doc(db, 'products', id))
  const snaps = await Promise.all(productRefs.map(ref => transaction.get(ref)))

  const updates = []
  snaps.forEach((snap, idx) => {
    if (!snap.exists()) return
    const data = snap.data()
    // المنتجات القديمة اللي مفيهاش trackStock بتتعامل كإنها متتبعة
    if (data.trackStock === false) return
    const currentQty = Number(data.quantity) || 0
    const soldQty = soldByProduct.get(productIds[idx]) || 0
    const newQty = Math.max(0, currentQty - soldQty)
    // نكتب trackStock:true صراحة عشان المنتج القديم يتثبّت كمتتبع
    updates.push({ ref: productRefs[idx], newQty })
  })
  return updates
}

// كتابة فقط - تتنفذ بعد كل القراءات (readStockDeductions وأي قراءات تانية
// في نفس الـ transaction) خلصت
export const commitStockDeductions = (transaction, deductions = []) => {
  deductions.forEach(({ ref, newQty }) => {
    transaction.update(ref, { quantity: newQty })
  })
}

/**
 * عكس الخصم: إرجاع كميات فاتورة ملغاة/مسترجعة للمخزون (قراءة فقط - الكتابة
 * بـ commitStockDeductions بنفس الشكل { ref, newQty }). بيتجاهل المنتجات
 * اللي بدون تتبع مخزون أو اللي اتحذفت.
 */
export const readStockRestores = async (transaction, items = []) => {
  const qtyByProduct = new Map()
  ;(Array.isArray(items) ? items : []).forEach(it => {
    if (!it?.productId || it.trackStock === false) return
    qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + (Number(it.quantity) || 0))
  })
  if (qtyByProduct.size === 0) return []
  const ids = Array.from(qtyByProduct.keys())
  const refs = ids.map(id => doc(db, 'products', id))
  const snaps = await Promise.all(refs.map(ref => transaction.get(ref)))
  const updates = []
  snaps.forEach((snap, idx) => {
    if (!snap.exists()) return
    const data = snap.data()
    if (data.trackStock === false) return
    updates.push({ ref: refs[idx], newQty: (Number(data.quantity) || 0) + qtyByProduct.get(ids[idx]) })
  })
  return updates
}

/**
 * نسخة قديمة مدمجة (قراءة + كتابة سوا) - آمنة الاستخدام بس لو دي أول وآخر
 * عملية في الـ transaction (زي deductProductsStock تحت). لو محتاج تعمل حاجة
 * تانية بعدها في نفس الـ transaction (خصوصاً أي قراءة زي حجز رقم فاتورة)،
 * استخدم readStockDeductions و commitStockDeductions منفصلين بدل ما تستخدم دي.
 */
export const applyStockDeduction = async (transaction, items = []) => {
  const deductions = await readStockDeductions(transaction, items)
  commitStockDeductions(transaction, deductions)
}

/**
 * نسخة مستقلة بتفتح transaction خاصة بيها - للاستخدام لما مفيش transaction
 * جارية أصلاً (زي مسار "البيع الفوري" في نقطة البيع).
 */
export const deductProductsStock = async (items = []) => {
  const trackedItems = items.filter(it => it.productId && it.trackStock !== false)
  if (trackedItems.length === 0) return { ok: true, method: 'none' }

  // 1) الطريقة الأساسية: transaction (بتمنع الكمية تنزل تحت الصفر)
  try {
    await runTransaction(db, async (transaction) => {
      await applyStockDeduction(transaction, items)
    })
    return { ok: true, method: 'transaction' }
  } catch (txError) {
    logger.error('Stock transaction failed, falling back to increment:', txError)

    // 2) احتياطي: خصم مباشر بـ increment - مش محتاج يقرا قبل ما يكتب، فبيشتغل
    // حتى لو الـ transactions فاشلة على الجهاز (اتصال ضعيف، إضافات متصفح...).
    // ممكن الكمية تنزل تحت الصفر لو اتباع أكتر من المتاح - وده بيبان "نفد".
    const qtyByProduct = new Map()
    trackedItems.forEach(it => qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + (Number(it.quantity) || 0)))
    const results = await Promise.allSettled(
      Array.from(qtyByProduct.entries()).map(([id, qty]) =>
        updateDoc(doc(db, 'products', id), { quantity: increment(-qty) })
      )
    )
    const failed = results.filter(r => r.status === 'rejected')
    if (failed.length === 0) return { ok: true, method: 'increment', txError: txError?.code || txError?.message }
    const reason = failed[0].reason?.code || failed[0].reason?.message || txError?.code || 'unknown'
    const err = new Error(`STOCK_DEDUCTION_FAILED: ${reason}`)
    err.code = reason
    throw err
  }
}

// إضافة مادة خام جديدة
export const addRawMaterial = async (materialData) => {
  const material = {
    ...materialData,
    quantity: materialData.initialQuantity || 0,
    reorderLevel: materialData.reorderLevel || 5,
    unit: materialData.unit || 'piece',
    createdAt: new Date(),
    updatedAt: new Date()
  }

  const docRef = await addDoc(collection(db, 'rawMaterials'), material)
  return { id: docRef.id, ...material }
}

// إضافة وصفة لمنتج نهائي
export const addRecipe = async (productId, recipeItems) => {
  const recipe = {
    productId,
    items: recipeItems, // [{ materialId, quantity, unit }]
    createdAt: new Date(),
    updatedAt: new Date()
  }

  const docRef = await addDoc(collection(db, 'recipes'), recipe)
  return { id: docRef.id, ...recipe }
}

// الحصول على وصفة منتج
export const getProductRecipe = async (productId) => {
  const recipesRef = collection(db, 'recipes')
  const q = query(recipesRef, where('productId', '==', productId))
  const querySnapshot = await getDocs(q)

  if (querySnapshot.empty) return null
  return { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() }
}

/**
 * خصم المخزون المباشر للمنتج (حقل quantity في products)
 * تُستخدم عند إتمام عملية بيع. آمنة عند التنفيذ المتزامن بفضل runTransaction.
 * لا تفعل شيئاً إذا كان المنتج لا يتتبع كمية (منتجات خدمية مثلاً).
 */
export const deductProductStock = async (productId, soldQuantity = 1) => {
  const productRef = doc(db, 'products', productId)

  await runTransaction(db, async (transaction) => {
    const productDoc = await transaction.get(productRef)
    if (!productDoc.exists()) return

    const currentQuantity = productDoc.data().quantity
    // بعض المنتجات (خدمات، أصناف بدون تتبع مخزون) ليس لها حقل quantity رقمي
    if (typeof currentQuantity !== 'number') return

    const newQuantity = Math.max(0, currentQuantity - soldQuantity)
    transaction.update(productRef, {
      quantity: newQuantity,
      updatedAt: new Date()
    })
  })
}

/**
 * خصم المواد الخام حسب وصفة المنتج عند البيع (transaction واحدة آمنة).
 * ترجع { success: false, insufficientMaterials } دون أي تعديل إذا كانت الكمية غير كافية،
 * بحيث يمكن للواجهة إيقاف عملية البيع قبل إتمامها بدل التعديل الجزئي غير المتسق.
 */
export const deductRawMaterials = async (productId, soldQuantity = 1) => {
  const recipe = await getProductRecipe(productId)

  if (!recipe || !recipe.items?.length) {
    return { success: true, message: 'منتج بسيط، لا توجد مواد خام للخصم' }
  }

  try {
    await runTransaction(db, async (transaction) => {
      const materialRefs = recipe.items.map((item) => doc(db, 'rawMaterials', item.materialId))
      // يجب تنفيذ كل عمليات القراءة قبل أي كتابة داخل الـ transaction
      const materialDocs = await Promise.all(materialRefs.map((ref) => transaction.get(ref)))

      const insufficientMaterials = []
      const plannedUpdates = []

      materialDocs.forEach((materialDoc, index) => {
        const item = recipe.items[index]
        if (!materialDoc.exists()) {
          insufficientMaterials.push({ name: item.materialId, available: 0, required: item.quantity * soldQuantity })
          return
        }

        const material = materialDoc.data()
        const requiredQuantity = item.quantity * soldQuantity

        if ((material.quantity || 0) < requiredQuantity) {
          insufficientMaterials.push({
            name: material.name,
            available: material.quantity || 0,
            required: requiredQuantity
          })
        } else {
          plannedUpdates.push({
            ref: materialRefs[index],
            newQuantity: material.quantity - requiredQuantity
          })
        }
      })

      if (insufficientMaterials.length > 0) {
        throw new InsufficientStockError(insufficientMaterials)
      }

      plannedUpdates.forEach(({ ref, newQuantity }) => {
        transaction.update(ref, { quantity: newQuantity, updatedAt: new Date() })
      })
    })

    return { success: true, message: 'تم خصم المواد الخام بنجاح' }
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return {
        success: false,
        message: 'مواد خام غير كافية',
        insufficientMaterials: error.insufficientMaterials
      }
    }
    logger.error('deductRawMaterials failed', error)
    throw error
  }
}

/**
 * خصم كامل لصنف مباع: يخصم كمية المنتج نفسه (إن وجدت) بالإضافة إلى
 * مواد وصفته الخام (إن وجدت). يُستخدم من شاشة نقطة البيع عند إتمام الفاتورة.
 */
export const applySaleToInventory = async (productId, soldQuantity = 1) => {
  const recipeResult = await deductRawMaterials(productId, soldQuantity)
  if (!recipeResult.success) {
    return recipeResult
  }

  await deductProductStock(productId, soldQuantity)
  return { success: true }
}

/**
 * عكس عملية applySaleToInventory (إعادة الكمية) — تُستخدم عند فشل جزء من
 * عملية بيع تحتوي على أكثر من صنف، حتى لا يظل المخزون منقوصاً لصنف
 * دفع من أجله العميل ولم تكتمل باقي العملية.
 */
export const revertSaleFromInventory = async (productId, soldQuantity = 1) => {
  const productRef = doc(db, 'products', productId)

  await runTransaction(db, async (transaction) => {
    const productDoc = await transaction.get(productRef)
    if (!productDoc.exists()) return
    const currentQuantity = productDoc.data().quantity
    if (typeof currentQuantity !== 'number') return
    transaction.update(productRef, {
      quantity: currentQuantity + soldQuantity,
      updatedAt: new Date()
    })
  })

  const recipe = await getProductRecipe(productId)
  if (!recipe || !recipe.items?.length) return

  await runTransaction(db, async (transaction) => {
    const materialRefs = recipe.items.map((item) => doc(db, 'rawMaterials', item.materialId))
    const materialDocs = await Promise.all(materialRefs.map((ref) => transaction.get(ref)))

    materialDocs.forEach((materialDoc, index) => {
      if (!materialDoc.exists()) return
      const item = recipe.items[index]
      const material = materialDoc.data()
      transaction.update(materialRefs[index], {
        quantity: (material.quantity || 0) + item.quantity * soldQuantity,
        updatedAt: new Date()
      })
    })
  })
}

// إضافة كمية للمادة الخام (تسلم مشتريات) - عبر transaction لمنع التعارض
export const addRawMaterialQuantity = async (materialId, quantity, cost) => {
  const materialRef = doc(db, 'rawMaterials', materialId)

  const result = await runTransaction(db, async (transaction) => {
    const materialDoc = await transaction.get(materialRef)
    const material = materialDoc.data()
    const previousQuantity = material?.quantity || 0
    const newQuantity = previousQuantity + quantity

    transaction.update(materialRef, {
      quantity: newQuantity,
      updatedAt: new Date()
    })

    return { previousQuantity, newQuantity }
  })

  // تسجيل حركة المخزون بعد نجاح التحديث
  await addDoc(collection(db, 'inventoryTransactions'), {
    materialId,
    type: 'purchase',
    quantity,
    cost,
    previousQuantity: result.previousQuantity,
    newQuantity: result.newQuantity,
    timestamp: new Date(),
    note: 'تسلم مشتريات'
  })

  return { success: true }
}

// جرد المخزون - عبر transaction لمنع التعارض
export const performInventoryCount = async (materialId, countedQuantity) => {
  const materialRef = doc(db, 'rawMaterials', materialId)

  const result = await runTransaction(db, async (transaction) => {
    const materialDoc = await transaction.get(materialRef)
    const material = materialDoc.data()
    const previousQuantity = material?.quantity || 0
    const difference = countedQuantity - previousQuantity

    transaction.update(materialRef, {
      quantity: countedQuantity,
      lastCountDate: new Date(),
      updatedAt: new Date()
    })

    return { previousQuantity, difference }
  })

  // تسجيل حركة الجرد بعد نجاح التحديث
  await addDoc(collection(db, 'inventoryTransactions'), {
    materialId,
    type: 'count',
    quantity: result.difference,
    previousQuantity: result.previousQuantity,
    newQuantity: countedQuantity,
    timestamp: new Date(),
    note: 'جرد مخزون'
  })

  return {
    success: true,
    difference: result.difference,
    message: result.difference >= 0 ? 'زيادة في المخزون' : 'نقص في المخزون'
  }
}

// التحقق من المواد الخام المنخفضة
export const getLowRawMaterials = async (threshold = 5) => {
  const materialsRef = collection(db, 'rawMaterials')
  const q = query(materialsRef, where('quantity', '<=', threshold))
  const querySnapshot = await getDocs(q)

  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }))
}

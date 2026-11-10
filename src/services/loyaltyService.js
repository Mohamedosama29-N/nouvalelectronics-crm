// src/services/loyaltyService.js
import { db } from './firebase'
import { doc, getDoc, updateDoc, addDoc, collection, increment } from 'firebase/firestore'
import QRCode from 'qrcode'

export const loyaltyService = {
  // مستويات الولاء
  tiers: {
    bronze: { pointsRequired: 0, discount: 0, multiplier: 1, color: '#CD7F32', benefits: ['مشروب مجاني كل 100 نقطة'] },
    silver: { pointsRequired: 100, discount: 5, multiplier: 1.2, color: '#C0C0C0', benefits: ['خصم 5%', 'مشروب مجاني كل 80 نقطة', 'أولوية الخدمة'] },
    gold: { pointsRequired: 300, discount: 10, multiplier: 1.5, color: '#FFD700', benefits: ['خصم 10%', 'مشروب مجاني كل 60 نقطة', 'أولوية الخدمة', 'دعوة حدث خاص'] },
    platinum: { pointsRequired: 600, discount: 15, multiplier: 2, color: '#E5E4E2', benefits: ['خصم 15%', 'مشروب مجاني كل 40 نقطة', 'أولوية الخدمة', 'دعوة أحداث', 'هدية عيد ميلاد'] }
  },

  // إنشاء عميل جديد
  async createCustomer(customerData) {
    const customer = {
      ...customerData,
      points: 0,
      totalSpent: 0,
      totalOrders: 0,
      tier: 'bronze',
      qrCode: '',
      birthDate: null,
      preferences: {},
      createdAt: new Date(),
      lastVisit: new Date()
    }
    
    const docRef = await addDoc(collection(db, 'customers'), customer)
    
    // إنشاء QR Code للعميل
    const qrData = JSON.stringify({ customerId: docRef.id, phone: customer.phone })
    const qrCode = await QRCode.toDataURL(qrData)
    await updateDoc(docRef, { qrCode })
    
    return { id: docRef.id, ...customer, qrCode }
  },

  // حساب النقاط
  calculatePoints(amount, amountPerPoint = 10, tierMultiplier = 1) {
    // افتراضياً كل 10 جنيه = 1 نقطة (قابل للتعديل من الاستدعاء)
    const basePoints = Math.floor(amount / amountPerPoint)
    return Math.floor(basePoints * tierMultiplier)
  },

  // إضافة نقاط للعميل
  async addPoints(customerId, amount, invoiceId) {
    const customerRef = doc(db, 'customers', customerId)
    const customerDoc = await getDoc(customerRef)
    const customer = customerDoc.data()
    
    const tierMultiplier = this.tiers[customer.tier]?.multiplier || 1
    const pointsEarned = this.calculatePoints(amount, 10, tierMultiplier)
    const newPoints = customer.points + pointsEarned
    
    // تحديث المستوى بناءً على النقاط
    let newTier = customer.tier
    for (const [tier, config] of Object.entries(this.tiers)) {
      if (newPoints >= config.pointsRequired) {
        newTier = tier
      }
    }
    
    // تسجيل معاملة النقاط
    await addDoc(collection(db, 'pointsTransactions'), {
      customerId,
      invoiceId,
      type: 'earn',
      points: pointsEarned,
      previousPoints: customer.points,
      newPoints,
      amount,
      timestamp: new Date()
    })
    
    await updateDoc(customerRef, {
      points: newPoints,
      totalSpent: increment(amount),
      totalOrders: increment(1),
      tier: newTier,
      lastVisit: new Date()
    })
    
    return { pointsEarned, newPoints, newTier }
  },

  // استبدال النقاط
  async redeemPoints(customerId, pointsToRedeem, rewardType, invoiceId) {
    const customerRef = doc(db, 'customers', customerId)
    const customerDoc = await getDoc(customerRef)
    const customer = customerDoc.data()
    
    if (customer.points < pointsToRedeem) {
      throw new Error('نقاط غير كافية')
    }
    
    let reward = null
    let discountPercent = 0
    
    switch (rewardType) {
      case 'free_coffee':
        if (pointsToRedeem >= 20) {
          reward = { type: 'free_item', item: 'قهوة', quantity: 1 }
        }
        break
      case 'discount_10':
        if (pointsToRedeem >= 20) {
          discountPercent = 10
          reward = { type: 'discount', percent: 10 }
        }
        break
      case 'discount_20':
        if (pointsToRedeem >= 50) {
          discountPercent = 20
          reward = { type: 'discount', percent: 20 }
        }
        break
      case 'birthday_gift': {
        const today = new Date()
        const birthDate = customer.birthDate?.toDate()
        if (birthDate && today.getMonth() === birthDate.getMonth() && today.getDate() === birthDate.getDate()) {
          reward = { type: 'free_item', item: 'كعكة', quantity: 1 }
        } else {
          throw new Error('ليس عيد ميلادك اليوم')
        }
        break
      }
    }
    
    // تسجيل معاملة النقاط
    await addDoc(collection(db, 'pointsTransactions'), {
      customerId,
      invoiceId,
      type: 'redeem',
      points: -pointsToRedeem,
      previousPoints: customer.points,
      newPoints: customer.points - pointsToRedeem,
      reward,
      timestamp: new Date()
    })
    
    await updateDoc(customerRef, {
      points: increment(-pointsToRedeem)
    })
    
    return { reward, discountPercent, remainingPoints: customer.points - pointsToRedeem }
  },

  // الحصول على عروض مخصصة للعميل
  async getPersonalizedOffers(customerId) {
    const customerRef = doc(db, 'customers', customerId)
    const customerDoc = await getDoc(customerRef)
    const customer = customerDoc.data()
    
    const offers = []
    
    // عرض ترقية المستوى
    const nextTier = this.getNextTier(customer.tier)
    if (nextTier) {
      const pointsNeeded = nextTier.pointsRequired - customer.points
      offers.push({
        type: 'tier_upgrade',
        title: `ارتقِ إلى مستوى ${nextTier.name}`,
        description: `تحتاج ${pointsNeeded} نقطة إضافية للارتقاء والاستمتاع بمزيد من المزايا`,
        action: 'اعرف المزيد'
      })
    }
    
    // عرض عيد ميلاد
    const today = new Date()
    const birthDate = customer.birthDate?.toDate()
    if (birthDate && today.getMonth() === birthDate.getMonth() && today.getDate() === birthDate.getDate()) {
      offers.push({
        type: 'birthday',
        title: 'عيد ميلاد سعيد! 🎂',
        description: 'احصل على كعكة مجانية مع أي طلب اليوم',
        action: 'اطلب الآن'
      })
    }
    
    return offers
  },

  getNextTier(currentTier) {
    const tiers = Object.entries(this.tiers)
    const currentIndex = tiers.findIndex(([tier]) => tier === currentTier)
    if (currentIndex < tiers.length - 1) {
      const [nextTierName, nextTierConfig] = tiers[currentIndex + 1]
      return { name: nextTierName, ...nextTierConfig }
    }
    return null
  }
}
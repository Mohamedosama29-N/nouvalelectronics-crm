// src/hooks/useLateKitchenOrders.js
import { useEffect, useState } from 'react'
import { db } from '../services/firebase'
import { collection, onSnapshot, query, where } from 'firebase/firestore'

// نفس المدة المستخدمة في شاشة المطبخ (5 دقايق)
export const LATE_THRESHOLD_MS = 5 * 60 * 1000

/**
 * بيرجع قائمة أوردرات المطبخ اللي فضلت من غير تسليم لمدة أكتر من 5 دقايق،
 * عشان تتعرض كتنبيه في الشاشة الرئيسية (Dashboard). بيتحدث كل 15 ثانية.
 */
export const useLateKitchenOrders = () => {
  const [activeOrders, setActiveOrders] = useState([])
  const [lateOrders, setLateOrders] = useState([])

  useEffect(() => {
    // ⚠️ بنقرا الأوردرات المفتوحة بس (مش كل تاريخ المطبخ من أول يوم) - قبل كده
    // كل فتحة للشاشة كانت بتقرا آلاف الأوردرات القديمة وتستهلك حصة Firebase اليومية.
    // (من غير orderBy عشان ميحتاجش إندكس مركّب - الترتيب بيتعمل على الجهاز)
    const q = query(collection(db, 'kitchenOrders'), where('status', 'in', ['pending', 'preparing', 'ready']))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(o => o.status !== 'completed' && o.status !== 'cancelled')
        .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))
      setActiveOrders(orders)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const computeLate = () => {
      const now = Date.now()
      const late = activeOrders
        .map(order => {
          const startedAt = order.createdAt?.toDate ? order.createdAt.toDate().getTime() : null
          if (!startedAt) return null
          const elapsedMs = now - startedAt
          return elapsedMs > LATE_THRESHOLD_MS ? { ...order, elapsedMs } : null
        })
        .filter(Boolean)
        .sort((a, b) => b.elapsedMs - a.elapsedMs)
      setLateOrders(late)
    }

    computeLate()
    const interval = setInterval(computeLate, 15000)
    return () => clearInterval(interval)
  }, [activeOrders])

  return lateOrders
}

// src/services/auditLog.js
import { db } from './firebase'
import { collection, addDoc } from 'firebase/firestore'
import { logger } from '../utils/logger'

/**
 * تسجيل نشاط حساس في سجل النشاطات (شاشة "سجل النشاطات" في القائمة كانت
 * موجودة وجاهزة للعرض، لكن مفيش أي مكان في السيستم كان بيكتب فيها).
 * لا نوقف العملية الأساسية لو فشل تسجيل اللوج نفسه.
 */
export const logActivity = async (action, userName, details = {}) => {
  try {
    await addDoc(collection(db, 'activityLogs'), {
      action,
      userName: userName || 'مستخدم',
      details,
      timestamp: new Date()
    })
  } catch (error) {
    logger.error('Error writing activity log:', error)
  }
}

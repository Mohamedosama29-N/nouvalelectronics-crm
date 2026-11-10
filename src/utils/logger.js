// src/utils/logger.js
const isDevelopment = import.meta.env.DEV

export const logger = {
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args)
    }
  },
  
  error: (...args) => {
    // حتى في التطوير، نعرض الأخطاء لكن بشكل مبسط
    if (isDevelopment) {
      console.error('[ERROR]:', ...args)
    }
  },
  
  warn: (...args) => {
    if (isDevelopment) {
      console.warn('[WARNING]:', ...args)
    }
  },
  
  info: (...args) => {
    if (isDevelopment) {
      console.info('[INFO]:', ...args)
    }
  },
  
  // سجل الأحداث الهامة فقط (مثل نجاح تسجيل الدخول بدون بيانات)
  audit: (action, userId = null) => {
    if (isDevelopment) {
      console.log(`[AUDIT] ${action}${userId ? ` - User: ${userId}` : ''}`)
    }
  },
  
  // حذف البيانات الحساسة من الـ logs
  sanitize: (data) => {
    if (!data) return data
    const sanitized = { ...data }
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'email', 'phone']
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[HIDDEN]'
      }
    })
    return sanitized
  }
}

export default logger
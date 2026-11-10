// src/services/websocketService.js
import io from 'socket.io-client'
import { logger } from '../utils/logger'

class WebSocketService {
  constructor() {
    this.socket = null
    this.listeners = new Map()
  }

  connect(userId, branchId) {
    // لو فيه اتصال قديم نقفله الأول عشان ميبقاش فيه sockets مكررة
    this.disconnect()
    if (!import.meta.env.VITE_WS_URL) return // مفيش سيرفر إشعارات مضبوط
    this.socket = io(import.meta.env.VITE_WS_URL, {
      query: { userId, branchId },
      transports: ['websocket']
    })

    this.socket.on('connect', () => {
      logger.log('WebSocket connected')
      this.notify('connection', { status: 'connected' })
    })

    this.socket.on('disconnect', () => {
      logger.log('WebSocket disconnected')
      this.notify('connection', { status: 'disconnected' })
    })

    // أحداث النظام
    this.socket.on('new_order', (data) => {
      this.notify('new_order', data)
    })

    this.socket.on('low_stock_alert', (data) => {
      this.notify('low_stock_alert', data)
    })

    this.socket.on('customer_arrived', (data) => {
      this.notify('customer_arrived', data)
    })

    this.socket.on('kitchen_notification', (data) => {
      this.notify('kitchen_notification', data)
    })

    this.socket.on('payment_confirmed', (data) => {
      this.notify('payment_confirmed', data)
    })
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(callback)
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event)
      const index = callbacks.indexOf(callback)
      if (index !== -1) callbacks.splice(index, 1)
    }
  }

  notify(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data))
    }
  }

  // إرسال الأحداث
  sendNewOrder(orderData) {
    if (this.socket) {
      this.socket.emit('new_order', orderData)
    }
  }

  sendStockAlert(alertData) {
    if (this.socket) {
      this.socket.emit('stock_alert', alertData)
    }
  }

  updateOrderStatus(orderId, status) {
    if (this.socket) {
      this.socket.emit('update_order_status', { orderId, status })
    }
  }
}

export const wsService = new WebSocketService()
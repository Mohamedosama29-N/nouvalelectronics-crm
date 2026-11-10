// src/modules/bookings/BookingsManager.jsx
import { useState, useEffect } from 'react'
import { db } from '../../services/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, query, where } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'
import { getLiveSnapshot } from '../../services/liveCollections'

const BookingsManager = () => {
  const { hasPermission } = useAuth()
  const [tables, setTables] = useState([])
  const [bookings, setBookings] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [selectedTable, setSelectedTable] = useState(null)
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    date: new Date().toISOString().split('T')[0],
    time: '19:00',
    guests: 2,
    notes: ''
  })

  useEffect(() => {
    loadTables()
    loadBookings()
  }, [])

  const loadTables = async () => {
    try {
      const snapshot = await getLiveSnapshot('tables')
      let tablesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      if (tablesData.length === 0) {
        // إنشاء طاولات افتراضية
        const defaultTables = []
        for (let i = 1; i <= 10; i++) {
          const capacity = i <= 4 ? 2 : i <= 7 ? 4 : 6
          const newTable = { number: i, capacity, status: 'available', isActive: true }
          const docRef = await addDoc(collection(db, 'tables'), newTable)
          defaultTables.push({ id: docRef.id, ...newTable })
        }
        tablesData = defaultTables
      }
      setTables(tablesData)
    } catch (error) {
      toast.error('فشل تحميل الطاولات')
    }
  }

  const loadBookings = async () => {
    const today = new Date().toISOString().split('T')[0]
    try {
      const q = query(collection(db, 'reservations'), where('date', '>=', today))
      const snapshot = await getDocs(q)
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    } catch (error) {
      logger.error('Error loading bookings:', error)
    }
  }

  const isTableAvailable = (tableId, date, time) => {
    return !bookings.some(b => b.tableId === tableId && b.date === date && b.time === time && b.status !== 'cancelled')
  }

  const createBooking = async () => {
    if (!selectedTable) {
      toast.error('الرجاء اختيار طاولة')
      return
    }
    if (!isTableAvailable(selectedTable.id, formData.date, formData.time)) {
      toast.error('الطاولة محجوزة في هذا الوقت')
      return
    }

    try {
      await addDoc(collection(db, 'reservations'), {
        ...formData,
        tableId: selectedTable.id,
        tableNumber: selectedTable.number,
        status: 'confirmed',
        createdAt: new Date()
      })
      toast.success('تم إنشاء الحجز بنجاح')
      setShowModal(false)
      setSelectedTable(null)
      setFormData({ customerName: '', customerPhone: '', date: new Date().toISOString().split('T')[0], time: '19:00', guests: 2, notes: '' })
      loadBookings()
    } catch (error) {
      toast.error('فشل إنشاء الحجز')
    }
  }

  const updateBookingStatus = async (bookingId, status) => {
    try {
      await updateDoc(doc(db, 'reservations', bookingId), { status, updatedAt: new Date() })
      toast.success(`تم ${status === 'completed' ? 'إنهاء' : status === 'cancelled' ? 'إلغاء' : 'تأكيد'} الحجز`)
      loadBookings()
    } catch (error) {
      toast.error('فشل تحديث الحجز')
    }
  }

  if (!hasPermission('bookings_view')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">🪑 الحجوزات والطاولات</h1>
          <p className="text-gray-500 mt-1">إدارة الطاولات والحجوزات</p>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4 dark:text-white">🗺️ خريطة الطاولات</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {tables.map(table => {
            const isAvailableNow = !bookings.some(b => b.tableId === table.id && b.date === new Date().toISOString().split('T')[0] && b.status === 'confirmed')
            return (
              <div key={table.id} className={`p-4 rounded-xl text-center cursor-pointer transition-all ${isAvailableNow ? 'bg-green-100 hover:bg-green-200 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`} onClick={() => { setSelectedTable(table); setShowModal(true) }}>
                <div className="text-3xl mb-2">🪑</div>
                <p className="font-bold">طاولة {table.number}</p>
                <p className="text-xs">{table.capacity} أشخاص</p>
                <p className={`text-xs mt-1 ${isAvailableNow ? 'text-green-600' : 'text-red-600'}`}>{isAvailableNow ? 'متاحة' : 'محجوزة'}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Today's Bookings */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        <h2 className="text-xl font-bold p-6 pb-0 dark:text-white">📅 حجوزات اليوم</h2>
        <div className="overflow-x-auto p-6">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr><th className="px-6 py-3 text-right">العميل</th><th className="px-6 py-3 text-right">الهاتف</th><th className="px-6 py-3 text-right">الطاولة</th><th className="px-6 py-3 text-right">الوقت</th><th className="px-6 py-3 text-right">الأشخاص</th><th className="px-6 py-3 text-right">الحالة</th><th className="px-6 py-3 text-right">الإجراءات</th></tr>
            </thead>
            <tbody>
              {bookings.filter(b => b.date === new Date().toISOString().split('T')[0]).map(booking => (
                <tr key={booking.id} className="border-t">
                  <td className="px-6 py-4 font-medium">{booking.customerName}</td>
                  <td className="px-6 py-4">{booking.customerPhone}</td>
                  <td className="px-6 py-4">طاولة {booking.tableNumber}</td>
                  <td className="px-6 py-4">{booking.time}</td>
                  <td className="px-6 py-4">{booking.guests}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs ${booking.status === 'confirmed' ? 'bg-green-100 text-green-800' : booking.status === 'completed' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                      {booking.status === 'confirmed' ? 'مؤكد' : booking.status === 'completed' ? 'تم' : 'ملغي'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {booking.status === 'confirmed' && <button onClick={() => updateBookingStatus(booking.id, 'completed')} className="text-green-500"><CheckIcon className="w-5 h-5" /></button>}
                      {booking.status === 'confirmed' && <button onClick={() => updateBookingStatus(booking.id, 'cancelled')} className="text-red-500"><XMarkIcon className="w-5 h-5" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Modal */}
      {showModal && selectedTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">حجز طاولة {selectedTable.number}</h2>
            <div className="space-y-3">
              <input type="text" placeholder="اسم العميل" className="w-full px-4 py-2 border rounded-lg" value={formData.customerName} onChange={(e) => setFormData({...formData, customerName: e.target.value})} />
              <input type="tel" placeholder="رقم الهاتف" className="w-full px-4 py-2 border rounded-lg" value={formData.customerPhone} onChange={(e) => setFormData({...formData, customerPhone: e.target.value})} />
              <input type="date" className="w-full px-4 py-2 border rounded-lg" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} />
              <input type="time" className="w-full px-4 py-2 border rounded-lg" value={formData.time} onChange={(e) => setFormData({...formData, time: e.target.value})} />
              <input type="number" placeholder="عدد الأشخاص" className="w-full px-4 py-2 border rounded-lg" value={formData.guests} onChange={(e) => setFormData({...formData, guests: parseInt(e.target.value)})} />
              <textarea placeholder="ملاحظات" className="w-full px-4 py-2 border rounded-lg" rows="2" value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={createBooking} className="flex-1 bg-blue-500 text-white py-2 rounded-lg">تأكيد الحجز</button>
              <button onClick={() => { setShowModal(false); setSelectedTable(null) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BookingsManager
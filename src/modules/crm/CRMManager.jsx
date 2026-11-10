// src/modules/crm/CRMManager.jsx
import { useState, useEffect, useCallback } from 'react'
import { db } from '../../services/firebase'
import { collection, addDoc } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { 
  UserGroupIcon, 
  EnvelopeIcon, 
  
  
  ChartBarIcon,
  GiftIcon,
  StarIcon,
  ArrowTrendingUpIcon,
  UserPlusIcon,
  MagnifyingGlassIcon,
  
  DocumentArrowDownIcon,
  BellIcon,
  
  
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { logger } from '../../utils/logger'
import { getLiveSnapshot } from '../../services/liveCollections'

const CRMManager = () => {
  const { hasPermission, userData } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSegment, setSelectedSegment] = useState('all')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCampaignModal, setShowCampaignModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [campaignData, setCampaignData] = useState({ name: '', type: 'email', message: '', discount: 0 })
  const [emailData, setEmailData] = useState({ subject: '', message: '' })
  const [analytics, setAnalytics] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    averagePoints: 0,
    totalSpent: 0,
    customerSegments: {},
    monthlyGrowth: []
  })

  // شرائح العملاء
  const segments = [
    { id: 'all', name: 'جميع العملاء', color: 'bg-gray-500', icon: '👥', condition: null },
    { id: 'vip', name: 'VIP', color: 'bg-purple-500', icon: '💎', minSpent: 5000, minOrders: 20 },
    { id: 'loyal', name: 'موالون', color: 'bg-blue-500', icon: '⭐', minSpent: 2000, minOrders: 10 },
    { id: 'regular', name: 'عاديون', color: 'bg-green-500', icon: '✅', minSpent: 500, minOrders: 3 },
    { id: 'new', name: 'جدد', color: 'bg-yellow-500', icon: '🆕', maxDays: 30 },
    { id: 'inactive', name: 'غير نشطين', color: 'bg-red-500', icon: '😴', minDays: 90 },
    { id: 'high_value', name: 'قيمة عالية', color: 'bg-indigo-500', icon: '💰', minAvgSpent: 200 },
    { id: 'frequent', name: 'كثيفو الزيارة', color: 'bg-cyan-500', icon: '🔄', minVisits: 15 }
  ]


  const loadCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const snapshot = await getLiveSnapshot('customers')
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setCustomers(customersData)
    } catch (error) {
      toast.error('فشل تحميل العملاء')
    } finally {
      setLoading(false)
    }
  }, [])


  const loadAnalytics = useCallback(async () => {
    try {
      const snapshot = await getLiveSnapshot('customers')
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      
      const totalCustomers = customersData.length
      const totalSpent = customersData.reduce((sum, c) => sum + (c.totalSpent || 0), 0)
      const averagePoints = customersData.reduce((sum, c) => sum + (c.points || 0), 0) / (totalCustomers || 1)
      
      // تحليل الشرائح
      const customerSegments = {}
      customersData.forEach(customer => {
        const segment = getCustomerSegment(customer)
        customerSegments[segment] = (customerSegments[segment] || 0) + 1
      })

      setAnalytics({
        totalCustomers,
        activeCustomers: customersData.filter(c => c.isActive !== false).length,
        averagePoints: averagePoints.toFixed(1),
        totalSpent,
        customerSegments,
        monthlyGrowth: calculateMonthlyGrowth(customersData)
      })
    } catch (error) {
      logger.error('Error loading analytics:', error)
    }
  }, [])

  useEffect(() => {
    loadCustomers()
    loadAnalytics()
  }, [loadCustomers, loadAnalytics])


  const getCustomerSegment = (customer) => {
    const now = new Date()
    const lastVisit = customer.lastVisit?.toDate() || new Date(customer.lastVisit)
    const daysSinceLastVisit = Math.floor((now - lastVisit) / (1000 * 60 * 60 * 24))
    const avgOrderValue = (customer.totalSpent || 0) / (customer.orders || 1)

    if ((customer.totalSpent || 0) >= 5000 && (customer.orders || 0) >= 20) return 'vip'
    if ((customer.totalSpent || 0) >= 2000 && (customer.orders || 0) >= 10) return 'loyal'
    if ((customer.totalSpent || 0) >= 500 && (customer.orders || 0) >= 3) return 'regular'
    if (daysSinceLastVisit <= 30 && (customer.orders || 0) === 1) return 'new'
    if (daysSinceLastVisit > 90) return 'inactive'
    if (avgOrderValue >= 200) return 'high_value'
    if ((customer.orders || 0) >= 15) return 'frequent'
    return 'regular'
  }

  const calculateMonthlyGrowth = (customersData) => {
    const monthly = {}
    customersData.forEach(customer => {
      if (customer.createdAt) {
        const month = customer.createdAt.toDate().toLocaleString('default', { month: 'short' })
        monthly[month] = (monthly[month] || 0) + 1
      }
    })
    return Object.entries(monthly).map(([month, count]) => ({ month, count }))
  }

  const getFilteredCustomers = () => {
    let filtered = [...customers]
    
    if (searchTerm) {
      filtered = filtered.filter(c => 
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.includes(searchTerm) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }
    
    if (selectedSegment !== 'all') {
      filtered = filtered.filter(c => getCustomerSegment(c) === selectedSegment)
    }
    
    return filtered
  }

  const sendCampaign = async () => {
    const targetCustomers = getFilteredCustomers()
    if (targetCustomers.length === 0) {
      toast.error('لا يوجد عملاء مستهدفين')
      return
    }

    try {
      // تسجيل الحملة
      await addDoc(collection(db, 'campaigns'), {
        name: campaignData.name,
        type: campaignData.type,
        targetSegment: selectedSegment,
        targetCount: targetCustomers.length,
        message: campaignData.message,
        discount: campaignData.discount,
        sentBy: userData?.uid,
        sentAt: new Date(),
        status: 'sent'
      })

      toast.success(`تم إرسال الحملة إلى ${targetCustomers.length} عميل`)
      setShowCampaignModal(false)
      setCampaignData({ name: '', type: 'email', message: '', discount: 0 })
    } catch (error) {
      toast.error('فشل إرسال الحملة')
    }
  }

  const sendEmailToCustomer = async (customer) => {
    if (!emailData.subject || !emailData.message) {
      toast.error('الرجاء إدخال الموضوع والرسالة')
      return
    }

    try {
      await addDoc(collection(db, 'customerMessages'), {
        customerId: customer.id,
        customerName: customer.name,
        subject: emailData.subject,
        message: emailData.message,
        type: 'email',
        sentBy: userData?.uid,
        sentAt: new Date()
      })
      toast.success(`تم إرسال البريد إلى ${customer.name}`)
      setShowEmailModal(false)
      setEmailData({ subject: '', message: '' })
      setSelectedCustomer(null)
    } catch (error) {
      toast.error('فشل إرسال البريد')
    }
  }

  const exportCustomers = () => {
    const exportData = getFilteredCustomers().map(c => ({
      'الاسم': c.name,
      'الهاتف': c.phone,
      'البريد': c.email,
      'الشرائح': getCustomerSegment(c),
      'النقاط': c.points || 0,
      'إجمالي المشتريات': c.totalSpent || 0,
      'عدد الطلبات': c.orders || 0,
      'آخر زيارة': c.lastVisit?.toDate().toLocaleDateString('ar-EG') || '—'
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'العملاء')
    XLSX.writeFile(wb, `CRM_العملاء_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success('تم تصدير بيانات العملاء')
  }

  const sendLoyaltyNotification = async (customer) => {
    if ((customer.points || 0) >= 20) {
      toast(`💎 ${customer.name} لديه ${customer.points} نقطة ويمكنه استبدالها!`, { icon: 'ℹ️' })
    }
  }

  if (!hasPermission('crm_view')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  const filteredCustomers = getFilteredCustomers()
  const segmentStats = {}
  customers.forEach(c => {
    const seg = getCustomerSegment(c)
    segmentStats[seg] = (segmentStats[seg] || 0) + 1
  })

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">📊 نظام CRM المتقدم</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">إدارة علاقات العملاء - تحليلات متقدمة وحملات تسويقية</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportCustomers} className="bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <DocumentArrowDownIcon className="w-5 h-5" /> تصدير Excel
          </button>
          <button onClick={() => setShowCampaignModal(true)} className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <BellIcon className="w-5 h-5" /> حملة تسويقية
          </button>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center">
            <div><p className="opacity-80">إجمالي العملاء</p><p className="text-3xl font-bold">{analytics.totalCustomers}</p></div>
            <UserGroupIcon className="w-10 h-10 opacity-80" />
          </div>
        </div>
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center">
            <div><p className="opacity-80">إجمالي المشتريات</p><p className="text-3xl font-bold">{analytics.totalSpent.toFixed(0)} ج.م</p></div>
            <ArrowTrendingUpIcon className="w-10 h-10 opacity-80" />
          </div>
        </div>
        <div className="bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center">
            <div><p className="opacity-80">متوسط النقاط</p><p className="text-3xl font-bold">{analytics.averagePoints}</p></div>
            <StarIcon className="w-10 h-10 opacity-80" />
          </div>
        </div>
        <div className="bg-gradient-to-r from-pink-500 to-rose-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center">
            <div><p className="opacity-80">عملاء نشطون</p><p className="text-3xl font-bold">{analytics.activeCustomers}</p></div>
            <UserPlusIcon className="w-10 h-10 opacity-80" />
          </div>
        </div>
      </div>

      {/* Segments */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4 dark:text-white">📂 شرائح العملاء</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {segments.map(segment => (
            <button
              key={segment.id}
              onClick={() => setSelectedSegment(segment.id)}
              className={`p-3 rounded-xl text-center transition-all ${selectedSegment === segment.id ? `${segment.color} text-white shadow-lg scale-105` : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              <div className="text-2xl mb-1">{segment.icon}</div>
              <p className="text-sm font-semibold">{segment.name}</p>
              <p className="text-xs mt-1">{segmentStats[segment.id] || 0}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="mb-6 relative">
        <MagnifyingGlassIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="🔍 بحث بالاسم، الهاتف، أو البريد الإلكتروني..."
          className="w-full pr-10 pl-4 py-3 border rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Customers Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-right">العميل</th>
                <th className="px-6 py-3 text-right">الشرائح</th>
                <th className="px-6 py-3 text-right">النقاط</th>
                <th className="px-6 py-3 text-right">المشتريات</th>
                <th className="px-6 py-3 text-right">الطلبات</th>
                <th className="px-6 py-3 text-right">آخر زيارة</th>
                <th className="px-6 py-3 text-right">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center py-8">جاري التحميل...</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-8 text-gray-500">لا يوجد عملاء</td></tr>
              ) : (
                filteredCustomers.map(customer => {
                  const segment = getCustomerSegment(customer)
                  const segmentInfo = segments.find(s => s.id === segment)
                  return (
                    <tr key={customer.id} className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold dark:text-white">{customer.name}</p>
                          <p className="text-sm text-gray-500">{customer.phone}</p>
                          {customer.email && <p className="text-xs text-gray-400">{customer.email}</p>}
                        </div>
                       </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs text-white ${segmentInfo?.color || 'bg-gray-500'}`}>
                          {segmentInfo?.icon} {segmentInfo?.name}
                        </span>
                       </td>
                      <td className="px-6 py-4 font-bold text-blue-600">{customer.points || 0}</td>
                      <td className="px-6 py-4">{customer.totalSpent?.toFixed(0) || 0} ج.م</td>
                      <td className="px-6 py-4">{customer.orders || 0}</td>
                      <td className="px-6 py-4 text-gray-500">{customer.lastVisit?.toDate().toLocaleDateString('ar-EG') || '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => { setSelectedCustomer(customer); setShowEmailModal(true) }} className="text-blue-500 hover:text-blue-700" title="إرسال بريد">
                            <EnvelopeIcon className="w-5 h-5" />
                          </button>
                          <button onClick={() => sendLoyaltyNotification(customer)} className="text-purple-500 hover:text-purple-700" title="إشعار ولاء">
                            <GiftIcon className="w-5 h-5" />
                          </button>
                          <button onClick={() => setSelectedCustomer(customer)} className="text-green-500 hover:text-green-700" title="عرض التفاصيل">
                            <ChartBarIcon className="w-5 h-5" />
                          </button>
                        </div>
                       </td>
                     </tr>
                  )
                })
              )}
            </tbody>
           </table>
        </div>
      </div>

      {/* Customer Details Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold dark:text-white">تفاصيل العميل</h2>
              <button onClick={() => setSelectedCustomer(null)} className="text-gray-500">✕</button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div><p className="text-gray-500">الاسم</p><p className="font-semibold">{selectedCustomer.name}</p></div>
                <div><p className="text-gray-500">الهاتف</p><p className="font-semibold">{selectedCustomer.phone}</p></div>
                <div><p className="text-gray-500">البريد</p><p className="font-semibold">{selectedCustomer.email || '—'}</p></div>
                <div><p className="text-gray-500">العنوان</p><p className="font-semibold">{selectedCustomer.address || '—'}</p></div>
                <div><p className="text-gray-500">نقاط الولاء</p><p className="font-semibold text-blue-600">{selectedCustomer.points || 0}</p></div>
                <div><p className="text-gray-500">إجمالي المشتريات</p><p className="font-semibold text-green-600">{selectedCustomer.totalSpent?.toFixed(2) || 0} ج.م</p></div>
                <div><p className="text-gray-500">عدد الطلبات</p><p className="font-semibold">{selectedCustomer.orders || 0}</p></div>
                <div><p className="text-gray-500">آخر زيارة</p><p className="font-semibold">{selectedCustomer.lastVisit?.toDate().toLocaleDateString('ar-EG') || '—'}</p></div>
              </div>
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-400">
                  💡 {selectedCustomer.points >= 20 ? `يمكنه استبدال ${selectedCustomer.points} نقطة!` : `تحتاج ${20 - (selectedCustomer.points || 0)} نقطة للحصول على مكافأة`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">حملة تسويقية جديدة</h2>
            <div className="space-y-3">
              <input type="text" placeholder="اسم الحملة" className="w-full px-4 py-2 border rounded-lg" value={campaignData.name} onChange={(e) => setCampaignData({...campaignData, name: e.target.value})} />
              <select className="w-full px-4 py-2 border rounded-lg" value={campaignData.type} onChange={(e) => setCampaignData({...campaignData, type: e.target.value})}>
                <option value="email">📧 بريد إلكتروني</option>
                <option value="sms">📱 رسالة نصية</option>
                <option value="whatsapp">💬 واتساب</option>
                <option value="notification">🔔 إشعار</option>
              </select>
              <textarea placeholder="نص الرسالة" className="w-full px-4 py-2 border rounded-lg" rows="4" value={campaignData.message} onChange={(e) => setCampaignData({...campaignData, message: e.target.value})} />
              <input type="number" placeholder="خصم (%) - اختياري" className="w-full px-4 py-2 border rounded-lg" value={campaignData.discount} onChange={(e) => setCampaignData({...campaignData, discount: parseFloat(e.target.value)})} />
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600">سيتم إرسال الحملة إلى {filteredCustomers.length} عميل</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={sendCampaign} className="flex-1 bg-blue-500 text-white py-2 rounded-lg">إرسال الحملة</button>
              <button onClick={() => setShowCampaignModal(false)} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 dark:text-white">إرسال بريد إلى {selectedCustomer.name}</h2>
            <div className="space-y-3">
              <input type="text" placeholder="الموضوع" className="w-full px-4 py-2 border rounded-lg" value={emailData.subject} onChange={(e) => setEmailData({...emailData, subject: e.target.value})} />
              <textarea placeholder="الرسالة" className="w-full px-4 py-2 border rounded-lg" rows="5" value={emailData.message} onChange={(e) => setEmailData({...emailData, message: e.target.value})} />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => sendEmailToCustomer(selectedCustomer)} className="flex-1 bg-blue-500 text-white py-2 rounded-lg">إرسال</button>
              <button onClick={() => { setShowEmailModal(false); setSelectedCustomer(null) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRMManager
// src/modules/loyalty/LoyaltyProgram.jsx
import { useState, useEffect, useCallback, useMemo} from 'react'
import { db } from '../../services/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, query, orderBy, limit } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { GiftIcon, TrophyIcon, StarIcon, SparklesIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'
import { getLiveSnapshot } from '../../services/liveCollections'

const availableRewards = [
  { id: 'free_coffee', name: 'قهوة مجانية', points: 20, icon: '☕', description: 'كوب قهوة مجاني من اختيارك' },
  { id: 'discount_10', name: 'خصم 10%', points: 20, icon: '🎫', description: 'خصم 10% على الفاتورة القادمة' },
  { id: 'discount_20', name: 'خصم 20%', points: 50, icon: '🎁', description: 'خصم 20% على الفاتورة القادمة' },
  { id: 'free_cake', name: 'قطعة كيك', points: 40, icon: '🍰', description: 'قطعة كيك مجانية' },
  { id: 'free_sandwich', name: 'ساندويتش', points: 60, icon: '🥪', description: 'ساندويتش مجاني' },
  { id: 'birthday_gift', name: 'هدية عيد ميلاد', points: 30, icon: '🎂', description: 'هدية خاصة في عيد ميلادك' }
]

const LoyaltyProgram = () => {
  const { hasPermission } = useAuth()
  const [customers, setCustomers] = useState([])
  const [rewards, setRewards] = useState([])
  const [transactions, setTransactions] = useState([])
  const [showRewardModal, setShowRewardModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [pointsToRedeem, setPointsToRedeem] = useState(0)
  const [selectedReward, setSelectedReward] = useState(null)

  const tiers = [
    { name: 'برونزي', points: 0, discount: 0, color: 'bg-amber-600', icon: '🥉', multiplier: 1 },
    { name: 'فضي', points: 100, discount: 5, color: 'bg-gray-400', icon: '🥈', multiplier: 1.2 },
    { name: 'ذهبي', points: 300, discount: 10, color: 'bg-yellow-500', icon: '🥇', multiplier: 1.5 },
    { name: 'بلاتينيوم', points: 600, discount: 15, color: 'bg-purple-500', icon: '💎', multiplier: 2 }
  ]



  const loadCustomers = useCallback(async () => {
    try {
      const snapshot = await getLiveSnapshot('customers')
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setCustomers(customersData.sort((a, b) => (b.points || 0) - (a.points || 0)))
    } catch (error) {
      toast.error('فشل تحميل العملاء')
    }
  }, [])


  const loadRewards = useCallback(async () => {
    try {
      const snapshot = await getLiveSnapshot('loyaltyRewards')
      if (!snapshot.empty) {
        setRewards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
      } else {
        setRewards(availableRewards)
      }
    } catch (error) {
      setRewards(availableRewards)
    }
  }, [])


  const loadTransactions = useCallback(async () => {
    try {
      const q = query(collection(db, 'loyaltyTransactions'), orderBy('timestamp', 'desc'), limit(50))
      const snapshot = await getDocs(q)
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    } catch (error) {
      logger.error('Error loading transactions:', error)
    }
  }, [])

  useEffect(() => {
    loadCustomers()
    loadRewards()
    loadTransactions()
  }, [loadCustomers, loadRewards, loadTransactions])


  // الإحصائيات بتتحسب من العملاء مباشرة (كانت قبل كده state بتتحسب مرة واحدة على قائمة فاضية)
  const stats = useMemo(() => {
    const totalPoints = customers.reduce((sum, c) => sum + (c.points || 0), 0)
    return {
      totalPoints,
      totalCustomers: customers.length,
      topCustomer: customers[0],
      pointsIssuedMonth: Math.floor(totalPoints * 0.3)
    }
  }, [customers])


  const getTier = (points) => {
    let currentTier = tiers[0]
    for (const tier of tiers.slice().reverse()) {
      if (points >= tier.points) {
        currentTier = tier
        break
      }
    }
    return currentTier
  }

  const redeemReward = async () => {
    if (!selectedCustomer) {
      toast.error('الرجاء اختيار عميل')
      return
    }
    if (selectedCustomer.points < pointsToRedeem) {
      toast.error('نقاط غير كافية')
      return
    }

    try {
      const customerRef = doc(db, 'customers', selectedCustomer.id)
      await updateDoc(customerRef, {
        points: (selectedCustomer.points || 0) - pointsToRedeem
      })

      await addDoc(collection(db, 'loyaltyTransactions'), {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        type: 'redeem',
        points: -pointsToRedeem,
        reward: selectedReward,
        timestamp: new Date()
      })

      toast.success(`تم استبدال ${pointsToRedeem} نقطة بنجاح!`)
      setShowRewardModal(false)
      setPointsToRedeem(0)
      setSelectedReward(null)
      loadCustomers()
      loadTransactions()
    } catch (error) {
      toast.error('فشل استبدال النقاط')
    }
  }

  const addPointsManually = async (customer, points) => {
    const newPoints = (customer.points || 0) + points
    try {
      const customerRef = doc(db, 'customers', customer.id)
      await updateDoc(customerRef, { points: newPoints })

      await addDoc(collection(db, 'loyaltyTransactions'), {
        customerId: customer.id,
        customerName: customer.name,
        type: 'manual_add',
        points,
        timestamp: new Date()
      })

      toast.success(`تم إضافة ${points} نقطة لـ ${customer.name}`)
      loadCustomers()
      loadTransactions()
    } catch (error) {
      toast.error('فشل إضافة النقاط')
    }
  }

  if (!hasPermission('loyalty_view')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">🎁 نظام الولاء</h1>
          <p className="text-gray-500 mt-1">إدارة نقاط الولاء ومكافآت العملاء</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center">
            <div><p className="opacity-80">إجمالي النقاط</p><p className="text-3xl font-bold">{stats.totalPoints}</p></div>
            <StarIcon className="w-10 h-10 opacity-80" />
          </div>
        </div>
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center">
            <div><p className="opacity-80">عدد العملاء</p><p className="text-3xl font-bold">{stats.totalCustomers}</p></div>
            <TrophyIcon className="w-10 h-10 opacity-80" />
          </div>
        </div>
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center">
            <div><p className="opacity-80">نقاط هذا الشهر</p><p className="text-3xl font-bold">{stats.pointsIssuedMonth}</p></div>
            <SparklesIcon className="w-10 h-10 opacity-80" />
          </div>
        </div>
        <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center">
            <div><p className="opacity-80">أفضل عميل</p><p className="text-xl font-bold truncate">{stats.topCustomer?.name || '—'}</p></div>
            <GiftIcon className="w-10 h-10 opacity-80" />
          </div>
        </div>
      </div>

      {/* Customers List with Tiers */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden mb-8">
        <div className="p-6 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold dark:text-white">🏆 ترتيب العملاء حسب النقاط</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-right">#</th>
                <th className="px-6 py-3 text-right">العميل</th>
                <th className="px-6 py-3 text-right">المستوى</th>
                <th className="px-6 py-3 text-right">النقاط</th>
                <th className="px-6 py-3 text-right">الخصم</th>
                <th className="px-6 py-3 text-right">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {customers.slice(0, 20).map((customer, idx) => {
                const tier = getTier(customer.points || 0)
                return (
                  <tr key={customer.id} className="border-t dark:border-gray-700">
                    <td className="px-6 py-4 font-bold">#{idx + 1}</td>
                    <td className="px-6 py-4 font-medium">{customer.name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-white text-sm ${tier.color}`}>
                        {tier.icon} {tier.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-blue-600">{customer.points || 0}</td>
                    <td className="px-6 py-4 text-green-600">{tier.discount}%</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => { setSelectedCustomer(customer); setShowRewardModal(true) }} className="px-3 py-1 bg-purple-500 text-white rounded-lg text-sm">استبدال</button>
                        <button onClick={() => addPointsManually(customer, 10)} className="px-3 py-1 bg-green-500 text-white rounded-lg text-sm">+10</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Available Rewards */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        <div className="p-6 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold dark:text-white">🎁 المكافآت المتاحة</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {rewards.map(reward => (
              <div key={reward.id} className="text-center p-4 border rounded-lg hover:shadow-lg transition-shadow">
                <div className="text-4xl mb-2">{reward.icon}</div>
                <p className="font-bold text-sm">{reward.name}</p>
                <p className="text-xs text-gray-500 my-1">{reward.points} نقطة</p>
                <p className="text-xs text-gray-400">{reward.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden mt-8">
        <div className="p-6 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold dark:text-white">📊 آخر المعاملات</h2>
        </div>
        <div className="overflow-x-auto p-6">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr><th className="px-6 py-3 text-right">العميل</th><th className="px-6 py-3 text-right">النوع</th><th className="px-6 py-3 text-right">النقاط</th><th className="px-6 py-3 text-right">التاريخ</th></tr>
            </thead>
            <tbody>
              {transactions.map(trans => (
                <tr key={trans.id} className="border-t">
                  <td className="px-6 py-4">{trans.customerName}</td>
                  <td className="px-6 py-4">{trans.type === 'earn' ? '🌟 كسب' : trans.type === 'redeem' ? '🎁 استبدال' : '✨ إضافة يدوية'}</td>
                  <td className="px-6 py-4 font-bold text-blue-600">{trans.points > 0 ? `+${trans.points}` : trans.points}</td>
                  <td className="px-6 py-4 text-gray-500">{trans.timestamp?.toDate().toLocaleString('ar-EG')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Redeem Modal */}
      {showRewardModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">استبدال النقاط</h2>
            <p className="mb-4">العميل: <strong>{selectedCustomer.name}</strong></p>
            <p className="mb-4">النقاط المتاحة: <strong className="text-blue-600">{selectedCustomer.points || 0}</strong></p>
            
            <select className="w-full px-4 py-2 border rounded-lg mb-4" value={selectedReward?.id || ''} onChange={(e) => {
              const reward = rewards.find(r => r.id === e.target.value)
              setSelectedReward(reward)
              setPointsToRedeem(reward?.points || 0)
            }}>
              <option value="">اختر مكافأة</option>
              {rewards.map(r => (
                <option key={r.id} value={r.id} disabled={(selectedCustomer.points || 0) < r.points}>
                  {r.name} - {r.points} نقطة
                </option>
              ))}
            </select>
            
            <div className="flex gap-3 mt-6">
              <button onClick={redeemReward} disabled={!selectedReward || (selectedCustomer.points || 0) < pointsToRedeem} className="flex-1 bg-purple-500 text-white py-2 rounded-lg disabled:opacity-50">استبدال</button>
              <button onClick={() => { setShowRewardModal(false); setSelectedReward(null); setPointsToRedeem(0) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoyaltyProgram
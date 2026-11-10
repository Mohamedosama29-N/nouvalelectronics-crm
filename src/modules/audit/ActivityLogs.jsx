// src/modules/audit/ActivityLogs.jsx
import { useState, useEffect } from 'react'
import { db } from '../../services/firebase'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { ClockIcon } from '@heroicons/react/24/outline'
import { logger } from '../../utils/logger'

const ActivityLogs = () => {
  const { hasPermission } = useAuth()
  const [logs, setLogs] = useState([])

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    try {
      const q = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(100))
      const snapshot = await getDocs(q)
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    } catch (error) {
      logger.error('Error loading logs:', error)
    }
  }

  if (!hasPermission('logs_view')) return <div className="p-6 text-center text-red-600">غير مصرح</div>

  return (
    <div className="p-6 rtl">
      <h1 className="text-3xl font-bold dark:text-white mb-6">📋 سجل النشاطات</h1>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        <div className="p-6 space-y-3">
          {logs.length === 0 ? <p className="text-center text-gray-500">لا توجد نشاطات</p> : logs.map(log => (
            <div key={log.id} className="flex items-start gap-3 p-3 border-b dark:border-gray-700">
              <ClockIcon className="w-5 h-5 text-gray-400 mt-1" />
              <div><p className="font-medium">{log.action}</p><p className="text-sm text-gray-500">{log.userName} • {log.timestamp?.toDate().toLocaleString('ar-EG')}</p></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
export default ActivityLogs
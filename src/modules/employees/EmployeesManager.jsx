// src/modules/employees/EmployeesManager.jsx
import { useState, useEffect } from 'react'
import { db } from '../../services/firebase'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'
import { getLiveSnapshot } from '../../services/liveCollections'

const EmployeesManager = () => {
  const { hasPermission } = useAuth()
  const [employees, setEmployees] = useState([])
  const [attendance, setAttendance] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    position: '',
    salary: 0,
    hireDate: new Date().toISOString().split('T')[0],
    shift: 'morning',
    isActive: true
  })

  const shifts = [
    { id: 'morning', name: 'صباحي (8ص - 4م)', hours: 8 },
    { id: 'evening', name: 'مسائي (4م - 12ص)', hours: 8 },
    { id: 'night', name: 'ليلي (12ص - 8ص)', hours: 8 },
    { id: 'full', name: 'كامل اليوم', hours: 12 }
  ]

  useEffect(() => {
    loadEmployees()
    loadAttendance()
  }, [])

  const loadEmployees = async () => {
    try {
      const snapshot = await getLiveSnapshot('employees')
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    } catch (error) {
      toast.error('فشل تحميل الموظفين')
    }
  }

  const loadAttendance = async () => {
    const today = new Date().toISOString().split('T')[0]
    try {
      const q = query(collection(db, 'attendance'), where('date', '==', today))
      const snapshot = await getDocs(q)
      setAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    } catch (error) {
      logger.error('Error loading attendance:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingEmployee) {
        await updateDoc(doc(db, 'employees', editingEmployee.id), { ...formData, updatedAt: new Date() })
        toast.success('تم تحديث بيانات الموظف')
      } else {
        await addDoc(collection(db, 'employees'), { ...formData, createdAt: new Date() })
        toast.success('تم إضافة الموظف')
      }
      setShowModal(false)
      setEditingEmployee(null)
      setFormData({ name: '', phone: '', email: '', position: '', salary: 0, hireDate: new Date().toISOString().split('T')[0], shift: 'morning', isActive: true })
      loadEmployees()
    } catch (error) {
      toast.error('حدث خطأ')
    }
  }

  const handleDelete = async (employeeId) => {
    if (!hasPermission('employees_manage')) {
      toast.error('ليس لديك صلاحية حذف الموظفين')
      return
    }
    if (!window.confirm('متأكد إنك عايز تحذف الموظف ده؟')) return
    try {
      await deleteDoc(doc(db, 'employees', employeeId))
      toast.success('تم حذف الموظف')
      loadEmployees()
    } catch (error) {
      logger.error('Error deleting employee:', error)
      toast.error('فشل حذف الموظف')
    }
  }

  const markAttendance = async (employeeId, status) => {
    const today = new Date().toISOString().split('T')[0]
    try {
      await addDoc(collection(db, 'attendance'), {
        employeeId,
        date: today,
        status,
        timestamp: new Date()
      })
      toast.success('تم تسجيل الحضور')
      loadAttendance()
    } catch (error) {
      toast.error('فشل تسجيل الحضور')
    }
  }

  const getTodayAttendance = (employeeId) => {
    const record = attendance.find(a => a.employeeId === employeeId)
    return record?.status || 'absent'
  }

  if (!hasPermission('employees_view')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">👥 الموظفين</h1>
          <p className="text-gray-500 mt-1">إدارة بيانات الموظفين والحضور والمرتبات</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <PlusIcon className="w-5 h-5" /> موظف جديد
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-right">الاسم</th>
              <th className="px-6 py-3 text-right">الوظيفة</th>
              <th className="px-6 py-3 text-right">الوردية</th>
              <th className="px-6 py-3 text-right">الراتب</th>
              <th className="px-6 py-3 text-right">حضور اليوم</th>
              <th className="px-6 py-3 text-right">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => {
              const attendanceStatus = getTodayAttendance(emp.id)
              return (
                <tr key={emp.id} className="border-t dark:border-gray-700">
                  <td className="px-6 py-4 font-medium">{emp.name}</td>
                  <td className="px-6 py-4">{emp.position}</td>
                  <td className="px-6 py-4">{shifts.find(s => s.id === emp.shift)?.name || emp.shift}</td>
                  <td className="px-6 py-4">{emp.salary} ج.م</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      <button onClick={() => markAttendance(emp.id, 'present')} className={`px-2 py-1 text-xs rounded ${attendanceStatus === 'present' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>حاضر</button>
                      <button onClick={() => markAttendance(emp.id, 'late')} className={`px-2 py-1 text-xs rounded ${attendanceStatus === 'late' ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}>متأخر</button>
                      <button onClick={() => markAttendance(emp.id, 'absent')} className={`px-2 py-1 text-xs rounded ${attendanceStatus === 'absent' ? 'bg-red-500 text-white' : 'bg-gray-200'}`}>غائب</button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingEmployee(emp); setFormData(emp); setShowModal(true) }} className="text-blue-500"><PencilIcon className="w-5 h-5" /></button>
                      <button onClick={() => handleDelete(emp.id)} className="text-red-500"><TrashIcon className="w-5 h-5" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">{editingEmployee ? 'تعديل موظف' : 'إضافة موظف جديد'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-3">
                <input type="text" placeholder="الاسم الكامل" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                <input type="tel" placeholder="رقم الهاتف" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                <input type="email" placeholder="البريد الإلكتروني" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                <input type="text" placeholder="الوظيفة" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.position} onChange={(e) => setFormData({...formData, position: e.target.value})} />
                <input type="number" placeholder="الراتب" className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.salary} onChange={(e) => setFormData({...formData, salary: parseFloat(e.target.value)})} />
                <select className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700" value={formData.shift} onChange={(e) => setFormData({...formData, shift: e.target.value})}>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-2 rounded-lg">حفظ</button>
                <button type="button" onClick={() => { setShowModal(false); setEditingEmployee(null) }} className="flex-1 bg-gray-500 text-white py-2 rounded-lg">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default EmployeesManager
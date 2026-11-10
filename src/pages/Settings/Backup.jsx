// pages/Settings/Backup.jsx
import { useState, useEffect } from 'react';
import { db } from '../../services/firebase';
import { collection, getDocs, query, orderBy, limit, writeBatch, doc, setDoc } from 'firebase/firestore';
import { CloudArrowUpIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export const Backup = () => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    setLoading(true);
    const backupsRef = collection(db, 'backups');
    const q = query(backupsRef, orderBy('timestamp', 'desc'), limit(50));
    const snapshot = await getDocs(q);
    const backupsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setBackups(backupsData);
    setLoading(false);
  };

  const createManualBackup = async () => {
    try {
      // استدعاء Cloud Function
      const response = await fetch('/api/createBackup', { method: 'POST' });
      if (response.ok) {
        toast.success('تم إنشاء النسخة الاحتياطية بنجاح');
        loadBackups();
      }
    } catch (error) {
      toast.error('فشل إنشاء النسخة الاحتياطية');
    }
  };

  const restoreBackup = async (backupId, backupUrl) => {
    if (!window.confirm('تحذير: استعادة النسخة الاحتياطية ستستبدل جميع البيانات الحالية. هل أنت متأكد؟')) {
      return;
    }
    
    setRestoring(true);
    try {
      // تحميل ملف النسخة
      const response = await fetch(backupUrl);
      const backupData = await response.json();
      
      // استعادة كل مجموعة
      for (const [collectionName, documents] of Object.entries(backupData)) {
        const collectionRef = collection(db, collectionName);
        
        // حذف البيانات الحالية
        const existingDocs = await getDocs(collectionRef);
        const batch = writeBatch(db);
        existingDocs.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
        
        // إضافة البيانات الجديدة
        for (const docData of documents) {
          const docRef = doc(db, collectionName, docData.id);
          await setDoc(docRef, docData);
        }
      }
      
      toast.success('تم استعادة النسخة الاحتياطية بنجاح');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      toast.error('فشل استعادة النسخة الاحتياطية');
    } finally {
      setRestoring(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'غير معروف';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('ar-EG');
  };

  return (
    <div className="p-6 rtl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">النسخ الاحتياطي</h1>
          <p className="text-gray-500 mt-1">إدارة النسخ الاحتياطية واستعادة البيانات</p>
        </div>
        <button
          onClick={createManualBackup}
          className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <CloudArrowUpIcon className="w-5 h-5" />
          نسخ احتياطي فوري
        </button>
      </div>

      {/* معلومات النسخ الاحتياطي */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 dark:bg-green-900 rounded-lg p-4">
          <p className="text-green-800 dark:text-green-200">🕐 النسخ التلقائي</p>
          <p className="text-sm text-green-600 dark:text-green-300">يومياً الساعة 2:00 صباحاً</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4">
          <p className="text-blue-800 dark:text-blue-200">💾 مدة الاحتفاظ</p>
          <p className="text-sm text-blue-600 dark:text-blue-300">آخر 7 أيام | آخر 30 يوم | آخر 12 شهر</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900 rounded-lg p-4">
          <p className="text-purple-800 dark:text-purple-200">📊 إجمالي النسخ</p>
          <p className="text-sm text-purple-600 dark:text-purple-300">{backups.length} نسخة محفوظة</p>
        </div>
      </div>

      {/* قائمة النسخ الاحتياطية */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold">النسخ الاحتياطية المتاحة</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-right">تاريخ النسخ</th>
                <th className="px-6 py-3 text-right">الحجم</th>
                <th className="px-6 py-3 text-right">النوع</th>
                <th className="px-6 py-3 text-right">الحالة</th>
                <th className="px-6 py-3 text-right">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center py-8">جاري التحميل...</td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-8">لا توجد نسخ احتياطية</td>
                </tr>
              ) : (
                backups.map((backup, index) => (
                  <tr key={backup.id} className="border-t dark:border-gray-700">
                    <td className="px-6 py-4">{formatDate(backup.timestamp)}</td>
                    <td className="px-6 py-4">{formatFileSize(backup.size)}</td>
                    <td className="px-6 py-4">
                      {index === 0 ? (
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">آخر نسخة</span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">يدوي</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">ناجح</span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => restoreBackup(backup.id, backup.url)}
                        disabled={restoring}
                        className="text-blue-500 hover:text-blue-700 flex items-center gap-1"
                      >
                        <ArrowPathIcon className="w-5 h-5" />
                        استعادة
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* تنبيه */}
      <div className="mt-6 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 rounded-lg p-4">
        <h4 className="font-bold text-yellow-800 dark:text-yellow-200 mb-2">ملاحظات مهمة:</h4>
        <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
          <li>• يتم إنشاء نسخة احتياطية تلقائياً كل يوم الساعة 2 صباحاً</li>
          <li>• يتم الاحتفاظ بآخر 7 أيام من النسخ اليومية</li>
          <li>• يتم الاحتفاظ بآخر 30 يوم من النسخ الأسبوعية</li>
          <li>• يتم الاحتفاظ بآخر 12 شهر من النسخ الشهرية</li>
          <li>• استعادة النسخة الاحتياطية ستستبدل جميع البيانات الحالية</li>
        </ul>
      </div>
    </div>
  );
};
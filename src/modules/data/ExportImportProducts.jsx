// src/modules/data/ExportImportProducts.jsx
import { useState } from 'react'
import { db } from '../../services/firebase'
import { collection, writeBatch, doc } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import { 
  DocumentArrowDownIcon, 
  ArrowUpTrayIcon, 
  DocumentDuplicateIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'
import { getLiveSnapshot } from '../../services/liveCollections'

const ExportImportProducts = () => {
  const { hasPermission } = useAuth()
  const [loading, setLoading] = useState(false)
  const [previewData, setPreviewData] = useState([])
  const [showPreview, setShowPreview] = useState(false)
  const [importErrors, setImportErrors] = useState([])

  // قالب الفورمات المطلوبة للمنتجات
  const productTemplate = {
    headers: [
      'الاسم',
      'السعر',
      'الباركود',
      'SKU',
      'الكمية',
      'حد التنبيه',
      'الوصف',
      'القسم'
    ],
    example: {
      'الاسم': 'قهوة تركية',
      'السعر': 25,
      'الباركود': '6221234567890',
      'SKU': 'CF-001',
      'الكمية': 100,
      'حد التنبيه': 10,
      'الوصف': 'قهوة تركية أصيلة',
      'القسم': 'مشروبات ساخنة'
    }
  }

  // تحميل قالب Excel
  const downloadTemplate = () => {
    const templateData = [productTemplate.headers]
    templateData.push(Object.values(productTemplate.example))
    
    const ws = XLSX.utils.aoa_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'منتجات')
    
    // تعيين عرض الأعمدة
    ws['!cols'] = [
      { wch: 20 }, // الاسم
      { wch: 10 }, // السعر
      { wch: 20 }, // الباركود
      { wch: 15 }, // SKU
      { wch: 10 }, // الكمية
      { wch: 10 }, // حد التنبيه
      { wch: 30 }, // الوصف
      { wch: 20 }  // القسم
    ]
    
    XLSX.writeFile(wb, 'قالب_استيراد_المنتجات.xlsx')
    toast.success('تم تحميل قالب Excel بنجاح')
  }

  // تصدير المنتجات الموجودة إلى Excel
  const exportProducts = async () => {
    setLoading(true)
    try {
      const snapshot = await getLiveSnapshot('products')
      const products = snapshot.docs.map(doc => ({
        'الاسم': doc.data().name,
        'السعر': doc.data().price,
        'الباركود': doc.data().barcode || '',
        'SKU': doc.data().sku || '',
        'الكمية': doc.data().quantity || 0,
        'حد التنبيه': doc.data().lowStockThreshold || 10,
        'الوصف': doc.data().description || '',
        'القسم': doc.data().category || ''
      }))
      
      const ws = XLSX.utils.json_to_sheet(products)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'المنتجات')
      
      ws['!cols'] = [
        { wch: 20 }, { wch: 10 }, { wch: 20 }, { wch: 15 },
        { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 20 }
      ]
      
      XLSX.writeFile(wb, `المنتجات_${new Date().toISOString().split('T')[0]}.xlsx`)
      toast.success(`تم تصدير ${products.length} منتج بنجاح`)
    } catch (error) {
      toast.error('فشل تصدير المنتجات')
    } finally {
      setLoading(false)
    }
  }


// دالة لتنظيف البيانات قبل الاستيراد
const cleanProductData = (row) => {
  const num = (v) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : NaN)
  const qty = num(row['الكمية'])
  const threshold = num(row['حد التنبيه'])
  return {
    name: String(row['الاسم'] ?? '').trim(),
    price: num(row['السعر']),
    barcode: String(row['الباركود'] ?? '').trim(),
    sku: String(row['SKU'] ?? '').trim(),
    quantity: Number.isFinite(qty) ? Math.max(0, Math.trunc(qty)) : 0,
    lowStockThreshold: Number.isFinite(threshold) ? Math.max(0, Math.trunc(threshold)) : 10,
    description: String(row['الوصف'] ?? '').trim(),
    category: String(row['القسم'] ?? '').trim(),
    // أي منتج داخل الاستيراد بيتتبع مخزونه (مش بيتعامل كـ "بدون تتبع")
    trackStock: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

// يرجّع أرقام الأسطر اللي باركودها مكرر: مكرر جوه الملف نفسه أو موجود قبل كده في النظام
const findDuplicateBarcodes = (rows, existingBarcodes) => {
  const seen = new Set()
  const duplicates = []
  rows.forEach(({ product, rowNum }) => {
    const code = product.barcode
    if (!code) return
    if (seen.has(code) || existingBarcodes.has(code)) {
      duplicates.push({ rowNum, barcode: code })
    }
    seen.add(code)
  })
  return duplicates
}

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setLoading(true)
    setImportErrors([])
    
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)
        
        // التحقق من صحة البيانات
        const errors = []
        const validRows = []

        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i]
          const rowNum = i + 2 // +2 لأن Excel يبدأ من 1 والسطر الأول headers

          if (!String(row['الاسم'] ?? '').trim()) {
            errors.push(`السطر ${rowNum}: الاسم مطلوب`)
            continue
          }

          const product = cleanProductData(row)
          if (!Number.isFinite(product.price) || product.price < 0) {
            errors.push(`السطر ${rowNum}: السعر يجب أن يكون رقماً صالحاً`)
            continue
          }

          validRows.push({ product, rowNum })
        }

        // منع تكرار الباركود داخل الملف وضد المنتجات الموجودة (السكانر محتاج باركود فريد)
        if (validRows.length > 0) {
          const existingSnap = await getLiveSnapshot('products')
          const existingBarcodes = new Set(
            existingSnap.docs.map(d => d.data().barcode).filter(Boolean)
          )
          findDuplicateBarcodes(validRows, existingBarcodes).forEach(({ rowNum, barcode }) => {
            errors.push(`السطر ${rowNum}: الباركود ${barcode} مكرر`)
          })
        }

        const validProducts = validRows.map(r => r.product)

        if (errors.length > 0) {
          setImportErrors(errors)
          setPreviewData(validProducts)
          setShowPreview(true)
          toast(`تم العثور على ${errors.length} خطأ`, { icon: '⚠️' })
        } else if (validProducts.length > 0) {
          setPreviewData(validProducts)
          setShowPreview(true)
          toast(`تم قراءة ${validProducts.length} منتج بنجاح. راجع البيانات ثم اضغط تأكيد`, { icon: 'ℹ️' })
        } else {
          toast.error('لم يتم العثور على بيانات صالحة في الملف')
        }
        
      } catch (error) {
        toast.error('خطأ في قراءة الملف: ' + error.message)
      } finally {
        setLoading(false)
        e.target.value = ''
      }
    }
    
    reader.readAsArrayBuffer(file)
  }

  // تأكيد استيراد المنتجات
  const confirmImport = async () => {
    setLoading(true)
    try {
      let successCount = 0
      let errorCount = 0
      const CHUNK = 400 // حد Firestore للـ batch 500 عملية، بنقسم عشان الملفات الكبيرة

      for (let start = 0; start < previewData.length; start += CHUNK) {
        const batch = writeBatch(db)
        const chunk = previewData.slice(start, start + CHUNK)
        chunk.forEach(product => batch.set(doc(collection(db, 'products')), product))
        try {
          await batch.commit()
          successCount += chunk.length
        } catch (error) {
          errorCount += chunk.length
          logger.error('Error importing products batch:', error)
        }
      }

      if (successCount > 0) {
        toast.success(`✅ تم استيراد ${successCount} منتج بنجاح`)
      }
      if (errorCount > 0) {
        toast.error(`❌ فشل استيراد ${errorCount} منتج`)
      }
      
      setShowPreview(false)
      setPreviewData([])
      setImportErrors([])
      
    } catch (error) {
      toast.error('فشل استيراد المنتجات: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // إلغاء الاستيراد
  const cancelImport = () => {
    setShowPreview(false)
    setPreviewData([])
    setImportErrors([])
  }

  if (!hasPermission('data_export')) {
    return <div className="p-6 text-center text-red-600">غير مصرح</div>
  }

  return (
    <div className="p-6 rtl">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold dark:text-white mb-2">📦 استيراد وتصدير المنتجات</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">قم برفع المنتجات دفعة واحدة باستخدام ملف Excel</p>

        {/* بطاقات الخيارات */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* تحميل القالب */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 text-center hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-3">📋</div>
            <h3 className="text-lg font-bold mb-2">تحميل قالب Excel</h3>
            <p className="text-sm text-gray-500 mb-4">حمّل القالب المعتمد لملء بيانات المنتجات</p>
            <button
              onClick={downloadTemplate}
              className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-2"
            >
              <DocumentArrowDownIcon className="w-5 h-5" />
              تحميل القالب
            </button>
          </div>

          {/* تصدير المنتجات */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 text-center hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-3">📤</div>
            <h3 className="text-lg font-bold mb-2">تصدير المنتجات</h3>
            <p className="text-sm text-gray-500 mb-4">تصدير جميع المنتجات الموجودة إلى ملف Excel</p>
            <button
              onClick={exportProducts}
              disabled={loading}
              className="w-full py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
            >
              <DocumentDuplicateIcon className="w-5 h-5" />
              تصدير البيانات
            </button>
          </div>

          {/* استيراد المنتجات */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 text-center hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-3">📥</div>
            <h3 className="text-lg font-bold mb-2">استيراد منتجات</h3>
            <p className="text-sm text-gray-500 mb-4">اختر ملف Excel لاستيراد المنتجات</p>
            <label className="w-full py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center justify-center gap-2 cursor-pointer">
              <ArrowUpTrayIcon className="w-5 h-5" />
              رفع ملف Excel
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={loading}
              />
            </label>
          </div>
        </div>

        {/* تنسيق القالب */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 mb-8">
          <h3 className="font-bold mb-3 flex items-center gap-2">📌 تنسيق القالب المطلوب</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-100 dark:bg-blue-800/50">
                <tr>
                  {productTemplate.headers.map(header => (
                    <th key={header} className="p-2 text-right">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  {Object.values(productTemplate.example).map((value, idx) => (
                    <td key={idx} className="p-2 text-gray-600">{value}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            ⚠️ ملاحظة: الأعمدة المطلوبة هي: الاسم، السعر. باقي الأعمدة اختيارية
          </p>
        </div>

        {/* معاينة البيانات قبل الاستيراد */}
        {showPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold dark:text-white">معاينة البيانات</h2>
                <button onClick={cancelImport} className="text-gray-500 hover:text-gray-700">
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* الأخطاء */}
              {importErrors.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg max-h-32 overflow-y-auto">
                  <p className="font-bold text-red-600 mb-2 flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5" />
                    {importErrors.length} خطأ تم العثور عليه
                  </p>
                  {importErrors.map((error, idx) => (
                    <p key={idx} className="text-sm text-red-600">• {error}</p>
                  ))}
                </div>
              )}

              {/* جدول المعاينة */}
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                    <tr>
                      <th className="p-3 text-right">#</th>
                      <th className="p-3 text-right">الاسم</th>
                      <th className="p-3 text-right">السعر</th>
                      <th className="p-3 text-right">الباركود</th>
                      <th className="p-3 text-right">SKU</th>
                      <th className="p-3 text-right">الكمية</th>
                      <th className="p-3 text-right">القسم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((product, idx) => (
                      <tr key={idx} className="border-t dark:border-gray-700">
                        <td className="p-3">{idx + 1}</td>
                        <td className="p-3 font-medium">{product.name}</td>
                        <td className="p-3">{product.price} ج.م</td>
                        <td className="p-3 text-gray-500">{product.barcode || '—'}</td>
                        <td className="p-3 text-gray-500">{product.sku || '—'}</td>
                        <td className="p-3">{product.quantity}</td>
                        <td className="p-3">{product.category || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ملخص */}
              <div className="mt-4 pt-4 border-t dark:border-gray-700 flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500">
                    عدد المنتجات: <span className="font-bold text-blue-600">{previewData.length}</span>
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={cancelImport}
                    className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={confirmImport}
                    disabled={loading || importErrors.length > 0}
                    className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircleIcon className="w-5 h-5" />
                    {loading ? 'جاري الاستيراد...' : 'تأكيد الاستيراد'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExportImportProducts
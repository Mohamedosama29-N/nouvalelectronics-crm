// src/pages/Settings/SystemSettings.jsx
import { useState, useEffect } from 'react'
import { CameraIcon, TrashIcon } from '@heroicons/react/24/outline'
import { db } from '../../services/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { logger } from '../../utils/logger'
import { printCalibrationTicket, DEFAULT_PRINTABLE_MM } from '../../utils/thermalPrint'
import { runConnectionDiagnostics } from '../../services/diagnostics'
import { APP_VERSION } from '../../version'

const SystemSettings = () => {
  const [formData, setFormData] = useState({
    cafeName: 'مقهى ___',
    cafeLogo: null,
    cafeAddress: '',
    cafePhone: '',
    cafeEmail: '',
    receiptFooter: 'شكراً لزيارتكم',
    receiptQrEnabled: true,
    receiptLogoMono: true,
    receiptQrUrl: 'https://facebook.com/SAFALOVAZZA',
    receiptQrLabel: 'تابعونا على فيسبوك',
    currency: 'ج.م',
    lowStockAlert: 10,
    paperSize: '80mm',
    printableWidthMm: '',
    printOffsetMm: 0,
    showCashierName: true,
    autoPrint: true,
    copyCount: 1,
    requireOpenShift: false,
    kitchenDisplayEnabled: true,
    kitchenAutoPrint: true,
    splitKitchenTickets: false,
    requireKitchenDeliveryForInvoice: true
  })
  const [logoPreview, setLogoPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [diag, setDiag] = useState(null)
  const [diagRunning, setDiagRunning] = useState(false)

  const runDiagnostics = async () => {
    setDiagRunning(true)
    setDiag(null)
    try {
      setDiag(await runConnectionDiagnostics())
    } finally {
      setDiagRunning(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const docRef = doc(db, 'settings', 'system')
      const docSnap = await getDoc(docRef)
      if (docSnap.exists()) {
        const data = docSnap.data()
        setFormData(prev => ({ ...prev, ...data }))
        if (data.cafeLogo) setLogoPreview(data.cafeLogo)
      }
    } catch (error) {
      logger.error('Error loading settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogoUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 1024 * 1024) {
        toast.error('حجم الصورة يجب أن أقل من 1 ميجابايت')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result)
        setFormData({ ...formData, cafeLogo: reader.result })
      }
      reader.readAsDataURL(file)
    }
  }

  const removeLogo = () => {
    setLogoPreview(null)
    setFormData({ ...formData, cafeLogo: null })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const docRef = doc(db, 'settings', 'system')
      await setDoc(docRef, { 
        cafeName: formData.cafeName,
        cafeLogo: logoPreview,
        cafeAddress: formData.cafeAddress,
        cafePhone: formData.cafePhone,
        cafeEmail: formData.cafeEmail,
        receiptFooter: formData.receiptFooter,
        receiptQrEnabled: formData.receiptQrEnabled !== false,
        receiptLogoMono: formData.receiptLogoMono !== false,
        receiptQrUrl: (formData.receiptQrUrl || '').trim(),
        receiptQrLabel: (formData.receiptQrLabel || '').trim(),
        currency: formData.currency,
        // الضريبة اتشالت نهائياً - بنكتبها صفر عشان أي إعداد قديم متسجل يتلغي
        taxRate: 0,
        taxEnabled: false,
        lowStockAlert: formData.lowStockAlert,
        paperSize: formData.paperSize,
        printableWidthMm: formData.printableWidthMm === '' || formData.printableWidthMm == null ? null : Number(formData.printableWidthMm),
        printOffsetMm: Number(formData.printOffsetMm) || 0,
        showCashierName: formData.showCashierName,
        autoPrint: formData.autoPrint,
        copyCount: formData.copyCount,
        requireOpenShift: formData.requireOpenShift,
        kitchenDisplayEnabled: formData.kitchenDisplayEnabled,
        kitchenAutoPrint: formData.kitchenAutoPrint,
        splitKitchenTickets: !!formData.splitKitchenTickets,
        requireKitchenDeliveryForInvoice: formData.requireKitchenDeliveryForInvoice,
        updatedAt: new Date()
      }, { merge: true })
      
      toast.success('تم حفظ إعدادات النظام بنجاح')
    } catch (error) {
      toast.error('فشل حفظ الإعدادات')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="p-6 rtl">
      <h1 className="text-3xl font-bold dark:text-white mb-8">🏪 إعدادات النظام</h1>
      
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
        {/* قسم الشعار */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4 dark:text-white">شعار المقهى</h2>
          <div className="flex items-center gap-4">
            {logoPreview ? (
              <div className="relative">
                <img src={logoPreview} alt="Logo" className="w-24 h-24 object-cover rounded-lg border-2 border-blue-500" />
                <button
                  type="button"
                  onClick={removeLogo}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-4xl">
                ☕
              </div>
            )}
            <label className="cursor-pointer bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors">
              <CameraIcon className="w-5 h-5 inline ml-2" />
              اختيار شعار
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
            <p className="text-xs text-gray-500">jpg, png (max 1MB)</p>
          </div>
        </div>

        {/* معلومات المقهى */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4 dark:text-white">معلومات المقهى</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-white">اسم المقهى</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                value={formData.cafeName}
                onChange={(e) => setFormData({...formData, cafeName: e.target.value})}
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-white">العنوان</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                value={formData.cafeAddress}
                onChange={(e) => setFormData({...formData, cafeAddress: e.target.value})}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-white">رقم الهاتف</label>
                <input
                  type="tel"
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={formData.cafePhone}
                  onChange={(e) => setFormData({...formData, cafePhone: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-white">البريد الإلكتروني</label>
                <input
                  type="email"
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={formData.cafeEmail}
                  onChange={(e) => setFormData({...formData, cafeEmail: e.target.value})}
                />
              </div>
            </div>
          </div>
        </div>

        {/* إعدادات الفواتير */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4 dark:text-white">🧾 إعدادات الفواتير</h2>
          <div className="space-y-4">
            {/* تذييل الفاتورة */}
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-white">تذييل الفاتورة</label>
              <textarea
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                rows="2"
                value={formData.receiptFooter}
                onChange={(e) => setFormData({...formData, receiptFooter: e.target.value})}
                placeholder="شكراً لزيارتكم..."
              />
            </div>

            {/* وضوح اللوجو في الطباعة الحرارية */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 mt-1"
                checked={formData.receiptLogoMono !== false}
                onChange={(e) => setFormData({ ...formData, receiptLogoMono: e.target.checked })} />
              <span className="dark:text-white">
                🖤 طباعة اللوجو أبيض وأسود صريح (أوضح على الطابعة الحرارية)
                <span className="block text-xs text-gray-500">لو اللوجو فيه ألوان فاتحة جداً واختفت في الطباعة، اقفل الخيار ده</span>
              </span>
            </label>

            {/* QR Code في آخر الفاتورة */}
            <div className="p-4 border rounded-lg dark:border-gray-600 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4"
                  checked={formData.receiptQrEnabled !== false}
                  onChange={(e) => setFormData({ ...formData, receiptQrEnabled: e.target.checked })} />
                <span className="font-medium dark:text-white">📱 QR Code في آخر الفاتورة</span>
              </label>
              {formData.receiptQrEnabled !== false && (
                <>
                  <div>
                    <label className="block text-sm mb-1 dark:text-white">الرابط (صفحة فيسبوك / إنستجرام / المنيو...)</label>
                    <input type="text" dir="ltr"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      value={formData.receiptQrUrl || ''}
                      onChange={(e) => setFormData({ ...formData, receiptQrUrl: e.target.value })}
                      placeholder="https://facebook.com/..." />
                  </div>
                  <div>
                    <label className="block text-sm mb-1 dark:text-white">النص اللي تحت الـ QR</label>
                    <input type="text"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      value={formData.receiptQrLabel || ''}
                      onChange={(e) => setFormData({ ...formData, receiptQrLabel: e.target.value })}
                      placeholder="تابعونا على فيسبوك" />
                  </div>
                </>
              )}
            </div>

            {/* حجم ورق الفاتورة - مع إضافة توضيح لطابعة XP-V320N */}
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-white">📏 حجم ورق الفاتورة</label>
              <select 
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                value={formData.paperSize}
                onChange={(e) => setFormData({...formData, paperSize: e.target.value})}
              >
                <option value="58mm">📄 58 مم (ورق صغير)</option>
                <option value="76mm">📄 76 مم (ورق متوسط)</option>
                <option value="80mm">📄 80 مم (ورق كبير - موصى به لـ XP-V320N)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                طابعتك XP-V320N تدعم 80mm - هذا هو الإعداد الموصى به
              </p>
            </div>

            {/* فحص الاتصال بقاعدة البيانات */}
            <div className="p-4 border rounded-lg dark:border-gray-600 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium dark:text-white">🩺 فحص الاتصال بقاعدة البيانات</p>
                <span className="text-xs text-gray-400">الإصدار {APP_VERSION}</span>
              </div>
              <p className="text-xs text-gray-500">
                لو أرقام الفواتير بتطلع OFFLINE أو المخزون مش بيتخصم، الفحص ده بيوضح السبب بالظبط (من غير ما يغيّر أي بيانات).
              </p>
              <button type="button" onClick={runDiagnostics} disabled={diagRunning}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg">
                {diagRunning ? 'جاري الفحص...' : 'ابدأ الفحص'}
              </button>
              {diag && (
                <div className="space-y-2">
                  {diag.results.map(r => (
                    <div key={r.name} className={`p-2 rounded-lg text-sm ${r.ok ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                      <div className="flex justify-between gap-2">
                        <span>{r.ok ? '✅' : '❌'} {r.name}</span>
                        <span className="text-xs opacity-70" dir="ltr">{r.ok ? `${r.ms}ms` : r.code}</span>
                      </div>
                      {r.detail && <p className="text-xs mt-1 opacity-80">{r.detail}</p>}
                      {!r.ok && r.hint && <p className="text-xs mt-1">{r.hint}</p>}
                    </div>
                  ))}
                  {diag.isBrave && (
                    <p className="text-xs p-2 rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      ⚠️ المتصفح ده Brave: الدروع (Shields) ممكن تحجب الاتصال بـ Firebase. الأضمن تشغيل السيستم من Google Chrome.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* معايرة الطباعة: عرض منطقة الطباعة الفعلية + إزاحة */}
            <div className="p-4 border rounded-lg dark:border-gray-600 space-y-3">
              <p className="font-medium dark:text-white">🎯 معايرة الطباعة</p>
              <p className="text-xs text-gray-500">
                الطابعة مش بتطبع على عرض الورقة كله (ورق 80مم = 72مم طباعة فعلية). اطبع ورقة الاختبار،
                ولو طرف مقصوص قلّل العرض، ولو الكلام مزحوح لجهة عدّل الإزاحة.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1 dark:text-white">عرض منطقة الطباعة (مم)</label>
                  <input type="number" min="30" max="80" step="0.5"
                    placeholder={`تلقائي: ${DEFAULT_PRINTABLE_MM[formData.paperSize] || 72}`}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    value={formData.printableWidthMm ?? ''}
                    onChange={(e) => setFormData({ ...formData, printableWidthMm: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm mb-1 dark:text-white">إزاحة يمين/شمال (مم)</label>
                  <input type="number" min="-10" max="10" step="0.5"
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    value={formData.printOffsetMm ?? 0}
                    onChange={(e) => setFormData({ ...formData, printOffsetMm: e.target.value })} />
                  <p className="text-[11px] text-gray-500 mt-1">موجب = يمين، سالب = شمال</p>
                </div>
              </div>
              <button type="button"
                onClick={() => printCalibrationTicket({ ...formData, printableWidthMm: formData.printableWidthMm === '' ? null : Number(formData.printableWidthMm), printOffsetMm: Number(formData.printOffsetMm) || 0 })}
                className="w-full py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg">
                🖨️ طباعة ورقة اختبار المقاس
              </button>
            </div>

            {/* معاينة الحجم - محسنة لـ 80mm */}
            <div className={`p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg mx-auto ${
              formData.paperSize === '58mm' ? 'w-[200px]' : 
              formData.paperSize === '76mm' ? 'w-[260px]' : 'w-[280px]'
            }`}>
              <div className="text-center border border-dashed border-gray-300 rounded p-2">
                <div className="text-xs text-gray-500">معاينة الفاتورة</div>
                <div className="border-t border-dashed border-gray-200 my-1"></div>
                <div className="text-[10px] font-bold text-gray-600">{formData.cafeName}</div>
                <div className="text-[8px] text-gray-400">{formData.receiptFooter}</div>
                <div className="border-t border-dashed border-gray-200 my-1"></div>
                <div className="text-[8px] text-gray-400">
                  {formData.paperSize === '58mm' ? 'عرض 58 مم' : 
                   formData.paperSize === '76mm' ? 'عرض 76 مم' : 'عرض 80 مم (طابعتك)'}
                </div>
              </div>
            </div>

            {/* العملة ونسبة الضريبة */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-white">💰 العملة</label>
                <select
                  className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={formData.currency}
                  onChange={(e) => setFormData({...formData, currency: e.target.value})}
                >
                  <option value="ج.م">جنيه مصري (ج.م)</option>
                  <option value="$">دولار أمريكي ($)</option>
                  <option value="€">يورو (€)</option>
                  <option value="ر.س">ريال سعودي (ر.س)</option>
                  <option value="د.ك">دينار كويتي (د.ك)</option>
                  <option value="د.أ">درهم إماراتي (د.أ)</option>
                </select>
              </div>
              
            </div>

            {/* خيارات الطباعة */}
            <div className="border-t pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={formData.showCashierName}
                  onChange={(e) => setFormData({...formData, showCashierName: e.target.checked})}
                />
                <span className="dark:text-white">👨‍💼 إظهار اسم الكاشير في الفاتورة</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={formData.autoPrint}
                  onChange={(e) => setFormData({...formData, autoPrint: e.target.checked})}
                />
                <span className="dark:text-white">🖨️ طباعة تلقائية بعد إتمام البيع</span>
              </label>
            </div>

            {/* إلزامية فتح الشيفت */}
            <div className="border-t pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={!!formData.requireOpenShift}
                  onChange={(e) => setFormData({...formData, requireOpenShift: e.target.checked})}
                />
                <span className="dark:text-white">🔒 إلزام فتح شيفت (درج الكاش) قبل البيع</span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                {formData.requireOpenShift
                  ? '✅ الكاشير لازم يفتح شيفت الأول قبل ما يقدر يبيع'
                  : '❌ فتح الشيفت اختياري - يقدر يبيع من غير ما يفتح شيفت'}
              </p>
            </div>

            {/* عدد النسخ */}
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-white">📑 عدد نسخ الفاتورة</label>
              <select 
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                value={formData.copyCount}
                onChange={(e) => setFormData({...formData, copyCount: parseInt(e.target.value)})}
              >
                <option value="1">1 نسخة (للعميل)</option>
                <option value="2">2 نسخة (عميل + كاشير)</option>
                <option value="3">3 نسخة (عميل + كاشير + مطبخ)</option>
              </select>
            </div>
          </div>
        </div>

        {/* إعدادات شاشة المطبخ */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4 dark:text-white">🍳 إعدادات شاشة المطبخ</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={!!formData.kitchenDisplayEnabled}
                onChange={(e) => setFormData({...formData, kitchenDisplayEnabled: e.target.checked})}
              />
              <span className="dark:text-white">🖥️ تفعيل إرسال الطلبات لشاشة المطبخ</span>
            </label>
            <p className="text-xs text-gray-500 -mt-2">
              {formData.kitchenDisplayEnabled
                ? '✅ كل عملية بيع هتظهر كطلب في شاشة المطبخ'
                : '❌ عمليات البيع مش هتتبعت لشاشة المطبخ خالص'}
            </p>

            {formData.kitchenDisplayEnabled && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={!!formData.kitchenAutoPrint}
                    onChange={(e) => setFormData({...formData, kitchenAutoPrint: e.target.checked})}
                  />
                  <span className="dark:text-white">🖨️ طباعة تذكرة الطلب تلقائياً مع كل طلب للمطبخ</span>
                </label>
                <p className="text-xs text-gray-500 -mt-2">
                  {formData.kitchenAutoPrint
                    ? '✅ هتطبع تذكرة الطلب أوتوماتيك مع كل طلب'
                    : '❌ مش هتطبع تلقائياً - تقدر تطبع يدوياً من شاشة المطبخ'}
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={!!formData.splitKitchenTickets}
                    onChange={(e) => setFormData({...formData, splitKitchenTickets: e.target.checked})}
                  />
                  <span className="dark:text-white">✂️ تقسيم الطلب لتذكرتين (بار ومطبخ)</span>
                </label>
                <p className="text-xs text-gray-500 -mt-2">
                  {formData.splitKitchenTickets
                    ? 'المشروبات في تذكرة بار والأكل في تذكرة مطبخ'
                    : '✅ الطلب كله بيتطبع في تذكرة واحدة'}
                </p>
              </>
            )}

            <div className="pt-2 border-t dark:border-gray-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={!!formData.requireKitchenDeliveryForInvoice}
                  onChange={(e) => setFormData({...formData, requireKitchenDeliveryForInvoice: e.target.checked})}
                />
                <span className="dark:text-white">🧾 لا تُصدر الفاتورة إلا بعد "تم التسليم" من شاشة المطبخ</span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                {formData.requireKitchenDeliveryForInvoice
                  ? '✅ زر "إتمام البيع" هيبعت الطلب للمطبخ بس، والفاتورة هتتسجل تلقائياً لما يتحدد حالته "تم التسليم"'
                  : '❌ الفاتورة هتتسجل فوراً وقت البيع زي المعتاد (السلوك القديم)'}
              </p>
            </div>
          </div>
        </div>

        {/* إعدادات التنبيهات */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4 dark:text-white">🔔 إعدادات التنبيهات</h2>
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-white">حد التنبيه للمنتجات المنخفضة</label>
            <input
              type="number"
              className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              value={formData.lowStockAlert}
              onChange={(e) => setFormData({...formData, lowStockAlert: parseInt(e.target.value)})}
            />
            <p className="text-xs text-gray-500 mt-1">سيتم التنبيه عندما تصبح كمية المنتج أقل من هذا الرقم</p>
          </div>
        </div>

        {/* معاينة الفاتورة - محسنة لطابعة 80mm */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4 dark:text-white">📄 معاينة الفاتورة</h2>
          <div className={`border rounded-lg p-4 bg-gray-50 dark:bg-gray-900 mx-auto ${
            formData.paperSize === '58mm' ? 'max-w-[200px]' : 
            formData.paperSize === '76mm' ? 'max-w-[260px]' : 'max-w-[280px]'
          }`}>
            <div className="text-center">
              {logoPreview && <img src={logoPreview} alt="Logo" className="h-12 mx-auto mb-2" />}
              <h3 className="font-bold text-sm">{formData.cafeName}</h3>
              {formData.cafeAddress && <p className="text-[10px] text-gray-500">{formData.cafeAddress}</p>}
              {formData.cafePhone && <p className="text-[10px] text-gray-500">📞 {formData.cafePhone}</p>}
            </div>
            <div className="border-t my-2"></div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span>قهوة تركية</span>
                <span>1 × 25</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>لاتيه</span>
                <span>2 × 30</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span>كرواسون</span>
                <span>1 × 20</span>
              </div>
            </div>
            <div className="border-t my-2"></div>
            <div className="flex justify-between text-[10px] font-bold">
              <span>الإجمالي</span>
              <span>105 ج.م</span>
            </div>
            <div className="border-t my-2"></div>
            <div className="text-center text-[10px] text-gray-500">
              {formData.receiptFooter || 'شكراً لزيارتكم'}
            </div>
            {formData.showCashierName && (
              <div className="text-center text-[8px] text-gray-400 mt-1">
                الكاشير: أحمد
              </div>
            )}
            <div className="text-center text-[8px] text-gray-400 mt-1 border-t pt-1">
              نظام إدارة المقهى
            </div>
          </div>
          <p className="text-xs text-gray-500 text-center mt-3">
            معاينة الفاتورة بحجم {formData.paperSize === '80mm' ? '80 مم (مناسب لطابعتك XP-V320N)' : formData.paperSize}
          </p>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-semibold"
        >
          💾 حفظ جميع الإعدادات
        </button>
      </form>
    </div>
  )
}

export default SystemSettings
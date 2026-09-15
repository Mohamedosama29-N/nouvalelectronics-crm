import React, { useState, useEffect, useRef } from 'react';
import {
  doc, setDoc
} from 'firebase/firestore';
import {
  Package,
  Download,
  Plus,
  Settings,
  Trash2,
  Save,
  History,
  Calculator,
  MapPin,
  Database,
  UploadCloud,
  Printer as PrinterIcon,
  Grid,
  UsersRound,
  HardHat,
  Settings as SettingsIcon,
  AlertCircle,
  Key,
  Webhook,
  Wrench as WrenchIcon
} from 'lucide-react';
import { DuplicateCustomersManager } from '../customers/DuplicateCustomersManager';
import { ExcelImportManager } from '../importTools/ExcelImportManager';
import { InvoiceTemplateManager } from '../pos/InvoiceTemplateManager';
import { AuditLogManager } from '../reports/AuditLogManager';
import { ProductModelManager } from './ProductModelManager';
import { ALL_PERMISSIONS } from '../../constants/roles';
import { db } from '../../firebase/config';
import { showConfirm, showError, showSuccess } from '../../utils/alerts';
import { generateAPIKey } from '../../utils/apiKeys';
import { getAllDocs } from '../../utils/backup';
import { offlineDB } from '../../utils/offlineDb';

export function SettingsManager({ systemSettings, setSettings, notify, setGlobalLoading, appUser }) {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setLocalSettings] = useState(systemSettings);
  const [logoPreview, setLogoPreview] = useState(systemSettings.invoiceLogo || '');
  const [backupList, setBackupList] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState({ name: '', permissions: [] });
  // 🛠️ FIX: settings المحلية كانت بتتاخد من systemSettings مرة واحدة بس
  // وقت أول رندر (useState لا يتزامن تلقائيًا مع تغيّر الـ prop). فلو
  // الإعدادات الحقيقية اتحمّلت من Firebase بعد ما الشاشة فتحت (تحميل غير
  // متزامن)، أو اتغيّرت من جلسة أدمن تانية، الشاشة كانت تفضل عارضة قيم
  // قديمة/افتراضية، وأي حفظ بعد كده كان بيدَرِس التحديثات الحقيقية.
  // هنا بنعمل مزامنة تلقائية، لكن بس لو المستخدم معملش أي تعديل محلي
  // لسه (عشان منمسحش تعديلات المستخدم الحالية بالغلط).
  const lastSyncedRef = useRef(systemSettings);
  useEffect(() => {
    if (JSON.stringify(settings) === JSON.stringify(lastSyncedRef.current)) {
      setLocalSettings(systemSettings);
    }
    lastSyncedRef.current = systemSettings;
  }, [systemSettings]);

  // مراقبة تغييرات settings
  useEffect(() => {
    console.log("🔄 SettingsManager - settings تغيرت:", settings);
    console.log("🔄 SettingsManager - maintenanceCenters:", settings.maintenanceCenters);
  }, [settings]);

  useEffect(() => {
    const loadBackups = async () => {
      const backups = await offlineDB.getAll('backups');
      setBackupList(backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    };
    loadBackups();
  }, []);

  useEffect(() => {
    console.log("🔍 SettingsManager - settings.maintenanceCenters:", settings.maintenanceCenters);
    if (!settings.maintenanceCenters) {
      setSettings({...settings, maintenanceCenters: []});
    }
  }, []);

  const handleExportSettings = () => {
    const exportData = {
      systemName: settings.systemName,
      storeName: settings.storeName,
      taxRate: settings.taxRate,
      footerText: settings.footerText,
      installationFees: settings.installationFees,
      productCategories: settings.productCategories,
      technicians: settings.technicians,
      invoiceTemplate: settings.invoiceTemplate,
      version: '1.0',
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `settings_backup_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    showSuccess("تم تصدير الإعدادات بنجاح");
  };

  const handleImportSettings = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        setLocalSettings({...settings, ...imported});
        showSuccess("تم تحميل الإعدادات من الملف");
      } catch {
        showError("خطأ في قراءة الملف");
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const handleCreateBackup = async () => {
    setGlobalLoading(true);
    try {
      const backup = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        settings: settings,
        users: await getAllDocs('employees'),
        inventory: await getAllDocs('inventory'),
        customers: await getAllDocs('customers'),
        transactions: await getAllDocs('transactions'),
        tickets: await getAllDocs('tickets')
      };
      
      await offlineDB.save('backups', backup);
      showSuccess("تم إنشاء النسخة الاحتياطية بنجاح");
      
      const backups = await offlineDB.getAll('backups');
      setBackupList(backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      
    } catch (error) {
      console.error(error);
      showError("حدث خطأ أثناء إنشاء النسخة الاحتياطية");
    }
    setGlobalLoading(false);
  };

  const handleRestoreBackup = async (backup) => {
    const confirmed = await showConfirm(
      'تأكيد الاستعادة',
      'هل أنت متأكد من استعادة هذه النسخة؟ سيتم استبدال جميع البيانات الحالية.'
    );
    
    if (!confirmed) return;
    
    setGlobalLoading(true);
    try {
      if (backup.settings) {
        setLocalSettings(backup.settings);
        setSettings(backup.settings);
        await setDoc(doc(db, 'settings', 'general'), backup.settings, { merge: true });
      }
      
      if (backup.users) {
        for (const user of backup.users) {
          await setDoc(doc(db, 'employees', user.id), user);
        }
      }
      
      showSuccess("تم استعادة النسخة الاحتياطية بنجاح");
      
    } catch (error) {
      console.error(error);
      showError("حدث خطأ أثناء الاستعادة");
    }
    setGlobalLoading(false);
  };

  const handleCreateApiKey = () => {
    const key = generateAPIKey(appUser, newApiKey.permissions);
    setApiKeys([...apiKeys, key]);
    setShowApiKeyModal(false);
    setNewApiKey({ name: '', permissions: [] });
    showSuccess("تم إنشاء مفتاح API بنجاح");
  };

  const handleSave = async () => {
    setGlobalLoading(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), settings, { merge: true });
      setSettings(settings);
      showSuccess("✅ تم حفظ الإعدادات بنجاح");
    } catch (error) {
      console.error("Error saving settings:", error);
      showError("❌ حدث خطأ في حفظ الإعدادات: " + error.message);
    }
    setGlobalLoading(false);
  };

  const addCategory = () => {
    const newCategories = [...(settings.productCategories || [])];
    newCategories.push({ name: '', models: [] });
    setLocalSettings({...settings, productCategories: newCategories});
  };

  const addFee = () => {
    const newFees = [...(settings.installationFees || [])];
    newFees.push({ id: Date.now().toString(), label: '', value: 0 });
    setLocalSettings({...settings, installationFees: newFees});
  };

  const addTechnician = () => {
    const newTechs = [...(settings.technicians || [])];
    newTechs.push('');
    setLocalSettings({...settings, technicians: newTechs});
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
        setLocalSettings({...settings, invoiceLogo: reader.result});
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-right" dir="rtl">
      
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white border-b pb-3">إنشاء مفتاح API جديد</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">اسم المفتاح</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-white dark:bg-slate-900"
                  value={newApiKey.name}
                  onChange={e => setNewApiKey({...newApiKey, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الصلاحيات</label>
                <select
                  multiple
                  className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-white dark:bg-slate-900 h-32"
                  value={newApiKey.permissions}
                  onChange={e => {
                    const options = Array.from(e.target.selectedOptions, option => option.value);
                    setNewApiKey({...newApiKey, permissions: options});
                  }}
                >
                  {ALL_PERMISSIONS.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleCreateApiKey}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700"
                >
                  إنشاء
                </button>
                <button
                  onClick={() => setShowApiKeyModal(false)}
                  className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-l from-indigo-600 to-purple-600 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings size={28} className="opacity-90" />
            <h2 className="text-2xl font-black">الإعدادات المركزية</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportSettings}
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
            >
              <Download size={16} /> تصدير
            </button>
            <input
              type="file"
              id="importSettings"
              accept=".json"
              className="hidden"
              onChange={handleImportSettings}
            />
            <button
              onClick={() => document.getElementById('importSettings').click()}
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
            >
              <UploadCloud size={16} /> استيراد
            </button>
            <button
              onClick={handleCreateBackup}
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
            >
              <Database size={16} /> نسخ احتياطي
            </button>
          </div>
        </div>
      </div>

      <div className="flex border-b bg-slate-50 dark:bg-slate-900/50 overflow-x-auto">
        {[
          { id: 'general', label: 'عام', icon: SettingsIcon },
          { id: 'invoice', label: 'الفاتورة', icon: PrinterIcon },
          { id: 'categories', label: 'التصنيفات', icon: Grid },
          { id: 'fees', label: 'الرسوم', icon: Calculator },
          { id: 'technicians', label: 'الفنيين', icon: HardHat },
          { id: 'backup', label: 'النسخ الاحتياطي', icon: Database },
          { id: 'api', label: 'API Keys', icon: Key },
          { id: 'branches', label: 'الفروع', icon: MapPin },
          { id: 'maintenance_centers', label: 'مراكز الصيانة', icon: WrenchIcon },
          { id: 'products', label: 'المنتجات والموديلات', icon: Package },
          { id: 'import_data', label: 'استيراد بيانات (Excel)', icon: UploadCloud },
          { id: 'audit_log', label: 'سجل التدقيق', icon: History },
          { id: 'duplicate_customers', label: 'دمج العملاء المكررين', icon: UsersRound }
          // تم حذف { id: 'faults', label: 'أكواد الأعطال', icon: AlertCircle }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-4 font-bold text-sm transition-all whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-400 border-b-2 border-indigo-600 shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* باقي المحتوى كما هو */}
      {activeTab === 'audit_log' && (appUser.permissions?.viewAuditLog || appUser.role === 'admin') && (
        <AuditLogManager />
      )}
      {activeTab === 'duplicate_customers' && appUser.role === 'admin' && (
        <DuplicateCustomersManager appUser={appUser} />
      )}
      {activeTab === 'products' && (appUser.permissions?.manageProductModels || appUser.role === 'admin') && (
        <ProductModelManager systemSettings={settings} setLocalSettings={setLocalSettings} />
      )}

      {activeTab === 'import_data' && (appUser.role === 'admin') && (
        <ExcelImportManager />
      )}

      {activeTab === 'maintenance_centers' && (appUser.permissions?.manageMaintenanceCenters || appUser.role === 'admin') && (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
            <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-4">🏢 قائمة مراكز الصيانة</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              أضف مراكز الصيانة التي ستظهر في قائمة "مركز الصيانة" عند إنشاء تذكرة
            </p>
            
            {settings.maintenanceCenters && settings.maintenanceCenters.length > 0 ? (
              settings.maintenanceCenters.map((center, idx) => (
                <div key={idx} className="flex gap-3 mb-3">
                  <input 
                    className="flex-1 border-2 border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-white dark:bg-slate-900 focus:border-indigo-500 outline-none transition-colors"
                    placeholder="اسم مركز الصيانة"
                    value={center?.name || ''}
                    onChange={e => {
                      const newCenters = [...(settings.maintenanceCenters || [])];
                      newCenters[idx] = { 
                        ...center, 
                        name: e.target.value, 
                        value: e.target.value.toLowerCase().replace(/\s+/g, '_') 
                      };
                      setLocalSettings({...settings, maintenanceCenters: newCenters});
                    }}
                  />
                  <button 
                    onClick={() => {
                      const newCenters = (settings.maintenanceCenters || []).filter((_, i) => i !== idx);
                      setLocalSettings({...settings, maintenanceCenters: newCenters});
                    }} 
                    className="px-4 py-3 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                  >
                    <Trash2 size={18}/>
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400 dark:text-slate-500 border-2 border-dashed rounded-xl mb-4">
                <p className="text-sm">لا توجد مراكز صيانة مضافة</p>
                <p className="text-xs mt-1">اضغط على الزر أدناه لإضافة أول مركز صيانة</p>
              </div>
            )}
            
            <button 
              onClick={() => {
                const currentCenters = settings.maintenanceCenters || [];
                const newCenters = [...currentCenters, { value: '', name: '' }];
                setLocalSettings({...settings, maintenanceCenters: newCenters});
              }} 
              className="w-full mt-4 py-4 border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-xl text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={20}/> إضافة مركز صيانة جديد
            </button>
            
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-bold flex items-center gap-2">
                ⚠️ تذكر: بعد إضافة أو تعديل مراكز الصيانة، اضغط على زر <strong>"حفظ الإعدادات"</strong> في أسفل الصفحة لحفظ التغييرات.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar bg-gradient-to-b from-white to-slate-50 dark:from-slate-800 dark:to-slate-900">
        {activeTab === 'general' && (appUser.permissions?.editSystemSettings || appUser.role === 'admin') && (
          <div className="space-y-6 max-w-3xl">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">اسم النظام</label>
                <input 
                  className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" 
                  value={settings.systemName || ''}
                  onChange={e => setLocalSettings({...settings, systemName: e.target.value})}
                  placeholder="مثال: نوڤال ERP"
                />
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">اسم المتجر</label>
                <input 
                  className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" 
                  value={settings.storeName || ''}
                  onChange={e => setLocalSettings({...settings, storeName: e.target.value})}
                  placeholder="مثال: نوڤال للإلكترونيات"
                />
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">نسبة الضريبة %</label>
                <input 
                  type="number"
                  className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" 
                  value={settings.taxRate || 14}
                  onChange={e => setLocalSettings({...settings, taxRate: Number(e.target.value)})}
                />
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">شعار الفاتورة</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                    id="logoUpload"
                  />
                  <button
                    onClick={() => document.getElementById('logoUpload').click()}
                    className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                  >
                    اختيار صورة
                  </button>
                  {logoPreview && (
                    <img src={logoPreview} alt="Logo" className="h-10 w-auto rounded border" />
                  )}
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">تذييل الفاتورة</label>
              <textarea 
                rows="3"
                className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800" 
                value={settings.footerText || ''}
                onChange={e => setLocalSettings({...settings, footerText: e.target.value})}
                placeholder="شكراً لتعاملكم معنا..."
              />
            </div>

            {/* ✨ ميزة جديدة: رابط خدمة إرسال البريد الإلكتروني */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">رابط خدمة إرسال البريد الإلكتروني (Webhook)</label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                مطلوب عشان زرار "إرسال بالبريد" في الفاتورة يشتغل فعليًا. تقدر تستخدم EmailJS أو Zapier أو Make لإنشاء الرابط ده.
              </p>
              <input
                type="url"
                placeholder="https://api.emailjs.com/... أو أي رابط Webhook لإرسال البريد"
                className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                value={settings.emailWebhookUrl || ''}
                onChange={e => setLocalSettings({...settings, emailWebhookUrl: e.target.value})}
              />
            </div>

            {/* 🆕 التقرير اليومي المجدول تلقائيًا (يحتاج نشر functions/reports/dailySummary.js) */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">مستلمو التقرير اليومي التلقائي</label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                إيميلات مفصولة بفاصلة، هتوصلهم ملخص يومي (المبيعات، التذاكر الجديدة) كل يوم الساعة 8 صباحًا. يحتاج رابط الـ Webhook فوق مضبوط.
              </p>
              <input
                type="text"
                placeholder="admin@example.com, manager@example.com"
                className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                value={(settings.dailyReportRecipients || []).join(', ')}
                onChange={e => setLocalSettings({
                  ...settings,
                  dailyReportRecipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                })}
              />
            </div>

            {/* ✨ ميزة جديدة: تنبيهات النواقص التلقائية */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400">تنبيهات النواقص التلقائية</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.lowStockAlerts?.enabled || false}
                    onChange={e => setLocalSettings({
                      ...settings,
                      lowStockAlerts: { ...(settings.lowStockAlerts || {}), enabled: e.target.checked }
                    })}
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                لما تفعّلها، النظام هيبعت قائمة النواقص تلقائيًا لرابط (Webhook) تحدده — تقدر تربطه بخدمة زي Zapier أو Make أو n8n عشان توصّل الرسالة بريد إلكتروني أو واتساب.
                ملحوظة: بما إن التطبيق ده يعمل من المتصفح، الإرسال بيحصل لما حد يفتح شاشة "النواقص" وعدّى الوقت المحدد من آخر إرسال — مش سيرفر شغال 24 ساعة.
              </p>
              <input
                type="url"
                placeholder="https://hooks.zapier.com/... أو أي رابط Webhook"
                className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 mb-3"
                value={settings.lowStockAlerts?.webhookUrl || ''}
                onChange={e => setLocalSettings({
                  ...settings,
                  lowStockAlerts: { ...(settings.lowStockAlerts || {}), webhookUrl: e.target.value }
                })}
              />
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">إرسال كل كام ساعة</label>
              <input
                type="number"
                min="1"
                className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                value={settings.lowStockAlerts?.frequencyHours || 24}
                onChange={e => setLocalSettings({
                  ...settings,
                  lowStockAlerts: { ...(settings.lowStockAlerts || {}), frequencyHours: Number(e.target.value) || 24 }
                })}
              />
            </div>

            {/* ✨ ميزة جديدة: إشعار العميل عند تغيير حالة تذكرته */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400">إشعار العميل عند تغيير حالة التذكرة</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.ticketNotifications?.enabled || false}
                    onChange={e => setLocalSettings({
                      ...settings,
                      ticketNotifications: { ...(settings.ticketNotifications || {}), enabled: e.target.checked }
                    })}
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                لما تفعّلها، أي تغيير في حالة تذكرة صيانة (مثلاً "جاهزة للاستلام") هيبعت طلب لرابط Webhook تحدده هنا، تقدر تربطه بخدمة زي Zapier أو Make عشان توصّل SMS أو رسالة واتساب للعميل تلقائيًا.
              </p>
              <input
                type="url"
                placeholder="https://hooks.zapier.com/... أو أي رابط Webhook"
                className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                value={settings.ticketNotifications?.webhookUrl || ''}
                onChange={e => setLocalSettings({
                  ...settings,
                  ticketNotifications: { ...(settings.ticketNotifications || {}), webhookUrl: e.target.value }
                })}
              />
            </div>

            {/* ✨ ميزة جديدة: تنبيه اقتراب انتهاء الضمان */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400">تنبيه اقتراب انتهاء الضمان</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.warrantyAlerts?.enabled || false}
                    onChange={e => setLocalSettings({
                      ...settings,
                      warrantyAlerts: { ...(settings.warrantyAlerts || {}), enabled: e.target.checked }
                    })}
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                لما تفعّلها، هتقدر تشوف وترسل تنبيهات للمنتجات اللي ضمانها قرّب يخلص من شاشة "تنبيهات الضمان" (تحت التقارير)، بنفس أسلوب تنبيهات النواقص.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="url"
                  placeholder="رابط Webhook"
                  className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                  value={settings.warrantyAlerts?.webhookUrl || ''}
                  onChange={e => setLocalSettings({
                    ...settings,
                    warrantyAlerts: { ...(settings.warrantyAlerts || {}), webhookUrl: e.target.value }
                  })}
                />
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">التنبيه قبل الانتهاء بكام يوم</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                    value={settings.warrantyAlerts?.daysBeforeExpiry || 30}
                    onChange={e => setLocalSettings({
                      ...settings,
                      warrantyAlerts: { ...(settings.warrantyAlerts || {}), daysBeforeExpiry: Number(e.target.value) || 30 }
                    })}
                  />
                </div>
              </div>
            </div>

            {/* ✨ ميزة جديدة: تسجيل خروج تلقائي بعد فترة خمول */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">تسجيل الخروج التلقائي بعد الخمول (بالدقائق)</label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                مفيد لو الأجهزة (زي الكاشير) مشتركة بين أكتر من موظف - يمنع بقاء الجلسة مفتوحة لو حد نسي يعمل تسجيل خروج. اكتب 0 لتعطيل هذه الميزة.
              </p>
              <input
                type="number"
                min="0"
                className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                value={settings.autoLogoutMinutes ?? 30}
                onChange={e => setLocalSettings({...settings, autoLogoutMinutes: Number(e.target.value) || 0})}
              />
            </div>

            {/* ✨ ميزة جديدة: تتبع SLA للتذاكر */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">مهلة حل التذكرة المستهدفة (SLA) - بالساعات</label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                لو التذكرة عدّت المدة دي من وقت إنشائها من غير ما توصل لحالة نهائية (تسليم/إغلاق)، هتتحسب "متأخرة" في شاشة التذاكر.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-rose-500 mb-1">أولوية عالية</label>
                  <input
                    type="number" min="1"
                    className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-rose-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                    value={settings.ticketSLA?.high ?? 4}
                    onChange={e => setLocalSettings({...settings, ticketSLA: { ...(settings.ticketSLA || {}), high: Number(e.target.value) || 1 }})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-amber-500 mb-1">أولوية متوسطة</label>
                  <input
                    type="number" min="1"
                    className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-amber-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                    value={settings.ticketSLA?.medium ?? 24}
                    onChange={e => setLocalSettings({...settings, ticketSLA: { ...(settings.ticketSLA || {}), medium: Number(e.target.value) || 1 }})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-emerald-500 mb-1">أولوية منخفضة</label>
                  <input
                    type="number" min="1"
                    className="w-full border-2 border-slate-100 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-emerald-500 transition-all bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800"
                    value={settings.ticketSLA?.low ?? 72}
                    onChange={e => setLocalSettings({...settings, ticketSLA: { ...(settings.ticketSLA || {}), low: Number(e.target.value) || 1 }})}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        
          {activeTab === 'branches' && (appUser.permissions?.manageBranchesList || appUser.role === 'admin') && (
            <div className="space-y-6 max-w-2xl">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-4">إدارة الفروع (للاختيار في التذاكر)</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  هذه الفروع تظهر في خانة "أقرب فرع" عند إنشاء تذكرة صيانة
                </p>
                {(settings.branches || []).map((branch, idx) => (
                  <div key={idx} className="flex gap-3 mb-3">
                    <input 
                      className="flex-1 border-2 border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                      placeholder="اسم الفرع"
                      value={branch.label}
                      onChange={e => {
                        const newBranches = [...(settings.branches || [])];
                        newBranches[idx].label = e.target.value;
                        newBranches[idx].value = e.target.value.toLowerCase().replace(/\s+/g, '_');
                        setLocalSettings({...settings, branches: newBranches});
                      }}
                    />
                    <button 
                      onClick={() => {
                        const newBranches = (settings.branches || []).filter((_, i) => i !== idx);
                        setLocalSettings({...settings, branches: newBranches});
                      }}
                      className="px-4 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                    >
                      <Trash2 size={18}/>
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => {
                    const newBranches = [...(settings.branches || []), { value: '', label: '' }];
                    setLocalSettings({...settings, branches: newBranches});
                  }}
                  className="w-full mt-4 py-4 border-3 border-dashed border-indigo-200 dark:border-indigo-800 rounded-xl text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={20}/> إضافة فرع جديد
                </button>
              </div>
            </div>
          )}        


        {activeTab === 'invoice' && (appUser.permissions?.editInvoiceTemplate || appUser.role === 'admin') && (
          <InvoiceTemplateManager 
            systemSettings={settings}
            setSettings={setLocalSettings}
            notify={notify}
          />
        )}

        {activeTab === 'categories' && (appUser.permissions?.manageFeesAndCategories || appUser.role === 'admin') && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-4">تصنيفات المنتجات</h4>
              {settings.productCategories?.map((cat, idx) => (
                <div key={idx} className="mb-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex gap-3 mb-3">
                    <input 
                      className="flex-1 border-2 border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                      placeholder="اسم التصنيف (مثال: تكييف)"
                      value={cat.name}
                      onChange={e => {
                        const newCats = [...settings.productCategories];
                        newCats[idx].name = e.target.value;
                        setLocalSettings({...settings, productCategories: newCats});
                      }}
                    />
                    <button 
                      onClick={() => {
                        const newCats = settings.productCategories.filter((_, i) => i !== idx);
                        setLocalSettings({...settings, productCategories: newCats});
                      }}
                      className="px-4 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                    >
                      <Trash2 size={18}/>
                    </button>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">الموديلات (افصل بينها بفاصلة)</label>
                    <input 
                      className="w-full border-2 border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                      placeholder="مثال: 1.5 حصان, 2.25 حصان, انفرتر"
                      value={cat.models?.join(', ') || ''}
                      onChange={e => {
                        const newCats = [...settings.productCategories];
                        newCats[idx].models = e.target.value.split(',').map(m => m.trim()).filter(m => m);
                        setLocalSettings({...settings, productCategories: newCats});
                      }}
                    />
                  </div>
                </div>
              ))}
              <button 
                onClick={addCategory}
                className="w-full py-4 border-3 border-dashed border-indigo-200 dark:border-indigo-800 rounded-xl text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={20}/> إضافة تصنيف جديد
              </button>
            </div>
          </div>
        )}

        {activeTab === 'fees' && (appUser.permissions?.manageFeesAndCategories || appUser.role === 'admin') && (
          <div className="space-y-6 max-w-2xl">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-4">الرسوم الإضافية</h4>
              {settings.installationFees?.map((fee, idx) => (
                <div key={fee.id} className="flex gap-3 mb-3">
                  <input 
                    className="flex-1 border-2 border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                    placeholder="اسم الرسم (مثال: تركيب)"
                    value={fee.label}
                    onChange={e => {
                      const newFees = [...settings.installationFees];
                      newFees[idx].label = e.target.value;
                      setLocalSettings({...settings, installationFees: newFees});
                    }}
                  />
                  <input 
                    type="number"
                    className="w-32 border-2 border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-center outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                    placeholder="القيمة"
                    value={fee.value}
                    onChange={e => {
                      const newFees = [...settings.installationFees];
                      newFees[idx].value = Number(e.target.value);
                      setLocalSettings({...settings, installationFees: newFees});
                    }}
                  />
                  <button 
                    onClick={() => {
                      const newFees = settings.installationFees.filter((_, i) => i !== idx);
                      setLocalSettings({...settings, installationFees: newFees});
                    }}
                    className="px-4 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                  >
                    <Trash2 size={18}/>
                  </button>
                </div>
              ))}
              <button 
                onClick={addFee}
                className="w-full mt-4 py-4 border-3 border-dashed border-indigo-200 dark:border-indigo-800 rounded-xl text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={20}/> إضافة رسم جديد
              </button>
            </div>
          </div>
        )}

        {activeTab === 'technicians' && (appUser.permissions?.manageTechniciansList || appUser.role === 'admin') && (
          <div className="space-y-6 max-w-2xl">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-4">قائمة الفنيين</h4>
              {settings.technicians?.map((tech, idx) => (
                <div key={idx} className="flex gap-3 mb-3">
                  <input 
                    className="flex-1 border-2 border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                    placeholder="اسم الفني"
                    value={tech}
                    onChange={e => {
                      const newTechs = [...settings.technicians];
                      newTechs[idx] = e.target.value;
                      setLocalSettings({...settings, technicians: newTechs});
                    }}
                  />
                  <button 
                    onClick={() => {
                      const newTechs = settings.technicians.filter((_, i) => i !== idx);
                      setLocalSettings({...settings, technicians: newTechs});
                    }}
                    className="px-4 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                  >
                    <Trash2 size={18}/>
                  </button>
                </div>
              ))}
              <button 
                onClick={addTechnician}
                className="w-full mt-4 py-4 border-3 border-dashed border-indigo-200 dark:border-indigo-800 rounded-xl text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={20}/> إضافة فني جديد
              </button>
            </div>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-4">النسخ الاحتياطي</h4>
              <button
                onClick={handleCreateBackup}
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 mb-6"
              >
                <Database size={20}/> إنشاء نسخة احتياطية جديدة
              </button>

              <h5 className="font-bold text-slate-700 dark:text-slate-300 mb-3">النسخ السابقة</h5>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {backupList.map(backup => (
                  <div key={backup.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div>
                      <p className="font-bold text-sm">{new Date(backup.timestamp).toLocaleString('ar-EG')}</p>
                      <p className="text-xs text-slate-500">الحجم: {Math.round(JSON.stringify(backup).length / 1024)} KB</p>
                    </div>
                    <button
                      onClick={() => handleRestoreBackup(backup)}
                      className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                    >
                      استعادة
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-indigo-600 dark:text-indigo-400">مفاتيح API</h4>
                <button
                  onClick={() => setShowApiKeyModal(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Plus size={16}/> مفتاح جديد
                </button>
              </div>

              <div className="space-y-3">
                {apiKeys.map(key => (
                  <div key={key.id} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-lg">{key.name}</p>
                        <p className="text-xs font-mono text-slate-500">{key.key}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${key.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {key.isActive ? 'نشط' : 'غير نشط'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">تاريخ الإنشاء: {new Date(key.createdAt).toLocaleDateString('ar-EG')}</p>
                    <p className="text-xs text-slate-500">تاريخ الانتهاء: {new Date(key.expiresAt).toLocaleDateString('ar-EG')}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-4">
          <button 
            onClick={() => setLocalSettings(systemSettings)}
            className="px-8 py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            إلغاء
          </button>
          <button 
            onClick={handleSave}
            className="px-8 py-3 bg-gradient-to-l from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:from-indigo-700 hover:to-purple-700 transition-colors flex items-center gap-2 shadow-lg"
          >
            <Save size={18}/> حفظ الإعدادات
          </button>
        </div>
      </div>
    </div>
  );
}
// ==========================================================================
// 👤 دوال مساعدة لجلب البيانات للنسخ الاحتياطي
// ==========================================================================

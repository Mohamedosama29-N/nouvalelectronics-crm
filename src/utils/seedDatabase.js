// أداة اختيارية لتهيئة قاعدة البيانات ببيانات أولية (مخزن رئيسي + إعدادات
// عامة). مش جزء من تشغيل التطبيق العادي - تُشغَّل يدويًا مرة واحدة بس لما
// تنشئ مشروع Firebase جديد وعايز تبدأ بإعدادات افتراضية.
//
// 🛠️ FIX: كانت بتستورد من مسار غلط ('../services/firebase' غير موجود)
// وبتكتب البيانات تحت مسار متداخل (artifacts/{appId}/public/data/...)
// ما بيتوافقش مع باقي التطبيق اللي بيتعامل مباشرة مع كوليكشنز 'warehouses'
// و'settings' على المستوى الأول. اتصلحت عشان تتوافق مع الشكل الفعلي.
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export const seedDatabase = async () => {
  console.log('بدء إضافة البيانات الأولية...');

  try {
    await setDoc(doc(db, 'warehouses', 'main'), {
      name: 'المخزن الرئيسي',
      createdAt: serverTimestamp(),
    });
    console.log('✅ تم إضافة المستودع الرئيسي');

    await setDoc(doc(db, 'settings', 'general'), {
      systemName: 'نوڤال ERP',
      storeName: 'نوڤال للإلكترونيات',
      taxRate: 14,
      footerText: 'شكراً لتعاملكم معنا',
      installationFees: [],
      productCategories: [],
      technicians: [],
      invoiceTemplate: {
        showLogo: true,
        showStoreName: true,
        showCustomerInfo: true,
        showItems: true,
        showPrices: true,
        showDiscount: true,
        showTax: true,
        showFees: true,
        showFooter: true,
        fontSize: 'normal',
        paperSize: '80mm',
      },
    });
    console.log('✅ تم إضافة الإعدادات العامة');

    console.log('🎉 تمت العملية بنجاح!');
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
};

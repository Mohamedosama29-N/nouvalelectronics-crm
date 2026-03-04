import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase"; // عدل المسار حسب مكان ملف firebase

const appId = "nouval-system";

export const seedDatabase = async () => {
  console.log("بدء إضافة البيانات الأولية...");
  
  try {
    // إضافة المستودع الرئيسي
    await setDoc(
      doc(db, "artifacts", appId, "public", "data", "warehouses", "main"),
      {
        name: "المخزن الرئيسي",
        createdAt: serverTimestamp()
      }
    );
    console.log("✅ تم إضافة المستودع الرئيسي");

    // إضافة الإعدادات العامة
    await setDoc(
      doc(db, "artifacts", appId, "public", "data", "settings", "general"),
      {
        systemName: "نوڤال ERP",
        storeName: "نوڤال للإلكترونيات",
        taxRate: 14,
        footerText: "شكراً لتعاملكم معنا",
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
          fontSize: "normal",
          paperSize: "80mm"
        }
      }
    );
    console.log("✅ تم إضافة الإعدادات العامة");

    console.log("🎉 تمت العملية بنجاح!");
  } catch (error) {
    console.error("❌ خطأ:", error);
  }
};
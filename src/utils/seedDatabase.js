import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase";

const appId = "nouval-system"; // نفس APP_ID المستخدم في مشروعك

export const seedDatabase = async () => {

  await setDoc(
    doc(db, "artifacts", appId, "public", "data", "warehouses", "main"),
    {
      name: "المخزن الرئيسي",
      createdAt: serverTimestamp()
    }
  );

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

};
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase";

export const seedDatabase = async () => {

  try {

    // check warehouse
    const warehouseRef = doc(db, "warehouses", "main");
    const warehouseSnap = await getDoc(warehouseRef);

    if (!warehouseSnap.exists()) {

      await setDoc(warehouseRef, {
        name: "المخزن الرئيسي",
        createdAt: serverTimestamp()
      });

      console.log("Warehouse created");

    } else {
      console.log("Warehouse already exists");
    }

    // check settings
    const settingsRef = doc(db, "settings", "general");
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {

      await setDoc(settingsRef, {
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
      });

      console.log("Settings created");

    } else {
      console.log("Settings already exist");
    }

  } catch (error) {
    console.error("Seed error:", error);
  }

};
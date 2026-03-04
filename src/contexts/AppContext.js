// src/contexts/AppContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, getCollRef, getDocRef } from '../App'; // هتعدل المسار ده بعد كده

// 1. إنشاء الـ Context
const AppContext = createContext();

// 2. دوال مساعدة للـ Context
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

// 3. المكون الرئيسي للـ Context
export const AppProvider = ({ children, appUser }) => {
  const [warehouses, setWarehouses] = useState([{id: 'main', name: 'المخزن الرئيسي'}]);
  const [warehouseMap, setWarehouseMap] = useState({'main': 'المخزن الرئيسي'});
  const [employees, setEmployees] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [maintenanceCenters, setMaintenanceCenters] = useState([]);
  const [callCenters, setCallCenters] = useState([]);
  const [systemSettings, setSystemSettings] = useState({
    systemName: 'نوڤال ERP',
    storeName: 'نوڤال للإلكترونيات',
    invoiceLogo: '',
    invoiceDisplayMode: 'detailed',
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
      paperSize: '80mm'
    },
    taxRate: 14,
    footerText: 'شكراً لتعاملكم معنا.',
    installationFees: [],
    productCategories: [],
    technicians: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 4. جلب بيانات الفروع
  useEffect(() => {
    if (!appUser) return;

    const unsubW = onSnapshot(getCollRef('warehouses'), (s) => {
      const whs = [{id: 'main', name: 'المخزن الرئيسي'}];
      s.docs.forEach(d => whs.push({id: d.id, ...d.data()}));
      setWarehouses(whs);
      
      const m = {};
      whs.forEach(w => m[w.id] = w.name);
      setWarehouseMap(m);
    }, (error) => {
      console.error("Error fetching warehouses:", error);
      setError(error);
    });

    return () => unsubW();
  }, [appUser]);

  // 5. جلب بيانات الموظفين
  useEffect(() => {
    if (!appUser) return;

    const unsubE = onSnapshot(
      query(getCollRef('employees'), where('isDisabled', '==', false)),
      (s) => {
        const emps = s.docs.map(d => ({ id: d.id, ...d.data() }));
        setEmployees(emps);
        
        // تصنيف الموظفين حسب الأدوار
        setTechnicians(emps.filter(e => e.role === 'technician'));
        setMaintenanceCenters(emps.filter(e => e.role === 'maintenance_center'));
        setCallCenters(emps.filter(e => e.role === 'call_center'));
      },
      (error) => {
        console.error("Error fetching employees:", error);
        setError(error);
      }
    );

    return () => unsubE();
  }, [appUser]);

  // 6. جلب الإعدادات
  useEffect(() => {
    if (!appUser) return;

    const unsubS = onSnapshot(getDocRef('settings', 'general'), (d) => {
      if (d.exists()) {
        setSystemSettings(prev => ({...prev, ...d.data()}));
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching settings:", error);
      setError(error);
      setLoading(false);
    });

    return () => unsubS();
  }, [appUser]);

  // 7. القيم اللي هنشاركها مع كل المكونات
  const value = {
    warehouses,
    warehouseMap,
    employees,
    technicians,
    maintenanceCenters,
    callCenters,
    systemSettings,
    setSystemSettings,
    loading,
    error
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
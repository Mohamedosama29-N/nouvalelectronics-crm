import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, query, where
} from 'firebase/firestore';
import {
  Download,
  AlertOctagon,
  Bell,
  Webhook
} from 'lucide-react';
import { db } from '../../firebase/config';
import { showError, showSuccess } from '../../utils/alerts';

export function LowStockView({ lowStockItems = [], appUser, warehouseMap, systemSettings = {} }) {

  const [items,setItems] = useState(lowStockItems);
  const [selectedWarehouse,setSelectedWarehouse] = useState('all');
  const [search,setSearch] = useState("");
  const [loading,setLoading] = useState(false);

  useEffect(()=>{

    if(lowStockItems.length > 0){
      setItems(lowStockItems);
      return;
    }

    const fetchLowStock = async()=>{

      setLoading(true);

      try{

        const q = query(
          collection(db,'inventory'),
          where('isDeleted','==',false)
        );

        const snap = await getDocs(q);

        let lowList = [];

        snap.docs.forEach(doc => {

        const data = doc.data();

        if(data.isDeleted) return;

        if(
          appUser.role !== 'admin' &&
          !appUser.permissions?.viewAllWarehouses &&
          data.warehouseId !== (appUser.assignedWarehouseId || 'main')
        ){
          return;
        }

        const qty = parseFloat(data.quantity) || 0;
        const minStock = parseFloat(data.minStock);

        if(
          minStock !== undefined &&
          minStock !== null &&
          !isNaN(minStock) &&
          qty <= minStock
        ){

          lowList.push({
            id:doc.id,
            name:data.name || "",
            serialNumber:data.serialNumber || "",
            quantity:qty,
            minStock:minStock,
            warehouseId:data.warehouseId || "main",
            price:Number(data.price || 0),
            category:data.category || "عام"
          });

        }

      });

        setItems(lowList);

      }catch(e){

        console.error("LowStock Error:",e);

      }

      setLoading(false);

    };

    fetchLowStock();

  },[lowStockItems,appUser]);
  const filteredItems = (items || []).filter(item => {

  const term = (search || "").toString().trim().toLowerCase();

  const name = (item.name || "").toString().toLowerCase();
  const serial = (item.serialNumber || "").toString().toLowerCase();
  const category = (item.category || "").toString().toLowerCase();

  const warehouseMatch =
    selectedWarehouse === "all" ||
    item.warehouseId === selectedWarehouse;

  if (!term) return warehouseMatch;

  const searchMatch =
    name.includes(term) ||
    serial.includes(term) ||
    category.includes(term);

  return warehouseMatch && searchMatch;

});
  
  const warehouses = [...new Set(items.map(i=>i.warehouseId))];



  const handleExport = ()=>{

    if(filteredItems.length === 0) return;

    const rows = [
      ["المنتج","السيريال","المخزن","الكمية","حد الطلب"]
    ];

    filteredItems.forEach(i=>{

      rows.push([
        i.name,
        i.serialNumber,
        warehouseMap[i.warehouseId] || i.warehouseId,
        i.quantity,
        i.minStock
      ]);

    });

    const csv = rows.map(r=>r.join(",")).join("\n");

    const blob = new Blob([csv],{type:'text/csv'});
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "low_stock_report.csv";
    a.click();

  };

  // ✨ ميزة جديدة: إرسال تنبيه النواقص لرابط Webhook (بريد/واتساب عبر خدمة وسيطة)
  const [sendingAlert, setSendingAlert] = useState(false);
  const alertConfig = systemSettings.lowStockAlerts || {};

  const sendLowStockAlert = useCallback(async (isAuto = false) => {
    if (!alertConfig.webhookUrl || items.length === 0) return;
    setSendingAlert(true);
    try {
      await fetch(alertConfig.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'low_stock_alert',
          triggeredAt: new Date().toISOString(),
          count: items.length,
          items: items.map(i => ({
            name: i.name,
            serialNumber: i.serialNumber,
            quantity: i.quantity,
            minStock: i.minStock,
            warehouse: warehouseMap[i.warehouseId] || i.warehouseId
          }))
        })
      });
      localStorage.setItem('lastLowStockAlertSentAt', Date.now().toString());
      if (!isAuto) showSuccess("تم إرسال تنبيه النواقص بنجاح");
    } catch (error) {
      console.error("Low stock alert error:", error);
      if (!isAuto) showError("فشل إرسال التنبيه، تأكد من صحة رابط الـ Webhook");
    }
    setSendingAlert(false);
  }, [alertConfig.webhookUrl, items, warehouseMap]);

  // محاولة إرسال تلقائي لما الشاشة تفتح، بس لو عدّى الوقت المحدد من آخر إرسال
  // (بما إن التطبيق يعمل من المتصفح، ده مش بديل لسيرفر شغال 24 ساعة)
  useEffect(() => {
    if (!alertConfig.enabled || !alertConfig.webhookUrl || items.length === 0) return;
    const lastSent = Number(localStorage.getItem('lastLowStockAlertSentAt') || 0);
    const hoursSince = (Date.now() - lastSent) / (1000 * 60 * 60);
    if (hoursSince >= (alertConfig.frequencyHours || 24)) {
      sendLowStockAlert(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertConfig.enabled, items.length]);

  if(loading){

    return(
      <div className="flex justify-center items-center h-64 text-slate-500 dark:text-slate-400">
        جاري تحميل النواقص...
      </div>
    );

  }



  return(

    <div className="space-y-6 text-right" dir="rtl">

      <div className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">

        <div className="flex flex-wrap gap-4 justify-between items-center mb-6">

          <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            <AlertOctagon className="text-rose-500" size={24}/>
            الأصناف التي وصلت لحد الطلب
          </h2>


          <div className="flex gap-3">

            <input
              placeholder="بحث بالاسم أو السيريال..."
              className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm w-52 bg-white dark:bg-slate-900 dark:text-white"
              value={search}
              onChange={e=>setSearch(e.target.value)}
            />

            <select
              className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900 dark:text-white"
              value={selectedWarehouse}
              onChange={e=>setSelectedWarehouse(e.target.value)}
            >
              <option value="all">كل المخازن</option>

              {warehouses.map(w=>(
                <option key={w} value={w}>
                  {warehouseMap[w] || w}
                </option>
              ))}

            </select>


            <button
              onClick={handleExport}
              disabled={filteredItems.length === 0}
              className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-2 disabled:opacity-50"
            >
              <Download size={14}/> تصدير
            </button>

            {alertConfig.webhookUrl && (
              <button
                onClick={() => sendLowStockAlert(false)}
                disabled={sendingAlert || items.length === 0}
                title="إرسال قائمة النواقص الحالية للـ Webhook المحدد في الإعدادات"
                className="bg-amber-50 text-amber-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-100 flex items-center gap-2 disabled:opacity-50"
              >
                <Bell size={14}/> {sendingAlert ? 'جاري الإرسال...' : 'إرسال تنبيه الآن'}
              </button>
            )}

          </div>

        </div>



        <div className="overflow-x-auto">

          <table className="w-full text-right text-sm">

            <thead className="bg-slate-50 dark:bg-slate-900 border-b dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold text-xs">

              <tr>
                <th className="p-4">السيريال</th>
                <th className="p-4">المنتج</th>
                <th className="p-4 text-center">المخزن</th>
                <th className="p-4 text-center">الكمية</th>
                <th className="p-4 text-center">حد الطلب</th>
                <th className="p-4 text-center">الحالة</th>
              </tr>

            </thead>



            <tbody className="divide-y">

              {filteredItems.length === 0 ?(

                <tr>
                  <td colSpan="6" className="p-10 text-center text-slate-400 dark:text-slate-500 font-bold">
                    لا توجد نواقص حالياً
                  </td>
                </tr>

              ):

              filteredItems.map(item=>(

                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">

                  <td className="p-4 font-mono text-slate-500 dark:text-slate-400">
                    {item.serialNumber}
                  </td>

                  <td className="p-4 font-bold text-slate-800 dark:text-white">
                    {item.name}
                  </td>

                  <td className="p-4 text-center text-teal-600 font-bold">
                    {warehouseMap[item.warehouseId] || item.warehouseId}
                  </td>

                  <td className="p-4 text-center font-black text-rose-600">
                    {item.quantity}
                  </td>

                  <td className="p-4 text-center font-bold">
                    {item.minStock}
                  </td>

                  <td className="p-4 text-center">

                    <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                      ناقص
                    </span>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    </div>

  );

}

// ==========================================================================
// 📊 مدير التقارير المحسن مع PDF وتصدير متقدم
// ==========================================================================

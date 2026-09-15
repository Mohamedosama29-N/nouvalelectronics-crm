import React, { useState, useEffect } from 'react';
import {
  collection, query, where, orderBy, onSnapshot, limit
} from 'firebase/firestore';
import {
  Loader2,
  Activity
} from 'lucide-react';
import { USER_ROLES } from '../../constants/roles';
import { db } from '../../firebase/config';
import { formatDate } from '../../utils/format';
import { getRoleColorClasses, getRoleIcon } from '../../utils/roleHelpers';

export function EmployeeProfileView({ userToView, warehouseMap }) {
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState({ totalActions: 0, lastActive: null, commonActions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userToView) return;
    setLoading(true);
    
    const q = query(
        collection(db, 'activity_logs'), 
        where('userId', '==', userToView.id), 
        orderBy('timestamp', 'desc'), 
        limit(100)
    );
    
    const unsub = onSnapshot(q, snap => {
        const logs = snap.docs.map(d => ({id: d.id, ...d.data()}));
        setActivities(logs);
        
        const actionCounts = {};
        logs.forEach(log => {
          actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
        });
        
        const commonActions = Object.entries(actionCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([action, count]) => ({ action, count }));
        
        setStats({
          totalActions: logs.length,
          lastActive: logs[0]?.timestamp,
          commonActions
        });
        
        setLoading(false);
    }, (error) => {
        console.error(error);
        setLoading(false);
    });

    return () => unsub();
  }, [userToView]);

  if (!userToView) return null;

  const RoleIcon = getRoleIcon(userToView.role);

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-right" dir="rtl">
       <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="w-24 h-24 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-3xl flex items-center justify-center font-black text-4xl text-white shadow-xl shadow-indigo-200 shrink-0">
              {userToView.name?.charAt(0) || userToView.email?.charAt(0) || '?'}
            </div>
            <div className="flex-1 text-center md:text-right">
              <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-2">{userToView.name}</h2>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-sm font-bold">
                 <span className="text-slate-500 dark:text-slate-400 font-mono" dir="ltr">{userToView.email}</span>
                 {userToView.phone && <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-lg">{userToView.phone}</span>}
                 <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-lg">الفرع: {warehouseMap[userToView.assignedWarehouseId] || 'الرئيسي'}</span>
                 <span className={`px-3 py-1 rounded-lg ${getRoleColorClasses(userToView.role)} flex items-center gap-1`}>
                   <RoleIcon size={14}/> {USER_ROLES.find(r => r.key === userToView.role)?.label || userToView.role}
                 </span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl text-center">
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">إجمالي النشاطات</p>
              <p className="text-2xl font-black text-indigo-800 dark:text-indigo-300">{stats.totalActions}</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl text-center">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">آخر نشاط</p>
              <p className="text-lg font-black text-emerald-800 dark:text-emerald-300">{formatDate(stats.lastActive)}</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/30 p-4 rounded-xl text-center">
              <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">تاريخ الانضمام</p>
              <p className="text-lg font-black text-purple-800 dark:text-purple-300">{formatDate(userToView.createdAt)}</p>
            </div>
          </div>
          
          {stats.commonActions.length > 0 && (
            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
              <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-3">أكثر الإجراءات تكراراً</h3>
              <div className="flex flex-wrap gap-2">
                {stats.commonActions.map((item, idx) => (
                  <span key={idx} className="bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700">
                    {item.action} ({item.count})
                  </span>
                ))}
              </div>
            </div>
          )}
       </div>

       <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
           <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2 mb-8 border-b pb-4">
              <Activity className="text-indigo-600" size={24}/> سجل النشاطات (آخر 100 حركة)
           </h3>
           
           {loading ? (
               <div className="flex justify-center p-10"><Loader2 className="animate-spin text-indigo-500" size={32}/></div>
           ) : activities.length === 0 ? (
               <div className="text-center p-12 text-slate-400 dark:text-slate-500 font-bold border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-2xl">
                   لا توجد نشاطات مسجلة لهذا الموظف حتى الآن.
               </div>
           ) : (
               <div className="relative border-r-2 border-indigo-200 dark:border-indigo-800 pr-6 ml-2 space-y-6">
                   {activities.map((act, idx) => (
                       <div key={act.id || idx} className="relative">
                           <span className="absolute -right-[33px] top-1.5 w-4 h-4 bg-white dark:bg-slate-800 border-2 border-indigo-400 rounded-full"></span>
                           <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
                               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                   <span className="font-black text-sm text-indigo-900 dark:text-indigo-300">{act.action}</span>
                                   <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 w-fit">
                                       {formatDate(act.timestamp)}
                                   </span>
                               </div>
                               <p className="text-xs font-bold text-slate-600 dark:text-slate-400 leading-relaxed">{act.details}</p>
                           </div>
                       </div>
                   ))}
               </div>
           )}
       </div>
    </div>
  );
}
// ==========================================================================
// 🔐 شاشة تسجيل الدخول المحسنة (مع تتبع IP والموقع)
// ==========================================================================

// MainLayout.js
import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Menu, LogOut } from 'lucide-react';
import { useApp } from './contexts/AppContext';

// استيراد كل الصفحات (خلي بالك من المسارات)
import DashboardView from './DashboardView';
import InventoryManager from './InventoryManager';
import EnhancedTransferManager from './EnhancedTransferManager';
import POSManager from './POSManager';
import EnhancedCustomerManager from './EnhancedCustomerManager';
import EnhancedTicketManager from './EnhancedTicketManager';
import ReportsManager from './ReportsManager';
import LowStockView from './LowStockView';
import EnhancedWarehouseManager from './EnhancedWarehouseManager';
import EnhancedUserManagement from './EnhancedUserManagement';
import EmployeeProfileView from './EmployeeProfileView';

function Sidebar({ appUser, systemSettings, onLogout }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const navigate = useNavigate();

  const menuItems = [
    { path: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, permission: 'viewDashboard' },
    { path: '/inventory', label: 'إدارة المخزون', icon: Package, permission: 'viewInventory' },
    { path: '/transfers', label: 'التحويلات المخزنية', icon: ArrowRightLeft, permission: 'viewTransfers' },
    { path: '/pos', label: 'نقطة البيع POS', icon: Receipt, permission: 'viewPOS' },
    { path: '/customers', label: 'سجل العملاء', icon: Users, permission: 'viewCustomers' },
    { path: '/tickets', label: 'تذاكر الصيانة', icon: MessageSquare, permission: 'manageTickets' },
    { path: '/reports', label: 'التقارير والمبيعات', icon: History, permission: 'viewReports' },
    { path: '/lowstock', label: 'النواقص', icon: AlertOctagon, permission: 'viewLowStock' }
  ];

  const adminItems = [
    { path: '/warehouses', label: 'إدارة الفروع', icon: Store, permission: 'manageWarehouses' },
    { path: '/users', label: 'الموظفين والصلاحيات', icon: UserCog, permission: 'manageUsers' },
    { path: '/settings', label: 'الإعدادات المركزية', icon: Settings, permission: 'manageSettings' }
  ];

  return (
    <>
      {isMobileOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsMobileOpen(false)} />
      )}
      
      <aside className={`fixed lg:static inset-y-0 right-0 z-50 w-64 bg-[#0f172a] text-slate-300 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out print:hidden ${isMobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-indigo-600 rounded-lg text-white"><Package size={18}/></div>
            <span className="font-black text-white truncate">{systemSettings.systemName}</span>
          </div>
        </div>
        
        <nav className="p-4 flex-1 space-y-1 overflow-y-auto custom-scrollbar">
          <p className="px-3 text-[10px] font-bold text-slate-500 uppercase mb-2 mt-2">القائمة</p>
          
          {menuItems.map(item => {
            if (item.permission && !appUser.permissions?.[item.permission] && appUser.role !== 'admin') {
              return null;
            }
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setIsMobileOpen(false);
                }}
                className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-colors font-bold text-xs ${
                  window.location.pathname === item.path
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'hover:bg-slate-800 hover:text-white text-slate-400'
                }`}
              >
                <item.icon size={16} className={window.location.pathname === item.path ? 'text-white' : 'opacity-70'} />
                {item.label}
              </button>
            );
          })}
          
          {appUser.role === 'admin' && (
            <>
              <p className="px-3 text-[10px] font-bold text-slate-500 uppercase mb-2 mt-6">الإدارة</p>
              {adminItems.map(item => (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setIsMobileOpen(false);
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-colors font-bold text-xs ${
                    window.location.pathname === item.path
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'hover:bg-slate-800 hover:text-white text-slate-400'
                  }`}
                >
                  <item.icon size={16} className={window.location.pathname === item.path ? 'text-white' : 'opacity-70'} />
                  {item.label}
                </button>
              ))}
            </>
          )}
        </nav>
        
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <button
            onClick={() => navigate(`/profile/${appUser.id}`)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-right"
          >
            <div className="w-8 h-8 rounded-md bg-indigo-500 flex items-center justify-center font-black text-white text-xs">
              {appUser.name?.charAt(0) || appUser.email?.charAt(0)}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{appUser.name || appUser.email}</p>
              <p className="text-[9px] text-slate-400 truncate uppercase">{appUser.role === 'admin' ? 'مدير' : 'موظف'}</p>
            </div>
          </button>
          
          <button
            onClick={onLogout}
            className="w-full px-4 py-2 bg-red-500/10 text-red-400 font-bold flex items-center justify-center gap-2 hover:bg-red-500 hover:text-white rounded-lg transition-colors text-xs"
          >
            <LogOut size={14} /> خروج
          </button>
        </div>
      </aside>
    </>
  );
}

function Header({ isOnline }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-10 print:hidden">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsMobileOpen(true)}
          className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-md"
        >
          <Menu size={20} />
        </button>
        <h2 className="font-bold text-slate-800 text-sm hidden sm:block">مرحباً بعودتك 👋</h2>
      </div>
      <div className="flex items-center gap-3 font-bold">
        <span
          className={`text-[9px] uppercase px-2 py-1 rounded border ${
            isOnline
              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
              : 'bg-rose-50 text-rose-600 border-rose-100'
          }`}
        >
          {isOnline ? 'متصل' : 'أوفلاين'}
        </span>
      </div>
    </header>
  );
}

export default function MainLayout({
  appUser,
  systemSettings,
  warehouses,
  warehouseMap,
  lowStockItems,
  notifications,
  globalLoading,
  isOnline,
  handleLogout,
  handleNavigateToInventory,
  handleGenerateInvoiceFromTicket
}) {
  const { technicians, maintenanceCenters, callCenters } = useApp();

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden text-right selection:bg-indigo-100" dir="rtl">
      
      {/* الإشعارات */}
      <div className="fixed top-6 left-6 z-[200] flex flex-col gap-2">
        {notifications.map(n => (
          <div
            key={n.id}
            className={`p-4 rounded-xl shadow-lg text-white font-bold text-xs animate-in slide-in-from-left-5 border-l-4 flex items-center gap-2 ${
              n.type === 'error' || n.type === 'warn'
                ? 'bg-slate-900 border-red-500'
                : 'bg-slate-900 border-emerald-500'
            }`}
          >
            {n.type === 'error' || n.type === 'warn' ? (
              <AlertTriangle size={16} className="text-red-500" />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-500" />
            )}
            {n.msg}
          </div>
        ))}
      </div>

      <Sidebar appUser={appUser} systemSettings={systemSettings} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0 relative">
        <Header isOnline={isOnline} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <div className="max-w-6xl mx-auto h-full pb-10 print:pb-0">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" />} />
              
              <Route path="/dashboard" element={
                <DashboardView 
                  appUser={appUser} 
                  warehouses={warehouses} 
                  onNavigateToInventory={handleNavigateToInventory} 
                  notify={notify} 
                />
              } />
              
              <Route path="/inventory" element={
                <InventoryManager 
                  appUser={appUser} 
                  warehouses={warehouses} 
                  notify={notify} 
                  setGlobalLoading={setGlobalLoading} 
                  warehouseMap={warehouseMap} 
                />
              } />
              
              <Route path="/transfers" element={
                <EnhancedTransferManager 
                  appUser={appUser} 
                  warehouseMap={warehouseMap} 
                  notify={notify} 
                  setGlobalLoading={setGlobalLoading} 
                />
              } />
              
              <Route path="/pos" element={
                <POSManager 
                  appUser={appUser} 
                  systemSettings={systemSettings} 
                  notify={notify} 
                  setGlobalLoading={setGlobalLoading} 
                  warehouseMap={warehouseMap} 
                />
              } />
              
              <Route path="/customers" element={
                <EnhancedCustomerManager 
                  appUser={appUser} 
                  systemSettings={systemSettings} 
                  notify={notify} 
                  setGlobalLoading={setGlobalLoading} 
                />
              } />
              
              <Route path="/tickets" element={
                <EnhancedTicketManager 
                  appUser={appUser} 
                  systemSettings={systemSettings} 
                  notify={notify} 
                  setGlobalLoading={setGlobalLoading} 
                  warehouseMap={warehouseMap} 
                  onGenerateInvoice={handleGenerateInvoiceFromTicket}
                  technicians={technicians}
                  maintenanceCenters={maintenanceCenters}
                  callCenters={callCenters}
                />
              } />
              
              <Route path="/reports" element={
                <ReportsManager notify={notify} />
              } />
              
              <Route path="/lowstock" element={
                <LowStockView 
                  lowStockItems={lowStockItems} 
                  appUser={appUser} 
                  warehouseMap={warehouseMap} 
                />
              } />
              
              <Route path="/warehouses" element={
                <EnhancedWarehouseManager 
                  warehouses={warehouses} 
                  appUser={appUser} 
                  notify={notify} 
                  setGlobalLoading={setGlobalLoading} 
                />
              } />
              
              <Route path="/users" element={
                <EnhancedUserManagement 
                  appUser={appUser} 
                  warehouses={warehouses} 
                  notify={notify} 
                  setGlobalLoading={setGlobalLoading} 
                  onViewProfile={(user) => navigate(`/profile/${user.id}`)} 
                />
              } />
              
              <Route path="/profile/:userId" element={
                <EmployeeProfileView 
                  userToView={appUser} 
                  warehouseMap={warehouseMap} 
                />
              } />
              
              <Route path="/settings" element={
                <div className="p-8 text-center text-slate-400">جاري تطوير الإعدادات</div>
              } />
              
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}
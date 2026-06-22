// ==========================================================================
// 📦 NOUVAL ERP SYSTEM - الإصدار النهائي المتكامل (الجزء 1)
// ==========================================================================

import React, { useState, useEffect, useMemo, useRef, useCallback, useContext } from 'react';
import { FixedSizeList as List } from 'react-window';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell 
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CryptoJS from 'crypto-js';
import { openDB } from 'idb';
import Swal from 'sweetalert2';
import html2canvas from "html2canvas";
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously 
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, 
  query, where, serverTimestamp, orderBy, onSnapshot, setDoc, increment, 
  limit, runTransaction, writeBatch, startAfter, Timestamp, arrayUnion
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

import { 
  LayoutDashboard, Package, Users, Receipt, ArrowRightLeft, LogOut, 
  AlertTriangle, Download, Plus, Search, Settings, Edit, Store, 
  Trash2, User, Save, Printer, Contact, History, 
  Lock, FileSpreadsheet, Calculator, AlertOctagon, MapPin, 
  Phone, Loader2, Menu, UserCog, Wrench, Wallet, Mail, 
  CheckCircle2, Calendar, X, LogIn, Shield, Image as ImageIcon, Percent,
  ChevronDown, Database, UploadCloud, DownloadCloud, Check, Activity, Eye,
  Home, Map as MapIcon, Building, FileText, Printer as PrinterIcon, Copy, Grid,
  Filter, RefreshCw, UsersRound, UserCheck, UserX, UserPlus, Briefcase,
  HardHat, Headphones, Settings as SettingsIcon, GitBranch, GitMerge,
  AlertCircle, CheckCircle, XCircle, Clock, ThumbsUp, ThumbsDown,
  MessageSquare, Flag, Star, Award, Crown, ShieldCheck, BarChart3,
  TrendingUp, TrendingDown, PieChart as PieChartIcon, LineChart as LineChartIcon,
  DownloadCloud as DownloadIcon, RefreshCcw, WifiOff, Sun, Moon,
  Key, Globe, MapPin as MapPinIcon, Fingerprint, Webhook, 
  MessageCircle, Share2, FileJson, Server, Cloud, Zap, EyeOff,
  RotateCcw, Sparkles, Box, Layers, ShoppingBag, Truck, 
  Wrench as WrenchIcon, Headphones as HeadphonesIcon, Star as StarIcon,
  FileText as FileTextIcon, Settings as CogIcon, Trash as TrashIcon, Info
} from 'lucide-react';

// ==========================================================================
// 🔥 FIREBASE CONFIGURATION (Vite compatible)
// ==========================================================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBrRvCAWdC_SOjBqSFPXyav-3ifE80UoLU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "nouval-system.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "nouval-system",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "nouval-system.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "194279959532",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:194279959532:web:578f5894f58102d4872ec9"
};

// التحقق من وجود المتغيرات
console.log('🔥 Firebase Config Loaded:', {
  projectId: firebaseConfig.projectId,
  hasApiKey: !!firebaseConfig.apiKey
});

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
let messaging;
try {
  messaging = getMessaging(app);
} catch (error) {
  console.warn('Firebase Messaging not available:', error);
}

const getCollRef = (collName) => collection(db, collName);
const getDocRef = (collName, docId) => doc(db, collName, docId);

// مراجع مجموعات المنتجات والموديلات وأكواد الأعطال
const getProductsColl = () => collection(db, 'products');
const getModelsColl = () => collection(db, 'models');
const getFaultCodesColl = () => collection(db, 'faultCodes');



// ==========================================================================
// 🔐 ENCRYPTION SETUP
// ==========================================================================
const SECRET_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'nouval-secret-key-2024$$Nada202$$291';

const encrypt = (data) => {
  return CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
};

const decrypt = (ciphertext) => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  } catch {
    return null;
  }
};

const saveSecurely = (key, data) => {
  localStorage.setItem(key, encrypt(data));
};

const loadSecurely = (key) => {
  const encrypted = localStorage.getItem(key);
  return encrypted ? decrypt(encrypted) : null;
};

// ==========================================================================
// 🎯 SWEETALERT2 HELPER FUNCTIONS
// ==========================================================================
const showConfirm = async (title, text, icon = 'warning', confirmText = 'نعم، تأكيد') => {
  const result = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: confirmText,
    cancelButtonText: 'إلغاء',
    reverseButtons: true
  });
  return result.isConfirmed;
};

const showSuccess = (message, title = 'تم بنجاح') => {
  Swal.fire({
    title,
    text: message,
    icon: 'success',
    timer: 2000,
    showConfirmButton: false
  });
};

const showError = (message, title = 'خطأ') => {
  Swal.fire({
    title,
    text: message,
    icon: 'error',
    confirmButtonText: 'حسناً'
  });
};

const showWarning = (message, title = 'تنبيه') => {
  Swal.fire({
    title,
    text: message,
    icon: 'warning',
    confirmButtonText: 'فهمت'
  });
};

const showInfo = (message, title = 'معلومة') => {
  Swal.fire({
    title,
    text: message,
    icon: 'info',
    confirmButtonText: 'حسناً'
  });
};

// ==========================================================================
// 💾 INDEXEDDB SETUP (Offline Storage)
// ==========================================================================
const dbPromise = openDB('nouval-offline-db', 3, {
  upgrade(db, oldVersion, newVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('inventory', { keyPath: 'id' });
      db.createObjectStore('transactions', { keyPath: 'id' });
      db.createObjectStore('customers', { keyPath: 'id' });
      db.createObjectStore('tickets', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'id' });
      db.createObjectStore('warehouses', { keyPath: 'id' });
      db.createObjectStore('employees', { keyPath: 'id' });
    }
    if (oldVersion < 2) {
      const syncStore = db.createObjectStore('sync_queue', { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      syncStore.createIndex('timestamp', 'timestamp');
      syncStore.createIndex('attempts', 'attempts');
    }
    if (oldVersion < 3) {
      db.createObjectStore('search_cache', { keyPath: 'term' });
      db.createObjectStore('reports_cache', { keyPath: 'id' });
      db.createObjectStore('backups', { keyPath: 'id' });
    }
  },
});

export const offlineDB = {
  async save(store, data) {
    try {
      const db = await dbPromise;
      await db.put(store, data);
      return true;
    } catch (error) {
      console.error('Offline save error:', error);
      return false;
    }
  },

  async get(store, id) {
    try {
      const db = await dbPromise;
      return await db.get(store, id);
    } catch (error) {
      console.error('Offline get error:', error);
      return null;
    }
  },

  async getAll(store) {
    try {
      const db = await dbPromise;
      return await db.getAll(store);
    } catch (error) {
      console.error('Offline getAll error:', error);
      return [];
    }
  },

  async delete(store, id) {
    try {
      const db = await dbPromise;
      await db.delete(store, id);
      return true;
    } catch (error) {
      console.error('Offline delete error:', error);
      return false;
    }
  },

  async clear(store) {
    try {
      const db = await dbPromise;
      await db.clear(store);
      return true;
    } catch (error) {
      console.error('Offline clear error:', error);
      return false;
    }
  },

  async addToSyncQueue(operation) {
    try {
      const db = await dbPromise;
      return await db.add('sync_queue', {
        ...operation,
        timestamp: Date.now(),
        attempts: 0,
        lastAttempt: null
      });
    } catch (error) {
      console.error('Add to sync queue error:', error);
      return null;
    }
  },

  async getSyncQueue() {
    try {
      const db = await dbPromise;
      return await db.getAll('sync_queue');
    } catch (error) {
      console.error('Get sync queue error:', error);
      return [];
    }
  },

  async updateSyncQueue(id, updates) {
    try {
      const db = await dbPromise;
      const item = await db.get('sync_queue', id);
      if (item) {
        await db.put('sync_queue', { ...item, ...updates });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Update sync queue error:', error);
      return false;
    }
  },

  async removeFromSyncQueue(id) {
    try {
      const db = await dbPromise;
      await db.delete('sync_queue', id);
      return true;
    } catch (error) {
      console.error('Remove from sync queue error:', error);
      return false;
    }
  },

  async saveSearchCache(term, results) {
    try {
      const db = await dbPromise;
      await db.put('search_cache', {
        term,
        results,
        timestamp: Date.now()
      });
      return true;
    } catch (error) {
      console.error('Save search cache error:', error);
      return false;
    }
  },

  async getSearchCache(term) {
    try {
      const db = await dbPromise;
      const cached = await db.get('search_cache', term);
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return cached.results;
      }
      return null;
    } catch (error) {
      console.error('Get search cache error:', error);
      return null;
    }
  },

  async syncWithServer() {
    const queue = await this.getSyncQueue();
    let synced = 0;
    let failed = 0;

    for (const item of queue) {
      if (item.attempts >= 5) {
        failed++;
        continue;
      }

      try {
        switch (item.type) {
          case 'add':
            await addDoc(collection(db, item.collection), item.data);
            break;
          case 'update':
            await updateDoc(doc(db, item.collection, item.id), item.data);
            break;
          case 'delete':
            await deleteDoc(doc(db, item.collection, item.id));
            break;
        }
        
        await this.removeFromSyncQueue(item.id);
        synced++;
      } catch (error) {
        console.error('Sync failed:', error);
        await this.updateSyncQueue(item.id, {
          attempts: item.attempts + 1,
          lastAttempt: Date.now(),
          lastError: error.message
        });
        failed++;
      }
    }

    return { synced, failed };
  }
};

// ==========================================================================
// 🚦 RATE LIMITER
// ==========================================================================
class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.requests = new globalThis.Map();
  }

  check(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    
    const validRequests = userRequests.filter(
      time => now - time < this.windowMs
    );
    
    if (validRequests.length >= this.limit) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }

  getRemaining(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    const validRequests = userRequests.filter(
      time => now - time < this.windowMs
    );
    return Math.max(0, this.limit - validRequests.length);
  }

  reset(key) {
    this.requests.delete(key);
  }
}

export const apiLimiter = new RateLimiter(60, 60000);


// ==========================================================================
// 👤 USER IP & LOCATION TRACKING
// ==========================================================================
const getUserIP = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return 'unknown';
  }
};

const getUserLocation = async (ip) => {
  try {
    const response = await fetch(`https://ip-api.com/json/${ip}`);
    const data = await response.json();
    if (data.status === 'success') {
      return {
        country: data.country,
        region: data.regionName,
        city: data.city,
        lat: data.lat,
        lon: data.lon,
        isp: data.isp
      };
    }
    return null;
  } catch {
    return null;
  }
};

const getUserAgent = () => {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let os = 'Unknown';

  if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
  else if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
  else if (ua.indexOf('Safari') > -1) browser = 'Safari';
  else if (ua.indexOf('Edge') > -1) browser = 'Edge';
  else if (ua.indexOf('MSIE') > -1 || ua.indexOf('Trident') > -1) browser = 'Internet Explorer';

  if (ua.indexOf('Windows') > -1) os = 'Windows';
  else if (ua.indexOf('Mac') > -1) os = 'MacOS';
  else if (ua.indexOf('Linux') > -1) os = 'Linux';
  else if (ua.indexOf('Android') > -1) os = 'Android';
  else if (ua.indexOf('iOS') > -1) os = 'iOS';

  return { browser, os, ua };
};

const logUserLogin = async (user) => {
  try {
    const ip = await getUserIP();
    const location = await getUserLocation(ip);
    const { browser, os, ua } = getUserAgent();

    await addDoc(collection(db, 'login_history'), {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      ip,
      location,
      browser,
      os,
      userAgent: ua,
      timestamp: serverTimestamp(),
      success: true
    });

    const userRef = doc(db, 'employees', user.id);
    await updateDoc(userRef, {
      lastIPs: arrayUnion(ip),
      lastLogin: serverTimestamp()
    });

  } catch (error) {
    console.error('Error logging login:', error);
  }
};

// ==========================================================================
// 💾 USER STORAGE (لحل مشكلة الرفريش)
// ==========================================================================
const USER_STORAGE_KEY = 'nouval_current_user';

const saveUserToStorage = (user) => {
  try {
    saveSecurely(USER_STORAGE_KEY, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      assignedWarehouseId: user.assignedWarehouseId,
      permissions: user.permissions,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error saving user to storage:', error);
  }
};

const loadUserFromStorage = () => {
  try {
    const user = loadSecurely(USER_STORAGE_KEY);
    if (user && Date.now() - user.timestamp < 24 * 60 * 60 * 1000) {
      return user;
    }
  } catch (error) {
    console.error('Error loading user from storage:', error);
  }
  return null;
};

const clearUserFromStorage = () => {
  localStorage.removeItem(USER_STORAGE_KEY);
};

// ==========================================================================
// ✅ دوال التحقق من البيانات
// ==========================================================================
const validators = {
  inventory: (item) => {
    const errors = [];
    if (!item.serialNumber || item.serialNumber.length < 3) {
      errors.push("السيريال يجب أن يكون 3 أحرف على الأقل");
    }
    if (!item.name || item.name.length < 2) {
      errors.push("اسم المنتج قصير جداً");
    }
    if (item.price < 0) {
      errors.push("السعر لا يمكن أن يكون سالباً");
    }
    if (item.quantity < 0) {
      errors.push("الكمية لا يمكن أن تكون سالبة");
    }
    return errors;
  },
  
  customer: (customer) => {
    const errors = [];
    if (!customer.name || customer.name.length < 3) {
      errors.push("اسم العميل قصير جداً");
    }
    if (!customer.phone || !/^01[0-9]{9}$/.test(customer.phone)) {
      errors.push("رقم الهاتف غير صحيح (يجب أن يبدأ بـ 01 ويتكون من 11 رقم)");
    }
    return errors;
  },
  
  user: (user) => {
    const errors = [];
    if (!user.name || user.name.length < 3) {
      errors.push("الاسم يجب أن يكون 3 أحرف على الأقل");
    }
    if (!user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
      errors.push("البريد الإلكتروني غير صحيح");
    }
    if (!user.pass || user.pass.length < 6) {
      errors.push("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    }
    return errors;
  },
  
  transaction: (transaction) => {
    const errors = [];
    if (!transaction.customerName) {
      errors.push("اسم العميل مطلوب");
    }
    if (transaction.finalTotal < 0) {
      errors.push("المبلغ الإجمالي لا يمكن أن يكون سالباً");
    }
    return errors;
  }
};

// ==========================================================================
// 📊 مكونات الرسوم البيانية المتقدمة
// ==========================================================================
function AdvancedCharts({ data, type = 'line', title, height = 300 }) {
  const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d'];

  if (!data || data.length === 0) {
    return <div className="text-center text-slate-400 py-8">لا توجد بيانات</div>;
  }

  const chartData = data.map(item => ({
    name: item.name || item.label || item.date,
    value: item.value || item.count || item.total
  }));

  const renderChart = () => {
    switch(type) {
      case 'line':
        return (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke="#8884d8" />
          </LineChart>
        );
      case 'bar':
        return (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="#8884d8" />
          </BarChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={entry => entry.name}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
      {title && <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-white">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}

// ==========================================================================
// 📄 PDF EXPORT
// ==========================================================================
export const exportToPDF = async (data, title, headers) => {
  const doc = new jsPDF();
  
  doc.setFont('cairo', 'normal');
  doc.setFontSize(20);
  doc.text(title, 105, 15, { align: 'center' });
  
  doc.setFontSize(10);
  doc.text(`تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}`, 105, 25, { align: 'center' });
  
  autoTable(doc, {
    head: [headers],
    body: data.map(row => headers.map(h => row[h] || '-')),
    theme: 'striped',
    styles: { 
      font: 'cairo', 
      halign: 'right',
      fontSize: 8,
      cellPadding: 3
    },
    headStyles: { 
      fillColor: [79, 70, 229],
      textColor: 255,
      fontSize: 9
    },
    margin: { top: 35 }
  });
  
  doc.save(`${title}_${new Date().toISOString().split('T')[0]}.pdf`);
};

// ==========================================================================
// 📧 EMAIL SERVICE
// ==========================================================================
export const sendEmail = async (to, subject, body, attachments = []) => {
  try {
    const response = await fetch('YOUR_EMAIL_API_ENDPOINT', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject,
        body,
        attachments
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

// ==========================================================================
// 💬 WHATSAPP INTEGRATION
// ==========================================================================
export const sendWhatsApp = (phone, message) => {
  const cleanPhone = phone.replace(/\D/g, '');
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

// ==========================================================================
// 🔑 API KEYS MANAGEMENT
// ==========================================================================
export const generateAPIKey = (user, permissions) => {
  const key = {
    id: 'key_' + Date.now().toString(36) + Math.random().toString(36).substr(2),
    key: CryptoJS.lib.WordArray.random(32).toString(),
    userId: user.id,
    userName: user.name,
    permissions,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastUsed: null,
    isActive: true
  };
  
  return key;
};

export const validateAPIKey = async (apiKey) => {
  try {
    const q = query(collection(db, 'api_keys'), where('key', '==', apiKey));
    const snap = await getDocs(q);
    
    if (snap.empty) {
      return { valid: false, error: 'مفتاح API غير صالح' };
    }
    
    const keyData = snap.docs[0].data();
    
    if (!keyData.isActive) {
      return { valid: false, error: 'مفتاح API معطل' };
    }
    
    if (new Date(keyData.expiresAt) < new Date()) {
      return { valid: false, error: 'انتهت صلاحية المفتاح' };
    }
    
    await updateDoc(doc(db, 'api_keys', snap.docs[0].id), {
      lastUsed: serverTimestamp()
    });
    
    return { valid: true, permissions: keyData.permissions };
  } catch (error) {
    console.error('API key validation error:', error);
    return { valid: false, error: 'خطأ في التحقق' };
  }
};

// ==========================================================================
// 🌀 LOADING SKELETON
// ==========================================================================
function LoadingSkeleton({ type = 'table', count = 1 }) {
  if (type === 'table') {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-slate-200 rounded mb-4 w-1/4"></div>
        <div className="space-y-3">
          {[...Array(count)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-8 bg-slate-200 rounded w-1/6"></div>
              <div className="h-8 bg-slate-200 rounded w-3/6"></div>
              <div className="h-8 bg-slate-200 rounded w-1/6"></div>
              <div className="h-8 bg-slate-200 rounded w-1/6"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-10 bg-slate-200 rounded w-3/4"></div>
      <div className="h-32 bg-slate-200 rounded"></div>
    </div>
  );
}
// ==========================================================================
// 📦 الثوابت والبيانات
// ==========================================================================
const USER_ROLES = [
  { key: 'admin', label: 'مدير النظام', level: 100, icon: Crown, color: 'purple' },
  { key: 'main_warehouse_manager', label: 'مسؤول المخزن الرئيسي', level: 90, icon: ShieldCheck, color: 'indigo' },
  { key: 'warehouse_manager', label: 'مسؤول مخزن', level: 80, icon: Shield, color: 'blue' },
  { key: 'accountant', label: 'محاسب', level: 60, icon: Calculator, color: 'emerald' },
  { key: 'maintenance_center', label: 'مركز صيانة', level: 50, icon: Wrench, color: 'orange' },
  { key: 'technician', label: 'فني صيانة', level: 40, icon: HardHat, color: 'amber' },
  { key: 'call_center', label: 'كول سنتر', level: 30, icon: Headphones, color: 'cyan' },
  { key: 'sales', label: 'موظف مبيعات', level: 20, icon: User, color: 'slate' }
];

const ALL_PERMISSIONS = [
  // عام
  { key: 'viewDashboard', label: 'لوحة التحكم والمؤشرات', category: 'عام' },
  
  // مخزون
  { key: 'viewInventory', label: 'عرض المخزون', category: 'مخزون' },
  { key: 'addInventoryItem', label: 'إضافة صنف', category: 'مخزون' },
  { key: 'editInventoryItem', label: 'تعديل صنف', category: 'مخزون' },
  { key: 'deleteInventoryItem', label: 'حذف صنف', category: 'مخزون' },
  { key: 'bulkDeleteInventory', label: 'حذف مجمع للمخزون', category: 'مخزون' },
  { key: 'importInventoryCSV', label: 'استيراد مخزون من CSV', category: 'مخزون' },
  { key: 'exportInventoryCSV', label: 'تصدير مخزون إلى CSV', category: 'مخزون' },
  { key: 'viewInventoryValue', label: 'رؤية قيمة المخزون', category: 'مخزون' },
  { key: 'viewLowStock', label: 'مشاهدة النواقص', category: 'مخزون' },
  { key: 'bulkUpdatePrices', label: 'تحديث أسعار مجمع', category: 'مخزون' },
  
  // مبيعات
  { key: 'viewPOS', label: 'نقطة البيع', category: 'مبيعات' },
  { key: 'makeSale', label: 'إجراء عملية بيع', category: 'مبيعات' },
  { key: 'makeReturn', label: 'إجراء مرتجع', category: 'مبيعات' },
  { key: 'viewTransactions', label: 'عرض المعاملات', category: 'مبيعات' },
  { key: 'printInvoice', label: 'طباعة الفاتورة', category: 'مبيعات' },
  { key: 'exportTransactions', label: 'تصدير المعاملات', category: 'مبيعات' },
  { key: 'viewInvoices', label: 'عرض أرشيف الفواتير', category: 'المبيعات' },
  
  // عملاء
  { key: 'viewCustomers', label: 'عرض العملاء', category: 'عملاء' },
  { key: 'addCustomer', label: 'إضافة عميل', category: 'عملاء' },
  { key: 'editCustomer', label: 'تعديل عميل', category: 'عملاء' },
  { key: 'deleteCustomer', label: 'حذف عميل', category: 'عملاء' },
  { key: 'bulkDeleteCustomers', label: 'حذف مجمع للعملاء', category: 'عملاء' },
  { key: 'importCustomersCSV', label: 'استيراد عملاء من CSV', category: 'عملاء' },
  { key: 'exportCustomersCSV', label: 'تصدير عملاء إلى CSV', category: 'عملاء' },
  { key: 'viewCustomerHistory', label: 'عرض سجل العميل', category: 'عملاء' },
  
  // الصيانة
  { key: 'manageTickets', label: 'إدارة تذاكر الصيانة', category: 'صيانة' },
  { key: 'addTicket', label: 'إضافة تذكرة', category: 'صيانة' },
  { key: 'editTicket', label: 'تعديل تذكرة', category: 'صيانة' },
  { key: 'deleteTicket', label: 'حذف تذكرة', category: 'صيانة' },
  { key: 'bulkDeleteTickets', label: 'حذف مجمع للتذاكر', category: 'صيانة' },
  { key: 'addSpareParts', label: 'إضافة قطع غيار', category: 'صيانة' },
  { key: 'changeTicketStatus', label: 'تغيير حالة التذكرة', category: 'صيانة' },
  { key: 'assignTechnician', label: 'تعيين فني', category: 'صيانة' },
  { key: 'assignMaintenanceCenter', label: 'تعيين مركز صيانة', category: 'صيانة' },
  { key: 'assignCallCenter', label: 'تعيين كول سنتر', category: 'صيانة' },
  
  // تحويلات
  { key: 'viewTransfers', label: 'عرض التحويلات', category: 'تحويلات' },
  { key: 'createTransfer', label: 'إنشاء طلب تحويل', category: 'تحويلات' },
  { key: 'approveTransfer', label: 'الموافقة على التحويل', category: 'تحويلات' },
  { key: 'rejectTransfer', label: 'رفض التحويل', category: 'تحويلات' },
  
  // تقارير
  { key: 'viewReports', label: 'عرض التقارير', category: 'تقارير' },
  { key: 'viewCharts', label: 'رؤية الرسوم البيانية', category: 'تقارير' },
  { key: 'exportReports', label: 'تصدير التقارير', category: 'تقارير' },
  { key: 'exportPDF', label: 'تصدير PDF', category: 'تقارير' },
  { key: 'printReports', label: 'طباعة التقارير', category: 'تقارير' },
  { key: 'scheduleReports', label: 'جدولة التقارير', category: 'تقارير' },
  
  // فروع
  { key: 'viewWarehouses', label: 'عرض الفروع', category: 'فروع' },
  { key: 'manageWarehouses', label: 'إدارة الفروع', category: 'فروع' },
  { key: 'viewAllWarehouses', label: 'رؤية كل الفروع', category: 'فروع' },
  { key: 'assignUsersToWarehouse', label: 'تعيين مستخدمين للفرع', category: 'فروع' },
  
  // مستخدمين
  { key: 'viewUsers', label: 'عرض المستخدمين', category: 'مستخدمين' },
  { key: 'manageUsers', label: 'إدارة المستخدمين', category: 'مستخدمين' },
  { key: 'addUser', label: 'إضافة مستخدم', category: 'مستخدمين' },
  { key: 'editUser', label: 'تعديل مستخدم', category: 'مستخدمين' },
  { key: 'deleteUser', label: 'حذف مستخدم', category: 'مستخدمين' },
  { key: 'bulkDeleteUsers', label: 'حذف مجمع للمستخدمين', category: 'مستخدمين' },
  { key: 'managePermissions', label: 'إدارة الصلاحيات', category: 'مستخدمين' },
  { key: 'viewUserActivity', label: 'عرض نشاط المستخدم', category: 'مستخدمين' },
  { key: 'viewLoginHistory', label: 'عرض سجل الدخول', category: 'مستخدمين' },
  
  // إعدادات
  { key: 'viewSettings', label: 'عرض الإعدادات', category: 'إعدادات' },
  { key: 'manageSettings', label: 'تعديل الإعدادات', category: 'إعدادات' },
  { key: 'manageInvoiceTemplate', label: 'إدارة قالب الفاتورة', category: 'إعدادات' },
  { key: 'backupData', label: 'النسخ الاحتياطي', category: 'إعدادات' },
  { key: 'restoreData', label: 'استعادة البيانات', category: 'إعدادات' },
  { key: 'viewAuditLog', label: 'سجل التدقيق', category: 'إعدادات' },
  { key: 'manageAPIKeys', label: 'إدارة مفاتيح API', category: 'إعدادات' },
  { key: 'manageIntegrations', label: 'إدارة التكاملات', category: 'إعدادات' },
  { key: 'manageTags', label: 'إدارة الوسوم', category: 'إعدادات' },

    // إعدادات جزئية - للتحكم في من يمكنه تعديل ماذا
  { key: 'editSystemSettings', label: 'تعديل الإعدادات العامة (اسم النظام، الضريبة، الشعار)', category: 'إعدادات' },
  { key: 'editInvoiceTemplate', label: 'تعديل قالب الفاتورة', category: 'إعدادات' },
  { key: 'manageTechniciansList', label: 'إدارة قائمة الفنيين', category: 'إعدادات' },
  { key: 'manageFeesAndCategories', label: 'إدارة الرسوم والتصنيفات', category: 'إعدادات' },
  { key: 'manageProductModels', label: 'إدارة المنتجات والموديلات', category: 'إعدادات' },
  { key: 'manageFaultCodes', label: 'إدارة أكواد الأعطال', category: 'إعدادات' },
  { key: 'manageMaintenanceCenters', label: 'إدارة مراكز الصيانة', category: 'إعدادات' },
  { key: 'manageBranchesList', label: 'إدارة قائمة الفروع', category: 'إعدادات' },


  { key: 'viewAllWarehouses', label: 'رؤية كل الفروع والمخازن', category: 'فروع' },
  { key: 'viewReturnsWarehouse', label: 'عرض مخزن المرتجعات', category: 'مخزون' },
  { key: 'manageReturnsWarehouse', label: 'إدارة مخزن المرتجعات', category: 'مخزون' },
  { key: 'viewInvoices', label: 'عرض أرشيف الفواتير', category: 'مبيعات' }

];

const ROLE_DEFAULT_PERMISSIONS = {
  admin: ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {}),
  
  main_warehouse_manager: {
    viewDashboard: true,
    viewInventory: true,
    addInventoryItem: true,
    editInventoryItem: true,
    deleteInventoryItem: false,
    bulkDeleteInventory: false,
    importInventoryCSV: true,
    exportInventoryCSV: true,
    viewInventoryValue: true,
    viewLowStock: true,
    bulkUpdatePrices: true,
    viewPOS: false,
    makeSale: false,
    viewTransactions: true,
    viewCustomers: false,
    addCustomer: false,
    viewTransfers: true,
    createTransfer: false,
    approveTransfer: true,
    rejectTransfer: true,
    viewReports: true,
    viewCharts: true,
    exportReports: true,
    exportPDF: true,
    viewWarehouses: true,
    manageWarehouses: false,
    viewAllWarehouses: true,
    viewUsers: false,
    manageUsers: false,
    viewSettings: false,
    manageSettings: false,
    
    editSystemSettings: true,      // لا يمكنه تعديل إعدادات النظام العامة
  editInvoiceTemplate: true,      // يمكنه تعديل قالب الفاتورة
  manageTechniciansList: true,    // يمكنه إدارة الفنيين
  manageFeesAndCategories: false, // لا يمكنه تعديل الرسوم والتصنيفات
  manageProductModels: true,      // يمكنه إدارة المنتجات والموديلات
  manageFaultCodes: true,         // يمكنه إدارة أكواد الأعطال
  manageMaintenanceCenters: true, // يمكنه إدارة مراكز الصيانة
  manageBranchesList: false       // لا يمكنه إدارة الفروع 

  },
  
  warehouse_manager: {
    viewDashboard: true,
    viewInventory: true,
    addInventoryItem: true,
    editInventoryItem: true,
    deleteInventoryItem: false,
    bulkDeleteInventory: false,
    importInventoryCSV: true,
    exportInventoryCSV: true,
    viewInventoryValue: true,
    viewLowStock: true,
    bulkUpdatePrices: false,
    viewPOS: false,
    makeSale: false,
    viewTransactions: true,
    viewCustomers: false,
    addCustomer: false,
    viewTransfers: true,
    createTransfer: true,
    approveTransfer: false,
    rejectTransfer: false,
    viewReports: true,
    viewCharts: true,
    exportReports: true,
    exportPDF: true,
    viewWarehouses: true,
    manageWarehouses: false,
    viewAllWarehouses: false,
    viewUsers: false,
    manageUsers: false,
    viewSettings: false,
    manageSettings: false
  },
  
  technician: {
    viewDashboard: true,
    viewInventory: false,
    addInventoryItem: false,
    viewLowStock: true,
    viewPOS: false,
    viewCustomers: true,
    addCustomer: true,
    editCustomer: false,
    manageTickets: true,
    addTicket: true,
    editTicket: true,
    addSpareParts: true,
    changeTicketStatus: true,
    assignTechnician: false,
    viewTransfers: false,
    viewReports: false,
    viewCharts: true,
    viewWarehouses: false,
    viewSettings: true,
  editSystemSettings: false,
  editInvoiceTemplate: false,
  manageTechniciansList: false,
  manageFeesAndCategories: false,
  manageProductModels: false,
  manageFaultCodes: false,
  manageMaintenanceCenters: false,
  manageBranchesList: false,
  viewAllWarehouses: false,
  viewReturnsWarehouse: false,
  manageReturnsWarehouse: false,
  viewInvoices: false
  
  },
  
  maintenance_center: {
    viewDashboard: true,
    viewInventory: true,
    viewLowStock: true,
    viewPOS: false,
    viewCustomers: true,
    addCustomer: true,
    manageTickets: true,
    addTicket: true,
    editTicket: true,
    addSpareParts: true,
    changeTicketStatus: true,
    assignTechnician: true,
    assignMaintenanceCenter: false,
    assignCallCenter: true,
    viewTransfers: false,
    viewReports: true,
    viewCharts: true,

    viewSettings: true,
  editSystemSettings: false,
  editInvoiceTemplate: false,
  manageTechniciansList: false,
  manageFeesAndCategories: false,
  manageProductModels: false,
  manageFaultCodes: true,     // يمكنه إدارة أكواد الأعطال
  manageMaintenanceCenters: false,
  manageBranchesList: false
  viewAllWarehouses: false,  // لا يرى إلا فرعه
  viewReturnsWarehouse: true,
  manageReturnsWarehouse: false,
  viewInvoices: false

  },
  
  call_center: {
    viewDashboard: true,
    viewCustomers: true,
    addCustomer: true,
    editCustomer: true,
    manageTickets: true,
    addTicket: true,
    editTicket: true,
    changeTicketStatus: true,
    assignTechnician: true,
    assignMaintenanceCenter: true,
    assignCallCenter: false,
    viewTransfers: false,
    viewReports: false,
    viewCharts: true,

     viewSettings: true,
  editSystemSettings: false,
  editInvoiceTemplate: false,
  manageTechniciansList: false,
  manageFeesAndCategories: false,
  manageProductModels: false,
  manageFaultCodes: false,
  manageMaintenanceCenters: false,
  manageBranchesList: false

  },
  
  sales: {
    viewDashboard: true,
    viewInventory: true,
    viewLowStock: true,
    viewPOS: true,
    makeSale: true,
    makeReturn: true,
    viewTransactions: true,
    printInvoice: true,
    viewCustomers: true,
    addCustomer: true,
    editCustomer: true,
    viewCustomerHistory: true,
    manageTickets: false,
    viewTransfers: false,
    viewReports: false,
    viewCharts: true,
    viewWarehouses: false,

     viewSettings: true,
  editSystemSettings: false,
  editInvoiceTemplate: true,   // يمكنه تعديل قالب الفاتورة
  manageTechniciansList: false,
  manageFeesAndCategories: false,
  manageProductModels: false,
  manageFaultCodes: false,
  manageMaintenanceCenters: false,
  manageBranchesList: false

  },
  
  accountant: {
    viewDashboard: true,
    viewInventory: false,
    viewInventoryValue: true,
    viewPOS: false,
    viewTransactions: true,
    exportTransactions: true,
    viewCustomers: false,
    viewTransfers: false,
    viewReports: true,
    viewCharts: true,
    exportReports: true,
    exportPDF: true,
    printReports: true,
    viewSettings: false
  }
};



const TICKET_STATUSES = [
  { value: 'created', label: 'إنشاء', color: 'gray' },
  { value: 'received_maintenance', label: 'تم استلام الجهاز وهو تحت الصيانة', color: 'blue' },
  { value: 'waiting_customer_approval_cost', label: 'في انتظار موافقة العميل على التكلفة', color: 'yellow' },
  { value: 'waiting_spare_parts', label: 'انتظار قطع الغيار', color: 'orange' },
  { value: 'delivered_to_customer', label: 'تم التسليم للعميل', color: 'green' },
  { value: 'rejected_by_customer', label: 'مرفوض من قبل العميل', color: 'red' },
  { value: 'closed', label: 'مغلق', color: 'gray' },
  { value: 'maintenance_after_approval', label: 'تحت الصيانة بعد موافقة العميل', color: 'blue' },
  { value: 'sent_to_factory', label: 'تم الارسال الى المصنع للصيانة', color: 'purple' },
  { value: 'factory_maintenance_done', label: 'تمت الصيانة في المصنع', color: 'green' },
  { value: 'sent_from_factory', label: 'تم الارسال من المصنع بعد الانتهاء', color: 'green' },
  { value: 'factory_rejected', label: 'تم رفض الصيانة من المصنع', color: 'red' },
  { value: 'spare_parts_unavailable', label: 'قطع الغيار غير متوفرة', color: 'red' },
  { value: 'rejected_and_delivered', label: 'مرفوض وتم التسليم', color: 'red' },
  { value: 'customer_approved_cost', label: 'العميل موافق على التكلفة', color: 'green' },
  { value: 'contacted_customer', label: 'تم التواصل مع العميل لاستلام الجهاز', color: 'blue' },
  { value: 'shipped_asc', label: 'تم الشحن ASC', color: 'indigo' },
  { value: 'delivered_asc', label: 'تم التسليم ASC', color: 'green' },
  { value: 'damaged_disposed', label: 'اتلاف و اهلاك', color: 'gray' },
  { value: 'waiting_shipping_company', label: 'انتظار ارسال شركة الشحن', color: 'yellow' }
];


const EGYPT_GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'الشرقية', 'القليوبية',
  'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد',
  'الإسماعيلية', 'السويس', 'شمال سيناء', 'جنوب سيناء', 'بني سويف',
  'الفيوم', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان',
  'مطروح', 'الوادي الجديد', 'البحر الأحمر'
].sort();
const ticketStatusOptions = TICKET_STATUSES.map(status => ({
  value: status.value,
  label: status.label
}));

// ==========================================================================
// 🏷️ TAG MANAGER
// ==========================================================================
class TagManager {
  constructor() {
    this.tags = new Map();
    this.categories = new Set();
  }

  async loadTags() {
    try {
      const snap = await getDocs(collection(db, 'tags'));
      this.tags.clear();
      snap.docs.forEach(doc => {
        this.tags.set(doc.id, doc.data());
        this.categories.add(doc.data().category);
      });
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  }

  async addTag(tag, category = 'general') {
    try {
      const tagId = tag.toLowerCase().replace(/\s+/g, '_');
      await setDoc(doc(db, 'tags', tagId), {
        name: tag,
        category,
        usageCount: 0,
        createdAt: serverTimestamp()
      });
      this.tags.set(tagId, { name: tag, category, usageCount: 0 });
      this.categories.add(category);
      return tagId;
    } catch (error) {
      console.error('Error adding tag:', error);
      return null;
    }
  }

  async incrementUsage(tagId) {
    try {
      const tagRef = doc(db, 'tags', tagId);
      await updateDoc(tagRef, {
        usageCount: increment(1)
      });
    } catch (error) {
      console.error('Error incrementing tag usage:', error);
    }
  }

  getTagsByCategory(category) {
    const result = [];
    this.tags.forEach((tag, id) => {
      if (tag.category === category) {
        result.push({ id, ...tag });
      }
    });
    return result;
  }

  getAllCategories() {
    return Array.from(this.categories);
  }

  searchTags(query) {
    const result = [];
    const lowerQuery = query.toLowerCase();
    this.tags.forEach((tag, id) => {
      if (tag.name.toLowerCase().includes(lowerQuery)) {
        result.push({ id, ...tag });
      }
    });
    return result;
  }
}

export const tagManager = new TagManager();

// ==========================================================================
// 🛠️ دوال مساعدة
// ==========================================================================
const normalizeSearch = (str) => {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/\s+/g, ' ');
};

//------------------------------------------//
//دالة البحث  - serial//
const normalizeSerial = (value) => {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase();
};
//--------------------------------------------//

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const exportToCSV = (data, filename) => {
  if (!data || !data.length) return false;
  try {
    const headers = Object.keys(data[0]);
    const csvContent = [
      "\uFEFF" + headers.join(','),
      ...data.map(row => 
        headers.map(f => {
          const val = row[f];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
          if (val instanceof Date) return `"${val.toLocaleString()}"`;
          return val;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
    return true;
  } catch (error) {
    console.error("Export error:", error);
    return false;
  }
};

const formatDate = (timestamp) => {
  if (!timestamp) return '-';
  try {
    if (timestamp?.toDate) {
      return timestamp.toDate().toLocaleString('ar-EG', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleString('ar-EG');
    }
    return new Date(timestamp).toLocaleString('ar-EG');
  } catch (error) {
    return '-';
  }
};

const logUserActivity = async (user, action, details) => {
  if (!user) return;
  try {
    await addDoc(collection(db, 'activity_logs'), {
      userId: user.id,
      userName: user.name || user.email,
      userRole: user.role,
      action: action,
      details: details,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("Activity Log Error:", err);
  }
};

const getRoleIcon = (roleKey) => {
  const role = USER_ROLES.find(r => r.key === roleKey);
  return role?.icon || User;
};

const getRoleColor = (roleKey) => {
  const role = USER_ROLES.find(r => r.key === roleKey);
  return role?.color || 'slate';
};

// ==========================================================================
// 🧾 دوال مساعدة لتحليل CSV (محسنة للأداء)
// ==========================================================================
const parseCSV = (text) => {
  try {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const results = [];
    
    if (lines.length > 1000) {
      return parseCSVWithWorker(text);
    }
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = [];
      let current = '';
      let inQuotes = false;
      const line = lines[i];
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ''));
      
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      results.push(row);
    }
    
    return results;
  } catch (error) {
    console.error('CSV Parse Error:', error);
    return [];
  }
};

const parseCSVWithWorker = (text) => {
  return new Promise((resolve) => {
    const worker = new Worker('/workers/csvParser.js');
    worker.postMessage(text);
    worker.onmessage = (e) => resolve(e.data);
  });
};

// ==========================================================================
// 🔔 NOTIFICATION SERVICE
// ==========================================================================
export const requestNotificationPermission = async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_VAPID_KEY || ''
      });
      
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, 'fcm_tokens', user.uid), {
          token,
          device: getUserAgent(),
          timestamp: serverTimestamp()
        }, { merge: true });
      }
      
      return token;
    }
  } catch (error) {
    console.error('Notification permission error:', error);
  }
  return null;
};

export const onMessageListener = () => 
  new Promise((resolve) => {
    if (messaging) {
      onMessage(messaging, (payload) => {
        resolve(payload);
      });
    }
  });

// ==========================================================================
// 🎹 اختصارات لوحة المفاتيح
// ==========================================================================
function useKeyboardShortcuts(handlers) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = `${e.ctrlKey ? 'ctrl+' : ''}${e.altKey ? 'alt+' : ''}${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`;
      
      const shortcuts = {
        'ctrl+f': handlers.onSearch,
        'ctrl+n': handlers.onAdd,
        'ctrl+s': handlers.onSave,
        'f5': handlers.onRefresh,
        'escape': handlers.onCancel,
        'ctrl+d': handlers.onDashboard,
        'ctrl+i': handlers.onInventory,
        'ctrl+t': handlers.onTransactions,
        'ctrl+c': handlers.onCustomers,
        'ctrl+shift+e': handlers.onExport,
        'ctrl+shift+p': handlers.onPrint,
        'ctrl+shift+d': handlers.onBulkDelete,
        'ctrl+shift+i': handlers.onImport,
        'ctrl+alt+r': handlers.onRefreshAll,
        'ctrl+alt+h': handlers.onHelp
      };
      
      if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}

// ==========================================================================
// 🌙 DARK MODE
// ==========================================================================
const DARK_MODE_KEY = 'nouval_dark_mode';

const getInitialDarkMode = () => {
  const saved = localStorage.getItem(DARK_MODE_KEY);
  if (saved !== null) {
    return saved === 'true';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const useDarkMode = () => {
  const [isDark, setIsDark] = useState(getInitialDarkMode);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(DARK_MODE_KEY, isDark);
  }, [isDark]);

  const toggle = () => setIsDark(!isDark);

  return { isDark, toggle };
};

// ==========================================================================
// 🔄 SYNC MANAGER (للمزامنة مع السيرفر)
// ==========================================================================
const syncManager = {
  async syncAll() {
    const result = await offlineDB.syncWithServer();
    return result;
  },

  async addOperation(operation) {
    if (navigator.onLine) {
      try {
        switch (operation.type) {
          case 'add':
            await addDoc(collection(db, operation.collection), operation.data);
            break;
          case 'update':
            await updateDoc(doc(db, operation.collection, operation.id), operation.data);
            break;
          case 'delete':
            await deleteDoc(doc(db, operation.collection, operation.id));
            break;
        }
        return { synced: true };
      } catch (error) {
        await offlineDB.addToSyncQueue(operation);
        return { synced: false, queued: true };
      }
    } else {
      await offlineDB.addToSyncQueue(operation);
      return { synced: false, queued: true };
    }
  },

  startAutoSync(interval = 5 * 60 * 1000) {
    setInterval(async () => {
      if (navigator.onLine) {
        await this.syncAll();
      }
    }, interval);
  }
};

// ==========================================================================
// 🔍 SEARCH CACHE (للبحث السريع)
// ==========================================================================
const searchCache = {
  async get(term, type) {
    return offlineDB.getSearchCache(`${type}:${term}`);
  },

  async set(term, type, results) {
    return offlineDB.saveSearchCache(`${type}:${term}`, results);
  },

  async search(term, type, searchFn) {
    const cached = await this.get(term, type);
    if (cached) {
      return cached;
    }

    const results = await searchFn(term);
    await this.set(term, type, results);
    return results;
  }
};

// ==========================================================================
// 📊 VIRTUAL TABLE COMPONENT (للجداول الكبيرة)
// ==========================================================================
function VirtualTable({ data, columns, height = 600, rowHeight = 50 }) {
  const Row = ({ index, style }) => {
    const item = data[index];
    return (
      <div style={style} className="flex border-b hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
        {columns.map((col, idx) => (
          <div
            key={idx}
            className="p-3 text-sm truncate"
            style={{ width: col.width || `${100 / columns.length}%` }}
          >
            {col.render ? col.render(item) : item[col.field]}
          </div>
        ))}
      </div>
    );
  };

  return (
    <List
      height={height}
      itemCount={data.length}
      itemSize={rowHeight}
      width="100%"
    >
      {Row}
    </List>
  );
}

// ==========================================================================
// 🎨 THEME PROVIDER (للتبديل بين الوضع الفاتح والداكن)
// ==========================================================================
const ThemeContext = React.createContext();

function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

// ==========================================================================
// 👤 عرض ملف الموظف
// ==========================================================================
function EmployeeProfileView({ userToView, warehouseMap }) {
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
  const roleColor = getRoleColor(userToView.role);

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
                 <span className={`px-3 py-1 rounded-lg bg-${roleColor}-100 dark:bg-${roleColor}-900/30 text-${roleColor}-700 dark:text-${roleColor}-300 flex items-center gap-1`}>
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
function LoginScreen({ fbReady, onLoginSuccess, systemSettings, notify, onRetry, isConnecting, firebaseError }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimer, setLockTimer] = useState(null);

  // تحميل البريد الإلكتروني المحفوظ
  useEffect(() => {
    const savedEmail = localStorage.getItem('last_email');
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  // التحقق من Rate Limiting
  useEffect(() => {
    if (loginAttempts >= 5) {
      setIsLocked(true);
      const timer = setTimeout(() => {
        setIsLocked(false);
        setLoginAttempts(0);
      }, 5 * 60 * 1000); // 5 دقائق
      setLockTimer(timer);
    }
    return () => {
      if (lockTimer) clearTimeout(lockTimer);
    };
  }, [loginAttempts]);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (isLocked) {
      setError("تم قفل الحساب مؤقتاً بسبب كثرة المحاولات. حاول بعد 5 دقائق");
      return;
    }

    if (!apiLimiter.check(email)) {
      setError("عدد كبير من المحاولات. انتظر قليلاً");
      return;
    }
    
    setError('');
    
    if (!fbReady) {
      setError("يرجى الانتظار حتى يتم الاتصال بالخادم...");
      return notify("يرجى الانتظار حتى يتم الاتصال بالخادم...", "warn");
    }
    if (!email || !pass) {
      setError("الرجاء إدخال البريد الإلكتروني وكلمة المرور");
      return notify("الرجاء إدخال البريد الإلكتروني وكلمة المرور", "warn");
    }
    
    setLoading(true);
    try {
      const q = query(collection(db, 'employees'), where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        const allUsers = await getDocs(collection(db, 'employees'));
        if (allUsers.empty) {
          const newAdmin = {
            email: email.trim().toLowerCase(),
            pass: pass,
            name: 'مدير النظام',
            role: 'admin',
            assignedWarehouseId: 'main',
            permissions: ROLE_DEFAULT_PERMISSIONS.admin,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp()
          };
          const docRef = await addDoc(collection(db, 'employees'), newAdmin);
          
          if (rememberMe) {
            localStorage.setItem('last_email', email);
          }
          
          const userData = { id: docRef.id, ...newAdmin, permissions: newAdmin.permissions };
          
          await logUserLogin(userData);
          
          saveUserToStorage(userData);
          onLoginSuccess(userData);
          showSuccess("مرحباً! تم تفعيل حسابك كمدير للنظام بنجاح.");
        } else {
          setLoginAttempts(prev => prev + 1);
          setError("هذا البريد الإلكتروني غير مسجل في النظام.");
          showError("هذا البريد الإلكتروني غير مسجل في النظام.");
        }
      } else {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        if (userData.isDisabled) {
           setError("عذراً، هذا الحساب موقوف من قبل الإدارة.");
           showError("عذراً، هذا الحساب موقوف من قبل الإدارة.");
        } else if (userData.pass === pass) {
           await updateDoc(doc(db, 'employees', userDoc.id), {
             lastLogin: serverTimestamp()
           });
           
           if (rememberMe) {
             localStorage.setItem('last_email', email);
           }
           
           const userWithId = { id: userDoc.id, ...userData, permissions: userData.permissions || {} };
           
           await logUserLogin(userWithId);
           
           saveUserToStorage(userWithId);
           onLoginSuccess(userWithId);
           showSuccess(`أهلاً بك مجدداً يا ${userData.name}`);
           await logUserActivity(userWithId, 'تسجيل دخول', 'قام بتسجيل الدخول إلى النظام');
        } else {
           setLoginAttempts(prev => prev + 1);
           setError("كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى.");
           showError("كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى.");
        }
      }
    } catch (err) {
      console.error(err);
      let errorMessage = "فشل الاتصال بقاعدة البيانات. تأكد من جودة الإنترنت.";
      
      if (err.code === 'permission-denied') {
        errorMessage = "خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase Console.";
      } else if (err.code === 'unavailable') {
        errorMessage = "خدمة Firebase غير متاحة حالياً. حاول مرة أخرى.";
      } else if (err.code === 'not-found') {
        errorMessage = "لم يتم العثور على قاعدة البيانات. تأكد من إعدادات Firebase.";
      }
      
      setError(errorMessage);
      showError(errorMessage);
    }
    setLoading(false);
  };

  if (isConnecting) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 p-4 text-right" dir="rtl">
        <div className="bg-white dark:bg-slate-800 p-10 rounded-[2rem] w-full max-w-md shadow-2xl text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-lg font-bold text-slate-800 dark:text-white">جاري الاتصال بقاعدة البيانات...</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">يرجى الانتظار</p>
        </div>
      </div>
    );
  }

  if (firebaseError) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 p-4 text-right" dir="rtl">
        <div className="bg-white dark:bg-slate-800 p-10 rounded-[2rem] w-full max-w-md shadow-2xl">
          <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-black text-center text-slate-800 dark:text-white mb-2">خطأ في الاتصال</h2>
          <p className="text-center text-slate-600 dark:text-slate-400 mb-6">{firebaseError}</p>
          <div className="space-y-3">
            <button 
              onClick={onRetry}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCcw size={18} /> إعادة المحاولة
            </button>
            <a 
              href="https://console.firebase.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-center"
            >
              فتح Firebase Console
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 p-4 text-right" dir="rtl">
      <div className="bg-white dark:bg-slate-800 p-10 rounded-[2rem] w-full max-w-md shadow-2xl relative border-t-[6px] border-indigo-600 animate-in fade-in zoom-in-95">
        <div className="flex justify-center mb-6">
           <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
             <Package size={40}/>
           </div>
        </div>
        <h1 className="text-2xl font-black text-center text-slate-800 dark:text-white mb-1">{systemSettings?.systemName || 'نوڤال ERP'}</h1>
        <p className="text-center text-slate-500 dark:text-slate-400 text-[10px] mb-8 font-bold uppercase tracking-widest">Enterprise Management Portal</p>
        
        {error && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative font-bold">
            <Mail className="absolute right-4 top-3.5 text-slate-400 dark:text-slate-500" size={18}/>
            <input 
              className="w-full border-2 border-slate-100 dark:border-slate-700 pr-12 p-3 rounded-xl focus:border-indigo-500 outline-none text-right bg-slate-50 dark:bg-slate-900 font-bold text-slate-700 dark:text-slate-300 text-sm transition-all" 
              placeholder="البريد الإلكتروني للموظف" 
              value={email} 
              onChange={e=>setEmail(e.target.value)} 
              type="email" 
              required 
              dir="ltr"
              disabled={loading || isLocked}
            />
          </div>
          <div className="relative font-bold">
            <Lock className="absolute right-4 top-3.5 text-slate-400 dark:text-slate-500" size={18}/>
            <input 
              className="w-full border-2 border-slate-100 dark:border-slate-700 pr-12 p-3 rounded-xl focus:border-indigo-500 outline-none text-right bg-slate-50 dark:bg-slate-900 font-bold text-slate-700 dark:text-slate-300 text-sm transition-all" 
              type={showPassword ? "text" : "password"}
              placeholder="كلمة المرور" 
              value={pass} 
              onChange={e=>setPass(e.target.value)} 
              required 
              dir="ltr"
              disabled={loading || isLocked}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-4 top-3.5 text-slate-400 dark:text-slate-500 hover:text-indigo-600"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">تذكرني</span>
            </label>
            <button 
              type="button"
              onClick={() => showInfo("تواصل مع مدير النظام لإعادة تعيين كلمة المرور")}
              className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-bold"
            >
              نسيت كلمة المرور؟
            </button>
          </div>
          
          <button 
            disabled={loading || !fbReady || isLocked} 
            className="w-full bg-gradient-to-l from-indigo-600 to-purple-600 text-white py-3.5 rounded-xl font-bold shadow-lg hover:from-indigo-700 hover:to-purple-700 active:scale-95 flex justify-center items-center gap-2 mt-6 text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
             {loading || !fbReady ? <Loader2 className="animate-spin" size={20}/> : <><LogIn size={20}/> تسجيل الدخول بأمان</>}
          </button>
          
          {isLocked && (
            <p className="text-xs text-rose-600 text-center mt-2">
              تم القفل مؤقتاً. حاول بعد 5 دقائق
            </p>
          )}
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            أول مستخدم يسجل الدخول يصبح مديراً للنظام تلقائياً
          </p>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// 🧾 مكون عرض الفاتورة المحسن
// ==========================================================================
function InvoiceRenderer({ data, systemSettings, onBack }) {
  const { darkMode } = useTheme();
  const printRef = useRef();

  const exportInvoiceImage = async () => {

  const element = document.getElementById("invoice-print");

  if (!element) return;

  const canvas = await html2canvas(element);

  const image = canvas.toDataURL("image/png");

  const link = document.createElement("a");

  link.href = image;
  link.download = `invoice-${data.invoiceNumber}.png`;

  link.click();

  };

  useEffect(() => { 
    const timer = setTimeout(() => window.print(), 800); 
    return () => clearTimeout(timer);
  }, [data]);
  
  const template = systemSettings.invoiceTemplate || {
    showLogo: true,
    showStoreName: true,
    showCustomerInfo: true,
    showItems: true,
    showPrices: true,
    showDiscount: true,
    showTax: true,
    showFees: true,
    showFooter: true,
    showPaymentMethod: true,
    showNotes: true,
    showTechnician: true,
    fontSize: 'normal',
    paperSize: '80mm'
  };

  const getPaperWidth = () => {
    switch(template.paperSize) {
      case '58mm': return 'max-w-[58mm]';
      case '80mm': return 'max-w-[80mm]';
      case 'A4': return 'max-w-[210mm]';
      default: return 'max-w-[80mm]';
    }
  };

  const getFontSize = () => {
    switch(template.fontSize) {
      case 'small': return 'text-xs';
      case 'large': return 'text-lg';
      default: return 'text-sm';
    }
  };

  const formatCurrency = (value) => {
    return Number(value || 0).toLocaleString() + ' ج.م';
  };

  const handleSendWhatsApp = () => {
    if (data.phone) {
      const message = `فاتورة رقم ${data.invoiceNumber}\n`;
      const items = data.items
  .map(item => `- ${item.name} × ${item.quantity || 1} = ${(item.price * (item.quantity || 1))} ج`)
  .join('\n');
      sendWhatsApp(data.phone, message + items + `\nالإجمالي: ${data.finalTotal} ج`);
    }
  };

  const handleSendEmail = async () => {
    if (data.email) {
      const html = generateInvoiceHTML(data, systemSettings);
      await sendEmail(data.email, `فاتورة رقم ${data.invoiceNumber}`, html);
      showSuccess("تم إرسال الفاتورة إلى البريد الإلكتروني");
    }
  };

  return (
    <div id="invoice-print" className="flex justify-center p-6 bg-slate-100 dark:bg-slate-900 min-h-full" dir="rtl">
       <div ref={printRef} className={`bg-white dark:bg-slate-800 ${getPaperWidth()} w-full p-6 text-black dark:text-white border shadow-lg print:shadow-none print:border-none print:m-0 ${getFontSize()}`}>
          
          {template.showLogo && systemSettings.invoiceLogo && (
            <div className="text-center mb-4">
              <img src={systemSettings.invoiceLogo} alt="Logo" className="max-h-16 mx-auto" crossOrigin="anonymous" />
            </div>
          )}

          {template.showStoreName && (
            <div className="text-center border-b border-black dark:border-white border-dashed pb-4 mb-4">
               <h1 className="font-black text-xl">{systemSettings.storeName}</h1>
               <p className="text-[11px] font-bold mt-1">فاتورة مبيعات #{data.invoiceNumber}</p>
               <p className="text-[10px] mt-1 text-gray-600 dark:text-gray-400">{formatDate(data.date)}</p>
            </div>
          )}

          {template.showCustomerInfo && (
            <div className="text-[11px] mb-4 space-y-1.5 font-bold text-right">
               <div className="flex justify-between"><span>العميل:</span><span>{data.customerName}</span></div>
               <div className="flex justify-between"><span>الهاتف:</span><span dir="ltr">{data.phone || '-'}</span></div>
               {data.technicianName && <div className="flex justify-between"><span>الفني المختص:</span><span>{data.technicianName}</span></div>}
               {data.ticketId && <div className="flex justify-between"><span>رقم التذكرة:</span><span>{data.ticketId}</span></div>}
               <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>الكاشير:</span><span>{data.operator}</span></div>
               {data.notes && <div className="text-[9px] text-gray-500 dark:text-gray-500 mt-2">{data.notes}</div>}
            </div>
          )}

          {template.showItems && (
            <table className="w-full text-[11px] border-y border-black dark:border-white border-dashed py-2 mb-4 text-right">
               <thead>
                  <tr className="font-bold border-b border-gray-300 dark:border-gray-600">
                     <th className="pb-2">الصنف</th>
                     <th className="pb-2 text-center">كمية</th>
                     {template.showPrices && <th className="pb-2 text-left">السعر</th>}
                     {template.showPrices && <th className="pb-2 text-left">الإجمالي</th>}
                  </tr>
               </thead>
               <<tbody>
                    {data.items && data.items.length > 0 ? (
                      data.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 text-right font-bold">
                            {item.name}
                            <br/>
                            <span className="text-[9px] font-mono text-gray-500 dark:text-gray-500 mt-0.5 block">{item.serialNumber}</span>
                          </td>
                          <td className="text-center py-2 font-bold">{item.quantity || 1}</td>
                          {template.showPrices && (
                            <>
                              <td className="text-left py-2 font-black">{formatCurrency(item.price)}</td>
                              <td className="text-left py-2 font-black">{formatCurrency((item.price || 0) * (item.quantity || 1))}</td>
                            </>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-2 text-right font-bold">
                          {data.itemName}
                          <br/>
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-500 mt-0.5 block">{data.serialNumber}</span>
                        </td>
                        <td className="text-center py-2 font-bold">1</td>
                        {template.showPrices && (
                          <>
                            <td className="text-left py-2 font-black">{formatCurrency(data.subtotal)}</td>
                            <td className="text-left py-2 font-black">{formatCurrency(data.subtotal)}</td>
                          </>
                        )}
                      </tr>
                    )}
                  </tbody>
            </table>
          )}

          <div className="text-[11px] space-y-1.5 font-bold border-b border-black dark:border-white border-dashed pb-4 mb-4 text-right">
             {template.showPrices && (
                <div className="flex justify-between"><span>المجموع الفرعي:</span><span>{formatCurrency(data.subtotal)}</span></div>
             )}
             {template.showDiscount && data.discountAmount > 0 && 
                <div className="flex justify-between text-black dark:text-white"><span>الخصم:</span><span>- {formatCurrency(data.discountAmount)}</span></div>
             }
             {template.showTax && data.taxAmount > 0 && 
                <div className="flex justify-between"><span>الضريبة ({systemSettings.taxRate || 14}%):</span><span>+ {formatCurrency(data.taxAmount)}</span></div>
             }
             {template.showFees && data.installAmount > 0 && 
                <div className="flex justify-between"><span>رسوم إضافية:</span><span>+ {formatCurrency(data.installAmount)}</span></div>
             }
             <div className="flex justify-between border-t border-black dark:border-white pt-2 mt-2 text-[14px] font-black">
                <span>الصافي المطلوب:</span><span>{formatCurrency(data.finalTotal)}</span>
             </div>
             {template.showPaymentMethod && data.paymentMethod && (
                <div className="flex justify-between text-[10px]">
                   <span>طريقة الدفع:</span>
                   <span>
                     {data.paymentMethod === 'cash' ? 'نقداً' : 
                      data.paymentMethod === 'card' ? 'بطاقة' : 
                      data.paymentMethod === 'transfer' ? 'تحويل' : data.paymentMethod}
                   </span>
                </div>
             )}
          </div>

          {template.showFooter && (
            <div className="text-center text-[9px] font-bold italic text-gray-700 dark:text-gray-400 leading-relaxed">
               <p>{systemSettings.footerText || 'شكراً لتعاملكم معنا'}</p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-2 print:hidden">

            <button 
              onClick={() => window.print()} 
              className="flex-1 bg-black text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-gray-800"
            >
              <Printer size={16}/> طباعة
            </button>

            <button
              onClick={exportInvoiceImage}
              className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-indigo-700"
            >
              تحميل صورة
            </button>

            {data.phone && (
              <button onClick={handleSendWhatsApp} className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-green-700">
                <MessageCircle size={16}/> واتساب
              </button>
            )}

            {data.email && (
              <button onClick={handleSendEmail} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-blue-700">
                <Mail size={16}/> بريد
              </button>
            )}

            <button onClick={onBack} className="flex-1 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 text-sm hover:bg-slate-300 dark:hover:bg-slate-600">
              <ArrowRightLeft size={16}/> إغلاق
            </button>

          </div>
        

       </div>

    </div>

  );

}
// ==========================================================================
// 📝 مدير قالب الفاتورة
// ==========================================================================
function InvoiceTemplateManager({ systemSettings, setSettings, notify }) {
  const [template, setTemplate] = useState(systemSettings.invoiceTemplate || {
    showLogo: true,
    showStoreName: true,
    showCustomerInfo: true,
    showItems: true,
    showPrices: true,
    showDiscount: true,
    showTax: true,
    showFees: true,
    showFooter: true,
    showPaymentMethod: true,
    showNotes: true,
    showTechnician: true,
    fontSize: 'normal',
    paperSize: '80mm'
  });

  const handleSave = async () => {
    try {
      await setDoc(doc(db, 'settings', 'general'), {
        invoiceTemplate: template
      }, { merge: true });
      setSettings({...systemSettings, invoiceTemplate: template});
      showSuccess("تم حفظ قالب الفاتورة بنجاح");
    } catch (error) {
      console.error("Error saving template:", error);
      showError("حدث خطأ أثناء حفظ القالب");
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
      <h3 className="font-black text-lg mb-6 text-slate-800 dark:text-white flex items-center gap-2">
        <PrinterIcon className="text-indigo-600" size={20}/> تخصيص شكل الفاتورة
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="font-bold text-sm text-slate-600 dark:text-slate-400 border-b pb-2">عناصر الفاتورة</h4>
          
          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showLogo} onChange={e => setTemplate({...template, showLogo: e.target.checked})} />
            <span className="text-xs font-bold">عرض الشعار</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showStoreName} onChange={e => setTemplate({...template, showStoreName: e.target.checked})} />
            <span className="text-xs font-bold">عرض اسم المتجر</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showCustomerInfo} onChange={e => setTemplate({...template, showCustomerInfo: e.target.checked})} />
            <span className="text-xs font-bold">عرض معلومات العميل</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showItems} onChange={e => setTemplate({...template, showItems: e.target.checked})} />
            <span className="text-xs font-bold">عرض الأصناف</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showPrices} onChange={e => setTemplate({...template, showPrices: e.target.checked})} />
            <span className="text-xs font-bold">عرض الأسعار</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showDiscount} onChange={e => setTemplate({...template, showDiscount: e.target.checked})} />
            <span className="text-xs font-bold">عرض الخصم</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showTax} onChange={e => setTemplate({...template, showTax: e.target.checked})} />
            <span className="text-xs font-bold">عرض الضريبة</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showFees} onChange={e => setTemplate({...template, showFees: e.target.checked})} />
            <span className="text-xs font-bold">عرض الرسوم الإضافية</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showFooter} onChange={e => setTemplate({...template, showFooter: e.target.checked})} />
            <span className="text-xs font-bold">عرض تذييل الفاتورة</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showPaymentMethod} onChange={e => setTemplate({...template, showPaymentMethod: e.target.checked})} />
            <span className="text-xs font-bold">عرض طريقة الدفع</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showNotes} onChange={e => setTemplate({...template, showNotes: e.target.checked})} />
            <span className="text-xs font-bold">عرض الملاحظات</span>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={template.showTechnician} onChange={e => setTemplate({...template, showTechnician: e.target.checked})} />
            <span className="text-xs font-bold">عرض اسم الفني</span>
          </label>
        </div>

        <div className="space-y-4">
          <h4 className="font-bold text-sm text-slate-600 dark:text-slate-400 border-b pb-2">إعدادات الطباعة</h4>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">حجم الخط</label>
            <select className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 text-sm bg-white dark:bg-slate-900" value={template.fontSize} onChange={e => setTemplate({...template, fontSize: e.target.value})}>
              <option value="small">صغير</option>
              <option value="normal">عادي</option>
              <option value="large">كبير</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">حجم الورق</label>
            <select className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 text-sm bg-white dark:bg-slate-900" value={template.paperSize} onChange={e => setTemplate({...template, paperSize: e.target.value})}>
              <option value="58mm">58 مم (فاتورة صغيرة)</option>
              <option value="80mm">80 مم (فاتورة عادية)</option>
              <option value="A4">A4</option>
            </select>
          </div>

          <div className="mt-6 p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
            <h5 className="font-bold text-xs text-indigo-900 dark:text-indigo-300 mb-2">معاينة سريعة</h5>
            <div className="bg-white dark:bg-slate-900 p-3 rounded-lg text-[10px]">
              <p className="font-black text-center">{systemSettings.storeName}</p>
              {template.showItems && (
                <div className="border-t border-dashed my-2 pt-2">
                  <p>منتج 1 ........ 100 ج</p>
                  <p>منتج 2 ........ 200 ج</p>
                </div>
              )}
              {template.showPrices && <p className="font-black mt-2">الإجمالي: 300 ج</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={handleSave} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center gap-2">
          <Save size={16}/> حفظ قالب الفاتورة
        </button>
      </div>
    </div>
  );
}

// ==========================================================================
// 📊 لوحة التحكم المحسنة مع إحصائيات متقدمة
// ==========================================================================
function DashboardView({ appUser, warehouses, onNavigateToInventory, notify }) {
  const [stats, setStats] = useState({ 
    totalItems: 0, 
    totalValue: 0, 
    lowStockCount: 0, 
    salesToday: 0,
    salesWeek: 0,
    salesMonth: 0,
    salesYear: 0,
    totalTrend: 0,
    valueTrend: 0,
    salesTrend: 0,
    lowStockTrend: 0,
    topProducts: [],
    topCustomers: [],
    recentTransactions: [],
    dailySales: [],
    monthlySales: [],
    categoryDistribution: [],
    warehouseDistribution: []
  });
  
  const [ticketStats, setTicketStats] = useState({ 
    today: 0, 
    week: 0, 
    month: 0, 
    closed: 0, 
    waitingApproval: 0,
    highPriority: 0,
    byStatus: [],
    byPriority: []
  });
  
  const [loading, setLoading] = useState(true);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [showInventoryValue, setShowInventoryValue] = useState(false);
  const [error, setError] = useState(null);
  const [selectedChart, setSelectedChart] = useState('line');
  const [dateRange, setDateRange] = useState('week');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [chartType, setChartType] = useState('sales');

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  useEffect(() => {
    if(!appUser) return;
    let isMounted = true;

    const fetchDashboardStats = async () => {
       setLoading(true);
       setError(null);
       try {
           let invSnap;
           try {
             let q = collection(db, 'inventory');
             if (selectedWarehouse !== 'all') {
               q = query(q, where('warehouseId', '==', selectedWarehouse));
             }
             invSnap = await getDocs(q);
           } catch (err) {
             console.warn("Inventory access error:", err);
             invSnap = { docs: [] };
           }
           
           let totalQty = 0;
           let totalVal = 0;
           let lowStock = 0;
           let lowStockList = [];
           let categoryCount = {};
           let warehouseCount = {};

           invSnap.docs.forEach(doc => {
             const data = doc.data();
             if (!data.isDeleted) {
                if (appUser.permissions?.viewAllWarehouses || data.warehouseId === (appUser.assignedWarehouseId || 'main')) {
                   const qty = Number(data.quantity ?? 0);
                   const price = Number(data.price ?? 0);
                   const minStock = Number(data.minStock ?? 0);
                   
                   totalQty += qty;
                   totalVal += qty * price;
                   
                   warehouseCount[data.warehouseId] = (warehouseCount[data.warehouseId] || 0) + qty;
                   
                   const category = data.category || 'عام';
                   categoryCount[category] = (categoryCount[category] || 0) + qty;
                   
                   if (minStock > 0 && qty <= minStock) {
                     lowStock++;
                     lowStockList.push({
                       id: doc.id,
                       name: data.name,
                       serialNumber: data.serialNumber,
                       quantity: qty,
                       minStock: minStock,
                       warehouseId: data.warehouseId,
                       category: category
                     });
                   }
                }
             }
           });

           setShowInventoryValue(appUser.permissions?.viewInventoryValue || false);

           const categoryDistribution = Object.entries(categoryCount).map(([name, count]) => ({
             name,
             value: count
           }));

           const warehouseDistribution = Object.entries(warehouseCount).map(([id, count]) => ({
             name: warehouses.find(w => w.id === id)?.name || id,
             value: count
           }));

           let salesToday = 0;
           let salesWeek = 0;
           let salesMonth = 0;
           let salesYear = 0;
           let salesYesterday = 0;
           let dailySalesData = [];
           let monthlySalesData = [];
           let productSales = {};
           
           try {
             const now = new Date();
             const today = new Date(now.setHours(0,0,0,0));
             const yesterday = new Date(today);
             yesterday.setDate(yesterday.getDate() - 1);
             const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
             const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
             const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
             
             let salesQuery = collection(db, 'transactions');
             if (selectedWarehouse !== 'all') {
               salesQuery = query(salesQuery, where('warehouseId', '==', selectedWarehouse));
             }
             
             const salesSnap = await getDocs(query(
               salesQuery, 
               where('timestamp', '>=', yearAgo),
               where('type', '==', 'sell')
             ));
             
             const dailyTotals = {};
             const monthlyTotals = {};
             
             salesSnap.docs.forEach(doc => {
                const data = doc.data();
                if (appUser.permissions?.viewAllWarehouses || data.warehouseId === (appUser.assignedWarehouseId || 'main')) {
                   const amount = Number(data.finalTotal || data.total || 0);
                   const date = data.timestamp?.toDate?.() || new Date(data.timestamp);
                   const dateStr = date.toISOString().split('T')[0];
                   const monthStr = date.toISOString().slice(0, 7);
                   
                   dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + amount;
                   monthlyTotals[monthStr] = (monthlyTotals[monthStr] || 0) + amount;
                   
                   if (date >= today) salesToday += amount;
                   if (date >= yesterday && date < today) salesYesterday += amount;
                   if (date >= weekAgo) salesWeek += amount;
                   if (date >= monthAgo) salesMonth += amount;
                   if (date >= yearAgo) salesYear += amount;
                   
                   const productName = data.itemName;
                   productSales[productName] = (productSales[productName] || 0) + amount;
                }
             });

             dailySalesData = Object.entries(dailyTotals)
               .sort((a, b) => a[0].localeCompare(b[0]))
               .slice(-30)
               .map(([date, total]) => ({ date, total }));

             monthlySalesData = Object.entries(monthlyTotals)
               .sort((a, b) => a[0].localeCompare(b[0]))
               .slice(-12)
               .map(([month, total]) => ({ month, total }));
             
           } catch (err) {
             console.warn("Sales access error:", err);
           }

           const topProducts = Object.entries(productSales)
             .sort((a, b) => b[1] - a[1])
             .slice(0, 10)
             .map(([name, value]) => ({ name, value }));

           let todayTickets = 0, weekTickets = 0, monthTickets = 0, closedTickets = 0, 
               waitingApprovalTickets = 0, highPriorityTickets = 0;
           let statusCount = {};
           let priorityCount = { high: 0, medium: 0, low: 0 };
           
           try {
             let ticketsQuery = collection(db, 'tickets');
             if (selectedWarehouse !== 'all') {
               ticketsQuery = query(ticketsQuery, where('warehouseId', '==', selectedWarehouse));
             }
             
             const ticketsSnap = await getDocs(ticketsQuery);
             
             const now = new Date();
             const today = new Date(now.setHours(0,0,0,0));
             const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
             const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
             
             ticketsSnap.docs.forEach(doc => {
                const data = doc.data();
                const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
                
                if (createdDate >= today) todayTickets++;
                if (createdDate >= weekAgo) weekTickets++;
                if (createdDate >= monthAgo) monthTickets++;
                
                if (data.status === 'delivered_to_customer' || data.status === 'closed') closedTickets++;
                if (data.status === 'waiting_customer_approval_cost') waitingApprovalTickets++;
                
                if (data.priority === 'high') {
                  highPriorityTickets++;
                  priorityCount.high++;
                } else if (data.priority === 'medium') {
                  priorityCount.medium++;
                } else {
                  priorityCount.low++;
                }
                
                statusCount[data.status] = (statusCount[data.status] || 0) + 1;
             });
           } catch (err) {
             console.warn("Tickets access error:", err);
           }
           
           const ticketsByStatus = Object.entries(statusCount).map(([status, count]) => ({
             name: TICKET_STATUSES.find(s => s.value === status)?.label || status,
             count,
             status
           })).sort((a, b) => b.count - a.count);

           const ticketsByPriority = Object.entries(priorityCount).map(([priority, count]) => ({
             name: priority === 'high' ? 'عالية' : priority === 'medium' ? 'متوسطة' : 'منخفضة',
             count
           }));

           let recentActs = [];
           try {
             const activitiesSnap = await getDocs(query(
               collection(db, 'activity_logs'),
               orderBy('timestamp', 'desc'),
               limit(20)
             ));
             recentActs = activitiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
           } catch (err) {
             console.warn("Activities access error:", err);
           }

           if (isMounted) {
               setStats({
                  totalItems: totalQty,
                  totalValue: totalVal,
                  lowStockCount: lowStock,
                  salesToday: salesToday,
                  salesWeek: salesWeek,
                  salesMonth: salesMonth,
                  salesYear: salesYear,
                  totalTrend: salesYesterday > 0 ? Math.round((salesToday - salesYesterday) / salesYesterday * 100) : 0,
                  valueTrend: 3,
                  salesTrend: salesYesterday > 0 ? Math.round((salesToday - salesYesterday) / salesYesterday * 100) : 0,
                  lowStockTrend: -2,
                  topProducts: topProducts,
                  dailySales: dailySalesData,
                  monthlySales: monthlySalesData,
                  categoryDistribution,
                  warehouseDistribution
               });
               setTicketStats({
                 today: todayTickets,
                 week: weekTickets,
                 month: monthTickets,
                 closed: closedTickets,
                 waitingApproval: waitingApprovalTickets,
                 highPriority: highPriorityTickets,
                 byStatus: ticketsByStatus,
                 byPriority: ticketsByPriority
               });
               setLowStockItems(lowStockList);
               setRecentActivities(recentActs);
           }
       } catch(e) {
           console.error("Dashboard Stats Fetch Error:", e);
           setError(e.message);
           if (isMounted) {
             showError("حدث خطأ في تحميل بيانات لوحة التحكم");
           }
       }
       if (isMounted) setLoading(false);
    };

    fetchDashboardStats();
    return () => { isMounted = false; };
  }, [appUser, warehouses, refreshKey, selectedWarehouse]);

  const handleStatClick = (type) => {

    if (type === 'inventory') {
      onNavigateToInventory('inventory');
    }

    if (type === 'lowstock') {
      onNavigateToInventory('lowstock');
    }

    if (type === 'tickets') {
      onNavigateToInventory('tickets');
    }

    if (type === 'sales') {
      onNavigateToInventory('reports');
    }

  };

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton type="card" count={4} />
        <LoadingSkeleton type="table" count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-right">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
         <div className="flex items-center gap-2">
           <h2 className="text-xl font-black text-slate-800 dark:text-white">لوحة المؤشرات</h2>
           <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-lg text-xs">
             {new Date().toLocaleDateString('ar-EG')}
           </span>
         </div>
         
         <div className="flex flex-wrap gap-2">
           <select
             className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
             value={selectedWarehouse}
             onChange={e => setSelectedWarehouse(e.target.value)}
           >
             <option value="all">كل المخازن</option>
             {warehouses.map(w => (
               <option key={w.id} value={w.id}>{w.name}</option>
             ))}
           </select>
           
           <select
             className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
             value={dateRange}
             onChange={e => setDateRange(e.target.value)}
           >
             <option value="day">اليوم</option>
             <option value="week">الأسبوع</option>
             <option value="month">الشهر</option>
             <option value="year">السنة</option>
           </select>
           
           <button
             onClick={handleRefresh}
             className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
             title="تحديث"
           >
             <RefreshCcw size={18} />
           </button>
           
           <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2">
              <Calendar size={14}/> 
              {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
           </div>
         </div>
      </div>

      {error && (
        <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 text-rose-700 dark:text-rose-300 text-sm font-bold flex items-center gap-2">
          <AlertTriangle size={20} />
          <div>
            <p>خطأ في تحميل البيانات: {error}</p>
            <p className="text-xs mt-1">تأكد من إعدادات قواعد الأمان في Firebase Console.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button 
          onClick={() => handleStatClick('inventory')}
          className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-all hover:border-indigo-300 dark:hover:border-indigo-600 relative overflow-hidden group text-right"
        >
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-xl group-hover:bg-indigo-100 dark:group-hover:bg-indigo-800/50 transition-colors w-fit">
            <Package size={22}/>
          </div>
          <div className="mt-3">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">إجمالي القطع بالمخزن</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{stats.totalItems.toLocaleString()}</p>
            <div className="flex items-center gap-1 mt-2">
              <span className={`text-[9px] font-bold ${stats.totalTrend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {stats.totalTrend > 0 ? '+' : ''}{stats.totalTrend}%
              </span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500">عن الأمس</span>
            </div>
          </div>
        </button>

        {showInventoryValue && (
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 rounded-xl w-fit">
              <Wallet size={22}/>
            </div>
            <div className="mt-3">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">قيمة المخزون الإجمالية</p>
              <p className="text-2xl font-black text-slate-800 dark:text-white">{stats.totalValue.toLocaleString()} ج</p>
              <div className="flex items-center gap-1 mt-2">
                <span className={`text-[9px] font-bold ${stats.valueTrend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {stats.valueTrend > 0 ? '+' : ''}{stats.valueTrend}%
                </span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500">عن الأمس</span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-xl w-fit">
            <Receipt size={22}/>
          </div>
          <div className="mt-3">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">مبيعات اليوم</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{stats.salesToday.toLocaleString()} ج</p>
            <div className="flex items-center gap-1 mt-2">
              <span className={`text-[9px] font-bold ${stats.salesTrend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {stats.salesTrend > 0 ? '+' : ''}{stats.salesTrend}%
              </span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500">عن الأمس</span>
            </div>
          </div>
        </div>

        <button 
          onClick={() => handleStatClick('lowstock')}
          className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-all hover:border-rose-300 dark:hover:border-rose-600 relative overflow-hidden group text-right"
        >
          <div className="p-3 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 rounded-xl group-hover:bg-rose-100 dark:group-hover:bg-rose-800/50 transition-colors w-fit">
            <AlertOctagon size={22}/>
          </div>
          <div className="mt-3">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">نواقص تحتاج طلب</p>
            <p className="text-2xl font-black text-slate-800 dark:text-white">{stats.lowStockCount.toLocaleString()}</p>
            {stats.lowStockCount > 0 && (
              <p className="text-[9px] text-rose-500 dark:text-rose-400 font-bold mt-2">اضغط لعرض التفاصيل</p>
            )}
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
          <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">مبيعات الأسبوع</p>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{stats.salesWeek.toLocaleString()} ج</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 p-4 rounded-xl border border-green-100 dark:border-green-800">
          <p className="text-xs font-bold text-green-800 dark:text-green-300 mb-1">مبيعات الشهر</p>
          <p className="text-2xl font-black text-green-600 dark:text-green-400">{stats.salesMonth.toLocaleString()} ج</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 p-4 rounded-xl border border-purple-100 dark:border-purple-800">
          <p className="text-xs font-bold text-purple-800 dark:text-purple-300 mb-1">مبيعات السنة</p>
          <p className="text-2xl font-black text-purple-600 dark:text-purple-400">{stats.salesYear.toLocaleString()} ج</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 p-4 rounded-xl border border-amber-100 dark:border-amber-800">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">متوسط الفاتورة</p>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
            {stats.salesWeek > 0 ? Math.round(stats.salesWeek / (stats.salesWeek / 1000)).toLocaleString() : 0} ج
          </p>
        </div>
      </div>

      {appUser.permissions?.manageTickets && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
            <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">تذاكر اليوم</p>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{ticketStats.today}</p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 p-4 rounded-xl border border-green-100 dark:border-green-800">
            <p className="text-xs font-bold text-green-800 dark:text-green-300 mb-1">تذاكر الأسبوع</p>
            <p className="text-2xl font-black text-green-600 dark:text-green-400">{ticketStats.week}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 p-4 rounded-xl border border-purple-100 dark:border-purple-800">
            <p className="text-xs font-bold text-purple-800 dark:text-purple-300 mb-1">تذاكر الشهر</p>
            <p className="text-2xl font-black text-purple-600 dark:text-purple-400">{ticketStats.month}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 p-4 rounded-xl border border-amber-100 dark:border-amber-800">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">بانتظار الموافقة</p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{ticketStats.waitingApproval}</p>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/30 dark:to-red-900/30 p-4 rounded-xl border border-rose-100 dark:border-rose-800">
            <p className="text-xs font-bold text-rose-800 dark:text-rose-300 mb-1">عالية الأولوية</p>
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{ticketStats.highPriority}</p>
          </div>
        </div>
      )}

      {stats.topProducts.length > 0 && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
          <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2">
            <Award className="text-amber-500" size={20}/> أفضل المنتجات مبيعاً
          </h3>
          <div className="space-y-3">
            {stats.topProducts.slice(0, 5).map((product, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </span>
                  <span className="font-bold text-slate-800 dark:text-white">{product.name}</span>
                </div>
                <span className="font-black text-indigo-600 dark:text-indigo-400">{product.value.toLocaleString()} ج</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {appUser.permissions?.viewCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          
          <div className="col-span-2 flex gap-2 mb-2">
            <button
              onClick={() => setChartType('sales')}
              className={`px-4 py-2 rounded-lg font-bold text-sm ${chartType === 'sales' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
            >
              المبيعات
            </button>
            <button
              onClick={() => setChartType('tickets')}
              className={`px-4 py-2 rounded-lg font-bold text-sm ${chartType === 'tickets' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
            >
              التذاكر
            </button>
            <button
              onClick={() => setChartType('inventory')}
              className={`px-4 py-2 rounded-lg font-bold text-sm ${chartType === 'inventory' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
            >
              المخزون
            </button>
          </div>

          {chartType === 'sales' && (
            <>
              <AdvancedCharts 
                data={stats.dailySales.map(d => ({ name: d.date, value: d.total }))}
                type="line"
                title="المبيعات اليومية (آخر 30 يوم)"
                height={300}
              />
              <AdvancedCharts 
                data={stats.monthlySales.map(d => ({ name: d.month, value: d.total }))}
                type="bar"
                title="المبيعات الشهرية (آخر 12 شهر)"
                height={300}
              />
            </>
          )}

          {chartType === 'tickets' && (
            <>
              <AdvancedCharts 
                data={ticketStats.byStatus.map(s => ({ name: s.name, value: s.count }))}
                type="pie"
                title="توزيع حالات التذاكر"
                height={300}
              />
              <AdvancedCharts 
                data={ticketStats.byPriority.map(p => ({ name: p.name, value: p.count }))}
                type="bar"
                title="توزيع أولويات التذاكر"
                height={300}
              />
            </>
          )}

          {chartType === 'inventory' && (
            <>
              <AdvancedCharts 
                data={stats.categoryDistribution}
                type="pie"
                title="توزيع الأصناف حسب التصنيف"
                height={300}
              />
              <AdvancedCharts 
                data={stats.warehouseDistribution}
                type="bar"
                title="توزيع الأصناف حسب المخزن"
                height={300}
              />
            </>
          )}

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm lg:col-span-2">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2">
              <Activity className="text-indigo-600" size={20}/> آخر النشاطات
            </h3>
            <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
              {recentActivities.length > 0 ? (
                recentActivities.map(act => (
                  <div key={act.id} className="flex items-start gap-3 p-3 border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors rounded-lg">
                    <div className="w-2 h-2 mt-2 rounded-full bg-indigo-400"></div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-800 dark:text-white">{act.action}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{act.details}</p>
                      <div className="flex justify-between items-center mt-1">
                        <p className="text-[8px] text-slate-400 dark:text-slate-500">{formatDate(act.timestamp)}</p>
                        <p className="text-[8px] font-bold text-indigo-600 dark:text-indigo-400">{act.userName}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-slate-400 dark:text-slate-500 py-4">لا توجد نشاطات حديثة</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




// ==========================================================================
// 📦 مدير المخزون المحسن (مع Virtual Scrolling واستيراد 10000 صنف)
// ==========================================================================
function InventoryManager({ appUser, warehouses, notify, setGlobalLoading, warehouseMap }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 700);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState({ 
    serialNumber: '', 
    name: '', 
    quantity: 1, 
    price: 0, 
    minStock: 2, 
    warehouseId: appUser?.assignedWarehouseId || 'main',
    category: 'عام',
    location: '',
    tags: [],
    notes: ''
  });
  const fileInputRef = useRef(null);
  
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkPercent, setBulkPercent] = useState(0);
  
  const [importProgress, setImportProgress] = useState({ total: 0, processed: 0, status: '' });
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  
  const [searchFilters, setSearchFilters] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);

//تعديل السيرش - serach serial upadte//
  // دالة لتحديث كل الأصناف (مرة واحدة فقط)
const fixSearchKeys = async () => {
  setGlobalLoading(true);
  try {
    const snap = await getDocs(collection(db, 'inventory'));
    const batch = writeBatch(db);
    let count = 0;
    
    snap.docs.forEach(doc => {
      const data = doc.data();
      // إضافة السيريال لـ searchKey
      const newSearchKey = normalizeSearch(`${data.name || ''} ${data.serialNumber || ''} ${data.category || ''}`);
      
      batch.update(doc.ref, { searchKey: newSearchKey });
      count++;
    });
    
    await batch.commit();
    showSuccess(`✅ تم تحديث ${count} صنف`);
    loadItems(false); // إعادة تحميل البيانات
  } catch (error) {
    console.error('Error:', error);
    showError('❌ فشل التحديث');
  }
  setGlobalLoading(false);
};


{/* في جزء الأزرار */}
<button
  onClick={fixSearchKeys}
  className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-bold"
>
  <RefreshCw size={14} /> تحديث مفاتيح البحث
</button>


  // تحميل الوسوم
  useEffect(() => {
    const loadTags = async () => {
      await tagManager.loadTags();
      const allTags = tagManager.searchTags('');
      setAvailableTags(allTags.map(t => t.name));
    };
    loadTags();
  }, []);

  // ==========================================================================
// 📦 تحميل بيانات المخزون مع Pagination وبحث متقدم
// ==========================================================================
const loadItems = useCallback(async (isNextPage = false) => {
  if (!appUser) return;
  setLoadingData(true);

  try {
    // ✅ بناء الاستعلام مع الفلاتر
    let constraints = [];
    
    // 1️⃣ فلترة حسب الصلاحيات (المخزن المخصص للمستخدم)
    if (appUser.role !== 'admin' && !appUser.permissions?.viewAllWarehouses) {
      constraints.push(where('warehouseId', '==', appUser.assignedWarehouseId || 'main'));
    }
    
    // 2️⃣ استبعاد الأصناف المحذوفة
    constraints.push(where('isDeleted', '==', false));
    
    // 3️⃣ البحث المتقدم (باستخدام searchKey المحسوب)
    const term = normalizeSearch(debouncedSearch);
    if (term) {
      // استخدام searchKey للبحث السريع (مفهرس في Firebase)
      constraints.push(where('searchKey', '>=', term));
      constraints.push(where('searchKey', '<=', term + '\uf8ff'));
      constraints.push(orderBy('searchKey'));
    } else {
      // ترتيب حسب الاسم إذا لم يكن هناك بحث
      constraints.push(orderBy('name'));
    }

    // 4️⃣ التحميل التدريجي (Pagination)
    if (isNextPage && lastDoc) {
      constraints.push(startAfter(lastDoc));
    }
    constraints.push(limit(50)); // تحميل 50 صنف في كل مرة

    // 5️⃣ تنفيذ الاستعلام
    let q = query(collection(db, 'inventory'), ...constraints);
    const snap = await getDocs(q);
    
    let fetched = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    // 6️⃣ فلاتر محلية إضافية (لأنها لا تدعمها Firebase مباشرة)
    if (searchFilters.warehouse) {
      fetched = fetched.filter(i => i.warehouseId === searchFilters.warehouse);
    }
    if (searchFilters.category) {
      fetched = fetched.filter(i => i.category === searchFilters.category);
    }
    if (selectedTags.length > 0) {
      fetched = fetched.filter(i => 
        selectedTags.some(tag => (i.tags || []).includes(tag))
      );
    }

    // 7️⃣ تحديث الحالة
    if (isNextPage) {
      setItems(prev => [...prev, ...fetched]);
    } else {
      setItems(fetched);
    }
    
    // 8️⃣ حفظ آخر مستند للتحميل التالي
    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    setHasMore(snap.docs.length === 50); // إذا كان العدد 50، فهناك المزيد
    
  } catch (e) {
    console.error("Error loading inventory:", e);
    if (e.code === 'permission-denied') {
      showError("❌ خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
    } else if (e.message.includes('index')) {
      showError("⚠️ يحتاج هذا البحث إلى تهيئة فهارس Firebase. انتظر دقيقة ثم حاول مرة أخرى.");
    } else {
      showError("❌ فشل تحميل المخزون: " + e.message);
    }
  }
  setLoadingData(false);
}, [appUser, debouncedSearch, searchFilters, selectedTags, lastDoc]);


useEffect(() => {

  loadItems();

}, [debouncedSearch, appUser, searchFilters, selectedTags]);

  useEffect(() => {
    const uniqueCategories = [...new Set(items.map(item => item.category).filter(Boolean))];
    setCategories(uniqueCategories);
  }, [items]);

  // دوال التحديد المتعدد
  const toggleSelectItem = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(i => i.id)));
    }
  };

  // دالة الحذف المجمع
  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      showError("لم يتم تحديد أي أصناف للحذف");
      return;
    }

    if (bulkDeleteConfirm !== 'حذف') {
      showError("يرجى كتابة 'حذف' لتأكيد العملية");
      return;
    }

    const confirmed = await showConfirm(
      'تأكيد الحذف المجمع',
      `هل أنت متأكد من حذف ${selectedItems.size} صنف بشكل نهائي؟`,
      'warning',
      'نعم، احذف الكل'
    );

    if (!confirmed) return;

    setGlobalLoading(true);
    try {
      const itemsToDelete = Array.from(selectedItems);
      const chunks = [];
      
      for (let i = 0; i < itemsToDelete.length; i += 400) {
        chunks.push(itemsToDelete.slice(i, i + 400));
      }

      let deleted = 0;
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        
        chunk.forEach(itemId => {
          const ref = doc(db, 'inventory', itemId);
          batch.delete(ref);
        });

        await batch.commit();
        deleted += chunk.length;
      }

      await logUserActivity(appUser, 'حذف مجمع', `تم حذف ${deleted} صنف من المخزون`);
      showSuccess(`تم حذف ${deleted} صنف بنجاح`);
      
      setSelectedItems(new Set());
      setShowBulkDeleteModal(false);
      setBulkDeleteConfirm('');
      setLastDoc(null);
      loadItems(false);
      
    } catch (error) {
      console.error("Bulk delete error:", error);
      showError("حدث خطأ أثناء الحذف المجمع");
    }
    setGlobalLoading(false);
  };

  // دالة التحقق من السيريال
  const checkSerialAvailability = async (serial) => {

  const normalized = normalizeSerial(serial);

  const q = query(
    collection(db,'inventory'),
    where('serialNumber','==',normalized),
    where('isDeleted','==',false)
  );

  const snap = await getDocs(q);

  return snap.empty;

};

  // دالة الاستيراد المحسنة مع Web Worker
  const handleImportConfirm = async () => {
    if (importData.length === 0) return;

    setShowImportModal(false);
    setGlobalLoading(true);
    
    const totalItems = importData.length;

    const BATCH_SIZE = 400;

for (let i = 0; i < importData.length; i += BATCH_SIZE) {

  const chunk = importData.slice(i, i + BATCH_SIZE);

  const batch = writeBatch(db);

  chunk.forEach((item) => {

    const ref = doc(collection(db, "inventory"));

    batch.set(ref, {
      ...item,
      serialNumber: normalizeSerial(item.serialNumber),
      quantity: item.quantity || 1,
      isDeleted: false,
      createdAt: serverTimestamp()
    });

  });

  await batch.commit();

  setImportProgress(prev => ({
    ...prev,
    processed: Math.min(prev.processed + chunk.length, totalItems),
    currentBatch: prev.currentBatch + 1
  }));

}
    
    setImportProgress({ 
      total: totalItems, 
      processed: 0, 
      failed: 0,
      status: 'بدء الاستيراد...',
      currentBatch: 0,
      totalBatches: Math.ceil(totalItems / BATCH_SIZE)
    });

    try {
      const worker = new Worker('/workers/inventoryImportWorker.js');
      
      worker.postMessage({
        data: importData,
        batchSize: BATCH_SIZE,
        userId: appUser.id,
        userName: appUser.name
      });

      worker.onmessage = async (e) => {
        const { type, processed, failed, total, batch, batchIndex, totalBatches, error } = e.data;
        
        if (type === 'batch') {
          try {
            const firestoreBatch = writeBatch(db);
            
            for (const item of batch) {
              const newRef = doc(collection(db, 'inventory'));
              firestoreBatch.set(newRef, {
                ...item,
                searchKey: normalizeSearch(`${item.name} ${item.serialNumber} ${item.category} ${(item.tags || []).join(' ')}`),
                createdAt: serverTimestamp(),
                isDeleted: false,
                importedBy: appUser.name,
                importedAt: serverTimestamp()
              });

              const regRef = doc(db, 'serial_registry', item.serialNumber);
              firestoreBatch.set(regRef, { 
                exists: true, 
                imported: true,
                importedAt: serverTimestamp() 
              }, { merge: true });
            }
            
            await firestoreBatch.commit();
            
            setImportProgress(prev => ({
              ...prev,
              processed: prev.processed + batch.length,
              currentBatch: batchIndex + 1,
              status: `جاري الاستيراد... ${Math.round(((batchIndex + 1) / totalBatches) * 100)}% (${batchIndex + 1}/${totalBatches})`
            }));
            
          } catch (err) {
            console.error('Error saving batch:', err);
            setImportProgress(prev => ({
              ...prev,
              failed: prev.failed + batch.length,
              status: `خطأ في الدفعة ${batchIndex + 1}`
            }));
          }
          
        } else if (type === 'progress') {
          setImportProgress(prev => ({
            ...prev,
            processed,
            failed,
            status: `معالجة البيانات... ${processed}/${total}`
          }));
          
        } else if (type === 'complete') {
          await logUserActivity(appUser, 'استيراد أصناف', `استيراد ${processed} صنف (فشل ${failed})`);
          
          if (failed === 0) {
            showSuccess(`✅ تم استيراد ${processed} صنف بنجاح`);
          } else {
            showWarning(`⚠️ تم استيراد ${processed} صنف، فشل ${failed} صنف`);
          }
          
          setLastDoc(null);
          await loadItems(false);
          
          setGlobalLoading(false);
          worker.terminate();
          
        } else if (type === 'error') {
          showError(`❌ خطأ في الاستيراد: ${error}`);
          setGlobalLoading(false);
          worker.terminate();
        }
      };

      worker.onerror = (error) => {
        console.error("Worker error:", error);
        showError("حدث خطأ في عملية الاستيراد");
        setGlobalLoading(false);
        worker.terminate();
      };
      
    } catch (err) {
      console.error("Import error:", err);
      showError("حدث خطأ أثناء الاستيراد: " + err.message);
      setGlobalLoading(false);
    }

    setImportData([]);
  };

  // دالة معالجة الملف المحسنة
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      showWarning(`حجم الملف كبير (${(file.size / (1024*1024)).toFixed(2)} MB). قد يستغرق الاستيراد بعض الوقت.`);
    }

    setGlobalLoading(true);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        
        let data;
        if (text.length > 500000) {
          const csvWorker = new Worker('/workers/csvParser.js');
          csvWorker.postMessage(text);
          data = await new Promise((resolve) => {
            csvWorker.onmessage = (e) => {
              resolve(e.data);
              csvWorker.terminate();
            };
          });
        } else {
          data = parseCSV(text);
        }
        
        processParsedData(data);
        
      } catch (error) {
        console.error("File parse error:", error);
        showError("خطأ في قراءة الملف: " + error.message);
        setGlobalLoading(false);
      }
    };
    
    const processParsedData = (data) => {
      if (data.length > 50000) {
        showError("عدد الأصناف كبير جداً. الحد الأقصى 50000 صنف");
        e.target.value = null;
        setGlobalLoading(false);
        return;
      }

      const errors = [];
      const validData = [];

      data.forEach((row, index) => {
        if (!row.serialNumber || !row.name) {
          errors.push(`الصف ${index + 2}: السيريال أو الاسم مطلوب`);
          return;
        }

        const serial = normalizeSerial(row.serialNumber);
        const quantity = parseInt(row.quantity) || 1;
        const price = parseFloat(row.price) || 0;

        if (quantity < 0 || price < 0) {
          errors.push(`الصف ${index + 2}: قيم غير صالحة`);
          return;
        }

        validData.push({
          serialNumber: serial,
          name: row.name,
          quantity,
          price,
          minStock: parseInt(row.minStock) || 2,
          category: row.category || 'عام',
          location: row.location || '',
          tags: row.tags ? row.tags.split(',').map(t => t.trim()) : [],
          notes: row.notes || '',
          warehouseId: appUser.assignedWarehouseId || 'main'
        });
      });

      if (errors.length > 0) {
        setImportErrors(errors);
        setImportData([]);
        showWarning(`تم العثور على ${errors.length} خطأ في الملف`);
      } else {
        setImportData(validData);
        setImportErrors([]);
        setShowImportModal(true);
        showSuccess(`تم تحميل ${validData.length} صنف بنجاح`);
      }
      
      setGlobalLoading(false);
      e.target.value = null;
    };

    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const template = [
      {
        serialNumber: 'SN123456',
        name: 'اسم المنتج',
        quantity: '10',
        price: '1000',
        minStock: '2',
        category: 'عام',
        location: 'رف A1',
        tags: 'الكترونيات,استيراد',
        notes: 'ملاحظات',
        warehouseId: 'main'
      }
    ];
    exportToCSV(template, 'inventory_import_template');
    showSuccess("تم تحميل قالب الاستيراد");
  };

  // دالة الإضافة المحسنة
  const handleAdd = async (e) => {
    e.preventDefault();
    
    const errors = validators.inventory(newItem);
    if (errors.length > 0) {
      showError(errors.join('\n'));
      return;
    }

    setGlobalLoading(true);
    const serial = normalizeSerial(newItem.serialNumber);
    const priceNum = Number(newItem.price) || 0;
    const qtyNum = Number(newItem.quantity) || 1;

    try {
      const isAvailable = await checkSerialAvailability(serial);
      
      if (!isAvailable) {
        throw new Error("السيريال مستخدم بالفعل في صنف نشط!");
      }
      
      const warehouseToUse = appUser.permissions?.viewAllWarehouses ? newItem.warehouseId : (appUser.assignedWarehouseId || 'main');
      
      if (newItem.tags && newItem.tags.length > 0) {
        for (const tag of newItem.tags) {
          await tagManager.incrementUsage(tag);
        }
      }
      
      const serialNormalized = normalizeSerial(serial);

    const docData = { 
      serialNumber: serialNormalized,
      name: newItem.name,
      price: priceNum,
      quantity: qtyNum,
      minStock: Number(newItem.minStock) || 2,
      category: newItem.category || 'عام',
      location: newItem.location || '',
      tags: newItem.tags || [],
      notes: newItem.notes || '',
      warehouseId: warehouseToUse,
      searchKey: normalizeSearch(`${newItem.name} ${serialNormalized} ${newItem.category} ${(newItem.tags || []).join(' ')}`),
      createdAt: serverTimestamp(),
      isDeleted: false
    };

    await addDoc(collection(db, 'inventory'), docData);

    await logUserActivity(
      appUser,
      'إضافة صنف',
      `إضافة ${qtyNum} قطعة من ${newItem.name} (S/N: ${serialNormalized})`
    );

    showSuccess("تم إضافة الصنف بنجاح");

    setLastDoc(null);
    loadItems(false);

    setNewItem({ 
      serialNumber: '',
      name: '',
      quantity: 1,
      price: 0,
      minStock: 2,
      category: 'عام',
      location: '',
      tags: [],
      notes: '',
      warehouseId: appUser?.assignedWarehouseId || 'main'
    });
    } catch(err) { 
      showError(err.message || "فشل الإضافة"); 
    }
    setGlobalLoading(false);
  };

  const handleEdit = async () => {
    if (!editingItem) return;
    
    const errors = validators.inventory(editingItem);
    if (errors.length > 0) {
      showError(errors.join('\n'));
      return;
    }

    setGlobalLoading(true);
    const priceNum = Number(editingItem.price) || 0;
    const qtyNum = Number(editingItem.quantity) || 0;

    try {
      const { id, ...dataToUpdate } = editingItem;
      await updateDoc(doc(db, 'inventory', id), { 
        name: dataToUpdate.name, 
        quantity: qtyNum, 
        price: priceNum,
        category: dataToUpdate.category,
        location: dataToUpdate.location,
        tags: dataToUpdate.tags,
        notes: dataToUpdate.notes,
        minStock: Number(dataToUpdate.minStock),
        searchKey: normalizeSearch(`${dataToUpdate.name} ${dataToUpdate.serialNumber} ${dataToUpdate.category} ${(dataToUpdate.tags || []).join(' ')}`),
        updatedAt: serverTimestamp()
      });
      
      await logUserActivity(appUser, 'تعديل صنف', `تعديل بيانات ${dataToUpdate.name} (S/N: ${dataToUpdate.serialNumber})`);
      setEditingItem(null);
      setItems(prev => prev.map(i => 
        i.id === id ? {
          ...i, 
          name: dataToUpdate.name, 
          quantity: qtyNum, 
          price: priceNum, 
          category: dataToUpdate.category,
          location: dataToUpdate.location,
          tags: dataToUpdate.tags,
          notes: dataToUpdate.notes,
          minStock: dataToUpdate.minStock
        } : i
      ));
      showSuccess("تم تعديل الصنف بنجاح");
    } catch (error) {
      if (error.code === 'permission-denied') {
        showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
      } else {
        showError("فشل تعديل الصنف: " + error.message);
      }
    }
    setGlobalLoading(false);
  };

  // دالة حذف الصنف المحسنة
  const handleDeleteItem = async (item) => {
    const confirmed = await showConfirm(
      'تأكيد حذف الصنف',
      `هل أنت متأكد من حذف "${item.name}"؟`,
      'warning',
      'نعم، احذف'
    );
    
    if (!confirmed) return;
    
    setGlobalLoading(true);
    try {
      await updateDoc(doc(db, 'inventory', item.id), { 
        isDeleted: true, 
        quantity: 0, 
        deletedAt: serverTimestamp(),
        deletedBy: appUser.name
      });
      
      await logUserActivity(appUser, 'حذف صنف', `تم حذف صنف: ${item.name} (S/N: ${item.serialNumber})`);
      setItems(prev => prev.filter(i => i.id !== item.id));
      showSuccess(`✅ تم حذف "${item.name}" بنجاح`);
      
    } catch (error) {
      console.error("Delete error:", error);
      if (error.code === 'permission-denied') {
        showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
      } else {
        showError("فشل حذف الصنف: " + error.message);
      }
    }
    setGlobalLoading(false);
  };

  const handleBulkUpdate = async () => {
    if (!bulkPercent || bulkPercent === 0) {
      showError("الرجاء إدخال نسبة مئوية صحيحة");
      return;
    }
    
    const confirmed = await showConfirm(
      'تحديث الأسعار الشامل',
      `هل أنت متأكد من تعديل جميع أسعار الأصناف بنسبة ${bulkPercent}%؟`
    );
    
    if (!confirmed) return;
    
    setGlobalLoading(true);
    setImportProgress({ total: 0, processed: 0, status: 'جاري تحديث الأسعار...' });
    
    try {
      const q = query(
        collection(db, 'inventory'), 
        where('isDeleted', '==', false)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        showError("لا توجد أصناف للتحديث");
        setGlobalLoading(false);
        return;
      }
      
      const totalItems = snap.docs.length;
      setImportProgress({ total: totalItems, processed: 0, status: 'جاري تحديث الأسعار...' });
      
      const chunks = [];
      for (let i = 0; i < snap.docs.length; i += 400) {
        chunks.push(snap.docs.slice(i, i + 400));
      }
      
      let processed = 0;
      let updatedCount = 0;
      
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        
        chunk.forEach(d => {
          const data = d.data();
          const currentPrice = Number(data.price) || 0;
          
          const adjustment = currentPrice * (Number(bulkPercent) / 100);
          const newPrice = Math.max(0, Math.round(currentPrice + adjustment));
          
          if (newPrice !== currentPrice) {
            batch.update(d.ref, { 
              price: newPrice,
              updatedAt: serverTimestamp()
            });
            updatedCount++;
          }
        });
        
        await batch.commit();
        processed += chunk.length;
        setImportProgress({ total: totalItems, processed, status: `تم تحديث ${processed} من ${totalItems}` });
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      await logUserActivity(appUser, 'تعديل أسعار مجمع', `تعديل جميع الأسعار بنسبة ${bulkPercent}%، تم تحديث ${updatedCount} صنف`);
      
      if (updatedCount === 0) {
        showInfo("لم يتم تحديث أي صنف - الأسعار لم تتغير");
      } else {
        showSuccess(`تم تحديث أسعار ${updatedCount} صنف بنجاح`);
      }
      
      setShowBulkUpdate(false);
      setBulkPercent(0);
      setLastDoc(null);
      loadItems(false);
      
    } catch(e) {
      console.error("Bulk update error:", e);
      if (e.code === 'permission-denied') {
        showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
      } else {
        showError("حدث خطأ أثناء تحديث الأسعار: " + e.message);
      }
    } finally {
      setGlobalLoading(false);
      setImportProgress({ total: 0, processed: 0, status: '' });
    }
  };

  // تعريف أعمدة الجدول للـ Virtual Scrolling
  const tableColumns = [
    {
      field: 'select',
      width: '5%',
      render: (item) => (
        <input 
          type="checkbox" 
          className="w-4 h-4 accent-indigo-600"
          checked={selectedItems.has(item.id)}
          onChange={() => toggleSelectItem(item.id)}
        />
      )
    },
    {
      field: 'serialNumber',
      width: '10%',
      render: (item) => <span className="font-mono text-slate-500 dark:text-slate-400">{item.serialNumber}</span>
    },
    {
      field: 'name',
      width: '15%',
      render: (item) => <span className="font-bold text-slate-800 dark:text-white">{item.name}</span>
    },
    {
      field: 'category',
      width: '8%',
      render: (item) => <span className="text-slate-600 dark:text-slate-400">{item.category || 'عام'}</span>
    },
    {
      field: 'warehouse',
      width: '8%',
      render: (item) => <span className="font-bold text-indigo-500">{warehouseMap[item.warehouseId] || item.warehouseId}</span>
    },
    {
      field: 'location',
      width: '8%',
      render: (item) => <span className="text-slate-500 dark:text-slate-400">{item.location || '-'}</span>
    },
    {
      field: 'quantity',
      width: '6%',
      render: (item) => (
        <span className={`px-2 py-1 rounded-md font-bold ${
          item.quantity <= (item.minStock||2) 
            ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' 
            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
        }`}>
          {item.quantity}
        </span>
      )
    },
    {
      field: 'price',
      width: '8%',
      render: (item) => <span className="font-black text-emerald-600 dark:text-emerald-400">{item.price.toLocaleString()} ج</span>
    },
    {
      field: 'value',
      width: '8%',
      render: (item) => <span className="font-black text-indigo-600 dark:text-indigo-400">{(item.price * item.quantity).toLocaleString()} ج</span>
    },
    {
      field: 'tags',
      width: '10%',
      render: (item) => (
        <div className="flex flex-wrap gap-1">
          {item.tags?.slice(0, 2).map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-[8px] font-bold">
              {tag}
            </span>
          ))}
          {(item.tags?.length || 0) > 2 && (
            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-[8px] font-bold">
              +{item.tags.length - 2}
            </span>
          )}
        </div>
      )
    },
    {
      field: 'actions',
      width: '8%',
      render: (item) => (
        <div className="flex justify-center gap-2">
          <button 
            onClick={()=>setEditingItem(item)} 
            className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
            title="تعديل"
          >
            <Edit size={14}/>
          </button>
          {appUser.permissions?.deleteInventoryItem && (
            <button 
              onClick={()=>handleDeleteItem(item)} 
              className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-500 dark:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all"
              title="حذف"
            >
              <Trash2 size={14}/>
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* مودال الحذف المجمع */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
              <TrashIcon size={20}/> حذف مجمع للمخزون
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              أنت على وشك حذف <span className="font-bold text-rose-600">{selectedItems.size}</span> صنف بشكل نهائي.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
              هذا الإجراء لا يمكن التراجع عنه. لتأكيد الحذف، اكتب "حذف" في الحقل أدناه.
            </p>
            
            <input
              type="text"
              className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-rose-500 mb-4 bg-white dark:bg-slate-900"
              placeholder="اكتب 'حذف' للتأكيد"
              value={bulkDeleteConfirm}
              onChange={e => setBulkDeleteConfirm(e.target.value)}
            />
            
            <div className="flex gap-2">
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteConfirm !== 'حذف'}
                className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                تأكيد الحذف
              </button>
              <button
                onClick={() => {
                  setShowBulkDeleteModal(false);
                  setBulkDeleteConfirm('');
                }}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال الاستيراد */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-4xl shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="font-black text-lg mb-2 text-slate-800 dark:text-white">معاينة بيانات الاستيراد</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">عدد العناصر: {importData.length}</p>
            
            <div className="overflow-x-auto mb-4 max-h-60">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <th className="p-2">السيريال</th>
                    <th className="p-2">الاسم</th>
                    <th className="p-2">التصنيف</th>
                    <th className="p-2 text-center">الكمية</th>
                    <th className="p-2 text-center">السعر</th>
                    <th className="p-2">الموقع</th>
                    <th className="p-2">الوسوم</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {importData.slice(0, 10).map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-mono">{item.serialNumber}</td>
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">{item.category}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-center">{item.price}</td>
                      <td className="p-2">{item.location}</td>
                      <td className="p-2">{(item.tags || []).join(', ')}</td>
                    </tr>
                  ))}
                  {importData.length > 10 && (
                    <tr><td colSpan="7" className="p-2 text-center text-slate-400">... و {importData.length - 10} عناصر أخرى</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-lg mb-4">
              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                سيتم استيراد {importData.length} صنف. قد تستغرق العملية بضع دقائق.
              </p>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={handleImportConfirm} 
                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
              >
                تأكيد الاستيراد ({importData.length})
              </button>
              <button 
                onClick={() => { setShowImportModal(false); setImportData([]); }} 
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {importErrors.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
              <AlertTriangle size={20}/> أخطاء في ملف الاستيراد
            </h3>
            <div className="bg-rose-50 dark:bg-rose-900/30 p-4 rounded-xl mb-4 max-h-60 overflow-y-auto">
              {importErrors.map((err, idx) => (
                <p key={idx} className="text-xs text-rose-700 dark:text-rose-300 mb-1">• {err}</p>
              ))}
            </div>
            <button 
              onClick={() => setImportErrors([])} 
              className="w-full bg-slate-900 dark:bg-slate-700 text-white py-3 rounded-xl font-bold hover:bg-black dark:hover:bg-slate-600 transition-colors"
            >
              فهمت
            </button>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white border-b pb-3">تعديل بيانات الصنف</h3>
            <div className="space-y-4">
              <label className="block text-right">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">اسم المنتج</span>
                  <input className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" value={editingItem.name} onChange={e=>setEditingItem({...editingItem, name:e.target.value})} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">الكمية</span>
                   <input type="number" min="0" className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-center text-sm" value={editingItem.quantity} onChange={e=>setEditingItem({...editingItem, quantity: e.target.value})} />
                </label>
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">السعر</span>
                   <input type="number" min="0" className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-black outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-center text-indigo-700 dark:text-indigo-400 text-sm" value={editingItem.price} onChange={e=>setEditingItem({...editingItem, price: e.target.value})} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">حد الطلب</span>
                   <input type="number" min="0" className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-center text-sm" value={editingItem.minStock} onChange={e=>setEditingItem({...editingItem, minStock: e.target.value})} />
                </label>
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">التصنيف</span>
                   <input className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" value={editingItem.category} onChange={e=>setEditingItem({...editingItem, category: e.target.value})} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">الموقع</span>
                   <input className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" value={editingItem.location} onChange={e=>setEditingItem({...editingItem, location: e.target.value})} placeholder="رف A1" />
                </label>
                <label className="block text-right">
                   <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">الوسوم</span>
                   <input className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" value={editingItem.tags?.join(', ')} onChange={e=>setEditingItem({...editingItem, tags: e.target.value.split(',').map(t => t.trim())})} placeholder="وسم1, وسم2" />
                </label>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                <textarea
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm resize-none"
                  value={editingItem.notes}
                  onChange={e => setEditingItem({...editingItem, notes: e.target.value})}
                  rows="2"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button onClick={handleEdit} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow-sm">حفظ التعديل</button>
                <button onClick={()=>setEditingItem(null)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkUpdate && appUser.role === 'admin' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-lg mb-2 text-slate-800 dark:text-white flex items-center gap-2">
              <Percent className="text-indigo-600"/> تحديث الأسعار الشامل
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 font-bold">
              أدخل النسبة المئوية (استخدم علامة - للخصم)
            </p>
            
            {importProgress.status && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 w-full max-w-md shadow-2xl text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
                  <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">
                    استيراد البيانات
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    {importProgress.status}
                  </p>
                  
                  {importProgress.total > 0 && (
                    <>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 mb-2">
                        <div 
                          className="bg-indigo-600 h-4 rounded-full transition-all duration-300"
                          style={{ width: `${(importProgress.processed / importProgress.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-500">
                        {importProgress.processed} من {importProgress.total} عنصر
                        {importProgress.failed > 0 && ` (فشل ${importProgress.failed})`}
                      </p>
                      {importProgress.totalBatches > 1 && (
                        <p className="text-xs text-indigo-500 mt-2">
                          الدفعة {importProgress.currentBatch} من {importProgress.totalBatches}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            
            <div className="space-y-4">
               <div className="relative">
                  <input 
                    type="number" 
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 pl-10 rounded-xl font-black outline-none focus:border-indigo-500 text-center text-lg bg-white dark:bg-slate-900" 
                    value={bulkPercent} 
                    onChange={e => {
                      const val = e.target.value;
                      setBulkPercent(val === '' ? 0 : Number(val));
                    }} 
                    placeholder="مثال: 10 أو -5" 
                    dir="ltr" 
                    disabled={importProgress.status !== ''}
                  />
                  <span className="absolute left-4 top-3.5 text-slate-400 dark:text-slate-500 font-black">%</span>
               </div>
               
               <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-lg border border-amber-100 dark:border-amber-800">
                 <p className="text-[10px] text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1">
                   <AlertTriangle size={12}/>
                   تنبيه: هذا التعديل سيؤثر على جميع الأصناف في جميع المخازن
                 </p>
               </div>
               
               <div className="flex gap-2 pt-2">
                 <button 
                   onClick={handleBulkUpdate} 
                   disabled={importProgress.status !== '' || !bulkPercent}
                   className="flex-1 bg-slate-900 dark:bg-slate-700 text-white py-3 rounded-xl font-bold text-sm hover:bg-black dark:hover:bg-slate-600 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   {importProgress.status ? 'جاري التحديث...' : 'تطبيق على الكل'}
                 </button>
                 <button 
                   onClick={() => {
                     setShowBulkUpdate(false);
                     setBulkPercent(0);
                     setImportProgress({ total: 0, processed: 0, status: '' });
                   }} 
                   disabled={importProgress.status !== ''}
                   className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                 >
                   إلغاء
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* رأس الصفحة */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-[1.5rem] shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-slate-50 dark:border-slate-700 pb-4">
             <div className="flex items-center gap-2">
               <h3 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2">
                 <Package size={22} className="text-indigo-600"/> إدارة المخزون
               </h3>
               <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-lg text-xs">
                 {items.length} صنف
               </span>
             </div>
             
             <div className="flex flex-wrap gap-2 w-full md:w-auto">
                {selectedItems.size > 0 && appUser.permissions?.bulkDeleteInventory && (
                  <button 
                    onClick={() => setShowBulkDeleteModal(true)} 
                    className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center justify-center gap-2"
                  >
                    <TrashIcon size={14}/> حذف {selectedItems.size} صنف
                  </button>
                )}
                
                {appUser.role === 'admin' && (
                   <button 
                     onClick={()=>setShowBulkUpdate(true)} 
                     className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/50 flex items-center justify-center gap-2"
                   >
                     <Percent size={14}/> تعديل الأسعار
                   </button>
                )}
                
                <button 
                  onClick={downloadTemplate}
                  className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center justify-center gap-2"
                >
                  <DownloadIcon size={14}/> قالب
                </button>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".csv" 
                  onChange={handleFileSelect} 
                />
                <button 
                  onClick={()=>fileInputRef.current.click()} 
                  className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center justify-center gap-2"
                >
                  <UploadCloud size={14}/> استيراد
                </button>
                
                <button 
                  onClick={()=>exportToCSV(items, 'Inventory_Data')} 
                  className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center justify-center gap-2"
                >
                  <Download size={14}/> تصدير
                </button>
             </div>
          </div>

          {/* نموذج الإضافة */}
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-8 gap-3 items-end bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
             <div className="md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">الباركود</label>
                <input 
                  required 
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none font-mono focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" 
                  value={newItem.serialNumber} 
                  onChange={e=>setNewItem({...newItem, serialNumber:e.target.value})} 
                  placeholder="S/N"
                />
             </div>
             <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">اسم المنتج</label>
                <input 
                  required 
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none font-bold focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" 
                  value={newItem.name} 
                  onChange={e=>setNewItem({...newItem, name:e.target.value})} 
                  placeholder="وصف المنتج"
                />
             </div>
             <div className="md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">التصنيف</label>
                <input 
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none font-bold focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" 
                  value={newItem.category} 
                  onChange={e=>setNewItem({...newItem, category:e.target.value})} 
                  placeholder="عام"
                />
             </div>
             <div className="md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">الوسوم</label>
                <input 
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none font-bold focus:border-indigo-500 bg-white dark:bg-slate-900 text-sm" 
                  value={newItem.tags?.join(', ')} 
                  onChange={e=>setNewItem({...newItem, tags: e.target.value.split(',').map(t => t.trim())})} 
                  placeholder="وسم1, وسم2"
                />
             </div>
             {appUser.permissions?.viewAllWarehouses && (
               <div className="md:col-span-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">الفرع</label>
                  <select 
                    className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg font-bold bg-white dark:bg-slate-900 focus:border-indigo-500 outline-none text-sm" 
                    value={newItem.warehouseId} 
                    onChange={e=>setNewItem({...newItem, warehouseId: e.target.value})}
                  >
                     {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
               </div>
             )}
             <div className="md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">الكمية</label>
                <input 
                  type="number" 
                  min="0" 
                  required 
                  className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none text-center font-bold bg-white dark:bg-slate-900 focus:border-indigo-500 text-sm" 
                  value={newItem.quantity} 
                  onChange={e=>setNewItem({...newItem, quantity: e.target.value})} 
                />
             </div>
             <div className="md:col-span-1 flex gap-2">
                <div className="flex-1">
                   <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">السعر</label>
                   <input 
                     type="number" 
                     min="0" 
                     required 
                     className="w-full border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg outline-none text-center font-black text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-900 focus:border-indigo-500 text-sm" 
                     value={newItem.price} 
                     onChange={e=>setNewItem({...newItem, price: e.target.value})} 
                   />
                </div>
                <button type="submit" id="add-item-button" className="bg-slate-900 dark:bg-indigo-600 text-white px-4 rounded-lg font-bold h-[42px] mt-auto hover:bg-black dark:hover:bg-indigo-700 transition-colors shadow-sm">
                  <Plus size={18}/>
                </button>
             </div>
          </form>
       </div>

       {/* قسم البحث والفلترة */}
       <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b bg-slate-50 dark:bg-slate-900/50">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute right-3 top-3 text-slate-400" />
                <input 
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 pr-9 p-2.5 rounded-lg outline-none font-bold text-sm focus:border-indigo-500 transition-colors" 
                  placeholder="بحث بالسيريال أو الاسم أو التصنيف..." 
                  value={search} 
                  onChange={e=>setSearch(e.target.value)} 
                  id="inventory-search"
                />
              </div>
              
              <select 
                className="border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
                value={searchFilters.warehouse || ''}
                onChange={e => setSearchFilters({...searchFilters, warehouse: e.target.value})}
              >
                <option value="">كل المخازن</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              
              <select 
                className="border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
                value={searchFilters.category || ''}
                onChange={e => setSearchFilters({...searchFilters, category: e.target.value})}
              >
                <option value="">كل التصنيفات</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              
              <select 
                className="border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
                value={selectedTags.join(',')}
                onChange={e => setSelectedTags(e.target.value ? e.target.value.split(',') : [])}
              >
                <option value="">كل الوسوم</option>
                {availableTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              
              <button
                onClick={() => {
                  setSearchFilters({});
                  setSelectedTags([]);
                  setSearch('');
                }}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                <RefreshCcw size={16} />
              </button>
              
              {loadingData && <Loader2 className="animate-spin text-indigo-500 mt-2" size={16}/>}
            </div>
          </div>

          {/* الجدول مع Virtual Scrolling */}
          <div className="overflow-hidden" style={{ height: '600px' }}>
            {items.length === 0 && !loadingData ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Package size={48} className="mb-3 opacity-20"/>
                <p className="font-bold">لا توجد نتائج</p>
              </div>
            ) : (
              <>
                <div className="flex bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 font-bold text-xs sticky top-0 z-10">
                  {tableColumns.map((col, idx) => (
                    <div key={idx} className="p-3" style={{ width: col.width }}>
                      {idx === 0 && (
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 accent-indigo-600"
                          checked={selectedItems.size === items.length && items.length > 0}
                          onChange={toggleSelectAll}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <VirtualTable 
                  data={items}
                  columns={tableColumns}
                  height={550}
                  rowHeight={50}
                />
              </>
            )}
          </div>

          {hasMore && !loadingData && items.length >= 100 && (
            <div className="p-4 text-center bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
              <button 
                onClick={() => loadItems(true)} 
                className="text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:underline flex items-center justify-center gap-1 mx-auto"
              >
                تحميل المزيد <ChevronDown size={14}/>
              </button>
            </div>
          )}
       </div>
    </div>
  );
}
// ==========================================================================
// 📦 عرض النواقص المحسن
// ==========================================================================
function LowStockView({ lowStockItems = [], appUser, warehouseMap }) {

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

 console.log("SEARCH VALUE:", search);
 console.log("ITEMS:", items);

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



  if(loading){

    return(
      <div className="flex justify-center items-center h-64 text-slate-500">
        جاري تحميل النواقص...
      </div>
    );

  }



  return(

    <div className="space-y-6 text-right" dir="rtl">

      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">

        <div className="flex flex-wrap gap-4 justify-between items-center mb-6">

          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <AlertOctagon className="text-rose-500" size={24}/>
            الأصناف التي وصلت لحد الطلب
          </h2>


          <div className="flex gap-3">

            <input
              placeholder="بحث بالاسم أو السيريال..."
              className="border border-slate-200 p-2 rounded-lg text-sm w-52"
              value={search}
              onChange={e=>setSearch(e.target.value)}
            />

            <select
              className="border border-slate-200 p-2 rounded-lg text-sm font-bold"
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
              className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 flex items-center gap-2 disabled:opacity-50"
            >
              <Download size={14}/> تصدير
            </button>

          </div>

        </div>



        <div className="overflow-x-auto">

          <table className="w-full text-right text-sm">

            <thead className="bg-slate-50 border-b text-slate-500 font-bold text-xs">

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
                  <td colSpan="6" className="p-10 text-center text-slate-400 font-bold">
                    لا توجد نواقص حالياً
                  </td>
                </tr>

              ):

              filteredItems.map(item=>(

                <tr key={item.id} className="hover:bg-slate-50">

                  <td className="p-4 font-mono text-slate-500">
                    {item.serialNumber}
                  </td>

                  <td className="p-4 font-bold text-slate-800">
                    {item.name}
                  </td>

                  <td className="p-4 text-center text-indigo-600 font-bold">
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
function ReportsManager({ notify }) {
  const [transactions, setTransactions] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [reportType, setReportType] = useState('all');
  const [warehouse, setWarehouse] = useState('all');
  const [exportFormat, setExportFormat] = useState('csv');
  const [summary, setSummary] = useState({ total: 0, count: 0, avg: 0, min: 0, max: 0 });
  const [chartData, setChartData] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  useEffect(() => {
    const loadWarehouses = async () => {
      const snap = await getDocs(collection(db, 'warehouses'));
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    loadWarehouses();
  }, []);

  const loadReports = useCallback(async (isNextPage = false) => {
    setLoading(true);
    setError(null);
    try {
        let q = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'));
        
        if (dateRange.from) {
          const fromDate = new Date(dateRange.from);
          fromDate.setHours(0,0,0,0);
          q = query(q, where('timestamp', '>=', fromDate));
        }
        
        if (dateRange.to) {
          const toDate = new Date(dateRange.to);
          toDate.setHours(23,59,59,999);
          q = query(q, where('timestamp', '<=', toDate));
        }
        
        if (reportType !== 'all') {
          q = query(q, where('type', '==', reportType));
        }

        if (warehouse !== 'all') {
          q = query(q, where('warehouseId', '==', warehouse));
        }

        if (isNextPage && lastDoc) {
           q = query(q, startAfter(lastDoc));
        }
        q = query(q, limit(50));
        
        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (isNextPage) {
           setTransactions(prev => [...prev, ...fetched]);
        } else {
           setTransactions(fetched);
        }
        
        let total = 0;
        let values = [];
        fetched.forEach(t => {
          const val = Number(t.finalTotal || t.total || 0);
          total += val;
          values.push(val);
        });
        
        setSummary({
          total: total,
          count: fetched.length,
          avg: fetched.length > 0 ? total / fetched.length : 0,
          min: values.length > 0 ? Math.min(...values) : 0,
          max: values.length > 0 ? Math.max(...values) : 0
        });

        const dailyTotals = {};
        fetched.forEach(t => {
          const date = formatDate(t.timestamp).split(' ')[0];
          dailyTotals[date] = (dailyTotals[date] || 0) + Number(t.finalTotal || t.total || 0);
        });
        
        setChartData(Object.entries(dailyTotals).map(([date, total]) => ({
          date,
          total
        })).slice(0, 20));

        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === 50);
    } catch (e) {
        console.error("Error loading reports:", e);
        setError(e.message);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("حدث خطأ أثناء تحميل التقارير");
        }
    }
    setLoading(false);
  }, [lastDoc, dateRange, reportType, warehouse]);

  useEffect(() => {
    setLastDoc(null);
    loadReports(false);
  }, [dateRange, reportType, warehouse]);

  const handleExport = async () => {
    if (!transactions || transactions.length === 0) {
      showError("لا توجد بيانات للتصدير");
      return;
    }
    
    try {
      const exportData = transactions.map(t => ({
        'رقم الفاتورة': t.invoiceNumber || '-',
        'التاريخ': formatDate(t.timestamp),
        'نوع العملية': t.type === 'sell' ? 'بيع' : t.type === 'return' ? 'مرتجع' : t.type,
        'الصنف': t.itemName || '-',
        'السيريال': t.serialNumber || '-',
        'العميل': t.customerName || '-',
        'الفني المختص': t.technicianName || '-',
        'الخصم': t.discountAmount || 0,
        'الضريبة': t.taxAmount || 0,
        'الصافي': t.finalTotal || t.total || 0,
        'البائع': t.operator || '-',
        'المخزن': t.warehouseId || '-'
      }));

      if (exportFormat === 'csv') {
        exportToCSV(exportData, `Sales_Report_${new Date().toISOString().split('T')[0]}`);
        showSuccess("تم تصدير الملف بنجاح");
      } else if (exportFormat === 'pdf') {
        await exportToPDF(
          exportData,
          'تقرير المبيعات',
          ['رقم الفاتورة', 'التاريخ', 'نوع العملية', 'الصنف', 'العميل', 'الصافي', 'البائع']
        );
        showSuccess("تم تصدير PDF بنجاح");
      }
    } catch (err) {
      console.error("Export error:", err);
      showError("حدث خطأ أثناء التصدير");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleResetFilters = () => {
    setDateRange({ from: '', to: '' });
    setReportType('all');
    setWarehouse('all');
  };

  if (loading && transactions.length === 0) {
    return <LoadingSkeleton type="table" count={5} />;
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden text-right" dir="rtl">
       <div className="p-5 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 dark:bg-slate-900/50">
         <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
           <History className="text-indigo-600" size={20}/> سجل المبيعات والتقارير
         </h2>
         <div className="flex flex-wrap items-center gap-3">
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
               value={reportType}
               onChange={e => setReportType(e.target.value)}
             >
               <option value="all">كل المعاملات</option>
               <option value="sell">مبيعات</option>
               <option value="return">مرتجعات</option>
             </select>
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
               value={warehouse}
               onChange={e => setWarehouse(e.target.value)}
             >
               <option value="all">كل المخازن</option>
               {warehouses.map(w => (
                 <option key={w.id} value={w.id}>{w.name}</option>
               ))}
             </select>
             
             <input
               type="date"
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
               value={dateRange.from}
               onChange={e => setDateRange({...dateRange, from: e.target.value})}
               placeholder="من تاريخ"
             />
             <input
               type="date"
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
               value={dateRange.to}
               onChange={e => setDateRange({...dateRange, to: e.target.value})}
               placeholder="إلى تاريخ"
             />
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900"
               value={exportFormat}
               onChange={e => setExportFormat(e.target.value)}
             >
               <option value="csv">CSV</option>
               <option value="pdf">PDF</option>
             </select>
             
             <button 
               onClick={handleResetFilters}
               className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
               title="إعادة تعيين"
             >
               <RefreshCcw size={14} />
             </button>
             
             <button 
               onClick={handleExport} 
               disabled={transactions.length === 0}
               className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
             >
                 <Download size={14} /> تصدير
             </button>
             
             <button 
               onClick={handlePrint} 
               disabled={transactions.length === 0}
               className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
             >
                 <Printer size={14} /> طباعة
             </button>
         </div>
       </div>
       
       {error && (
         <div className="p-4 bg-rose-50 dark:bg-rose-900/30 border-b border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm font-bold flex items-center gap-2">
           <AlertTriangle size={16} />
           خطأ في تحميل البيانات: {error}
         </div>
       )}
       
       {transactions.length > 0 && (
         <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-gradient-to-l from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 border-b">
           <div className="bg-white dark:bg-slate-900 p-3 rounded-xl text-center">
             <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-1">إجمالي المبيعات</p>
             <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{summary.total.toLocaleString()} ج</p>
           </div>
           <div className="bg-white dark:bg-slate-900 p-3 rounded-xl text-center">
             <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-1">عدد المعاملات</p>
             <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{summary.count}</p>
           </div>
           <div className="bg-white dark:bg-slate-900 p-3 rounded-xl text-center">
             <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-1">متوسط المعاملة</p>
             <p className="text-lg font-black text-purple-600 dark:text-purple-400">{summary.avg.toLocaleString()} ج</p>
           </div>
           <div className="bg-white dark:bg-slate-900 p-3 rounded-xl text-center">
             <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-1">أعلى معاملة</p>
             <p className="text-lg font-black text-amber-600 dark:text-amber-400">{summary.max.toLocaleString()} ج</p>
           </div>
           <div className="bg-white dark:bg-slate-900 p-3 rounded-xl text-center">
             <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-1">أقل معاملة</p>
             <p className="text-lg font-black text-slate-600 dark:text-slate-400">{summary.min.toLocaleString()} ج</p>
           </div>
         </div>
       )}
       
       {chartData.length > 0 && (
         <div className="p-4 border-b">
           <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-3">تحليل المبيعات</h3>
           <AdvancedCharts 
             data={chartData.map(d => ({ name: d.date, value: d.total }))}
             type="line"
             height={200}
           />
         </div>
       )}
       
       <div className="overflow-x-auto max-h-[70vh] custom-scrollbar">
          <table className="w-full text-right text-xs">
            <thead className="bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-bold border-b sticky top-0">
              <tr>
                <th className="p-4">الفاتورة</th>
                <th className="p-4">النوع</th>
                <th className="p-4">المنتجات</th>
                <th className="p-4 text-center">العميل</th>
                <th className="p-4 text-center">الصافي</th>
                <th className="p-4">التاريخ</th>
                <th className="p-4">المخزن</th>
                <th className="p-4">البائع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700 font-medium">
              {transactions.length === 0 && !loading ? 
                <tr><td colSpan="8" className="p-8 text-center text-slate-400">لا توجد حركات</td></tr> :
                transactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="p-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">{t.invoiceNumber || t.id.slice(0,6)}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${
                        t.type === 'sell' 
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' 
                          : t.type === 'return' 
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' 
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}>
                        {t.type === 'sell' ? 'بيع' : t.type === 'return' ? 'مرتجع' : t.type}
                      </span>
                    </td>
                    <td className="p-4 max-w-xs leading-relaxed">
                      <p className="font-bold text-slate-800 dark:text-white">{t.itemName}</p>
                      {t.serialNumber && <p className="text-[9px] font-mono text-slate-400 dark:text-slate-500 mt-1">{t.serialNumber}</p>}
                    </td>
                    <td className="p-4 text-center">
                       <p className="font-bold text-slate-700 dark:text-slate-300">{t.customerName}</p>
                       {t.technicianName && <p className="text-[9px] text-indigo-500 dark:text-indigo-400 mt-1">م: {t.technicianName}</p>}
                    </td>
                    <td className="p-4 text-center font-black text-emerald-600 dark:text-emerald-400">{Number(t.finalTotal || t.total || 0).toLocaleString()} ج</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 text-[10px]">{formatDate(t.timestamp)}</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 text-[10px]">{t.warehouseId || '-'}</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 text-[10px]">{t.operator}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
          {hasMore && !loading && transactions.length >= 50 && (
             <div className="p-4 text-center bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
                <button 
                  onClick={() => loadReports(true)} 
                  className="text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                   تحميل المزيد <ChevronDown size={14}/>
                </button>
             </div>
          )}
       </div>
    </div>
  );
}

// ==========================================================================
// 📦 مدير التحويلات المحسن - مع نظام الموافقة والرفض الكامل
// ==========================================================================
function EnhancedTransferManager({ appUser, warehouseMap, notify, setGlobalLoading }) {
  const [activeTab, setActiveTab] = useState('pending');
  const [transfers, setTransfers] = useState([]);
  const [inventory, setInventory] = useState([]);
  
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [reqQty, setReqQty] = useState(1);
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [rejectingReq, setRejectingReq] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [filteredTransfers, setFilteredTransfers] = useState([]);
  const [transferNotes, setTransferNotes] = useState('');
  const [priority, setPriority] = useState('normal');
  const [transferLog, setTransferLog] = useState([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedTransferForLog, setSelectedTransferForLog] = useState(null);

  const currentWarehouseId = appUser.assignedWarehouseId || 'main';
  const isMainWarehouse = currentWarehouseId === 'main' || appUser.role === 'admin' || appUser.role === 'main_warehouse_manager';
  const canApprove = appUser.permissions?.approveTransfer || isMainWarehouse;
  const canReject = appUser.permissions?.rejectTransfer || isMainWarehouse;

  useEffect(() => {
    let q = query(collection(db, 'transfers'), orderBy('createdAt', 'desc'));
    
    if (!appUser.permissions?.viewAllWarehouses) {
      if (isMainWarehouse) {
        q = query(q, where('fromWarehouseId', '==', 'main'));
      } else {
        q = query(q, where('toWarehouseId', '==', currentWarehouseId));
      }
    }

    const unsub = onSnapshot(query(q, limit(150)), snap => {
      const fetched = snap.docs.map(d => ({id: d.id, ...d.data()}));
      setTransfers(fetched);
    });

    const invQ = isMainWarehouse 
      ? query(collection(db, 'inventory'), where('warehouseId', '==', 'main'), where('isDeleted', '==', false))
      : query(collection(db, 'inventory'), where('warehouseId', '==', currentWarehouseId), where('isDeleted', '==', false));

    const invUnsub = onSnapshot(invQ, snap => {
      setInventory(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });

    return () => { unsub(); invUnsub(); };
  }, [appUser, currentWarehouseId, isMainWarehouse]);

  useEffect(() => {
    if (selectedWarehouse === 'all') {
      setFilteredTransfers(transfers);
    } else {
      setFilteredTransfers(transfers.filter(t => 
        t.toWarehouseId === selectedWarehouse || t.fromWarehouseId === selectedWarehouse
      ));
    }
  }, [transfers, selectedWarehouse]);

  const handleSearchProduct = (e) => {
    e.preventDefault();
    if (!searchProduct.trim() || inventory.length === 0) return;
    
    const term = normalizeSearch(searchProduct);
    const found = inventory.find(i => 
      normalizeSearch(i.serialNumber).includes(term) || 
      normalizeSearch(i.name).includes(term)
    );
    
    if (found) {
      if (found.quantity <= 0) {
        showError("المنتج غير متوفر بالكمية المطلوبة في مخزنك");
        return;
      }
      setSelectedProduct(found);
      setSearchProduct('');
      setReqQty(1);
    } else {
      showError("لم يتم العثور على المنتج في مخزنك");
    }
  };

  const handleSubmitRequest = async () => {
    if (!selectedProduct) return showError("اختر منتجاً أولاً");
    if (!toWarehouseId) return showError("اختر المخزن المرسل إليه");
    if (reqQty <= 0) return showError("الكمية غير صالحة");
    if (reqQty > selectedProduct.quantity) return showError("الكمية المطلوبة أكبر من المتاح في مخزنك!");
    
    setGlobalLoading(true);
    try {
      const transferData = {
        serialNumber: selectedProduct.serialNumber,
        itemName: selectedProduct.name,
        requestedQty: Number(reqQty),
        fromWarehouseId: currentWarehouseId,
        toWarehouseId: toWarehouseId,
        status: 'pending',
        priority,
        createdAt: serverTimestamp(),
        requestedBy: appUser.name || appUser.email,
        requestedById: appUser.id,
        notes: transferNotes,
        log: [{
          action: 'إنشاء طلب تحويل',
          timestamp: new Date().toISOString(),
          by: appUser.name,
          details: `طلب تحويل ${reqQty} قطعة من ${selectedProduct.name} إلى ${warehouseMap[toWarehouseId]}`
        }]
      };
      
      await addDoc(collection(db, 'transfers'), transferData);
      
      await logUserActivity(appUser, 'طلب تحويل مخزني', `طلب تحويل ${reqQty} قطعة من ${selectedProduct.name} إلى ${warehouseMap[toWarehouseId]}`);
      showSuccess("تم إرسال طلب التحويل بنجاح");
      setSelectedProduct(null);
      setSearchProduct('');
      setReqQty(1);
      setToWarehouseId('');
      setTransferNotes('');
      setPriority('normal');
      setActiveTab('history');
    } catch(e) {
      console.error(e);
      showError("فشل إرسال الطلب: " + e.message);
    }
    setGlobalLoading(false);
  };

  const handleApprove = async (req) => {
    const confirmed = await showConfirm(
      'الموافقة على التحويل',
      `الموافقة على تحويل ${req.requestedQty} قطعة من ${req.itemName} لفرع ${warehouseMap[req.toWarehouseId]}؟`
    );
    
    if (!confirmed) return;
    
    setGlobalLoading(true);
    
    try {
      await runTransaction(db, async (transaction) => {
        // 1. البحث عن المنتج في المخزن المرسل
        const fromQ = query(
          collection(db, 'inventory'),
          where('serialNumber', '==', req.serialNumber),
          where('warehouseId', '==', req.fromWarehouseId),
          where('isDeleted', '==', false)
        );
        const fromSnap = await getDocs(fromQ);
        
        if (fromSnap.empty) {
          throw new Error(`المنتج ${req.itemName} غير موجود بالمخزن المرسل!`);
        }
        
        const fromItem = fromSnap.docs[0];
        const currentQty = fromItem.data().quantity || 0;
        
        if (currentQty < req.requestedQty) {
          throw new Error(`الكمية غير كافية! المتاح: ${currentQty}, المطلوب: ${req.requestedQty}`);
        }

        // 2. خصم الكمية من المخزن المرسل
        transaction.update(fromItem.ref, {
          quantity: currentQty - req.requestedQty,
          updatedAt: serverTimestamp()
        });

        // 3. البحث عن المنتج في المخزن المستقبل
        const toQ = query(
          collection(db, 'inventory'),
          where('serialNumber', '==', req.serialNumber),
          where('warehouseId', '==', req.toWarehouseId),
          where('isDeleted', '==', false)
        );
        const toSnap = await getDocs(toQ);

        if (!toSnap.empty) {
          // إضافة الكمية للمنتج الموجود
          const toItem = toSnap.docs[0];
          transaction.update(toItem.ref, {
            quantity: increment(req.requestedQty),
            updatedAt: serverTimestamp()
          });
        } else {
          // إنشاء منتج جديد في المخزن المستقبل
          const newRef = doc(collection(db, 'inventory'));
          const sourceData = fromItem.data();
          transaction.set(newRef, {
            serialNumber: sourceData.serialNumber,
            name: sourceData.name,
            price: sourceData.price || 0,
            quantity: req.requestedQty,
            minStock: sourceData.minStock || 2,
            category: sourceData.category || 'عام',
            location: sourceData.location || '',
            tags: sourceData.tags || [],
            notes: sourceData.notes || '',
            warehouseId: req.toWarehouseId,
            searchKey: normalizeSearch(`${sourceData.name} ${sourceData.serialNumber} ${sourceData.category || ''}`),
            createdAt: serverTimestamp(),
            isDeleted: false,
            transferredFrom: req.fromWarehouseId,
            transferId: req.id
          });
        }

        // 4. تحديث حالة الطلب
        const updatedLog = [...(req.log || []), {
          action: 'تمت الموافقة على التحويل',
          timestamp: new Date().toISOString(),
          by: appUser.name,
          details: `تم خصم ${req.requestedQty} قطعة من ${warehouseMap[req.fromWarehouseId]} وإضافتها إلى ${warehouseMap[req.toWarehouseId]}`
        }];

        const reqRef = doc(db, 'transfers', req.id);
        transaction.update(reqRef, {
          status: 'approved',
          processedAt: serverTimestamp(),
          processedBy: appUser.name || appUser.email,
          processedById: appUser.id,
          log: updatedLog
        });
      });
      
      await logUserActivity(appUser, 'موافقة على تحويل مخزني', `تمت الموافقة لفرع ${warehouseMap[req.toWarehouseId]} على ${req.requestedQty} قطعة من ${req.itemName}`);
      showSuccess("تمت الموافقة وتم التحويل المخزني بنجاح!");
      
    } catch(e) {
      console.error(e);
      showError(e.message || "خطأ أثناء الموافقة على التحويل");
    }
    setGlobalLoading(false);
  };

  const submitReject = async (e) => {
    e.preventDefault();
    if(!rejectReason.trim()) return showError("يرجى كتابة سبب الرفض");
    
    setGlobalLoading(true);
    try {
      const updatedLog = [...(rejectingReq.log || []), {
        action: 'تم رفض التحويل',
        timestamp: new Date().toISOString(),
        by: appUser.name,
        details: `سبب الرفض: ${rejectReason}`
      }];

      await updateDoc(doc(db, 'transfers', rejectingReq.id), {
        status: 'rejected',
        rejectReason: rejectReason,
        processedAt: serverTimestamp(),
        processedBy: appUser.name || appUser.email,
        processedById: appUser.id,
        log: updatedLog
      });
      
      await logUserActivity(appUser, 'رفض تحويل مخزني', `رفض طلب فرع ${warehouseMap[rejectingReq.toWarehouseId]} بسبب: ${rejectReason}`);
      showSuccess("تم رفض الطلب بنجاح");
      setRejectingReq(null);
      setRejectReason('');
    } catch(err) {
      console.error(err);
      showError("فشل عملية الرفض: " + err.message);
    }
    setGlobalLoading(false);
  };

  const viewTransferLog = (transfer) => {
    setSelectedTransferForLog(transfer);
    setTransferLog(transfer.log || []);
    setShowLogModal(true);
  };

  const pendingRequests = filteredTransfers.filter(t => t.status === 'pending');
  const processedRequests = filteredTransfers.filter(t => t.status !== 'pending');
  const uniqueWarehouses = [...new Set([
    ...transfers.map(t => t.toWarehouseId),
    ...transfers.map(t => t.fromWarehouseId)
  ])];

  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'high': return 'text-rose-600 bg-rose-50 dark:bg-rose-900/30';
      case 'normal': return 'text-blue-600 bg-blue-50 dark:bg-blue-900/30';
      case 'low': return 'text-slate-600 bg-slate-50 dark:bg-slate-900/50';
      default: return 'text-slate-600 bg-slate-50 dark:bg-slate-900/50';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden text-right" dir="rtl">
      
      {/* مودال سجل التحويل */}
      {showLogModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white border-b pb-3">
              سجل التحويل #{selectedTransferForLog?.id?.slice(0,8)}
            </h3>
            <div className="space-y-4">
              {transferLog.map((entry, idx) => (
                <div key={idx} className="relative pr-6 pb-4 border-r-2 border-indigo-200 dark:border-indigo-800 last:border-0 last:pb-0">
                  <div className="absolute right-[-5px] top-0 w-3 h-3 rounded-full bg-indigo-600"></div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(entry.timestamp).toLocaleString('ar-EG')}</p>
                  <p className="font-bold text-slate-800 dark:text-white">{entry.action}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{entry.details}</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">بواسطة: {entry.by}</p>
                </div>
              ))}
              {transferLog.length === 0 && (
                <p className="text-center text-slate-400 py-8">لا يوجد سجل</p>
              )}
            </div>
            <button 
              onClick={() => setShowLogModal(false)}
              className="mt-4 w-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* باقي المكون كما هو مع إضافة زر عرض السجل في الجدول */}

      <div className="p-6 border-b flex flex-wrap items-center justify-between bg-slate-50 dark:bg-slate-900/50 gap-4">
        <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
          <ArrowRightLeft className="text-indigo-600" size={24}/> 
          نظام التحويلات بين المخازن
        </h2>
        <div className="flex gap-2">
          <select 
            className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm font-bold bg-white dark:bg-slate-900 focus:border-indigo-500 outline-none"
            value={selectedWarehouse}
            onChange={e => setSelectedWarehouse(e.target.value)}
          >
            <option value="all">كل الفروع</option>
            {uniqueWarehouses.map(w => (
              <option key={w} value={w}>{warehouseMap[w] || w}</option>
            ))}
          </select>
          <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-2 rounded-lg text-xs font-bold">
            {pendingRequests.length} طلبات قيد الانتظار
          </span>
        </div>
      </div>

      {/* الألسنة */}
      <div className="flex border-b bg-white dark:bg-slate-800 overflow-x-auto custom-scrollbar">
        {[
          { id: 'pending', label: 'الطلبات المعلقة' },
          { id: 'history', label: 'سجل التحويلات' },
          ...(appUser.permissions?.createTransfer ? [{ id: 'new', label: 'طلب تحويل جديد' }] : [])
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={()=>setActiveTab(tab.id)} 
            className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* المحتوى */}
      <div className="p-6 max-h-[65vh] overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-900/50">
        
        {activeTab === 'new' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="bg-indigo-50 dark:bg-indigo-900/30 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 font-bold text-sm leading-relaxed shadow-sm">
              ابحث عن المنتج في مخزنك واختر الكمية والمخزن المرسل إليه. المخزن الرئيسي يمكنه الموافقة أو رفض الطلب.
            </div>
            
            <form onSubmit={handleSearchProduct} className="flex gap-3">
              <input 
                className="flex-1 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold text-right bg-white dark:bg-slate-900 focus:border-indigo-500" 
                placeholder="ابحث بالاسم أو السيريال..." 
                value={searchProduct} 
                onChange={e=>setSearchProduct(e.target.value)} 
              />
              <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-indigo-700">
                <Search size={18}/>
              </button>
            </form>

            {selectedProduct && (
              <div className="bg-white dark:bg-slate-800 border-2 border-indigo-100 dark:border-indigo-800 rounded-2xl p-6 shadow-md space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-lg text-slate-800 dark:text-white">{selectedProduct.name}</h3>
                  <button onClick={() => setSelectedProduct(null)} className="text-slate-400 dark:text-slate-500 hover:text-rose-500">
                    <X size={18}/>
                  </button>
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-mono text-sm">{selectedProduct.serialNumber}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-xl font-bold text-sm">
                    المتاح في مخزنك: {selectedProduct.quantity}
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-xl font-bold text-sm">
                    السعر: {selectedProduct.price} ج
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الكمية المطلوبة</label>
                    <input 
                      type="number" 
                      min="1" 
                      max={selectedProduct.quantity}
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-center bg-white dark:bg-slate-900" 
                      value={reqQty} 
                      onChange={e=>setReqQty(Number(e.target.value))} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">المخزن المرسل إليه</label>
                    <select 
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-white dark:bg-slate-900"
                      value={toWarehouseId}
                      onChange={e => setToWarehouseId(e.target.value)}
                    >
                      <option value="">-- اختر --</option>
                      {Object.entries(warehouseMap)
                        .filter(([id]) => id !== currentWarehouseId)
                        .map(([id, name]) => (
                          <option key={id} value={id}>{name}</option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الأولوية</label>
                  <select
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-white dark:bg-slate-900"
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                  >
                    <option value="low">منخفضة</option>
                    <option value="normal">عادية</option>
                    <option value="high">عالية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                  <textarea
                    rows="2"
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-sm resize-none bg-white dark:bg-slate-900"
                    value={transferNotes}
                    onChange={e => setTransferNotes(e.target.value)}
                    placeholder="أي ملاحظات إضافية..."
                  />
                </div>

                <button 
                  onClick={handleSubmitRequest} 
                  className="w-full bg-slate-900 dark:bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-black dark:hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowRightLeft size={18}/> إرسال طلب التحويل
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-bold border-b text-[11px] uppercase">
                  <tr>
                    <th className="p-4">من مخزن</th>
                    <th className="p-4">إلى مخزن</th>
                    <th className="p-4">المنتج</th>
                    <th className="p-4 text-center">الكمية</th>
                    <th className="p-4">الأولوية</th>
                    <th className="p-4">بواسطة</th>
                    <th className="p-4">ملاحظات</th>
                    <th className="p-4">سجل</th>
                    <th className="p-4 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {pendingRequests.length === 0 ? <tr><td colSpan="9" className="p-12 text-center text-slate-400">لا توجد طلبات معلقة</td></tr> :
                    pendingRequests.map(req => (
                      <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                        <td className="p-4 font-black text-indigo-700 dark:text-indigo-400">{warehouseMap[req.fromWarehouseId]}</td>
                        <td className="p-4 font-black text-indigo-700 dark:text-indigo-400">{warehouseMap[req.toWarehouseId]}</td>
                        <td className="p-4">
                          <p className="font-bold text-slate-800 dark:text-white mb-0.5">{req.itemName}</p>
                          <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{req.serialNumber}</p>
                        </td>
                        <td className="p-4 text-center font-black text-lg text-slate-700 dark:text-slate-300">{req.requestedQty}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${getPriorityColor(req.priority)}`}>
                            {req.priority === 'high' ? 'عالية' : req.priority === 'normal' ? 'عادية' : 'منخفضة'}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                          <p className="font-bold text-slate-700 dark:text-slate-300 mb-0.5">{req.requestedBy}</p>
                          <p className="text-[9px]">{formatDate(req.createdAt)}</p>
                        </td>
                        <td className="p-4 text-xs text-slate-500 dark:text-slate-400 max-w-[150px] truncate">
                          {req.notes || '-'}
                        </td>
                        <td className="p-4">
                          <button 
                            onClick={() => viewTransferLog(req)}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs"
                          >
                            عرض السجل
                          </button>
                        </td>
                        <td className="p-4 text-center">
                          {canApprove ? (
                            <div className="flex justify-center gap-2">
                              <button onClick={()=>handleApprove(req)} className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 p-2 rounded-xl hover:bg-emerald-500 dark:hover:bg-emerald-800 hover:text-white" title="موافقة">
                                <Check size={18}/>
                              </button>
                              {canReject && (
                                <button onClick={()=>setRejectingReq(req)} className="bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 p-2 rounded-xl hover:bg-rose-500 dark:hover:bg-rose-800 hover:text-white" title="رفض">
                                  <X size={18}/>
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-amber-100 dark:border-amber-800 flex items-center gap-1 w-max mx-auto">
                              <Loader2 size={12} className="animate-spin"/> بالانتظار
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-bold border-b text-[11px] uppercase">
                  <tr>
                    <th className="p-4">من مخزن</th>
                    <th className="p-4">إلى مخزن</th>
                    <th className="p-4">المنتج</th>
                    <th className="p-4 text-center">الكمية</th>
                    <th className="p-4">الأولوية</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4">سجل</th>
                    <th className="p-4">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {processedRequests.length === 0 ? <tr><td colSpan="8" className="p-12 text-center text-slate-400">لا يوجد سجل للتحويلات</td></tr> :
                    processedRequests.map(req => (
                      <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                        <td className="p-4 font-bold text-slate-700 dark:text-slate-300">{warehouseMap[req.fromWarehouseId]}</td>
                        <td className="p-4 font-bold text-slate-700 dark:text-slate-300">{warehouseMap[req.toWarehouseId]}</td>
                        <td className="p-4">
                          <p className="font-bold text-slate-800 dark:text-white mb-0.5">{req.itemName}</p>
                          <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{req.serialNumber}</p>
                        </td>
                        <td className="p-4 text-center font-black text-slate-700 dark:text-slate-300">{req.requestedQty}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${getPriorityColor(req.priority)}`}>
                            {req.priority === 'high' ? 'عالية' : req.priority === 'normal' ? 'عادية' : 'منخفضة'}
                          </span>
                        </td>
                        <td className="p-4">
                          {req.status === 'approved' ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-lg text-[10px] font-bold">
                              <Check size={12}/> تمت الموافقة
                            </span>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-2 py-1 rounded-lg text-[10px] font-bold">
                                <X size={12}/> مرفوض
                              </span>
                              {req.rejectReason && <p className="text-[9px] text-rose-600 dark:text-rose-400 mt-1">{req.rejectReason}</p>}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <button 
                            onClick={() => viewTransferLog(req)}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs"
                          >
                            عرض السجل
                          </button>
                        </td>
                        <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                          <p className="font-bold text-slate-700 dark:text-slate-300 mb-0.5">{formatDate(req.processedAt)}</p>
                          <p className="text-[9px]">بواسطة: {req.processedBy}</p>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* مودال سبب الرفض */}
      {rejectingReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-xl mb-4 text-slate-800 dark:text-white border-b pb-3 text-rose-600 flex items-center gap-2">
              <X size={20}/> سبب رفض التحويل
            </h3>
            <form onSubmit={submitReject}>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">
                أنت تقوم برفض طلب ({rejectingReq.itemName}) لفرع ({warehouseMap[rejectingReq.toWarehouseId]})
              </p>
              <textarea 
                required
                rows="3"
                className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-rose-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold resize-none mb-4" 
                placeholder="اكتب سبب الرفض هنا ليراه الفرع الطالب..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-colors shadow-md">تأكيد الرفض</button>
                <button type="button" onClick={()=>{setRejectingReq(null); setRejectReason('');}} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
// ==========================================================================
// 👥 مدير العملاء المحسن
// ==========================================================================
function EnhancedCustomerManager({ systemSettings, notify, setGlobalLoading, appUser }) {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 700);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  
  const [newCust, setNewCust] = useState({ 
    name: '', 
    phone: '', 
    email: '',
    productCategory: '', 
    productModel: '', 
    issue: '', 
    notes: '',
    governorate: '',
    city: '',
    address: '',
    assignedTechnician: '',
    assignedMaintenanceCenter: '',
    assignedCallCenter: '',
    birthDate: '',
    idNumber: '',
    tags: []
  });
  
  const [technicians, setTechnicians] = useState([]);
  const [maintenanceCenters, setMaintenanceCenters] = useState([]);
  const [callCenters, setCallCenters] = useState([]);
  
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  
  const [customerTickets, setCustomerTickets] = useState([]);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [filterCity, setFilterCity] = useState('');
  const [filterGovernorate, setFilterGovernorate] = useState('');
  const [filterTechnician, setFilterTechnician] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [availableTags, setAvailableTags] = useState([]);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const techs = await getDocs(query(collection(db, 'employees'), where('role', '==', 'technician'), where('isDisabled', '==', false)));
        setTechnicians(techs.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const centers = await getDocs(query(collection(db, 'employees'), where('role', '==', 'maintenance_center'), where('isDisabled', '==', false)));
        setMaintenanceCenters(centers.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const calls = await getDocs(query(collection(db, 'employees'), where('role', '==', 'call_center'), where('isDisabled', '==', false)));
        setCallCenters(calls.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching employees:", error);
      }
    };
    fetchEmployees();
  }, []);

  useEffect(() => {
    const loadTags = async () => {
      await tagManager.loadTags();
      const tags = tagManager.getTagsByCategory('customer');
      setAvailableTags(tags.map(t => t.name));
    };
    loadTags();
  }, []);

  const loadCustomers = useCallback(async (isNextPage = false) => {
  setLoadingData(true);
  try {
    let q = collection(db, 'customers');
    let constraints = [];
    
    // ✅ التحكم في البيانات حسب صلاحيات المستخدم
    if (appUser.role !== 'admin' && !appUser.permissions?.viewAllWarehouses) {
      constraints.push(where('warehouseId', '==', appUser.assignedWarehouseId || 'main'));
    }
    
    const term = normalizeSearch(debouncedSearch);
    if (term) {
      constraints.push(where('searchKey', '>=', term));
      constraints.push(where('searchKey', '<=', term + '\uf8ff'));
      constraints.push(orderBy('searchKey'));
    } else {
      constraints.push(orderBy("name"));
    }

    if (isNextPage && lastDoc) {
      constraints.push(startAfter(lastDoc));
    }
    constraints.push(limit(30));

    q = query(q, ...constraints);
    const snap = await getDocs(q);
    let fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // الفلاتر المحلية
    if (filterGovernorate) {
      fetched = fetched.filter(c => c.governorate === filterGovernorate);
    }
    if (filterCity) {
      fetched = fetched.filter(c => c.city?.includes(filterCity));
    }
    if (filterTechnician) {
      fetched = fetched.filter(c => c.assignedTechnician === filterTechnician);
    }
    if (filterTag) {
      fetched = fetched.filter(c => c.tags?.includes(filterTag));
    }

    if (isNextPage) {
      setCustomers(prev => [...prev, ...fetched]);
    } else {
      setCustomers(fetched);
    }
    
    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    setHasMore(snap.docs.length === 30);
  } catch (e) {
    console.error(e);
    showError("فشل جلب العملاء: " + e.message);
  }
  setLoadingData(false);
}, [appUser, debouncedSearch, lastDoc, filterGovernorate, filterCity, filterTechnician, filterTag]);



  useEffect(() => {
    setLastDoc(null);
    loadCustomers(false);
  }, [debouncedSearch, filterGovernorate, filterCity, filterTechnician, filterTag]);

  const toggleSelectItem = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === customers.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(customers.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      showError("لم يتم تحديد أي عملاء للحذف");
      return;
    }

    if (bulkDeleteConfirm !== 'حذف') {
      showError("يرجى كتابة 'حذف' لتأكيد العملية");
      return;
    }

    const confirmed = await showConfirm(
      'تأكيد الحذف المجمع',
      `هل أنت متأكد من حذف ${selectedItems.size} عميل بشكل نهائي؟`,
      'warning',
      'نعم، احذف الكل'
    );

    if (!confirmed) return;

    setGlobalLoading(true);
    try {
      const itemsToDelete = Array.from(selectedItems);
      const chunks = [];
      
      for (let i = 0; i < itemsToDelete.length; i += 400) {
        chunks.push(itemsToDelete.slice(i, i + 400));
      }

      let deleted = 0;
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        
        chunk.forEach(customerId => {
          const ref = doc(db, 'customers', customerId);
          batch.delete(ref);
        });

        await batch.commit();
        deleted += chunk.length;
      }

      await logUserActivity(appUser, 'حذف مجمع عملاء', `تم حذف ${deleted} عميل`);
      showSuccess(`تم حذف ${deleted} عميل بنجاح`);
      
      setSelectedItems(new Set());
      setShowBulkDeleteModal(false);
      setBulkDeleteConfirm('');
      setLastDoc(null);
      loadCustomers(false);
      
    } catch (error) {
      console.error("Bulk delete error:", error);
      showError("حدث خطأ أثناء الحذف المجمع");
    }
    setGlobalLoading(false);
  };

  const handleAddCustomer = async (e) => {
     e.preventDefault();
     
     const errors = validators.customer(newCust);
     if (errors.length > 0) {
       showError(errors.join('\n'));
       return;
     }
     
     setGlobalLoading(true);
     try {
        if (newCust.tags && newCust.tags.length > 0) {
          for (const tag of newCust.tags) {
            await tagManager.incrementUsage(tag);
          }
        }
        
        const customerData = {
           ...newCust,
           createdAt: serverTimestamp(),
           createdBy: appUser.id,
           createdByName: appUser.name,
           searchKey: normalizeSearch(`${newCust.name} ${newCust.phone} ${newCust.email || ''} ${(newCust.tags || []).join(' ')}`),
           addressFull: newCust.governorate && newCust.city && newCust.address 
             ? `${newCust.governorate} - ${newCust.city} - ${newCust.address}`
             : '',
           totalPurchases: 0,
           lastPurchase: null,
           ticketsCount: 0
        };

        await addDoc(collection(db, 'customers'), customerData);
        
        await logUserActivity(appUser, 'إضافة عميل', `تسجيل العميل: ${newCust.name}`);
        showSuccess("تم تسجيل العميل بنجاح");
        setShowAddModal(false);
        setNewCust({ 
          name: '', phone: '', email: '', productCategory: '', productModel: '', issue: '', notes: '',
          governorate: '', city: '', address: '', assignedTechnician: '', assignedMaintenanceCenter: '', 
          assignedCallCenter: '', birthDate: '', idNumber: '', tags: []
        });
        setLastDoc(null);
        loadCustomers(false); 
     } catch(err) {
        console.error(err);
        if (err.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("حدث خطأ أثناء الحفظ: " + err.message);
        }
     }
     setGlobalLoading(false);
  };

  const handleImportCustomers = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showError("حجم الملف كبير جداً. الحد الأقصى 10MB");
      e.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const data = parseCSV(text);
        let success = 0;
        let failed = 0;

        if (data.length > 15000) {
          showError("عدد العملاء كبير جداً. الحد الأقصى 15000 عميل");
          e.target.value = null;
          return;
        }

        const chunks = [];
        for (let i = 0; i < data.length; i += 400) {
          chunks.push(data.slice(i, i + 400));
        }

        for (const chunk of chunks) {
          const batch = writeBatch(db);
          
          for (const row of chunk) {
            try {
              if (!row.name || !row.phone) {
                failed++;
                continue;
              }

              const tags = row.tags ? row.tags.split(',').map(t => t.trim()) : [];

              const customerData = {
                name: row.name,
                phone: row.phone,
                email: row.email || '',
                governorate: row.governorate || '',
                city: row.city || '',
                address: row.address || '',
                notes: row.notes || '',
                tags,
                createdAt: serverTimestamp(),
                createdBy: appUser.id,
                createdByName: appUser.name,
                searchKey: normalizeSearch(`${row.name} ${row.phone} ${tags.join(' ')}`)
              };

              const newRef = doc(collection(db, 'customers'));
              batch.set(newRef, customerData);
              success++;
            } catch (err) {
              failed++;
            }
          }

          await batch.commit();
        }

        showSuccess(`تم استيراد ${success} عميل بنجاح، فشل ${failed}`);
        setLastDoc(null);
        loadCustomers(false);
      } catch (error) {
        console.error("Import error:", error);
        showError("خطأ في قراءة الملف");
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const handleExportCustomers = async () => {
    const exportData = customers.map(c => ({
      'الاسم': c.name,
      'الهاتف': c.phone,
      'البريد الإلكتروني': c.email || '',
      'المحافظة': c.governorate || '',
      'المدينة': c.city || '',
      'العنوان': c.address || '',
      'الوسوم': (c.tags || []).join(', '),
      'آخر شراء': formatDate(c.lastPurchase),
      'عدد المشتريات': c.totalPurchases || 0,
      'عدد التذاكر': c.ticketsCount || 0
    }));

    await exportToPDF(
      exportData,
      'تقرير العملاء',
      ['الاسم', 'الهاتف', 'البريد الإلكتروني', 'المحافظة', 'المدينة', 'العنوان', 'الوسوم', 'آخر شراء', 'عدد المشتريات', 'عدد التذاكر']
    );
    showSuccess("تم تصدير العملاء بنجاح");
  };

  const availableModels = useMemo(() => {
     if(!newCust.productCategory || !systemSettings.productCategories) return [];
     const cat = systemSettings.productCategories.find(c => c.name === newCust.productCategory);
     return cat ? cat.models : [];
  }, [newCust.productCategory, systemSettings.productCategories]);

  if (invoiceData) {
     return <InvoiceRenderer data={invoiceData} systemSettings={systemSettings} onBack={() => { setInvoiceData(null); setSelectedCustomer(null); }} />;
  }
  
  if (selectedCustomer) {
     return (
        <CustomerProfileView 
           customer={selectedCustomer} 
           onClose={() => setSelectedCustomer(null)}
           systemSettings={systemSettings}
           notify={notify}
           setGlobalLoading={setGlobalLoading}
           appUser={appUser}
           onCheckoutSuccess={(data) => setInvoiceData(data)}
        />
     );
  }

  const cities = [...new Set(customers.map(c => c.city).filter(Boolean))];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden text-right" dir="rtl">
      
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                <UserCog className="text-indigo-600"/> تسجيل بيانات عميل جديد
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-rose-600">
                <X size={24}/>
              </button>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">اسم العميل *</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold" 
                       value={newCust.name} 
                       onChange={e=>setNewCust({...newCust, name:e.target.value})} 
                       placeholder="الاسم بالكامل" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">رقم الهاتف *</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold font-mono" 
                       value={newCust.phone} 
                       onChange={e=>setNewCust({...newCust, phone:e.target.value})} 
                       placeholder="01XXXXXXXXX" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">البريد الإلكتروني</label>
                     <input 
                       type="email"
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold" 
                       value={newCust.email} 
                       onChange={e=>setNewCust({...newCust, email:e.target.value})} 
                       placeholder="example@domain.com" 
                     />
                  </div>
               </div>

               <div className="bg-sky-50 dark:bg-sky-900/30 p-4 rounded-xl border border-sky-100 dark:border-sky-800">
                  <h4 className="font-bold text-sm text-sky-900 dark:text-sky-300 mb-3 flex items-center gap-2">
                    <MapPin size={16}/> عنوان العميل
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                        <label className="block text-xs font-bold text-sky-800 dark:text-sky-400 mb-1">المحافظة</label>
                        <select 
                          className="w-full border border-sky-200 dark:border-sky-800 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold"
                          value={newCust.governorate}
                          onChange={e => setNewCust({...newCust, governorate: e.target.value})}
                        >
                           <option value="">-- اختر المحافظة --</option>
                           {EGYPT_GOVERNORATES.map(gov => (
                             <option key={gov} value={gov}>{gov}</option>
                           ))}
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-sky-800 dark:text-sky-400 mb-1">المدينة / المركز</label>
                        <input 
                          className="w-full border border-sky-200 dark:border-sky-800 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold" 
                          value={newCust.city} 
                          onChange={e=>setNewCust({...newCust, city:e.target.value})} 
                          placeholder="مثال: مدينة نصر" 
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-sky-800 dark:text-sky-400 mb-1">العنوان بالتفصيل</label>
                        <input 
                          className="w-full border border-sky-200 dark:border-sky-800 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold" 
                          value={newCust.address} 
                          onChange={e=>setNewCust({...newCust, address:e.target.value})} 
                          placeholder="الشارع - العمارة - الشقة" 
                        />
                     </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                  <div>
                     <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1">المنتج (التصنيف)</label>
                     <select 
                       className="w-full border border-indigo-100 dark:border-indigo-800 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold" 
                       value={newCust.productCategory} 
                       onChange={e=>setNewCust({...newCust, productCategory: e.target.value, productModel: ''})}
                     >
                        <option value="">-- اختر المنتج --</option>
                        {(systemSettings.productCategories || []).map((cat, idx) => (
                           <option key={idx} value={cat.name}>{cat.name}</option>
                        ))}
                     </select>
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1">الموديل</label>
                     <select 
                       disabled={!newCust.productCategory} 
                       className="w-full border border-indigo-100 dark:border-indigo-800 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:opacity-60" 
                       value={newCust.productModel} 
                       onChange={e=>setNewCust({...newCust, productModel: e.target.value})}
                     >
                        <option value="">-- اختر الموديل --</option>
                        {availableModels.map((mod, idx) => (
                           <option key={idx} value={mod}>{mod}</option>
                        ))}
                     </select>
                  </div>
               </div>

              <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800">
  <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-300 mb-3 flex items-center gap-2">
    <Users size={16}/> تعيين المسؤولين
  </h4>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
     
    {/* الفني المختص - ✅ من الإعدادات (systemSettings.technicians) */}
    <div>
      <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-400 mb-1">الفني المختص</label>
      <select 
        className="w-full border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold"
        value={newCust.assignedTechnician}
        onChange={e => setNewCust({...newCust, assignedTechnician: e.target.value})}
      >
        <option value="">-- غير محدد --</option>
        {/* ✅ استخدام systemSettings.technicians من الإعدادات */}
        {(systemSettings.technicians || []).map((tech, idx) => (
          <option key={idx} value={tech}>{tech}</option>
        ))}
      </select>
    </div>
    
    {/* ✅ مركز الصيانة - معدل ليأخذ البيانات من systemSettings.maintenanceCenters */}
    <div>
      <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-400 mb-1">مركز الصيانة</label>
      <select 
        className="w-full border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold"
        value={newCust.assignedMaintenanceCenter}
        onChange={e => setNewCust({...newCust, assignedMaintenanceCenter: e.target.value})}
      >
        <option value="">-- غير محدد --</option>
        {(systemSettings.maintenanceCenters || []).map(center => (
          <option key={center.value || center} value={center.value || center}>
            {center.name || center}
          </option>
        ))}
      </select>
    </div>
    
    {/* الكول سنتر - يبقى كما هو من الموظفين */}
    <div>
      <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-400 mb-1">الكول سنتر</label>
      <select 
        className="w-full border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl focus:border-indigo-500 outline-none bg-white dark:bg-slate-900 text-sm font-bold"
        value={newCust.assignedCallCenter}
        onChange={e => setNewCust({...newCust, assignedCallCenter: e.target.value})}
      >
        <option value="">-- غير محدد --</option>
        {callCenters.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
    
  </div>
</div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">تاريخ الميلاد</label>
                     <input 
                       type="date"
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold" 
                       value={newCust.birthDate} 
                       onChange={e=>setNewCust({...newCust, birthDate: e.target.value})} 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">رقم الهوية</label>
                     <input 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold" 
                       value={newCust.idNumber} 
                       onChange={e=>setNewCust({...newCust, idNumber: e.target.value})} 
                       placeholder="رقم البطاقة" 
                     />
                  </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الوسوم</label>
                  <input 
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold" 
                    value={newCust.tags?.join(', ')} 
                    onChange={e=>setNewCust({...newCust, tags: e.target.value.split(',').map(t => t.trim())})} 
                    placeholder="وسم1, وسم2, وسم3" 
                  />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">العطل / المشكلة</label>
                  <textarea 
                    rows="2" 
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold resize-none" 
                    value={newCust.issue} 
                    onChange={e=>setNewCust({...newCust, issue:e.target.value})} 
                    placeholder="وصف المشكلة التي يواجهها العميل..." 
                  />
               </div>
               
               <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات إضافية</label>
                  <textarea 
                    rows="2"
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none bg-slate-50 dark:bg-slate-900 text-sm font-bold resize-none" 
                    value={newCust.notes} 
                    onChange={e=>setNewCust({...newCust, notes:e.target.value})} 
                    placeholder="أي تفاصيل أخرى..." 
                  />
               </div>

               <div className="flex gap-3 pt-4 border-t">
                  <button 
                    type="submit" 
                    className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-colors flex items-center justify-center gap-2"
                  >
                    <Save size={18}/> حفظ البيانات
                  </button>
                  <button 
                    type="button" 
                    onClick={()=>setShowAddModal(false)} 
                    className="px-6 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3.5 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    إلغاء
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}

      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
              <TrashIcon size={20}/> حذف مجمع للعملاء
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              أنت على وشك حذف <span className="font-bold text-rose-600">{selectedItems.size}</span> عميل بشكل نهائي.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
              هذا الإجراء لا يمكن التراجع عنه. لتأكيد الحذف، اكتب "حذف" في الحقل أدناه.
            </p>
            
            <input
              type="text"
              className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-rose-500 mb-4 bg-white dark:bg-slate-900"
              placeholder="اكتب 'حذف' للتأكيد"
              value={bulkDeleteConfirm}
              onChange={e => setBulkDeleteConfirm(e.target.value)}
            />
            
            <div className="flex gap-2">
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteConfirm !== 'حذف'}
                className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                تأكيد الحذف
              </button>
              <button
                onClick={() => {
                  setShowBulkDeleteModal(false);
                  setBulkDeleteConfirm('');
                }}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-5 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50 dark:bg-slate-900/50">
         <div className="flex items-center gap-2">
           <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
             <Contact className="text-indigo-600" size={20}/> سجل العملاء
           </h2>
           <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-lg text-xs">
             {customers.length} عميل
           </span>
         </div>
         
         <div className="flex flex-wrap gap-2 w-full md:w-auto">
             {selectedItems.size > 0 && appUser.permissions?.deleteCustomer && (
               <button 
                 onClick={() => setShowBulkDeleteModal(true)} 
                 className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center justify-center gap-2"
               >
                 <TrashIcon size={14}/> حذف {selectedItems.size} عميل
               </button>
             )}
             
             <div className="relative flex-1 md:w-48">
                 <Search className="absolute right-3 top-2.5 text-slate-400" size={16}/>
                 <input 
                   className="w-full border border-slate-200 dark:border-slate-700 py-2 pr-9 pl-3 rounded-lg outline-none text-xs font-bold focus:border-indigo-500 bg-white dark:bg-slate-900" 
                   placeholder="بحث..." 
                   value={search} 
                   onChange={e=>setSearch(e.target.value)} 
                 />
             </div>
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-900"
               value={filterGovernorate}
               onChange={e => setFilterGovernorate(e.target.value)}
             >
               <option value="">كل المحافظات</option>
               {EGYPT_GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
             </select>
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-900"
               value={filterCity}
               onChange={e => setFilterCity(e.target.value)}
             >
               <option value="">كل المدن</option>
               {cities.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-900"
               value={filterTechnician}
               onChange={e => setFilterTechnician(e.target.value)}
             >
               <option value="">كل الفنيين</option>
               {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
             </select>
             
             <select
               className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-900"
               value={filterTag}
               onChange={e => setFilterTag(e.target.value)}
             >
               <option value="">كل الوسوم</option>
               {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
             </select>
             
             {loadingData && <Loader2 className="animate-spin text-indigo-500 mt-2 sm:mt-0" size={16}/>}
             
             <input
               type="file"
               id="importCustomers"
               accept=".csv"
               className="hidden"
               onChange={handleImportCustomers}
             />
             <button 
               onClick={() => document.getElementById('importCustomers').click()}
               className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-2"
             >
                <UploadCloud size={14}/> استيراد
             </button>
             
             <button 
               onClick={handleExportCustomers}
               className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center gap-2"
             >
                <Download size={14}/> تصدير
             </button>
             
             <button 
               onClick={()=>setShowAddModal(true)} 
               className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-sm whitespace-nowrap"
             >
                <Plus size={14}/> إضافة عميل
             </button>
         </div>
      </div>

      <div className="overflow-x-auto max-h-[70vh] custom-scrollbar">
         <table className="w-full text-right text-sm">
            <thead className="bg-white dark:bg-slate-900 border-b text-slate-500 dark:text-slate-400 font-bold text-[11px] uppercase sticky top-0">
               <tr>
                  <th className="p-4 w-10">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 accent-indigo-600"
                      checked={selectedItems.size === customers.length && customers.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-4">العميل</th>
                  <th className="p-4">الهاتف</th>
                  <th className="p-4">المنتج</th>
                  <th className="p-4">المحافظة</th>
                  <th className="p-4">المدينة</th>
                  <th className="p-4">المسؤولون</th>
                  <th className="p-4">الوسوم</th>
                  <th className="p-4 text-center">المشتريات</th>
                  <th className="p-4 text-center">التذاكر</th>
                  <th className="p-4 text-center">إدارة</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700 font-medium text-xs">
               {customers.length === 0 && !loadingData ? 
                 <tr><td colSpan="11" className="p-10 text-center text-slate-400">لا توجد سجلات للعملاء</td></tr> : 
                 customers.map((c) => (
                   <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                     <td className="p-4">
                       <input 
                         type="checkbox" 
                         className="w-4 h-4 accent-indigo-600"
                         checked={selectedItems.has(c.id)}
                         onChange={() => toggleSelectItem(c.id)}
                       />
                     </td>
                     <td className="p-4">
                        <p className="font-bold text-slate-800 dark:text-white text-sm mb-1">{c.name}</p>
                        {c.email && <p className="text-[9px] text-slate-400">{c.email}</p>}
                     </td>
                     <td className="p-4 font-mono text-slate-600 dark:text-slate-400" dir="ltr">{c.phone}</td>
                     <td className="p-4">
                        {c.productCategory ? (
                           <>
                             <span className="inline-block bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded text-[9px] font-black mb-1">{c.productCategory}</span>
                             <p className="text-slate-600 dark:text-slate-400 text-[10px]">{c.productModel || '-'}</p>
                           </>
                        ) : <span className="text-slate-400">-</span>}
                     </td>
                     <td className="p-4 text-slate-600 dark:text-slate-400">{c.governorate || '-'}</td>
                     <td className="p-4 text-slate-600 dark:text-slate-400">{c.city || '-'}</td>
                     <td className="p-4">
                        <div className="space-y-1">
                           {c.assignedTechnician && <span className="inline-block bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded text-[8px] font-bold ml-1">فني</span>}
                           {c.assignedMaintenanceCenter && <span className="inline-block bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded text-[8px] font-bold ml-1">صيانة</span>}
                           {c.assignedCallCenter && <span className="inline-block bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded text-[8px] font-bold">كول سنتر</span>}
                        </div>
                     </td>
                     <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {(c.tags || []).map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-[8px] font-bold">
                              {tag}
                            </span>
                          ))}
                        </div>
                     </td>
                     <td className="p-4 text-center">
                       <span className="font-bold text-indigo-600 dark:text-indigo-400">{c.totalPurchases || 0}</span>
                     </td>
                     <td className="p-4 text-center">
                       <span className="font-bold text-amber-600 dark:text-amber-400">{c.ticketsCount || 0}</span>
                     </td>
                     <td className="p-4 text-center">
                        <button 
                          onClick={() => setSelectedCustomer(c)} 
                          className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg font-bold text-[10px] hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-100 dark:border-indigo-800 flex items-center gap-1 mx-auto"
                        >
                          <Eye size={12}/> عرض
                        </button>
                     </td>
                   </tr>
                 ))
               }
            </tbody>
         </table>
         {hasMore && !loadingData && customers.length >= 30 && (
             <div className="p-4 text-center bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
                <button 
                  onClick={() => loadCustomers(true)} 
                  className="text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                   تحميل المزيد <ChevronDown size={14}/>
                </button>
             </div>
         )}
      </div>
    </div>
  );
}

// ==========================================================================
// 👤 عرض ملف العميل المحسن مع السجل الكامل والتذاكر
// ==========================================================================
function CustomerProfileView({ customer, onClose, systemSettings, notify, setGlobalLoading, appUser, onCheckoutSuccess }) {
  const [activeTab, setActiveTab] = useState('info'); 
  const [history, setHistory] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({ 
    totalSpent: 0, 
    avgTicket: 0, 
    lastVisit: null, 
    totalTickets: 0,
    totalReturns: 0,
    favoriteProducts: []
  });
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editedData, setEditedData] = useState(customer);
  const [availableTags, setAvailableTags] = useState([]);
  
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [invoice, setInvoice] = useState({ 
    discount: 0, 
    discountType: 'value', 
    taxEnabled: true, 
    installationFeeId: '', 
    technicianName: '',
    paymentMethod: 'cash',
    notes: ''
  });

  useEffect(() => {
    const loadTags = async () => {
      await tagManager.loadTags();
      const tags = tagManager.getTagsByCategory('customer');
      setAvailableTags(tags.map(t => t.name));
    };
    loadTags();
  }, []);

  useEffect(() => {
     if (activeTab === 'history' || activeTab === 'info') {
        const fetchData = async () => {
            setGlobalLoading(true);
            try {
                const q = query(
                  collection(db, 'transactions'),
                  where('phone', '==', customer.phone),
                  where('type', '==', 'sell'),
                  orderBy('timestamp', 'desc'),
                  limit(100)
                );
                const snap = await getDocs(q);
                const transactions = snap.docs.map(d => ({id: d.id, ...d.data()}));
                setHistory(transactions);
                
                const tq = query(
                  collection(db, 'tickets'),
                  where('customerPhone', '==', customer.phone),
                  orderBy("name"),
                  limit(50)
                );
                const tSnap = await getDocs(tq);
                const ticketsData = tSnap.docs.map(d => ({id: d.id, ...d.data()}));
                setTickets(ticketsData);
                
                const total = transactions.reduce((sum, t) => sum + (Number(t.finalTotal) || 0), 0);
                const returns = transactions.filter(t => t.type === 'return').length;
                
                const productCount = {};
                transactions.forEach(t => {
                  if (t.type === 'sell') {
                    productCount[t.itemName] = (productCount[t.itemName] || 0) + 1;
                  }
                });
                
                const favoriteProducts = Object.entries(productCount)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([name, count]) => ({ name, count }));

                setStats({
                  totalSpent: total,
                  avgTicket: transactions.length > 0 ? total / transactions.length : 0,
                  lastVisit: transactions[0]?.timestamp,
                  totalTickets: ticketsData.length,
                  totalReturns: returns,
                  favoriteProducts
                });
                
            } catch(e) {
                console.error(e);
                if (e.code === 'permission-denied') {
                  showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
                } else {
                  showError("فشل جلب السجل: " + e.message);
                }
            }
            setGlobalLoading(false);
        };
        fetchData();
     }
  }, [activeTab, customer.phone, setGlobalLoading]);

  const handleUpdateCustomer = async () => {
    setGlobalLoading(true);
    try {
      await updateDoc(doc(db, 'customers', customer.id), editedData);
      showSuccess("تم تحديث بيانات العميل بنجاح");
      setEditingCustomer(false);
    } catch (error) {
      console.error(error);
      showError("حدث خطأ أثناء تحديث البيانات");
    }
    setGlobalLoading(false);
  };

  const calculations = useMemo(() => {
      const subtotal = cart.reduce(
  (sum, item) => sum + ((Number(item.price) || 0) * (item.quantity || 1)),
  0
   );
      const discountVal = Number(invoice.discount) || 0;
      let discountAmount = 0;
      if (invoice.discountType === 'percent') {
          discountAmount = subtotal * discountVal / 100;
      } else {
          discountAmount = discountVal;
      }
      discountAmount = Math.min(discountAmount, subtotal);

      const taxableAmount = Math.max(0, subtotal - discountAmount);
      const taxRate = Number(systemSettings.taxRate) || 14;
      const taxAmount = invoice.taxEnabled ? (taxableAmount * (taxRate / 100)) : 0;
      const selectedFee = (systemSettings.installationFees || []).find(f => f.id === invoice.installationFeeId);
      const installAmount = Number(selectedFee?.value || 0);

      return {
         subtotal, discountAmount, taxAmount, installAmount,
         finalTotal: Math.round(taxableAmount + taxAmount + installAmount)
      };
  }, [cart, invoice, systemSettings]);

  const handleSearchItem = async (e) => {

  e.preventDefault();

  if (!search.trim()) return;

  setGlobalLoading(true);

  try {

    const searchTerm = normalizeSerial(search);

    const q = query(
      collection(db, 'inventory'),
      where('serialNumber', '==', searchTerm),
      where('isDeleted', '==', false),
      where('quantity', '>', 0)
    );

    const snap = await getDocs(q);

    if (!snap.empty) {

      const item = { id: snap.docs[0].id, ...snap.docs[0].data() };

      const existing = cart.find(i => i.id === item.id);

      if (existing) {
        setCart(cart.map(i =>
          i.id === item.id
            ? { ...i, quantity: (i.quantity || 1) + 1 }
            : i
        ));
      } else {
        setCart([...cart, { ...item, quantity: 1 }]);
      }

      setSearch('');

    } else {

      showError("الباركود غير صحيح أو الكمية غير متوفرة");

    }

  } catch (err) {

    console.error(err);
    showError("خطأ في البحث");

  }

  setGlobalLoading(false);

};

  const handleCheckout = async () => {
      if (cart.length === 0) return showError("يرجى إضافة منتج واحد على الأقل");
      if (calculations.finalTotal < 0) return showError("الإجمالي لا يمكن أن يكون سالباً");

      const confirmed = await showConfirm(
        'تأكيد الفاتورة',
        `هل أنت متأكد من إصدار فاتورة بقيمة ${calculations.finalTotal} ج للعميل ${customer.name}؟`
      );
      
      if (!confirmed) return;

      setGlobalLoading(true);
      const invId = 'INV-' + Date.now().toString().slice(-8);
      try {
         await runTransaction(db, async (t) => {
             const itemRefs = [];
             const itemSnaps = [];
             for (const cartItem of cart) {
                 const ref = doc(db, 'inventory', cartItem.id);
                 itemRefs.push(ref);
                 itemSnaps.push(await t.get(ref));
             }

             itemSnaps.forEach((snap, idx) => {
                 if (!snap.exists() || snap.data().quantity < 1) throw new Error(`المنتج ${cart[idx].name} غير متوفر بالكمية المطلوبة!`);
             });

             itemRefs.forEach((ref, idx) => {
                 const currentQty = itemSnaps[idx].data().quantity;
                 const newQty = currentQty - 1;
                 t.update(ref, { quantity: newQty });
             });

             const joinedNames = cart.map(i => i.name).join(' + ');
             const joinedSerials = cart.map(i => i.serialNumber).join(', ');

             const transRef = doc(collection(db, 'transactions'));
             t.set(transRef, {
                 ...calculations,
                 customerName: customer.name,
                 phone: customer.phone,
                 technicianName: invoice.technicianName,
                 type: 'sell',
                 items: cart, 
                 itemName: joinedNames,
                 serialNumber: joinedSerials,
                 operator: appUser.name || appUser.email,
                 invoiceNumber: invId,
                 paymentMethod: invoice.paymentMethod,
                 notes: invoice.notes,
                 timestamp: serverTimestamp()
             });
             
             const customerRef = doc(db, 'customers', customer.id);
             t.update(customerRef, {
               totalPurchases: increment(1),
               lastPurchase: serverTimestamp()
             });
         });
         
         onCheckoutSuccess({
            customerName: customer.name,
            phone: customer.phone,
            ...invoice,
            ...calculations,
            items: cart,
            invoiceNumber: invId,
            date: new Date().toISOString(),
            operator: appUser.name || appUser.email
         });
         
         showSuccess("تم البيع وإصدار الفاتورة بنجاح");
      } catch(e) {
         console.error(e);
         showError(e.message || "حدث خطأ أثناء إتمام العملية");
      }
      setGlobalLoading(false);
  };

  const handleSendSMS = async () => {
    showInfo("سيتم تفعيل خدمة SMS قريباً");
  };

  const handleSendWhatsApp = () => {
    const message = `مرحباً ${customer.name}،\nنشكرك على تعاملك مع ${systemSettings.storeName}`;
    sendWhatsApp(customer.phone, message);
  };

  return (
      <div className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden text-right flex flex-col max-h-full" dir="rtl">
          <div className="p-6 border-b bg-gradient-to-l from-indigo-600 to-purple-600 text-white">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center text-3xl font-black backdrop-blur-sm">
                  {customer.name?.charAt(0)}
                </div>
                <div>
                  <h2 className="text-2xl font-black mb-1">{customer.name}</h2>
                  <div className="flex items-center gap-3 text-sm opacity-90">
                    <span className="flex items-center gap-1"><Phone size={14}/> {customer.phone}</span>
                    {customer.email && <span>• {customer.email}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(customer.tags || []).map(tag => (
                      <span key={tag} className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleSendWhatsApp}
                  className="p-2 bg-green-500/20 rounded-lg hover:bg-green-500/30 transition-colors"
                  title="إرسال واتساب"
                >
                  <MessageCircle size={18}/>
                </button>
                <button 
                  onClick={handleSendSMS}
                  className="p-2 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition-colors"
                  title="إرسال SMS"
                >
                  <MessageSquare size={18}/>
                </button>
                <button 
                  onClick={() => setEditingCustomer(!editingCustomer)}
                  className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                  title="تعديل البيانات"
                >
                  <Edit size={18}/>
                </button>
                <button onClick={onClose} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                  <X size={20}/>
                </button>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3 mt-4">
              {customer.productCategory && 
                <span className="bg-white/20 px-3 py-1.5 rounded-lg text-sm font-bold backdrop-blur-sm border border-white/30">
                  {customer.productCategory} {customer.productModel && `- ${customer.productModel}`}
                </span>
              }
              {customer.issue && 
                <span className="bg-rose-500/30 px-3 py-1.5 rounded-lg text-sm font-bold backdrop-blur-sm border border-white/30">
                  ⚠️ {customer.issue}
                </span>
              }
            </div>
          </div>

          <div className="flex border-b bg-white dark:bg-slate-800 overflow-x-auto">
              <button 
                onClick={()=>setActiveTab('info')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'info' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
              >
                المعلومات العامة
              </button>
              <button 
                onClick={()=>setActiveTab('new_invoice')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'new_invoice' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
              >
                إصدار فاتورة
              </button>
              <button 
                onClick={()=>setActiveTab('history')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'history' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
              >
                سجل المشتريات
              </button>
              <button 
                onClick={()=>setActiveTab('tickets')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'tickets' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
              >
                تذاكر الصيانة
              </button>
              <button 
                onClick={()=>setActiveTab('analytics')} 
                className={`px-6 py-4 font-black text-sm transition-colors whitespace-nowrap ${activeTab === 'analytics' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
              >
                التحليلات
              </button>
          </div>

          <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              {activeTab === 'info' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl">
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">إجمالي المشتريات</p>
                      <p className="text-xl font-black text-indigo-800 dark:text-indigo-300">{stats.totalSpent.toLocaleString()} ج</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">متوسط الفاتورة</p>
                      <p className="text-xl font-black text-emerald-800 dark:text-emerald-300">{stats.avgTicket.toLocaleString()} ج</p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/30 p-4 rounded-xl">
                      <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">آخر زيارة</p>
                      <p className="text-base font-black text-purple-800 dark:text-purple-300">{formatDate(stats.lastVisit)}</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/30 p-4 rounded-xl">
                      <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">عدد التذاكر</p>
                      <p className="text-xl font-black text-amber-800 dark:text-amber-300">{stats.totalTickets}</p>
                    </div>
                  </div>
                  
                  {stats.favoriteProducts.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                      <h3 className="font-bold mb-3 flex items-center gap-2">
                        <Award size={16} className="text-amber-500"/> المنتجات المفضلة
                      </h3>
                      <div className="space-y-2">
                        {stats.favoriteProducts.map((p, idx) => (
                          <div key={idx} className="flex justify-between items-center">
                            <span className="text-sm">{p.name}</span>
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">تم شراؤها {p.count} مرة</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {editingCustomer ? (
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                      <h3 className="font-bold mb-3 flex items-center gap-2"><Edit size={16}/> تعديل البيانات</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.name}
                          onChange={e => setEditedData({...editedData, name: e.target.value})}
                          placeholder="الاسم"
                        />
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.phone}
                          onChange={e => setEditedData({...editedData, phone: e.target.value})}
                          placeholder="الهاتف"
                        />
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.email || ''}
                          onChange={e => setEditedData({...editedData, email: e.target.value})}
                          placeholder="البريد الإلكتروني"
                        />
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.governorate || ''}
                          onChange={e => setEditedData({...editedData, governorate: e.target.value})}
                          placeholder="المحافظة"
                        />
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.city || ''}
                          onChange={e => setEditedData({...editedData, city: e.target.value})}
                          placeholder="المدينة"
                        />
                        <input
                          className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.address || ''}
                          onChange={e => setEditedData({...editedData, address: e.target.value})}
                          placeholder="العنوان"
                        />
                        <input
                          className="col-span-2 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={(editedData.tags || []).join(', ')}
                          onChange={e => setEditedData({...editedData, tags: e.target.value.split(',').map(t => t.trim())})}
                          placeholder="الوسوم (مفصولة بفواصل)"
                        />
                        <textarea
                          className="col-span-2 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                          value={editedData.notes || ''}
                          onChange={e => setEditedData({...editedData, notes: e.target.value})}
                          placeholder="ملاحظات"
                          rows="2"
                        />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handleUpdateCustomer}
                          className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-indigo-700"
                        >
                          حفظ التعديلات
                        </button>
                        <button
                          onClick={() => {
                            setEditingCustomer(false);
                            setEditedData(customer);
                          }}
                          className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-2 rounded-lg font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                        <h3 className="font-bold mb-3 flex items-center gap-2"><MapPin size={16}/> العنوان</h3>
                        <p className="text-sm">{customer.governorate || 'غير محدد'} {customer.city && `- ${customer.city}`}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{customer.address || 'لا يوجد عنوان مفصل'}</p>
                      </div>
                      
                      {(customer.assignedTechnician || customer.assignedMaintenanceCenter || customer.assignedCallCenter) && (
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                          <h3 className="font-bold mb-3 flex items-center gap-2"><Users size={16}/> المسؤولون</h3>
                          <div className="space-y-2">
                            {customer.assignedTechnician && (
                              <div className="flex items-center gap-2">
                                <HardHat size={14} className="text-amber-600 dark:text-amber-400"/>
                                <span className="text-sm">الفني: {technicians.find(t => t.id === customer.assignedTechnician)?.name || customer.assignedTechnician}</span>
                              </div>
                            )}
                            {customer.assignedMaintenanceCenter && (
                              <div className="flex items-center gap-2">
                                <Wrench size={14} className="text-orange-600 dark:text-orange-400"/>
                                <span className="text-sm">مركز الصيانة: {maintenanceCenters.find(m => m.id === customer.assignedMaintenanceCenter)?.name || customer.assignedMaintenanceCenter}</span>
                              </div>
                            )}
                            {customer.assignedCallCenter && (
                              <div className="flex items-center gap-2">
                                <Headphones size={14} className="text-cyan-600 dark:text-cyan-400"/>
                                <span className="text-sm">الكول سنتر: {callCenters.find(c => c.id === customer.assignedCallCenter)?.name || customer.assignedCallCenter}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {customer.notes && (
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                          <h3 className="font-bold mb-2">ملاحظات</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{customer.notes}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === 'new_invoice' && (
                 <div className="space-y-6">
                    <form onSubmit={handleSearchItem} className="flex gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                       <input 
                         className="flex-1 border-none bg-transparent p-2 outline-none text-lg font-mono text-center tracking-widest text-slate-700 dark:text-slate-300" 
                         placeholder="مرر باركود المنتج..." 
                         value={search} 
                         onChange={e=>setSearch(e.target.value)} 
                         autoFocus 
                       />
                       <button 
                         type="submit" 
                         className="bg-indigo-600 text-white px-6 rounded-lg font-bold text-sm shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2"
                       >
                         <Search size={18}/> بحث
                       </button>
                    </form>

                    {cart.length > 0 && (
                       <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-right text-xs">
                             <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-b font-bold">
                               <tr>
                                 <th className="p-3">الصنف</th>
                                 <th className="p-3 text-center">الكمية</th>
                                 <th className="p-3 text-center">السعر</th>
                                 <th className="p-3 text-center">الإجمالي</th>
                                 <th className="p-3 text-center">إزالة</th>
                               </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {cart.map((item, idx) => (
                                   <tr key={idx} className="bg-white dark:bg-slate-800">
                                      <td className="p-3 font-bold text-slate-800 dark:text-white">
                                        {item.name} <br/>
                                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 inline-block">{item.serialNumber}</span>
                                      </td>
                                      <td className="p-3 text-center font-bold text-slate-600 dark:text-slate-400">1</td>
                                      <td className="p-3 text-center font-black text-indigo-600 dark:text-indigo-400">{item.price * item.quantity} ج</td>
                                      <td className="p-3 text-center font-black text-emerald-600 dark:text-emerald-400">{item.price * item.quantity} ج</td>
                                      <td className="p-3 text-center">
                                        <button 
                                          onClick={() => setCart(cart.filter(i => i.serialNumber !== item.serialNumber))} 
                                          className="text-rose-500 p-1.5 bg-rose-50 dark:bg-rose-900/30 rounded hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors"
                                        >
                                          <Trash2 size={16}/>
                                        </button>
                                      </td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                       </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <div>
                           <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الفني</label>
                           <select 
                             className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none font-bold text-sm bg-white dark:bg-slate-900" 
                             value={invoice.technicianName} 
                             onChange={e=>setInvoice({...invoice, technicianName: e.target.value})}
                           >
                              <option value="">-- بدون فني --</option>
                              {(systemSettings.technicians || []).map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                           </select>
                        </div>
                        <div>
                           <label className="block text-[10px] font-bold text-indigo-900 dark:text-indigo-300 mb-1">الخصم</label>
                           <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-800 overflow-hidden">
                              <input 
                                type="number" 
                                className="flex-1 p-2.5 outline-none font-bold text-center text-rose-600 dark:text-rose-400 text-sm bg-transparent" 
                                value={invoice.discount} 
                                onChange={e=>setInvoice({...invoice, discount: e.target.value})} 
                                min="0" 
                              />
                              <select 
                                className="bg-slate-50 dark:bg-slate-800 px-3 font-bold text-xs border-r border-slate-100 dark:border-slate-700 outline-none" 
                                value={invoice.discountType} 
                                onChange={e=>setInvoice({...invoice, discountType: e.target.value})}
                              >
                                 <option value="value">ج.م</option>
                                 <option value="percent">%</option>
                              </select>
                           </div>
                        </div>
                        <div>
                           <label className="block text-[10px] font-bold text-indigo-900 dark:text-indigo-300 mb-1">الرسوم</label>
                           <select 
                             className="w-full p-2.5 border border-indigo-100 dark:border-indigo-800 rounded-xl bg-white dark:bg-slate-900 font-bold text-xs outline-none focus:border-indigo-500" 
                             value={invoice.installationFeeId} 
                             onChange={e=>setInvoice({...invoice, installationFeeId: e.target.value})}
                           >
                              <option value="">بدون رسوم</option>
                              {(systemSettings.installationFees || []).map(f => <option key={f.id} value={f.id}>{f.label} (+{f.value} ج)</option>)}
                           </select>
                        </div>
                        <div>
                           <label className="block text-[10px] font-bold text-indigo-900 dark:text-indigo-300 mb-1">طريقة الدفع</label>
                           <select 
                             className="w-full p-2.5 border border-indigo-100 dark:border-indigo-800 rounded-xl bg-white dark:bg-slate-900 font-bold text-xs outline-none focus:border-indigo-500" 
                             value={invoice.paymentMethod}
                             onChange={e => setInvoice({...invoice, paymentMethod: e.target.value})}
                           >
                              <option value="cash">نقداً</option>
                              <option value="card">بطاقة</option>
                              <option value="transfer">تحويل بنكي</option>
                           </select>
                        </div>
                        <div className="md:col-span-4">
                           <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                           <input
                             className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl focus:border-indigo-500 outline-none text-sm bg-white dark:bg-slate-900"
                             value={invoice.notes}
                             onChange={e => setInvoice({...invoice, notes: e.target.value})}
                             placeholder="أي ملاحظات إضافية..."
                           />
                        </div>
                    </div>

                    <div className="bg-emerald-900 text-white p-6 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center border-t-4 border-emerald-500 gap-4">
                       <div className="text-right text-xs font-bold text-emerald-100/70 flex flex-wrap gap-4 w-full md:w-auto">
                          <p>المجموع: <span className="text-white text-sm">{calculations.subtotal}</span></p>
                          {calculations.discountAmount > 0 && 
                            <p className="text-rose-300">الخصم: <span>-{calculations.discountAmount.toFixed(1)}</span></p>
                          }
                          <p>الضريبة: <span className="text-white">+{calculations.taxAmount.toFixed(1)}</span></p>
                          {calculations.installAmount > 0 && 
                            <p>رسوم: <span className="text-white">+{calculations.installAmount}</span></p>
                          }
                       </div>
                       <div className="text-center md:text-left w-full md:w-auto">
                          <p className="text-[10px] text-emerald-300 mb-0.5">الصافي للدفع</p>
                          <span className="text-4xl font-black text-emerald-400 tracking-tighter">
                            {calculations.finalTotal.toLocaleString()} <span className="text-sm font-normal">ج.م</span>
                          </span>
                       </div>
                    </div>

                    <button 
                      onClick={handleCheckout} 
                      className="w-full bg-emerald-500 text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-emerald-600 transition-colors flex justify-center items-center gap-2"
                      disabled={cart.length === 0}
                    >
                       <Printer size={24}/> إتمام العملية
                    </button>
                 </div>
              )}

              {activeTab === 'history' && (
                 <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-right text-xs">
                       <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b">
                          <tr>
                            <th className="p-4">رقم الفاتورة</th>
                            <th className="p-4">المنتجات</th>
                            <th className="p-4 text-center">الفني</th>
                            <th className="p-4 text-center">الصافي</th>
                            <th className="p-4">طريقة الدفع</th>
                            <th className="p-4">التاريخ</th>
                            <th className="p-4">ملاحظات</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
                          {history.length === 0 ? 
                            <tr><td colSpan="7" className="p-10 text-center text-slate-400">لا توجد فواتير سابقة</td></tr> :
                             history.map(t => (
                                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                   <td className="p-4 font-mono font-black text-indigo-600 dark:text-indigo-400">{t.invoiceNumber || t.id.slice(0,6)}</td>
                                   <td className="p-4 font-bold text-slate-800 dark:text-white leading-relaxed max-w-xs">
                                     {t.itemName}
                                     {t.serialNumber && <p className="text-[9px] font-mono text-slate-400 dark:text-slate-500 mt-1">{t.serialNumber}</p>}
                                   </td>
                                   <td className="p-4 text-center font-bold text-slate-600 dark:text-slate-400">{t.technicianName || '-'}</td>
                                   <td className="p-4 text-center font-black text-emerald-600 dark:text-emerald-400">{Number(t.finalTotal || t.total || 0).toLocaleString()} ج</td>
                                   <td className="p-4 text-center text-slate-600 dark:text-slate-400">
                                     {t.paymentMethod === 'cash' ? 'نقداً' : 
                                      t.paymentMethod === 'card' ? 'بطاقة' : 
                                      t.paymentMethod === 'transfer' ? 'تحويل' : '-'}
                                   </td>
                                   <td className="p-4 text-slate-500 dark:text-slate-400 text-[10px]">{formatDate(t.timestamp)}</td>
                                   <td className="p-4 text-slate-400 text-[9px] max-w-[100px] truncate">{t.notes || '-'}</td>
                                </tr>
                             ))
                          }
                       </tbody>
                    </table>
                 </div>
              )}

              {activeTab === 'tickets' && (
                 <div className="space-y-4">
                    {tickets.length === 0 ? (
                      <div className="text-center p-8 text-slate-400">
                        <MessageSquare size={48} className="mx-auto mb-3 opacity-20"/>
                        <p>لا توجد تذاكر صيانة لهذا العميل</p>
                      </div>
                    ) : (
                      tickets.map(ticket => (
                        <TicketCard
                          key={ticket.id}
                          ticket={ticket}
                          onStatusChange={() => {}}
                          onView={() => {}}
                          onEdit={(t)=>setEditingTicket(t)}
                        />
                      ))
                    )}
                 </div>
              )}

              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                      <h3 className="font-bold mb-3">تحليل المشتريات</h3>
                      <AdvancedCharts 
                        data={history.map(h => ({
                          name: formatDate(h.timestamp).split(' ')[0],
                          value: Number(h.finalTotal || 0)
                        })).slice(0, 10)}
                        type="line"
                        height={200}
                      />
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                      <h3 className="font-bold mb-3">توزيع المشتريات</h3>
                      <AdvancedCharts 
                        data={[
                          { name: 'نقداً', value: history.filter(h => h.paymentMethod === 'cash').length },
                          { name: 'بطاقة', value: history.filter(h => h.paymentMethod === 'card').length },
                          { name: 'تحويل', value: history.filter(h => h.paymentMethod === 'transfer').length }
                        ]}
                        type="pie"
                        height={200}
                      />
                    </div>
                  </div>
                </div>
              )}
          </div>
      </div>
  );
}
// ==========================================================================
// 🎫 مكون عرض التذكرة في القائمة
// ==========================================================================
function TicketCard({ ticket, onStatusChange, onView, onEdit }) {
  const statusInfo = TICKET_STATUSES.find(s => s.value === ticket.status) || { label: ticket.status, color: 'gray' };
  
  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'high': return 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      case 'medium': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'low': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-all">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400">#{ticket.ticketNumber}</span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${getPriorityColor(ticket.priority)}`}>
              {ticket.priority === 'high' ? 'عالية' : ticket.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
            </span>
          </div>
          <h4 className="font-bold text-slate-800 dark:text-white">{ticket.customerName}</h4>
        </div>
        <span className={`px-2 py-1 rounded-full text-[9px] font-bold bg-${statusInfo.color}-100 dark:bg-${statusInfo.color}-900/30 text-${statusInfo.color}-700 dark:text-${statusInfo.color}-300 border border-${statusInfo.color}-200 dark:border-${statusInfo.color}-800`}>
          {statusInfo.label}
        </span>
      </div>
      
      <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 mb-4">
        <p className="flex items-center gap-1">
          <Phone size={12} className="text-slate-400" />
          {ticket.customerPhone}
        </p>
        {ticket.deviceType && (
          <p className="flex items-center gap-1">
            <HardHat size={12} className="text-slate-400" />
            {ticket.deviceType} {ticket.deviceModel && `- ${ticket.deviceModel}`}
            {ticket.deviceSerial && ` (${ticket.deviceSerial})`}
          </p>
        )}
        <p className="flex items-center gap-1">
          <AlertCircle size={12} className="text-slate-400" />
          {ticket.issue?.substring(0, 50)}{ticket.issue?.length > 50 ? '...' : ''}
        </p>
      </div>
      
      <div className="flex justify-between items-center">
        <div className="text-[9px] text-slate-400">
          <p>تاريخ الإنشاء: {formatDate(ticket.createdAt)}</p>
          {ticket.estimatedCost > 0 && <p>التكلفة: {ticket.estimatedCost} ج</p>}
        </div>
       <div className="flex gap-2">

          <select
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 bg-white dark:bg-slate-900"
            value={ticket.status}
            onChange={(e) => onStatusChange(ticket.id, e.target.value)}
          >
            {TICKET_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <button
            onClick={() => onView(ticket)}
            className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded"
          >
            <Eye size={14} />
          </button>

          <button
            onClick={() => onEdit(ticket)}
            className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded"
          >
            <Edit size={14} />
          </button>

        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// 🎫 مدير التذاكر المحسن مع فتح كامل للتذكرة وإدارة متكاملة
// ==========================================================================

// ==========================================================================
// 🎫 مدير التذاكر المحسن - كامل مع كل الإضافات
// ==========================================================================
// ==========================================================================
// 🎫 مدير التذاكر المحسن - كامل مع كل الإضافات (النظام الجديد 5 مستويات)
// ==========================================================================
// ==========================================================================
// 🎫 مدير التذاكر المحسن - كامل مع كل الإضافات
// ==========================================================================
function EnhancedTicketManager({ systemSettings, notify, setGlobalLoading, appUser, warehouseMap, onGenerateInvoice }) {
  const [tickets, setTickets] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 700);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showSparePartsModal, setShowSparePartsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [ticketHistory, setTicketHistory] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignData, setAssignData] = useState({ technician: '', center: '', callCenter: '' });
  const [showFullTicketModal, setShowFullTicketModal] = useState(false);
  const [fullTicketView, setFullTicketView] = useState(null);
  const [ticketComments, setTicketComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // STATE لإدارة التعديل
  const [editingTicket, setEditingTicket] = useState(null);
  const [editFormData, setEditFormData] = useState({
    id: '', ticketNumber: '', customerName: '', customerPhone: '', secondPhone: '', landline: '',
    customerEmail: '', customerAddress: '', governorate: '', city: '', device: '', deviceType: '',
    deviceModel: '', deviceSerial: '', issue: '', status: '', priority: '', warrantyStatus: '',
    warrantyPeriod: '', ticketType: '', source: '', nearestBranch: '', assignedTechnician: '',
    assignedMaintenanceCenter: '', assignedCallCenter: '', estimatedCost: 0, estimatedDuration: '',
    notes: '', tags: [], sparePartsWithCost: '', sparePartsWithoutCost: '', invoiceDate: '',
    deliveryDate: '', maintenanceEndDate: '', maintenanceEndTime: '',
    deliveryTime: ''
  });

  // النظام الجديد (5 مستويات)
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedMainFaultId, setSelectedMainFaultId] = useState('');
  const [selectedSubFaultId, setSelectedSubFaultId] = useState('');
  
  const [products, setProducts] = useState([]);
  const [models, setModels] = useState([]);
  const [mainFaults, setMainFaults] = useState([]);
  const [subFaults, setSubFaults] = useState([]);

  // باقي الـ State
  const [technicians, setTechnicians] = useState([]);
  const [maintenanceCenters, setMaintenanceCenters] = useState([]);
  const [callCenters, setCallCenters] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  const [filterWarranty, setFilterWarranty] = useState('all');
  const [filterTicketType, setFilterTicketType] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  
  // بيانات التذكرة الجديدة
  const [newTicket, setNewTicket] = useState({
    customerId: '', customerName: '', customerPhone: '', secondPhone: '', landline: '',
    customerEmail: '', customerAddress: '', governorate: '', city: '',
    device: '', deviceType: '', deviceModel: '', deviceSerial: '',
    mainFaultCode: '', mainFaultDescription: '',
    subFaultCode: '', subFaultDescription: '',
    productCode: '',
    issue: '', status: 'created', priority: 'medium',
    warrantyStatus: '', warrantyPeriod: '', ticketType: '', source: '', nearestBranch: '',
    assignedTechnician: '', assignedMaintenanceCenter: '', assignedCallCenter: '',
    estimatedCost: 0, estimatedDuration: '', notes: '', spareParts: [], tags: [],
    sparePartsWithCost: '', sparePartsWithoutCost: '',
    invoiceDate: '', deliveryDate: '', maintenanceEndDate: '', maintenanceEndTime: '',
    deliveryDate: '',
    deliveryTime: ''
  });

  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterTechnician, setFilterTechnician] = useState('all');
  const [filterTag, setFilterTag] = useState('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // ========== الثوابت ==========
  const WARRANTY_PERIODS = [
    { value: '6_months', label: '6 شهور' }, { value: '1_year', label: 'سنة' },
    { value: '2_years', label: 'سنتين' }, { value: '3_years', label: '3 سنوات' },
    { value: '5_years', label: '5 سنوات' }
  ];

  const TICKET_TYPES = [
    { value: 'complaint', label: 'شكوى' }, { value: 'inquiry', label: 'استفسار' },
    { value: 'spare_parts', label: 'قطع غيار' }, { value: 'replacement', label: 'طلب استبدال' },
    { value: 'purchase', label: 'طلب شراء' }, { value: 'after_sales', label: 'ما بعد البيع' },
    { value: 'maintenance', label: 'صيانة' }
  ];

  const TICKET_SOURCES = [
    { value: 'hotline', label: 'HOTLINE' }, { value: 'facebook', label: 'Facebook' },
    { value: 'whatsapp', label: 'WhatsApp' }, { value: 'friend_referral', label: 'اقتراح صديق' },
    { value: 'store_visit', label: 'زيارة المتجر' }, { value: 'phone_call', label: 'مكالمة هاتفية' }
  ];

  const WARRANTY_OPTIONS = [
    { value: 'in_warranty', label: 'داخل الضمان' }, { value: 'out_of_warranty', label: 'خارج الضمان' }
  ];

  const BRANCH_OPTIONS = systemSettings?.branches || [{ value: 'main', label: 'الفرع الرئيسي' }];

  // ========== تحميل المنتجات والموديلات وأكواد الأعطال ==========
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error loading products:", error);
      }
    };
    loadProducts();
  }, []);

  useEffect(() => {
    if (!selectedProductId) {
      setModels([]);
      setSelectedModelId('');
      return;
    }
    const q = query(collection(db, 'models'), where('productId', '==', selectedProductId));
    const unsub = onSnapshot(q, (snap) => {
      setModels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedProductId]);

  useEffect(() => {
    if (!selectedModelId) {
      setMainFaults([]);
      setSelectedMainFaultId('');
      return;
    }
    const q = query(collection(db, 'mainFaultCodes'), where('modelId', '==', selectedModelId));
    const unsub = onSnapshot(q, (snap) => {
      setMainFaults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedModelId]);

  useEffect(() => {
    if (!selectedMainFaultId) {
      setSubFaults([]);
      setSelectedSubFaultId('');
      return;
    }
    const q = query(collection(db, 'subFaultCodes'), where('mainFaultId', '==', selectedMainFaultId));
    const unsub = onSnapshot(q, (snap) => {
      setSubFaults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [selectedMainFaultId]);

  const handleSelectSubFault = (subFaultId) => {
    const selected = subFaults.find(f => f.id === subFaultId);
    if (selected) {
      setSelectedSubFaultId(subFaultId);
      const mainFault = mainFaults.find(m => m.id === selectedMainFaultId);
      setNewTicket(prev => ({
        ...prev,
        mainFaultCode: mainFault?.code || '',
        mainFaultDescription: mainFault?.description || '',
        subFaultCode: selected.code,
        subFaultDescription: selected.description,
        productCode: selected.productCode || '',
        issue: `${selected.code} - ${selected.description}`
      }));
    }
  };

  const resetSelections = () => {
    setSelectedProductId('');
    setSelectedModelId('');
    setSelectedMainFaultId('');
    setSelectedSubFaultId('');
  };

  // ========== جلب العملاء ==========
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const snap = await getDocs(collection(db, "customers"));
        setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error loading customers:", error);
      }
    };
    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const term = normalizeSearch(customerSearch);
    return customers.filter(c => 
      normalizeSearch(c.name || '').includes(term) || 
      normalizeSearch(c.phone || '').includes(term)
    ).slice(0, 8);
  }, [customerSearch, customers]);

  const selectCustomer = (customer) => {
    setNewTicket({
      ...newTicket,
      customerId: customer.id,
      customerName: customer.name || '',
      customerPhone: customer.phone || '',
      secondPhone: customer.secondPhone || '',
      customerEmail: customer.email || '',
      customerAddress: customer.address || '',
      landline: customer.landline || '',
      governorate: customer.governorate || '',
      city: customer.city || ''
    });
    setCustomerSearch('');
    setShowCustomerDropdown(false);
    showSuccess(`تم تحميل بيانات العميل: ${customer.name}`);
  };

  // ========== جلب الفنيين ومراكز الصيانة من systemSettings ==========
  useEffect(() => {
    setTechnicians(systemSettings?.technicians || []);
    
    const centers = (systemSettings?.maintenanceCenters || []).map(center => 
      typeof center === 'string' ? { id: center, name: center, value: center } : center
    );
    setMaintenanceCenters(centers);
    
    const fetchCallCenters = async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'employees'), 
          where('role', '==', 'call_center'), 
          where('isDisabled', '==', false)
        ));
        setCallCenters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching call centers:", error);
        setCallCenters([]);
      }
    };
    fetchCallCenters();
  }, [systemSettings]);

  // ========== تحميل التذاكر ==========
  const loadTickets = useCallback(async (isNextPage = false) => {
  setLoadingData(true);
  try {
    let constraints = [orderBy('createdAt', 'desc')];

    // ✅ التحكم في البيانات حسب صلاحيات المستخدم
    if (appUser.role !== 'admin' && !appUser.permissions?.viewAllWarehouses) {
      constraints.push(where('assignedCenter', '==', appUser.assignedWarehouseId || 'main'));
    }

    // الفلاتر المحددة من قبل المستخدم
    if (filterStatus !== 'all') constraints.push(where('status', '==', filterStatus));
    if (filterPriority !== 'all') constraints.push(where('priority', '==', filterPriority));
    if (isNextPage && lastDoc) constraints.push(startAfter(lastDoc));
    constraints.push(limit(30));

    let q = query(collection(db, 'tickets'), ...constraints);
    const snap = await getDocs(q);
    let fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // الفلاتر المحلية
    if (filterWarranty !== 'all') {
      fetched = fetched.filter(t => t.warrantyStatus === filterWarranty);
    }
    if (filterTicketType !== 'all') {
      fetched = fetched.filter(t => t.ticketType === filterTicketType);
    }
    if (filterSource !== 'all') {
      fetched = fetched.filter(t => t.source === filterSource);
    }
    if (filterBranch !== 'all') {
      fetched = fetched.filter(t => t.nearestBranch === filterBranch);
    }
    if (filterTechnician !== 'all') {
      fetched = fetched.filter(t => t.assignedTechnician === filterTechnician);
    }
    
    // ✅ البحث الشامل (يشمل الفني ومركز الصيانة)
    const term = normalizeSearch(debouncedSearch);
    if (term) {
      fetched = fetched.filter(t =>
        normalizeSearch(t.customerName || '').includes(term) ||
        normalizeSearch(t.customerPhone || '').includes(term) ||
        normalizeSearch(t.ticketNumber || '').includes(term) ||
        normalizeSearch(t.assignedTechnician || '').includes(term) ||
        normalizeSearch(t.assignedMaintenanceCenter || '').includes(term)
      );
    }

    // فلترة التاريخ
    if (dateRange.from) {
      const fromDate = new Date(dateRange.from);
      fromDate.setHours(0, 0, 0, 0);
      fetched = fetched.filter(t => {
        const d = t.createdAt?.toDate?.() || new Date(t.createdAt);
        return d >= fromDate;
      });
    }
    if (dateRange.to) {
      const toDate = new Date(dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      fetched = fetched.filter(t => {
        const d = t.createdAt?.toDate?.() || new Date(t.createdAt);
        return d <= toDate;
      });
    }

    if (isNextPage) {
      setTickets(prev => [...prev, ...fetched]);
    } else {
      setTickets(fetched);
    }
    
    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    setHasMore(snap.docs.length === 30);
  } catch (e) {
    console.error(e);
    showError("فشل جلب التذاكر: " + e.message);
  }
  setLoadingData(false);
}, [appUser, debouncedSearch, filterStatus, filterPriority, filterWarranty, 
    filterTicketType, filterSource, filterBranch, filterTechnician, lastDoc, dateRange]);


  useEffect(() => {
    loadTickets(false);
  }, [loadTickets]);

  // ========== دوال التحديد ==========
  const toggleSelectItem = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === tickets.length && tickets.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(tickets.map(t => t.id)));
    }
  };

  // ========== فتح التذكرة كاملة ==========
  const openFullTicket = (ticket) => {
    setFullTicketView(ticket);
    setTicketComments(ticket.comments || []);
    setNewComment('');
    setEditingCommentId(null);
    setEditingCommentText('');
    setShowFullTicketModal(true);
  };

  // ========== التعليقات ==========
  const addComment = async () => {
    if (!newComment.trim() || !fullTicketView) return;
    
    const comment = {
      id: Date.now().toString(),
      text: newComment,
      createdAt: new Date().toISOString(),
      createdBy: appUser.name,
      createdById: appUser.id
    };
    
    const updated = [...ticketComments, comment];
    setTicketComments(updated);
    setNewComment('');
    
    try {
      await updateDoc(doc(db, 'tickets', fullTicketView.id), { 
        comments: updated, 
        updatedAt: serverTimestamp() 
      });
      showSuccess("تم إضافة التعليق");
    } catch(e) { 
      console.error(e); 
      showError("فشل إضافة التعليق"); 
    }
  };

  const editComment = async (commentId) => {
    if (!editingCommentText.trim() || !fullTicketView) return;
    
    const updated = ticketComments.map(c => 
      c.id === commentId ? { ...c, text: editingCommentText, editedAt: new Date().toISOString() } : c
    );
    
    setTicketComments(updated);
    setEditingCommentId(null);
    setEditingCommentText('');
    
    try {
      await updateDoc(doc(db, 'tickets', fullTicketView.id), { 
        comments: updated, 
        updatedAt: serverTimestamp() 
      });
      showSuccess("تم تعديل التعليق");
    } catch(e) { 
      console.error(e); 
      showError("فشل تعديل التعليق");
    }
  };

  const deleteComment = async (commentId) => {
    const confirmed = await showConfirm('تأكيد الحذف', 'هل أنت متأكد من حذف هذا التعليق؟');
    if (!confirmed) return;
    
    const updated = ticketComments.filter(c => c.id !== commentId);
    setTicketComments(updated);
    
    try {
      await updateDoc(doc(db, 'tickets', fullTicketView.id), { 
        comments: updated, 
        updatedAt: serverTimestamp() 
      });
      showSuccess("تم حذف التعليق");
    } catch(e) { 
      console.error(e); 
      showError("فشل حذف التعليق");
    }
  };

  // ========== إضافة تذكرة ==========
  const handleAddTicket = async (e) => {
    e.preventDefault();
    
    if (!newTicket.customerName || !newTicket.customerPhone) {
      showError("اسم العميل ورقم الهاتف مطلوبان");
      return;
    }

    setGlobalLoading(true);
    
    try {
      let customerId = newTicket.customerId;
      
      if (!customerId && newTicket.customerPhone) {
        const q = query(collection(db, "customers"), where("phone", "==", newTicket.customerPhone));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          customerId = snap.docs[0].id;
        } else {
          const newCustomerRef = await addDoc(collection(db, "customers"), {
            name: newTicket.customerName,
            phone: newTicket.customerPhone,
            secondPhone: newTicket.secondPhone || '',
            landline: newTicket.landline || '',
            email: newTicket.customerEmail || "",
            address: newTicket.customerAddress || '',
            governorate: newTicket.governorate || '',
            city: newTicket.city || '',
            createdAt: serverTimestamp(),
            searchKey: normalizeSearch(`${newTicket.customerName} ${newTicket.customerPhone}`),
            ticketsCount: 0
          });
          customerId = newCustomerRef.id;
        }
      }

      const fullIssue = newTicket.issue || 
        (newTicket.subFaultCode ? `${newTicket.subFaultCode} - ${newTicket.subFaultDescription}` : '');

      const ticketData = {
        ...newTicket,
        customerId,
        issue: fullIssue,
        ticketNumber: 'TKT-' + Date.now().toString().slice(-8),
        assignedCenter: appUser?.assignedWarehouseId || "main",
        spareParts: [],
        totalCost: 0,
        totalPaid: 0,
        remaining: 0,
        comments: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: appUser.id,
        createdByName: appUser.name,
        statusHistory: [{ status: 'created', timestamp: new Date().toISOString(), by: appUser.name }],
        history: [{ action: 'إنشاء تذكرة', timestamp: new Date().toISOString(), by: appUser.name }]
      };

      const docRef = await addDoc(collection(db, 'tickets'), ticketData);
      
      setFullTicketView({ id: docRef.id, ...ticketData });
      setShowFullTicketModal(true);

      if (customerId) {
        await updateDoc(doc(db, 'customers', customerId), {
          ticketsCount: increment(1),
          lastTicket: serverTimestamp()
        });
      }

      showSuccess("تم إنشاء التذكرة بنجاح");
      setShowAddModal(false);
      resetNewTicket();
      resetSelections();
      setLastDoc(null);
      loadTickets(false);
    } catch (error) {
      console.error(error);
      showError("حصل خطأ أثناء إنشاء التذكرة: " + error.message);
    }
    
    setGlobalLoading(false);
  };

  const resetNewTicket = () => {
    setNewTicket({
      customerId: '', customerName: '', customerPhone: '', secondPhone: '', landline: '',
      customerEmail: '', customerAddress: '', governorate: '', city: '',
      device: '', deviceType: '', deviceModel: '', deviceSerial: '',
      mainFaultCode: '', mainFaultDescription: '',
      subFaultCode: '', subFaultDescription: '',
      productCode: '', issue: '',
      status: 'created', priority: 'medium',
      warrantyStatus: '', warrantyPeriod: '', ticketType: '', source: '', nearestBranch: '',
      assignedTechnician: '', assignedMaintenanceCenter: '', assignedCallCenter: '',
      estimatedCost: 0, estimatedDuration: '', notes: '', spareParts: [], tags: [],
      sparePartsWithCost: '', sparePartsWithoutCost: '',
      invoiceDate: '', deliveryDate: '', maintenanceEndDate: '',
      maintenanceEndTime: '',
      deliveryDate: '',
      deliveryTime: ''
    });
  };

  // ========== تحديث حالة التذكرة ==========
  const handleUpdateStatus = async (ticketId, newStatus) => {
    setGlobalLoading(true);
    
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const snap = await getDoc(ticketRef);
      const current = snap.data();
      
      const statusHistory = [...(current.statusHistory || []), {
        status: newStatus,
        timestamp: new Date().toISOString(),
        by: appUser.name
      }];
      
      const history = [...(current.history || []), {
        action: `تغيير الحالة إلى ${TICKET_STATUSES.find(s => s.value === newStatus)?.label || newStatus}`,
        timestamp: new Date().toISOString(),
        by: appUser.name
      }];
      
      await updateDoc(ticketRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
        statusHistory,
        history
      });
      
      showSuccess("تم تحديث حالة التذكرة");

      if (fullTicketView?.id === ticketId) {
        setFullTicketView({ ...fullTicketView, status: newStatus, statusHistory, history });
      }
      
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));
    } catch(e) {
      showError("فشل تحديث الحالة: " + e.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== إضافة قطعة غيار ==========
  const handleAddSparePart = async (ticketId, part) => {
    setGlobalLoading(true);
    
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const snap = await getDoc(ticketRef);
      const current = snap.data();
      
      const spareParts = [...(current.spareParts || []), {
        ...part,
        id: Date.now().toString(),
        addedAt: new Date().toISOString(),
        addedBy: appUser.name
      }];
      
      const totalCost = (current.totalCost || 0) + (part.price * part.quantity);
      const remaining = totalCost - (current.totalPaid || 0);
      
      const history = [...(current.history || []), {
        action: `إضافة قطعة غيار: ${part.name} (${part.quantity} x ${part.price} ج)`,
        timestamp: new Date().toISOString(),
        by: appUser.name
      }];

      await updateDoc(ticketRef, {
        spareParts,
        totalCost,
        remaining,
        updatedAt: serverTimestamp(),
        history
      });
      
      showSuccess("تم إضافة قطعة الغيار");

      if (fullTicketView?.id === ticketId) {
        setFullTicketView({ ...fullTicketView, spareParts, totalCost, remaining, history });
      }
    } catch(e) {
      showError("فشل إضافة قطعة الغيار: " + e.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== إضافة دفعة ==========
  const handleAddPayment = async (ticketId, amount) => {
    setGlobalLoading(true);
    
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const snap = await getDoc(ticketRef);
      const current = snap.data();
      
      const totalPaid = (current.totalPaid || 0) + amount;
      const remaining = (current.totalCost || 0) - totalPaid;
      
      const history = [...(current.history || []), {
        action: `إضافة دفعة: ${amount} ج`,
        timestamp: new Date().toISOString(),
        by: appUser.name
      }];

      await updateDoc(ticketRef, {
        totalPaid,
        remaining,
        updatedAt: serverTimestamp(),
        history
      });
      
      showSuccess("تم إضافة الدفعة بنجاح");

      if (fullTicketView?.id === ticketId) {
        setFullTicketView({ ...fullTicketView, totalPaid, remaining, history });
      }
    } catch(e) {
      showError("فشل إضافة الدفعة: " + e.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== تعيين المسؤولين ==========
  const handleAssign = async (ticketId) => {
    setGlobalLoading(true);
    
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const snap = await getDoc(ticketRef);
      const currentHistory = snap.data().history || [];
      const history = [];
      const updates = {};

      if (assignData.technician) {
        updates.assignedTechnician = assignData.technician;
        history.push({
          action: `تعيين الفني: ${assignData.technician}`,
          timestamp: new Date().toISOString(),
          by: appUser.name
        });
      }
      
      if (assignData.center) {
        updates.assignedMaintenanceCenter = assignData.center;
        history.push({
          action: `تعيين مركز صيانة: ${assignData.center}`,
          timestamp: new Date().toISOString(),
          by: appUser.name
        });
      }
      
      if (assignData.callCenter) {
        const selectedCall = callCenters.find(c => c.id === assignData.callCenter);
        updates.assignedCallCenter = selectedCall ? selectedCall.name : assignData.callCenter;
        history.push({
          action: `تعيين كول سنتر: ${updates.assignedCallCenter}`,
          timestamp: new Date().toISOString(),
          by: appUser.name
        });
      }

      await updateDoc(ticketRef, {
        ...updates,
        updatedAt: serverTimestamp(),
        history: [...currentHistory, ...history]
      });
      
      showSuccess("تم تعيين المسؤولين بنجاح");
      setShowAssignModal(false);
      setAssignData({ technician: '', center: '', callCenter: '' });

      if (fullTicketView?.id === ticketId) {
        setFullTicketView({ ...fullTicketView, ...updates, history: [...(fullTicketView.history || []), ...history] });
      }
      
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, ...updates } : t));
    } catch(e) {
      showError("فشل تعيين المسؤولين: " + e.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== إنشاء فاتورة ==========
  const handleGenerateInvoice = (ticket) => {
    if (onGenerateInvoice) {
      onGenerateInvoice({
        ...ticket,
        customerName: ticket.customerName,
        customerPhone: ticket.customerPhone,
        items: ticket.spareParts?.map(p => ({ name: p.name, price: p.price, quantity: p.quantity })) || [],
        totalCost: ticket.totalCost || 0
      });
    } else {
      showInfo("سيتم إضافة وظيفة إنشاء الفاتورة قريباً");
    }
  };

  // ========== حذف مجمع ==========
  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      showError("لم يتم تحديد أي تذاكر");
      return;
    }
    
    if (bulkDeleteConfirm !== 'حذف') {
      showError("اكتب 'حذف' للتأكيد");
      return;
    }

    const confirmed = await showConfirm('تأكيد الحذف', `هل أنت متأكد من حذف ${selectedItems.size} تذكرة بشكل نهائي؟`);
    if (!confirmed) return;

    setGlobalLoading(true);
    
    try {
      const items = Array.from(selectedItems);
      
      for (let i = 0; i < items.length; i += 400) {
        const batch = writeBatch(db);
        items.slice(i, i + 400).forEach(id => batch.delete(doc(db, 'tickets', id)));
        await batch.commit();
      }
      
      showSuccess(`تم حذف ${items.length} تذكرة`);
      setSelectedItems(new Set());
      setShowBulkDeleteModal(false);
      setBulkDeleteConfirm('');
      setLastDoc(null);
      loadTickets(false);
    } catch(e) {
      showError("فشل الحذف: " + e.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== عرض السجل ==========
  const handleViewHistory = (ticket) => {
    setSelectedTicket(ticket);
    setTicketHistory(ticket.history || []);
    setShowHistoryModal(true);
  };

  // ========== دوال التعديل ==========
  const openEditModal = (ticket) => {
    setEditingTicket(ticket);
    setEditFormData({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber || '',
      customerName: ticket.customerName || '',
      customerPhone: ticket.customerPhone || '',
      secondPhone: ticket.secondPhone || '',
      landline: ticket.landline || '',
      customerEmail: ticket.customerEmail || '',
      customerAddress: ticket.customerAddress || '',
      governorate: ticket.governorate || '',
      city: ticket.city || '',
      device: ticket.device || '',
      deviceType: ticket.deviceType || '',
      deviceModel: ticket.deviceModel || '',
      deviceSerial: ticket.deviceSerial || '',
      issue: ticket.issue || '',
      status: ticket.status || 'created',
      priority: ticket.priority || 'medium',
      warrantyStatus: ticket.warrantyStatus || '',
      warrantyPeriod: ticket.warrantyPeriod || '',
      ticketType: ticket.ticketType || '',
      source: ticket.source || '',
      nearestBranch: ticket.nearestBranch || '',
      assignedTechnician: ticket.assignedTechnician || '',
      assignedMaintenanceCenter: ticket.assignedMaintenanceCenter || '',
      assignedCallCenter: ticket.assignedCallCenter || '',
      estimatedCost: ticket.estimatedCost || 0,
      estimatedDuration: ticket.estimatedDuration || '',
      notes: ticket.notes || '',
      tags: ticket.tags || [],
      sparePartsWithCost: ticket.sparePartsWithCost || '',
      sparePartsWithoutCost: ticket.sparePartsWithoutCost || '',
      invoiceDate: ticket.invoiceDate || '',
      deliveryDate: ticket.deliveryDate || '',
      maintenanceEndDate: ticket.maintenanceEndDate || '',
      maintenanceEndTime: ticket.maintenanceEndTime || '',
      deliveryTime: ticket.deliveryTime || ''
    });
  };

  const handleUpdateTicket = async (e) => {
    e.preventDefault();
    if (!editingTicket) return;

    setGlobalLoading(true);
    
    try {
      const ticketRef = doc(db, 'tickets', editingTicket.id);
      
      const updateData = {
        customerName: editFormData.customerName,
        customerPhone: editFormData.customerPhone,
        secondPhone: editFormData.secondPhone,
        landline: editFormData.landline,
        customerEmail: editFormData.customerEmail,
        customerAddress: editFormData.customerAddress,
        governorate: editFormData.governorate,
        city: editFormData.city,
        warrantyStatus: editFormData.warrantyStatus,
        warrantyPeriod: editFormData.warrantyPeriod,
        device: editFormData.device,
        deviceType: editFormData.deviceType,
        deviceModel: editFormData.deviceModel,
        deviceSerial: editFormData.deviceSerial,
        issue: editFormData.issue,
        status: editFormData.status,
        priority: editFormData.priority,
        ticketType: editFormData.ticketType,
        source: editFormData.source,
        nearestBranch: editFormData.nearestBranch,
        assignedTechnician: editFormData.assignedTechnician,
        assignedMaintenanceCenter: editFormData.assignedMaintenanceCenter,
        assignedCallCenter: editFormData.assignedCallCenter,
        estimatedCost: editFormData.estimatedCost,
        estimatedDuration: editFormData.estimatedDuration,
        notes: editFormData.notes,
        tags: editFormData.tags,
        sparePartsWithCost: editFormData.sparePartsWithCost || '',
        sparePartsWithoutCost: editFormData.sparePartsWithoutCost || '',
        invoiceDate: editFormData.invoiceDate || '',
        deliveryDate: editFormData.deliveryDate || '',
        maintenanceEndDate: editFormData.maintenanceEndDate || '',
        maintenanceEndTime: editFormData.maintenanceEndTime || '',
        deliveryTime: editFormData.deliveryTime || '',
        updatedAt: serverTimestamp()
      };
      
      const snap = await getDoc(ticketRef);
      const currentHistory = snap.data()?.history || [];
      const history = [...currentHistory, {
        action: 'تعديل بيانات التذكرة',
        timestamp: new Date().toISOString(),
        by: appUser.name,
        details: 'تم تعديل بيانات التذكرة من قبل المستخدم'
      }];
      updateData.history = history;
      
      await updateDoc(ticketRef, updateData);
      showSuccess("تم تحديث التذكرة بنجاح");
      
      setEditingTicket(null);
      setEditFormData({});
      loadTickets(false);
      
      if (fullTicketView?.id === editingTicket.id) {
        setFullTicketView({ ...fullTicketView, ...updateData });
      }
    } catch (error) {
      console.error(error);
      showError("حدث خطأ أثناء تحديث التذكرة: " + error.message);
    }
    
    setGlobalLoading(false);
  };

  // ========== ألوان مساعدة ==========
  const getPriorityColor = (p) => {
    if (p === 'high') return 'text-rose-600 bg-rose-50 dark:bg-rose-900/30';
    if (p === 'medium') return 'text-amber-600 bg-amber-50 dark:bg-amber-900/30';
    return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30';
  };

  const resetFilters = () => {
    setFilterStatus('all');
    setFilterPriority('all');
    setFilterWarranty('all');
    setFilterTicketType('all');
    setFilterSource('all');
    setFilterBranch('all');
    setFilterTechnician('all');
    setFilterTag('all');
    setDateRange({ from: '', to: '' });
    setSearch('');
  };

  const StatusSelectComp = ({ value, onChange, ticketId }) => (
    <select
      className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 bg-white dark:bg-slate-900 font-bold"
      value={value}
      onChange={(e) => onChange(ticketId, e.target.value)}
    >
      {TICKET_STATUSES.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );

  // ====================== RENDER ======================
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden text-right" dir="rtl">
      
      {/* ===== مودال إضافة تذكرة ===== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                <MessageSquare className="text-indigo-600"/> إنشاء تذكرة صيانة جديدة
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-rose-600"><X size={24}/></button>
            </div>
            
            <form onSubmit={handleAddTicket} className="space-y-4">
              {/* البحث عن عميل */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">🔍 البحث عن عميل موجود</label>
                <input 
                  className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500"
                  placeholder="ابحث عن عميل مسجل..."
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                  onFocus={() => setShowCustomerDropdown(true)}
                />
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute z-20 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mt-1 shadow-lg max-h-48 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <button key={c.id} type="button" onClick={() => selectCustomer(c)} className="w-full p-3 text-right hover:bg-slate-50 dark:hover:bg-slate-700 border-b last:border-0">
                        <span className="font-bold block text-sm">{c.name}</span>
                        <span className="text-xs text-slate-500">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* معلومات العميل الأساسية */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">اسم العميل *</label>
                  <input required className="w-full border p-3 rounded-xl text-sm" value={newTicket.customerName} onChange={e => setNewTicket({...newTicket, customerName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">رقم الهاتف *</label>
                  <input required className="w-full border p-3 rounded-xl text-sm font-mono" value={newTicket.customerPhone} onChange={e => setNewTicket({...newTicket, customerPhone: e.target.value})} dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">رقم ثاني</label>
                  <input className="w-full border p-3 rounded-xl text-sm font-mono" value={newTicket.secondPhone} onChange={e => setNewTicket({...newTicket, secondPhone: e.target.value})} dir="ltr" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">تليفون أرضي</label>
                  <input className="w-full border p-3 rounded-xl text-sm font-mono" value={newTicket.landline} onChange={e => setNewTicket({...newTicket, landline: e.target.value})} dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">البريد الإلكتروني</label>
                  <input type="email" className="w-full border p-3 rounded-xl text-sm" value={newTicket.customerEmail} onChange={e => setNewTicket({...newTicket, customerEmail: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">العنوان</label>
                  <input className="w-full border p-3 rounded-xl text-sm" value={newTicket.customerAddress} onChange={e => setNewTicket({...newTicket, customerAddress: e.target.value})} />
                </div>
              </div>

              {/* المحافظة والمدينة */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">المحافظة</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.governorate || ''} onChange={e => setNewTicket({...newTicket, governorate: e.target.value})}>
                    <option value="">-- اختر المحافظة --</option>
                    {EGYPT_GOVERNORATES.map(gov => <option key={gov} value={gov}>{gov}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">المدينة / المنطقة</label>
                  <input className="w-full border p-3 rounded-xl text-sm" value={newTicket.city || ''} onChange={e => setNewTicket({...newTicket, city: e.target.value})} placeholder="مثال: مدينة نصر" />
                </div>
              </div>

              {/* القوائم المتتالية */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl">
                <div>
                  <label className="block text-xs font-bold mb-1 text-indigo-800 dark:text-indigo-300">المنتج</label>
                  <select className="w-full border p-3 rounded-xl text-sm bg-white dark:bg-slate-900" value={selectedProductId} onChange={e => {
                    setSelectedProductId(e.target.value);
                    setSelectedModelId('');
                    setSelectedMainFaultId('');
                    setSelectedSubFaultId('');
                    const product = products.find(p => p.id === e.target.value);
                    setNewTicket(prev => ({ ...prev, device: product?.name || '' }));
                  }}>
                    <option value="">-- اختر المنتج --</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1 text-indigo-800 dark:text-indigo-300">الموديل</label>
                  <select className="w-full border p-3 rounded-xl text-sm bg-white dark:bg-slate-900 disabled:opacity-50" value={selectedModelId} onChange={e => {
                    setSelectedModelId(e.target.value);
                    setSelectedMainFaultId('');
                    setSelectedSubFaultId('');
                    const model = models.find(m => m.id === e.target.value);
                    setNewTicket(prev => ({ ...prev, deviceModel: model?.name || '' }));
                  }} disabled={!selectedProductId}>
                    <option value="">-- اختر الموديل --</option>
                    {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1 text-amber-800 dark:text-amber-300">كود العطل الرئيسي</label>
                  <select className="w-full border p-3 rounded-xl text-sm bg-white dark:bg-slate-900 disabled:opacity-50" value={selectedMainFaultId} onChange={e => {
                    setSelectedMainFaultId(e.target.value);
                    setSelectedSubFaultId('');
                  }} disabled={!selectedModelId}>
                    <option value="">-- اختر الكود الرئيسي --</option>
                    {mainFaults.map(f => <option key={f.id} value={f.id}>{f.code} - {f.description}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1 text-purple-800 dark:text-purple-300">كود العطل الفرعي</label>
                  <select className="w-full border p-3 rounded-xl text-sm bg-white dark:bg-slate-900 disabled:opacity-50" value={selectedSubFaultId} onChange={e => handleSelectSubFault(e.target.value)} disabled={!selectedMainFaultId}>
                    <option value="">-- اختر الكود الفرعي --</option>
                    {subFaults.map(f => (
                      <option key={f.id} value={f.id}>{f.code} - {f.description}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* السيريال */}
              <div>
                <label className="block text-xs font-bold mb-1">السيريال التسلسلي للجهاز</label>
                <input className="w-full border p-3 rounded-xl text-sm font-mono" value={newTicket.deviceSerial} onChange={e => setNewTicket({...newTicket, deviceSerial: e.target.value})} placeholder="السيريال التسلسلي" />
              </div>

              {/* ملاحظات إضافية */}
              <div>
                <label className="block text-xs font-bold mb-1">ملاحظات إضافية</label>
                <textarea rows="2" className="w-full border p-3 rounded-xl text-sm resize-none" value={newTicket.notes} onChange={e => setNewTicket({...newTicket, notes: e.target.value})} placeholder="أي ملاحظات إضافية..." />
              </div>

              {/* الضمان والنوع والمصدر */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">حالة الضمان</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.warrantyStatus || ''} onChange={e => {
                    const newStatus = e.target.value;
                    if (newStatus === 'out_of_warranty') {
                      setNewTicket({ ...newTicket, warrantyStatus: newStatus, warrantyPeriod: 'out_of_warranty' });
                    } else {
                      setNewTicket({ ...newTicket, warrantyStatus: newStatus, warrantyPeriod: '' });
                    }
                  }}>
                    <option value="">-- اختر --</option>
                    <option value="in_warranty">✅ داخل الضمان</option>
                    <option value="out_of_warranty">❌ خارج الضمان</option>
                  </select>
                </div>
                {newTicket.warrantyStatus === 'in_warranty' && (
                  <div>
                    <label className="block text-xs font-bold mb-1">📅 فترة الضمان</label>
                    <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.warrantyPeriod || ''} onChange={e => setNewTicket({...newTicket, warrantyPeriod: e.target.value})}>
                      <option value="">-- اختر الفترة --</option>
                      {WARRANTY_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold mb-1">نوع التذكرة</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.ticketType} onChange={e => setNewTicket({...newTicket, ticketType: e.target.value})}>
                    <option value="">-- اختر --</option>
                    {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">المصدر</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.source} onChange={e => setNewTicket({...newTicket, source: e.target.value})}>
                    <option value="">-- اختر --</option>
                    {TICKET_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* قطع غيار */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">🛠️ قطع غيار بتكلفة</label>
                  <textarea rows="3" className="w-full border p-3 rounded-xl text-sm resize-none" value={newTicket.sparePartsWithCost} onChange={e => setNewTicket({...newTicket, sparePartsWithCost: e.target.value})} placeholder="مثال:&#10;• شاشة - 500 ج&#10;• بطارية - 300 ج" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">🔧 قطع غيار بدون تكلفة</label>
                  <textarea rows="3" className="w-full border p-3 rounded-xl text-sm resize-none" value={newTicket.sparePartsWithoutCost} onChange={e => setNewTicket({...newTicket, sparePartsWithoutCost: e.target.value})} placeholder="مثال:&#10;• سلك شحن&#10;• سماعة" />
                </div>
              </div>

              {/* التواريخ */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">📅 تاريخ الفاتورة / الضمان</label>
                  <input type="date" className="w-full border p-3 rounded-xl text-sm" value={newTicket.invoiceDate} onChange={e => setNewTicket({...newTicket, invoiceDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">⏰ تاريخ انتهاء الصيانة</label>
                  <input type="date" className="w-full border p-3 rounded-xl text-sm" value={newTicket.maintenanceEndDate} onChange={e => setNewTicket({...newTicket, maintenanceEndDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">📦 تاريخ تسليم العميل</label>
                  <input type="date" className="w-full border p-3 rounded-xl text-sm" value={newTicket.deliveryDate} onChange={e => setNewTicket({...newTicket, deliveryDate: e.target.value})} />
                </div>
              </div>

              {/* الفرع والأولوية والتكلفة */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">أقرب فرع</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.nearestBranch} onChange={e => setNewTicket({...newTicket, nearestBranch: e.target.value})}>
                    <option value="">-- اختر --</option>
                    {BRANCH_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">الأولوية</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.priority} onChange={e => setNewTicket({...newTicket, priority: e.target.value})}>
                    <option value="low">منخفضة</option>
                    <option value="medium">متوسطة</option>
                    <option value="high">عالية</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">التكلفة التقديرية</label>
                  <input type="number" min="0" className="w-full border p-3 rounded-xl text-sm text-center" value={newTicket.estimatedCost} onChange={e => setNewTicket({...newTicket, estimatedCost: Number(e.target.value)})} />
                </div>
              </div>

              {/* تعيين مسؤولين */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">الفني المختص</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.assignedTechnician} onChange={e => setNewTicket({...newTicket, assignedTechnician: e.target.value})}>
                    <option value="">-- غير محدد --</option>
                    {(systemSettings?.technicians || []).map((tech, idx) => <option key={idx} value={tech}>{tech}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">مركز الصيانة</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.assignedMaintenanceCenter} onChange={e => setNewTicket({...newTicket, assignedMaintenanceCenter: e.target.value})}>
                    <option value="">-- غير محدد --</option>
                    {(systemSettings?.maintenanceCenters || []).map(center => (
                      <option key={typeof center === 'string' ? center : center.value} value={typeof center === 'string' ? center : center.name}>
                        {typeof center === 'string' ? center : center.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">الكول سنتر</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={newTicket.assignedCallCenter} onChange={e => setNewTicket({...newTicket, assignedCallCenter: e.target.value})}>
                    <option value="">-- غير محدد --</option>
                    {callCenters.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* الوسوم */}
              <div>
                <label className="block text-xs font-bold mb-1">الوسوم</label>
                <input className="w-full border p-3 rounded-xl text-sm" value={newTicket.tags?.join(', ')} onChange={e => setNewTicket({...newTicket, tags: e.target.value.split(',').map(t => t.trim())})} placeholder="وسم1, وسم2" />
              </div>

              {/* الأزرار */}
              <div className="flex gap-3 pt-4 border-t">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                  <Save size={18}/> إنشاء التذكرة
                </button>
                <button type="button" onClick={() => setShowAddModal(false)} className="px-6 bg-slate-100 dark:bg-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== مودال فتح التذكرة كاملة ===== */}
      {showFullTicketModal && fullTicketView && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] w-full max-w-5xl shadow-2xl max-h-[95vh] overflow-y-auto custom-scrollbar">
            <div className="sticky top-0 bg-gradient-to-l from-indigo-600 to-purple-600 p-6 rounded-t-[1.5rem] z-10 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-white/80 text-sm font-mono">#{fullTicketView.ticketNumber}</span>
                    <StatusSelectComp value={fullTicketView.status} onChange={handleUpdateStatus} ticketId={fullTicketView.id} />
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      fullTicketView.priority === 'high' ? 'bg-rose-500 text-white' : 
                      fullTicketView.priority === 'medium' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                    }`}>
                      {fullTicketView.priority === 'high' ? 'عالية' : fullTicketView.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                    </span>
                  </div>
                  <h2 className="text-2xl font-black">{fullTicketView.customerName}</h2>
                </div>
                <button onClick={() => setShowFullTicketModal(false)} className="text-white/70 hover:text-white">
                  <X size={24}/>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* معلومات العميل */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">رقم الهاتف</label>
                  <p className="font-bold font-mono" dir="ltr">{fullTicketView.customerPhone}</p>
                </div>
                {fullTicketView.secondPhone && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                    <label className="text-xs text-slate-500 block mb-1">رقم ثاني</label>
                    <p className="font-bold font-mono" dir="ltr">{fullTicketView.secondPhone}</p>
                  </div>
                )}
                {fullTicketView.landline && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                    <label className="text-xs text-slate-500 block mb-1">أرضي</label>
                    <p className="font-bold font-mono" dir="ltr">{fullTicketView.landline}</p>
                  </div>
                )}
                {fullTicketView.customerEmail && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                    <label className="text-xs text-slate-500 block mb-1">البريد</label>
                    <p className="font-bold text-sm">{fullTicketView.customerEmail}</p>
                  </div>
                )}
              </div>

              {/* الجهاز والضمان */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">الجهاز</label>
                  <p className="font-bold">{fullTicketView.device || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">الموديل</label>
                  <p className="font-bold">{fullTicketView.deviceModel || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">السيريال</label>
                  <p className="font-bold font-mono">{fullTicketView.deviceSerial || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">الضمان</label>
                  <p className="font-bold">{WARRANTY_OPTIONS.find(w => w.value === fullTicketView.warrantyStatus)?.label || '-'}</p>
                </div>
              </div>

              {/* النوع والمصدر والفرع */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">نوع التذكرة</label>
                  <p className="font-bold">{TICKET_TYPES.find(t => t.value === fullTicketView.ticketType)?.label || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">المصدر</label>
                  <p className="font-bold">{TICKET_SOURCES.find(s => s.value === fullTicketView.source)?.label || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">أقرب فرع</label>
                  <p className="font-bold">{BRANCH_OPTIONS.find(b => b.value === fullTicketView.nearestBranch)?.label || '-'}</p>
                </div>
              </div>

              {/* العنوان والمشكلة */}
              {fullTicketView.customerAddress && (
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">العنوان</label>
                  <p className="font-bold">{fullTicketView.customerAddress}</p>
                </div>
              )}
              
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                <label className="text-xs text-slate-500 block mb-1">المشكلة</label>
                <p className="font-bold">{fullTicketView.issue || '-'}</p>
              </div>

              {/* المسؤولون */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">الفني</label>
                  <p className="font-bold">{fullTicketView.assignedTechnician || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">مركز الصيانة</label>
                  <p className="font-bold">{fullTicketView.assignedMaintenanceCenter || '-'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                  <label className="text-xs text-slate-500 block mb-1">الكول سنتر</label>
                  <p className="font-bold">{fullTicketView.assignedCallCenter || '-'}</p>
                </div>
              </div>

              {/* المبالغ */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl">
                  <label className="text-xs block mb-1">التكلفة</label>
                  <p className="font-black text-lg">{(fullTicketView.totalCost || fullTicketView.estimatedCost || 0).toLocaleString()} ج</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl">
                  <label className="text-xs block mb-1">المدفوع</label>
                  <p className="font-black text-lg">{(fullTicketView.totalPaid || 0).toLocaleString()} ج</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl">
                  <label className="text-xs block mb-1">المتبقي</label>
                  <p className="font-black text-lg">{((fullTicketView.totalCost || 0) - (fullTicketView.totalPaid || 0)).toLocaleString()} ج</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-xl">
                  <label className="text-xs block mb-1">قطع الغيار</label>
                  <p className="font-black text-lg">{(fullTicketView.spareParts || []).length}</p>
                </div>
              </div>

              {/* قطع غيار */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {fullTicketView.sparePartsWithCost && (
                  <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                    <label className="text-xs text-amber-600 dark:text-amber-400 block mb-1 font-bold">🛠️ قطع غيار بتكلفة</label>
                    <p className="text-sm whitespace-pre-wrap font-bold">{fullTicketView.sparePartsWithCost}</p>
                  </div>
                )}
                {fullTicketView.sparePartsWithoutCost && (
                  <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-xl border border-green-200 dark:border-green-800">
                    <label className="text-xs text-green-600 dark:text-green-400 block mb-1 font-bold">🔧 قطع غيار بدون تكلفة</label>
                    <p className="text-sm whitespace-pre-wrap font-bold">{fullTicketView.sparePartsWithoutCost}</p>
                  </div>
                )}
              </div>

              {/* التواريخ */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {fullTicketView.invoiceDate && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-xs text-slate-500 block mb-1 font-bold">📅 تاريخ الفاتورة</label>
                    <p className="font-bold">{formatDate(fullTicketView.invoiceDate)}</p>
                  </div>
                )}
                {fullTicketView.maintenanceEndDate && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-xs text-slate-500 block mb-1 font-bold">⏰ تاريخ انتهاء الصيانة</label>
                    <p className="font-bold">{formatDate(fullTicketView.maintenanceEndDate)}</p>
                  </div>
                )}
                {fullTicketView.deliveryDate && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-xs text-slate-500 block mb-1 font-bold">📦 تاريخ تسليم العميل</label>
                    <p className="font-bold">{formatDate(fullTicketView.deliveryDate)}</p>
                  </div>
                )}
              </div>

              {/* التعليقات */}
              <div className="border rounded-xl p-4">
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  <MessageSquare size={18} className="text-indigo-600"/> التعليقات ({ticketComments.length})
                </h3>
                <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                  {ticketComments.map(comment => (
                    <div key={comment.id} className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg">
                      {editingCommentId === comment.id ? (
                        <div className="flex gap-2">
                          <input className="flex-1 border p-2 rounded-lg text-sm" value={editingCommentText} onChange={e => setEditingCommentText(e.target.value)} />
                          <button onClick={() => editComment(comment.id)} className="px-3 py-1 bg-indigo-600 text-white rounded text-xs">حفظ</button>
                          <button onClick={() => { setEditingCommentId(null); setEditingCommentText(''); }} className="px-3 py-1 bg-slate-200 rounded text-xs">إلغاء</button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm">{comment.text}</p>
                          <div className="flex justify-between items-center mt-2">
                            <div>
                              <span className="text-xs text-slate-500">{comment.createdBy}</span>
                              <span className="text-xs text-slate-400 mx-2">•</span>
                              <span className="text-xs text-slate-400">{new Date(comment.createdAt).toLocaleString('ar-EG')}</span>
                              {comment.editedAt && <span className="text-xs text-amber-500 mr-2">(معدل)</span>}
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.text); }} className="text-xs text-indigo-500">تعديل</button>
                              <button onClick={() => deleteComment(comment.id)} className="text-xs text-rose-500">حذف</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 border p-2 rounded-lg text-sm" placeholder="أضف تعليقاً..." value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment(); }} />
                  <button onClick={addComment} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">إضافة</button>
                </div>
              </div>

              {/* أزرار الإجراءات */}
              <div className="flex flex-wrap gap-2 pt-4 border-t">
                <button onClick={() => { setSelectedTicket(fullTicketView); setShowAssignModal(true); }} className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg text-sm font-bold">
                  <Users size={14} className="inline ml-1"/> تعيين مسؤولين
                </button>
                <button onClick={() => { openEditModal(fullTicketView); setShowFullTicketModal(false); }} className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm font-bold">
                  <Edit size={14} className="inline ml-1"/> تعديل التذكرة
                </button>
                <button onClick={() => handleGenerateInvoice(fullTicketView)} className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-bold">
                  <Receipt size={14} className="inline ml-1"/> إنشاء فاتورة
                </button>
                <button onClick={() => window.print()} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-bold">
                  <Printer size={14} className="inline ml-1"/> طباعة
                </button>
                <button onClick={() => setShowFullTicketModal(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-bold">
                  إغلاق
                </button>
              </div>

              <div className="text-xs text-slate-400 space-y-1 border-t pt-4">
                <p>تاريخ الإنشاء: {formatDate(fullTicketView.createdAt)}</p>
                <p>آخر تحديث: {formatDate(fullTicketView.updatedAt)}</p>
                <p>تم الإنشاء بواسطة: {fullTicketView.createdByName}</p>
                <p>المركز: {warehouseMap?.[fullTicketView.assignedCenter] || fullTicketView.assignedCenter}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال تعيين مسؤولين ===== */}
      {showAssignModal && selectedTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white">تعيين مسؤولين للتذكرة #{selectedTicket.ticketNumber}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1">الفني</label>
                <select className="w-full border p-3 rounded-xl bg-white dark:bg-slate-900 font-bold" value={assignData.technician} onChange={e => setAssignData({...assignData, technician: e.target.value})}>
                  <option value="">-- اختر --</option>
                  {technicians.map((tech, idx) => <option key={idx} value={tech}>{tech}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">مركز الصيانة</label>
                <select className="w-full border p-3 rounded-xl bg-white dark:bg-slate-900 font-bold" value={assignData.center} onChange={e => setAssignData({...assignData, center: e.target.value})}>
                  <option value="">-- اختر --</option>
                  {maintenanceCenters.map(center => <option key={center.id} value={center.name}>{center.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">الكول سنتر</label>
                <select className="w-full border p-3 rounded-xl bg-white dark:bg-slate-900 font-bold" value={assignData.callCenter} onChange={e => setAssignData({...assignData, callCenter: e.target.value})}>
                  <option value="">-- اختر --</option>
                  {callCenters.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <button onClick={() => handleAssign(selectedTicket.id)} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold">حفظ</button>
                <button onClick={() => { setShowAssignModal(false); setAssignData({ technician: '', center: '', callCenter: '' }); }} className="flex-1 bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال قطع الغيار ===== */}
      {showSparePartsModal && selectedTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl">قطع غيار التذكرة #{selectedTicket.ticketNumber}</h3>
              <button onClick={() => setShowSparePartsModal(false)} className="hover:text-rose-600"><X size={24}/></button>
            </div>
            <div className="space-y-6">
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr>
                      <th className="p-3">القطعة</th>
                      <th className="p-3 text-center">الكمية</th>
                      <th className="p-3 text-center">السعر</th>
                      <th className="p-3 text-center">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(selectedTicket.spareParts || []).map((p, i) => (
                      <tr key={i}>
                        <td className="p-3 font-bold">{p.name}</td>
                        <td className="p-3 text-center">{p.quantity}</td>
                        <td className="p-3 text-center">{p.price} ج</td>
                        <td className="p-3 text-center font-black">{p.quantity * p.price} ج</td>
                      </tr>
                    ))}
                    {(selectedTicket.spareParts || []).length === 0 && (
                      <tr>
                        <td colSpan="4" className="p-6 text-center text-slate-400">لا توجد قطع غيار</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                <h4 className="font-bold mb-3">إضافة قطعة جديدة</h4>
                <div className="grid grid-cols-4 gap-3">
                  <input className="col-span-2 border p-2 rounded-lg text-sm bg-white dark:bg-slate-900" placeholder="اسم القطعة" id="partName" />
                  <input type="number" className="border p-2 rounded-lg text-sm bg-white dark:bg-slate-900" placeholder="الكمية" id="partQty" defaultValue="1" />
                  <input type="number" className="border p-2 rounded-lg text-sm bg-white dark:bg-slate-900" placeholder="السعر" id="partPrice" />
                </div>
                <button onClick={() => {
                  const name = document.getElementById('partName').value;
                  const qty = parseInt(document.getElementById('partQty').value) || 1;
                  const price = parseFloat(document.getElementById('partPrice').value) || 0;
                  if (!name) return showError("يرجى إدخال اسم القطعة");
                  handleAddSparePart(selectedTicket.id, { name, quantity: qty, price });
                  document.getElementById('partName').value = '';
                  document.getElementById('partPrice').value = '';
                }} className="mt-3 w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm">إضافة القطعة</button>
              </div>
              
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
                <h4 className="font-bold mb-3">إضافة دفعة</h4>
                <div className="flex gap-3">
                  <input type="number" className="flex-1 border p-2 rounded-lg text-sm bg-white dark:bg-slate-900" placeholder="المبلغ" id="paymentAmount" />
                  <button onClick={() => {
                    const amount = parseFloat(document.getElementById('paymentAmount').value);
                    if (!amount || amount <= 0) return showError("مبلغ غير صحيح");
                    handleAddPayment(selectedTicket.id, amount);
                    document.getElementById('paymentAmount').value = '';
                  }} className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold text-sm">إضافة</button>
                </div>
              </div>
              
              <button onClick={() => setShowSparePartsModal(false)} className="w-full bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال سجل التذكرة ===== */}
      {showHistoryModal && selectedTicket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl">سجل التذكرة #{selectedTicket.ticketNumber}</h3>
              <button onClick={() => setShowHistoryModal(false)} className="hover:text-rose-600"><X size={24}/></button>
            </div>
            <div className="space-y-4">
              {ticketHistory.map((event, idx) => (
                <div key={idx} className="relative pr-6 pb-4 border-r-2 border-indigo-200 dark:border-indigo-800 last:border-0">
                  <div className="absolute right-[-5px] top-0 w-3 h-3 rounded-full bg-indigo-600"></div>
                  <p className="text-xs text-slate-400">{formatDate(event.timestamp)}</p>
                  <p className="font-bold">{event.action}</p>
                  {event.details && <p className="text-sm text-slate-600">{event.details}</p>}
                  <p className="text-xs text-indigo-500 mt-1">بواسطة: {event.by}</p>
                </div>
              ))}
              {ticketHistory.length === 0 && <p className="text-center text-slate-400 py-8">لا يوجد سجل</p>}
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال الحذف المجمع ===== */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
              <Trash2 size={20}/> حذف مجمع للتذاكر
            </h3>
            <p className="text-sm mb-4">حذف <span className="font-bold text-rose-600">{selectedItems.size}</span> تذكرة بشكل نهائي</p>
            <input className="w-full border p-3 rounded-xl font-bold mb-4 bg-white dark:bg-slate-900" placeholder="اكتب 'حذف' للتأكيد" value={bulkDeleteConfirm} onChange={e => setBulkDeleteConfirm(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={handleBulkDelete} disabled={bulkDeleteConfirm !== 'حذف'} className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold disabled:opacity-50">تأكيد</button>
              <button onClick={() => { setShowBulkDeleteModal(false); setBulkDeleteConfirm(''); }} className="flex-1 bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال تعديل التذكرة ===== */}
      {editingTicket && (appUser.permissions?.editTicket || appUser.role === 'admin') && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="font-black text-xl text-slate-800 dark:text-white">تعديل التذكرة #{editingTicket.ticketNumber}</h3>
              <button onClick={() => setEditingTicket(null)} className="text-slate-400 hover:text-rose-600"><X size={24}/></button>
            </div>
            <form onSubmit={handleUpdateTicket} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">اسم العميل *</label>
                  <input required className="w-full border p-3 rounded-xl text-sm" value={editFormData.customerName} onChange={e => setEditFormData({ ...editFormData, customerName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">رقم الهاتف *</label>
                  <input required className="w-full border p-3 rounded-xl text-sm font-mono" value={editFormData.customerPhone} onChange={e => setEditFormData({ ...editFormData, customerPhone: e.target.value })} dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">رقم ثاني</label>
                  <input className="w-full border p-3 rounded-xl text-sm font-mono" value={editFormData.secondPhone} onChange={e => setEditFormData({ ...editFormData, secondPhone: e.target.value })} dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">تليفون أرضي</label>
                  <input className="w-full border p-3 rounded-xl text-sm font-mono" value={editFormData.landline} onChange={e => setEditFormData({ ...editFormData, landline: e.target.value })} dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">البريد الإلكتروني</label>
                  <input type="email" className="w-full border p-3 rounded-xl text-sm" value={editFormData.customerEmail} onChange={e => setEditFormData({ ...editFormData, customerEmail: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">العنوان</label>
                  <input className="w-full border p-3 rounded-xl text-sm" value={editFormData.customerAddress} onChange={e => setEditFormData({ ...editFormData, customerAddress: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">المحافظة</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={editFormData.governorate} onChange={e => setEditFormData({ ...editFormData, governorate: e.target.value })}>
                    <option value="">-- اختر --</option>
                    {EGYPT_GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">المدينة</label>
                  <input className="w-full border p-3 rounded-xl text-sm" value={editFormData.city} onChange={e => setEditFormData({ ...editFormData, city: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">الجهاز</label>
                  <input className="w-full border p-3 rounded-xl text-sm" value={editFormData.device} onChange={e => setEditFormData({ ...editFormData, device: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">الموديل</label>
                  <input className="w-full border p-3 rounded-xl text-sm" value={editFormData.deviceModel} onChange={e => setEditFormData({ ...editFormData, deviceModel: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">السيريال</label>
                  <input className="w-full border p-3 rounded-xl text-sm font-mono" value={editFormData.deviceSerial} onChange={e => setEditFormData({ ...editFormData, deviceSerial: e.target.value })} />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs font-bold mb-1">المشكلة</label>
                  <textarea rows="2" className="w-full border p-3 rounded-xl text-sm" value={editFormData.issue} onChange={e => setEditFormData({ ...editFormData, issue: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">🛠️ قطع غيار بتكلفة</label>
                  <textarea rows="3" className="w-full border p-3 rounded-xl text-sm resize-none" value={editFormData.sparePartsWithCost} onChange={e => setEditFormData({...editFormData, sparePartsWithCost: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">🔧 قطع غيار بدون تكلفة</label>
                  <textarea rows="3" className="w-full border p-3 rounded-xl text-sm resize-none" value={editFormData.sparePartsWithoutCost} onChange={e => setEditFormData({...editFormData, sparePartsWithoutCost: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">📅 تاريخ الفاتورة</label>
                  <input type="date" className="w-full border p-3 rounded-xl text-sm" value={editFormData.invoiceDate} onChange={e => setEditFormData({...editFormData, invoiceDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">⏰ تاريخ انتهاء الصيانة</label>
                  <input type="date" className="w-full border p-3 rounded-xl text-sm" value={editFormData.maintenanceEndDate} onChange={e => setEditFormData({...editFormData, maintenanceEndDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">📦 تاريخ تسليم العميل</label>
                  <input type="date" className="w-full border p-3 rounded-xl text-sm" value={editFormData.deliveryDate} onChange={e => setEditFormData({...editFormData, deliveryDate: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">الحالة</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={editFormData.status} onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}>
                    {TICKET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">الأولوية</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={editFormData.priority} onChange={e => setEditFormData({ ...editFormData, priority: e.target.value })}>
                    <option value="low">منخفضة</option>
                    <option value="medium">متوسطة</option>
                    <option value="high">عالية</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">التكلفة التقديرية</label>
                  <input type="number" className="w-full border p-3 rounded-xl text-sm" value={editFormData.estimatedCost} onChange={e => setEditFormData({ ...editFormData, estimatedCost: Number(e.target.value) })} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">نوع التذكرة</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={editFormData.ticketType} onChange={e => setEditFormData({ ...editFormData, ticketType: e.target.value })}>
                    <option value="">-- اختر --</option>
                    {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">المصدر</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={editFormData.source} onChange={e => setEditFormData({ ...editFormData, source: e.target.value })}>
                    <option value="">-- اختر --</option>
                    {TICKET_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">أقرب فرع</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={editFormData.nearestBranch} onChange={e => setEditFormData({ ...editFormData, nearestBranch: e.target.value })}>
                    <option value="">-- اختر --</option>
                    {BRANCH_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">الفني المختص</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={editFormData.assignedTechnician} onChange={e => setEditFormData({...editFormData, assignedTechnician: e.target.value})}>
                    <option value="">-- غير محدد --</option>
                    {(systemSettings?.technicians || []).map((tech, idx) => <option key={idx} value={tech}>{tech}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">مركز الصيانة</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={editFormData.assignedMaintenanceCenter} onChange={e => setEditFormData({...editFormData, assignedMaintenanceCenter: e.target.value})}>
                    <option value="">-- غير محدد --</option>
                    {(systemSettings?.maintenanceCenters || []).map(center => (
                      <option key={typeof center === 'string' ? center : center.value} value={typeof center === 'string' ? center : center.name}>
                        {typeof center === 'string' ? center : center.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">الكول سنتر</label>
                  <select className="w-full border p-3 rounded-xl text-sm" value={editFormData.assignedCallCenter} onChange={e => setEditFormData({...editFormData, assignedCallCenter: e.target.value})}>
                    <option value="">-- غير محدد --</option>
                    {callCenters.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">الوسوم</label>
                <input className="w-full border p-3 rounded-xl text-sm" value={editFormData.tags?.join(', ')} onChange={e => setEditFormData({...editFormData, tags: e.target.value.split(',').map(t => t.trim())})} />
              </div>
              
              <div>
                <label className="block text-xs font-bold mb-1">ملاحظات</label>
                <textarea rows="2" className="w-full border p-3 rounded-xl text-sm" value={editFormData.notes} onChange={e => setEditFormData({...editFormData, notes: e.target.value})} />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">حفظ التعديلات</button>
                <button type="button" onClick={() => setEditingTicket(null)} className="flex-1 bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== رأس الصفحة ===== */}
      <div className="p-5 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-black flex items-center gap-2">
            <MessageSquare className="text-indigo-600" size={20}/> تذاكر الصيانة
          </h2>
          <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-lg text-xs">{tickets.length} تذكرة</span>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {selectedItems.size > 0 && (
            <button onClick={() => setShowBulkDeleteModal(true)} className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
              <Trash2 size={14}/> حذف {selectedItems.size}
            </button>
          )}
          
          <input className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900 w-40" placeholder="بحث شامل..." value={search} onChange={e => setSearch(e.target.value)} />
          
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">كل الحالات</option>
            {TICKET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="all">كل الأولويات</option>
            <option value="high">عالية</option>
            <option value="medium">متوسطة</option>
            <option value="low">منخفضة</option>
          </select>
          
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterWarranty} onChange={e => setFilterWarranty(e.target.value)}>
            <option value="all">كل الضمانات</option>
            {WARRANTY_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
          
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterTicketType} onChange={e => setFilterTicketType(e.target.value)}>
            <option value="all">كل الأنواع</option>
            {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          
          <select className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
            <option value="all">كل المصادر</option>
            {TICKET_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          
          <button onClick={resetFilters} className="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-xs font-bold">
            <RotateCcw size={14}/>
          </button>
          
          <button onClick={() => setShowAddModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-2">
            <Plus size={14}/> تذكرة جديدة
          </button>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <input type="date" className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={dateRange.from} onChange={e => setDateRange({...dateRange, from: e.target.value})} />
          <input type="date" className="border p-2 rounded-lg text-xs bg-white dark:bg-slate-900" value={dateRange.to} onChange={e => setDateRange({...dateRange, to: e.target.value})} />
        </div>
      </div>

      {/* ===== جدول التذاكر ===== */}
      <div className="overflow-x-auto max-h-[70vh] custom-scrollbar">
        <table className="w-full text-right text-sm">
          <thead className="bg-white dark:bg-slate-900 border-b text-slate-500 dark:text-slate-400 font-bold text-[11px] uppercase sticky top-0">
            <tr>
              <th className="p-3 w-10">
                <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={selectedItems.size === tickets.length && tickets.length > 0} onChange={toggleSelectAll} />
              </th>
              <th className="p-3">رقم التذكرة</th>
              <th className="p-3">العميل</th>
              <th className="p-3">الهاتف</th>
              <th className="p-3">الجهاز</th>
              <th className="p-3">النوع</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">الأولوية</th>
              <th className="p-3">الضمان</th>
              <th className="p-3">المصدر</th>
              <th className="p-3">الفني</th>
              <th className="p-3">آخر تحديث</th>
              <th className="p-3 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700 font-medium text-xs">
            {tickets.length === 0 && !loadingData ? (
              <tr>
                <td colSpan="13" className="p-10 text-center text-slate-400">لا توجد تذاكر</td>
              </tr>
            ) : (
              tickets.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer" onClick={() => openFullTicket(t)}>
                  <td className="p-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={selectedItems.has(t.id)} onChange={() => toggleSelectItem(t.id)} />
                  </td>
                  <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">{t.ticketNumber || t.id.slice(0,8)}</td>
                  <td className="p-3 font-bold">{t.customerName}</td>
                  <td className="p-3 font-mono" dir="ltr">{t.customerPhone}</td>
                  <td className="p-3">{t.device || t.deviceType || '-'}</td>
                  <td className="p-3">{TICKET_TYPES.find(tt => tt.value === t.ticketType)?.label || '-'}</td>
                  <td className="p-3" onClick={e => e.stopPropagation()}>
                    <StatusSelectComp value={t.status} onChange={handleUpdateStatus} ticketId={t.id} />
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${getPriorityColor(t.priority)}`}>
                      {t.priority === 'high' ? 'عالية' : t.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                    </span>
                  </td>
                  <td className="p-3">{WARRANTY_OPTIONS.find(w => w.value === t.warrantyStatus)?.label || '-'}</td>
                  <td className="p-3">{TICKET_SOURCES.find(s => s.value === t.source)?.label || '-'}</td>
                  <td className="p-3">{t.assignedTechnician || '-'}</td>
                  <td className="p-3 text-[9px]">{formatDate(t.updatedAt || t.createdAt)}</td>
                  <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-center gap-1">
                      <button onClick={() => openFullTicket(t)} className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded hover:bg-indigo-100" title="فتح">
                        <Eye size={14}/>
                      </button>
                      <button onClick={() => { setSelectedTicket(t); setShowAssignModal(true); }} className="p-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded hover:bg-amber-100" title="تعيين">
                        <Users size={14}/>
                      </button>
                      <button onClick={() => handleViewHistory(t)} className="p-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 rounded hover:bg-purple-100" title="سجل">
                        <History size={14}/>
                      </button>
                      <button onClick={() => handleGenerateInvoice(t)} className="p-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded hover:bg-emerald-100" title="فاتورة">
                        <Receipt size={14}/>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); openEditModal(t); }} className="p-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded hover:bg-emerald-100" title="تعديل">
                        <Edit size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        {hasMore && !loadingData && tickets.length >= 30 && (
          <div className="p-4 text-center bg-slate-50 dark:bg-slate-900/50 border-t">
            <button onClick={() => loadTickets(true)} className="text-indigo-600 font-bold text-xs hover:underline flex items-center justify-center gap-1 mx-auto">
              تحميل المزيد <ChevronDown size={14}/>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ==========================================================================
// 👥 إدارة المستخدمين المحسنة (مع صلاحيات تفصيلية وتحكم كامل)
// ==========================================================================
function EnhancedUserManagement({ appUser, warehouses, notify, setGlobalLoading, onViewProfile }) {
  const [usersList, setUsersList] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    pass: '', 
    role: 'sales', 
    assignedWarehouseId: 'main',
    department: '',
    jobTitle: '',
    hireDate: '',
    salary: 0,
    notes: ''
  });
  const [permissionsByCategory, setPermissionsByCategory] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState(null);
  const [departments] = useState(['المبيعات', 'المخزون', 'الصيانة', 'المحاسبة', 'الإدارة', 'الكول سنتر']);

  
  // خيارات فترات الضمان
const WARRANTY_PERIODS = [
  { value: '6_months', label: '6 شهور' },
  { value: '1_year', label: 'سنة' },
  { value: '2_years', label: 'سنتين' },
  { value: '3_years', label: '3 سنوات' },
  { value: '5_years', label: '5 سنوات' }
];


  useEffect(() => {
    if (appUser?.role !== 'admin') return;
    const unsub = onSnapshot(collection(db, 'employees'), snap => setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [appUser]);

  useEffect(() => {
    const categories = {};
    ALL_PERMISSIONS.forEach(p => {
      if (!categories[p.category]) {
        categories[p.category] = [];
      }
      categories[p.category].push(p);
    });
    setPermissionsByCategory(categories);
  }, []);

  // دوال التحديد المتعدد
  const toggleSelectItem = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === filteredUsers.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredUsers.map(u => u.id)));
    }
  };

  // دالة الحذف المجمع
  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      showError("لم يتم تحديد أي مستخدمين للحذف");
      return;
    }

    if (bulkDeleteConfirm !== 'حذف') {
      showError("يرجى كتابة 'حذف' لتأكيد العملية");
      return;
    }

    const confirmed = await showConfirm(
      'تأكيد الحذف المجمع',
      `هل أنت متأكد من حذف ${selectedItems.size} مستخدم بشكل نهائي؟`,
      'warning',
      'نعم، احذف الكل'
    );

    if (!confirmed) return;

    setGlobalLoading(true);
    try {
      const itemsToDelete = Array.from(selectedItems);
      const chunks = [];
      
      for (let i = 0; i < itemsToDelete.length; i += 400) {
        chunks.push(itemsToDelete.slice(i, i + 400));
      }

      let deleted = 0;
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        
        chunk.forEach(userId => {
          const ref = doc(db, 'employees', userId);
          batch.delete(ref);
        });

        await batch.commit();
        deleted += chunk.length;
      }

      await logUserActivity(appUser, 'حذف مجمع مستخدمين', `تم حذف ${deleted} مستخدم`);
      showSuccess(`تم حذف ${deleted} مستخدم بنجاح`);
      
      setSelectedItems(new Set());
      setShowBulkDeleteModal(false);
      setBulkDeleteConfirm('');
      
    } catch (error) {
      console.error("Bulk delete error:", error);
      showError("حدث خطأ أثناء الحذف المجمع");
    }
    setGlobalLoading(false);
  };

  const handleUpdateUser = async (e) => {
     e.preventDefault(); 
     if (!editingUser) return;
     setGlobalLoading(true);
     try {
        const dataToUpdate = {
            name: editingUser.name,
            phone: editingUser.phone || '',
            role: editingUser.role,
            department: editingUser.department || '',
            jobTitle: editingUser.jobTitle || '',
            hireDate: editingUser.hireDate || '',
            salary: editingUser.salary || 0,
            notes: editingUser.notes || '',
            assignedWarehouseId: editingUser.assignedWarehouseId,
            isDisabled: editingUser.isDisabled || false,
            permissions: editingUser.permissions || {}
        };
        await updateDoc(doc(db, 'employees', editingUser.id), dataToUpdate);
        await logUserActivity(appUser, 'تعديل بيانات موظف', `تعديل صلاحيات أو بيانات الموظف: ${editingUser.name}`);
        showSuccess("تم حفظ الإعدادات"); 
        setEditingUser(null);
     } catch(e) { 
        console.error(e);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("حدث خطأ في حفظ الإعدادات: " + e.message); 
        }
     }
     setGlobalLoading(false);
  };

  const handleAddUser = async (e) => {
     e.preventDefault();
     
     const errors = validators.user(newUser);
     if (errors.length > 0) {
       showError(errors.join('\n'));
       return;
     }
     
     setGlobalLoading(true);
     try {
        const emailToSave = newUser.email.trim().toLowerCase();
        const q = query(collection(db, 'employees'), where('email', '==', emailToSave));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            showError("المستخدم موجود بالفعل بهذا البريد الإلكتروني!");
            setGlobalLoading(false);
            return;
        }
        
        const defaultPermissions = ROLE_DEFAULT_PERMISSIONS[newUser.role] || {};
        defaultPermissions.viewInvoices = newUser.role === 'admin';

        await addDoc(collection(db, 'employees'), {
            email: emailToSave,
            pass: newUser.pass,
            name: newUser.name,
            phone: newUser.phone || '',
            role: newUser.role,
            department: newUser.department || '',
            jobTitle: newUser.jobTitle || '',
            hireDate: newUser.hireDate || '',
            salary: Number(newUser.salary) || 0,
            notes: newUser.notes || '',
            assignedWarehouseId: newUser.assignedWarehouseId,
            permissions: defaultPermissions,
            isDisabled: false,
            createdAt: serverTimestamp(),
            lastLogin: null,
            loginHistory: []
        });
        
        await logUserActivity(appUser, 'إضافة موظف', `إنشاء حساب للموظف: ${newUser.name} بدور ${newUser.role}`);
        showSuccess("تم إضافة المستخدم بنجاح");
        setShowAddModal(false);
        setNewUser({ 
          name: '', 
          email: '', 
          phone: '', 
          pass: '', 
          role: 'sales', 
          assignedWarehouseId: 'main',
          department: '',
          jobTitle: '',
          hireDate: '',
          salary: 0,
          notes: ''
        });
     } catch (err) {
        console.error(err);
        if (err.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("حدث خطأ أثناء إضافة المستخدم: " + err.message);
        }
     }
     setGlobalLoading(false);
  };

  const handleDeleteUser = async (id, name) => {
     const confirmed = await showConfirm(
       'تأكيد الحذف',
       `هل أنت متأكد من حذف المستخدم "${name}" بشكل نهائي؟`
     );
     
     if (!confirmed) return;
     
     setGlobalLoading(true);
     try {
        await deleteDoc(doc(db, 'employees', id));
        await logUserActivity(appUser, 'حذف موظف', `تم حذف حساب الموظف: ${name}`);
        showSuccess("تم حذف المستخدم بنجاح");
     } catch (e) {
        console.error(e);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("حدث خطأ أثناء الحذف: " + e.message);
        }
     }
     setGlobalLoading(false);
  };

  const handleToggleAllPermissions = (user, category, checked) => {
    const newPermissions = { ...user.permissions };
    permissionsByCategory[category].forEach(p => {
      newPermissions[p.key] = checked;
    });
    setEditingUser({ ...user, permissions: newPermissions });
  };

  const handleCopyPermissions = (sourceUser) => {
    if (!editingUser) return;
    setEditingUser({
      ...editingUser,
      permissions: { ...sourceUser.permissions }
    });
    showSuccess("تم نسخ الصلاحيات");
  };

  const handleSavePermissions = async () => {
    if (!permissionsUser) return;
    setGlobalLoading(true);
    try {
      await updateDoc(doc(db, 'employees', permissionsUser.id), {
        permissions: permissionsUser.permissions
      });
      await logUserActivity(appUser, 'تعديل صلاحيات', `تعديل صلاحيات المستخدم: ${permissionsUser.name}`);
      showSuccess("تم حفظ الصلاحيات بنجاح");
      setShowPermissionsModal(false);
      setPermissionsUser(null);
    } catch (error) {
      console.error(error);
      showError("حدث خطأ أثناء حفظ الصلاحيات");
    }
    setGlobalLoading(false);
  };

  const filteredUsers = usersList.filter(user => {
    const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.phone?.includes(searchTerm);
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesWarehouse = filterWarehouse === 'all' || user.assignedWarehouseId === filterWarehouse;
    const matchesDepartment = filterDepartment === 'all' || user.department === filterDepartment;
    return matchesSearch && matchesRole && matchesWarehouse && matchesDepartment;
  });

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* مودال تعديل المستخدم */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-5xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                <UserCog className="text-indigo-600"/> إعدادات الموظف
              </h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-rose-600">
                <X size={24}/>
              </button>
            </div>
            <form onSubmit={handleUpdateUser} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">اسم الموظف</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={editingUser.name} 
                       onChange={e=>setEditingUser({...editingUser, name:e.target.value})} 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">البريد الإلكتروني</label>
                     <input 
                       type="email"
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={editingUser.email} 
                       disabled
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">رقم الهاتف</label>
                     <input 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold font-mono bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={editingUser.phone || ''} 
                       onChange={e=>setEditingUser({...editingUser, phone:e.target.value})} 
                       dir="ltr" 
                     />
                  </div>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الرتبة</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-white dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={editingUser.role} 
                      onChange={e => {
                        const newRole = e.target.value;
                        const defaultPermissions = ROLE_DEFAULT_PERMISSIONS[newRole] || {};
                        setEditingUser({ 
                          ...editingUser, 
                          role: newRole,
                          permissions: defaultPermissions
                        });
                      }}
                    >
                       {USER_ROLES.map(role => (
                         <option key={role.key} value={role.key}>{role.label}</option>
                       ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الفرع المخصص</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-white dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={editingUser.assignedWarehouseId} 
                      onChange={e=>setEditingUser({...editingUser, assignedWarehouseId:e.target.value})}
                    >
                       {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">القسم</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-white dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={editingUser.department || ''} 
                      onChange={e=>setEditingUser({...editingUser, department: e.target.value})}
                    >
                       <option value="">-- اختر القسم --</option>
                       {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">المسمى الوظيفي</label>
                    <input 
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={editingUser.jobTitle || ''} 
                      onChange={e=>setEditingUser({...editingUser, jobTitle: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">تاريخ التعيين</label>
                    <input 
                      type="date"
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={editingUser.hireDate || ''} 
                      onChange={e=>setEditingUser({...editingUser, hireDate: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الراتب</label>
                    <input 
                      type="number"
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={editingUser.salary || 0} 
                      onChange={e=>setEditingUser({...editingUser, salary: Number(e.target.value)})} 
                    />
                  </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                  <textarea
                    rows="2"
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500"
                    value={editingUser.notes || ''}
                    onChange={e=>setEditingUser({...editingUser, notes: e.target.value})}
                  />
               </div>
               
               <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <input 
                        type="checkbox" 
                        id="disableUser" 
                        className="w-4 h-4 accent-rose-600" 
                        checked={editingUser.isDisabled || false} 
                        onChange={e => setEditingUser({...editingUser, isDisabled: e.target.checked})} 
                    />
                    <label htmlFor="disableUser" className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer">تعطيل الحساب (منع الدخول)</label>
               </div>

               <div className="flex gap-3 pt-4 border-t">
                 <button type="submit" className="flex-1 bg-slate-900 dark:bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-black dark:hover:bg-indigo-700 transition-colors">حفظ التعديلات</button>
                 <button type="button" onClick={()=>setEditingUser(null)} className="flex-1 bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">إلغاء</button>
               </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال إضافة مستخدم */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                <UserPlus className="text-indigo-600"/> إضافة مستخدم جديد
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-rose-600">
                <X size={24}/>
              </button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">اسم الموظف *</label>
                     <input 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={newUser.name} 
                       onChange={e=>setNewUser({...newUser, name:e.target.value})} 
                       placeholder="الاسم بالكامل" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">رقم الهاتف</label>
                     <input 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold font-mono bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={newUser.phone} 
                       onChange={e=>setNewUser({...newUser, phone:e.target.value})} 
                       placeholder="01XXXXXXXXX" 
                       dir="ltr" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">البريد الإلكتروني *</label>
                     <input 
                       type="email" 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold font-mono bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={newUser.email} 
                       onChange={e=>setNewUser({...newUser, email:e.target.value})} 
                       placeholder="employee@domain.com" 
                       dir="ltr" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">كلمة المرور *</label>
                     <input 
                       type="text" 
                       required 
                       className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold font-mono bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                       value={newUser.pass} 
                       onChange={e=>setNewUser({...newUser, pass:e.target.value})} 
                       placeholder="كلمة المرور للدخول" 
                       dir="ltr" 
                     />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الرتبة</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.role} 
                      onChange={e=>setNewUser({...newUser, role:e.target.value})}>
                       {USER_ROLES.map(role => (
                         <option key={role.key} value={role.key}>{role.label}</option>
                       ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">القسم</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.department} 
                      onChange={e=>setNewUser({...newUser, department:e.target.value})}>
                       <option value="">-- اختر القسم --</option>
                       {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الفرع المخصص</label>
                    <select 
                      className="w-full border p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.assignedWarehouseId} 
                      onChange={e=>setNewUser({...newUser, assignedWarehouseId:e.target.value})}>
                       {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">المسمى الوظيفي</label>
                    <input 
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.jobTitle} 
                      onChange={e=>setNewUser({...newUser, jobTitle:e.target.value})} 
                    />
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">تاريخ التعيين</label>
                    <input 
                      type="date"
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.hireDate} 
                      onChange={e=>setNewUser({...newUser, hireDate:e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الراتب</label>
                    <input 
                      type="number"
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500" 
                      value={newUser.salary} 
                      onChange={e=>setNewUser({...newUser, salary: Number(e.target.value)})} 
                    />
                  </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">ملاحظات</label>
                  <textarea
                    rows="2"
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 outline-none focus:border-indigo-500"
                    value={newUser.notes}
                    onChange={e=>setNewUser({...newUser, notes:e.target.value})}
                  />
               </div>
               
               <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                 <p className="text-xs text-indigo-800 dark:text-indigo-300 font-bold">
                   سيتم منح المستخدم الصلاحيات الافتراضية حسب الدور المختار، ويمكنك تعديلها لاحقاً من صفحة تعديل المستخدم.
                 </p>
               </div>

               <div className="flex gap-3 pt-4 border-t">
                 <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-colors flex justify-center items-center gap-2">
                   <Plus size={18}/> إنشاء الحساب
                 </button>
                 <button type="button" onClick={()=>setShowAddModal(false)} className="px-6 bg-slate-100 dark:bg-slate-700 py-3 rounded-xl font-bold text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">إلغاء</button>
               </div>
            </form>
          </div>
        </div>
      )}

      {/* مودال إدارة الصلاحيات التفصيلية */}
      {showPermissionsModal && permissionsUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-5xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                <Shield className="text-indigo-600"/> إدارة صلاحيات {permissionsUser.name}
              </h3>
              <button onClick={() => setShowPermissionsModal(false)} className="text-slate-400 hover:text-rose-600">
                <X size={24}/>
              </button>
            </div>
            
            <div className="space-y-6">
              {Object.entries(permissionsByCategory).map(([category, perms]) => (
                <div key={category} className="mb-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b">
                    <h5 className="font-bold text-indigo-700 dark:text-indigo-400">{category}</h5>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const newPermissions = { ...permissionsUser.permissions };
                          perms.forEach(p => {
                            newPermissions[p.key] = true;
                          });
                          setPermissionsUser({ ...permissionsUser, permissions: newPermissions });
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                      >
                        تحديد الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newPermissions = { ...permissionsUser.permissions };
                          perms.forEach(p => {
                            newPermissions[p.key] = false;
                          });
                          setPermissionsUser({ ...permissionsUser, permissions: newPermissions });
                        }}
                        className="text-xs text-slate-500 hover:text-slate-700 font-bold"
                      >
                        إلغاء الكل
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                     {perms.map(p => (
                        <label 
                          key={p.key} 
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${permissionsUser.permissions?.[p.key] ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'}`}
                          title={p.label}
                        >
                           <input 
                             type="checkbox" 
                             className="w-4 h-4 accent-indigo-600" 
                             checked={permissionsUser.permissions?.[p.key] || false} 
                             onChange={e => setPermissionsUser({
                               ...permissionsUser, 
                               permissions: {
                                 ...permissionsUser.permissions, 
                                 [p.key]: e.target.checked
                               }
                             })} 
                           />
                           <span className="text-xs font-bold line-clamp-2">{p.label}</span>
                        </label>
                     ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-4 border-t mt-6">
              <button
                onClick={handleSavePermissions}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700"
              >
                حفظ الصلاحيات
              </button>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال الحذف المجمع */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
              <TrashIcon size={20}/> حذف مجمع للمستخدمين
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              أنت على وشك حذف <span className="font-bold text-rose-600">{selectedItems.size}</span> مستخدم بشكل نهائي.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
              هذا الإجراء لا يمكن التراجع عنه. لتأكيد الحذف، اكتب "حذف" في الحقل أدناه.
            </p>
            
            <input
              type="text"
              className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-rose-500 mb-4 bg-white dark:bg-slate-900"
              placeholder="اكتب 'حذف' للتأكيد"
              value={bulkDeleteConfirm}
              onChange={e => setBulkDeleteConfirm(e.target.value)}
            />
            
            <div className="flex gap-2">
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteConfirm !== 'حذف'}
                className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                تأكيد الحذف
              </button>
              <button
                onClick={() => {
                  setShowBulkDeleteModal(false);
                  setBulkDeleteConfirm('');
                }}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

       <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b bg-slate-50 dark:bg-slate-900/50 flex flex-wrap justify-between items-center gap-4">
             <div className="flex items-center gap-3">
                <h3 className="font-black text-xl text-slate-800 dark:text-white flex items-center gap-2">
                  <Shield className="text-indigo-600" size={20}/> فريق العمل والصلاحيات
                </h3>
                <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-1.5 rounded-lg font-bold text-xs">{usersList.length} مستخدم</div>
             </div>
             
             <div className="flex flex-wrap gap-2">
               {selectedItems.size > 0 && (
                 <button 
                   onClick={() => setShowBulkDeleteModal(true)} 
                   className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center justify-center gap-2"
                 >
                   <TrashIcon size={14}/> حذف {selectedItems.size} مستخدم
                 </button>
               )}
               
               <input
                 type="text"
                 placeholder="بحث..."
                 className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                 value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
               />
               <select
                 className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                 value={filterRole}
                 onChange={e => setFilterRole(e.target.value)}
               >
                 <option value="all">كل الأدوار</option>
                 {USER_ROLES.map(role => (
                   <option key={role.key} value={role.key}>{role.label}</option>
                 ))}
               </select>
               <select
                 className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                 value={filterWarehouse}
                 onChange={e => setFilterWarehouse(e.target.value)}
               >
                 <option value="all">كل الفروع</option>
                 {warehouses.map(w => (
                   <option key={w.id} value={w.id}>{w.name}</option>
                 ))}
               </select>
               <select
                 className="border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                 value={filterDepartment}
                 onChange={e => setFilterDepartment(e.target.value)}
               >
                 <option value="all">كل الأقسام</option>
                 {departments.map(d => (
                   <option key={d} value={d}>{d}</option>
                 ))}
               </select>
               <button 
                 onClick={()=>setShowAddModal(true)} 
                 className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-sm whitespace-nowrap"
               >
                  <Plus size={14}/> إضافة مستخدم
               </button>
             </div>
          </div>
          
          <div className="overflow-x-auto">
             <table className="w-full text-right text-sm">
                <thead className="bg-white dark:bg-slate-900 border-b text-slate-500 dark:text-slate-400 font-bold">
                   <tr>
                      <th className="p-5 w-10">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 accent-indigo-600"
                          checked={selectedItems.size === filteredUsers.length && filteredUsers.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="p-5">الموظف</th>
                      <th className="p-5 text-center">الفرع</th>
                      <th className="p-5 text-center">القسم</th>
                      <th className="p-5 text-center">الرتبة</th>
                      <th className="p-5 text-center">الحالة</th>
                      <th className="p-5 text-center">آخر ظهور</th>
                      <th className="p-5 text-center">عدد الصلاحيات</th>
                      <th className="p-5 text-center">إدارة</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700 font-medium">
                   {filteredUsers.map(u => {
                     const RoleIcon = getRoleIcon(u.role);
                     const roleColor = getRoleColor(u.role);
                     const permissionsCount = Object.values(u.permissions || {}).filter(Boolean).length;
                     return (
                       <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                          <td className="p-5">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 accent-indigo-600"
                              checked={selectedItems.has(u.id)}
                              onChange={() => toggleSelectItem(u.id)}
                            />
                          </td>
                          <td className="p-5">
                            <div className="flex items-center gap-2">
                              <RoleIcon size={16} className={`text-${roleColor}-600`}/>
                              <div>
                                <p className="text-slate-800 dark:text-white font-bold">{u.name || 'مستخدم جديد'}</p>
                                <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1" dir="ltr">{u.email}</p>
                                {u.phone && <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{u.phone}</p>}
                                {u.jobTitle && <p className="text-[9px] text-indigo-400">{u.jobTitle}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="p-5 text-center font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                            {warehouses.find(w=>w.id===u.assignedWarehouseId)?.name || 'الرئيسي'}
                          </td>
                          <td className="p-5 text-center text-slate-600 dark:text-slate-400 text-xs">
                            {u.department || '-'}
                          </td>
                          <td className="p-5 text-center">
                            <span className={`px-3 py-1 rounded-md text-[10px] font-bold bg-${roleColor}-100 dark:bg-${roleColor}-900/30 text-${roleColor}-700 dark:text-${roleColor}-300`}>
                              {USER_ROLES.find(r => r.key === u.role)?.label || u.role}
                            </span>
                          </td>
                          <td className="p-5 text-center">
                              {u.isDisabled ? 
                                  <span className="px-3 py-1 rounded-md text-[10px] font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">موقوف</span> : 
                                  <span className="px-3 py-1 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">نشط</span>
                              }
                          </td>
                          <td className="p-5 text-center text-[10px] text-slate-500 dark:text-slate-400">
                            {u.lastLogin ? formatDate(u.lastLogin) : '-'}
                          </td>
                          <td className="p-5 text-center font-bold">
                            <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-lg text-xs">
                              {permissionsCount} / {ALL_PERMISSIONS.length}
                            </span>
                          </td>
                          <td className="p-5 text-center flex justify-center gap-2">
                              <button 
                                onClick={() => onViewProfile(u)} 
                                className="p-2 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg hover:bg-sky-600 dark:hover:bg-sky-700 hover:text-white transition-colors shadow-sm" 
                                title="عرض نشاط الموظف"
                              >
                                <Eye size={16}/>
                              </button>
                              <button 
                                onClick={() => { setPermissionsUser(u); setShowPermissionsModal(true); }} 
                                className="p-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-600 dark:hover:bg-purple-700 hover:text-white transition-colors shadow-sm" 
                                title="إدارة الصلاحيات"
                              >
                                <Shield size={16}/>
                              </button>
                              <button 
                                onClick={()=>setEditingUser({...u, permissions: u.permissions || {}})} 
                                className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-indigo-600 dark:hover:bg-indigo-700 hover:text-white transition-colors shadow-sm" 
                                title="تعديل البيانات"
                              >
                                <Edit size={16}/>
                              </button>
                              <button 
                                onClick={()=>handleDeleteUser(u.id, u.name || u.email)} 
                                disabled={appUser.id === u.id} 
                                className="p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-600 dark:hover:bg-rose-700 hover:text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" 
                                title={appUser.id === u.id ? "لا يمكنك حذف حسابك الحالي" : "حذف المستخدم"}
                              >
                                <Trash2 size={16}/>
                              </button>
                          </td>
                       </tr>
                     );
                   })}
                </tbody>
             </table>
          </div>
       </div>
    </div>
  );
}

// ==========================================================================
// 🏪 مدير الفروع المحسن مع إدارة كاملة
// ==========================================================================
function EnhancedWarehouseManager({ warehouses, appUser, notify, setGlobalLoading }) {
   const [name, setName] = useState('');
   const [location, setLocation] = useState('');
   const [phone, setPhone] = useState('');
   const [address, setAddress] = useState('');
   const [manager, setManager] = useState('');
   const [email, setEmail] = useState('');
   const [workingHours, setWorkingHours] = useState('');
   const [selectedWarehouse, setSelectedWarehouse] = useState(null);
   const [assignedUsers, setAssignedUsers] = useState([]);
   const [allUsers, setAllUsers] = useState([]);
   const [editingWarehouse, setEditingWarehouse] = useState(null);
   const [inventory, setInventory] = useState([]);
   const [showInventory, setShowInventory] = useState(false);
   const [warehouseStats, setWarehouseStats] = useState({ 
     totalItems: 0, 
     totalValue: 0, 
     totalUsers: 0, 
     totalCategories: 0,
     totalTransactions: 0,
     monthlySales: 0
   });
   const [searchUser, setSearchUser] = useState('');
   const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
   const [selectedItems, setSelectedItems] = useState(new Set());
   const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
   const [showTransferModal, setShowTransferModal] = useState(false);
   const [transferData, setTransferData] = useState({ toWarehouse: '', items: [] });
   const [reports, setReports] = useState([]);

   useEffect(() => {
     if (selectedWarehouse) {
       const fetchData = async () => {
         setGlobalLoading(true);
         try {
           const usersSnap = await getDocs(query(collection(db, 'employees'), where('isDisabled', '==', false)));
           const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
           setAllUsers(users);
           
           const assigned = users.filter(u => u.assignedWarehouseId === selectedWarehouse.id);
           setAssignedUsers(assigned);

           const invSnap = await getDocs(query(collection(db, 'inventory'), where('warehouseId', '==', selectedWarehouse.id), where('isDeleted', '==', false)));
           const invData = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
           setInventory(invData);
           
           const thirtyDaysAgo = new Date();
           thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
           const transSnap = await getDocs(query(
             collection(db, 'transactions'),
             where('warehouseId', '==', selectedWarehouse.id),
             where('timestamp', '>=', thirtyDaysAgo)
           ));
           
           const totalItems = invData.reduce((sum, item) => sum + (item.quantity || 0), 0);
           const totalValue = invData.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price || 0)), 0);
           const categories = new Set(invData.map(item => item.category).filter(Boolean));
           const monthlySales = transSnap.docs.reduce((sum, doc) => {
             const data = doc.data();
             return sum + (data.finalTotal || data.total || 0);
           }, 0);
           
           setWarehouseStats({
             totalItems,
             totalValue,
             totalUsers: assigned.length,
             totalCategories: categories.size,
             totalTransactions: transSnap.size,
             monthlySales
           });
           
         } catch (error) {
           console.error("Error fetching warehouse data:", error);
           if (error.code === 'permission-denied') {
             showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
           }
         }
         setGlobalLoading(false);
       };
       fetchData();
     }
   }, [selectedWarehouse, setGlobalLoading]);

   // دوال التحديد المتعدد للمخزون
   const toggleSelectItem = (itemId) => {
     const newSelected = new Set(selectedItems);
     if (newSelected.has(itemId)) {
       newSelected.delete(itemId);
     } else {
       newSelected.add(itemId);
     }
     setSelectedItems(newSelected);
   };

   const toggleSelectAll = () => {
     if (selectedItems.size === inventory.length) {
       setSelectedItems(new Set());
     } else {
       setSelectedItems(new Set(inventory.map(i => i.id)));
     }
   };

   // دالة الحذف المجمع للمخزون في الفرع
   const handleBulkDeleteInventory = async () => {
     if (selectedItems.size === 0) {
       showError("لم يتم تحديد أي أصناف للحذف");
       return;
     }

     if (bulkDeleteConfirm !== 'حذف') {
       showError("يرجى كتابة 'حذف' لتأكيد العملية");
       return;
     }

     const confirmed = await showConfirm(
       'تأكيد الحذف المجمع',
       `هل أنت متأكد من حذف ${selectedItems.size} صنف من مخزون هذا الفرع بشكل نهائي؟`,
       'warning',
       'نعم، احذف الكل'
     );

     if (!confirmed) return;

     setGlobalLoading(true);
     try {
       const itemsToDelete = Array.from(selectedItems);
       const chunks = [];
       
       for (let i = 0; i < itemsToDelete.length; i += 400) {
         chunks.push(itemsToDelete.slice(i, i + 400));
       }

       let deleted = 0;
       for (const chunk of chunks) {
         const batch = writeBatch(db);
         
         chunk.forEach(itemId => {
           const ref = doc(db, 'inventory', itemId);
           batch.delete(ref);
         });

         await batch.commit();
         deleted += chunk.length;
       }

       await logUserActivity(appUser, 'حذف مجمع مخزون فرع', `تم حذف ${deleted} صنف من مخزون ${selectedWarehouse.name}`);
       showSuccess(`تم حذف ${deleted} صنف بنجاح`);
       
       setSelectedItems(new Set());
       setShowBulkDeleteModal(false);
       setBulkDeleteConfirm('');
       
       if (selectedWarehouse) {
         const invSnap = await getDocs(query(collection(db, 'inventory'), where('warehouseId', '==', selectedWarehouse.id), where('isDeleted', '==', false)));
         setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
       }
       
     } catch (error) {
       console.error("Bulk delete error:", error);
       showError("حدث خطأ أثناء الحذف المجمع");
     }
     setGlobalLoading(false);
   };

   // دالة نقل الأصناف بين الفروع
  const handleTransferItems = async () => {

  if (selectedItems.size === 0) {
    showError("لم يتم تحديد أي أصناف للنقل");
    return;
  }

  if (!transferData.toWarehouse) {
    showError("يرجى اختيار الفرع المستهدف");
    return;
  }

  const confirmed = await showConfirm(
    'تأكيد النقل',
    `هل أنت متأكد من نقل ${selectedItems.size} صنف إلى الفرع المحدد؟`,
    'info',
    'نعم، نقل'
  );

  if (!confirmed) return;

  setGlobalLoading(true);

  try {

    const itemsToTransfer = Array.from(selectedItems)
  .map(id => inventory.find(i => i.id === id))
  .filter(Boolean);

for (const item of itemsToTransfer) {

  const itemRef = doc(db, 'inventory', item.id);

  await updateDoc(itemRef, {
    warehouseId: transferData.toWarehouse,
    updatedAt: serverTimestamp()
  });

}

    await logUserActivity(
      appUser,
      'نقل مخزون بين فروع',
      `نقل ${selectedItems.size} صنف من ${selectedWarehouse.name}`
    );

    showSuccess("تم نقل الأصناف بنجاح");

    setSelectedItems(new Set());
    setShowTransferModal(false);
    setTransferData({ toWarehouse: '', items: [] });

    if (selectedWarehouse) {

      const invSnap = await getDocs(
        query(
          collection(db, 'inventory'),
          where('warehouseId', '==', selectedWarehouse.id),
          where('isDeleted', '==', false)
        )
      );

      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    }

  } catch (error) {

    console.error("Transfer error:", error);
    showError("حدث خطأ أثناء نقل الأصناف");

  } finally {

    setGlobalLoading(false);

  }

};
   const handleAdd = async (e) => {
      e.preventDefault(); 
      if(!name) return;
      setGlobalLoading(true);
      try { 
        await addDoc(collection(db, 'warehouses'), { 
          name, 
          location,
          phone,
          address,
          manager,
          email,
          workingHours,
          createdAt: serverTimestamp(),
          managers: [],
          users: []
        }); 
        showSuccess("تم إضافة الفرع بنجاح"); 
        setName(''); 
        setLocation('');
        setPhone('');
        setAddress('');
        setManager('');
        setEmail('');
        setWorkingHours('');
      } catch(e) { 
        console.error(e);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("فشل الإضافة: " + e.message); 
        }
      }
      setGlobalLoading(false);
   };

   // دالة حذف الفرع
   const handleDeleteWarehouse = async (id) => {
     const confirmed = await showConfirm(
       'تأكيد حذف الفرع',
       'هل أنت متأكد من حذف هذا الفرع؟'
     );
     
     if (!confirmed) return;
     
     setGlobalLoading(true);
     try {
       await deleteDoc(doc(db, 'warehouses', id));
       showSuccess("تم حذف الفرع بنجاح");
       setSelectedWarehouse(null);
     } catch(e) {
       console.error(e);
       if (e.code === 'permission-denied') {
         showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
       } else {
         showError("فشل حذف الفرع: " + e.message);
       }
     }
     setGlobalLoading(false);
   };

   const handleUpdateWarehouse = async () => {
      if (!editingWarehouse) return;
      setGlobalLoading(true);
      try {
        await updateDoc(doc(db, 'warehouses', editingWarehouse.id), {
          name: editingWarehouse.name,
          location: editingWarehouse.location,
          phone: editingWarehouse.phone,
          address: editingWarehouse.address,
          manager: editingWarehouse.manager,
          email: editingWarehouse.email,
          workingHours: editingWarehouse.workingHours
        });
        showSuccess("تم تحديث بيانات الفرع");
        setEditingWarehouse(null);
        if (selectedWarehouse) {
          setSelectedWarehouse({...selectedWarehouse, ...editingWarehouse});
        }
      } catch (e) {
        console.error(e);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("فشل التحديث: " + e.message);
        }
      }
      setGlobalLoading(false);
   };

   const handleAssignUser = async (userId, assign) => {
      setGlobalLoading(true);
      try {
        await updateDoc(doc(db, 'employees', userId), {
          assignedWarehouseId: assign ? selectedWarehouse.id : 'main'
        });
        
        if (assign) {
          showSuccess("تم تعيين المستخدم للفرع");
          setAssignedUsers(prev => [...prev, allUsers.find(u => u.id === userId)]);
        } else {
          showSuccess("تم إلغاء تعيين المستخدم");
          setAssignedUsers(prev => prev.filter(u => u.id !== userId));
        }
      } catch (e) {
        console.error(e);
        if (e.code === 'permission-denied') {
          showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
        } else {
          showError("فشل تحديث تعيين المستخدم: " + e.message);
        }
      }
      setGlobalLoading(false);
   };

   const filteredUsers = allUsers.filter(user => 
     user.name?.toLowerCase().includes(searchUser.toLowerCase()) ||
     user.email?.toLowerCase().includes(searchUser.toLowerCase())
   );

   return (
      <div className="space-y-6 text-right" dir="rtl">
         
         {/* مودال نقل الأصناف */}
         {showTransferModal && (
           <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
               <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white">نقل الأصناف إلى فرع آخر</h3>
               <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                 تم تحديد <span className="font-bold text-indigo-600">{selectedItems.size}</span> صنف للنقل
               </p>
               
               <div className="space-y-4">
                 <div>
                   <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">الفرع المستهدف</label>
                   <select
                     className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-white dark:bg-slate-900"
                     value={transferData.toWarehouse}
                     onChange={e => setTransferData({...transferData, toWarehouse: e.target.value})}
                   >
                     <option value="">-- اختر الفرع --</option>
                     {warehouses
                       .filter(w => w.id !== selectedWarehouse?.id)
                       .map(w => (
                         <option key={w.id} value={w.id}>{w.name}</option>
                       ))}
                   </select>
                 </div>
                 
                 <div className="flex gap-2 pt-4">
                   <button
                     onClick={handleTransferItems}
                     className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700"
                   >
                     تأكيد النقل
                   </button>
                   <button
                     onClick={() => {
                       setShowTransferModal(false);
                       setTransferData({ toWarehouse: '', items: [] });
                     }}
                     className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
                   >
                     إلغاء
                   </button>
                 </div>
               </div>
             </div>
           </div>
         )}

         {/* مودال الحذف المجمع للمخزون */}
         {showBulkDeleteModal && (
           <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
             <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
               <h3 className="font-black text-lg mb-2 text-rose-600 flex items-center gap-2">
                 <TrashIcon size={20}/> حذف مجمع لمخزون الفرع
               </h3>
               <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                 أنت على وشك حذف <span className="font-bold text-rose-600">{selectedItems.size}</span> صنف من مخزون هذا الفرع بشكل نهائي.
               </p>
               <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
                 هذا الإجراء لا يمكن التراجع عنه. لتأكيد الحذف، اكتب "حذف" في الحقل أدناه.
               </p>
               
               <input
                 type="text"
                 className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-rose-500 mb-4 bg-white dark:bg-slate-900"
                 placeholder="اكتب 'حذف' للتأكيد"
                 value={bulkDeleteConfirm}
                 onChange={e => setBulkDeleteConfirm(e.target.value)}
               />
               
               <div className="flex gap-2">
                 <button
                   onClick={handleBulkDeleteInventory}
                   disabled={bulkDeleteConfirm !== 'حذف'}
                   className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   تأكيد الحذف
                 </button>
                 <button
                   onClick={() => {
                     setShowBulkDeleteModal(false);
                     setBulkDeleteConfirm('');
                   }}
                   className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
                 >
                   إلغاء
                 </button>
               </div>
             </div>
           </div>
         )}

         <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700">
            <h3 className="font-black text-xl mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
              <Store className="text-indigo-600"/> إضافة فرع جديد
            </h3>
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-3">
               <input 
                 required 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="اسم الفرع *" 
                 value={name} 
                 onChange={e=>setName(e.target.value)} 
               />
               <input 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="الموقع" 
                 value={location} 
                 onChange={e=>setLocation(e.target.value)} 
               />
               <input 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="رقم الهاتف" 
                 value={phone} 
                 onChange={e=>setPhone(e.target.value)} 
               />
               <input 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="مدير الفرع" 
                 value={manager} 
                 onChange={e=>setManager(e.target.value)} 
               />
               <input 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="البريد الإلكتروني" 
                 type="email"
                 value={email} 
                 onChange={e=>setEmail(e.target.value)} 
               />
               <input 
                 className="border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="ساعات العمل" 
                 value={workingHours} 
                 onChange={e=>setWorkingHours(e.target.value)} 
               />
               <textarea 
                 className="md:col-span-3 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none font-bold focus:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-sm" 
                 placeholder="العنوان بالتفصيل" 
                 value={address} 
                 onChange={e=>setAddress(e.target.value)} 
                 rows="2"
               />
               <button className="md:col-span-3 bg-slate-900 dark:bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-black dark:hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                 <Plus size={18}/> إضافة فرع
               </button>
            </form>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl shadow-sm overflow-hidden">
               <div className="p-4 border-b bg-slate-50 dark:bg-slate-900/50">
                  <h4 className="font-bold text-slate-600 dark:text-slate-400 text-sm">الفروع المتاحة</h4>
               </div>
               <div className="divide-y divide-slate-50 dark:divide-slate-700 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {warehouses.map(w => (
                     <button
                       key={w.id}
                       onClick={() => setSelectedWarehouse(w)}
                       className={`w-full p-4 text-right hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors flex justify-between items-center ${selectedWarehouse?.id === w.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-r-4 border-indigo-600' : ''}`}
                     >
                        <div className="flex items-center gap-3">
                           <MapPin size={18} className={selectedWarehouse?.id === w.id ? 'text-indigo-600' : 'text-slate-400'}/>
                           <div className="text-right">
                             <span className="font-bold text-slate-800 dark:text-white block">{w.name}</span>
                             {w.location && <span className="text-[10px] text-slate-500 dark:text-slate-400">{w.location}</span>}
                             {w.manager && <span className="text-[10px] text-indigo-400 block">مدير: {w.manager}</span>}
                           </div>
                        </div>
                        {w.id === 'main' && (
                          <span className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-full">رئيسي</span>
                        )}
                     </button>
                  ))}
               </div>
            </div>

            <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl shadow-sm overflow-hidden">
               {selectedWarehouse ? (
                  <div className="p-6">
                     <div className="flex justify-between items-start mb-6">
                        <div>
                           <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">{selectedWarehouse.name}</h3>
                           {selectedWarehouse.manager && (
                             <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">مدير الفرع: {selectedWarehouse.manager}</p>
                           )}
                           {selectedWarehouse.location && <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{selectedWarehouse.location}</p>}
                           {selectedWarehouse.phone && <p className="text-sm text-slate-600 dark:text-slate-400 mb-1" dir="ltr">{selectedWarehouse.phone}</p>}
                           {selectedWarehouse.email && <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{selectedWarehouse.email}</p>}
                           {selectedWarehouse.workingHours && <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">ساعات العمل: {selectedWarehouse.workingHours}</p>}
                           {selectedWarehouse.address && <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">{selectedWarehouse.address}</p>}
                           <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">آخر تحديث: {formatDate(selectedWarehouse.createdAt)}</p>
                        </div>
                        {appUser.role === 'admin' && (
                          <div className="flex gap-2">
                             <button
                               onClick={() => setEditingWarehouse(selectedWarehouse)}
                               className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-indigo-600 dark:hover:bg-indigo-700 hover:text-white transition-colors"
                               title="تعديل بيانات الفرع"
                             >
                                <Edit size={16}/>
                             </button>
                             {selectedWarehouse.id !== 'main' && (
                               <button
                                 onClick={() => handleDeleteWarehouse(selectedWarehouse.id)}
                                 className="p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-600 dark:hover:bg-rose-700 hover:text-white transition-colors"
                                 title="حذف الفرع"
                               >
                                  <Trash2 size={16}/>
                               </button>
                             )}
                          </div>
                        )}
                     </div>

                     <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                        <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl text-center">
                           <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">إجمالي القطع</p>
                           <p className="text-lg font-black text-indigo-800 dark:text-indigo-300">{warehouseStats.totalItems}</p>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl text-center">
                           <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">قيمة المخزون</p>
                           <p className="text-lg font-black text-emerald-800 dark:text-emerald-300">{warehouseStats.totalValue.toLocaleString()} ج</p>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-xl text-center">
                           <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">المستخدمون</p>
                           <p className="text-lg font-black text-purple-800 dark:text-purple-300">{warehouseStats.totalUsers}</p>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl text-center">
                           <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">التصنيفات</p>
                           <p className="text-lg font-black text-amber-800 dark:text-amber-300">{warehouseStats.totalCategories}</p>
                        </div>
                        <div className="bg-rose-50 dark:bg-rose-900/30 p-3 rounded-xl text-center">
                           <p className="text-xs text-rose-600 dark:text-rose-400 mb-1">مبيعات الشهر</p>
                           <p className="text-lg font-black text-rose-800 dark:text-rose-300">{warehouseStats.monthlySales.toLocaleString()} ج</p>
                        </div>
                     </div>

                     {editingWarehouse && editingWarehouse.id === selectedWarehouse.id && (
                       <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
                         <h4 className="font-bold text-sm text-indigo-900 dark:text-indigo-300 mb-3">تعديل بيانات الفرع</h4>
                         <div className="space-y-3">
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.name}
                             onChange={e => setEditingWarehouse({...editingWarehouse, name: e.target.value})}
                             placeholder="اسم الفرع"
                           />
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.location || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, location: e.target.value})}
                             placeholder="الموقع"
                           />
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.phone || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, phone: e.target.value})}
                             placeholder="رقم الهاتف"
                             dir="ltr"
                           />
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.email || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, email: e.target.value})}
                             placeholder="البريد الإلكتروني"
                             type="email"
                           />
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.manager || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, manager: e.target.value})}
                             placeholder="مدير الفرع"
                           />
                           <input
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                             value={editingWarehouse.workingHours || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, workingHours: e.target.value})}
                             placeholder="ساعات العمل"
                           />
                           <textarea
                             className="w-full border border-indigo-200 dark:border-indigo-800 p-2.5 rounded-lg font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900 resize-none"
                             value={editingWarehouse.address || ''}
                             onChange={e => setEditingWarehouse({...editingWarehouse, address: e.target.value})}
                             placeholder="العنوان"
                             rows="2"
                           />
                           <div className="flex gap-2">
                             <button onClick={handleUpdateWarehouse} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700">
                                <Save size={16}/> حفظ
                             </button>
                             <button onClick={() => setEditingWarehouse(null)} className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600">
                                <X size={16}/> إلغاء
                             </button>
                           </div>
                         </div>
                       </div>
                     )}

                     <div className="flex border-b mb-4">
                        <button 
                          onClick={() => setShowInventory(false)}
                          className={`px-4 py-2 text-sm font-bold ${!showInventory ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                          المستخدمون ({assignedUsers.length})
                        </button>
                        <button 
                          onClick={() => setShowInventory(true)}
                          className={`px-4 py-2 text-sm font-bold ${showInventory ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                          المخزون ({inventory.length})
                        </button>
                     </div>

                     {!showInventory ? (
                       <div className="space-y-4">
                          <div className="flex gap-2 mb-3">
                            <input
                              type="text"
                              placeholder="بحث عن مستخدم..."
                              className="flex-1 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-sm bg-white dark:bg-slate-900"
                              value={searchUser}
                              onChange={e => setSearchUser(e.target.value)}
                            />
                          </div>

                          <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <Users size={18} className="text-indigo-600"/>
                            المستخدمون الحاليون
                          </h4>

                          {assignedUsers.length > 0 ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                              {assignedUsers.map(user => {
                                const RoleIcon = getRoleIcon(user.role);
                                return (
                                  <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <div className="flex items-center gap-3">
                                      <RoleIcon size={16} className={`text-${getRoleColor(user.role)}-600`}/>
                                      <div>
                                        <p className="font-bold text-slate-800 dark:text-white">{user.name}</p>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{user.email}</p>
                                        {user.jobTitle && <p className="text-[9px] text-indigo-400">{user.jobTitle}</p>}
                                      </div>
                                    </div>
                                    {appUser.role === 'admin' && (
                                      <button
                                        onClick={() => handleAssignUser(user.id, false)}
                                        className="text-rose-500 hover:text-rose-700 p-1.5"
                                        title="إلغاء التعيين"
                                      >
                                        <UserX size={16}/>
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-slate-400 dark:text-slate-500 text-xs p-4 text-center border border-dashed rounded-xl">
                              لا يوجد مستخدمون معينون لهذا الفرع
                            </p>
                          )}

                          {appUser.role === 'admin' && (
                            <>
                              <h4 className="font-bold text-slate-700 dark:text-slate-300 mt-6 mb-3">تعيين مستخدمين جدد</h4>
                              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                {filteredUsers
                                  .filter(u => u.assignedWarehouseId !== selectedWarehouse.id && !u.isDisabled)
                                  .map(user => {
                                    const RoleIcon = getRoleIcon(user.role);
                                    return (
                                      <div key={user.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
                                        <div className="flex items-center gap-3">
                                          <RoleIcon size={16} className={`text-${getRoleColor(user.role)}-600`}/>
                                          <div>
                                            <p className="font-bold text-slate-800 dark:text-white">{user.name}</p>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{user.email}</p>
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => handleAssignUser(user.id, true)}
                                          className="text-indigo-600 hover:text-indigo-800 p-1.5"
                                          title="تعيين للفرع"
                                        >
                                          <UserPlus size={16}/>
                                        </button>
                                      </div>
                                    );
                                  })}
                              </div>
                            </>
                          )}
                       </div>
                     ) : (
                       <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                              <Package size={18} className="text-indigo-600"/>
                              مخزون الفرع
                            </h4>
                            <div className="flex gap-2">
                              {selectedItems.size > 0 && (
                                <>
                                  <button
                                    onClick={() => setShowTransferModal(true)}
                                    className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center gap-2"
                                  >
                                    <ArrowRightLeft size={14}/> نقل {selectedItems.size}
                                  </button>
                                  <button
                                    onClick={() => setShowBulkDeleteModal(true)}
                                    className="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center gap-2"
                                  >
                                    <TrashIcon size={14}/> حذف {selectedItems.size}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          
                          {inventory.length > 0 ? (
                            <div className="overflow-x-auto max-h-96 custom-scrollbar">
                              <table className="w-full text-right text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-bold text-xs">
                                  <tr>
                                    <th className="p-2 w-10">
                                      <input 
                                        type="checkbox" 
                                        className="w-4 h-4 accent-indigo-600"
                                        checked={selectedItems.size === inventory.length && inventory.length > 0}
                                        onChange={toggleSelectAll}
                                      />
                                    </th>
                                    <th className="p-2">السيريال</th>
                                    <th className="p-2">المنتج</th>
                                    <th className="p-2">التصنيف</th>
                                    <th className="p-2 text-center">الكمية</th>
                                    <th className="p-2 text-center">السعر</th>
                                    <th className="p-2 text-center">القيمة</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {inventory.map(item => (
                                    <tr key={item.id}>
                                      <td className="p-2">
                                        <input 
                                          type="checkbox" 
                                          className="w-4 h-4 accent-indigo-600"
                                          checked={selectedItems.has(item.id)}
                                          onChange={() => toggleSelectItem(item.id)}
                                        />
                                      </td>
                                      <td className="p-2 font-mono text-xs">{item.serialNumber}</td>
                                      <td className="p-2 font-bold">{item.name}</td>
                                      <td className="p-2 text-slate-600 dark:text-slate-400">{item.category || 'عام'}</td>
                                      <td className="p-2 text-center">{item.quantity}</td>
                                      <td className="p-2 text-center">{item.price * item.quantity} ج</td>
                                      <td className="p-2 text-center font-black text-indigo-600 dark:text-indigo-400">{(item.quantity * item.price).toLocaleString()} ج</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-slate-400 dark:text-slate-500 text-xs p-8 text-center border border-dashed rounded-xl">
                              لا يوجد مخزون في هذا الفرع
                            </p>
                          )}
                       </div>
                     )}
                  </div>
               ) : (
                 <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                    <Store size={48} className="mb-3 opacity-20"/>
                    <p className="font-bold">اختر فرعاً من القائمة لإدارة تفاصيله</p>
                 </div>
               )}
            </div>
         </div>
      </div>
   );
}
// ==========================================================================
// 🏪 نقطة البيع POS المحسنة مع تكامل كامل
// ==========================================================================
function POSManager({ appUser, systemSettings, notify, setGlobalLoading, warehouseMap }) { 
  const [sellQty, setSellQty] = useState(1);
  const [search, setSearch] = useState('');
  const [foundItem, setFoundItem] = useState(null);
  const [invoice, setInvoice] = useState({ 
    customerName: '', 
    phone: '', 
    email: '',
    discount: 0, 
    discountType: 'value', 
    taxEnabled: true, 
    installationFeeId: '', 
    technicianName: '',
    paymentMethod: 'cash',
    notes: '',
    bankTransferDetails: '',
    cardLastFour: ''
  });
  const [invoiceData, setInvoiceData] = useState(null);
  const [recentCustomers, setRecentCustomers] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [quickAmounts] = useState([100, 200, 500, 1000, 2000, 5000]);
  const [cart, setCart] = useState([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [paymentModal, setPaymentModal] = useState(false);
  const [cashReceived, setCashReceived] = useState(0);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrcode, setQrcode] = useState('');

  useEffect(() => {
    const fetchRecentCustomers = async () => {
      try {
        const q = query(collection(db, 'customers'), orderBy('lastPurchase', 'desc'), limit(5));
        const snap = await getDocs(q);
        setRecentCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching recent customers:", error);
      }
    };
    fetchRecentCustomers();
  }, []);

  const calculations = useMemo(() => {
    if (!foundItem && cart.length === 0) return { subtotal: 0, discountAmount: 0, taxAmount: 0, finalTotal: 0, installAmount: 0 };
    
    let subtotal = 0;
    if (foundItem) {
      subtotal = Number(foundItem.price) || 0;
    } else if (cart.length > 0) {
      subtotal = cart.reduce(
  (sum, item) => sum + ((Number(item.price) || 0) * (item.quantity || 1)),
  0
   );
    }

    const discountVal = Number(invoice.discount) || 0;
    let discountAmount = 0;
    if (invoice.discountType === 'percent') {
        discountAmount = subtotal * discountVal / 100;
    } else {
        discountAmount = discountVal;
    }
    discountAmount = Math.min(discountAmount, subtotal);
    
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxRate = Number(systemSettings.taxRate) || 14; 
    const taxAmount = invoice.taxEnabled ? (taxableAmount * (taxRate / 100)) : 0;
    const selectedFee = (systemSettings.installationFees || []).find(f => f.id === invoice.installationFeeId);
    const installAmount = Number(selectedFee?.value || 0);
    
    return { 
       subtotal, 
       discountAmount, 
       taxAmount, 
       installAmount, 
       finalTotal: Math.round(taxableAmount + taxAmount + installAmount) 
    };
  }, [foundItem, cart, invoice, systemSettings]);

  const handleSearch = async (e) => {
  e.preventDefault();
  if (!search.trim()) return;

  setSearchHistory(prev => [search, ...prev.slice(0, 4)]);
  setGlobalLoading(true);

  try {

    const searchTerm = search.trim().toLowerCase();

    const q = query(
      collection(db, 'inventory'),
      where('serialNumber', '==', searchTerm),
      where('isDeleted', '==', false),
      where('quantity', '>', 0)
    );

    const snap = await getDocs(q);

    if (!snap.empty) {

      const item = { id: snap.docs[0].id, ...snap.docs[0].data() };

      const existing = cart.find(i => i.id === item.id);

      if (existing) {
        setCart(cart.map(i =>
          i.id === item.id
            ? { ...i, quantity: (i.quantity || 1) + 1 }
            : i
        ));
      } else {
        const qtyRequested = Number(sellQty) || 1;
const availableQty = Number(item.quantity) || 0;

if(qtyRequested > availableQty){

  showError(`❌ الكمية المطلوبة (${qtyRequested}) أكبر من المتاح (${availableQty})`);
  setGlobalLoading(false);
  return;

}

const existing = cart.find(i => i.id === item.id);

if(existing){

  const newQty = existing.quantity + qtyRequested;

  if(newQty > availableQty){

    showError(`❌ تم تجاوز الحد المتاح في المخزن (${availableQty})`);
    setGlobalLoading(false);
    return;

  }

  setCart(cart.map(i =>
    i.id === item.id
      ? { ...i, quantity: newQty }
      : i
  ));

}else{

  setCart([...cart, { ...item, quantity: qtyRequested }]);

}

setSellQty(1);
setSearch('');
      }

      setSearch('');
      setFoundItem(null);

    } else {

      showError("الباركود غير صحيح أو الكمية غير متوفرة");
      setFoundItem(null);

    }

  } catch (err) {

    console.error(err);

    if (err.code === 'permission-denied') {
      showError("خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase");
    } else {
      showError("خطأ في البحث: " + err.message);
    }

  }

  setGlobalLoading(false);
};

  const handleSelectCustomer = (customer) => {
    setInvoice({
      ...invoice,
      customerName: customer.name,
      phone: customer.phone,
      email: customer.email || ''
    });
    setShowCustomerModal(false);
  };

  const handleAddNewCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone) {
      showError("الاسم ورقم الهاتف مطلوبان");
      return;
    }

    setGlobalLoading(true);
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        ...newCustomer,
        createdAt: serverTimestamp(),
        createdBy: appUser.id,
        createdByName: appUser.name,
        searchKey: normalizeSearch(`${newCustomer.name} ${newCustomer.phone} ${newCustomer.email || ''}`)
      });
      
      setInvoice({
        ...invoice,
        customerName: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email
      });
      
      setShowCustomerModal(false);
      setNewCustomer({ name: '', phone: '', email: '' });
      showSuccess("تم إضافة العميل بنجاح");
      
    } catch (error) {
      console.error(error);
      showError("حدث خطأ أثناء إضافة العميل");
    }
    setGlobalLoading(false);
  };

  const handleRemoveFromCart = (item) => {
    setCart(cart.filter(i => i.serialNumber !== item.serialNumber));
  };

  const handleClearCart = () => {
    setCart([]);
    setFoundItem(null);
  };

  const handleProcessPayment = () => {
    if (cart.length === 0 && !foundItem) {
      showError("السلة فارغة");
      return;
    }
    if (!invoice.customerName) {
      showError("يرجى اختيار عميل");
      return;
    }
    setPaymentModal(true);
  };

  const handleGenerateQR = () => {
    const qrData = {
      invoiceNumber: 'INV-' + Date.now().toString().slice(-8),
      total: calculations.finalTotal,
      customer: invoice.customerName,
      date: new Date().toISOString()
    };
    setQrcode(JSON.stringify(qrData));
    setShowQrModal(true);
  };

  const handleCheckout = async () => {
    if (cart.length === 0 && !foundItem) return showError("السلة فارغة");
    if (!invoice.customerName) return showError("يرجى إدخال اسم العميل");
    if (calculations.finalTotal < 0) return showError("الإجمالي لا يمكن أن يكون سالباً");
    
    const confirmed = await showConfirm(
      'تأكيد البيع',
      `هل أنت متأكد من إتمام عملية البيع بقيمة ${calculations.finalTotal} ج؟`
    );
    
    if (!confirmed) return;
    
    setGlobalLoading(true);
    const invId = 'INV-' + Date.now().toString().slice(-8);
    try {
       await runTransaction(db, async (t) => {
          const itemsToProcess = foundItem ? [foundItem] : cart;
          
          for (const item of itemsToProcess) {
            const itemRef = doc(db, 'inventory', item.id);
            const itemSnap = await t.get(itemRef);
            if (!itemSnap.exists()) throw new Error(`المنتج ${item.name} غير موجود!`);
            const currentQty = itemSnap.data().quantity || 0;
            if (currentQty <= 0) throw new Error(`نفدت كمية ${item.name}!`);
            
            t.update(itemRef, { quantity: currentQty - 1 });
          }

          const joinedNames = itemsToProcess.map(i => i.name).join(' + ');
          const joinedSerials = itemsToProcess.map(i => i.serialNumber).join(', ');

          const transactionData = { 
            ...calculations, 
            customerName: invoice.customerName,
            phone: invoice.phone,
            email: invoice.email,
            technicianName: invoice.technicianName,
            discount: Number(invoice.discount) || 0,
            discountType: invoice.discountType,
            taxEnabled: invoice.taxEnabled,
            installationFeeId: invoice.installationFeeId || null,
            paymentMethod: invoice.paymentMethod,
            paymentDetails: invoice.paymentMethod === 'card' ? { cardLastFour: invoice.cardLastFour } :
                           invoice.paymentMethod === 'transfer' ? { bankTransferDetails: invoice.bankTransferDetails } : {},
            notes: invoice.notes,
            type: 'sell', 
            items: itemsToProcess,
            itemName: joinedNames, 
            serialNumber: joinedSerials, 
            warehouseId: appUser.assignedWarehouseId || 'main', 
            operator: appUser.name || appUser.email || 'موظف', 
            invoiceNumber: invId, 
            timestamp: serverTimestamp() 
          };
          
          t.set(doc(collection(db, 'transactions')), transactionData);
          
          if (invoice.phone) {
            const customerQuery = query(collection(db, 'customers'), where('phone', '==', invoice.phone));
            const customerSnap = await getDocs(customerQuery);
            if (!customerSnap.empty) {
              const customerRef = doc(db, 'customers', customerSnap.docs[0].id);
              t.update(customerRef, {
                totalPurchases: increment(1),
                lastPurchase: serverTimestamp()
              });
            }
          }
       });
       
       await logUserActivity(appUser, 'إصدار فاتورة', `إصدار فاتورة #${invId} للعميل ${invoice.customerName} بقيمة ${calculations.finalTotal} ج`);

       setInvoiceData({ 
          items: foundItem ? [foundItem] : cart,
          ...invoice, 
          ...calculations, 
          invoiceNumber: invId, 
          date: new Date().toISOString(),
          operator: appUser.name || appUser.email
       });
       
       handleClearCart();
       setInvoice({ 
         customerName: '', 
         phone: '', 
         email: '',
         discount: 0, 
         discountType: 'value', 
         taxEnabled: true, 
         installationFeeId: '', 
         technicianName: '',
         paymentMethod: 'cash',
         notes: '',
         bankTransferDetails: '',
         cardLastFour: ''
       });
       
       showSuccess("تم البيع بنجاح");
       setPaymentModal(false);
    } catch(e) { 
       showError(e.message || "فشلت عملية البيع"); 
       console.error(e);
    }
    setGlobalLoading(false);
  };

  if (invoiceData) return <InvoiceRenderer data={invoiceData} systemSettings={systemSettings} onBack={()=>setInvoiceData(null)} />;

  const change = cashReceived - calculations.finalTotal;

  return (
    <div className="max-w-6xl mx-auto space-y-6" dir="rtl">
      
      {paymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white border-b pb-3">إتمام الدفع</h3>
            
            <div className="space-y-4">
              <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-xl">
                <p className="text-sm text-slate-600 dark:text-slate-400">المطلوب</p>
                <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{calculations.finalTotal} ج</p>
              </div>

              {invoice.paymentMethod === 'cash' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">المبلغ المدفوع</label>
                    <input
                      type="number"
                      className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-center text-lg bg-white dark:bg-slate-900"
                      value={cashReceived}
                      onChange={e => setCashReceived(Number(e.target.value))}
                      autoFocus
                    />
                  </div>
                  {cashReceived > 0 && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl">
                      <p className="text-sm text-slate-600 dark:text-slate-400">الباقي</p>
                      <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{Math.max(0, change)} ج</p>
                    </div>
                  )}
                </>
              )}

              {invoice.paymentMethod === 'card' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">آخر 4 أرقام من البطاقة</label>
                  <input
                    type="text"
                    maxLength="4"
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-center bg-white dark:bg-slate-900"
                    value={invoice.cardLastFour}
                    onChange={e => setInvoice({...invoice, cardLastFour: e.target.value})}
                  />
                </div>
              )}

              {invoice.paymentMethod === 'transfer' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">تفاصيل التحويل</label>
                  <textarea
                    className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold bg-white dark:bg-slate-900"
                    rows="3"
                    value={invoice.bankTransferDetails}
                    onChange={e => setInvoice({...invoice, bankTransferDetails: e.target.value})}
                    placeholder="رقم العملية، اسم البنك، التاريخ..."
                  />
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleCheckout}
                  disabled={invoice.paymentMethod === 'cash' && cashReceived < calculations.finalTotal}
                  className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50"
                >
                  تأكيد الدفع
                </button>
                <button
                  onClick={() => setPaymentModal(false)}
                  className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCustomerModal && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
           <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-md shadow-2xl">
             <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white border-b pb-3">إضافة عميل جديد</h3>
             <div className="space-y-4">
               <input
                 type="text"
                 placeholder="اسم العميل *"
                 className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                 value={newCustomer.name}
                 onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
               />
               <input
                 type="text"
                 placeholder="رقم الهاتف *"
                 className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                 value={newCustomer.phone}
                 onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
               />
               <input
                 type="email"
                 placeholder="البريد الإلكتروني"
                 className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 bg-white dark:bg-slate-900"
                 value={newCustomer.email}
                 onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
               />
               <div className="flex gap-2 pt-4">
                 <button
                   onClick={handleAddNewCustomer}
                   className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700"
                 >
                   حفظ وإضافة
                 </button>
                 <button
                   onClick={() => setShowCustomerModal(false)}
                   className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
                 >
                   إلغاء
                 </button>
               </div>
             </div>
           </div>
         </div>
      )}

      {showQrModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-lg mb-4 text-slate-800 dark:text-white border-b pb-3">رمز QR للفاتورة</h3>
            <div className="flex justify-center mb-4">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrcode)}`} alt="QR Code" className="w-48 h-48" />
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-700">
          <h2 className="text-2xl font-black mb-8 flex items-center gap-3 text-slate-800 dark:text-white">
            <Receipt className="text-indigo-600" size={26}/> نقطة البيع POS
          </h2>
          
          <form onSubmit={handleSearch} className="flex gap-3 mb-8 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
             <input 
               className="flex-1 border-none bg-transparent p-3 outline-none text-xl font-mono text-center tracking-widest text-slate-700 dark:text-slate-300 placeholder-slate-300 dark:placeholder-slate-600" 
               placeholder="مرر الباركود أو اكتب رقم المنتج..." 
               value={search} 
               onChange={e=>setSearch(e.target.value)} 
               autoFocus 
             />

              {/* حقل الكمية */}
            <input
              type="number"
              min="1"
              className="w-24 border border-slate-200 dark:border-slate-700 rounded-lg text-center font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-white"
              value={sellQty}
              onChange={e => setSellQty(Number(e.target.value) || 1)}
            />
             
             <button 
               type="submit" 
               className="bg-indigo-600 text-white px-8 rounded-lg font-bold text-sm shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2"
             >
                <Search size={18}/> إضافة
             </button>
          </form>

          {cart.length > 0 && (
            <div className="mb-6 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 border-b flex justify-between items-center">
                <h3 className="font-bold">السلة ({cart.length})</h3>
                <button
                  onClick={handleClearCart}
                  className="text-rose-500 hover:text-rose-700 text-sm font-bold"
                >
                  تفريغ السلة
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-white">{item.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{item.serialNumber}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-black text-indigo-600 dark:text-indigo-400">{item.price * item.quantity} ج</span>
                      <button
                        onClick={() => handleRemoveFromCart(item)}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <X size={16}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
             <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">العميل</label>
                <div className="relative flex gap-2">
                   <div className="flex-1 relative">
                      <User className="absolute right-3 top-3 text-slate-400" size={18}/>
                      <input 
                        className="w-full border border-slate-200 dark:border-slate-700 pr-10 p-3 rounded-xl font-bold focus:border-indigo-500 outline-none text-sm bg-white dark:bg-slate-900" 
                        placeholder="اسم العميل" 
                        value={invoice.customerName} 
                        onChange={e=>setInvoice({...invoice, customerName:e.target.value})} 
                        required
                      />
                   </div>
                   <button
                     onClick={() => setShowCustomerModal(true)}
                     className="px-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                     title="إضافة عميل جديد"
                   >
                     <UserPlus size={18}/>
                   </button>
                </div>
                
                {recentCustomers.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-[9px] text-slate-400 dark:text-slate-500">أخر العملاء:</span>
                    {recentCustomers.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className="text-[9px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
             </div>
             <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">رقم الهاتف</label>
                <div className="relative">
                   <Phone className="absolute right-3 top-3 text-slate-400" size={18}/>
                   <input 
                     className="w-full border border-slate-200 dark:border-slate-700 pr-10 p-3 rounded-xl font-bold font-mono focus:border-indigo-500 outline-none text-sm bg-white dark:bg-slate-900" 
                     placeholder="01XXXXXXXXX" 
                     value={invoice.phone} 
                     onChange={e=>setInvoice({...invoice, phone:e.target.value})} 
                   />
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 mb-6">
              <div>
                 <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1">الفني</label>
                 <select 
                   className="w-full p-2.5 border border-indigo-100 dark:border-indigo-800 rounded-xl bg-white dark:bg-slate-900 font-bold text-xs outline-none focus:border-indigo-500" 
                   value={invoice.technicianName} 
                   onChange={e=>setInvoice({...invoice, technicianName: e.target.value})}
                 >
                    <option value="">-- بدون فني --</option>
                    {(systemSettings.technicians || []).map((t, idx) => <option key={idx} value={t}>{t}</option>)}
                 </select>
              </div>
              <div>
                  <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1">الخصم</label>
                  <div className="flex bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-800 overflow-hidden">
                    <input 
                      type="number" 
                      className="flex-1 p-2.5 outline-none font-bold text-center text-rose-600 dark:text-rose-400 text-sm bg-transparent" 
                      value={invoice.discount} 
                      onChange={e=>setInvoice({...invoice, discount: e.target.value})} 
                      min="0"
                      placeholder="0"
                    />
                    <select 
                      className="bg-slate-50 dark:bg-slate-800 px-3 font-bold text-xs border-r border-slate-100 dark:border-slate-700 outline-none" 
                      value={invoice.discountType} 
                      onChange={e=>setInvoice({...invoice, discountType: e.target.value})}
                    >
                      <option value="value">ج.م</option>
                      <option value="percent">%</option>
                    </select>
                  </div>
                </div>
              <div>
                 <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1">الرسوم</label>
                 <select 
                   className="w-full p-2.5 border border-indigo-100 dark:border-indigo-800 rounded-xl bg-white dark:bg-slate-900 font-bold text-xs outline-none focus:border-indigo-500" 
                   value={invoice.installationFeeId} 
                   onChange={e=>setInvoice({...invoice, installationFeeId: e.target.value})}
                 >
                    <option value="">بدون رسوم</option>
                    {(systemSettings.installationFees || []).map(f => <option key={f.id} value={f.id}>{f.label} (+{f.value} ج)</option>)}
                 </select>
              </div>
              <div>
                 <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1">طريقة الدفع</label>
                 <select 
                   className="w-full p-2.5 border border-indigo-100 dark:border-indigo-800 rounded-xl bg-white dark:bg-slate-900 font-bold text-xs outline-none focus:border-indigo-500" 
                   value={invoice.paymentMethod}
                   onChange={e => setInvoice({...invoice, paymentMethod: e.target.value})}
                 >
                    <option value="cash">نقداً</option>
                    <option value="card">بطاقة</option>
                    <option value="transfer">تحويل بنكي</option>
                 </select>
              </div>
              <div>
                 <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1">الضريبة</label>
                 <button 
                   type="button" 
                   onClick={()=>setInvoice({...invoice, taxEnabled: !invoice.taxEnabled})} 
                   className={`w-full p-2.5 rounded-xl font-bold text-xs transition-all border ${invoice.taxEnabled ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}
                 >
                    {invoice.taxEnabled ? 'مطبقة' : 'غير مطبقة'}
                 </button>
              </div>
          </div>

          <div className="bg-gradient-to-l from-indigo-900 to-purple-900 text-white p-8 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center border-t-4 border-emerald-500 mb-6">
             <div className="text-right text-xs font-bold text-indigo-100 space-y-1.5">
                <p>المجموع الفرعي: <span className="text-white mr-2">{calculations.subtotal}</span></p>
                {calculations.discountAmount > 0 && 
                  <p className="text-rose-300">الخصم: <span className="mr-2">-{calculations.discountAmount.toFixed(1)}</span></p>
                }
                <p>الضريبة: <span className="text-white mr-2">+{calculations.taxAmount.toFixed(1)}</span></p>
                {calculations.installAmount > 0 && 
                  <p>الرسوم: <span className="text-white mr-2">+{calculations.installAmount}</span></p>
                }
             </div>
             <div className="text-center md:text-left w-full md:w-auto">
                <p className="text-[10px] text-indigo-200 mb-0.5">الصافي للدفع</p>
                <span className="text-5xl font-black text-emerald-400 tracking-tighter">
                  {calculations.finalTotal.toLocaleString()} <span className="text-sm font-normal">ج.م</span>
                </span>
             </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button 
              onClick={handleProcessPayment}
              disabled={cart.length === 0 && !foundItem}
              className="flex-1 bg-emerald-500 text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-emerald-600 transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
            >
               <CheckCircle size={24}/> إتمام البيع
            </button>
            <button 
              onClick={handleGenerateQR}
              disabled={calculations.finalTotal === 0}
              className="px-6 bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
               <ImageIcon size={24}/>
            </button>
          </div>
      </div>
    </div>
  );
}

// ==========================================================================
// ⚙️ صفحة الإعدادات المركزية المتكاملة (معدلة - حذف Faults Tab)
// ==========================================================================
function SettingsManager({ systemSettings, setSettings, notify, setGlobalLoading, appUser }) {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setLocalSettings] = useState(systemSettings);
  const [logoPreview, setLogoPreview] = useState(systemSettings.invoiceLogo || '');
  const [backupList, setBackupList] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState({ name: '', permissions: [] });

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
      } catch (error) {
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
          { id: 'import_data', label: 'استيراد بيانات (Excel)', icon: UploadCloud }
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
const getAllDocs = async (collectionName) => {
  try {
    const snap = await getDocs(collection(db, collectionName));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error(`Error fetching ${collectionName}:`, error);
    return [];
  }
};


// ==========================================================================
// 🏷️ إدارة المنتجات والموديلات (معدل لـ 5 مستويات)
// ==========================================================================
function ProductModelManager({ systemSettings, setLocalSettings }) {
  const [products, setProducts] = useState([]);
  const [models, setModels] = useState([]);
  const [mainFaults, setMainFaults] = useState([]);
  const [subFaults, setSubFaults] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedMainFaultId, setSelectedMainFaultId] = useState('');
  
  const [newProduct, setNewProduct] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newMainFault, setNewMainFault] = useState({ code: '', description: '' });
  const [newSubFault, setNewSubFault] = useState({ code: '', description: '' });

  // تحميل المنتجات
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const snap = await getDocs(collection(db, 'products'));
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const addProduct = async () => {
    if (!newProduct.trim()) return;
    await addDoc(collection(db, 'products'), { name: newProduct.trim(), createdAt: serverTimestamp() });
    setNewProduct('');
    loadProducts();
  };

  const deleteProduct = async (id) => {
    // حذف جميع الموديلات المرتبطة بهذا المنتج
    const modelsSnap = await getDocs(query(collection(db, 'models'), where('productId', '==', id)));
    for (const modelDoc of modelsSnap.docs) {
      // حذف أكواد الأعطال الرئيسية والفرعية المرتبطة بكل موديل
      const mainFaultsSnap = await getDocs(query(collection(db, 'mainFaultCodes'), where('modelId', '==', modelDoc.id)));
      for (const mainFaultDoc of mainFaultsSnap.docs) {
        const subFaultsSnap = await getDocs(query(collection(db, 'subFaultCodes'), where('mainFaultId', '==', mainFaultDoc.id)));
        for (const subFaultDoc of subFaultsSnap.docs) {
          await deleteDoc(doc(db, 'subFaultCodes', subFaultDoc.id));
        }
        await deleteDoc(doc(db, 'mainFaultCodes', mainFaultDoc.id));
      }
      await deleteDoc(doc(db, 'models', modelDoc.id));
    }
    await deleteDoc(doc(db, 'products', id));
    loadProducts();
    if (selectedProductId === id) {
      setSelectedProductId('');
      setSelectedModelId('');
      setSelectedMainFaultId('');
    }
  };

  // تحميل الموديلات عند اختيار منتج
  useEffect(() => {
    if (selectedProductId) {
      const q = query(collection(db, 'models'), where('productId', '==', selectedProductId));
      const unsub = onSnapshot(q, snap => setModels(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      return unsub;
    } else {
      setModels([]);
      setSelectedModelId('');
    }
  }, [selectedProductId]);

  const addModel = async () => {
    if (!selectedProductId || !newModel.trim()) return;
    await addDoc(collection(db, 'models'), { productId: selectedProductId, name: newModel.trim() });
    setNewModel('');
  };

  const deleteModel = async (modelId) => {
    // حذف أكواد الأعطال الرئيسية والفرعية المرتبطة بهذا الموديل
    const mainFaultsSnap = await getDocs(query(collection(db, 'mainFaultCodes'), where('modelId', '==', modelId)));
    for (const mainFaultDoc of mainFaultsSnap.docs) {
      const subFaultsSnap = await getDocs(query(collection(db, 'subFaultCodes'), where('mainFaultId', '==', mainFaultDoc.id)));
      for (const subFaultDoc of subFaultsSnap.docs) {
        await deleteDoc(doc(db, 'subFaultCodes', subFaultDoc.id));
      }
      await deleteDoc(doc(db, 'mainFaultCodes', mainFaultDoc.id));
    }
    await deleteDoc(doc(db, 'models', modelId));
  };

  // تحميل أكواد الأعطال الرئيسية عند اختيار موديل
  useEffect(() => {
    if (selectedModelId) {
      const q = query(collection(db, 'mainFaultCodes'), where('modelId', '==', selectedModelId));
      const unsub = onSnapshot(q, snap => setMainFaults(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      return unsub;
    } else {
      setMainFaults([]);
      setSelectedMainFaultId('');
    }
  }, [selectedModelId]);

  const addMainFault = async () => {
    if (!selectedModelId || !newMainFault.code.trim() || !newMainFault.description.trim()) return;
    await addDoc(collection(db, 'mainFaultCodes'), {
      modelId: selectedModelId,
      code: newMainFault.code.trim(),
      description: newMainFault.description.trim()
    });
    setNewMainFault({ code: '', description: '' });
  };

  const deleteMainFault = async (mainFaultId) => {
    // حذف أكواد الأعطال الفرعية المرتبطة
    const subFaultsSnap = await getDocs(query(collection(db, 'subFaultCodes'), where('mainFaultId', '==', mainFaultId)));
    for (const subFaultDoc of subFaultsSnap.docs) {
      await deleteDoc(doc(db, 'subFaultCodes', subFaultDoc.id));
    }
    await deleteDoc(doc(db, 'mainFaultCodes', mainFaultId));
  };

  // تحميل أكواد الأعطال الفرعية عند اختيار كود رئيسي
  useEffect(() => {
    if (selectedMainFaultId) {
      const q = query(collection(db, 'subFaultCodes'), where('mainFaultId', '==', selectedMainFaultId));
      const unsub = onSnapshot(q, snap => setSubFaults(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      return unsub;
    } else {
      setSubFaults([]);
    }
  }, [selectedMainFaultId]);

  const addSubFault = async () => {
    if (!selectedMainFaultId || !newSubFault.code.trim() || !newSubFault.description.trim()) return;
    await addDoc(collection(db, 'subFaultCodes'), {
      mainFaultId: selectedMainFaultId,
      code: newSubFault.code.trim(),
      description: newSubFault.description.trim()
    });
    setNewSubFault({ code: '', description: '' });
  };

  const deleteSubFault = async (subFaultId) => {
    await deleteDoc(doc(db, 'subFaultCodes', subFaultId));
  };

  const getProductName = (productId) => {
    return products.find(p => p.id === productId)?.name || '';
  };

  const getModelName = (modelId) => {
    return models.find(m => m.id === modelId)?.name || '';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* قسم المنتجات */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border">
        <h3 className="font-bold text-indigo-600 mb-4 flex items-center gap-2">
          <Package size={18}/> المنتجات
        </h3>
        <div className="flex gap-2 mb-4">
          <input className="flex-1 border p-3 rounded-xl" placeholder="اسم المنتج" value={newProduct} onChange={e => setNewProduct(e.target.value)} />
          <button onClick={addProduct} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold">إضافة</button>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {products.map(p => (
            <div key={p.id} className={`flex justify-between items-center p-3 rounded-xl cursor-pointer ${selectedProductId === p.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 border' : 'hover:bg-slate-50'}`}>
              <button onClick={() => setSelectedProductId(p.id)} className="font-bold flex-1 text-right">{p.name}</button>
              <button onClick={() => deleteProduct(p.id)} className="text-rose-500 p-2">🗑️</button>
            </div>
          ))}
        </div>
      </div>

      {/* قسم الموديلات */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border">
        <h3 className="font-bold text-indigo-600 mb-4 flex items-center gap-2">
          <Layers size={18}/> الموديلات {selectedProductId && `لـ ${getProductName(selectedProductId)}`}
        </h3>
        {!selectedProductId ? (
          <p className="text-center text-slate-400 py-8 text-sm">اختر منتجاً أولاً</p>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              <input className="flex-1 border p-3 rounded-xl" placeholder="اسم الموديل" value={newModel} onChange={e => setNewModel(e.target.value)} />
              <button onClick={addModel} className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold">إضافة</button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {models.map(m => (
                <div key={m.id} className={`flex justify-between items-center p-3 rounded-xl cursor-pointer ${selectedModelId === m.id ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-500 border' : 'hover:bg-slate-50'}`}>
                  <button onClick={() => setSelectedModelId(m.id)} className="font-bold flex-1 text-right">{m.name}</button>
                  <button onClick={() => deleteModel(m.id)} className="text-rose-500 p-2">🗑️</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* قسم أكواد الأعطال الرئيسية */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border">
        <h3 className="font-bold text-indigo-600 mb-4 flex items-center gap-2">
          <AlertCircle size={18}/> أكواد الأعطال الرئيسية {selectedModelId && `لـ ${getModelName(selectedModelId)}`}
        </h3>
        {!selectedModelId ? (
          <p className="text-center text-slate-400 py-8 text-sm">اختر موديلاً أولاً</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <input className="border p-3 rounded-xl" placeholder="الكود (مثال: ERR-001)" value={newMainFault.code} onChange={e => setNewMainFault({...newMainFault, code: e.target.value})} />
              <input className="border p-3 rounded-xl" placeholder="الوصف" value={newMainFault.description} onChange={e => setNewMainFault({...newMainFault, description: e.target.value})} />
            </div>
            <button onClick={addMainFault} className="w-full mb-4 bg-amber-600 text-white py-3 rounded-xl font-bold">إضافة كود رئيسي</button>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {mainFaults.map(f => (
                <div key={f.id} className={`flex justify-between items-center p-3 rounded-xl cursor-pointer ${selectedMainFaultId === f.id ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-500 border' : 'hover:bg-slate-50'}`}>
                  <button onClick={() => setSelectedMainFaultId(f.id)} className="flex-1 text-right">
                    <span className="font-mono font-bold">{f.code}</span> – {f.description}
                  </button>
                  <button onClick={() => deleteMainFault(f.id)} className="text-rose-500 p-2">🗑️</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* قسم أكواد الأعطال الفرعية */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border">
        <h3 className="font-bold text-indigo-600 mb-4 flex items-center gap-2">
          <GitBranch size={18}/> أكواد الأعطال الفرعية
        </h3>
        {!selectedMainFaultId ? (
          <p className="text-center text-slate-400 py-8 text-sm">اختر كود عطل رئيسياً أولاً</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <input className="border p-3 rounded-xl" placeholder="الكود الفرعي" value={newSubFault.code} onChange={e => setNewSubFault({...newSubFault, code: e.target.value})} />
              <input className="border p-3 rounded-xl" placeholder="الوصف" value={newSubFault.description} onChange={e => setNewSubFault({...newSubFault, description: e.target.value})} />
            </div>
            <button onClick={addSubFault} className="w-full mb-4 bg-purple-600 text-white py-3 rounded-xl font-bold">إضافة كود فرعي</button>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {subFaults.map(f => (
                <div key={f.id} className="flex justify-between items-center p-3 rounded-xl hover:bg-slate-50">
                  <div className="flex-1 text-right">
                    <span className="font-mono font-bold">{f.code}</span> – {f.description}
                  </div>
                  <button onClick={() => deleteSubFault(f.id)} className="text-rose-500 p-2">🗑️</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ==========================================================================
// 🏷️ إدارة أكواد الأعطال
// ==========================================================================
function FaultCodeManager() {
  const [faults, setFaults] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    const loadModels = async () => {
      const snap = await getDocs(collection(db, 'models'));
      setModels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    loadModels();
  }, []);

  useEffect(() => {
    if (selectedModelId) {
      const q = query(collection(db, 'faultCodes'), where('modelId', '==', selectedModelId));
      const unsub = onSnapshot(q, snap => setFaults(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      return unsub;
    } else {
      setFaults([]);
    }
  }, [selectedModelId]);

  const addFault = async () => {
    if (!selectedModelId || !newCode.trim() || !newDesc.trim()) return;
    await addDoc(collection(db, 'faultCodes'), { modelId: selectedModelId, code: newCode.trim(), description: newDesc.trim() });
    setNewCode('');
    setNewDesc('');
  };

  const deleteFault = async (id) => {
    await deleteDoc(doc(db, 'faultCodes', id));
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border">
      <h3 className="font-bold text-indigo-600 mb-4">أكواد الأعطال</h3>
      <div className="mb-4">
        <label className="block text-sm font-bold mb-1">اختر الموديل</label>
        <select className="w-full border p-3 rounded-xl" value={selectedModelId} onChange={e => setSelectedModelId(e.target.value)}>
          <option value="">-- اختر موديل --</option>
          {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      {selectedModelId && (
        <>
          <div className="flex gap-2 mb-4">
            <input className="flex-1 border p-3 rounded-xl" placeholder="الكود (مثال: ERR-001)" value={newCode} onChange={e => setNewCode(e.target.value)} />
            <input className="flex-2 border p-3 rounded-xl" placeholder="وصف العطل" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            <button onClick={addFault} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold">إضافة</button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {faults.map(f => (
              <div key={f.id} className="flex justify-between items-center p-3 border-b">
                <div><span className="font-mono font-bold">{f.code}</span> – {f.description}</div>
                <button onClick={() => deleteFault(f.id)} className="text-rose-500">حذف</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


// ==========================================================================
// 📊 مكون استيراد المنتجات والموديلات وأكواد الأعطال (معدل لـ 5 مستويات)
// مع تحميل قالب Excel جاهز وربط تلقائي
// ==========================================================================
function ExcelImportManager() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importLog, setImportLog] = useState([]);
  const [previewData, setPreviewData] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [importStats, setImportStats] = useState({ products: 0, models: 0, mainFaults: 0, subFaults: 0 });

  // تحميل قالب الاستيراد الجاهز
  const downloadTemplate = () => {
    const templateRows = [
      ['product_name', 'model_name', 'main_fault_code', 'main_fault_description', 'sub_fault_code', 'sub_fault_description', 'product_code'],
      ['نوفال مكنسة', 'LM5700', 'ERR-001', 'الجهاز لا يعمل', 'SUB-001', 'لا يوجد طاقة', 'NV-MK-001'],
      ['نوفال مكنسة', 'LM5700', 'ERR-001', 'الجهاز لا يعمل', 'SUB-002', 'سلك الكهرباء مقطوع', 'NV-MK-002'],
      ['نوفال مكنسة', 'LM5700', 'ERR-002', 'شفط ضعيف', 'SUB-003', 'فلتر مسدود', 'NV-MK-003'],
      ['خلاط نوفال', 'BL-2000', 'ERR-101', 'الموتور لا يعمل', 'SUB-101', 'دوار الموتور تالف', 'NV-BL-001'],
      ['خلاط نوفال', 'BL-2000', 'ERR-101', 'الموتور لا يعمل', 'SUB-102', 'مكثف تالف', 'NV-BL-002'],
      ['تكييف نوفال', 'AC-1.5', 'ERR-201', 'لا يبرد', 'SUB-201', 'نقص غاز', 'NV-AC-001'],
      ['تكييف نوفال', 'AC-1.5', 'ERR-201', 'لا يبرد', 'SUB-202', 'كمبروسر تالف', 'NV-AC-002'],
      ['تكييف نوفال', 'AC-2.25', 'ERR-201', 'لا يبرد', 'SUB-201', 'نقص غاز', 'NV-AC-003'],
      ['غسالة نوفال', 'WM-800', 'ERR-301', 'لا تصرف الماء', 'SUB-301', 'طلمبة تالفة', 'NV-WM-001'],
      ['غسالة نوفال', 'WM-800', 'ERR-302', 'لا تعصر', 'SUB-302', 'حزام تالف', 'NV-WM-002']
    ];
    
    // إنشاء محتوى CSV
    const csvContent = templateRows.map(row => {
      // التعامل مع الخلايا التي قد تحتوي على فواصل داخل النص
      return row.map(cell => {
        if (cell.includes(',')) {
          return `"${cell}"`;
        }
        return cell;
      }).join(',');
    }).join('\n');
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'products_models_faults_template_5levels.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    showSuccess("تم تحميل قالب الاستيراد (5 مستويات)");
  };

  const handleFileUpload = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.xlsx')) {
      showError("يرجى رفع ملف CSV أو Excel فقط");
      return;
    }
    
    setFile(selectedFile);
    setImportLog([]);
    setImportStats({ products: 0, models: 0, mainFaults: 0, subFaults: 0 });
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsedData = parseCSVData(text);
      setPreviewData(parsedData.slice(0, 100));
      setShowPreview(true);
    };
    reader.readAsText(selectedFile, 'UTF-8');
  };

  const parseCSVData = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    // قراءة الهيدر (الأعمدة)
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    
    // التأكد من وجود الأعمدة المطلوبة
    const requiredColumns = ['product_name', 'model_name'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
      showError(`الأعمدة المطلوبة غير موجودة: ${missingColumns.join(', ')}`);
      return [];
    }
    
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 2) continue;
      
      const row = {
        product_name: values[0]?.trim(),
        model_name: values[1]?.trim(),
        main_fault_code: values[2]?.trim(),
        main_fault_description: values[3]?.trim(),
        sub_fault_code: values[4]?.trim(),
        sub_fault_description: values[5]?.trim(),
        product_code: values[6]?.trim()
      };
      
      // تخطي الصفوف الفارغة أو التي لا تحتوي على منتج وموديل
      if (row.product_name && row.model_name) {
        results.push(row);
      }
    }
    
    return results;
  };

  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const addLog = (message, type = 'info') => {
    setImportLog(prev => [...prev, { type, message, timestamp: new Date().toLocaleTimeString() }]);
  };

  const getLogColor = (type) => {
    switch(type) {
      case 'success': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30';
      case 'error': return 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30';
      case 'warning': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50';
    }
  };

  const handleImport = async () => {
    if (!previewData.length) {
      showError("لا توجد بيانات للاستيراد");
      return;
    }
    
    const confirmed = await showConfirm(
      'تأكيد الاستيراد',
      `سيتم استيراد ${previewData.length} صف من البيانات. سيتم إنشاء المنتجات والموديلات وأكواد الأعطال (رئيسية وفرعية) تلقائياً مع الربط بينها.`,
      'info',
      'نعم، استيراد'
    );
    
    if (!confirmed) return;
    
    setLoading(true);
    setImportLog([{ type: 'info', message: 'بدء عملية الاستيراد...', timestamp: new Date().toLocaleTimeString() }]);
    
    let productsCreated = 0;
    let modelsCreated = 0;
    let mainFaultsCreated = 0;
    let subFaultsCreated = 0;
    let errors = [];
    
    try {
      // جلب البيانات الموجودة مسبقاً لتجنب التكرار
      const existingProductsSnap = await getDocs(collection(db, 'products'));
      const existingProducts = new Map();
      existingProductsSnap.docs.forEach(doc => {
        existingProducts.set(doc.data().name, doc.id);
      });
      
      const existingModelsSnap = await getDocs(collection(db, 'models'));
      const existingModels = new Map();
      existingModelsSnap.docs.forEach(doc => {
        const key = `${doc.data().productId}_${doc.data().name}`;
        existingModels.set(key, doc.id);
      });
      
      const existingMainFaultsSnap = await getDocs(collection(db, 'mainFaultCodes'));
      const existingMainFaults = new Map();
      existingMainFaultsSnap.docs.forEach(doc => {
        const key = `${doc.data().modelId}_${doc.data().code}`;
        existingMainFaults.set(key, doc.id);
      });
      
      const existingSubFaultsSnap = await getDocs(collection(db, 'subFaultCodes'));
      const existingSubFaults = new Set();
      existingSubFaultsSnap.docs.forEach(doc => {
        existingSubFaults.add(`${doc.data().mainFaultId}_${doc.data().code}`);
      });
      
      let processed = 0;
      const total = previewData.length;
      
      for (const row of previewData) {
        try {
          processed++;
          addLog(`جاري معالجة ${processed}/${total}: ${row.product_name} - ${row.model_name}`, 'info');
          
          // 1. إنشاء المنتج إذا لم يكن موجوداً
          let productId = existingProducts.get(row.product_name);
          if (!productId) {
            const productRef = await addDoc(collection(db, 'products'), {
              name: row.product_name,
              createdAt: serverTimestamp()
            });
            productId = productRef.id;
            existingProducts.set(row.product_name, productId);
            productsCreated++;
            addLog(`✅ تم إنشاء المنتج: ${row.product_name}`, 'success');
          }
          
          // 2. إنشاء الموديل إذا لم يكن موجوداً
          const modelKey = `${productId}_${row.model_name}`;
          let modelId = existingModels.get(modelKey);
          if (!modelId) {
            const modelRef = await addDoc(collection(db, 'models'), {
              productId: productId,
              name: row.model_name,
              createdAt: serverTimestamp()
            });
            modelId = modelRef.id;
            existingModels.set(modelKey, modelId);
            modelsCreated++;
            addLog(`✅ تم إنشاء الموديل: ${row.model_name} (تابع لـ ${row.product_name})`, 'success');
          }
          
          // 3. إنشاء كود العطل الرئيسي إذا كان موجوداً في البيانات
          if (row.main_fault_code && row.main_fault_description) {
            const mainFaultKey = `${modelId}_${row.main_fault_code}`;
            let mainFaultId = existingMainFaults.get(mainFaultKey);
            if (!mainFaultId) {
              const mainFaultRef = await addDoc(collection(db, 'mainFaultCodes'), {
                modelId: modelId,
                code: row.main_fault_code,
                description: row.main_fault_description,
                createdAt: serverTimestamp()
              });
              mainFaultId = mainFaultRef.id;
              existingMainFaults.set(mainFaultKey, mainFaultId);
              mainFaultsCreated++;
              addLog(`✅ تم إنشاء كود العطل الرئيسي: ${row.main_fault_code} - ${row.main_fault_description.substring(0, 30)}...`, 'success');
            }
            
            // 4. إنشاء كود العطل الفرعي إذا كان موجوداً في البيانات
            if (row.sub_fault_code && row.sub_fault_description) {
              const subFaultKey = `${mainFaultId}_${row.sub_fault_code}`;
              if (!existingSubFaults.has(subFaultKey)) {
                await addDoc(collection(db, 'subFaultCodes'), {
                  mainFaultId: mainFaultId,
                  code: row.sub_fault_code,
                  description: row.sub_fault_description,
                  productCode: row.product_code || '',
                  createdAt: serverTimestamp()
                });
                existingSubFaults.add(subFaultKey);
                subFaultsCreated++;
                addLog(`✅ تم إنشاء كود العطل الفرعي: ${row.sub_fault_code} - ${row.sub_fault_description.substring(0, 30)}...${row.product_code ? ` (كود المنتج: ${row.product_code})` : ''}`, 'success');
              } else {
                addLog(`⚠️ كود العطل الفرعي ${row.sub_fault_code} موجود مسبقاً`, 'warning');
              }
            }
          }
          
        } catch (err) {
          errors.push(`${row.product_name} - ${row.model_name}: ${err.message}`);
          addLog(`❌ خطأ في استيراد: ${row.product_name} - ${row.model_name}: ${err.message}`, 'error');
        }
      }
      
      setImportStats({
        products: productsCreated,
        models: modelsCreated,
        mainFaults: mainFaultsCreated,
        subFaults: subFaultsCreated
      });
      
      addLog(`✅ تم اكتمال الاستيراد!`, 'success');
      addLog(`📦 المنتجات: تم إنشاء ${productsCreated} منتج جديد`, 'success');
      addLog(`🔧 الموديلات: تم إنشاء ${modelsCreated} موديل جديد`, 'success');
      addLog(`⚠️ أكواد الأعطال الرئيسية: تم إنشاء ${mainFaultsCreated} كود جديد`, 'success');
      addLog(`🔹 أكواد الأعطال الفرعية: تم إنشاء ${subFaultsCreated} كود جديد`, 'success');
      
      if (errors.length > 0) {
        addLog(`⚠️ عدد الأخطاء: ${errors.length}`, 'warning');
      }
      
      showSuccess(`تم استيراد ${previewData.length} صف بنجاح. تم إنشاء ${productsCreated} منتج، ${modelsCreated} موديل، ${mainFaultsCreated} كود رئيسي، ${subFaultsCreated} كود فرعي.`);
      
      setFile(null);
      setPreviewData([]);
      setShowPreview(false);
      document.getElementById('excelFileInput').value = '';
      
    } catch (error) {
      console.error('Import error:', error);
      addLog(`❌ خطأ عام في الاستيراد: ${error.message}`, 'error');
      showError("حدث خطأ أثناء عملية الاستيراد");
    }
    
    setLoading(false);
  };
  
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* شرح طريقة الاستيراد */}
      <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
        <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
          <Info size={18}/> تعليمات استيراد البيانات (5 مستويات)
        </h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
          <li>قم بتحميل قالب Excel من الزر أدناه</li>
          <li>املأ البيانات في الأعمدة: product_name, model_name, main_fault_code, main_fault_description, sub_fault_code, sub_fault_description, product_code</li>
          <li>نفس المنتج يمكن أن يتكرر مع عدة موديلات</li>
          <li>نفس الموديل يمكن أن يتكرر مع عدة أكواد أعطال رئيسية</li>
          <li>نفس الكود الرئيسي يمكن أن يتكرر مع عدة أكواد فرعية</li>
          <li>كود المنتج (product_code) مرتبط بالكود الفرعي ويمكن إدخاله يدوياً</li>
          <li>البيانات المكررة لن تُضاف مرة أخرى (يتم تخطيها تلقائياً)</li>
        </ul>
      </div>
      
      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-xl text-center">
          <p className="text-xs text-indigo-600 dark:text-indigo-400">المنتجات</p>
          <p className="text-xl font-black">{importStats.products}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl text-center">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">الموديلات</p>
          <p className="text-xl font-black">{importStats.models}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-xl text-center">
          <p className="text-xs text-amber-600 dark:text-amber-400">أكواد رئيسية</p>
          <p className="text-xl font-black">{importStats.mainFaults}</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-xl text-center">
          <p className="text-xs text-purple-600 dark:text-purple-400">أكواد فرعية</p>
          <p className="text-xl font-black">{importStats.subFaults}</p>
        </div>
      </div>
      
      {/* أزرار التحميل والرفع */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={downloadTemplate}
          className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <Download size={18}/> تحميل قالب Excel (5 مستويات)
        </button>
        
        <label className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors cursor-pointer flex items-center gap-2">
          <UploadCloud size={18}/> اختيار ملف
          <input
            type="file"
            id="excelFileInput"
            accept=".csv,.xlsx"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>
      
      {/* معاينة البيانات */}
      {showPreview && previewData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b bg-slate-50 dark:bg-slate-800 flex justify-between items-center">
            <h4 className="font-bold">معاينة البيانات المستوردة ({previewData.length} صف)</h4>
            <button
              onClick={() => setShowPreview(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              إلغاء
            </button>
          </div>
          <div className="overflow-x-auto max-h-60">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="p-2 text-right">المنتج</th>
                  <th className="p-2 text-right">الموديل</th>
                  <th className="p-2 text-right">الكود الرئيسي</th>
                  <th className="p-2 text-right">وصف الرئيسي</th>
                  <th className="p-2 text-right">الكود الفرعي</th>
                  <th className="p-2 text-right">وصف الفرعي</th>
                  <th className="p-2 text-right">كود المنتج</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {previewData.map((row, idx) => (
                  <tr key={idx}>
                    <td className="p-2 font-bold">{row.product_name}</td>
                    <td className="p-2">{row.model_name}</td>
                    <td className="p-2 font-mono text-amber-600">{row.main_fault_code || '-'}</td>
                    <td className="p-2 text-amber-600">{row.main_fault_description || '-'}</td>
                    <td className="p-2 font-mono text-purple-600">{row.sub_fault_code || '-'}</td>
                    <td className="p-2 text-purple-600">{row.sub_fault_description || '-'}</td>
                    <td className="p-2 font-mono text-indigo-600">{row.product_code || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t bg-slate-50 dark:bg-slate-800">
            <button
              onClick={handleImport}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin"/> : <UploadCloud size={18}/>}
              {loading ? 'جاري الاستيراد...' : `تأكيد استيراد ${previewData.length} صف`}
            </button>
          </div>
        </div>
      )}
      
      {/* سجل العمليات */}
      {importLog.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b bg-slate-50 dark:bg-slate-800 flex justify-between items-center">
            <h4 className="font-bold">سجل الاستيراد</h4>
            <button
              onClick={() => setImportLog([])}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              مسح السجل
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto p-2 space-y-1 font-mono text-xs">
            {importLog.map((log, idx) => (
              <div key={idx} className={`p-2 rounded-lg ${getLogColor(log.type)}`}>
                <span className="text-slate-400 ml-2">[{log.timestamp}]</span>
                <span className="whitespace-pre-wrap">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* حالة التحميل */}
      {loading && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
            <p className="text-lg font-bold">جاري استيراد البيانات...</p>
            <p className="text-sm text-slate-500">يرجى الانتظار، قد تستغرق العملية بضع ثوانٍ</p>
          </div>
        </div>
      )}
      
    </div>
  );
}


// ==========================================================================
// 📦 مخزن المرتجعات - Returns Warehouse Manager
// ==========================================================================
function ReturnsWarehouseManager({ appUser, notify, setGlobalLoading }) {
  const [returns, setReturns] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newReturnItem, setNewReturnItem] = useState({
    serialNumber: '',
    name: '',
    originalInvoice: '',
    reason: '',
    condition: 'defective',
    customerName: '',
    customerPhone: '',
    returnDate: new Date().toISOString().split('T')[0],
    warehouseId: appUser.assignedWarehouseId || 'main'
  });

  // تحميل بيانات المرتجعات
  useEffect(() => {
    loadReturns();
  }, []);

  const loadReturns = async () => {
    setLoading(true);
    try {
      let q = collection(db, 'returnsWarehouse');
      
      // ✅ التحكم في البيانات حسب صلاحيات المستخدم
      if (appUser.role !== 'admin' && !appUser.permissions?.viewAllWarehouses) {
        q = query(q, where('warehouseId', '==', appUser.assignedWarehouseId || 'main'));
      }
      
      const snap = await getDocs(q);
      setReturns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error loading returns:", error);
      showError("فشل تحميل بيانات المرتجعات");
    }
    setLoading(false);
  };

  // إضافة منتج مرتجع جديد
  const handleAddReturn = async (e) => {
    e.preventDefault();
    
    if (!newReturnItem.serialNumber || !newReturnItem.name) {
      showError("السيريال واسم المنتج مطلوبان");
      return;
    }

    setGlobalLoading(true);
    try {
      await addDoc(collection(db, 'returnsWarehouse'), {
        ...newReturnItem,
        createdAt: serverTimestamp(),
        createdBy: appUser.name,
        warehouseId: appUser.assignedWarehouseId || 'main',
        status: 'available'
      });
      
      await logUserActivity(appUser, 'إضافة مرتجع', `إضافة منتج مرتجع: ${newReturnItem.name} (${newReturnItem.serialNumber})`);
      
      showSuccess("تم إضافة المنتج إلى مخزن المرتجعات");
      setShowAddModal(false);
      setNewReturnItem({
        serialNumber: '',
        name: '',
        originalInvoice: '',
        reason: '',
        condition: 'defective',
        customerName: '',
        customerPhone: '',
        returnDate: new Date().toISOString().split('T')[0],
        warehouseId: appUser.assignedWarehouseId || 'main'
      });
      loadReturns();
    } catch (error) {
      console.error(error);
      showError("فشل إضافة المنتج");
    }
    setGlobalLoading(false);
  };

  // حذف منتج مرتجع
  const handleDeleteReturn = async (id, name) => {
    const confirmed = await showConfirm('تأكيد الحذف', `حذف المنتج المرتجع "${name}" نهائياً؟`);
    if (!confirmed) return;

    setGlobalLoading(true);
    try {
      await deleteDoc(doc(db, 'returnsWarehouse', id));
      showSuccess("تم حذف المنتج");
      loadReturns();
    } catch (error) {
      console.error(error);
      showError("فشل الحذف");
    }
    setGlobalLoading(false);
  };

  // البحث
  const filteredReturns = returns.filter(item =>
    normalizeSearch(item.serialNumber).includes(normalizeSearch(search)) ||
    normalizeSearch(item.name).includes(normalizeSearch(search)) ||
    normalizeSearch(item.originalInvoice).includes(normalizeSearch(search))
  );

  return (
    <div className="space-y-6">
      {/* مودال إضافة مرتجع */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-6 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h3 className="font-black text-xl text-slate-800 dark:text-white">إضافة منتج مرتجع</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-rose-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddReturn} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">السيريال *</label>
                  <input
                    required
                    className="w-full border p-2 rounded-lg font-mono"
                    value={newReturnItem.serialNumber}
                    onChange={e => setNewReturnItem({...newReturnItem, serialNumber: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">اسم المنتج *</label>
                  <input
                    required
                    className="w-full border p-2 rounded-lg"
                    value={newReturnItem.name}
                    onChange={e => setNewReturnItem({...newReturnItem, name: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">رقم الفاتورة الأصلية</label>
                <input
                  className="w-full border p-2 rounded-lg font-mono"
                  value={newReturnItem.originalInvoice}
                  onChange={e => setNewReturnItem({...newReturnItem, originalInvoice: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">اسم العميل</label>
                  <input
                    className="w-full border p-2 rounded-lg"
                    value={newReturnItem.customerName}
                    onChange={e => setNewReturnItem({...newReturnItem, customerName: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">رقم العميل</label>
                  <input
                    className="w-full border p-2 rounded-lg"
                    value={newReturnItem.customerPhone}
                    onChange={e => setNewReturnItem({...newReturnItem, customerPhone: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">حالة المنتج</label>
                <select
                  className="w-full border p-2 rounded-lg"
                  value={newReturnItem.condition}
                  onChange={e => setNewReturnItem({...newReturnItem, condition: e.target.value})}
                >
                  <option value="defective">تالف</option>
                  <option value="good">بحالة جيدة</option>
                  <option value="repairable">قابل للإصلاح</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">سبب الإرجاع</label>
                <textarea
                  rows="2"
                  className="w-full border p-2 rounded-lg"
                  value={newReturnItem.reason}
                  onChange={e => setNewReturnItem({...newReturnItem, reason: e.target.value})}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold">حفظ</button>
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-100 dark:bg-slate-700 py-2 rounded-lg font-bold">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* رأس الصفحة */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-black flex items-center gap-2">
            <RotateCcw className="text-indigo-600" size={24} />
            مخزن المنتجات المرتجعة
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
          >
            <Plus size={16} /> إضافة مرتجع
          </button>
        </div>

        {/* البحث */}
        <div className="relative mb-4">
          <Search className="absolute right-3 top-3 text-slate-400" size={16} />
          <input
            className="w-full border p-2 pr-10 rounded-lg text-sm"
            placeholder="بحث بالسيريال، اسم المنتج، أو رقم الفاتورة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* عرض البيانات */}
        {loading ? (
          <p className="text-center py-8">جاري التحميل...</p>
        ) : filteredReturns.length === 0 ? (
          <p className="text-center py-8 text-slate-400">لا توجد منتجات مرتجعة</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-bold text-xs">
                <tr>
                  <th className="p-3">السيريال</th>
                  <th className="p-3">المنتج</th>
                  <th className="p-3">الفاتورة الأصلية</th>
                  <th className="p-3">العميل</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">تاريخ الإرجاع</th>
                  <th className="p-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredReturns.map(item => (
                  <tr key={item.id}>
                    <td className="p-3 font-mono">{item.serialNumber}</td>
                    <td className="p-3 font-bold">{item.name}</td>
                    <td className="p-3 font-mono">{item.originalInvoice || '-'}</td>
                    <td className="p-3">{item.customerName || '-'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-[9px] font-bold ${
                        item.condition === 'defective' ? 'bg-rose-100 text-rose-700' :
                        item.condition === 'good' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.condition === 'defective' ? 'تالف' : item.condition === 'good' ? 'بحالة جيدة' : 'قابل للإصلاح'}
                      </span>
                    </td>
                    <td className="p-3">{formatDate(item.returnDate)}</td>
                    <td className="p-3">
                      <button
                        onClick={() => handleDeleteReturn(item.id, item.name)}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================================================
// 🚀 المكون الرئيسي للتطبيق (مع حل مشكلة الرفريش والتكامل الكامل)
// ==========================================================================
export default function App() {
  const [appUser, setAppUser] = useState(null);
  const [fbReady, setFbReady] = useState(false);
  const [firebaseError, setFirebaseError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(true);
  
  const [currentView, setCurrentView] = useState('dashboard');
  const [viewedUser, setViewedUser] = useState(null);
  const [lowStockItems, setLowStockItems] = useState([]);

  const [notifications, setNotifications] = useState([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  
  const [warehouses, setWarehouses] = useState([{id: 'main', name: 'المخزن الرئيسي'}]);
  const [warehouseMap, setWarehouseMap] = useState({'main': 'المخزن الرئيسي'});
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
      showPaymentMethod: true,
      showNotes: true,
      showTechnician: true,
      fontSize: 'normal',
      paperSize: '80mm'
    },
    taxRate: 14,
    footerText: 'شكراً لتعاملكم معنا.', 
    installationFees: [],
    productCategories: [],
    technicians: [],
    maintenanceCenters: []
  });

  // تفعيل/إلغاء الوضع الداكن
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const notify = useCallback((msg, type = 'success') => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  }, []);

  const testFirebaseConnection = useCallback(async () => {
    try {
      setIsConnecting(true);
      setFirebaseError(null);
      
      await getDoc(doc(db,'settings','general'));
      console.log("Firebase connection successful");
      return true;
    } catch (error) {
      console.error("Firebase connection error:", error);
      let errorMessage = "فشل الاتصال بقاعدة البيانات.";
      
      if (error.code === 'permission-denied') {
        errorMessage = "خطأ في الصلاحيات: تأكد من إعدادات قواعد الأمان في Firebase Console.";
      } else if (error.code === 'unavailable') {
        errorMessage = "خدمة Firebase غير متاحة حالياً.";
      } else if (error.code === 'not-found') {
        errorMessage = "لم يتم العثور على قاعدة البيانات.";
      } else {
        errorMessage = error.message;
      }
      
      setFirebaseError(errorMessage);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // استعادة المستخدم من localStorage عند تحميل التطبيق
  useEffect(() => {
    const savedUser = loadUserFromStorage();
    if (savedUser) {
      setAppUser(savedUser);
    }
  }, []);

  useEffect(() => {
    testFirebaseConnection();
  }, []);

  const retryConnection = async () => {
    await testFirebaseConnection();
  };

  // مراقبة حالة الاتصال بالإنترنت
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncManager.syncAll().then(result => {
        if (result.synced > 0) {
          showSuccess(`تمت مزامنة ${result.synced} عملية بنجاح`);
        }
      });
    };
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline); 
    window.addEventListener('offline', handleOffline);
    
    syncManager.startAutoSync();
    
    requestNotificationPermission();
    
    onMessageListener().then(payload => {
      showInfo(payload.notification.body, payload.notification.title);
    });
    
    const handleNavigateToLowStock = (e) => {
      setLowStockItems(e.detail);
      setCurrentView('lowstock');
      setIsMobileOpen(false);
    };
    
    const handleNavigateToTickets = (e) => {
      setCurrentView('tickets');
      setIsMobileOpen(false);
    };
    
    const handleNavigateToReports = (e) => {
      setCurrentView('reports');
      setIsMobileOpen(false);
    };
    
    const handleCreateTransferFromLowStock = (e) => {
      setCurrentView('transfers');
      setIsMobileOpen(false);
    };
    
    window.addEventListener('navigateToLowStock', handleNavigateToLowStock);
    window.addEventListener('navigateToTickets', handleNavigateToTickets);
    window.addEventListener('navigateToReports', handleNavigateToReports);
    window.addEventListener('createTransferFromLowStock', handleCreateTransferFromLowStock);
    
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('navigateToLowStock', handleNavigateToLowStock);
        window.removeEventListener('navigateToTickets', handleNavigateToTickets);
        window.removeEventListener('navigateToReports', handleNavigateToReports);
        window.removeEventListener('createTransferFromLowStock', handleCreateTransferFromLowStock);
    };
  }, []);

  const handleNavigateToInventory = (view = 'inventory') => {
  setCurrentView(view);
  setIsMobileOpen(false);
};

  const handleGenerateInvoiceFromTicket = (ticket) => {
    setCurrentView('transactions');
    showSuccess(`تم تحويل التذكرة ${ticket.ticketNumber} إلى فاتورة`);
  };
  
  useEffect(() => {
    const initAuth = async () => {
       try {
           await signInAnonymously(auth);
       } catch(e) {
           console.error("Firebase Auth Initialization Failed", e);
       } finally {
           setFbReady(true);
       }
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (!appUser || !fbReady || firebaseError) return;

    const unsubS = onSnapshot(doc(db, 'settings', 'general'), (d) => {
       if (d.exists()) {
           setSystemSettings(prev => ({...prev, ...d.data()}));
       }
    }, (error) => {
        console.error("Error fetching settings:", error);
        showError("فشل في تحميل الإعدادات");
    });

    const unsubW = onSnapshot(collection(db, 'warehouses'), (s) => {
       const whs = [{id: 'main', name: 'المخزن الرئيسي'}];
       s.docs.forEach(d => whs.push({id:d.id, ...d.data()}));
       setWarehouses(whs);
       const m = {}; 
       whs.forEach(w => m[w.id] = w.name); 
       setWarehouseMap(m);
    }, (error) => {
        console.error("Error fetching warehouses:", error);
    });

    return () => { 
        unsubS(); 
        unsubW(); 
    };
  }, [appUser, fbReady, firebaseError]);

  const handleLogout = () => {
     clearUserFromStorage();
     setAppUser(null);
     setCurrentView('dashboard');
     showSuccess("تم تسجيل الخروج بنجاح");
  };

  const openProfileView = (user) => {
      setViewedUser(user);
      setCurrentView('user_profile');
      setIsMobileOpen(false);
  };

  if (!appUser) {
    return (
      <>
        <LoginScreen 
          fbReady={fbReady} 
          onLoginSuccess={(user) => {
            setAppUser(user);
            saveUserToStorage(user);
          }} 
          systemSettings={systemSettings} 
          notify={notify}
          onRetry={retryConnection}
          isConnecting={isConnecting}
          firebaseError={firebaseError}
        />
        <div className="fixed top-6 left-6 z-[200] flex flex-col gap-2">
          {notifications.map(n => (
             <div 
               key={n.id} 
               className={`p-4 rounded-xl shadow-lg text-white font-bold text-xs flex items-center gap-2 border-l-4 ${
                 n.type === 'error' || n.type === 'warn' 
                   ? 'bg-rose-600 border-rose-800' 
                   : n.type === 'success' 
                   ? 'bg-emerald-600 border-emerald-800'
                   : 'bg-blue-600 border-blue-800'
               }`}
             >
                {n.type === 'error' || n.type === 'warn' 
                  ? <AlertTriangle size={16} className="text-white"/> 
                  : <CheckCircle2 size={16} className="text-white"/>
                }
                {n.msg}
             </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <ThemeProvider>
      <div className={`flex h-screen bg-slate-50 dark:bg-slate-900 font-sans overflow-hidden text-right selection:bg-indigo-100 dark:selection:bg-indigo-900 transition-colors duration-200`} dir="rtl">
        
        {/* منطقة الإشعارات */}
        <div className="fixed top-6 left-6 z-[200] flex flex-col gap-2">
          {notifications.map(n => (
             <div 
               key={n.id} 
               className={`p-4 rounded-xl shadow-lg text-white font-bold text-xs flex items-center gap-2 border-l-4 animate-in slide-in-from-left-5 ${
                 n.type === 'error' || n.type === 'warn' 
                   ? 'bg-rose-600 border-rose-800' 
                   : n.type === 'success' 
                   ? 'bg-emerald-600 border-emerald-800'
                   : 'bg-blue-600 border-blue-800'
               }`}
             >
                {n.type === 'error' || n.type === 'warn' 
                  ? <AlertTriangle size={16} className="text-white"/> 
                  : <CheckCircle2 size={16} className="text-white"/>
                }
                {n.msg}
             </div>
          ))}
        </div>

        {/* مؤشر التحميل العالمي */}
        {globalLoading && (
           <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[300] flex items-center justify-center">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3 font-bold text-indigo-700 dark:text-indigo-400">
                 <Loader2 className="w-8 h-8 animate-spin" /> 
                 <span className="text-sm">جاري المعالجة...</span>
              </div>
           </div>
        )}

        {/* القائمة الجانبية للموبايل */}
        {isMobileOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm transition-opacity" 
            onClick={() => setIsMobileOpen(false)} 
          />
        )}
        
        {/* Sidebar */}
        <aside className={`fixed lg:static inset-y-0 right-0 z-50 w-64 bg-gradient-to-b from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-slate-300 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out print:hidden ${
          isMobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}>
          <div className="h-16 flex items-center px-6 border-b border-slate-700 bg-slate-950/50">
             <div className="flex items-center gap-3">
               <div className="p-1.5 bg-indigo-600 rounded-lg text-white shadow-lg">
                 <Package size={18}/>
               </div>
               <span className="font-black text-white truncate">{systemSettings.systemName}</span>
             </div>
          </div>
          
          <nav className="p-4 flex-1 space-y-1 overflow-y-auto custom-scrollbar">
             <p className="px-3 text-[10px] font-bold text-slate-500 uppercase mb-2 mt-2">القائمة الرئيسية</p>
             
             {[
               { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, permission: 'viewDashboard' },
               { id: 'inventory', label: 'إدارة المخزون', icon: Package, permission: 'viewInventory' },
               { id: 'transfers', label: 'التحويلات المخزنية', icon: ArrowRightLeft, permission: 'viewTransfers' },
               { id: 'transactions', label: 'نقطة البيع', icon: Receipt, permission: 'viewPOS' },
               { id: 'customers', label: 'سجل العملاء', icon: Users, permission: 'viewCustomers' },
               { id: 'tickets', label: 'تذاكر الصيانة', icon: MessageSquare, permission: 'manageTickets' },
               { id: 'invoices', label: 'أرشيف الفواتير', icon: FileText, permission: 'viewPOS' },
               { id: 'reports', label: 'التقارير', icon: History, permission: 'viewReports' },
               { id: 'lowstock', label: 'النواقص', icon: AlertOctagon, permission: 'viewLowStock' }
             ].map(item => {
                if (item.permission && !appUser.permissions?.[item.permission] && appUser.role !== 'admin') {
                    return null;
                }
                return (
                    <button 
                      key={item.id} 
                      onClick={()=>{setCurrentView(item.id); setIsMobileOpen(false);}} 
                      className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 font-bold text-sm ${
                        currentView === item.id 
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                          : 'hover:bg-slate-800 hover:text-white text-slate-400'
                      }`}
                    >
                      <item.icon size={18} className={currentView === item.id ? 'text-white' : 'opacity-70'}/> 
                      <span className="flex-1 text-right">{item.label}</span>
                      {currentView === item.id && <ChevronDown size={14} className="rotate-270"/>}
                    </button>
                );
             })}
             
             {/* عرض قسم الإدارة للمستخدمين الذين لديهم صلاحيات إدارية */}
{(appUser.role === 'admin' || 
  appUser.permissions?.manageSettings || 
  appUser.permissions?.manageWarehouses || 
  appUser.permissions?.manageUsers ||
  appUser.permissions?.viewSettings ||
  appUser.permissions?.editSystemSettings ||
  appUser.permissions?.editInvoiceTemplate ||
  appUser.permissions?.manageTechniciansList ||
  appUser.permissions?.manageFeesAndCategories ||
  appUser.permissions?.manageProductModels ||
  appUser.permissions?.manageFaultCodes ||
  appUser.permissions?.manageMaintenanceCenters ||
  appUser.permissions?.manageBranchesList) && (
   <>
      <p className="px-3 text-[10px] font-bold text-slate-500 uppercase mb-2 mt-6">الإدارة</p>
      
      {/* زر إدارة الفروع */}
      {(appUser.role === 'admin' || appUser.permissions?.manageWarehouses) && (
        <button 
          onClick={()=>{setCurrentView('warehouses'); setIsMobileOpen(false);}} 
          className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 font-bold text-sm ${
            currentView === 'warehouses' 
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
              : 'hover:bg-slate-800 hover:text-white text-slate-400'
          }`}
        >
          <Store size={18} className={currentView === 'warehouses' ? 'text-white' : 'opacity-70'}/> 
          <span className="flex-1 text-right">إدارة الفروع</span>
        </button>
      )}
      
      {/* زر الموظفين والصلاحيات */}
      {(appUser.role === 'admin' || appUser.permissions?.manageUsers) && (
        <button 
          onClick={()=>{setCurrentView('users'); setIsMobileOpen(false);}} 
          className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 font-bold text-sm ${
            currentView === 'users' 
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
              : 'hover:bg-slate-800 hover:text-white text-slate-400'
          }`}
        >
          <UserCog size={18} className={currentView === 'users' ? 'text-white' : 'opacity-70'}/> 
          <span className="flex-1 text-right">الموظفين والصلاحيات</span>
        </button>
      )}


      {/* ✅ زر مخزن المرتجعات */}
{(appUser.permissions?.viewReturnsWarehouse || appUser.role === 'admin') && (
  <button
    onClick={() => {
      setCurrentView('returns_warehouse');
      setIsMobileOpen(false);
    }}
    className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 font-bold text-sm ${
      currentView === 'returns_warehouse'
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
        : 'hover:bg-slate-800 hover:text-white text-slate-400'
    }`}
  >
    <RotateCcw size={18} className={currentView === 'returns_warehouse' ? 'text-white' : 'opacity-70'} />
    <span className="flex-1 text-right">مخزن المرتجعات</span>
  </button>
)}
      
      {/* زر الإعدادات المركزية */}
      {(appUser.role === 'admin' || 
        appUser.permissions?.viewSettings || 
        appUser.permissions?.manageSettings ||
        appUser.permissions?.editSystemSettings ||
        appUser.permissions?.editInvoiceTemplate ||
        appUser.permissions?.manageTechniciansList ||
        appUser.permissions?.manageFeesAndCategories ||
        appUser.permissions?.manageProductModels ||
        appUser.permissions?.manageFaultCodes ||
        appUser.permissions?.manageMaintenanceCenters ||
        appUser.permissions?.manageBranchesList) && (
        <button 
          onClick={()=>{setCurrentView('settings'); setIsMobileOpen(false);}} 
          className={`w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-200 font-bold text-sm ${
            currentView === 'settings' 
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
              : 'hover:bg-slate-800 hover:text-white text-slate-400'
          }`}
        >
          <Settings size={18} className={currentView === 'settings' ? 'text-white' : 'opacity-70'}/> 
          <span className="flex-1 text-right">الإعدادات المركزية</span>
        </button>
      )}
   </>
)}
          </nav>
          
          {/* ملف المستخدم في sidebar */}
          <div className="p-4 border-t border-slate-700 bg-slate-900/50">
             <button 
               onClick={() => openProfileView(appUser)} 
               className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 transition-colors mb-2 text-right group"
             >
               <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-black text-white text-sm shadow-lg">
                 {appUser.name?.charAt(0) || appUser.email?.charAt(0)}
               </div>
               <div className="flex-1 overflow-hidden">
                 <p className="text-sm font-bold text-white truncate">{appUser.name || appUser.email}</p>
                 <p className="text-[10px] text-slate-400 truncate group-hover:text-indigo-300 transition-colors">
                   {appUser.role === 'admin' ? 'مدير النظام' : USER_ROLES.find(r => r.key === appUser.role)?.label || 'موظف'}
                 </p>
               </div>
            </button>
            
            {/* زر الوضع الداكن */}
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="w-full px-4 py-2 bg-slate-800 text-slate-300 font-bold flex items-center justify-center gap-2 hover:bg-slate-700 rounded-lg transition-colors text-sm mb-2"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
              {darkMode ? 'الوضع الفاتح' : 'الوضع الداكن'}
            </button>
            
            <button 
              onClick={handleLogout} 
              className="w-full px-4 py-2 bg-red-500/10 text-red-400 font-bold flex items-center justify-center gap-2 hover:bg-red-500 hover:text-white rounded-lg transition-colors text-sm"
            >
              <LogOut size={16} /> خروج
            </button>
          </div>
        </aside>

        {/* المحتوى الرئيسي */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Header */}
          <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 sticky top-0 z-10 print:hidden shadow-sm">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsMobileOpen(true)} className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md">
                <Menu size={20}/>
              </button>
              <h2 className="font-bold text-slate-800 dark:text-white text-sm hidden sm:block">
                {currentView === 'dashboard' && 'مرحباً بعودتك 👋'}
                {currentView === 'inventory' && 'إدارة المخزون'}
                {currentView === 'transfers' && 'التحويلات المخزنية'}
                {currentView === 'transactions' && 'نقطة البيع'}
                {currentView === 'customers' && 'إدارة العملاء'}
                {currentView === 'tickets' && 'تذاكر الصيانة'}
                {currentView === 'invoices' && 'أرشيف الفواتير'}
                {currentView === 'reports' && 'التقارير'}
                {currentView === 'lowstock' && 'النواقص'}
                {currentView === 'settings' && 'الإعدادات المركزية'}
                {currentView === 'warehouses' && 'إدارة الفروع'}
                {currentView === 'users' && 'إدارة المستخدمين'}
                {currentView === 'user_profile' && 'الملف الشخصي'}
              </h2>
            </div>
            <div className="flex items-center gap-3 font-bold">
               <div className="flex items-center gap-2">
                 <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                 <span className={`text-[9px] uppercase px-2 py-1 rounded border ${
                   isOnline 
                     ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' 
                     : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-800'
                 }`}>
                   {isOnline ? 'متصل' : 'غير متصل'}
                 </span>
               </div>
               <div className="h-6 w-px bg-slate-200 dark:bg-slate-700"></div>
               <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{warehouseMap[appUser.assignedWarehouseId]}</span>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
             <div className="max-w-7xl mx-auto h-full pb-10 print:pb-0">
                
                {/* الصفحات المختلفة */}
                {currentView === 'dashboard' && <DashboardView appUser={appUser} warehouses={warehouses} onNavigateToInventory={handleNavigateToInventory} notify={notify} />}
                
                {currentView === 'inventory' && appUser.permissions?.viewInventory && 
                  <InventoryManager appUser={appUser} warehouses={warehouses} notify={notify} setGlobalLoading={setGlobalLoading} warehouseMap={warehouseMap} />
                }
                
                {currentView === 'transfers' && appUser.permissions?.viewTransfers && 
                  <EnhancedTransferManager appUser={appUser} warehouseMap={warehouseMap} notify={notify} setGlobalLoading={setGlobalLoading} />
                }
                
                {currentView === 'transactions' && appUser.permissions?.viewPOS && 
                  <POSManager appUser={appUser} systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} warehouseMap={warehouseMap} />
                }
                
                {currentView === 'customers' && appUser.permissions?.viewCustomers && 
                  <EnhancedCustomerManager appUser={appUser} systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} />
                }
                
                {currentView === 'tickets' && appUser.permissions?.manageTickets && 
                  <EnhancedTicketManager appUser={appUser} systemSettings={systemSettings} notify={notify} setGlobalLoading={setGlobalLoading} warehouseMap={warehouseMap} onGenerateInvoice={handleGenerateInvoiceFromTicket} />
                }
                
               {currentView === 'invoices' && appUser.permissions?.viewInvoices && 
                  <InvoicesManager 
                     appUser={appUser}
                     systemSettings={systemSettings}
                     notify={notify}
                     setGlobalLoading={setGlobalLoading}
                  />
                }

                {/* ✅ صفحة مخزن المرتجعات */}
{currentView === 'returns_warehouse' && (appUser.permissions?.viewReturnsWarehouse || appUser.role === 'admin') && (
  <ReturnsWarehouseManager
    appUser={appUser}
    notify={notify}
    setGlobalLoading={setGlobalLoading}
  />
)}

                {currentView === 'reports' && appUser.permissions?.viewReports && 
                  <ReportsManager notify={notify} />
                }
                
                {currentView === 'lowstock' && appUser.permissions?.viewLowStock && 
                  <LowStockView lowStockItems={lowStockItems} appUser={appUser} warehouseMap={warehouseMap} />
                }
                
                {currentView === 'settings' && (appUser.role === 'admin' || 
                  appUser.permissions?.viewSettings || 
                  appUser.permissions?.manageSettings ||
                  appUser.permissions?.editSystemSettings ||
                  appUser.permissions?.editInvoiceTemplate ||
                  appUser.permissions?.manageTechniciansList ||
                  appUser.permissions?.manageFeesAndCategories ||
                  appUser.permissions?.manageProductModels ||
                  appUser.permissions?.manageFaultCodes ||
                  appUser.permissions?.manageMaintenanceCenters ||
                  appUser.permissions?.manageBranchesList) && 
                  <SettingsManager 
                     systemSettings={systemSettings}
                     setSettings={setSystemSettings}
                     notify={notify}
                     setGlobalLoading={setGlobalLoading}
                     appUser={appUser}
                  />
                }
                
                {currentView === 'warehouses' && appUser.role === 'admin' && 
                  <EnhancedWarehouseManager warehouses={warehouses} appUser={appUser} notify={notify} setGlobalLoading={setGlobalLoading} />
                }
                
                {currentView === 'users' && appUser.role === 'admin' && 
                  <EnhancedUserManagement appUser={appUser} warehouses={warehouses} notify={notify} setGlobalLoading={setGlobalLoading} onViewProfile={openProfileView} />
                }
                
                {currentView === 'user_profile' && 
                  <EmployeeProfileView userToView={viewedUser} warehouseMap={warehouseMap} />
                }

                {/* رسالة عدم الصلاحية */}
                {currentView !== 'dashboard' && 
                 currentView !== 'user_profile' && 
                 !['inventory','transfers','transactions','customers','invoices','tickets','reports','lowstock','settings','warehouses','users'].includes(currentView) && 
                 appUser.role !== 'admin' && 
                 !appUser.permissions?.[`view${currentView.charAt(0).toUpperCase() + currentView.slice(1)}`] && (
                  <div className="flex flex-col items-center justify-center h-96 text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <Shield size={64} className="text-slate-300 dark:text-slate-600 mb-4 opacity-50"/>
                    <h2 className="text-xl font-bold mb-2">عذراً، لا تملك صلاحية الوصول</h2>
                    <p className="text-sm">هذه الصفحة غير متاحة لدورك الحالي</p>
                  </div>
                )}
             </div>
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}

// تحديث InvoicesManager مع فلاتر متقدمة
function InvoicesManager({ systemSettings, appUser }) {
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [invoiceData, setInvoiceData] = useState(null);
  
  // فلاتر جديدة
  const [filterCustomerName, setFilterCustomerName] = useState('');
  const [filterInvoiceNumber, setFilterInvoiceNumber] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterPhone, setFilterPhone] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [warehouses, setWarehouses] = useState([]);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    const loadWarehouses = async () => {
      const snap = await getDocs(collection(db, 'warehouses'));
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    loadWarehouses();
  }, []);

  useEffect(() => {
  const loadInvoices = async () => {
    try {
      let constraints = [
        where("type", "==", "sell"),
        orderBy("timestamp", "desc"),
        limit(500)
      ];
      
      // ✅ التحكم في البيانات حسب صلاحيات المستخدم
      if (appUser.role !== 'admin' && !appUser.permissions?.viewAllWarehouses) {
        constraints.push(where('warehouseId', '==', appUser.assignedWarehouseId || 'main'));
      }
      
      const q = query(collection(db, "transactions"), ...constraints);
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setInvoices(data);
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  };
  loadInvoices();
}, [appUser]);

  const filtered = invoices.filter(inv => {
    const matchesGlobalSearch = !search || 
      normalizeSearch(inv.invoiceNumber).includes(normalizeSearch(search)) ||
      normalizeSearch(inv.customerName).includes(normalizeSearch(search)) ||
      normalizeSearch(inv.serialNumber).includes(normalizeSearch(search)) ||
      normalizeSearch(inv.phone).includes(normalizeSearch(search));
    
    const matchesCustomerName = !filterCustomerName || 
      normalizeSearch(inv.customerName).includes(normalizeSearch(filterCustomerName));
    
    const matchesInvoiceNumber = !filterInvoiceNumber || 
      normalizeSearch(inv.invoiceNumber).includes(normalizeSearch(filterInvoiceNumber));
    
    const matchesPhone = !filterPhone || 
      normalizeSearch(inv.phone).includes(normalizeSearch(filterPhone));
    
    const matchesWarehouse = filterWarehouse === 'all' || inv.warehouseId === filterWarehouse;
    
    let matchesDate = true;
    if (filterDateFrom) {
      const invDate = inv.timestamp?.toDate ? inv.timestamp.toDate() : new Date(inv.timestamp);
      matchesDate = matchesDate && invDate >= new Date(filterDateFrom);
    }
    if (filterDateTo) {
      const invDate = inv.timestamp?.toDate ? inv.timestamp.toDate() : new Date(inv.timestamp);
      matchesDate = matchesDate && invDate <= new Date(filterDateTo + 'T23:59:59');
    }
    
    return matchesGlobalSearch && matchesCustomerName && matchesInvoiceNumber && 
           matchesPhone && matchesWarehouse && matchesDate;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'date') {
      const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
      const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
      comparison = dateA - dateB;
    } else if (sortBy === 'total') {
      comparison = (a.finalTotal || 0) - (b.finalTotal || 0);
    } else if (sortBy === 'customer') {
      comparison = (a.customerName || '').localeCompare(b.customerName || '');
    }
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  if (invoiceData) {
    return (
      <InvoiceRenderer
        data={invoiceData}
        systemSettings={systemSettings}
        onBack={() => setInvoiceData(null)}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h2 className="text-2xl font-black">أرشيف الفواتير</h2>

      {/* فلاتر متقدمة */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 bg-white dark:bg-slate-800 p-4 rounded-xl border">
        <div>
          <label className="text-xs font-bold block mb-1">بحث عام</label>
          <input
            className="w-full border p-2 rounded-lg text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث شامل..."
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">اسم العميل</label>
          <input
            className="w-full border p-2 rounded-lg text-sm"
            value={filterCustomerName}
            onChange={e => setFilterCustomerName(e.target.value)}
            placeholder="اسم العميل"
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">رقم الفاتورة</label>
          <input
            className="w-full border p-2 rounded-lg text-sm font-mono"
            value={filterInvoiceNumber}
            onChange={e => setFilterInvoiceNumber(e.target.value)}
            placeholder="INV-..."
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">رقم الموبايل</label>
          <input
            className="w-full border p-2 rounded-lg text-sm font-mono"
            value={filterPhone}
            onChange={e => setFilterPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">من تاريخ</label>
          <input
            type="date"
            className="w-full border p-2 rounded-lg text-sm"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">إلى تاريخ</label>
          <input
            type="date"
            className="w-full border p-2 rounded-lg text-sm"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">الفرع / المركز</label>
          <select
            className="w-full border p-2 rounded-lg text-sm"
            value={filterWarehouse}
            onChange={e => setFilterWarehouse(e.target.value)}
          >
            <option value="all">كل الفروع</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold block mb-1">ترتيب حسب</label>
          <div className="flex gap-2">
            <select
              className="flex-1 border p-2 rounded-lg text-sm"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="date">التاريخ</option>
              <option value="total">المبلغ</option>
              <option value="customer">العميل</option>
            </select>
            <button
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-slate-500">{filtered.length} فاتورة</span>
        <button
          onClick={() => {
            setSearch('');
            setFilterCustomerName('');
            setFilterInvoiceNumber('');
            setFilterPhone('');
            setFilterDateFrom('');
            setFilterDateTo('');
            setFilterWarehouse('all');
          }}
          className="text-xs text-indigo-600 hover:underline"
        >
          مسح الفلاتر
        </button>
      </div>

      {loading && <p className="text-center py-8">جاري التحميل...</p>}

      {!loading && (
        <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th className="p-3">رقم الفاتورة</th>
                <th className="p-3">العميل</th>
                <th className="p-3">الهاتف</th>
                <th className="p-3">الإجمالي</th>
                <th className="p-3">الخصم</th>
                <th className="p-3">طريقة الدفع</th>
                <th className="p-3">الفرع</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">عرض</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                  <td className="p-3 font-bold font-mono text-indigo-600 dark:text-indigo-400">
                    {inv.invoiceNumber || inv.id.slice(0,8)}
                  </td>
                  <td className="p-3 font-bold">{inv.customerName}</td>
                  <td className="p-3 font-mono" dir="ltr">{inv.phone || '-'}</td>
                  <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">
                    {(inv.finalTotal || 0).toLocaleString()} ج
                  </td>
                  <td className="p-3 text-rose-500">
                    {inv.discountAmount > 0 ? `${inv.discountAmount.toLocaleString()} ج` : '-'}
                  </td>
                  <td className="p-3">
                    {inv.paymentMethod === 'cash' ? 'نقداً' :
                     inv.paymentMethod === 'card' ? 'بطاقة' :
                     inv.paymentMethod === 'transfer' ? 'تحويل' : '-'}
                  </td>
                  <td className="p-3 text-xs">{inv.warehouseId || '-'}</td>
                  <td className="p-3 text-xs">{formatDate(inv.timestamp)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => setInvoiceData(inv)}
                      className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700"
                    >
                      فتح
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-400">لا توجد فواتير مطابقة</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
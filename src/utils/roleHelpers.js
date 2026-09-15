import {
  User
} from 'lucide-react';
import { ROLE_COLOR_CLASSES, USER_ROLES } from '../constants/roles';

export const getRoleIcon = (roleKey) => {
  const role = USER_ROLES.find(r => r.key === roleKey);
  return role?.icon || User;
};

export const getRoleColor = (roleKey) => {
  const role = USER_ROLES.find(r => r.key === roleKey);
  return role?.color || 'slate';
};

// 🛠️ FIX: نفس مشكلة الـ badges في التذاكر - بناء `bg-${roleColor}-100` ديناميكيًا
// بيخلي Tailwind يشيل الكلاس ده من نسخة الإنتاج لأنه مش نص حرفي كامل وقت
// البناء. النتيجة: شارة دور الموظف (خصوصًا "كول سنتر" اللي لونه cyan)
// كانت بتظهر من غير أي لون خالص في الإنتاج.

export const getRoleColorClasses = (roleKey) => ROLE_COLOR_CLASSES[getRoleColor(roleKey)] || ROLE_COLOR_CLASSES.slate;

// ==========================================================================
// 🧾 دوال مساعدة لتحليل CSV (محسنة للأداء)
// ==========================================================================

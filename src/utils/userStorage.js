import { loadSecurely, saveSecurely } from './security';

const USER_STORAGE_KEY = 'nouval_current_user';

export const saveUserToStorage = (user) => {
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

export const loadUserFromStorage = () => {
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

export const clearUserFromStorage = () => {
  localStorage.removeItem(USER_STORAGE_KEY);
};

// ==========================================================================
// ✅ دوال التحقق من البيانات
// ==========================================================================

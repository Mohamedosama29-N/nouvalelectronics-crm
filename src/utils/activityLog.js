import {
  collection, addDoc, serverTimestamp
} from 'firebase/firestore';
import {
  Activity
} from 'lucide-react';
import { db } from '../firebase/config';

export const logUserActivity = async (user, action, details) => {
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

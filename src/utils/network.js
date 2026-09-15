import {
  collection, addDoc, doc, updateDoc, serverTimestamp, arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase/config';

export const getUserIP = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return 'unknown';
  }
};

export const getUserLocation = async (ip) => {
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

export const getUserAgent = () => {
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

export const logUserLogin = async (user) => {
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

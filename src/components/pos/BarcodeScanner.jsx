// components/POS/BarcodeScanner.jsx
import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { CameraIcon } from '@heroicons/react/24/outline';
import { logger } from '../../utils/logger'

export const BarcodeScanner = ({ onScan, onClose }) => {
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);

  const startScanner = () => {
    setScanning(true);
    const scanner = new Html5QrcodeScanner(
      "reader",
      {
        qrbox: {
          width: 250,
          height: 250,
        },
        fps: 5,
      },
      false
    );

    scanner.render(success, error);
    scannerRef.current = scanner;
  };

  const success = (decodedText) => {
    onScan(decodedText);
    stopScanner();
    onClose();
  };

  const error = (err) => {
    logger.error(err);
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear();
      setScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">مسح الباركود</h3>
          <button onClick={onClose} className="text-gray-500">✕</button>
        </div>
        
        {!scanning ? (
          <button
            onClick={startScanner}
            className="w-full py-4 bg-blue-500 text-white rounded-lg flex items-center justify-center gap-2"
          >
            <CameraIcon className="w-6 h-6" />
            تشغيل الكاميرا
          </button>
        ) : (
          <div id="reader" className="w-full"></div>
        )}
      </div>
    </div>
  );
};
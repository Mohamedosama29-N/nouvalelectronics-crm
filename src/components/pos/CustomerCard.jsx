// components/POS/CustomerCard.jsx
import { useState } from 'react';
import { UserIcon, StarIcon, GiftIcon } from '@heroicons/react/24/outline';

export const CustomerCard = ({ customer, onClose, onApplyDiscount }) => {
  const [showRedeem, setShowRedeem] = useState(false);
  
  const getTierColor = (tier) => {
    switch (tier) {
      case 'platinum': return 'text-purple-600';
      case 'gold': return 'text-yellow-600';
      case 'silver': return 'text-gray-400';
      default: return 'text-amber-600';
    }
  };
  
  const getTierName = (tier) => {
    switch (tier) {
      case 'platinum': return 'بلاتينيوم';
      case 'gold': return 'ذهبي';
      case 'silver': return 'فضي';
      default: return 'برونزي';
    }
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <UserIcon className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{customer.name}</h3>
            <p className="text-sm text-gray-500">{customer.phone}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-500">✕</button>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded">
        <div>
          <p className="text-sm text-gray-500">نقاط الولاء</p>
          <p className="text-2xl font-bold">{customer.points}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">المستوى</p>
          <p className={`text-lg font-bold ${getTierColor(customer.loyaltyTier)}`}>
            {getTierName(customer.loyaltyTier)}
            <StarIcon className="w-4 h-4 inline ml-1" />
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500">إجمالي المشتريات</p>
          <p className="font-semibold">{customer.totalSpent} ج.م</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">عدد الطلبات</p>
          <p className="font-semibold">{customer.totalOrders}</p>
        </div>
      </div>
      
      {customer.points >= 20 && (
        <div className="mb-4">
          <button
            onClick={() => setShowRedeem(!showRedeem)}
            className="w-full py-2 bg-green-500 text-white rounded-lg flex items-center justify-center gap-2"
          >
            <GiftIcon className="w-5 h-5" />
            استبدال النقاط ({customer.points} نقطة)
          </button>
          
          {showRedeem && (
            <div className="mt-3 space-y-2">
              <button
                onClick={() => onApplyDiscount('free_coffee')}
                className="w-full py-2 border border-green-500 text-green-500 rounded"
              >
                🎁 20 نقطة = كوب قهوة مجاني
              </button>
              <button
                onClick={() => onApplyDiscount('discount_10')}
                className="w-full py-2 border border-blue-500 text-blue-500 rounded"
              >
                🎫 20 نقطة = خصم 10%
              </button>
            </div>
          )}
        </div>
      )}
      
      <div className="text-sm text-gray-500 text-center">
        آخر زيارة: {new Date(customer.lastVisit?.toDate()).toLocaleDateString('ar-EG')}
      </div>
    </div>
  );
};
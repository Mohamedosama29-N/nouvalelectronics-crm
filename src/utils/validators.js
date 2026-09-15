export const validators = {
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

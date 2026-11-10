// src/services/analyticsService.js
import { db } from './firebase'
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { getLiveSnapshot } from './liveCollections'

export const analyticsService = {
  // تحليل المبيعات المتقدم
  async advancedSalesAnalysis(startDate, endDate, branchId = null) {
    let invoicesQuery = query(
      collection(db, 'invoices'),
      where('timestamp', '>=', startDate),
      where('timestamp', '<=', endDate)
    )
    
    if (branchId) {
      invoicesQuery = query(invoicesQuery, where('branchId', '==', branchId))
    }
    
    const invoicesSnapshot = await getDocs(invoicesQuery)
    const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(inv => inv.status !== 'voided')
    
    // تحليل الوقت
    const hourlySales = new Array(24).fill(0)
    const dailySales = {}
    const weeklySales = {}
    const monthlySales = {}
    
    invoices.forEach(invoice => {
      const date = invoice.timestamp.toDate()
      const hour = date.getHours()
      const day = date.toLocaleDateString()
      const week = this.getWeekNumber(date)
      const month = date.toLocaleString('default', { month: 'long' })
      
      hourlySales[hour] += invoice.total
      dailySales[day] = (dailySales[day] || 0) + invoice.total
      weeklySales[week] = (weeklySales[week] || 0) + invoice.total
      monthlySales[month] = (monthlySales[month] || 0) + invoice.total
    })
    
    // أفضل ساعات البيع
    const bestHours = hourlySales
      .map((sales, hour) => ({ hour, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5)
    
    // تحليل المنتجات
    const productSales = {}
    invoices.forEach(invoice => {
      invoice.items.forEach(item => {
        if (!productSales[item.productId]) {
          productSales[item.productId] = {
            name: item.name,
            quantity: 0,
            revenue: 0,
            orders: 0
          }
        }
        productSales[item.productId].quantity += item.quantity
        productSales[item.productId].revenue += item.total
        productSales[item.productId].orders += 1
      })
    })
    
    // أفضل المنتجات (Pareto - 80/20)
    const sortedProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue)
    const totalRevenue = sortedProducts.reduce((sum, p) => sum + p.revenue, 0)
    let cumulativeRevenue = 0
    const paretoProducts = []
    
    for (const product of sortedProducts) {
      cumulativeRevenue += product.revenue
      if (cumulativeRevenue <= totalRevenue * 0.8) {
        paretoProducts.push(product)
      }
    }
    
    // تنبؤ المبيعات (بسيط - average + trend)
    const salesValues = Object.values(dailySales)
    const averageSales = salesValues.reduce((a, b) => a + b, 0) / salesValues.length
    const trend = this.calculateTrend(salesValues)
    const nextDayPrediction = averageSales + trend
    
    return {
      summary: {
        totalRevenue: totalRevenue,
        totalOrders: invoices.length,
        averageOrderValue: totalRevenue / invoices.length,
        averageSalesPerDay: averageSales,
        predictedNextDaySales: nextDayPrediction
      },
      hourlyDistribution: hourlySales,
      bestSellingHours: bestHours,
      weeklyTrend: weeklySales,
      monthlyTrend: monthlySales,
      paretoProducts: paretoProducts.slice(0, 10),
      productPerformance: sortedProducts
    }
  },

  // تحليل العملاء (RFM - Recency, Frequency, Monetary)
  async customerRFMAnalysis() {
    const customersSnapshot = await getLiveSnapshot('customers')
    const customers = customersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    
    const now = new Date()
    const rfmScores = []
    
    for (const customer of customers) {
      // Recency - آخر زيارة
      const lastVisit = customer.lastVisit?.toDate() || new Date(0)
      const recencyDays = Math.floor((now - lastVisit) / (1000 * 60 * 60 * 24))
      const recencyScore = this.calculateRecencyScore(recencyDays)
      
      // Frequency - عدد الطلبات
      const frequencyScore = this.calculateFrequencyScore(customer.totalOrders || 0)
      
      // Monetary - إجمالي المشتريات
      const monetaryScore = this.calculateMonetaryScore(customer.totalSpent || 0)
      
      const totalScore = recencyScore + frequencyScore + monetaryScore
      let segment = 'standard'
      
      if (totalScore >= 12) segment = 'champions'
      else if (totalScore >= 9) segment = 'loyal'
      else if (totalScore >= 6) segment = 'potential'
      else if (totalScore >= 3) segment = 'at_risk'
      else segment = 'lost'
      
      rfmScores.push({
        customerId: customer.id,
        name: customer.name,
        recency: recencyDays,
        frequency: customer.totalOrders || 0,
        monetary: customer.totalSpent || 0,
        segment,
        recommendations: this.getRecommendationsBySegment(segment)
      })
    }
    
    // إحصائيات القطاعات
    const segments = {
      champions: rfmScores.filter(c => c.segment === 'champions'),
      loyal: rfmScores.filter(c => c.segment === 'loyal'),
      potential: rfmScores.filter(c => c.segment === 'potential'),
      at_risk: rfmScores.filter(c => c.segment === 'at_risk'),
      lost: rfmScores.filter(c => c.segment === 'lost')
    }
    
    return { rfmScores, segments }
  },

  calculateRecencyScore(days) {
    if (days <= 7) return 5
    if (days <= 30) return 4
    if (days <= 90) return 3
    if (days <= 180) return 2
    return 1
  },

  calculateFrequencyScore(orders) {
    if (orders >= 20) return 5
    if (orders >= 10) return 4
    if (orders >= 5) return 3
    if (orders >= 2) return 2
    return 1
  },

  calculateMonetaryScore(amount) {
    if (amount >= 5000) return 5
    if (amount >= 2000) return 4
    if (amount >= 1000) return 3
    if (amount >= 500) return 2
    return 1
  },

  getRecommendationsBySegment(segment) {
    const recommendations = {
      champions: [
        'أرسل لهم عروض VIP حصرية',
        'اطلب منهم تقييم الخدمة',
        'قدم لهم برنامج إحالة',
        'دعهم لاختبار منتجات جديدة أولاً'
      ],
      loyal: [
        'قدم لهم برنامج ولاء محسن',
        'أرسل عروض مخصصة بناءً على تاريخ مشترياتهم',
        'اطلب منهم الانضمام لنادي VIP'
      ],
      potential: [
        'أرسل عروض ترحيبية',
        'قدم خصم على الطلب التالي',
        'شجعهم على تجربة منتجات جديدة'
      ],
      at_risk: [
        'أرسل عروض استرداد',
        'تواصل معهم لمعرفة سبب عدم العودة',
        'قدم خصم خاص لعودتهم'
      ],
      lost: [
        'أرسل حملة "نفتقدك"',
        'قدم عرض مغري للعودة',
        'اطلب تحديث بياناتهم'
      ]
    }
    return recommendations[segment] || recommendations.potential
  },

  // تحليل اتجاهات السوق
  async marketTrends() {
    // جلب بيانات المبيعات لآخر 12 شهر
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('timestamp', '>=', Timestamp.fromDate(oneYearAgo))
    )
    
    const invoicesSnapshot = await getDocs(invoicesQuery)
    const invoices = invoicesSnapshot.docs.map(doc => doc.data()).filter(inv => inv.status !== 'voided')
    
    // تحليل الموسمية
    const seasonalData = {}
    invoices.forEach(invoice => {
      const month = invoice.timestamp.toDate().getMonth()
      seasonalData[month] = (seasonalData[month] || 0) + invoice.total
    })
    
    // تحديد المنتجات الرائجة موسمياً
    const seasonalProducts = {}
    invoices.forEach(invoice => {
      const month = invoice.timestamp.toDate().getMonth()
      invoice.items.forEach(item => {
        if (!seasonalProducts[month]) seasonalProducts[month] = {}
        seasonalProducts[month][item.name] = (seasonalProducts[month][item.name] || 0) + item.quantity
      })
    })
    
    return {
      seasonalTrends: seasonalData,
      seasonalBestSellers: seasonalProducts,
      growthRate: this.calculateGrowthRate(invoices),
      forecast: this.generateForecast(seasonalData)
    }
  },

  calculateGrowthRate(invoices) {
    // حساب معدل النمو بين الأشهر
    const monthlyData = {}
    invoices.forEach(invoice => {
      const monthKey = invoice.timestamp.toDate().toISOString().slice(0, 7)
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + invoice.total
    })
    
    const months = Object.keys(monthlyData).sort()
    if (months.length < 2) return 0
    
    const firstMonth = monthlyData[months[0]]
    const lastMonth = monthlyData[months[months.length - 1]]
    const growthRate = ((lastMonth - firstMonth) / firstMonth) * 100
    
    return growthRate
  },

  generateForecast(seasonalData) {
    // توقع بسيط باستخدام المتوسط المتحرك
    const values = Object.values(seasonalData)
    const average = values.reduce((a, b) => a + b, 0) / values.length
    const nextMonth = average * 1.05 // افتراض نمو 5%
    
    return {
      nextMonth: nextMonth,
      confidence: 'medium',
      factors: ['موسمي', 'اتجاه نمو']
    }
  },

  getWeekNumber(date) {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
    const week1 = new Date(d.getFullYear(), 0, 4)
    return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  },

  calculateTrend(values) {
    if (values.length < 2) return 0
    const n = values.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    
    for (let i = 0; i < n; i++) {
      sumX += i
      sumY += values[i]
      sumXY += i * values[i]
      sumX2 += i * i
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    return slope
  }
}
// src/components/common/PageErrorBoundary.jsx
// لو صفحة واحدة اتكسرت في الـ render، الحدود دي بتمنع الشاشة كلها تبقى بيضا
// وبتعرض رسالة الخطأ الحقيقية عشان نعرف نصلّحها بسرعة.
import { Component } from 'react'
import { logger } from '../../utils/logger'

class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    logger.error('Page render error:', error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    // نرجّع الصفحة لوضعها الطبيعي لما المستخدم يغيّر الصفحة
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="p-6 rtl">
        <div className="max-w-2xl mx-auto bg-red-50 dark:bg-red-900/30 border border-red-300 rounded-xl p-6">
          <h2 className="text-xl font-bold text-red-700 dark:text-red-300 mb-2">حصل خطأ في عرض الصفحة</h2>
          <p className="text-sm text-gray-700 dark:text-gray-200 mb-4">
            جرّب تحدّث الصفحة، ولو المشكلة فضلت ابعت رسالة الخطأ دي للدعم:
          </p>
          <pre className="text-xs bg-white dark:bg-gray-800 p-3 rounded overflow-auto whitespace-pre-wrap" dir="ltr">
            {String(error?.message || error)}
          </pre>
          <div className="flex gap-2 mt-4">
            <button onClick={() => window.location.reload()} className="bg-blue-500 text-white px-4 py-2 rounded-lg">
              تحديث الصفحة
            </button>
            <button onClick={() => this.setState({ error: null })} className="border px-4 py-2 rounded-lg dark:text-white">
              محاولة العرض مرة تانية
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default PageErrorBoundary

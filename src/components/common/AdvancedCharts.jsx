import React from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { useTheme } from './ThemeProvider';

// 🛠️ تحسين بصري: كانت الرسوم البيانية بتستخدم ألوان recharts الافتراضية
// (بنفسجي/أخضر فاتح عشوائيين) اللي مالهاش علاقة بهوية النظام البصرية
// (تيل/زمردي/كهرماني). دلوقتي بتستخدم نفس لوحة الألوان المستخدمة في باقي
// الشاشات، وبقت واعية بالوضع الليلي (كانت بترسم بألوان فاتحة ثابتة حتى في
// الوضع الليلي، وده كان بيبقى شكله غريب على خلفية غامقة).
const CHART_COLORS = ['#0d9488', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#0ea5e9'];

export function AdvancedCharts({ data, type = 'line', title, height = 300 }) {
  const { darkMode } = useTheme();
  const gridColor = darkMode ? '#334155' : '#e2e8f0';
  const textColor = darkMode ? '#94a3b8' : '#64748b';
  const tooltipStyle = darkMode
    ? { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.75rem', color: '#f1f5f9' }
    : { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', color: '#1e293b' };

  if (!data || data.length === 0) {
    return <div className="text-center text-slate-400 dark:text-slate-500 py-8">لا توجد بيانات</div>;
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
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="name" stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} />
            <YAxis stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ color: textColor }} />
            <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ fill: CHART_COLORS[0], r: 3 }} />
          </LineChart>
        );
      case 'bar':
        return (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="name" stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} />
            <YAxis stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: darkMode ? '#33415580' : '#f1f5f980' }} />
            <Legend wrapperStyle={{ color: textColor }} />
            <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
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
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
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

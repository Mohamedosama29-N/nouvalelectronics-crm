// components/Dashboard/StatsCard.jsx
export const StatsCard = ({ title, value, icon, color }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 transition-all hover:shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{title}</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-white mt-2">
            {value}
          </p>
        </div>
        <div className={`${color} p-4 rounded-full text-white text-2xl`}>
          {icon}
        </div>
      </div>
    </div>
  );
};
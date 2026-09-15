import { DASHBOARD_WIDGETS } from '../constants/dashboard';

export const getDashboardWidgetConfig = (appUser) => {
  const saved = appUser?.dashboardConfig?.widgets || {};
  return DASHBOARD_WIDGETS
    .map((w, idx) => ({
      ...w,
      visible: saved[w.id]?.visible !== undefined ? saved[w.id].visible : true,
      order: saved[w.id]?.order !== undefined ? saved[w.id].order : idx
    }))
    .sort((a, b) => a.order - b.order);
};

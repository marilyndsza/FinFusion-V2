import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'finfusion_trend_mode';
const TrendModeContext = createContext(null);

export function TrendModeProvider({ children }) {
  const [trendMode, setTrendMode] = useState(() => localStorage.getItem(STORAGE_KEY) || 'monthly');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, trendMode);
  }, [trendMode]);

  const value = useMemo(() => ({ trendMode, setTrendMode }), [trendMode]);

  return <TrendModeContext.Provider value={value}>{children}</TrendModeContext.Provider>;
}

export function useTrendMode() {
  const context = useContext(TrendModeContext);
  if (!context) {
    throw new Error('useTrendMode must be used within TrendModeProvider');
  }
  return context;
}

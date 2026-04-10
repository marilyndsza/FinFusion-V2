import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import * as api from '@/lib/api';
import { formatCurrency } from '@/utils/formatCurrency';
import Navbar from '@/components/Navbar';
import UserMenu from '@/components/UserMenu';
import logo from '@/assets/logo.png';
import { useTrendMode } from '@/context/TrendModeContext';

export default function Forecasting() {
  const { trendMode } = useTrendMode();
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('daily'); // daily or weekly

  useEffect(() => { loadForecast(); }, []);
  useEffect(() => {
    setViewMode(trendMode === 'weekly' ? 'weekly' : 'daily');
  }, [trendMode]);

  async function loadForecast() {
    setLoading(true);
    try {
      const fData = await api.getForecast();
      setForecast(fData);
    } catch (e) {
      console.error('Forecast loading error:', e);
    } finally { setLoading(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-container flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#630ed4] mx-auto" />
          <p className="mt-4 text-on-surface/60 font-body text-sm">Loading forecast...</p>
        </div>
      </div>
    );
  }

  // All values from backend
  const fData = forecast?.data || {};
  const fMeta = forecast?.metadata || {};
  const forecastPoints = fData.forecast || [];
  const weeklyForecast = fData.weekly_forecast || [];
  const totalPredicted = fData.total_predicted || 0;
  const trend = fData.trend || 'stable';
  const slopePerDay = fData.slope_per_day || 0;
  const trendPct = fData.trend_pct || 0;
  const avgDaily30 = fData.avg_daily_30d || 0;
  const avgDaily7 = fData.avg_daily_7d || 0;
  const peakDay = fData.peak_day || null;
  const topCategories = fData.top_categories || [];
  const aiInsights = fData.ai_insights || [];
  const lastMonthContext = fData.last_month_context || null;
  const methodLabel = fMeta.method_label || fMeta.method || 'Statistical forecast';
  const confidence = fMeta.confidence || 0;

  const isIncreasing = trend === 'increasing';
  const isDecreasing = trend === 'decreasing';
  const trendLabel = trend.charAt(0).toUpperCase() + trend.slice(1);
  const chartData = viewMode === 'weekly' && weeklyForecast.length > 0 ? weeklyForecast : forecastPoints;

  const highestPoint = chartData.length > 0 ? chartData.reduce((max, item) =>
    item.predicted_amount > (max?.predicted_amount || 0) ? item : max,
    chartData[0]
  ) : null;

  const maxAmount = highestPoint?.predicted_amount || 1;
  const avgChangePct = avgDaily30 > 0 ? (((avgDaily7 - avgDaily30) / avgDaily30) * 100) : 0;
  const avgChangeUp = avgChangePct > 0;
  const peakDateValue = peakDay?.date ? new Date(peakDay.date) : null;
  const peakDateLabel = peakDateValue
    ? peakDateValue.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'N/A';
  const peakCycle = peakDateValue
    ? peakDateValue.getDate() <= 5
      ? 'MONTH START'
      : peakDateValue.getDate() >= 26
        ? 'MONTH END'
        : 'MID CYCLE'
    : 'N/A';
  const peakIndex = chartData.findIndex((point) => point.date === peakDay?.date);
  const peakOffset = peakIndex >= 0 && chartData.length > 1
    ? Math.min(88, Math.max(12, (peakIndex / (chartData.length - 1)) * 100))
    : 50;
  const axisLabels = chartData.length > 0
    ? [0, 0.25, 0.5, 0.75, 1]
        .map((ratio) => chartData[Math.min(chartData.length - 1, Math.round((chartData.length - 1) * ratio))])
        .filter(Boolean)
    : [];

  return (
    <div className="min-h-screen bg-surface-container">
      {/* NAVBAR */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-outline-variant/10">
        <div className="container mx-auto px-6 sm:px-10 lg:px-14 py-4 flex items-center justify-between gap-5">
          <img src={logo} alt="FinFusion logo" className="h-10 object-contain" />
          <Navbar />
          <UserMenu />
        </div>
      </header>

      <main className="pt-8 sm:pt-12 pb-16 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
        {/* Hero Section */}
        <div className="mb-12">
          <p className="text-xs font-bold text-secondary uppercase tracking-[0.2em] mb-2 font-body">
            FINANCIAL HORIZON
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-headline font-extrabold text-on-surface mb-4 leading-[1.1]">
            Projected spending:{' '}
            <span className="bg-gradient-to-r from-[#630ed4] to-[#7c3aed] bg-clip-text text-transparent">
              {formatCurrency(totalPredicted)}
            </span>{' '}
            <span className="text-on-surface/40 text-2xl sm:text-3xl lg:text-4xl">over {forecastPoints.length} days</span>
          </h1>

          <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-low">
              {isIncreasing ? <TrendingUp className="w-4 h-4 text-[#ef4444]" />
                : isDecreasing ? <TrendingDown className="w-4 h-4 text-[#10b981]" />
                : <div className="w-2 h-2 bg-on-surface/40 rounded-full" />}
              <span className="text-xs font-bold text-on-surface uppercase tracking-wider font-body">
                {trendLabel}
              </span>
            </div>
            <div className="text-base text-on-surface/70 font-body">
              Trend: <span className="font-semibold text-[#630ed4]">{trendPct >= 0 ? '+' : ''}{trendPct.toFixed(1)}%</span>
            </div>
            <div className="text-base text-on-surface/70 font-body">
              Method: <span className="font-semibold">{methodLabel}</span>
            </div>
            <div className="text-base text-on-surface/70 font-body">
              Confidence: <span className="font-bold text-[#630ed4]">{(confidence * 100).toFixed(0)}%</span>
            </div>
            {/* ML Model Indicator */}
            {forecast?.metadata?.is_ml_model === false && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-300">
                <svg className="w-3 h-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs font-bold text-amber-700 font-body">
                  Using statistical fallback (insufficient data for ML)
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6 lg:gap-8">
          {/* Main Chart Area */}
          <section className="col-span-12 lg:col-span-8 space-y-8">
            {/* Chart Card */}
            <div className="bg-surface-container-lowest rounded-[1rem] p-5 sm:p-8 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 gap-4">
                <div>
                  <h2 className="text-2xl font-headline font-bold text-on-surface">Predicted Spending</h2>
                  <p className="text-base text-on-surface/60 font-body mt-1">30-day projection based on learned historical patterns</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setViewMode('daily')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold font-body transition-all ${
                      viewMode === 'daily' 
                        ? 'bg-surface-container-high text-on-surface' 
                        : 'hover:bg-surface-container-high/50 text-on-surface/60'
                    }`}
                  >
                    Daily
                  </button>
                  <button 
                    onClick={() => setViewMode('weekly')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold font-body transition-all ${
                      viewMode === 'weekly' 
                        ? 'bg-surface-container-high text-on-surface' 
                        : 'hover:bg-surface-container-high/50 text-on-surface/60'
                    }`}
                  >
                    Weekly
                  </button>
                </div>
              </div>

              {/* Chart Visualization */}
              <div className="h-[360px] w-full relative">
                {/* Grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`border-t w-full ${i === 4 ? 'border-outline-variant/30' : 'border-outline-variant/10'}`} />
                  ))}
                </div>

                {/* Peak Day Callout */}
                {peakDay?.date && viewMode === 'daily' && (
                  <div className="absolute top-8 z-10 -translate-x-1/2" style={{ left: `${peakOffset}%` }}>
                    <div className="bg-gradient-to-r from-[#630ed4] to-[#7c3aed] text-white px-4 py-2 rounded-xl shadow-[0_24px_48px_rgba(99,14,212,0.25)] flex flex-col items-center">
                      <span className="text-[10px] font-bold tracking-wider opacity-90 uppercase font-body">Peak Spending Day</span>
                      <span className="text-lg font-headline font-extrabold tracking-tight">
                        {peakDateLabel} • {formatCurrency(peakDay.predicted_amount || 0)}
                      </span>
                    </div>
                    <div className="w-[1px] h-32 bg-[#630ed4]/30 mx-auto mt-2 border-l border-dashed border-[#630ed4]" />
                  </div>
                )}

                {/* Background gradient fill */}
                <div className="absolute inset-x-0 bottom-0 h-full overflow-hidden opacity-5 pointer-events-none">
                  <div className="w-full h-full bg-gradient-to-t from-[#630ed4] to-transparent" />
                </div>

                {/* Bar Chart */}
                {chartData.length > 0 ? (
                  <div className="flex items-end justify-between w-full h-[280px] px-4 gap-2 relative z-0">
                    {chartData.map((point, idx) => {
                      const heightPct = (point.predicted_amount / maxAmount) * 100;
                      const isHighest = point.predicted_amount === highestPoint?.predicted_amount;
                      return (
                        <div 
                          key={idx}
                          className={`flex-1 rounded-t-sm transition-all cursor-pointer group ${
                            isHighest 
                              ? 'bg-gradient-to-t from-[#630ed4] to-[#7c3aed]' 
                              : 'bg-surface-container-high hover:bg-[#630ed4]/40'
                          }`}
                          style={{ height: `${Math.max(heightPct, 2)}%` }}
                          title={`${point.date}: ${formatCurrency(point.predicted_amount)}`}
                        >
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 left-1/2 -translate-x-1/2 bg-on-surface text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                            {formatCurrency(point.predicted_amount)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[280px] text-on-surface/30 text-sm font-body">
                    No forecast data available
                  </div>
                )}
              </div>

              {/* X-axis labels */}
              <div className="flex justify-between mt-6 text-[10px] font-bold text-on-surface/40 uppercase tracking-widest font-body px-4">
                {axisLabels.map((point, idx) => (
                  <span key={`${point.date}-${idx}`}>
                    {viewMode === 'weekly'
                      ? point.label
                      : new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
                  </span>
                ))}
              </div>
            </div>

            {/* Detailed Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-surface-container-lowest p-5 sm:p-6 rounded-[1rem] border border-outline-variant/10">
                <p className="text-[10px] font-bold text-on-surface/50 uppercase tracking-wider mb-2 font-body">30-day Avg</p>
                <p className="text-3xl font-headline font-bold text-on-surface tracking-tight">{formatCurrency(avgDaily30)}</p>
                <div className={`mt-3 flex items-center gap-1 text-[10px] font-bold ${avgChangeUp ? 'text-[#ef4444]' : 'text-[#630ed4]'} font-body`}>
                  {avgChangeUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {avgChangePct >= 0 ? '+' : ''}{avgChangePct.toFixed(1)}% vs 7D
                </div>
              </div>

              <div className="bg-surface-container-lowest p-5 sm:p-6 rounded-[1rem] border border-outline-variant/10">
                <p className="text-[10px] font-bold text-on-surface/50 uppercase tracking-wider mb-2 font-body">7-day Avg</p>
                <p className="text-3xl font-headline font-bold text-on-surface tracking-tight">{formatCurrency(avgDaily7)}</p>
                <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-[#630ed4] font-body">
                  {slopePerDay >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  Slope {slopePerDay >= 0 ? '+' : ''}{slopePerDay.toFixed(0)}/day
                </div>
              </div>

              <div className="bg-surface-container-lowest p-5 sm:p-6 rounded-[1rem] border border-outline-variant/10">
                <p className="text-[10px] font-bold text-on-surface/50 uppercase tracking-wider mb-2 font-body">Forecast Trend</p>
                <p className="text-3xl font-headline font-bold text-on-surface tracking-tight">{trendLabel}</p>
                <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-[#630ed4] font-body">
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="8" r="6" />
                    <path d="M6 8l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  </svg>
                  {(confidence * 100).toFixed(0)}% confidence
                </div>
              </div>

              <div className="bg-surface-container-lowest p-5 sm:p-6 rounded-[1rem] border border-outline-variant/10">
                <p className="text-[10px] font-bold text-on-surface/50 uppercase tracking-wider mb-2 font-body">Peak Day</p>
                <p className="text-3xl font-headline font-bold text-on-surface tracking-tight">{peakDateLabel}</p>
                <p className="mt-3 text-[10px] font-bold text-on-surface/50 uppercase font-body">{peakCycle}</p>
              </div>
            </div>
          </section>

          {/* Insights & Categories Sidebar */}
          <aside className="col-span-12 lg:col-span-4 space-y-6">
            {/* AI Insights */}
            <div className="bg-gradient-to-br from-[#630ed4]/10 to-[#7c3aed]/10 rounded-[1rem] p-6 border border-[#630ed4]/20">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#630ed4] to-[#7c3aed] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-headline font-bold text-on-surface">AI Insights</h3>
                  <p className="text-xs text-on-surface/50 font-body">Analyzing your velocity</p>
                </div>
              </div>

              <div className="space-y-3">
                {aiInsights.length > 0 ? aiInsights.map((insight, idx) => (
                  <div key={idx} className="flex gap-3 p-3 rounded-lg bg-white/50 backdrop-blur-sm">
                    <div className="mt-1 text-[#630ed4]">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-on-surface font-body">{insight.title}</p>
                      <p className="text-xs text-on-surface leading-relaxed font-body mt-1">
                        {insight.message}
                      </p>
                    </div>
                  </div>
                )) : (
                  <p className="text-xs text-on-surface/50 p-3 font-body">
                    Add more expenses to generate personalized insights.
                  </p>
                )}
              </div>

              <button className="mt-4 w-full py-2.5 rounded-lg bg-gradient-to-r from-[#630ed4] to-[#7c3aed] text-white text-xs font-bold uppercase tracking-wide hover:shadow-lg transition-all font-body">
                Generate Full Report
              </button>
            </div>

            {/* Top Categories */}
            <div className="bg-surface-container-lowest rounded-[1rem] p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-base font-headline font-bold text-on-surface">Top Categories</h3>
                <span className="text-[10px] font-bold text-on-surface/40 uppercase tracking-wider font-body">Compare</span>
              </div>

              <div className="space-y-5">
                {topCategories.length > 0 ? topCategories.map((cat, idx) => {
                  const maxCatAmount = Math.max(...topCategories.map(c => c.projected_amount));
                  const pct = maxCatAmount > 0 ? (cat.projected_amount / maxCatAmount) * 100 : 0;
                  const budgetPct = Math.min(cat.cap_utilization || 0, 100);
                  
                  return (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-on-surface font-body">{cat.category}</span>
                        <span className="text-sm font-bold text-[#630ed4] font-headline">{formatCurrency(cat.projected_amount)}</span>
                      </div>
                      <div className="w-full h-2 bg-surface-container-low rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#630ed4] to-[#7c3aed] rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-on-surface/40 font-body">Projection vs Budget</span>
                        <span className="text-[10px] font-bold text-on-surface/60 font-body">
                          {cat.budget_cap > 0 ? `${budgetPct.toFixed(0)}% of cap` : 'No cap yet'}
                        </span>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-sm text-on-surface/40 font-body">No category data available</p>
                )}
              </div>
            </div>

            {/* Last Month Context */}
            <div className="bg-surface-container-low rounded-[1rem] p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
                  <svg className="w-5 h-5 text-on-surface/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-on-surface font-headline">Last Month Context</h4>
                  <p className="text-xs text-on-surface/50 font-body">
                    {lastMonthContext
                      ? `${lastMonthContext.change_pct >= 0 ? '+' : ''}${lastMonthContext.change_pct}% ${lastMonthContext.label}`
                      : 'No prior context'}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

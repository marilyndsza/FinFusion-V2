import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, BarChart3, Award } from 'lucide-react';
import { formatCurrency } from '@/utils/formatCurrency';
import * as api from '@/lib/api';
import Navbar from '@/components/Navbar';
import UserMenu from '@/components/UserMenu';
import logo from '@/assets/logo.png';

const CHART_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316'];

export default function Insights() {
  const [history, setHistory] = useState(null);
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trendView, setTrendView] = useState('all');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [histRes, trendRes] = await Promise.all([
        api.getHistory(),
        api.getCategoryTrends(),
      ]);
      setHistory(histRes);
      setTrends(trendRes);
    } catch (e) {
      console.error('Insights load error:', e);
    } finally { setLoading(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
      </div>
    );
  }

  const monthlyTotals = history?.data?.monthly_totals || [];
  const dateLabel = history?.metadata?.label || 'Historical trends';
  const dateRange = history?.metadata?.date_range || '';

  const periods = trends?.data?.periods || [];
  const series = trends?.data?.series || {};
  const topCategories = trends?.data?.top_categories || [];

  // Build line chart data: [{period, total, count}]
  const allTimeLineData = monthlyTotals.map(m => ({
    period: m.period,
    label: m.period.length >= 7 ? m.period.slice(0, 7) : m.period,
    total: m.total,
    count: m.count,
  }));
  const recentLineData = allTimeLineData.slice(-12);
  const lineData = trendView === 'recent' ? recentLineData : allTimeLineData;

  // Build stacked bar data: [{period, Food: x, Rent: y, ...}]
  const topCatNames = topCategories.slice(0, 6).map(c => c.category);
  const barData = periods.map((p, i) => {
    const row = { period: p.length >= 7 ? p.slice(0, 7) : p };
    topCatNames.forEach(cat => {
      row[cat] = series[cat]?.[i] || 0;
    });
    return row;
  });

  // Month-over-month comparison (last 12 months)
  const recentMonths = monthlyTotals.slice(-13);
  const momData = recentMonths.slice(1).map((m, i) => {
    const prev = recentMonths[i];
    const delta = m.total - prev.total;
    const deltaPct = prev.total > 0 ? ((delta / prev.total) * 100) : 0;
    return {
      period: m.period.length >= 7 ? m.period.slice(0, 7) : m.period,
      total: m.total,
      previous: prev.total,
      delta: Math.round(delta),
      deltaPct: Math.round(deltaPct * 10) / 10,
    };
  });

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      {/* NAVBAR */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <img src={logo} alt="FinFusion logo" className="h-8 object-contain" />
          <Navbar />
          <UserMenu />
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-6xl">
        {/* HEADER */}
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900" data-testid="insights-title">Insights</h1>
          <p className="text-slate-500 mt-2" data-testid="insights-subtitle">{dateLabel}</p>
          {dateRange && <p className="text-xs text-slate-400 mt-1">{dateRange}</p>}
        </div>

        {/* MONTHLY SPENDING TREND (Line Chart) */}
        <Card className="rounded-[24px] border-0 bg-white p-6 mb-8 shadow-sm" data-testid="monthly-trend-card">
          <div className="flex items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">Monthly Spending Trend</h2>
            </div>
            <div className="inline-flex rounded-full bg-slate-100 p-1">
              <button
                onClick={() => setTrendView('recent')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  trendView === 'recent' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                Recent 12M
              </button>
              <button
                onClick={() => setTrendView('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  trendView === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                All Time
              </button>
            </div>
          </div>
          {lineData.length > 0 ? (
            <div className="overflow-x-auto pb-2">
              <div
                style={{ width: `${Math.max(900, lineData.length * 72)}px`, height: '300px' }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                      formatter={(v) => [formatCurrency(v), 'Total']}
                    />
                    <Line type="linear" dataKey="total" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-10">No historical data</p>
          )}
        </Card>

        {/* CATEGORY TRENDS (Stacked Bar) + TOP CATEGORIES */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-8 mb-8">
          <Card className="rounded-[24px] border-0 bg-white p-6 shadow-sm" data-testid="category-trends-card">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">Category Trends Over Time</h2>
            </div>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    interval={Math.max(0, Math.floor(barData.length / 12))}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                    formatter={(v) => [formatCurrency(v)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {topCatNames.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === topCatNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-400 text-center py-10">No category data</p>
            )}
          </Card>

          {/* TOP CATEGORIES */}
          <Card className="rounded-[24px] border-0 bg-white p-6 shadow-sm" data-testid="top-categories-card">
            <div className="flex items-center gap-2 mb-6">
              <Award className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">Top Categories</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">All-time spending</p>
            <div className="space-y-4">
              {topCategories.map((cat, idx) => {
                const maxAmt = topCategories[0]?.total || 1;
                const pct = (cat.total / maxAmt) * 100;
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                        <span className="text-sm font-medium text-slate-800">{cat.category}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-900">{formatCurrency(cat.total)}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* MONTH-OVER-MONTH COMPARISON */}
        <Card className="rounded-[24px] border-0 bg-white p-6 shadow-sm" data-testid="mom-comparison-card">
          <h2 className="text-lg font-bold text-slate-900 mb-6">Month-over-Month Comparison</h2>
          <p className="text-xs text-slate-400 mb-4">Last 12 months</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="mom-table">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3 pr-4">Period</th>
                  <th className="py-3 pr-4">Total</th>
                  <th className="py-3 pr-4">Previous</th>
                  <th className="py-3 pr-4">Change</th>
                  <th className="py-3">Change %</th>
                </tr>
              </thead>
              <tbody>
                {momData.map((row, idx) => (
                  <tr key={row.period} className="border-b border-slate-50 last:border-0">
                    <td className="py-3 pr-4 font-medium text-slate-800">{row.period}</td>
                    <td className="py-3 pr-4 text-slate-700">{formatCurrency(row.total)}</td>
                    <td className="py-3 pr-4 text-slate-500">{formatCurrency(row.previous)}</td>
                    <td className={`py-3 pr-4 font-medium ${row.delta > 0 ? 'text-red-500' : row.delta < 0 ? 'text-emerald-500' : 'text-slate-500'}`}>
                      {row.delta > 0 ? '+' : ''}{formatCurrency(Math.abs(row.delta))}
                    </td>
                    <td className={`py-3 font-bold ${row.deltaPct > 0 ? 'text-red-500' : row.deltaPct < 0 ? 'text-emerald-500' : 'text-slate-500'}`}>
                      {row.deltaPct > 0 ? '+' : ''}{row.deltaPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {momData.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">Not enough data for month-over-month comparison</p>
          )}
        </Card>
      </main>
    </div>
  );
}

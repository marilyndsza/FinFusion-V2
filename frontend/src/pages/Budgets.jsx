import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import {
  Plus, Sparkles, Pencil, AlertTriangle, ChevronDown, ChevronUp, Trash2,
  UtensilsCrossed, Bus, ShoppingBag, Tv, Zap,
  Heart, Home, GraduationCap, Plane, MoreHorizontal
} from 'lucide-react';
import { formatCurrency } from '@/utils/formatCurrency';
import * as api from '@/lib/api';
import Navbar from '@/components/Navbar';
import UserMenu from '@/components/UserMenu';
import logo from '@/assets/logo.png';

const CATEGORY_ICONS = {
  Food: UtensilsCrossed,
  Transport: Bus,
  Shopping: ShoppingBag,
  Entertainment: Tv,
  Utilities: Zap,
  Healthcare: Heart,
  Rent: Home,
  Education: GraduationCap,
  Travel: Plane,
  Savings: Sparkles,
  Other: MoreHorizontal,
};

const CATEGORY_COLORS = {
  Food: { bg: 'bg-emerald-50', icon: 'text-emerald-600', bar: 'bg-emerald-500' },
  Transport: { bg: 'bg-indigo-50', icon: 'text-indigo-600', bar: 'bg-indigo-500' },
  Shopping: { bg: 'bg-rose-50', icon: 'text-rose-500', bar: 'bg-rose-500' },
  Entertainment: { bg: 'bg-violet-50', icon: 'text-violet-600', bar: 'bg-violet-500' },
  Utilities: { bg: 'bg-amber-50', icon: 'text-amber-600', bar: 'bg-amber-500' },
  Healthcare: { bg: 'bg-pink-50', icon: 'text-pink-500', bar: 'bg-pink-500' },
  Rent: { bg: 'bg-slate-100', icon: 'text-slate-600', bar: 'bg-slate-600' },
  Education: { bg: 'bg-cyan-50', icon: 'text-cyan-600', bar: 'bg-cyan-500' },
  Travel: { bg: 'bg-sky-50', icon: 'text-sky-600', bar: 'bg-sky-500' },
  Savings: { bg: 'bg-lime-50', icon: 'text-lime-600', bar: 'bg-lime-500' },
  Other: { bg: 'bg-gray-100', icon: 'text-gray-500', bar: 'bg-gray-500' },
};

function getStatusInfo(pct) {
  if (pct > 100) return { label: 'OVER BUDGET', color: 'bg-red-500 text-white', barOverride: 'bg-red-500' };
  if (pct >= 75) return { label: 'CLOSE TO LIMIT', color: 'bg-amber-100 text-amber-700', barOverride: 'bg-amber-500' };
  return { label: 'ON TRACK', color: 'bg-emerald-100 text-emerald-700', barOverride: null };
}

export default function Budgets() {
  const navigate = useNavigate();
  const [budgets, setBudgets] = useState([]);
  const [budgetMeta, setBudgetMeta] = useState({});
  const [currentData, setCurrentData] = useState(null);
  const [topInsight, setTopInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adjustDialog, setAdjustDialog] = useState({ open: false, category: '', limit: '' });
  const [expandedCards, setExpandedCards] = useState({});

  // Month context
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);

  useEffect(() => { initContext(); }, []);

  async function initContext() {
    const res = await api.getAvailableMonths();
    const months = res?.data || [];
    const defaultCtx = res?.metadata?.default || {};
    setAvailableMonths(months);
    setSelectedMonth(defaultCtx.month || 12);
    setSelectedYear(defaultCtx.year || 2024);
  }

  useEffect(() => {
    if (selectedMonth != null && selectedYear != null) {
      loadData(selectedMonth, selectedYear);
    }
  }, [selectedMonth, selectedYear]);

  async function loadData(m, y) {
    setLoading(true);
    try {
      const [budgetRes, currentRes, suggestionsRes] = await Promise.all([
        api.getBudgets(m, y),
        api.getCurrentAnalytics(m, y),
        api.getSuggestions(),
      ]);
      setBudgets(budgetRes?.data?.budget || []);
      setBudgetMeta(budgetRes?.metadata || {});
      setCurrentData(currentRes);

      const allInsights = suggestionsRes?.data || [];
      const monthComp = allInsights.find(i => i.type === 'month_comparison');
      const catComp = allInsights.find(i => i.type === 'category_comparison');
      setTopInsight(monthComp || catComp || allInsights[0] || null);
    } catch (err) {
      console.error('Error loading budgets:', err);
      toast.error('Failed to load budget data');
    } finally { setLoading(false); }
  }

  // Category expenses from current context data (scoped to selected month)
  function getCategoryExpenses(category) {
    const cats = currentData?.data?.categories || [];
    const cat = cats.find(c => c.category === category);
    return cat?.expenses || [];
  }

  async function toggleCategory(category) {
    setExpandedCards(prev => ({ ...prev, [category]: !prev[category] }));
  }

  async function handleDeleteExpense(id, category) {
    try {
      await api.deleteExpense(id);
      toast.success('Expense deleted');
      await loadData(selectedMonth, selectedYear);
    } catch (err) {
      toast.error('Failed to delete expense');
    }
  }

  // Computed totals from backend data
  const totalLimit = budgets.reduce((s, b) => s + (b.limit || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (b.current || 0), 0);
  const totalLeft = Math.max(0, totalLimit - totalSpent);
  const utilizationPct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
  const periodLabel = budgetMeta?.label || currentData?.metadata?.label || 'Current';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
          <p className="mt-4 text-slate-500">Loading budgets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <Toaster position="top-right" />

      {/* NAVBAR */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <img src={logo} alt="FinFusion logo" className="h-8 object-contain" />
          <Navbar />
          <UserMenu />
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-6xl">
        {/* TITLE + MONTH PICKER + ADD CATEGORY */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900" data-testid="budget-title">Budgets</h1>
            <p className="text-slate-500 mt-2 max-w-md">
              Showing data for <span className="font-semibold text-indigo-600" data-testid="period-label">{periodLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Month picker */}
            <select
              className="text-sm bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
              value={`${selectedYear}-${selectedMonth}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                setSelectedYear(y);
                setSelectedMonth(m);
                setExpandedCards({});
              }}
              data-testid="month-picker"
            >
              {availableMonths.map((m) => (
                <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                  {m.label} ({m.count})
                </option>
              ))}
            </select>
            <Button onClick={() => navigate('/')} data-testid="add-category-btn" className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-2xl px-6 py-3 h-auto font-semibold shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300 transition-all">
              <Plus className="w-4 h-4 mr-2" /> Add Category
            </Button>
          </div>
        </div>

        {/* OVERVIEW CARD */}
        <Card className="rounded-[28px] border-0 bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-violet-50/40 p-8 mb-10 shadow-sm" data-testid="budget-overview-card">
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr,1fr] gap-8">
            {/* Left: Overview stats */}
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-indigo-400 mb-3">Current Month Overview</p>
              <div className="mb-4">
                <p className="text-4xl md:text-5xl font-bold text-slate-900" data-testid="total-budget-spent">
                  {formatCurrency(totalSpent)}
                </p>
              </div>

              {/* Usage bar */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-400">Usage</span>
                <span className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">{utilizationPct.toFixed(0)}% utilized</span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${utilizationPct > 90 ? 'bg-red-500' : utilizationPct > 70 ? 'bg-amber-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}
                  style={{ width: `${Math.min(utilizationPct, 100)}%` }}
                  data-testid="usage-bar"
                />
              </div>

              {/* Spent / Left */}
              <div className="flex items-center gap-8 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 inline-block" />
                  <span className="text-slate-700 font-medium" data-testid="total-spent">{formatCurrency(totalSpent)} spent</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" />
                  <span className="text-slate-500" data-testid="total-left">{formatCurrency(totalLeft)} left</span>
                </div>
              </div>
            </div>

            {/* Right: Weekly Insight */}
            {topInsight && (
              <div className="flex items-start" data-testid="weekly-insight-card">
                <div className="bg-gradient-to-br from-purple-100/80 to-indigo-100/60 rounded-[20px] p-6 w-full">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span className="text-sm font-bold text-slate-800">Data Insight</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{topInsight.message}</p>
                  {topInsight.confidence != null && (
                    <p className="text-[10px] text-indigo-400 mt-3 font-medium">Confidence: {(topInsight.confidence * 100).toFixed(0)}%</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* CATEGORY CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" data-testid="budget-categories-grid">
          {budgets.map((budget, idx) => {
            const pct = budget.percentage || 0;
            const status = getStatusInfo(pct);
            const catColors = CATEGORY_COLORS[budget.category] || CATEGORY_COLORS.Other;
            const Icon = CATEGORY_ICONS[budget.category] || MoreHorizontal;
            const isOver = pct > 100;
            const overAmount = Math.max(0, (budget.current || 0) - (budget.limit || 0));
            const barColor = status.barOverride || catColors.bar;

            return (
              <Card
                key={budget.category + idx}
                className="rounded-[24px] border-0 bg-white shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col"
                data-testid={`budget-card-${budget.category}`}
              >
                {/* Icon */}
                <div className={`h-12 w-12 rounded-2xl ${catColors.bg} flex items-center justify-center mb-5`}>
                  <Icon className={`w-5 h-5 ${catColors.icon}`} />
                </div>

                {/* Category name + budget */}
                <h3 className="text-lg font-bold text-slate-900 mb-1">{budget.category}</h3>
                <p className="text-sm text-slate-500 mb-1">{formatCurrency(budget.limit)} Budget</p>

                {/* Adjust button */}
                <button
                  className="inline-flex items-center gap-1 text-[11px] text-indigo-500 font-bold uppercase tracking-wider mb-5 hover:text-indigo-700 transition-colors w-fit"
                  onClick={() => setAdjustDialog({ open: true, category: budget.category, limit: budget.limit?.toFixed(0) || '0' })}
                  data-testid={`adjust-${budget.category}`}
                >
                  <Pencil className="w-3 h-3" /> Adjust
                </button>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden mb-4">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>

                {/* Spent + status */}
                <div className="flex items-center justify-between">
                  <div>
                    {isOver ? (
                      <>
                        <p className="text-[11px] text-red-500 font-semibold uppercase flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Over by {formatCurrency(overAmount)}
                        </p>
                        <p className="text-xl font-bold text-red-600" data-testid={`spent-${budget.category}`}>
                          {formatCurrency(budget.current)}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] text-slate-400 font-semibold uppercase">Spent</p>
                        <p className="text-xl font-bold text-slate-900" data-testid={`spent-${budget.category}`}>
                          {formatCurrency(budget.current)}
                        </p>
                      </>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${status.color}`} data-testid={`status-${budget.category}`}>
                    {status.label}
                  </span>
                </div>

                {/* Expand/Collapse toggle */}
                <button
                  className="mt-4 flex items-center justify-center gap-1 text-[11px] text-indigo-500 font-semibold uppercase tracking-wider hover:text-indigo-700 transition-colors w-full py-2 rounded-xl hover:bg-indigo-50"
                  onClick={() => toggleCategory(budget.category)}
                  data-testid={`toggle-expenses-${budget.category}`}
                >
                  {expandedCards[budget.category] ? (
                    <><ChevronUp className="w-3.5 h-3.5" /> Hide Expenses</>
                  ) : (
                    <><ChevronDown className="w-3.5 h-3.5" /> Show Expenses</>
                  )}
                </button>

                {/* Expense dropdown */}
                {expandedCards[budget.category] && (() => {
                  const expenses = getCategoryExpenses(budget.category);
                  return (
                    <div className="mt-3 border-t border-slate-100 pt-3 space-y-1 max-h-52 overflow-y-auto" data-testid={`expense-list-${budget.category}`}>
                      {expenses.length > 0 ? (
                        expenses.slice(0, 20).map(exp => (
                          <div key={exp.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-slate-50 group text-xs">
                            <div className="flex-1 min-w-0 mr-2">
                              <p className="font-medium text-slate-800 truncate">{exp.description}</p>
                              <p className="text-slate-400 text-[10px]">{exp.date}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="font-semibold text-slate-700">{formatCurrency(exp.amount)}</span>
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-400 hover:text-rose-600 p-1 rounded"
                                onClick={() => handleDeleteExpense(exp.id, budget.category)}
                                data-testid={`delete-exp-${exp.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 text-center py-3">No expenses in {periodLabel}</p>
                      )}
                      {expenses.length > 20 && (
                        <p className="text-[10px] text-slate-400 text-center pt-1">
                          Showing 20 of {expenses.length}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </Card>
            );
          })}

          {budgets.length === 0 && (
            <div className="col-span-full text-center py-16">
              <p className="text-slate-400 mb-2">No budget data available</p>
              <p className="text-sm text-slate-500">Add expenses from the Dashboard to auto-generate budgets</p>
            </div>
          )}
        </div>

        {/* FOOTER INFO */}
        {budgets.length > 0 && (
          <div className="mt-10 p-5 bg-indigo-50/50 rounded-2xl text-center">
            <p className="text-xs text-slate-500">
              {budgetMeta.method_label || 'Budget = historical monthly mean + 1 std deviation'}.
              Based on {budgets[0]?.months_of_data || 0}+ months of data.
            </p>
          </div>
        )}
      </main>

      {/* ADJUST BUDGET DIALOG */}
      <Dialog open={adjustDialog.open} onOpenChange={open => setAdjustDialog(a => ({ ...a, open }))}>
        <DialogContent className="rounded-[24px]" data-testid="adjust-budget-dialog">
          <DialogHeader>
            <DialogTitle>Adjust {adjustDialog.category} Budget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="new-limit">New Budget Limit</Label>
              <Input
                id="new-limit"
                type="number"
                value={adjustDialog.limit}
                onChange={e => setAdjustDialog(a => ({ ...a, limit: e.target.value }))}
                data-testid="adjust-limit-input"
              />
            </div>
            <p className="text-xs text-slate-400">
              This is a visual adjustment. Backend budgets are auto-generated from historical data.
            </p>
            <Button
              className="w-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-xl"
              onClick={() => {
                toast.success(`${adjustDialog.category} budget noted`);
                setAdjustDialog({ open: false, category: '', limit: '' });
              }}
              data-testid="adjust-save-btn"
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* FAB */}
      <div className="fixed bottom-8 right-8 z-50" data-testid="fab-add">
        <button onClick={() => navigate('/')} className="h-14 w-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-xl shadow-indigo-300/50 flex items-center justify-center hover:scale-105 transition-transform">
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

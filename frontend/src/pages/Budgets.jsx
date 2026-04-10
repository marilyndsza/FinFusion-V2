import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import {
  Plus, Sparkles, Pencil, AlertTriangle, ChevronDown, ChevronUp, Trash2,
  UtensilsCrossed, Bus, ShoppingBag, Tv, Zap,
  Heart, Home, GraduationCap, Plane, MoreHorizontal, Dumbbell, PawPrint,
  Gift, Coffee, Gamepad2, BookOpen, Briefcase, Shirt, Car, Baby
} from 'lucide-react';
import { formatCurrency } from '@/utils/formatCurrency';
import * as api from '@/lib/api';
import Navbar from '@/components/Navbar';
import UserMenu from '@/components/UserMenu';
import logo from '@/assets/logo.png';
import { useTrendMode } from '@/context/TrendModeContext';
import { endOfWeek, formatWeeklyLabel, getWeeksInMonth, startOfWeek } from '@/lib/trendUtils';

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

function getCategoryVisual(category) {
  const normalized = (category || '').trim().toLowerCase();

  const smartMatches = [
    { keywords: ['fitness', 'gym', 'workout', 'exercise', 'training'], icon: Dumbbell, colors: { bg: 'bg-orange-50', icon: 'text-orange-500', bar: 'bg-orange-500' } },
    { keywords: ['pet', 'pets', 'dog', 'cat', 'vet'], icon: PawPrint, colors: { bg: 'bg-amber-50', icon: 'text-amber-600', bar: 'bg-amber-500' } },
    { keywords: ['gift', 'gifts'], icon: Gift, colors: { bg: 'bg-pink-50', icon: 'text-pink-500', bar: 'bg-pink-500' } },
    { keywords: ['coffee', 'cafe'], icon: Coffee, colors: { bg: 'bg-stone-100', icon: 'text-stone-600', bar: 'bg-stone-500' } },
    { keywords: ['gaming', 'games', 'movie', 'movies'], icon: Gamepad2, colors: { bg: 'bg-violet-50', icon: 'text-violet-600', bar: 'bg-violet-500' } },
    { keywords: ['books', 'reading', 'library'], icon: BookOpen, colors: { bg: 'bg-cyan-50', icon: 'text-cyan-600', bar: 'bg-cyan-500' } },
    { keywords: ['work', 'office', 'career'], icon: Briefcase, colors: { bg: 'bg-slate-100', icon: 'text-slate-600', bar: 'bg-slate-500' } },
    { keywords: ['clothes', 'fashion', 'apparel'], icon: Shirt, colors: { bg: 'bg-rose-50', icon: 'text-rose-500', bar: 'bg-rose-500' } },
    { keywords: ['car', 'fuel', 'parking'], icon: Car, colors: { bg: 'bg-indigo-50', icon: 'text-indigo-600', bar: 'bg-indigo-500' } },
    { keywords: ['baby', 'kids', 'child'], icon: Baby, colors: { bg: 'bg-sky-50', icon: 'text-sky-500', bar: 'bg-sky-500' } },
  ];

  const exactIcon = CATEGORY_ICONS[category];
  const exactColors = CATEGORY_COLORS[category];
  if (exactIcon || exactColors) {
    return {
      Icon: exactIcon || MoreHorizontal,
      colors: exactColors || CATEGORY_COLORS.Other,
    };
  }

  const smartMatch = smartMatches.find(({ keywords }) => keywords.some((keyword) => normalized.includes(keyword)));
  if (smartMatch) {
    return { Icon: smartMatch.icon, colors: smartMatch.colors };
  }

  return {
    Icon: MoreHorizontal,
    colors: CATEGORY_COLORS.Other,
  };
}

function getStatusInfo(pct) {
  if (pct > 100) return { label: 'OVER BUDGET', color: 'bg-red-500 text-white', barOverride: 'bg-red-500' };
  if (pct >= 75) return { label: 'CLOSE TO LIMIT', color: 'bg-amber-100 text-amber-700', barOverride: 'bg-amber-500' };
  return { label: 'ON TRACK', color: 'bg-emerald-100 text-emerald-700', barOverride: null };
}

export default function Budgets() {
  const { trendMode } = useTrendMode();
  const [budgets, setBudgets] = useState([]);
  const [budgetMeta, setBudgetMeta] = useState({});
  const [currentData, setCurrentData] = useState(null);
  const [topInsight, setTopInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adjustDialog, setAdjustDialog] = useState({ open: false, category: '', limit: '' });
  const [addCategoryDialog, setAddCategoryDialog] = useState({ open: false, category: '', limit: '' });
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

  async function handleCreateCategory() {
    const category = addCategoryDialog.category.trim();
    const limit = parseFloat(addCategoryDialog.limit || '0');

    if (!category) {
      toast.error('Enter a category name');
      return;
    }

    if (Number.isNaN(limit) || limit < 0) {
      toast.error('Enter a valid budget amount');
      return;
    }

    const existsInGenerated = budgets.some(b => b.category.toLowerCase() === category.toLowerCase());
    if (existsInGenerated) {
      toast.error('That category already exists for this month');
      return;
    }

    try {
      await api.postCustomBudgetCategory({
        category,
        limit,
        month: selectedMonth,
        year: selectedYear,
      });
      await loadData(selectedMonth, selectedYear);
      setAddCategoryDialog({ open: false, category: '', limit: '' });
      toast.success(`${category} added to ${periodLabel}`);
    } catch (err) {
      console.error('Failed to create custom category:', err);
      toast.error(err?.response?.data?.detail || 'Failed to create category');
    }
  }

  // Computed totals from backend data
  const visibleBudgets = budgets;
  const monthlyLimit = visibleBudgets.reduce((s, b) => s + (b.limit || 0), 0);
  const monthlySpent = visibleBudgets.reduce((s, b) => s + (b.current || 0), 0);
  const visibleExpenses = (currentData?.data?.categories || []).flatMap(cat => cat.expenses || []);
  const referenceDate = visibleExpenses.length > 0
    ? new Date([...visibleExpenses].sort((a, b) => new Date(b.date) - new Date(a.date))[0].date)
    : new Date(selectedYear || new Date().getFullYear(), (selectedMonth || 1) - 1, 1);
  const weeklyExpenses = visibleExpenses.filter(exp => {
    const date = new Date(exp.date);
    return date >= startOfWeek(referenceDate) && date <= endOfWeek(referenceDate);
  });
  const weeklyLimit = monthlyLimit / getWeeksInMonth(referenceDate);
  const weeklySpent = weeklyExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const totalLimit = trendMode === 'weekly' ? weeklyLimit : monthlyLimit;
  const totalSpent = trendMode === 'weekly' ? weeklySpent : monthlySpent;
  const totalLeft = Math.max(0, totalLimit - totalSpent);
  const utilizationPct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
  const periodLabel = budgetMeta?.label || currentData?.metadata?.label || 'Current';
  const displayPeriodLabel = trendMode === 'weekly' ? formatWeeklyLabel(referenceDate) : periodLabel;

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
        <div className="container mx-auto px-6 sm:px-10 lg:px-14 py-4 flex items-center justify-between gap-5">
          <img src={logo} alt="FinFusion logo" className="h-10 object-contain" />
          <Navbar />
          <UserMenu />
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-10 max-w-6xl">
        {/* TITLE + MONTH PICKER + ADD CATEGORY */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight" data-testid="budget-title">My Budgets</h1>
            <p className="text-lg text-slate-600 mt-2 max-w-md">
              Showing data for <span className="font-semibold text-indigo-600" data-testid="period-label">{displayPeriodLabel}</span>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
            {/* Month picker */}
            <Select
              value={`${selectedYear}-${selectedMonth}`}
              onValueChange={(value) => {
                const [y, m] = value.split('-').map(Number);
                setSelectedYear(y);
                setSelectedMonth(m);
                setExpandedCards({});
              }}
            >
              <SelectTrigger
                data-testid="month-picker"
                className="w-full sm:min-w-[220px] h-12 rounded-2xl border-0 bg-white/90 shadow-[0_14px_35px_rgba(99,102,241,0.14)] text-slate-700 font-semibold px-4 text-base"
              >
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-0 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                {availableMonths.map((m) => (
                  <SelectItem key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`} className="rounded-xl">
                    {m.label} ({m.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setAddCategoryDialog({ open: true, category: '', limit: '' })} data-testid="add-category-btn" className="w-full sm:w-auto bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-2xl px-6 py-3 h-12 text-base font-semibold shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300 transition-all">
              <Plus className="w-4 h-4 mr-2" /> Add Category
            </Button>
          </div>
        </div>

        {/* OVERVIEW CARD */}
        <Card className="relative overflow-hidden rounded-[28px] border-0 bg-gradient-to-br from-[#e5dcff] via-[#efe6ff] to-[#e7dcff] p-5 sm:p-8 mb-10 shadow-[0_28px_80px_rgba(109,40,217,0.16)]" data-testid="budget-overview-card">
          <div className="pointer-events-none absolute -top-16 left-12 h-40 w-40 rounded-full bg-violet-500/18 blur-3xl" />
          <div className="pointer-events-none absolute top-8 right-24 h-48 w-48 rounded-full bg-fuchsia-400/16 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-indigo-500/18 blur-3xl" />
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr,1fr] gap-8">
            {/* Left: Overview stats */}
            <div className="relative">
              <p className="text-sm uppercase tracking-[0.2em] font-bold text-violet-500 mb-3">{trendMode === 'weekly' ? 'Current Week Overview' : 'Current Month Overview'}</p>
              <div className="mb-4">
                <p className="text-[2.75rem] md:text-5xl font-bold text-slate-900 tracking-tight" data-testid="total-budget-spent">
                  {formatCurrency(totalSpent)}
                </p>
              </div>

              {/* Usage bar */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-400">Usage</span>
                <span className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">{utilizationPct.toFixed(0)}% utilized</span>
              </div>
              <div className="w-full h-3 rounded-full bg-white/70 overflow-hidden mb-4 shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-700 shadow-[0_0_22px_rgba(168,85,247,0.28)] ${
                    utilizationPct > 90
                      ? 'bg-gradient-to-r from-[#7c3aed] via-[#a855f7] to-[#ec4899]'
                      : utilizationPct > 70
                      ? 'bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899]'
                      : 'bg-gradient-to-r from-[#5b5fff] via-[#8b5cf6] to-[#d946ef]'
                  }`}
                  style={{ width: `${Math.min(utilizationPct, 100)}%` }}
                  data-testid="usage-bar"
                />
              </div>

              {/* Spent / Left */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 text-base">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 inline-block" />
                  <span className="text-slate-700 font-medium" data-testid="total-spent">{formatCurrency(totalSpent)} spent</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" />
                  <span className="text-slate-600" data-testid="total-left">{formatCurrency(totalLeft)} left</span>
                </div>
              </div>
            </div>

            {/* Right: Weekly Insight */}
            {topInsight && (
              <div className="flex items-start relative" data-testid="weekly-insight-card">
                <div className="bg-gradient-to-br from-white/45 via-violet-200/45 to-fuchsia-200/30 backdrop-blur-sm rounded-[24px] p-5 sm:p-6 w-full border border-white/35 shadow-[0_18px_45px_rgba(139,92,246,0.12)]">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-violet-500" />
                    <span className="text-sm font-bold text-slate-800">Data Insight</span>
                  </div>
                  <p className="text-base text-slate-700 leading-relaxed">{topInsight.message}</p>
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
          {visibleBudgets.map((budget, idx) => {
            const pct = budget.percentage || 0;
            const status = getStatusInfo(pct);
            const { Icon, colors: catColors } = getCategoryVisual(budget.category);
            const isOver = pct > 100;
            const overAmount = Math.max(0, (budget.current || 0) - (budget.limit || 0));
            const barColor = status.barOverride || catColors.bar;

            return (
              <Card
                key={budget.category + idx}
                className="rounded-[24px] border-0 bg-white shadow-sm hover:shadow-md transition-shadow p-5 sm:p-6 flex flex-col"
                data-testid={`budget-card-${budget.category}`}
              >
                {/* Icon */}
                <div className={`h-12 w-12 rounded-2xl ${catColors.bg} flex items-center justify-center mb-5`}>
                  <Icon className={`w-5 h-5 ${catColors.icon}`} />
                </div>

                {/* Category name + budget */}
                <h3 className="text-xl font-bold text-slate-900 mb-1">{budget.category}</h3>
                <p className="text-base text-slate-600 mb-1">{formatCurrency(budget.limit)} Budget</p>
                {budget.isCustom && (
                  <span className="mb-3 inline-flex w-fit rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-violet-600">
                    Custom
                  </span>
                )}

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

          {visibleBudgets.length === 0 && (
            <div className="col-span-full text-center py-16">
              <p className="text-slate-400 mb-2">No budget data available</p>
              <p className="text-sm text-slate-500">Add expenses from the Dashboard to auto-generate budgets</p>
            </div>
          )}
        </div>

        {/* FOOTER INFO */}
        {visibleBudgets.length > 0 && (
          <div className="mt-10 p-5 bg-indigo-50/50 rounded-2xl text-center">
            <p className="text-xs text-slate-500">
              {budgetMeta.method_label || 'Budget = historical monthly mean + 1 std deviation'}.
              Based on {budgets[0]?.months_of_data || 0}+ months of data, plus any custom categories you add for this month.
            </p>
          </div>
        )}
      </main>

      <Dialog open={addCategoryDialog.open} onOpenChange={open => setAddCategoryDialog(d => ({ ...d, open }))}>
        <DialogContent className="rounded-[24px]" data-testid="add-category-dialog">
          <DialogHeader>
            <DialogTitle>Add Budget Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="new-category-name">Category Name</Label>
              <Input
                id="new-category-name"
                value={addCategoryDialog.category}
                onChange={e => setAddCategoryDialog(d => ({ ...d, category: e.target.value }))}
                placeholder="e.g. Fitness, Pets, Gifts"
                data-testid="new-category-name-input"
              />
            </div>
            <div>
              <Label htmlFor="new-category-limit">Budget Limit</Label>
              <Input
                id="new-category-limit"
                type="number"
                min="0"
                step="0.01"
                value={addCategoryDialog.limit}
                onChange={e => setAddCategoryDialog(d => ({ ...d, limit: e.target.value }))}
                placeholder="0.00"
                data-testid="new-category-limit-input"
              />
            </div>
            <p className="text-xs text-slate-400">
              This creates a custom category card for {periodLabel}. It will appear with the other budget categories below.
            </p>
            <Button
              className="w-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-xl"
              onClick={handleCreateCategory}
              data-testid="create-category-btn"
            >
              Create Category
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
        <button onClick={() => setAddCategoryDialog({ open: true, category: '', limit: '' })} className="h-14 w-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-xl shadow-indigo-300/50 flex items-center justify-center hover:scale-105 transition-transform">
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

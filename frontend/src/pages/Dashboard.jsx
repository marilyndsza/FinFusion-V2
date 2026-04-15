import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import {
  Lightbulb, Plus, Upload, Users, Target, Receipt,
  TrendingUp, TrendingDown, Minus, Scan, Mic, MicOff
} from 'lucide-react';
import { formatCurrency } from '@/utils/formatCurrency';
import * as api from '@/lib/api';
import Navbar from '@/components/Navbar';
import UserMenu from '@/components/UserMenu';
import ReceiptScanModal from '@/components/ReceiptScanModal';
import logo from '@/assets/logo.png';
import { useTrendMode } from '@/context/TrendModeContext';
import { getTrendSnapshot, getWeeksInMonth } from '@/lib/trendUtils';
import { parseVoiceExpense } from '@/utils/parseVoiceExpense';

const COLORS = ["#FF0066", "#FF6C0C", "#934790", "#8CA9FF", "#3B82F6", "#10B981", "#F59E0B", "#EC4899", "#14B8A6"];

const BASE_CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Entertainment',
  'Utilities', 'Healthcare', 'Rent', 'Education', 'Travel', 'Fitness', 'Pets', 'Other', 'Miscellaneous'
];

const voiceExamples = [
  'Spent ₹200 on shopping',
  'Paid ₹1500 for Groceries',
  'Gas station for ₹2500',
  'Dinner at restaurant for ₹800',
  'Add ₹100 to my Travel budget',
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { trendMode } = useTrendMode();
  const [expenses, setExpenses] = useState([]);
  const [insights, setInsights] = useState([]);
  const [analytics, setAnalytics] = useState({ data: { total_monthly: 0, by_category: [], comparison: null }, metadata: {} });
  const [budgets, setBudgets] = useState([]);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showReceiptScan, setShowReceiptScan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showVoiceExamples, setShowVoiceExamples] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState(null);
  const recognitionRef = useRef(null);
  const categoryOptionsRef = useRef(BASE_CATEGORIES);
  const voiceCommandRef = useRef(null);
  const [newExpense, setNewExpense] = useState({
    amount: '', category: 'Food', description: '',
    date: new Date().toISOString().split('T')[0]
  });

  const categoryOptions = useMemo(() => {
    const discoveredCategories = [
      ...expenses.map(expense => expense.category),
      ...budgets.map(budget => budget.category),
      ...(analytics?.data?.by_category || []).map(item => item.category),
      voiceDraft?.category,
    ].filter(Boolean);

    const seen = new Set();
    return [...BASE_CATEGORIES, ...discoveredCategories]
      .map(category => String(category).trim())
      .filter(category => {
        const key = category.toLowerCase();
        if (!category || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [expenses, budgets, analytics, voiceDraft?.category]);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    categoryOptionsRef.current = categoryOptions;
  }, [categoryOptions]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      setShowVoiceExamples(false);
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      setShowVoiceExamples(false);

      toast.error("Oops, couldn't quite catch that. Try speaking closer or check mic permissions.");
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0]?.transcript || '')
        .join(' ')
        .trim();

      if (!transcript) {
        toast.error("Oops, couldn't quite catch that. Try speaking closer or check mic permissions.");
        return;
      }

      const parsedExpense = parseVoiceExpense(transcript, categoryOptionsRef.current);

      if (!parsedExpense.amount) {
        toast.error("Oops, couldn't quite catch that. Try speaking closer or check mic permissions.");
        return;
      }

      setVoiceDraft({
        amount: parsedExpense.amount,
        category: parsedExpense.category,
        description: parsedExpense.description || parsedExpense.transcript,
        date: new Date().toISOString().split('T')[0],
      });
    };

    recognitionRef.current = recognition;
    setSpeechSupported(true);

    return () => {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!showAddExpense && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [showAddExpense]);

  useEffect(() => {
    if (!showVoiceExamples && !voiceDraft) return undefined;

    function handleVoiceClickAway(event) {
      if (voiceCommandRef.current?.contains(event.target)) return;
      resetVoiceDraft();
    }

    document.addEventListener('mousedown', handleVoiceClickAway);
    document.addEventListener('touchstart', handleVoiceClickAway);

    return () => {
      document.removeEventListener('mousedown', handleVoiceClickAway);
      document.removeEventListener('touchstart', handleVoiceClickAway);
    };
  }, [showVoiceExamples, voiceDraft]);

  async function loadData() {
    console.log('[LOAD DATA] Fetching expenses...');
    try {
      const [exp, insightsRes, an, budg] = await Promise.all([
        api.getExpenses(),
        api.getSuggestions(),
        api.getAnalyticsSpending(),
        api.getBudgets()
      ]);
      
      console.log('[LOAD DATA] Raw expenses received:', exp?.length || 0);
      
      // Sort expenses by date (newest first)
      const sortedExpenses = Array.isArray(exp) ? exp.sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
      }) : [];
      
      console.log('[LOAD DATA] Sorted expenses:', sortedExpenses.length);
      console.log('[LOAD DATA] Latest 3 expenses:', sortedExpenses.slice(0, 3).map(e => ({
        id: e.id,
        description: e.description,
        amount: e.amount,
        date: e.date
      })));
      
      setExpenses(sortedExpenses);
      setInsights(insightsRes?.data || []);
      setAnalytics(an || { data: { total_monthly: 0, by_category: [], comparison: null }, metadata: {} });
      setBudgets(budg?.data?.budget || []);
    } catch (err) {
      console.error('[LOAD DATA] Error:', err);
      toast.error('Failed to load data');
    }
  }

  async function handleAddExpense(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const newExp = await api.postExpense({
        amount: parseFloat(newExpense.amount),
        category: newExpense.category,
        description: newExpense.description,
        date: newExpense.date
      });
      console.log('[ADD EXPENSE] New expense created:', newExp);
      toast.success('Expense added');
      setShowAddExpense(false);
      setNewExpense({ amount: '', category: 'Food', description: '', date: new Date().toISOString().split('T')[0] });
      
      // Reload all data to get updated expenses list
      console.log('[ADD EXPENSE] Reloading data...');
      await loadData();
      console.log('[ADD EXPENSE] Data reloaded, expenses count:', expenses.length);
    } catch (err) {
      console.error('[ADD EXPENSE] Error:', err);
      toast.error('Failed to add expense');
    } finally { setLoading(false); }
  }

  async function deleteExpense(id) {
    console.log('[DELETE EXPENSE] Attempting to delete expense:', id);
    try {
      // Optimistic: remove from UI immediately
      setExpenses(prev => prev.filter(e => e.id !== id));
      await api.deleteExpense(id);
      console.log('[DELETE EXPENSE] Successfully deleted');
      toast.success('Expense deleted');
      // Re-fetch all data to sync totals and budgets
      loadData();
    } catch (err) {
      console.error('[DELETE EXPENSE] Error:', err);
      console.error('[DELETE EXPENSE] Error details:', err.response?.data);
      const errorMsg = err.response?.data?.detail || 'Failed to delete expense';
      toast.error(errorMsg);
      // Revert on failure
      loadData();
    }
  }

  function handleReceiptScan() {
    setShowReceiptScan(true);
  }

  function toggleSpeechRecognition() {
    if (!speechSupported || !recognitionRef.current) {
      toast.error("Oops, couldn't quite catch that. Try speaking closer or check mic permissions.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      return;
    }

    setVoiceDraft(null);
    setShowVoiceExamples(true);
    recognitionRef.current.start();
  }

  function resetVoiceDraft() {
    setVoiceDraft(null);
    setShowVoiceExamples(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }

  async function handleVoiceExpenseSave() {
    if (!voiceDraft?.amount) {
      toast.error('Amount is required before saving.');
      return;
    }

    setLoading(true);
    try {
      await api.postExpense({
        amount: parseFloat(voiceDraft.amount),
        category: voiceDraft.category || 'Miscellaneous',
        description: voiceDraft.description,
        date: voiceDraft.date,
      });

      toast.success('Voice expense added');
      resetVoiceDraft();
      await loadData();
    } catch (err) {
      console.error('[VOICE EXPENSE] Error:', err);
      toast.error('Failed to save voice expense');
    } finally {
      setLoading(false);
    }
  }

  // Derived values — all from backend
  const spendingData = analytics?.data || {};
  const snapshot = getTrendSnapshot(expenses, trendMode);
  const monthlyTotalSpent = spendingData.total_monthly || 0;
  const totalSpent = trendMode === 'weekly' ? snapshot.total : monthlyTotalSpent;
  const byCategory = trendMode === 'weekly' ? snapshot.byCategory : (spendingData.by_category || []);
  const comparison = trendMode === 'weekly'
    ? {
        direction: snapshot.direction,
        delta_pct: Math.round(snapshot.deltaPct * 10) / 10,
        previous_total: snapshot.previousTotal,
      }
    : spendingData.comparison;
  const periodLabel = trendMode === 'weekly'
    ? snapshot.label
    : (analytics?.metadata?.label || analytics?.metadata?.current_period || 'Current');
  const totalBudget = budgets.reduce((s, b) => s + (b.limit || 0), 0);
  const displayBudget = trendMode === 'weekly'
    ? totalBudget / getWeeksInMonth(snapshot.referenceDate)
    : totalBudget;
  const budgetRemaining = Math.max(0, displayBudget - totalSpent);
  const budgetUsedPct = displayBudget > 0 ? (totalSpent / displayBudget * 100) : 0;
  const savingsBudget = (budgets.find(b => b.category?.toLowerCase() === 'savings')?.limit || 0) / (trendMode === 'weekly' ? getWeeksInMonth(snapshot.referenceDate) : 1);
  const savingsSpent = byCategory.find(item => item.category?.toLowerCase() === 'savings')?.amount || 0;
  const estimatedSavings = savingsSpent > 0 ? savingsSpent : savingsBudget > 0 ? savingsBudget : budgetRemaining;
  const savingsLabel = savingsSpent > 0
    ? `${periodLabel} saved so far`
    : savingsBudget > 0
    ? `Savings goal for ${periodLabel}`
    : 'Estimated from current budget';
  const summaryCardTone = 'bg-white ring-1 ring-slate-200/80 shadow-[0_18px_45px_rgba(15,23,42,0.08)]';
  const budgetStatusClass = 'text-emerald-600';
  const spendingStatusClass = totalSpent >= displayBudget && displayBudget > 0 ? 'text-orange-500' : 'text-amber-500';
  const budgetUsedStatusClass = budgetUsedPct > 90 ? 'text-orange-500' : budgetUsedPct > 70 ? 'text-amber-500' : 'text-emerald-600';
  const savingsStatusClass = estimatedSavings <= 0 ? 'text-orange-500' : estimatedSavings < totalSpent * 0.25 ? 'text-amber-500' : 'text-emerald-600';

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

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* GREETING */}
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500 font-semibold">Overview</p>
          <h1 className="text-4xl md:text-5xl font-bold mt-2 text-slate-900 leading-tight" data-testid="dashboard-title">
            Financial overview for {periodLabel}
          </h1>
        </div>

        {/* HERO + DONUT */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr,1.2fr] gap-8">
          <div className="space-y-6">
            {/* HERO CARD */}
            <Card className="relative overflow-hidden rounded-[24px] border-0 shadow-[0_24px_60px_rgba(15,23,42,0.15)] bg-gradient-to-tr from-[#5b5fff] via-[#8b5cf6] to-[#ff6bb5] text-white p-6 md:p-7 min-h-[220px] md:h-[200px]">
              <div className="absolute -right-16 -top-10 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
              <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-white/10 blur-xl" />
              <div className="relative flex items-center h-full">
                <div className="w-full max-w-3xl flex flex-col justify-center text-left">
                  <p className="text-base md:text-lg uppercase tracking-[0.2em] font-semibold text-white/85">My Balance</p>
                  <p className="text-[2.8rem] md:text-[4.25rem] font-bold mt-3 tracking-tight leading-none" data-testid="total-spending-amount">
                    {formatCurrency(budgetRemaining)}
                  </p>
                  <p className="text-lg md:text-xl mt-4 text-white/90 flex items-center gap-2 leading-relaxed" data-testid="spending-comparison">
                    {budgetRemaining > 0 ? (
                      <TrendingDown className="w-4 h-4" />
                    ) : (
                      <Minus className="w-4 h-4" />
                    )}
                    <span>
                      {`${formatCurrency(totalSpent)} spent out of ${formatCurrency(displayBudget)} budget`}
                    </span>
                  </p>
                </div>
              </div>
            </Card>

            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <Card className={`relative overflow-hidden rounded-[24px] border-0 px-6 py-6 min-h-[170px] flex flex-col justify-between transition-transform duration-200 hover:-translate-y-1 ${summaryCardTone}`}>
                <div className="absolute right-4 top-4 h-16 w-16 rounded-full bg-fuchsia-100/60 blur-2xl pointer-events-none" />
                <div className="relative">
                  <p className="text-sm text-slate-900 font-semibold uppercase">My Budget</p>
                  <p className="text-3xl font-semibold mt-2 tracking-tight bg-gradient-to-r from-[#5b5fff] via-[#8b5cf6] to-[#ff6bb5] bg-clip-text text-transparent">{formatCurrency(displayBudget)}</p>
                </div>
                <p className={`relative text-sm mt-2 font-medium ${budgetStatusClass}`}>{periodLabel}</p>
              </Card>
              <Card className={`relative overflow-hidden rounded-[24px] border-0 px-6 py-6 min-h-[170px] flex flex-col justify-between transition-transform duration-200 hover:-translate-y-1 ${summaryCardTone}`}>
                <div className="absolute right-4 top-4 h-16 w-16 rounded-full bg-fuchsia-100/60 blur-2xl pointer-events-none" />
                <div className="relative">
                  <p className="text-sm text-slate-900 font-semibold uppercase">Total Spending</p>
                  <p className="text-3xl font-semibold mt-2 tracking-tight bg-gradient-to-r from-[#5b5fff] via-[#8b5cf6] to-[#ff6bb5] bg-clip-text text-transparent">{formatCurrency(totalSpent)}</p>
                </div>
                {comparison ? (
                  <p className={`relative text-sm mt-2 leading-relaxed font-medium ${spendingStatusClass}`}>
                    {comparison.direction === 'decreased'
                      ? `${Math.abs(comparison.delta_pct)}% less than previous period`
                      : comparison.direction === 'increased'
                      ? `${Math.abs(comparison.delta_pct)}% more than previous period`
                      : `Same as previous period (${formatCurrency(comparison.previous_total)})`}
                  </p>
                ) : (
                  <p className={`relative text-sm mt-2 font-medium ${spendingStatusClass}`}>No previous period data for comparison</p>
                )}
              </Card>
              <Card className={`relative overflow-hidden rounded-[24px] border-0 px-6 py-6 min-h-[170px] flex flex-col justify-between transition-transform duration-200 hover:-translate-y-1 ${summaryCardTone}`}>
                <div className="absolute right-4 top-4 h-16 w-16 rounded-full bg-fuchsia-100/60 blur-2xl pointer-events-none" />
                <div className="relative">
                  <p className="text-sm text-slate-900 font-semibold uppercase">Budget Used</p>
                  <p className="text-3xl font-semibold mt-2 tracking-tight bg-gradient-to-r from-[#5b5fff] via-[#8b5cf6] to-[#ff6bb5] bg-clip-text text-transparent">{budgetUsedPct.toFixed(0)}%</p>
                </div>
                <p className={`relative text-sm mt-2 font-medium ${budgetUsedStatusClass}`}>
                  {budgetUsedPct > 90 ? 'High usage' : 'On track'}
                </p>
              </Card>
              <Card className={`relative overflow-hidden rounded-[24px] border-0 px-6 py-6 min-h-[170px] flex flex-col justify-between transition-transform duration-200 hover:-translate-y-1 ${summaryCardTone}`}>
                <div className="absolute right-4 top-4 h-16 w-16 rounded-full bg-fuchsia-100/60 blur-2xl pointer-events-none" />
                <div className="relative">
                  <p className="text-sm text-slate-900 font-semibold uppercase">My Savings</p>
                  <p className="text-3xl font-semibold mt-2 tracking-tight bg-gradient-to-r from-[#5b5fff] via-[#8b5cf6] to-[#ff6bb5] bg-clip-text text-transparent">{formatCurrency(estimatedSavings)}</p>
                </div>
                <p className={`relative text-sm mt-2 font-medium ${savingsStatusClass}`}>{savingsLabel}</p>
              </Card>
            </div>
          </div>

          {/* DONUT */}
          <Card className="rounded-[24px] border-0 shadow-sm bg-white p-6 flex flex-col" data-testid="spending-chart-card">
            <p className="text-base font-semibold text-slate-900 mb-1">Spending by Category</p>
            <p className="text-sm text-slate-500 mb-2">Breakdown for {periodLabel}</p>
            {byCategory.length > 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-0">
                <div className="relative flex items-center justify-center w-full">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={byCategory} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                        startAngle={90} endAngle={-270} paddingAngle={2} cornerRadius={8} dataKey="amount">
                        {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute text-center pointer-events-none">
                    <p className="text-[10px] text-slate-400 leading-none">Total</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5 leading-tight">{formatCurrency(totalSpent)}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs text-slate-500 w-full">
                  {byCategory.map((item, i) => (
                    <div key={item.category + i} className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="truncate">{item.category}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">No data yet</div>
            )}
          </Card>
        </div>

        {/* BOTTOM: EXPENSES + INSIGHTS | BUDGETS */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr,1.1fr] gap-8 mt-10 items-start">
          <div className="space-y-8">
            {/* RECENT EXPENSES */}
            <Card className="rounded-[24px] border-0 shadow-sm bg-white p-5 sm:p-6" data-testid="recent-expenses-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-base font-semibold text-slate-900">Recent Expenses</p>
                  <p className="text-sm text-slate-500">Latest transactions</p>
                </div>
                <Button size="icon" variant="outline" className="rounded-full border-dashed" onClick={() => setShowAddExpense(true)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
                {expenses.slice(0, 10).map(expense => (
                  <div key={expense.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-3 py-3 rounded-[16px] hover:bg-slate-50 transition-colors gap-3" data-testid={`expense-item-${expense.id}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs">{expense.category?.[0] || '$'}</div>
                      <div>
                        <p className="text-base font-semibold text-slate-900 truncate" data-testid={`expense-description-${expense.id}`}>{expense.description}</p>
                        <p className="text-sm text-slate-500 mt-0.5">{expense.date} &middot; {expense.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:justify-end">
                      <p className="text-base font-semibold text-slate-900" data-testid={`expense-amount-${expense.id}`}>{formatCurrency(expense.amount || 0)}</p>
                      {expense.is_deletable !== false && (
                        <Button size="sm" variant="ghost" onClick={() => deleteExpense(expense.id)} className="text-rose-500 hover:text-rose-600 hover:bg-rose-50" data-testid={`delete-expense-${expense.id}`}>Delete</Button>
                      )}
                    </div>
                  </div>
                ))}
                {expenses.length === 0 && (
                  <div className="text-center py-10 text-slate-300 text-sm">No expenses yet</div>
                )}
              </div>
              <div className="mt-3 flex justify-end">
                <div ref={voiceCommandRef} className="relative flex flex-wrap items-end justify-end gap-3">
                  {(showVoiceExamples || voiceDraft) && (
                    <div className="absolute bottom-full right-0 z-[80] mb-3 w-[min(28rem,calc(100vw-4rem))]">
                      {showVoiceExamples && !voiceDraft && (
                        <div className="overflow-hidden rounded-[24px] border-[1.5px] border-[rgba(168,85,247,0.4)] bg-[rgba(139,92,246,0.15)] p-4 shadow-[0_0_30px_rgba(126,34,206,0.25)] backdrop-blur-[20px] backdrop-saturate-[180%]">
                          <div className="relative">
                            <p className="bg-gradient-to-r from-[#4C1D95] to-[#7C3AED] bg-clip-text text-sm font-semibold text-transparent [-webkit-text-fill-color:transparent]">Talk it. Track it. FinFusion logs it.</p>
                            <p className="mt-1 text-xs text-[#1E1B4B]">FinFusion AI listens. Just say things like:</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {voiceExamples.map(example => (
                                <span
                                  key={example}
                                  className="rounded-full border border-[#A855F7] bg-[#F3E8FF] px-3 py-1.5 text-xs font-medium text-[#1E1B4B] shadow-[0_8px_18px_rgba(168,85,247,0.10)] transition duration-200 hover:-translate-y-0.5 hover:border-[#7E22CE] hover:shadow-[0_0_12px_rgba(168,85,247,0.6)]"
                                >
                                  {example}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {voiceDraft && (
                        <div className="rounded-[24px] border-[1.5px] border-[rgba(168,85,247,0.4)] bg-[rgba(139,92,246,0.15)] p-5 shadow-[0_0_30px_rgba(126,34,206,0.25)] backdrop-blur-[20px] backdrop-saturate-[180%]">
                          <div className="flex justify-center">
                            <p className="bg-gradient-to-r from-[#4C1D95] to-[#7C3AED] bg-clip-text text-sm font-semibold text-transparent text-center [-webkit-text-fill-color:transparent]">Transcription successful. Review the details below.</p>
                          </div>
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                            <div className="space-y-1.5">
                              <Label htmlFor="voice-amount" className="text-[#1E1B4B]">Amount</Label>
                              <Input
                                id="voice-amount"
                                type="number"
                                step="0.01"
                                value={voiceDraft.amount}
                                onChange={e => setVoiceDraft(prev => ({ ...prev, amount: e.target.value }))}
                                className="border-[#D8B4FE] bg-white/80 text-[#1E1B4B] focus-visible:ring-0 focus-visible:border-[#A855F7] focus-visible:shadow-[0_0_10px_rgba(168,85,247,0.5)] [&:not(:placeholder-shown)]:border-[#A855F7] [&:not(:placeholder-shown)]:shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="voice-category" className="text-[#1E1B4B]">Category</Label>
                              <Select
                                value={voiceDraft.category}
                                onValueChange={value => setVoiceDraft(prev => ({ ...prev, category: value }))}
                              >
                                <SelectTrigger id="voice-category" className="border-[#D8B4FE] bg-white/80 text-[#1E1B4B] focus:ring-0 focus:border-[#A855F7] focus:shadow-[0_0_10px_rgba(168,85,247,0.5)] data-[state=open]:border-[#A855F7] data-[state=open]:shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent side="top" sideOffset={8} position="popper" className="z-[120] max-h-72 border-violet-200 bg-white">
                                  {categoryOptions.map(cat => (
                                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="mt-5 flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={resetVoiceDraft}>Cancel</Button>
                            <Button
                              type="button"
                              onClick={handleVoiceExpenseSave}
                              disabled={loading}
                              className="border-0 text-white bg-gradient-to-r from-[#5b5fff] via-[#8b5cf6] to-[#ff6bb5] hover:from-[#5155f5] hover:via-[#7c54ef] hover:to-[#f45ca8]"
                            >
                              {loading ? 'Saving...' : 'Confirm & Save'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <Button className="rounded-full h-12 sm:h-13 px-5 sm:px-6 text-sm sm:text-base font-semibold flex items-center gap-2 border-0 text-white shadow-[0_16px_35px_rgba(99,102,241,0.28)] bg-gradient-to-r from-[#5b5fff] via-[#8b5cf6] to-[#ff6bb5] hover:from-[#5155f5] hover:via-[#7c54ef] hover:to-[#f45ca8]"
                    onClick={handleReceiptScan} data-testid="scan-receipt-btn">
                    <Scan className="w-4 h-4" /> Scan Receipt
                  </Button>
                  <div className="group relative">
                    <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-[#5b5fff] via-[#8b5cf6] to-[#ff6bb5] opacity-0 blur-md transition duration-200 group-hover:opacity-40 group-hover:animate-pulse" />
                    <Button
                      type="button"
                      size="icon"
                      onClick={toggleSpeechRecognition}
                      disabled={!speechSupported}
                      className={`relative rounded-full h-12 w-12 cursor-pointer border-0 text-white shadow-[0_16px_35px_rgba(99,102,241,0.28)] bg-gradient-to-r from-[#5b5fff] via-[#8b5cf6] to-[#ff6bb5] hover:from-[#5155f5] hover:via-[#7c54ef] hover:to-[#f45ca8] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${isListening ? 'animate-pulse shadow-[0_0_0_6px_rgba(139,92,246,0.14),0_22px_50px_rgba(99,102,241,0.34)] scale-105' : 'hover:scale-105 hover:shadow-[0_0_0_6px_rgba(139,92,246,0.12),0_20px_45px_rgba(99,102,241,0.3)]'}`}
                      aria-label={isListening ? 'Stop voice command' : 'Start voice command'}
                      data-testid="voice-command-btn"
                    >
                      {isListening ? (
                        <span className="flex items-center gap-1" aria-hidden="true">
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-[voiceDot_0.9s_ease-in-out_infinite]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-[voiceDot_0.9s_ease-in-out_0.15s_infinite]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-[voiceDot_0.9s_ease-in-out_0.3s_infinite]" />
                        </span>
                      ) : (
                        <Mic className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-6" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* INSIGHTS — rendered entirely from backend */}
            <Card className="rounded-[24px] border-0 shadow-sm bg-white p-5 sm:p-6" data-testid="suggestions-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-500"><Lightbulb className="w-4 h-4" /></div>
                <div>
                  <p className="text-base font-semibold text-slate-900">Data-Driven Insights</p>
                  <p className="text-sm text-slate-500">Computed from your transactions</p>
                </div>
              </div>
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {insights.length > 0 ? insights.map((insight, idx) => (
                  <div key={idx} className="flex gap-3 p-3 rounded-[18px] bg-slate-50" data-testid={`insight-${idx}`}>
                    <div className="mt-1">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs ${
                        insight.type === 'spending_spike' ? 'bg-red-100 text-red-500'
                        : insight.type === 'month_comparison' ? 'bg-blue-100 text-blue-500'
                        : insight.type === 'forecast' ? 'bg-purple-100 text-purple-500'
                        : insight.type === 'trend' ? 'bg-amber-100 text-amber-500'
                        : 'bg-cyan-100 text-cyan-500'
                      }`}>
                        {insight.type === 'spending_spike' ? <TrendingUp className="w-3 h-3" />
                         : insight.type === 'trend' ? <TrendingUp className="w-3 h-3" />
                         : <Target className="w-3 h-3" />}
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-700 leading-relaxed">{insight.message}</p>
                      {insight.confidence != null && (
                        <p className="text-[10px] text-slate-400 mt-1">Confidence: {(insight.confidence * 100).toFixed(0)}%</p>
                      )}
                    </div>
                  </div>
                )) : (
                  <p className="text-xs text-slate-400">No insights available — add more transactions.</p>
                )}
              </div>
              <div className="mt-6 flex flex-col gap-2 text-xs">
                <button onClick={() => navigate('/groups')} className="inline-flex items-center gap-2 text-indigo-500 hover:text-indigo-600"><Users className="w-3 h-3" /> Group expenses</button>
                <button onClick={() => navigate('/budgets')} className="inline-flex items-center gap-2 text-indigo-500 hover:text-indigo-600"><Receipt className="w-3 h-3" /> Budget management</button>
              </div>
            </Card>
          </div>

          {/* BUDGETS */}
          <Card className="rounded-[24px] border-0 shadow-sm bg-white p-6" data-testid="budgets-card">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500"><Target className="w-4 h-4" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Budget Tracking</p>
                <p className="text-xs text-slate-400">{periodLabel}</p>
              </div>
            </div>
            <div className="space-y-4">
              {budgets.length > 0 ? budgets.map((budget, idx) => {
                const pct = budget.percentage || 0;
                const over = pct > 100;
                const warn = pct >= 70 && pct <= 100;
                const barColor = over ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-emerald-500';
                const textColor = over ? 'text-red-600' : warn ? 'text-amber-600' : 'text-emerald-600';
                const bgColor = over ? 'bg-red-50' : warn ? 'bg-amber-50' : 'bg-emerald-50';
                return (
                  <div key={idx} className={`p-3 rounded-[16px] ${bgColor}`} data-testid={`budget-${budget.category}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-700">{budget.category}</span>
                      <span className={`text-xs font-bold ${textColor}`}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div className={`h-full ${barColor} transition-all duration-300 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                      <span>{formatCurrency(budget.current || 0)}</span>
                      <span>of {formatCurrency(budget.limit || 0)}</span>
                    </div>
                  </div>
                );
              }) : (
                <div className="text-center py-6"><p className="text-xs text-slate-400">No budget data</p></div>
              )}
            </div>
            {budgets.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <button onClick={() => navigate('/budgets')} className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold">Manage budgets &rarr;</button>
              </div>
            )}
          </Card>

        </div>
      </main>

      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogTrigger asChild>
          <button
            className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-indigo-600 text-white shadow-[0_16px_40px_rgba(79,70,229,0.35)] flex items-center justify-center hover:bg-indigo-500 transition-colors"
            data-testid="add-expense-btn"
            aria-label="Add expense"
          >
            <Plus className="w-6 h-6" />
          </button>
        </DialogTrigger>
        <DialogContent data-testid="add-expense-dialog">
          <DialogHeader><DialogTitle>Add New Expense</DialogTitle></DialogHeader>
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" type="number" step="0.01" value={newExpense.amount}
                onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })}
                required data-testid="expense-amount-input" />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={newExpense.category} onValueChange={val => setNewExpense({ ...newExpense, category: val })}>
                <SelectTrigger data-testid="expense-category-select"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(cat => (
                    <SelectItem key={cat} value={cat} data-testid={`category-option-${cat}`}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={newExpense.description}
                onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
                required data-testid="expense-description-input" />
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={newExpense.date}
                onChange={e => setNewExpense({ ...newExpense, date: e.target.value })}
                required data-testid="expense-date-input" />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="submit-expense-btn">
              {loading ? 'Adding...' : 'Add Expense'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Receipt Scan Modal */}
      <ReceiptScanModal 
        open={showReceiptScan}
        onClose={() => setShowReceiptScan(false)}
        onExpenseCreated={loadData}
      />

      <style>{`
        @keyframes voiceDot {
          0%, 80%, 100% {
            transform: translateY(0) scale(0.9);
            opacity: 0.55;
          }
          40% {
            transform: translateY(-3px) scale(1.15);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

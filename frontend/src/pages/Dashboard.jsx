import React, { useState, useEffect } from 'react';
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
  TrendingUp, TrendingDown, Minus, Scan
} from 'lucide-react';
import { formatCurrency } from '@/utils/formatCurrency';
import * as api from '@/lib/api';
import Navbar from '@/components/Navbar';
import UserMenu from '@/components/UserMenu';
import ReceiptScanModal from '@/components/ReceiptScanModal';
import logo from '@/assets/logo.png';

const COLORS = ["#FF0066", "#FF6C0C", "#934790", "#8CA9FF", "#3B82F6", "#10B981", "#F59E0B", "#EC4899", "#14B8A6"];

const categories = [
  'Food', 'Transport', 'Shopping', 'Entertainment',
  'Utilities', 'Healthcare', 'Rent', 'Education', 'Travel', 'Other'
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState([]);
  const [insights, setInsights] = useState([]);
  const [analytics, setAnalytics] = useState({ data: { total_monthly: 0, by_category: [], comparison: null }, metadata: {} });
  const [budgets, setBudgets] = useState([]);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showReceiptScan, setShowReceiptScan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newExpense, setNewExpense] = useState({
    amount: '', category: 'Food', description: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => { loadData(); }, []);

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

  // Derived values — all from backend
  const spendingData = analytics?.data || {};
  const totalSpent = spendingData.total_monthly || 0;
  const byCategory = spendingData.by_category || [];
  const comparison = spendingData.comparison;
  const periodLabel = analytics?.metadata?.label || analytics?.metadata?.current_period || 'Current';
  const totalBudget = budgets.reduce((s, b) => s + (b.limit || 0), 0);
  const budgetRemaining = Math.max(0, totalBudget - totalSpent);
  const budgetUsedPct = totalBudget > 0 ? (totalSpent / totalBudget * 100) : 0;

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

      <main className="container mx-auto px-6 py-8">
        {/* GREETING */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">Overview</p>
          <h1 className="text-3xl md:text-4xl font-bold mt-2 text-slate-900" data-testid="dashboard-title">
            Financial overview for {periodLabel}
          </h1>
        </div>

        {/* HERO + DONUT */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr,1.2fr] gap-8">
          <div className="space-y-6">
            {/* HERO CARD */}
            <Card className="relative overflow-hidden rounded-[24px] border-0 shadow-[0_24px_60px_rgba(15,23,42,0.15)] bg-gradient-to-tr from-[#5b5fff] via-[#8b5cf6] to-[#ff6bb5] text-white p-6 md:p-7 h-[200px]">
              <div className="absolute -right-16 -top-10 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
              <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-white/10 blur-xl" />
              <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] font-semibold text-white/70">Total Spending</p>
                  <p className="text-4xl md:text-5xl font-semibold mt-3" data-testid="total-spending-amount">
                    {formatCurrency(totalSpent)}
                  </p>
                  {/* Comparison from backend — NO static text */}
                  {comparison ? (
                    <p className="text-sm mt-3 text-white/80 flex items-center gap-1" data-testid="spending-comparison">
                      {comparison.direction === 'decreased' ? (
                        <TrendingDown className="w-4 h-4" />
                      ) : comparison.direction === 'increased' ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
                      <span>
                        {comparison.direction === 'decreased'
                          ? `${Math.abs(comparison.delta_pct)}% less than previous period (${formatCurrency(comparison.previous_total)})`
                          : comparison.direction === 'increased'
                          ? `${Math.abs(comparison.delta_pct)}% more than previous period (${formatCurrency(comparison.previous_total)})`
                          : `Same as previous period (${formatCurrency(comparison.previous_total)})`}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm mt-3 text-white/60">No previous period data for comparison</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-3">
                  <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
                    <DialogTrigger asChild>
                      <button className="mt-6 h-11 w-11 rounded-full bg-white/90 text-indigo-600 shadow-md flex items-center justify-center hover:bg-white" data-testid="add-expense-btn">
                        <Plus className="w-5 h-5" />
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
                              {categories.map(cat => (
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
                </div>
              </div>
            </Card>

            {/* SUMMARY CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="rounded-[20px] border-0 shadow-sm bg-white px-6 py-6 h-[170px] flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Total Spent</p>
                  <p className="text-2xl font-semibold mt-2 text-slate-900">{formatCurrency(totalSpent)}</p>
                </div>
                <p className="text-xs text-slate-500 mt-2">{periodLabel}</p>
              </Card>
              <Card className="rounded-[20px] border-0 shadow-sm bg-white px-6 py-6 h-[170px] flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Budget Used</p>
                  <p className="text-2xl font-semibold mt-2 text-slate-900">{budgetUsedPct.toFixed(0)}%</p>
                </div>
                <p className={`text-xs mt-2 ${budgetUsedPct > 90 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {budgetUsedPct > 90 ? 'High usage' : 'On track'}
                </p>
              </Card>
              <Card className="rounded-[20px] border-0 shadow-sm bg-white px-6 py-6 h-[170px] flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Budget Remaining</p>
                  <p className="text-2xl font-semibold mt-2 text-slate-900">{formatCurrency(budgetRemaining)}</p>
                </div>
                <p className="text-xs text-slate-500 mt-2">of {formatCurrency(totalBudget)} total</p>
              </Card>
            </div>
          </div>

          {/* DONUT */}
          <Card className="rounded-[24px] border-0 shadow-sm bg-white p-6 flex flex-col" data-testid="spending-chart-card">
            <p className="text-sm font-semibold text-slate-900 mb-1">Spending by Category</p>
            <p className="text-xs text-slate-400 mb-2">Breakdown for {periodLabel}</p>
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
            <Card className="rounded-[24px] border-0 shadow-sm bg-white p-6" data-testid="recent-expenses-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Recent Expenses</p>
                  <p className="text-xs text-slate-400">Latest transactions</p>
                </div>
                <Button size="icon" variant="outline" className="rounded-full border-dashed" onClick={() => setShowAddExpense(true)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
                {expenses.slice(0, 10).map(expense => (
                  <div key={expense.id} className="flex items-center justify-between px-3 py-3 rounded-[16px] hover:bg-slate-50 transition-colors" data-testid={`expense-item-${expense.id}`}>
                    <div className="flex items-center gap-3 flex-1">
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs">{expense.category?.[0] || '$'}</div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900" data-testid={`expense-description-${expense.id}`}>{expense.description}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{expense.date} &middot; {expense.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-sm font-semibold text-slate-900" data-testid={`expense-amount-${expense.id}`}>{formatCurrency(expense.amount || 0)}</p>
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
                <Button variant="outline" className="rounded-full text-xs font-semibold flex items-center gap-2"
                  onClick={handleReceiptScan} data-testid="scan-receipt-btn">
                  <Scan className="w-4 h-4" /> Scan Receipt
                </Button>
              </div>
            </Card>

            {/* INSIGHTS — rendered entirely from backend */}
            <Card className="rounded-[24px] border-0 shadow-sm bg-white p-6" data-testid="suggestions-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-500"><Lightbulb className="w-4 h-4" /></div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Data-Driven Insights</p>
                  <p className="text-xs text-slate-400">Computed from your transactions</p>
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
                      <p className="text-xs text-slate-700 leading-relaxed">{insight.message}</p>
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

      {/* Receipt Scan Modal */}
      <ReceiptScanModal 
        open={showReceiptScan}
        onClose={() => setShowReceiptScan(false)}
        onExpenseCreated={loadData}
      />
    </div>
  );
}

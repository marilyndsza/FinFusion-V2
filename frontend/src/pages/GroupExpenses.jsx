import React, { useState, useMemo, useEffect } from "react";
import { Loader2, Upload, User } from 'lucide-react';
import axios from 'axios';
import Navbar from '@/components/Navbar';
import UserMenu from '@/components/UserMenu';
import logo from '@/assets/logo.png';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { toast } from 'sonner';
import { getAuthToken } from '@/lib/auth';

/**
 * SplitwiseModule.jsx — Pretty UI upgrade
 * - Same logic as before (multi-group split, balances, simplification)
 * - Upgraded styling with Tailwind-friendly classes, avatars, soft shadows, gradients and micro-interactions
 * - Drop into src/components or src/pages. Replace your existing GroupExpenses.jsx with this file.
 *
 * Props:
 *  - primaryPersonId (optional)
 *  - initialGroups (optional)
 *  - onChange (optional)
 */

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

export function computeBalancesForGroup(people, expenses) {
  const balances = {};
  people.forEach((p) => (balances[p.id] = 0));

  expenses.forEach((exp) => {
    const amount = Number(exp.amount) || 0;
    const payer = exp.paidBy;

    let splits = exp.splits && exp.splits.length ? exp.splits : [];
    if (!splits.length) {
      const each = +(amount / Math.max(1, people.length)).toFixed(2);
      splits = people.map((p) => ({ personId: p.id, share: each }));
    }

    balances[payer] += amount;
    splits.forEach((s) => {
      balances[s.personId] -= Number(s.share) || 0;
    });
  });

  Object.keys(balances).forEach((k) => {
    balances[k] = Math.round((balances[k] + Number.EPSILON) * 100) / 100;
  });

  return balances;
}

export function simplifyDebts(balances) {
  const debtors = [];
  const creditors = [];

  Object.entries(balances).forEach(([id, bal]) => {
    if (bal < -0.005) debtors.push({ id, amount: -bal });
    else if (bal > 0.005) creditors.push({ id, amount: bal });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const tx = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const transfer = Math.min(d.amount, c.amount);
    tx.push({ from: d.id, to: c.id, amount: Math.round((transfer + Number.EPSILON) * 100) / 100 });
    d.amount = Math.round((d.amount - transfer + Number.EPSILON) * 100) / 100;
    c.amount = Math.round((c.amount - transfer + Number.EPSILON) * 100) / 100;
    if (Math.abs(d.amount) < 0.01) i++;
    if (Math.abs(c.amount) < 0.01) j++;
  }
  return tx;
}

export default function SplitwiseModule({ primaryPersonId = null, initialGroups = null, onChange = null }) {
  const sampleGroups = [
    {
      id: 'g1',
      name: 'Trip to Goa',
      people: [
        { id: 'u1', name: 'Marilyn (you)' },
        { id: 'u2', name: 'Pooja' },
        { id: 'u3', name: 'Parth' },
        { id: 'u4', name: 'Yash' },
      ],
      expenses: [
        { id: 'ex1', title: 'Beach lunch', amount: 2400, paidBy: 'u1', splits: [] },
        { id: 'ex2', title: 'Cab to hotel', amount: 1200, paidBy: 'u3', splits: [] },
      ],
    },
    {
      id: 'g2',
      name: 'Apartment Utilities',
      people: [
        { id: 'u1', name: 'Marilyn (you)' },
        { id: 'u2', name: 'Pooja' },
      ],
      expenses: [
        { id: 'ex3', title: 'Electricity bill', amount: 1800, paidBy: 'u2', splits: [] },
        { id: 'ex4', title: 'Wi-Fi recharge', amount: 900, paidBy: 'u1', splits: [] },
      ],
    },
  ];

  const [groups, setGroups] = useState(initialGroups || sampleGroups);
  const [selectedGroupId, setSelectedGroupId] = useState((initialGroups && initialGroups[0]?.id) || groups[0]?.id || null);

  const [showNewGroupDialog, setShowNewGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState([]);
  const [newGroupMemberName, setNewGroupMemberName] = useState('');
  const [newExpenseTitle, setNewExpenseTitle] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpensePaidBy, setNewExpensePaidBy] = useState('');
  const [useCustomSplits, setUseCustomSplits] = useState(false);
  const [customSplits, setCustomSplits] = useState({});
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptScanning, setReceiptScanning] = useState(false);
  const [groupReceiptData, setGroupReceiptData] = useState({
    title: '',
    amount: '',
    paidBy: '',
    useCustomSplits: false,
    customSplits: {},
  });
  const [groupReceiptMeta, setGroupReceiptMeta] = useState(null);

  useEffect(() => {
    if (onChange) onChange(groups);
  }, [groups, onChange]);

  const currentGroup = useMemo(() => {
    if (groups.length === 0) return null;
    return groups.find((g) => g.id === selectedGroupId) || groups[0];
  }, [groups, selectedGroupId]);
  
  const groupBalances = useMemo(() => {
    if (!currentGroup) return {};
    return computeBalancesForGroup(currentGroup.people, currentGroup.expenses);
  }, [currentGroup]);
  
  const groupTransactions = useMemo(() => {
    if (!currentGroup) return [];
    return simplifyDebts(groupBalances);
  }, [currentGroup, groupBalances]);

  const groupTotalExpenses = useMemo(() => {
    if (!currentGroup) return 0;
    return currentGroup.expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  }, [currentGroup]);

  function addGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const uniqueMembers = newGroupMembers.filter(Boolean).map((memberName) => ({
      id: uid('u'),
      name: memberName,
    }));
    const g = { id: uid('g'), name, people: uniqueMembers, expenses: [] };
    setGroups((s) => [...s, g]);
    setSelectedGroupId(g.id);
    setNewGroupName('');
    setNewGroupMembers([]);
    setNewGroupMemberName('');
    setShowNewGroupDialog(false);
  }

  function removeGroup(groupId) {
    const next = groups.filter((g) => g.id !== groupId);
    setGroups(next);
    if (selectedGroupId === groupId) {
      setSelectedGroupId(next.length > 0 ? next[0].id : null);
    }
  }

  function addMemberToNewGroup() {
    const name = newGroupMemberName.trim();
    if (!name) return;
    if (newGroupMembers.some((member) => member.toLowerCase() === name.toLowerCase())) return;
    setNewGroupMembers((members) => [...members, name]);
    setNewGroupMemberName('');
  }

  function removeMemberFromNewGroup(name) {
    setNewGroupMembers((members) => members.filter((member) => member !== name));
  }

  function buildSplits(amount, customEnabled, customState) {
    if (!currentGroup) return [];
    if (customEnabled) {
      return currentGroup.people.map((p) => ({ personId: p.id, share: Number(customState[p.id] || 0) }));
    }
    const each = Math.round((amount / Math.max(1, currentGroup.people.length) + Number.EPSILON) * 100) / 100;
    return currentGroup.people.map((p) => ({ personId: p.id, share: each }));
  }

  function validateCustomSplits(amount, customState) {
    const total = Object.values(customState).reduce((sum, value) => sum + (Number(value) || 0), 0);
    return Math.abs(total - amount) < 0.01;
  }

  function resetExpenseForm() {
    setNewExpenseTitle('');
    setNewExpenseAmount('');
    setNewExpensePaidBy('');
    setUseCustomSplits(false);
    setCustomSplits({});
  }

  function resetReceiptDialog() {
    setShowReceiptDialog(false);
    setReceiptScanning(false);
    setGroupReceiptMeta(null);
    setGroupReceiptData({
      title: '',
      amount: '',
      paidBy: '',
      useCustomSplits: false,
      customSplits: {},
    });
  }

  function addExpenseToCurrent() {
    const amount = Number(newExpenseAmount);
    if (!newExpenseTitle.trim() || !amount || isNaN(amount)) return alert('provide title and valid amount');
    if (!newExpensePaidBy) return alert('choose payer');
    if (useCustomSplits && !validateCustomSplits(amount, customSplits)) return alert('custom splits must add up to the expense amount');

    const splits = buildSplits(amount, useCustomSplits, customSplits);
    const exp = { id: uid('e'), title: newExpenseTitle.trim(), amount, paidBy: newExpensePaidBy, splits };
    setGroups((gs) => gs.map((g) => (g.id === currentGroup.id ? { ...g, expenses: [...g.expenses, exp] } : g)));
    resetExpenseForm();
  }

  async function handleGroupReceiptSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image receipt');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Receipt image must be under 5MB');
      return;
    }

    setReceiptScanning(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await axios.post(`${API}/expenses/scan-receipt`, form, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Could not read receipt');
      }

      const extracted = response.data.extracted || {};
      setGroupReceiptMeta({
        confidence: response.data.confidence || 0,
        merchant: extracted.merchant || '',
        rawTextPreview: response.data.raw_text_preview || '',
      });
      setGroupReceiptData((prev) => ({
        ...prev,
        title: extracted.description || extracted.merchant || prev.title,
        amount: extracted.amount?.toString() || prev.amount,
      }));
      toast.success('Receipt scanned for group expense');
    } catch (error) {
      console.error('Group receipt scan error:', error);
      toast.error(error.response?.data?.detail || error.message || 'Failed to scan receipt');
    } finally {
      setReceiptScanning(false);
    }
  }

  function confirmGroupReceiptExpense() {
    const amount = Number(groupReceiptData.amount);
    if (!groupReceiptData.title.trim() || !amount || isNaN(amount)) {
      toast.error('Please confirm the title and amount');
      return;
    }
    if (!groupReceiptData.paidBy) {
      toast.error('Please choose the payer');
      return;
    }
    if (groupReceiptData.useCustomSplits && !validateCustomSplits(amount, groupReceiptData.customSplits)) {
      toast.error('Custom splits need to add up to the receipt total');
      return;
    }

    const splits = buildSplits(amount, groupReceiptData.useCustomSplits, groupReceiptData.customSplits);
    const exp = {
      id: uid('e'),
      title: groupReceiptData.title.trim(),
      amount,
      paidBy: groupReceiptData.paidBy,
      splits,
    };
    setGroups((gs) => gs.map((g) => (g.id === currentGroup.id ? { ...g, expenses: [...g.expenses, exp] } : g)));
    toast.success('Group expense added from receipt');
    resetReceiptDialog();
  }

  function removeExpenseFromCurrent(expId) {
    setGroups((gs) => gs.map((g) => (g.id === currentGroup.id ? { ...g, expenses: g.expenses.filter((e) => e.id !== expId) } : g)));
  }

  function nameOf(id) {
    for (const g of groups) {
      const p = g.people.find((x) => x.id === id);
      if (p) return p.name;
    }
    return id;
  }

  function exportGroupSimplified() {
    const text = groupTransactions
      .map((t) => `${nameOf(t.from)} -> ${nameOf(t.to)}: ₹${t.amount.toFixed(2)}`)
      .join('\n');
    navigator.clipboard?.writeText(text).then(() => alert('Copied group simplified transactions'), () => alert('Copy failed'));
  }

  function getAvatarVisual(name) {
    return {
      Icon: User,
      tone: 'bg-indigo-50 text-indigo-500',
    };
  }

  function AvatarBadge({ name, size = 'md' }) {
    const { Icon, tone } = getAvatarVisual(name);
    const sizeClass = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-9 h-9' : 'w-10 h-10';
    const iconClass = size === 'lg' ? 'w-5 h-5' : 'w-[18px] h-[18px]';

    return (
      <div className={`${sizeClass} rounded-full ${tone} flex items-center justify-center shadow-sm`}>
        <Icon className={iconClass} strokeWidth={1.8} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      {/* TOP NAVBAR */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="container mx-auto px-6 sm:px-10 lg:px-14 py-4 flex items-center justify-between gap-5">
          <img src={logo} alt="FinFusion logo" className="h-10 object-contain" />
          <Navbar />
          <UserMenu />
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="container mx-auto py-8 px-6 max-w-6xl">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Groups</h1>
            <p className="text-sm text-gray-500 mt-1">Manage group expenses, track balances, and settle up with ease.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowNewGroupDialog(true)} className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-xl shadow-md hover:shadow-lg transition"> 
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
              New group
            </button>
          </div>
        </header>

        <div className="grid grid-cols-4 gap-6">
          <aside className="col-span-1 sticky top-6">
            <div className="bg-white rounded-2xl p-4 shadow-md">
              <h3 className="text-sm font-medium mb-2">Your groups</h3>
              <ul className="space-y-2">
                {groups.length > 0 ? (
                  groups.map((g) => (
                  <li key={g.id} className={`flex items-center justify-between p-2 rounded-lg transition ${g.id === selectedGroupId ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-gray-50'}`}>
                    <div className="flex-1 cursor-pointer" onClick={() => setSelectedGroupId(g.id)}>
                      <div className="text-sm font-semibold">{g.name}</div>
                      <div className="text-xs text-gray-400">{g.people.length} members • {g.expenses.length} expenses</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete group "${g.name}"? This will remove all members and expenses.`)) {
                            removeGroup(g.id);
                          }
                        }}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition"
                        title="Delete group"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <div className="text-gray-300 text-sm cursor-pointer" onClick={() => setSelectedGroupId(g.id)}>›</div>
                    </div>
                  </li>
                ))
                ) : (
                  <li className="text-center py-4 text-sm text-gray-400">
                    No groups yet. Create one from the button above.
                  </li>
                )}
              </ul>
            </div>

          </aside>

          <main className="col-span-3">
            {currentGroup ? (
              <>
            <div className="bg-white rounded-2xl p-5 shadow-lg mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{currentGroup.name}</h2>
                  <div className="text-sm text-gray-400 mt-1">{currentGroup.people.length} members • {currentGroup.expenses.length} expenses</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-500">Group total</div>
                  <div className="text-2xl font-extrabold text-indigo-600">₹{groupTotalExpenses.toFixed(2)}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {currentGroup.people.map((p) => (
                  <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl ${primaryPersonId === p.id ? 'ring-2 ring-indigo-200 bg-indigo-50' : 'bg-gray-50'} shadow-sm`}> 
                    <AvatarBadge name={p.name} size="lg" />
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className={`text-xs ${groupBalances[p.id] > 0 ? 'text-green-600' : 'text-orange-600'}`}>{groupBalances[p.id] ? (groupBalances[p.id] > 0 ? `+₹${groupBalances[p.id].toFixed(2)}` : `-₹${Math.abs(groupBalances[p.id]).toFixed(2)}`) : '₹0.00'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <section className="bg-white rounded-2xl p-5 shadow-md h-[620px] flex flex-col">
                <h3 className="font-semibold mb-3">Add expense</h3>
                <div className="space-y-3 flex-1 min-h-0 flex flex-col">
                  <input value={newExpenseTitle} onChange={(e)=>setNewExpenseTitle(e.target.value)} placeholder="Title" className="w-full border border-gray-200 rounded-lg p-2" />
                  <input value={newExpenseAmount} onChange={(e)=>setNewExpenseAmount(e.target.value)} placeholder="Amount" className="w-full border border-gray-200 rounded-lg p-2" />
                  <Select value={newExpensePaidBy} onValueChange={setNewExpensePaidBy}>
                    <SelectTrigger className="w-full h-12 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 shadow-[0_12px_28px_rgba(139,92,246,0.12)] text-violet-900 text-base font-semibold data-[placeholder]:text-violet-900 [&>svg]:text-violet-700">
                      <SelectValue placeholder="Select payer" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-0 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
                      {currentGroup.people.map((p)=> (
                        <SelectItem key={p.id} value={p.id} className="rounded-xl">
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={useCustomSplits} onChange={(e)=>setUseCustomSplits(e.target.checked)} /> Custom splits</label>

                  {useCustomSplits && (
                    <div className="space-y-2">
                      {currentGroup.people.map((p)=> (
                        <div key={p.id} className="flex items-center gap-2">
                          <div className="w-28 text-sm">{p.name}</div>
                          <input placeholder="share" value={customSplits[p.id]||''} onChange={(e)=>setCustomSplits(s=>({ ...s, [p.id]: e.target.value }))} className="border p-2 rounded flex-1" />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 items-center">
                    <button onClick={addExpenseToCurrent} className="px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white font-medium shadow">Add</button>
                    <button onClick={resetExpenseForm} className="px-4 py-2 rounded-lg bg-gray-100">Reset</button>
                    <button
                      onClick={() => setShowReceiptDialog(true)}
                      className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6d4cff] via-[#9345f9] to-[#f26ab3] text-white font-medium shadow-[0_14px_28px_rgba(147,69,249,0.28)] hover:scale-[1.01] transition"
                    >
                      <Upload className="w-4 h-4" />
                      Scan Receipt
                    </button>
                  </div>

                  <hr />

                  <h4 className="font-medium">Expenses</h4>
                  <div className="flex-1 min-h-0 overflow-hidden">
                  <ul className="divide-y mt-2 h-full overflow-y-auto pr-1">
                    {currentGroup.expenses.map((e)=> (
                      <li key={e.id} className="py-3 flex items-start justify-between">
                        <div>
                          <div className="font-semibold">{e.title} <span className="text-sm text-gray-400">• ₹{Number(e.amount).toFixed(2)}</span></div>
                          <div className="text-xs text-gray-400">paid by {nameOf(e.paidBy)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={()=>removeExpenseFromCurrent(e.id)} className="text-sm text-red-500">Remove</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-2xl p-5 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Balances & Settlements</h3>
                  <button onClick={exportGroupSimplified} className="text-sm px-3 py-1 rounded-lg bg-indigo-600 text-white">Copy</button>
                </div>

                <div className="space-y-3">
                  {currentGroup.people.map((p)=> (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <AvatarBadge name={p.name} />
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-400">{p.id === newExpensePaidBy ? 'recent payer' : ''}</div>
                        </div>
                      </div>
                      <div className={`font-semibold ${groupBalances[p.id] > 0 ? 'text-green-600' : 'text-orange-600'}`}>{groupBalances[p.id] ? (groupBalances[p.id] > 0 ? `+₹${groupBalances[p.id].toFixed(2)}` : `-₹${Math.abs(groupBalances[p.id]).toFixed(2)}`) : '₹0.00'}</div>
                    </div>
                  ))}

                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Simplified transactions</h4>
                    {groupTransactions.length ? (
                      <ul className="space-y-2">
                        {groupTransactions.map((t, idx) => (
                          <li key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <AvatarBadge name={nameOf(t.from)} size="sm" />
                              <div className="text-sm">{nameOf(t.from)} pays <span className="font-semibold">{nameOf(t.to)}</span></div>
                            </div>
                            <div className="font-semibold">₹{t.amount.toFixed(2)}</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-sm text-gray-400">No settlements — everyone is settled up.</div>
                    )}
                  </div>
                </div>
              </section>
            </div>

              </>
            ) : (
              <div className="bg-white rounded-2xl p-12 shadow-lg text-center">
                <div className="max-w-md mx-auto">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">No Groups Yet</h2>
                  <p className="text-gray-500 mb-6">
                    Create your first group to start tracking shared expenses with friends and family.
                  </p>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-left">
                    <p className="text-sm text-indigo-900 font-medium mb-2">Get started by:</p>
                    <ul className="text-sm text-indigo-700 space-y-1">
                      <li>• Creating a group in the sidebar</li>
                      <li>• Adding members to split expenses</li>
                      <li>• Recording who paid for what</li>
                      <li>• See who owes whom automatically</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>

      <Dialog open={showNewGroupDialog} onOpenChange={setShowNewGroupDialog}>
        <DialogContent className="rounded-[24px] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Group name</label>
              <Input
                placeholder="Trip to Manali"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Members</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add member name"
                  value={newGroupMemberName}
                  onChange={(e) => setNewGroupMemberName(e.target.value)}
                  className="h-11 rounded-xl"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addMemberToNewGroup();
                    }
                  }}
                />
                <Button type="button" onClick={addMemberToNewGroup} className="rounded-xl bg-indigo-600 text-white">
                  Add
                </Button>
              </div>
              {newGroupMembers.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {newGroupMembers.map((member) => (
                    <button
                      key={member}
                      type="button"
                      onClick={() => removeMemberFromNewGroup(member)}
                      className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-sm font-medium text-violet-700"
                    >
                      {member}
                      <span className="text-violet-500">×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              type="button"
              onClick={addGroup}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold"
            >
              Create group
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReceiptDialog} onOpenChange={(open) => { if (!open) resetReceiptDialog(); else setShowReceiptDialog(true); }}>
        <DialogContent className="rounded-[24px] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Group Expense From Receipt</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="rounded-[20px] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Scan a receipt for this group</p>
                  <p className="text-xs text-slate-500 mt-1">We’ll prefill the title and amount, then you can pick the payer and confirm splits.</p>
                </div>
                <label htmlFor="group-receipt-upload" className="cursor-pointer">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6d4cff] via-[#9345f9] to-[#f26ab3] text-white font-medium shadow-[0_14px_28px_rgba(147,69,249,0.22)]">
                    {receiptScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {receiptScanning ? 'Scanning...' : 'Choose Receipt'}
                  </div>
                  <input
                    id="group-receipt-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleGroupReceiptSelect}
                    disabled={receiptScanning}
                  />
                </label>
              </div>

              {groupReceiptMeta && (
                <div className="mt-4 rounded-2xl bg-white/80 border border-violet-100 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium">OCR confidence</span>
                    <span>{Math.round((groupReceiptMeta.confidence || 0) * 100)}%</span>
                  </div>
                  {groupReceiptMeta.merchant && (
                    <p className="mt-2 text-xs text-slate-600"><span className="font-medium text-slate-700">Merchant:</span> {groupReceiptMeta.merchant}</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Title</label>
                <Input
                  value={groupReceiptData.title}
                  onChange={(e) => setGroupReceiptData((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Dinner, cab, tickets..."
                  className="h-11 rounded-xl"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Amount</label>
                <Input
                  type="number"
                  step="0.01"
                  value={groupReceiptData.amount}
                  onChange={(e) => setGroupReceiptData((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Payer</label>
              <Select value={groupReceiptData.paidBy} onValueChange={(val) => setGroupReceiptData((prev) => ({ ...prev, paidBy: val }))}>
                <SelectTrigger className="w-full h-12 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 text-violet-900 font-semibold data-[placeholder]:text-violet-900 [&>svg]:text-violet-700">
                  <SelectValue placeholder="Scroll and choose the payer" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-0 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)] max-h-72">
                  {currentGroup?.people.map((person) => (
                    <SelectItem key={person.id} value={person.id} className="rounded-xl">
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-[20px] border border-slate-200 p-4 space-y-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={groupReceiptData.useCustomSplits}
                  onChange={(e) => setGroupReceiptData((prev) => ({ ...prev, useCustomSplits: e.target.checked }))}
                />
                Custom splits
              </label>

              {groupReceiptData.useCustomSplits ? (
                <div className="space-y-2">
                  {currentGroup?.people.map((person) => (
                    <div key={person.id} className="flex items-center gap-3">
                      <div className="w-28 text-sm text-slate-700">{person.name}</div>
                      <Input
                        type="number"
                        step="0.01"
                        value={groupReceiptData.customSplits[person.id] || ''}
                        onChange={(e) => setGroupReceiptData((prev) => ({
                          ...prev,
                          customSplits: { ...prev.customSplits, [person.id]: e.target.value },
                        }))}
                        placeholder="0.00"
                        className="h-10 rounded-xl"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-slate-500">Tip: custom shares should add up to the receipt total.</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">If you leave this off, the amount will be split equally across all members.</p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                type="button"
                onClick={confirmGroupReceiptExpense}
                className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#6d4cff] via-[#9345f9] to-[#f26ab3] text-white font-semibold"
              >
                Confirm & Add
              </Button>
              <Button type="button" variant="outline" onClick={resetReceiptDialog} className="flex-1 h-11 rounded-xl">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

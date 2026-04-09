// Frontend API client — all endpoints return { data, metadata, error }
import axios from 'axios';
import { getAuthToken, logout } from './auth';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

// Add auth header to all requests
axios.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ==================== Expenses ====================

export async function getExpenses() {
  try {
    const r = await axios.get(`${API}/expenses`);
    return r.data?.data || [];
  } catch (e) {
    console.error('getExpenses error:', e);
    return [];
  }
}

export async function postExpense(payload) {
  const r = await axios.post(`${API}/expenses`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  return r.data;
}

export async function deleteExpense(id) {
  await axios.delete(`${API}/expenses/${id}`);
  return { ok: true };
}

// ==================== Analytics (context-aware) ====================

export async function getAnalyticsSpending(month, year) {
  try {
    const params = {};
    if (month != null) params.month = month;
    if (year != null) params.year = year;
    const r = await axios.get(`${API}/analytics/spending`, { params });
    return r.data || { data: {}, metadata: {}, error: null };
  } catch (e) {
    console.error('getAnalyticsSpending error:', e);
    return { data: { total_monthly: 0, by_category: [], comparison: null }, metadata: {}, error: e.message };
  }
}

export async function getCurrentAnalytics(month, year) {
  try {
    const params = {};
    if (month != null) params.month = month;
    if (year != null) params.year = year;
    const r = await axios.get(`${API}/analytics/current`, { params });
    return r.data || { data: {}, metadata: {}, error: null };
  } catch (e) {
    console.error('getCurrentAnalytics error:', e);
    return { data: { total_monthly: 0, categories: [] }, metadata: {}, error: e.message };
  }
}

export async function getAvailableMonths() {
  try {
    const r = await axios.get(`${API}/analytics/available-months`);
    return r.data || { data: [], metadata: {}, error: null };
  } catch (e) {
    console.error('getAvailableMonths error:', e);
    return { data: [], metadata: { default: { month: 12, year: 2024 } }, error: e.message };
  }
}

// ==================== Historical ====================

export async function getHistory() {
  try {
    const r = await axios.get(`${API}/analytics/history`);
    return r.data || { data: {}, metadata: {}, error: null };
  } catch (e) {
    console.error('getHistory error:', e);
    return { data: { monthly_totals: [] }, metadata: {}, error: e.message };
  }
}

export async function getCategoryTrends() {
  try {
    const r = await axios.get(`${API}/analytics/category-trends`);
    return r.data || { data: {}, metadata: {}, error: null };
  } catch (e) {
    console.error('getCategoryTrends error:', e);
    return { data: { periods: [], series: {} }, metadata: {}, error: e.message };
  }
}

// ==================== Insights / Suggestions ====================

export async function getSuggestions() {
  try {
    const r = await axios.get(`${API}/suggestions`);
    return r.data || { data: [], metadata: {}, error: null };
  } catch (e) {
    console.error('getSuggestions error:', e);
    return { data: [], metadata: {}, error: e.message };
  }
}

// ==================== Forecast ====================

export async function getForecast() {
  try {
    const r = await axios.get(`${API}/forecast/lstm`);
    return r.data || { data: {}, metadata: {}, error: null };
  } catch (e) {
    console.error('getForecast error:', e);
    return { data: { forecast: [], trend: 'error' }, metadata: {}, error: e.message };
  }
}

// ==================== Budgets (context-aware) ====================

export async function getBudgets(month, year) {
  try {
    const params = {};
    if (month != null) params.month = month;
    if (year != null) params.year = year;
    const r = await axios.get(`${API}/budget/smart`, { params });
    return r.data || { data: { budget: [], total: 0 }, metadata: {}, error: null };
  } catch (e) {
    console.error('getBudgets error:', e);
    return { data: { budget: [], total: 0 }, metadata: {}, error: e.message };
  }
}

// ==================== Anomalies ====================

export async function getAnomalies() {
  try {
    const r = await axios.get(`${API}/expenses/anomalies`);
    return r.data || { data: { alerts: [] }, metadata: {}, error: null };
  } catch (e) {
    console.error('getAnomalies error:', e);
    return { data: { alerts: [] }, metadata: {}, error: e.message };
  }
}

// ==================== Expenses by Category ====================

export async function getExpensesByCategory(category) {
  try {
    const r = await axios.get(`${API}/expenses/category/${encodeURIComponent(category)}`);
    return r.data?.data || [];
  } catch (e) {
    console.error('getExpensesByCategory error:', e);
    return [];
  }
}

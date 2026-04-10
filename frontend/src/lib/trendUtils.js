export function getReferenceDate(expenses = []) {
  if (!expenses.length) return new Date();
  return new Date([...expenses].sort((a, b) => new Date(b.date) - new Date(a.date))[0].date);
}

export function startOfWeek(date) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfWeek(date) {
  const value = startOfWeek(date);
  value.setDate(value.getDate() + 6);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function formatWeeklyLabel(date) {
  return `Week of ${startOfWeek(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function getWeeksInMonth(date) {
  const first = startOfMonth(date);
  const last = endOfMonth(date);
  const seen = new Set();
  for (let cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    seen.add(startOfWeek(cursor).toISOString().slice(0, 10));
  }
  return Math.max(seen.size, 1);
}

function inRange(date, start, end) {
  return date >= start && date <= end;
}

export function getTrendSnapshot(expenses = [], mode = 'monthly') {
  const referenceDate = getReferenceDate(expenses);
  const normalized = expenses.map(exp => ({ ...exp, _date: new Date(exp.date) }));

  const currentStart = mode === 'weekly' ? startOfWeek(referenceDate) : startOfMonth(referenceDate);
  const currentEnd = mode === 'weekly' ? endOfWeek(referenceDate) : endOfMonth(referenceDate);
  const previousEnd = new Date(currentStart);
  previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1);
  const previousStart = mode === 'weekly'
    ? new Date(previousEnd.getTime() - 6 * 24 * 60 * 60 * 1000)
    : startOfMonth(previousEnd);

  const currentExpenses = normalized.filter(exp => inRange(exp._date, currentStart, currentEnd));
  const previousExpenses = normalized.filter(exp => inRange(exp._date, previousStart, previousEnd));
  const total = currentExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const previousTotal = previousExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const delta = total - previousTotal;
  const deltaPct = previousTotal > 0 ? (delta / previousTotal) * 100 : 0;
  const direction = delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'same';

  const byCategoryMap = currentExpenses.reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + (exp.amount || 0);
    return acc;
  }, {});

  return {
    total,
    previousTotal,
    deltaPct,
    direction,
    label: mode === 'weekly'
      ? formatWeeklyLabel(referenceDate)
      : referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    byCategory: Object.entries(byCategoryMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    referenceDate,
    currentExpenses,
  };
}

export function buildTrendSeries(expenses = [], mode = 'monthly') {
  const normalized = expenses
    .map(exp => ({ ...exp, _date: new Date(exp.date) }))
    .sort((a, b) => a._date - b._date);

  const bucketMap = new Map();
  normalized.forEach(exp => {
    const keyDate = mode === 'weekly' ? startOfWeek(exp._date) : startOfMonth(exp._date);
    const key = keyDate.toISOString().slice(0, 10);
    if (!bucketMap.has(key)) {
      bucketMap.set(key, { period: key, date: keyDate, total: 0, count: 0, categories: {} });
    }
    const bucket = bucketMap.get(key);
    bucket.total += exp.amount || 0;
    bucket.count += 1;
    bucket.categories[exp.category] = (bucket.categories[exp.category] || 0) + (exp.amount || 0);
  });

  return [...bucketMap.values()].map(bucket => ({
    ...bucket,
    label: mode === 'weekly'
      ? bucket.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : bucket.period.slice(0, 7),
  }));
}

export function buildCategoryTrendData(expenses = [], mode = 'monthly', limit = 6) {
  const series = buildTrendSeries(expenses, mode);
  const totals = {};
  series.forEach(period => {
    Object.entries(period.categories).forEach(([category, amount]) => {
      totals[category] = (totals[category] || 0) + amount;
    });
  });
  const topCategories = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, total]) => ({ category, total }));

  const barData = series.map(period => {
    const row = { period: period.label };
    topCategories.forEach(({ category }) => {
      row[category] = period.categories[category] || 0;
    });
    return row;
  });

  return { topCategories, barData, series };
}

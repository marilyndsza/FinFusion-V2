const CATEGORY_ALIASES = {
  Fitness: ['gym', 'workout', 'yoga', 'trainer', 'sports'],
  Pets: ['pet', 'pets', 'dog', 'cat', 'vet', 'veterinary'],
  Food: ['pizza', 'burger', 'dinner', 'lunch', 'breakfast', 'meal', 'restaurant', 'groceries', 'grocery', 'snacks', 'coffee'],
  Transport: ['taxi', 'uber', 'ola', 'bus', 'metro', 'train', 'fuel', 'petrol', 'diesel', 'commute', 'cab', 'auto'],
  Utilities: ['water', 'internet', 'wifi', 'gas', 'bill', 'recharge'],
  Entertainment: ['movie', 'netflix', 'spotify', 'game', 'gaming', 'concert', 'party'],
  Healthcare: ['medical', 'doctor', 'medicine', 'pharmacy', 'hospital', 'clinic', 'health'],
  Education: ['school', 'college', 'class', 'course', 'tuition', 'fees', 'books', 'exam'],
  Shopping: ['shop', 'purchase', 'bought', 'buy', 'clothes', 'mall', 'store'],
  Rent: ['lease', 'landlord', 'apartment', 'housing'],
  Travel: ['trip', 'flight', 'hotel', 'booking', 'vacation', 'holiday'],
};

const AMOUNT_PATTERNS = [
  /(?:\u20b9|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:rupees|rs\.?|inr)/i,
  /(?:spent|paid|add(?:ed)?|cost|for)\s*\u20b9?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /([\d,]+(?:\.\d{1,2})?)/,
];

const CATEGORY_STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'for', 'from', 'in', 'into', 'just', 'my', 'on',
  'paid', 'pay', 'spent', 'spend', 'the', 'to', 'today', 'with',
]);

function normalizeText(value = '') {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(token = '') {
  return token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token;
}

function titleCase(value = '') {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function uniqueCategories(categories = []) {
  const seen = new Set();

  return categories
    .filter(Boolean)
    .map(category => String(category).trim())
    .filter(category => {
      const key = normalizeText(category);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseAmount(transcript = '') {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = transcript.match(pattern);
    if (!match?.[1]) continue;

    return {
      value: Number(match[1].replace(/,/g, '')),
      index: match.index ?? -1,
      raw: match[0],
    };
  }

  return { value: 0, index: -1, raw: '' };
}

function getTranscriptTokens(transcript = '') {
  return new Set(normalizeText(transcript).split(' ').filter(Boolean).map(normalizeToken));
}

function findExistingCategory(transcript = '', availableCategories = []) {
  const normalizedTranscript = normalizeText(transcript);
  const transcriptTokens = getTranscriptTokens(transcript);

  for (const category of availableCategories) {
    const normalizedCategory = normalizeText(category);
    if (!normalizedCategory) continue;

    if (normalizedTranscript.includes(normalizedCategory)) return category;

    const categoryTokens = normalizedCategory.split(' ').filter(Boolean).map(normalizeToken);
    if (categoryTokens.length && categoryTokens.every(token => transcriptTokens.has(token))) {
      return category;
    }
  }

  for (const [targetCategory, aliases] of Object.entries(CATEGORY_ALIASES)) {
    const existingCategory = availableCategories.find(
      category => normalizeText(category) === normalizeText(targetCategory)
    );

    if (!existingCategory) continue;

    const aliasMatched = aliases.some(alias => {
      const normalizedAlias = normalizeText(alias);
      return normalizedTranscript.includes(normalizedAlias) ||
        transcriptTokens.has(normalizeToken(normalizedAlias));
    });

    if (aliasMatched) return existingCategory;
  }

  return '';
}

function extractSpokenItem(transcript = '', amountInfo = {}) {
  const amountEnd = amountInfo.index >= 0 ? amountInfo.index + amountInfo.raw.length : -1;
  const afterAmount = amountEnd >= 0 ? transcript.slice(amountEnd) : transcript;
  const afterAmountMatch = afterAmount.match(/\b(?:for|on|in|to|at)?\s*([A-Za-z][A-Za-z-]*)\b/);

  if (afterAmountMatch?.[1] && !CATEGORY_STOP_WORDS.has(afterAmountMatch[1].toLowerCase())) {
    return titleCase(afterAmountMatch[1]);
  }

  const beforeAmount = amountInfo.index > 0 ? transcript.slice(0, amountInfo.index) : transcript;
  const words = beforeAmount.match(/[A-Za-z][A-Za-z-]*/g) || [];
  const candidate = [...words].reverse().find(word => !CATEGORY_STOP_WORDS.has(word.toLowerCase()));

  return candidate ? titleCase(candidate) : transcript.trim();
}

export function parseVoiceExpense(transcript = '', categoryOptions = []) {
  const normalizedTranscript = transcript.trim();
  const amountInfo = parseAmount(normalizedTranscript);
  const availableCategories = uniqueCategories(categoryOptions);
  const matchedCategory = findExistingCategory(normalizedTranscript, availableCategories);
  const spokenItem = extractSpokenItem(normalizedTranscript, amountInfo);

  return {
    amount: amountInfo.value,
    category: matchedCategory || 'Miscellaneous',
    description: matchedCategory ? normalizedTranscript : spokenItem,
    isNewCategory: false,
    transcript: normalizedTranscript,
  };
}

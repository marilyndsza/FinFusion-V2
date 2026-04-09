"""
Dataset loader and preprocessor for BudgetWise personal finance dataset.
Handles both the original clean format and the raw Kaggle format with
mixed date formats, dirty categories, and mixed transaction types.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.preprocessing import MinMaxScaler
from datetime import datetime
import logging
import re

logger = logging.getLogger(__name__)

# Category normalization map: maps common misspellings/variants to canonical names
CATEGORY_MAP = {
    # Food
    'food': 'Food', 'foods': 'Food', 'fod': 'Food', 'foood': 'Food', 'foodd': 'Food',
    # Rent
    'rent': 'Rent', 'rentt': 'Rent', 'rnt': 'Rent',
    # Entertainment
    'entertainment': 'Entertainment', 'entertainmnt': 'Entertainment',
    'entertain': 'Entertainment', 'entrtnmnt': 'Entertainment',
    # Education
    'education': 'Education', 'educaton': 'Education', 'educatin': 'Education', 'edu': 'Education',
    # Travel
    'travel': 'Travel', 'travl': 'Travel', 'trave': 'Travel', 'traval': 'Travel',
    # Utilities
    'utilities': 'Utilities', 'utilties': 'Utilities', 'utlities': 'Utilities',
    'utility': 'Utilities',
    # Healthcare
    'health': 'Healthcare', 'healthcare': 'Healthcare', 'helth': 'Healthcare',
    # Shopping
    'shopping': 'Shopping', 'shoping': 'Shopping',
    # Transport
    'transport': 'Transport', 'transportation': 'Transport',
    # Savings
    'savings': 'Savings', 'saving': 'Savings',
    # Other
    'others': 'Other', 'other': 'Other', 'miscellaneous': 'Other', 'misc': 'Other',
    # Groceries
    'groceries': 'Groceries', 'grocery': 'Groceries',
    # Income (will be filtered out)
    'salary': 'Income', 'freelance': 'Income', 'investment': 'Income',
    'income': 'Income',
}


class DatasetLoader:
    """Handles loading and preprocessing of the personal finance dataset."""

    def __init__(self, dataset_path: str):
        self.dataset_path = Path(dataset_path)
        self.df_expenses = None
        self.df_aggregated = None
        self.scaler = MinMaxScaler()

    def load_and_preprocess(self):
        if not self.dataset_path.exists():
            raise FileNotFoundError(
                f"Dataset file not found at '{self.dataset_path}'. "
                f"Please place the BudgetWise CSV file at this location."
            )

        logger.info(f"Loading dataset from {self.dataset_path}")

        try:
            df = pd.read_csv(self.dataset_path)
            if df.empty:
                raise ValueError("Dataset is empty")

            logger.info(f"Loaded {len(df)} rows, columns: {list(df.columns)}")

            # Detect format: Kaggle raw vs clean
            is_kaggle = 'transaction_type' in df.columns or 'transaction_id' in df.columns

            if is_kaggle:
                df = self._preprocess_kaggle(df)
            else:
                df = self._preprocess_clean(df)

            self.df_expenses = df

            # Create aggregated time series
            self.df_aggregated = self._aggregate_time_series(df)

            if not self.df_aggregated.empty:
                self._normalize_data()

            logger.info(
                f"Preprocessing complete: {len(self.df_expenses)} expenses, "
                f"{len(self.df_aggregated)} time periods"
            )
            return self.df_expenses, self.df_aggregated

        except pd.errors.EmptyDataError:
            raise ValueError("Dataset file is empty or corrupt.")
        except Exception as e:
            logger.error(f"Error loading dataset: {e}")
            raise ValueError(f"Failed to load dataset: {str(e)}")

    # ------------------------------------------------------------------ #
    # Kaggle raw format
    # ------------------------------------------------------------------ #
    def _preprocess_kaggle(self, df: pd.DataFrame) -> pd.DataFrame:
        original_len = len(df)
        logger.info(f"Detected Kaggle format ({original_len} rows)")

        # 1) Filter to Expense rows only
        if 'transaction_type' in df.columns:
            df = df[df['transaction_type'].str.strip().str.lower() == 'expense']
            logger.info(f"After filtering expenses: {len(df)} rows")

        # 2) Clean amount — strip $, commas, coerce to numeric
        df['amount'] = df['amount'].astype(str).str.replace(r'[$,\s]', '', regex=True)
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
        df = df.dropna(subset=['amount'])
        df = df[df['amount'] > 0]
        # Cap extreme outliers (>100k likely data errors in personal finance)
        df = df[df['amount'] <= 100000]

        # 3) Parse dates — handle multiple formats
        df['date'] = df['date'].apply(self._parse_date_flexible)
        df = df.dropna(subset=['date'])
        df['date'] = df['date'].dt.strftime('%Y-%m-%d')

        # 4) Normalize categories
        if 'category' in df.columns:
            df['category'] = df['category'].fillna('Other').apply(self._normalize_category)
        else:
            df['category'] = 'Other'

        # Filter out Income categories that slipped through
        df = df[df['category'] != 'Income']

        # 5) Map 'notes' or 'description' to description
        if 'notes' in df.columns and 'description' not in df.columns:
            df['description'] = df['notes'].fillna('Expense')
        elif 'description' not in df.columns:
            df['description'] = 'Expense'
        df['description'] = df['description'].fillna('Expense')

        # 6) Drop duplicates, sort, reindex
        df = df.drop_duplicates()
        df = df.sort_values('date').reset_index(drop=True)

        # Keep only columns we need
        df = df[['date', 'amount', 'category', 'description']].copy()

        logger.info(f"Kaggle preprocessing: {original_len} -> {len(df)} rows")
        return df

    def _parse_date_flexible(self, val):
        """Parse a date value trying multiple formats."""
        if pd.isna(val) or str(val).strip() == '':
            return pd.NaT
        s = str(val).strip()
        # Try pandas auto-parse first
        for fmt in [
            '%Y-%m-%d', '%m/%d/%Y', '%d-%m-%y', '%d-%m-%Y',
            '%m/%d/%y', '%B %d %Y', '%b %d %Y', '%d %B %Y',
            '%Y-%m-%d %H:%M:%S',
        ]:
            try:
                return pd.Timestamp(datetime.strptime(s, fmt))
            except (ValueError, TypeError):
                continue
        # Last resort: pandas inference
        try:
            return pd.to_datetime(s, dayfirst=False)
        except Exception:
            return pd.NaT

    def _normalize_category(self, cat: str) -> str:
        """Map dirty category names to canonical ones."""
        if pd.isna(cat):
            return 'Other'
        key = str(cat).strip().lower()
        return CATEGORY_MAP.get(key, cat.strip().title())

    # ------------------------------------------------------------------ #
    # Clean format (original small dataset)
    # ------------------------------------------------------------------ #
    def _preprocess_clean(self, df: pd.DataFrame) -> pd.DataFrame:
        original_len = len(df)
        df = df.dropna(subset=['amount'])
        df = df.drop_duplicates()
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
        df = df[df['amount'] > 0]

        if 'description' in df.columns:
            df['description'] = df['description'].fillna('Expense')
        else:
            df['description'] = 'Expense'
        if 'category' in df.columns:
            df['category'] = df['category'].fillna('Other')
        else:
            df['category'] = 'Other'

        # Parse dates
        date_col = None
        for col in ['date', 'Date', 'transaction_date', 'txn_date', 'created_at']:
            if col in df.columns:
                date_col = col
                break
        if date_col is None:
            df['date'] = datetime.now().strftime('%Y-%m-%d')
        else:
            df['date'] = pd.to_datetime(df[date_col], errors='coerce')
            df = df.dropna(subset=['date'])
            df['date'] = df['date'].dt.strftime('%Y-%m-%d')

        df = df.sort_values('date').reset_index(drop=True)
        logger.info(f"Clean preprocessing: {original_len} -> {len(df)} rows")
        return df

    # ------------------------------------------------------------------ #
    # Time series aggregation
    # ------------------------------------------------------------------ #
    def _aggregate_time_series(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return pd.DataFrame(columns=['date', 'total_amount'])

        daily = df.groupby('date')['amount'].sum().reset_index()
        daily.columns = ['date', 'total_amount']

        daily['date'] = pd.to_datetime(daily['date'])
        date_range = pd.date_range(start=daily['date'].min(), end=daily['date'].max(), freq='D')
        full_range = pd.DataFrame({'date': date_range})
        daily = full_range.merge(daily, on='date', how='left')
        daily['total_amount'] = daily['total_amount'].fillna(0)
        daily['date'] = daily['date'].dt.strftime('%Y-%m-%d')

        return daily

    def _normalize_data(self):
        if self.df_aggregated.empty:
            return
        values = self.df_aggregated['total_amount'].values.reshape(-1, 1)
        self.scaler.fit(values)
        self.df_aggregated['normalized'] = self.scaler.transform(values)
        logger.info("Data normalized using MinMaxScaler")

    def validate_for_lstm(self, min_days: int = 14) -> tuple:
        if self.df_aggregated is None or self.df_aggregated.empty:
            return False, "No aggregated time series data available"
        if len(self.df_aggregated) < min_days:
            return False, f"Need {min_days} days, have {len(self.df_aggregated)}"
        if self.df_aggregated['total_amount'].sum() == 0:
            return False, "All spending amounts are zero"
        return True, "Dataset valid for LSTM training"

    def validate_for_anomaly(self, min_rows: int = 50) -> tuple:
        if self.df_expenses is None or self.df_expenses.empty:
            return False, "No expense data available"
        if len(self.df_expenses) < min_rows:
            return False, f"Need {min_rows} rows, have {len(self.df_expenses)}"
        required = ['amount', 'date']
        missing = [c for c in required if c not in self.df_expenses.columns]
        if missing:
            return False, f"Missing columns: {missing}"
        return True, "Dataset valid for anomaly detection"

# Dataset Placeholder

## Required Dataset

**Name:** BudgetWise Personal Finance Dataset  
**Source:** https://www.kaggle.com/datasets/mohammedarfathr/budgetwise-personal-finance-dataset

## Instructions

1. Download the dataset CSV from Kaggle
2. Place the CSV file in this directory
3. Rename it to: `budgetwise.csv`
4. Restart the backend server

## Expected Columns

The dataset should contain at least:
- `amount` - Transaction amount (numeric)
- `date` or `Date` or `transaction_date` - Date of transaction
- `category` - Category name (optional, will default to 'Other')
- `description` - Transaction description (optional)

## File Path

The server will look for the dataset at:
```
./backend/data/budgetwise.csv
```

This path is configured in `.env` as `DATASET_PATH`

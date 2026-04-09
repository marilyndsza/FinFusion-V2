from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import User
from middleware import get_current_user
from utils.query_helpers import get_filtered_expenses, expenses_to_dataframe
from services.insights_engine import InsightsEngine
from typing import Optional
import pandas as pd

router = APIRouter(prefix="/api", tags=["insights"])

def aggregate_time_series(df):
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

@router.get("/suggestions")
async def suggestions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user)
    df = expenses_to_dataframe(expenses)
    
    if df.empty:
        return {
            "data": [],
            "metadata": {},
            "error": "No data"
        }
    
    df_agg = aggregate_time_series(df)
    engine = InsightsEngine(df, df_agg)
    return engine.get_insights()

@router.get("/forecast")
async def forecast_simple(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user)
    df = expenses_to_dataframe(expenses)
    
    if df.empty:
        return {
            "data": {"forecast": [], "trend": "stable"},
            "metadata": {},
            "error": "No data"
        }
    
    df_agg = aggregate_time_series(df)
    engine = InsightsEngine(df, df_agg)
    return engine.get_forecast(days_ahead=30)

@router.get("/forecast/lstm")
async def forecast_lstm(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user)
    df = expenses_to_dataframe(expenses)
    
    if df.empty:
        return {
            "data": {"forecast": [], "trend": "stable"},
            "metadata": {},
            "error": "No data"
        }
    
    df_agg = aggregate_time_series(df)
    engine = InsightsEngine(df, df_agg)
    return engine.get_forecast(days_ahead=30)

@router.get("/budget/smart")
async def get_smart_budget(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user)
    df = expenses_to_dataframe(expenses)
    
    if df.empty:
        return {
            "data": {"budget": [], "total": 0},
            "metadata": {},
            "error": "No data"
        }
    
    df_agg = aggregate_time_series(df)
    engine = InsightsEngine(df, df_agg)
    
    if month is None or year is None:
        from datetime import datetime
        now = datetime.now()
        month, year = now.month, now.year
    
    return engine.get_current_budgets(month, year)

@router.get("/expenses/anomalies")
async def get_anomalies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user)
    df = expenses_to_dataframe(expenses)
    
    if df.empty:
        return {
            "data": {"alerts": []},
            "metadata": {},
            "error": "No data"
        }
    
    df_agg = aggregate_time_series(df)
    engine = InsightsEngine(df, df_agg)
    return engine.get_anomalies()

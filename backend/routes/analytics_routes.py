from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import User
from middleware import get_current_user
from utils.query_helpers import get_filtered_expenses, expenses_to_dataframe
from services.insights_engine import InsightsEngine
from typing import Optional
import pandas as pd
from datetime import datetime

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

def get_default_context(df: pd.DataFrame) -> dict:
    if df.empty:
        now = datetime.now()
        return {"month": now.month, "year": now.year}
    
    df['_date'] = pd.to_datetime(df['date'])
    df = df.sort_values('_date', ascending=False)
    latest = df.iloc[0]['_date']
    return {"month": latest.month, "year": latest.year}

def aggregate_time_series(df: pd.DataFrame) -> pd.DataFrame:
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

@router.get("/spending")
async def analytics_spending(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user, month, year)
    df = expenses_to_dataframe(expenses)
    
    if df.empty:
        return {
            "data": {"total_monthly": 0, "by_category": [], "comparison": None},
            "metadata": {"month": month, "year": year},
            "error": None
        }
    
    df_agg = aggregate_time_series(df)
    engine = InsightsEngine(df, df_agg)
    
    if month is None or year is None:
        ctx = get_default_context(df)
        month, year = ctx['month'], ctx['year']
    
    return engine.get_current_analytics(month, year)

@router.get("/current")
async def analytics_current(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user, month, year)
    df = expenses_to_dataframe(expenses)
    
    if df.empty:
        return {
            "data": {"total_monthly": 0, "categories": []},
            "metadata": {"month": month, "year": year},
            "error": None
        }
    
    df_agg = aggregate_time_series(df)
    engine = InsightsEngine(df, df_agg)
    
    if month is None or year is None:
        ctx = get_default_context(df)
        month, year = ctx['month'], ctx['year']
    
    return engine.get_current_analytics(month, year)

@router.get("/history")
async def analytics_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user)
    df = expenses_to_dataframe(expenses)
    
    if df.empty:
        return {
            "data": {"monthly_totals": []},
            "metadata": {},
            "error": "No data"
        }
    
    df_agg = aggregate_time_series(df)
    engine = InsightsEngine(df, df_agg)
    return engine.get_history()

@router.get("/category-trends")
async def analytics_category_trends(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user)
    df = expenses_to_dataframe(expenses)
    
    if df.empty:
        return {
            "data": {"periods": [], "series": {}},
            "metadata": {},
            "error": "No data"
        }
    
    df_agg = aggregate_time_series(df)
    engine = InsightsEngine(df, df_agg)
    return engine.get_category_trends()

@router.get("/available-months")
async def available_months(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user)
    df = expenses_to_dataframe(expenses)
    
    if df.empty:
        now = datetime.now()
        return {
            "data": [],
            "metadata": {"default": {"month": now.month, "year": now.year}},
            "error": None
        }
    
    df_agg = aggregate_time_series(df)
    engine = InsightsEngine(df, df_agg)
    
    return {
        "data": engine.get_available_months(),
        "metadata": {"default": engine.get_default_context()},
        "error": None
    }

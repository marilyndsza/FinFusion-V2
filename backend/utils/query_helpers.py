from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, extract
from models import Expense, User, DataMode
from typing import Optional, List
import pandas as pd

DEMO_EMAIL = "demo@example.com"

def get_demo_user_id(db: Session) -> str:
    demo_user = db.query(User).filter(User.email == DEMO_EMAIL).first()
    return demo_user.id if demo_user else None

def get_filtered_expenses(
    db: Session,
    user: User,
    month: Optional[int] = None,
    year: Optional[int] = None,
    category: Optional[str] = None
) -> List[Expense]:
    query = db.query(Expense)
    
    # Apply user/demo filtering based on data_mode
    demo_user_id = get_demo_user_id(db)
    if user.data_mode == DataMode.USER_PLUS_DEMO and demo_user_id:
        query = query.filter(or_(
            Expense.user_id == user.id,
            Expense.user_id == demo_user_id
        ))
    else:
        query = query.filter(Expense.user_id == user.id)
    
    # Apply date filters
    if year is not None:
        query = query.filter(extract('year', Expense.date) == year)
    if month is not None:
        query = query.filter(extract('month', Expense.date) == month)
    
    # Apply category filter
    if category:
        query = query.filter(Expense.category.ilike(category))
    
    return query.all()

def expenses_to_dataframe(expenses: List[Expense]) -> pd.DataFrame:
    if not expenses:
        return pd.DataFrame(columns=['id', 'date', 'amount', 'category', 'description'])
    
    data = [{
        'id': e.id,
        'date': e.date,
        'amount': e.amount,
        'category': e.category,
        'description': e.description,
        'user_id': e.user_id,
        'source': e.source
    } for e in expenses]
    
    df = pd.DataFrame(data)
    df['date'] = pd.to_datetime(df['date'])
    return df

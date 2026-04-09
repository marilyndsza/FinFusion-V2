import logging
from sqlalchemy.orm import Session
from models import User, Expense
from auth import hash_password
from data.loader import DatasetLoader
from database import SessionLocal
from datetime import datetime, timezone
import os

logger = logging.getLogger(__name__)

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo123"
DEMO2_EMAIL = "demo2@example.com"
DEMO2_PASSWORD = "demo123"

def init_demo_data():
    db = SessionLocal()
    try:
        # Check if demo user exists
        demo_user = db.query(User).filter(User.email == DEMO_EMAIL).first()
        
        if demo_user:
            logger.info(f"Demo user already exists: {DEMO_EMAIL}")
        else:
            # Create demo user with dataset
            demo_user = User(
                email=DEMO_EMAIL,
                password_hash=hash_password(DEMO_PASSWORD)
            )
            db.add(demo_user)
            db.commit()
            db.refresh(demo_user)
            logger.info(f"Created demo user: {DEMO_EMAIL}")
            
            # Load CSV dataset
            dataset_path = os.getenv('DATASET_PATH', './data/budgetwise.csv')
            loader = DatasetLoader(dataset_path)
            df_expenses, df_aggregated = loader.load_and_preprocess()
            
            logger.info(f"Loaded {len(df_expenses)} expenses from dataset")
            
            # Insert expenses for demo user
            expenses_to_add = []
            for _, row in df_expenses.iterrows():
                expense = Expense(
                    user_id=demo_user.id,
                    date=row['date'],
                    amount=float(row['amount']),
                    category=row['category'],
                    description=row['description'],
                    source="csv"
                )
                expenses_to_add.append(expense)
            
            db.bulk_save_objects(expenses_to_add)
            db.commit()
            logger.info(f"Inserted {len(expenses_to_add)} demo expenses")
        
        # Check if demo2 user exists (empty user for manual demo/testing)
        demo2_user = db.query(User).filter(User.email == DEMO2_EMAIL).first()
        
        if demo2_user:
            logger.info(f"Demo2 user already exists: {DEMO2_EMAIL}")
        else:
            # Create demo2 user (empty - for manual testing)
            demo2_user = User(
                email=DEMO2_EMAIL,
                password_hash=hash_password(DEMO2_PASSWORD)
            )
            db.add(demo2_user)
            db.commit()
            db.refresh(demo2_user)
            logger.info(f"Created demo2 user (empty): {DEMO2_EMAIL}")

        # Keep the second demo account empty on startup so it is ready for live manual entry.
        deleted_rows = db.query(Expense).filter(Expense.user_id == demo2_user.id).delete()
        db.commit()
        logger.info(f"Reset demo2 user to empty state: removed {deleted_rows} expenses")
        
    except Exception as e:
        logger.error(f"Error initializing demo data: {e}")
        db.rollback()
        raise
    finally:
        db.close()

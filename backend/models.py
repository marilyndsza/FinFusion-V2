from sqlalchemy import Column, String, Float, ForeignKey, DateTime, Enum, Integer
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid
from database import Base
import enum

class DataMode(str, enum.Enum):
    USER_ONLY = "user_only"
    USER_PLUS_DEMO = "user_plus_demo"

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    data_mode = Column(Enum(DataMode), default=DataMode.USER_ONLY)
    
    expenses = relationship("Expense", back_populates="user")
    custom_budget_categories = relationship("CustomBudgetCategory", back_populates="user")

class Expense(Base):
    __tablename__ = "expenses"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(String, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    category = Column(String, nullable=False, index=True)
    description = Column(String, nullable=False)
    source = Column(String, default="user")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    user = relationship("User", back_populates="expenses")


class CustomBudgetCategory(Base):
    __tablename__ = "custom_budget_categories"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    category = Column(String, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    limit = Column(Float, nullable=False, default=0.0)
    icon_emoji = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="custom_budget_categories")

from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models import User, Expense
from middleware import get_current_user
from datetime import datetime, timezone
from utils.query_helpers import get_filtered_expenses, get_demo_user_id
from utils.ocr import scan_receipt

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

class ExpenseCreate(BaseModel):
    amount: float
    category: str
    description: str
    date: str

@router.post("")
async def create_expense(
    expense: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_expense = Expense(
        user_id=current_user.id,
        amount=expense.amount,
        category=expense.category,
        description=expense.description,
        date=expense.date,
        source="user"
    )
    
    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)
    
    return {
        "id": new_expense.id,
        "amount": new_expense.amount,
        "category": new_expense.category,
        "description": new_expense.description,
        "date": new_expense.date,
        "created_at": new_expense.created_at.isoformat()
    }

@router.get("")
async def get_expenses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user)
    
    expense_list = [{
        "id": e.id,
        "amount": e.amount,
        "category": e.category,
        "description": e.description,
        "date": e.date,
        "created_at": e.created_at.isoformat(),
        "is_deletable": e.user_id == current_user.id and e.source != "csv"  # Own expenses (not demo CSV) are deletable
    } for e in expenses]
    
    return {
        "data": expense_list,
        "metadata": {"count": len(expense_list)},
        "error": None
    }

@router.get("/category/{category}")
async def get_expenses_by_category(
    category: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expenses = get_filtered_expenses(db, current_user, category=category)
    
    expense_list = [{
        "id": e.id,
        "amount": e.amount,
        "category": e.category,
        "description": e.description,
        "date": e.date,
        "created_at": e.created_at.isoformat()
    } for e in expenses]
    
    return {
        "data": expense_list,
        "metadata": {"category": category, "count": len(expense_list)},
        "error": None
    }

@router.delete("/{expense_id}")
async def delete_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    # Ensure user owns the expense
    if expense.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Prevent deleting demo dataset (only CSV-sourced expenses)
    if expense.source == "csv":
        raise HTTPException(status_code=403, detail="Cannot delete demo dataset expenses")
    
    db.delete(expense)
    db.commit()
    
    remaining = db.query(Expense).filter(Expense.user_id == current_user.id).count()
    
    return {
        "data": {"deleted": True, "id": expense_id},
        "metadata": {"remaining_count": remaining},
        "error": None
    }

@router.post("/scan-receipt")
async def scan_receipt_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    # Read file
    contents = await file.read()
    
    # Validate file size (5MB limit)
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    
    # Scan receipt
    result = scan_receipt(contents)
    
    return result

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models import User, DataMode
from middleware import get_current_user

router = APIRouter(prefix="/api/user", tags=["user"])

class DataModeRequest(BaseModel):
    mode: DataMode

@router.post("/data-mode")
async def set_data_mode(
    request: DataModeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user.data_mode = request.mode
    db.commit()
    
    return {
        "data": {
            "data_mode": current_user.data_mode
        },
        "metadata": {},
        "error": None
    }

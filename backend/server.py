from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import logging
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize database
from database import init_db
from init_demo import init_demo_data

app = FastAPI(title="FinFusion API", version="3.0.0")

CORS_ORIGINS = [origin.strip() for origin in os.environ.get(
    'CORS_ORIGINS',
    'http://localhost:3000,http://127.0.0.1:3000'
).split(',') if origin.strip()]

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers
from routes.auth_routes import router as auth_router
from routes.user_routes import router as user_router
from routes.expense_routes import router as expense_router
from routes.analytics_routes import router as analytics_router
from routes.insights_routes import router as insights_router

# Include routers
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(expense_router)
app.include_router(analytics_router)
app.include_router(insights_router)

@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("FinFusion API v3.0 Starting...")
    logger.info("=" * 60)
    
    # Initialize database tables
    init_db()
    logger.info("Database initialized")
    
    # Initialize demo data
    init_demo_data()
    logger.info("Demo data initialized")
    
    logger.info("=" * 60)

@app.get("/api/")
async def root():
    return {
        "data": {"message": "FinFusion API v3.0 — Multi-user with persistence"},
        "metadata": {},
        "error": None
    }

@app.get("/api/health")
async def health():
    from database import SessionLocal
    from models import Expense
    
    db = SessionLocal()
    try:
        count = db.query(Expense).count()
        return {
            "data": {
                "ok": True,
                "data_loaded": True,
                "expenses_count": count
            },
            "metadata": {"version": "3.0.0"},
            "error": None
        }
    finally:
        db.close()

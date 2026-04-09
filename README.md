# FinFusion

Personal finance dashboard with a React frontend and FastAPI backend.

## Local Run

### Backend

From `/Users/mel/Desktop/Fin-V2/backend`:

```bash
./venv/bin/python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

Backend health check:

```bash
curl http://127.0.0.1:8000/api/health
```

### Frontend

From `/Users/mel/Desktop/Fin-V2/frontend`:

```bash
npm install
npm start
```

The frontend expects the backend at `http://127.0.0.1:8000` by default.

## Demo Login

```text
demo@example.com
demo123
```

## Production Build

From `/Users/mel/Desktop/Fin-V2/frontend`:

```bash
npm run build
```

The compiled frontend is written to `/Users/mel/Desktop/Fin-V2/frontend/build`.

## Public Deploy

Recommended free setup:

- Frontend: Vercel
- Backend: Render

### Frontend on Vercel

1. Import the repo into Vercel.
2. Set the project root to `/frontend`.
3. Set the build command to:

```bash
npm run build
```

4. Set the output directory to:

```bash
build
```

5. Add this environment variable:

```bash
REACT_APP_BACKEND_URL=https://YOUR-BACKEND.onrender.com
```

The SPA rewrite config is already included in `/Users/mel/Desktop/Fin-V2/frontend/vercel.json`.

### Backend on Render

1. Create a new Web Service in Render.
2. Connect this repo.
3. Choose `Docker` as the runtime.
4. Use `/Users/mel/Desktop/Fin-V2/backend/Dockerfile`.
5. Set these environment variables:

```bash
CORS_ORIGINS=https://YOUR-FRONTEND.vercel.app
JWT_SECRET_KEY=replace-this-with-a-long-random-secret
```

Optional for persistent hosted data:

```bash
DATABASE_URL=postgresql+psycopg://...
```

If `DATABASE_URL` is not set, the backend falls back to SQLite.

The backend Docker image includes `tesseract-ocr`, so receipt scanning can work in production.

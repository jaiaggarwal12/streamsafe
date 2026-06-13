# StreamSafe — Real-time Video Support Platform

> A production-grade, self-hosted video calling infrastructure for enterprise support teams. Optimized for issue resolution through media-aware adaptive bitrate (ABR), session replay, and agent performance analytics.

## Architecture

```
Browser (React) ──WebRTC──► FastAPI + WebSocket ──► PostgreSQL
                                   │                    Redis
                                   └──► ABR Engine (ML)
```

**Tech Stack**
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind |
| Backend | FastAPI + Uvicorn (async) |
| WebRTC Signaling | WebSocket relay via FastAPI |
| Database | PostgreSQL (async via asyncpg) |
| Cache / Pub-Sub | Redis |
| ML / ABR | XGBoost + scikit-learn |
| Observability | Prometheus metrics endpoint |

---

## 🚀 Deploy to Render + Vercel (free tier)

### Step 1: Deploy Backend to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add a **PostgreSQL** database on Render (free tier)
6. Add a **Redis** instance on Render (free tier)
7. Link them to your web service (Render auto-sets `DATABASE_URL` and `REDIS_URL`)
8. Add environment variable:
   - `SECRET_KEY` → any long random string (32+ chars)
   - `ALLOWED_ORIGINS` → `*` (or your Vercel URL once deployed)

Alternatively, use the **render.yaml** file in this repo for one-click deployment.

### Step 2: Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repo
3. Configure:
   - **Framework**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add environment variables:
   - `VITE_API_URL` → `https://your-render-service.onrender.com`
   - `VITE_WS_URL` → `wss://your-render-service.onrender.com`
5. Deploy!

---

## 💻 Local Development

### Prerequisites
- Docker + Docker Compose
- Node.js 20+
- Python 3.12+

### Quick Start (Docker Compose)
```bash
# Start all services (PostgreSQL, Redis, backend, frontend)
docker-compose up

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Manual Setup

**Backend:**
```bash
cd backend
cp .env.example .env
# Edit .env with your database/redis URLs

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
cp .env.example .env
# Edit VITE_API_URL to point to your backend

npm install
npm run dev
# Opens at http://localhost:3000
```

---

## 📖 Usage

### Agent Flow
1. Register at `/register` or login at `/login`
2. Click **New Session** on the dashboard
3. Copy the invite link and send it to your customer
4. Click **Start** to enter the video call
5. Use the call controls: mute, video, screen share, record
6. End the call and mark whether the issue was resolved

### Customer Flow
1. Open the invite link (no account needed)
2. Enter your name and click **Join Call**
3. Allow camera/microphone permissions
4. Chat and video call with the support agent

---

## 🔌 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new agent |
| `/api/auth/login` | POST | Login, get JWT token |
| `/api/auth/me` | GET | Get current agent |
| `/api/sessions` | POST | Create session |
| `/api/sessions` | GET | List agent's sessions |
| `/api/sessions/{id}` | GET | Get session details |
| `/api/sessions/{id}/end` | POST | End session |
| `/api/sessions/{id}/agent-join` | POST | Agent joins session |
| `/api/sessions/join` | POST | Customer joins via token |
| `/api/sessions/{id}/start-recording` | POST | Start recording |
| `/api/sessions/{id}/stop-recording` | POST | Stop recording |
| `/api/sessions/{id}/chat` | GET/POST | Chat history/send |
| `/api/analytics/me` | GET | My performance stats |
| `/api/analytics/system` | GET | System-wide stats |
| `/api/analytics/leaderboard` | GET | Agent leaderboard |
| `/api/abr/recommend` | POST | Get bitrate recommendation |
| `/ws/{session_id}?token=...` | WebSocket | Real-time signaling |
| `/metrics` | GET | Prometheus metrics |
| `/health` | GET | Health check |
| `/docs` | GET | Swagger UI |

---

## 🧠 Adaptive Bitrate (ABR) System

Three-layer approach:
1. **Heuristic** (Layer 1): Rule-based fallback, always available
2. **XGBoost ML** (Layer 2): Trained on call outcome labels (resolved vs. unresolved)
3. **Reactive Feedback** (Layer 3): Real-time adjustment based on actual vs. predicted throughput

---

## 📊 Observability

- **Prometheus metrics**: `GET /metrics`
- **Health check**: `GET /health`
- **Structured JSON logging** via structlog
- Key metrics: `active_sessions`, `join_latency_seconds`, `api_request_duration_seconds`, `api_errors_total`

---

## 🏗️ Project Structure

```
streamsafe/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, middleware, lifespan
│   │   ├── config.py        # Settings via pydantic-settings
│   │   ├── models.py        # SQLAlchemy ORM models
│   │   ├── schemas.py       # Pydantic request/response models
│   │   ├── auth.py          # JWT auth, password hashing
│   │   ├── database.py      # Async DB setup
│   │   ├── redis_client.py  # Session cache, rate limiter
│   │   ├── abr.py           # ABR engine (heuristic + ML)
│   │   ├── metrics.py       # Prometheus counters/histograms
│   │   ├── websocket_manager.py  # WS connection manager
│   │   └── routers/
│   │       ├── auth.py      # /api/auth/*
│   │       ├── sessions.py  # /api/sessions/*
│   │       ├── chat.py      # /api/sessions/{id}/chat
│   │       ├── analytics.py # /api/analytics/*
│   │       ├── abr.py       # /api/abr/*
│   │       └── websocket.py # /ws/{session_id}
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Routes
│   │   ├── api.ts           # Axios client + API methods
│   │   ├── store.ts         # Zustand state (auth + call)
│   │   ├── hooks/
│   │   │   └── useWebRTC.ts # WebRTC + WebSocket hook
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── CallPage.tsx     # Agent video call UI
│   │   │   ├── JoinPage.tsx     # Customer join UI
│   │   │   └── AnalyticsPage.tsx
│   │   └── components/
│   │       └── Layout.tsx
│   ├── package.json
│   ├── vite.config.ts
│   ├── vercel.json
│   └── .env.example
│
├── docker-compose.yml
├── render.yaml
└── README.md
```

---

## 🔐 Security Notes

- All agent routes require JWT Bearer token
- Customer join uses time-limited signed invite tokens (HMAC)
- CORS configured via `ALLOWED_ORIGINS` env var
- Passwords hashed with bcrypt
- Rate limiting on chat (Redis token bucket)
- Row-level: agents can only see their own sessions

---

## 📜 License

MIT

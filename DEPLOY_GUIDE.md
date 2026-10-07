# 🚀 Complete Deployment Guide: Vercel & Render

This guide explains how to deploy the **Legion Insulator Ultrasonic Testing Dashboard** to **Vercel** (Frontend) and **Render** (Backend & Database).

---

## 🏗️ Architecture Overview

- **Frontend**: React 18 + Vite SPA → Deployed on **Vercel** (or Render Static Site)
- **Backend**: Node.js + Express REST API → Deployed on **Render** (Web Service)
- **Database**: PostgreSQL (Supabase / Render PostgreSQL / Neon / AWS RDS)

---

## 1️⃣ Deploying the Backend to Render

### Option A: Render Web Service (Recommended)

1. **Create a Free Account** on [Render.com](https://render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub / GitLab repository.
4. Configure the service settings:
   - **Name**: `legion-backend`
   - **Region**: Closest to your database (e.g., *Singapore* or *Frankfurt*)
   - **Root Directory**:
     - If repository root is `Legion-no-subscription-login-fixed`: enter `backend`
     - If repository root contains the folder: enter `Legion-no-subscription-login-fixed/backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` (or Starter for 24/7 zero-spin-down)
   - **Health Check Path**: `/health`

5. Add **Environment Variables** in Render:
   | Key | Example Value | Description |
   |---|---|---|
   | `NODE_ENV` | `production` | Production mode |
   | `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` | Your PostgreSQL connection string (Supabase) |
   | `DATABASE_SSL` | `true` | Required for cloud databases (Supabase, Neon) |
   | `JWT_SECRET` | `your-secure-random-64-character-jwt-key` | Secret key for JWT signing |
   | `ADMIN_USERNAME` | `Aman` | Default Administrator username |
   | `ADMIN_PASSWORD` | `7546854486` | Administrator password |
   | `SUPERADMIN_USERNAME` | `superadmin` | Super Administrator username |
   | `SUPERADMIN_PASSWORD` | `SuperAdmin@Legion2026!` | Super Administrator password |
   | `FRONTEND_URL` | `https://your-frontend.vercel.app` | Allowed CORS frontend URL (or `*`) |
   | `MAX_ACTIVE_SESSIONS` | `1` | Max active sessions per user account |

6. Click **Deploy Web Service**.
7. Once deployed, Render will provide your backend URL:
   `https://legion-backend.onrender.com`

---

## 2️⃣ Deploying the Frontend to Vercel

1. **Sign in** to [Vercel.com](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Import your GitHub repository.
4. In the **Configure Project** screen:
   - **Project Name**: `legion-dashboard`
   - **Framework Preset**: `Vite`
   - **Root Directory**:
     - Click **Edit** next to Root Directory.
     - Select `frontend` (or `Legion-no-subscription-login-fixed/frontend` if deploying parent repo).
   - **Build Command**: `npm run build` (automatic)
   - **Output Directory**: `dist` (automatic)
5. Under **Environment Variables**, add:
   | Key | Value | Note |
   |---|---|---|
   | `VITE_API_URL` | `https://legion-backend.onrender.com/api` | Your Render backend URL + `/api` |

   > **Note**: The app includes automatic normalization. Even if you input `https://legion-backend.onrender.com` without `/api` or with a trailing slash, the code automatically formats it correctly!

6. Click **Deploy**.
7. Vercel will build and assign a domain:
   `https://legion-dashboard.vercel.app`

8. **Important Step**:
   Return to your Render backend web service settings, edit `FRONTEND_URL`, and add your Vercel URL:
   `FRONTEND_URL=https://legion-dashboard.vercel.app,http://localhost:5173`
   (The backend automatically allows all `*.vercel.app` domains by default as well).

---

## 3️⃣ Deploying Everything on Render (Blueprint / render.yaml)

If you prefer hosting **both** frontend and backend on Render:

1. Click **New +** → **Blueprint** on Render.
2. Select your repository. Render will automatically read `render.yaml`.
3. Provide the required secrets (`DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, `SUPERADMIN_PASSWORD`).
4. Click **Apply**. Both backend and static frontend will be created simultaneously.

---

## 🔍 Verification & Health Check

1. Open your Vercel frontend URL in the browser.
2. Check the top header:
   - 🟢 **API Online (<100ms)** indicates the frontend is connected to the backend.
   - If Render free tier was idle, it may briefly display **API Offline / Waking Server...** for ~30 seconds while the free instance boots up.
3. Sign in using the Admin or Super Admin credentials.
4. Try logging a test inspection record in the **New Inspection** tab.
5. In the **Records Explorer** tab, verify the record appears and test **Export to CSV**.
6. (If Super Admin) Check the **User Management** tab to manage accounts, reset passwords, or suspend users.

---

## 🛠️ Common Issues & Solutions

| Issue | Cause | Fix |
|---|---|---|
| **CORS error in browser console** | `FRONTEND_URL` on Render doesn't match Vercel URL | Set `FRONTEND_URL=https://your-domain.vercel.app` on Render backend, or set `FRONTEND_URL=*`. |
| **404 Not Found on API requests** | `VITE_API_URL` missing or incorrect | Ensure `VITE_API_URL` points to your Render backend (e.g. `https://legion-backend.onrender.com/api`). Redeploy frontend after changing env vars. |
| **Database connection error (ECONNREFUSED / SSL)** | Missing SSL or wrong connection string | Set `DATABASE_SSL=true` on Render. Verify Supabase pooler URL is using port 5432 or 6543. |
| **Render spin-down delay (30-50s)** | Free instances sleep after 15 min of inactivity | Normal on Render free tier. Use a free uptime monitor (e.g. UptimeRobot or Cron) to ping `https://your-backend.onrender.com/health` every 10 minutes to keep it warm. |

# Deploying the Legion frontend on Vercel

1. Push the project to GitHub (never commit `backend/.env`).
2. In Vercel: **Add New → Project**, import the repo, and set **Root Directory** to `frontend`.
   Framework preset: **Vite** (build `npm run build`, output `dist` – already set in `vercel.json`).
3. Add an environment variable in Vercel:
   `VITE_API_URL = https://<your-backend-host>/api`
4. On the backend host, set `FRONTEND_URL` to your Vercel URL (comma-separate multiple):
   `FRONTEND_URL=http://localhost:5173,https://your-app.vercel.app`
5. Redeploy. The frontend is static; the Express/PostgreSQL backend must be hosted separately
   (Render, Railway, Fly.io, a VPS, etc.).

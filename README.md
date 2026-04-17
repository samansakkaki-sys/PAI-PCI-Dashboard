# PAI Dashboard Deployment

This project has:

- A FastAPI backend in the repository root
- A React/Vite frontend in [`frontend`](C:\Users\ASUS\Desktop\pai-dashboard\frontend)

## Environment variables

Backend:

- `HISTORY_API_URL`: private Apps Script history endpoint
- `CORS_ALLOW_ORIGINS`: comma-separated allowed frontend origins

Frontend:

- `VITE_API_BASE_URL`: public backend base URL, for example `https://your-backend-name.onrender.com`

Do not commit real `.env` files or private URLs.

## Local development

Backend:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:HISTORY_API_URL="https://example.com/history"
$env:CORS_ALLOW_ORIGINS="http://localhost:5173"
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
$env:VITE_API_BASE_URL="http://127.0.0.1:8000"
npm run dev
```

## Deploy backend on Render

1. Create a new Web Service from this repository.
2. Leave the service root as the repository root.
3. Render can use [`render.yaml`](C:\Users\ASUS\Desktop\pai-dashboard\render.yaml), or set these values manually:
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables in Render:
   - `HISTORY_API_URL` = your private Apps Script URL
   - `CORS_ALLOW_ORIGINS` = your Vercel frontend origin, for example `https://your-frontend-name.vercel.app`
5. Deploy and confirm:
   - `/health` returns `{"status":"ok"}`
   - `/docs` loads

## Deploy frontend on Vercel

1. Create a new Vercel project from the same repository.
2. Set the project Root Directory to `frontend`.
3. Framework preset should be `Vite`.
4. Add environment variable:
   - `VITE_API_BASE_URL` = your Render backend URL, for example `https://your-backend-name.onrender.com`
5. Deploy.

After Vercel gives you the final frontend URL, update Render `CORS_ALLOW_ORIGINS` to that exact origin if needed, then redeploy the backend.

## Notes

- `VITE_API_BASE_URL` is public by design because Vite injects it into the frontend bundle.
- `HISTORY_API_URL` stays server-side only and must be configured only in Render or local backend env.
- The backend now refuses to start if `HISTORY_API_URL` is missing.

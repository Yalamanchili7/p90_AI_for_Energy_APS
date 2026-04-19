# Deploying the P90 frontend to Vercel

This guide walks through a 15-minute deploy of the Next.js dashboard to Vercel,
serving pre-computed forecast data (no live backend needed).

## Prerequisites

- Your backend running locally on `http://localhost:8001` (for the snapshot step)
- A Vercel account — sign up free at https://vercel.com/signup
- Your repo pushed to GitHub

## Step 1 — Generate the static demo data

With your backend running locally:

```bash
cd /Users/sundeepyalamanchili/Documents/Projects/p90/backend
source venv/bin/activate
export P90_ROOT=/Users/sundeepyalamanchili/Documents/Projects/p90
pip install requests  # if not already installed
python scripts/generate_demo_data.py
```

Expected output:

```
✅ Backend healthy: {...}

→ /topology
  ✅ 37 buses, 40 edges

→ /samples?limit=20
  ✅ 20 samples

→ /metrics
  ✅ metrics snapshot

→ /forecast × 8 samples × 5 scenarios
  ... (progress) ...

✅ Generated demo data in .../frontend/public/demo-data
   Total size: ~800 KB
```

This writes 4 JSON files to `frontend/public/demo-data/`:

- `topology.json` (~10 KB) — buses + edges + coordinates
- `samples.json` (~3 KB) — 20 forecast-start times
- `metrics.json` (~2 KB) — model performance numbers
- `scenarios.json` (~780 KB) — 8 samples × 5 scenarios × 37 buses × 24 h

## Step 2 — Test locally in demo mode

Before pushing to Vercel, verify the frontend works with static data only:

```bash
cd /Users/sundeepyalamanchili/Documents/Projects/p90/frontend

# Stop your backend if it's running (so we test the fallback path)
# Then visit http://localhost:3001/dashboard
npm run dev
```

You should see:
- An amber "Demo mode" banner at the top
- The dashboard renders the same as before
- Sliders snap to the nearest pre-computed scenario

## Step 3 — Commit the demo data

```bash
cd /Users/sundeepyalamanchili/Documents/Projects/p90

# The demo data is intentionally committed to the repo so Vercel can serve it
git add frontend/public/demo-data/
git add frontend/src/lib/api.ts
git add frontend/src/components/demo-banner.tsx
git add frontend/src/app/layout.tsx
git add backend/scripts/generate_demo_data.py
git add docs/DEPLOY_VERCEL.md

git commit -m "Add static demo data + demo-mode fallback for Vercel deploy"
git push
```

## Step 4 — Deploy on Vercel

1. Visit https://vercel.com/new
2. Click **"Import Git Repository"** and select
   `Yalamanchili7/p90_AI_for_Energy_APS`
3. Vercel will detect Next.js. Important settings:
   - **Root Directory:** `frontend` (click "Edit" next to Root Directory)
   - **Framework Preset:** Next.js (auto-detected)
   - **Build Command:** leave default (`next build`)
   - **Output Directory:** leave default (`.next`)
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_DEMO_MODE` = `true`
5. Click **"Deploy"**

Wait ~2 minutes for the build. You'll get a URL like:

```
https://p90-ai-for-energy-aps.vercel.app
```

## Step 5 — Verify

Open the Vercel URL and check:

- `/` — landing page renders
- `/dashboard` — map, timeline, sliders all work
- `/methodology` — all sections render
- Amber "Demo mode" banner visible at the top

## Updating the deployed site

Any push to `main` auto-redeploys. To refresh the demo data:

```bash
# Regenerate snapshot
cd backend && python scripts/generate_demo_data.py

# Commit and push — Vercel rebuilds
cd ..
git add frontend/public/demo-data/
git commit -m "Refresh demo data"
git push
```

## Custom domain (optional)

In Vercel dashboard:
1. Go to your project → **Settings** → **Domains**
2. Add a domain you own, or use the free `*.vercel.app` subdomain

## Troubleshooting

**Build fails with "Module not found: Can't resolve 'react-plotly.js'"**
→ Vercel may have cached a stale `node_modules`. Trigger a fresh build:
Settings → General → scroll to "Advanced" → Clear Build Cache → Redeploy.

**Dashboard shows "Error loading data"**
→ `NEXT_PUBLIC_DEMO_MODE` isn't set. Check environment variables in
Vercel project settings, add it, then redeploy.

**Demo banner not showing**
→ Make sure the environment variable name is exactly `NEXT_PUBLIC_DEMO_MODE`
(the `NEXT_PUBLIC_` prefix is required for Next.js to expose it to the browser).

**Map tiles don't load**
→ Carto tiles sometimes fail from certain regions. The map will still render
markers on a gray background. For production, swap to OpenStreetMap default
tiles in `arizona-map-inner.tsx`.

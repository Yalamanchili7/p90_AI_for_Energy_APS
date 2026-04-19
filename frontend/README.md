# P90 Frontend

Next.js 14 (App Router) + TypeScript + Tailwind + Plotly. Modern SaaS aesthetic.

## Prerequisites

- Node.js 20 (LTS)
- The backend from `../backend` running at `http://localhost:8000`

## Setup

```bash
cd frontend
npm install
```

## Run

```bash
npm run dev
```

Open http://localhost:3000 — the landing page should render immediately. The
dashboard and methodology pages are scaffolded placeholders until Phase 2.

## Configure API base

By default the frontend points at `http://localhost:8000`. To override:

```bash
echo 'NEXT_PUBLIC_API_BASE_URL=https://your-backend.onrender.com' > .env.local
```

## Structure

```
src/
├── app/
│   ├── layout.tsx          # root layout + nav
│   ├── page.tsx            # landing
│   ├── dashboard/page.tsx  # operator dashboard (Phase 2)
│   ├── methodology/page.tsx
│   └── globals.css
├── components/
│   └── nav.tsx
└── lib/
    ├── api.ts              # typed API client
    └── utils.ts            # cn() + formatters
```

# LegalOps — Nigerian Legal Operations Management Platform

A modern, full-featured frontend for managing legal operations, built with Next.js 16, TypeScript, Tailwind CSS 4, and shadcn/ui. Designed specifically for Nigerian law firms and legal departments.

## Features

### Core Modules
- **Dashboard** — Real-time stats, activity timeline, overdue tasks, quick actions
- **Matter Management** — Create, track, and manage legal matters (litigation, compliance, advisory, drafting, transactional)
- **Client Management** — Individual and corporate client profiles with Nigerian context (RC numbers, CAC details)
- **Task Management** — Jira-like Kanban board with drag-and-drop, filters by matter/assignee/priority
- **Document Management** — Upload, version, and track legal documents
- **Email Integration** — Linked matter email threads
- **Reports** — Generate matter summaries, task summaries, revenue reports

### Admin Portal
- **Team Management** — Invite users, assign roles (Admin, Member, Viewer)
- **Google Workspace Integrations** — Connect Google Drive, Gmail, Calendar
- **Billing** — Paystack-powered subscription management
- **Organisation Settings** — Firm profile, RC number, plan management

### Technical Features
- **JWT Authentication** — Login, register, token refresh, session persistence
- **Dark/Light Theme** — Professional emerald green legal aesthetic
- **Responsive Design** — Mobile-first with collapsible sidebar
- **Hash-based SPA Routing** — Smooth client-side navigation
- **Demo Mode** — Full mock data for development without a backend

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 16 (App Router) | React framework |
| TypeScript | Type safety |
| Tailwind CSS 4 | Styling |
| shadcn/ui | UI component library |
| Radix UI | Accessible primitives |
| Zustand | State management |
| @dnd-kit | Drag-and-drop (Kanban) |
| Lucide React | Icons |
| Recharts | Charts & visualizations |
| date-fns | Date formatting |
| React Hook Form + Zod | Form validation |
| Sonner | Toast notifications |

## Prerequisites

- **Node.js** >= 18.17
- **npm** >= 9 or **yarn** >= 1.22 or **pnpm** >= 8
- **Backend API**: The [lawsuite](https://github.com/ataiksdev/lawsuite) FastAPI backend running (or use demo mode)

## Quick Start

### 1. Install Dependencies

```bash
cd lawsuite-frontend
npm install
```

### 2. Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and set your backend URL:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production

```bash
npm run build
npm start
```

## Connecting to Your Backend

The frontend connects to the lawsuite FastAPI backend. The API client (`src/lib/api-client.ts`) is pre-configured to:

- Send JWT tokens in the `Authorization: Bearer` header
- Automatically refresh expired tokens via `/auth/refresh`
- Handle 401/403/404/422/500 error responses
- Support file uploads via `FormData`

### Backend Endpoints Used

| Module | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh`, `GET /auth/me` |
| Clients | `GET/POST /clients`, `GET/PATCH/DELETE /clients/{id}` |
| Matters | `GET/POST /matters`, `GET/PATCH/DELETE /matters/{id}` |
| Tasks | `GET/POST /tasks`, `GET/PATCH/DELETE /tasks/{id}` |
| Documents | `GET/POST /documents`, `GET/PATCH/DELETE /documents/{id}`, `POST /documents/{id}/upload` |
| Reports | `GET/POST /reports` |
| Users | `GET /users`, `POST /users/invite`, `PATCH /users/{id}` |
| Organisations | `GET/PATCH /organisations/me` |
| Activity | `GET /activity` |
| Billing | `GET /billing`, `POST /billing/checkout` |

### CORS Configuration

Make sure your FastAPI backend has CORS configured to allow your frontend origin:

```python
# In your FastAPI main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Project Structure

```
lawsuite-frontend/
├── public/
│   ├── logo.svg
│   └── robots.txt
├── src/
│   ├── app/
│   │   ├── globals.css          # Tailwind + custom theme (emerald green)
│   │   ├── layout.tsx           # Root layout with ThemeProvider
│   │   └── page.tsx             # SPA shell & router
│   ├── components/
│   │   ├── layout/
│   │   │   └── app-shell.tsx    # Sidebar + header + content shell
│   │   ├── pages/
│   │   │   ├── auth/            # Login, Register, Forgot Password, Accept Invite
│   │   │   ├── dashboard/       # Dashboard with stats & timeline
│   │   │   ├── clients/         # Client list, form, detail
│   │   │   ├── matters/         # Matter list, form, detail + sub-components
│   │   │   ├── tasks/           # Kanban board (drag-and-drop)
│   │   │   ├── reports/         # Report generator
│   │   │   ├── admin/           # Team, Integrations, Billing, Settings
│   │   │   └── settings/        # User preferences
│   │   └── ui/                  # shadcn/ui components (50+)
│   ├── hooks/
│   │   ├── use-toast.ts
│   │   └── use-mobile.ts
│   └── lib/
│       ├── api-client.ts        # Fetch wrapper with JWT auth & refresh
│       ├── auth-store.ts        # Zustand auth state
│       ├── mock-data.ts         # Demo data (Nigerian legal context)
│       ├── router.ts            # Hash-based SPA router
│       ├── types.ts             # TypeScript types matching backend schemas
│       └── utils.ts             # cn() utility
├── .env.local.example
├── .gitignore
├── components.json              # shadcn/ui config
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## Demo Mode

The app includes comprehensive mock data for Nigerian legal operations (Zenith Bank, Dangote Group, MTN Nigeria, etc.). To test without a backend:

1. Start the dev server: `npm run dev`
2. The login page shows a "Try Demo" button
3. Click it to explore the full app with mock data

The mock data includes:
- 8 users (admins, members, viewers)
- 8 clients (corporate & individual)
- 12 matters across all types (litigation, compliance, advisory, drafting, transactional)
- 22 tasks in various states
- 12 documents
- 12 activity log entries
- Email threads, notifications, integrations, billing info

## Customization

### Theme Colors
Edit `src/app/globals.css` to change the color scheme. The default uses an emerald green professional legal aesthetic with light and dark variants.

### Adding shadcn/ui Components
```bash
npx shadcn@latest add <component-name>
```

### API Endpoints
Extend `src/lib/api-client.ts` with new methods as you add backend endpoints.

## Deployment

### Vercel (Recommended)
```bash
npx vercel
```

### Docker
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

### Static Export
Add `output: "export"` to `next.config.ts` (note: this disables server-side features).

## License

Private — All rights reserved.

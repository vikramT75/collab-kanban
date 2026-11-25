# Collaborative Kanban Board

[![CI](https://github.com/vikramT75/collab-kanban/actions/workflows/ci.yml/badge.svg)](https://github.com/vikramT75/collab-kanban/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-353535?style=flat&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)

A real-time collaborative Kanban board built with React, TypeScript, Node.js (Express), and PostgreSQL.

- **Live Demo:** https://tinyurl.com/kanban-vik-board
- **Repository:** https://github.com/vikramT75/collab-kanban

---

## 1. How to Install and Run

### Option A: Docker Compose (Recommended)

```bash
git clone https://github.com/vikramT75/collab-kanban.git
cd collab-kanban
cp .env.example .env
docker compose up --build
```

- **App (Nginx):** http://localhost:3000
- **API:** http://localhost:4000
- **PostgreSQL:** `localhost:5432`

*(For production behind Caddy with TLS, use `docker compose -f docker-compose.prod.yml up -d --build` after setting `POSTGRES_PASSWORD` and `APP_DOMAIN` in `.env`.)*

### Option B: Native Local Development

**Prerequisites:** Node.js 22+ and PostgreSQL 16 (or Docker for Postgres only).

```bash
# 1. Start PostgreSQL
docker compose up postgres -d

# 2. Backend (Terminal 1) — runs migrations + 10-task seed automatically on boot
cd server
cp ../.env.example .env
npm install
npm run dev

# 3. Frontend (Terminal 2) — proxies /api/* to http://localhost:4000
cd client
npm install
npm run dev
```

Open http://localhost:5173.

### Running Checks & Tests

```bash
# Server (typecheck + mocked API/route unit tests)
(cd server && npm run typecheck && npm test)

# Server PostgreSQL + SSE integration tests (requires running Postgres)
(cd server && DATABASE_URL=postgres://kanban:devpassword@localhost:5432/kanban npm run test:integration)

# Client (typecheck + Vite build + store/positioning tests)
(cd client && npm run typecheck && npm run build && npm test)
```

---

## 2. What Is Complete and What Is Not

### Complete
- **4-Column Kanban Board:** `Backlog`, `Todo`, `In Progress`, `Done` fetched via `GET /api/board` with automatic PostgreSQL schema migration and idempotent seed data.
- **Task CRUD & Details Drawer:** Create tasks via `+ New Task` or per-column `+`; click any card to open the slide-over detail drawer to inspect `updatedAt` and edit `title`, `description`, `priority`, `assignee`, and `status`, or delete with confirmation.
- **Drag and Drop:** Smooth cross-column moves and intra-column reordering via `@dnd-kit`, persisted via `PATCH /api/tasks/:id` using `DOUBLE PRECISION` fractional positioning (`1000`, `2000`, midpoint calculation) and automatic column rebalancing when gaps drop below `0.001`.
- **Combined Search, Filters & URL Sync:** Title search (`?q=`), priority filter (`?priority=`), and assignee filter (`?assignee=`) work together, update URL query parameters, and restore on reload or browser navigation.
- **Optimistic Updates & Rollback:** Instant UI updates for creates, edits, drags, and deletes, with rollback and error toasts on API failure. Includes a **`Test API fail`** header toggle (`X-Simulate-Error: true` → `503`) and `FAILURE_RATE` server env var for testing failure handling.
- **Real-Time Collaboration (`GET /api/events`):** Server-Sent Events (SSE) backed by PostgreSQL `LISTEN`/`NOTIFY` with 25s heartbeats, automatic reconnect, and silent board resync.
- **CI/CD & Deployment:** Dockerfiles, Compose setup, GitHub Actions CI (`typecheck`, unit tests, live Postgres 16 + SSE integration tests, Docker Compose smoke tests), and automated EC2 deployment.

### Not Complete / Out of Scope
- **Authentication & User Accounts:** The board is intentionally unauthenticated so reviewers can test multi-tab collaboration and the `/api/*` endpoints immediately without a login wall. Production use would add `HttpOnly` cookie sessions (so `EventSource` authenticates natively).
- **Live Presence / Editing Indicators:** No "User X is editing" cursors or active-viewer avatars.
- **Headless Browser E2E in CI:** CI runs unit, real Postgres/SSE integration, and Docker Compose HTTP/SSE smoke tests rather than Playwright browser tests.
- **Pagination / Archiving:** Loads the full board in one `GET /api/board` payload; very large boards would need column pagination or archiving.

---

## 3. How Optimistic Updates and Rollback Work

Instead of snapshotting and restoring whole-board copies, the Zustand store (`client/src/store/useBoardStore.ts`) separates state into two layers:

1. **`confirmedTasks`:** Authoritative state confirmed by API responses and SSE events.
2. **`pendingMutations`:** Per-task queue of in-flight optimistic operations (`create`, field-level `update` patches, `delete`).

**Flow:**
- **On action (drag, create, drawer save, delete):** A mutation entry is pushed to `pendingMutations`. `selectEffectiveTasks` derives the UI view by overlaying pending patches on top of `confirmedTasks`, updating the board immediately while showing a syncing spinner on the card.
- **On API success:** `confirmedTasks` is updated from the server response (with `X-Task-Version` on creates/updates, or removing the task on delete), and the completed mutation is cleared from `pendingMutations`.
- **On API failure (`503` / network error):** Only that failed `mutationId` is dropped from `pendingMutations` and an error toast (`sonner`) is displayed. Because `confirmedTasks` keeps receiving remote SSE updates while a local mutation is in flight, rolling back a failed drag reverts **only** the failed local fields without overwriting another user's concurrent edits.

**To test rollback in the UI:** Click **`Test API fail`** in the header (switches to **`Testing API failure`**), then drag or edit a card — it moves immediately, receives HTTP `503 (simulated server error)`, snaps back cleanly, and shows an error toast.

---

## 4. How Real-Time Events Work Without Overwriting Local Changes

Every `POST`, `PATCH`, and `DELETE` commits inside a PostgreSQL transaction and emits `pg_notify('kanban_events', ...)` (`server/src/services/taskService.ts`). A dedicated, auto-reconnecting `LISTEN` client in `server/src/services/sseHub.ts` fans events out to connected `GET /api/events` SSE streams (with unbuffered Nginx/Caddy settings and silent full-board resync on reconnect).

Four guardrails prevent real-time events from clobbering local work:

1. **Echo Suppression (`X-Client-Id`):** Each browser tab generates a `sessionStorage` UUID. Mutations send `X-Client-Id`, which the server attaches as `originClientId` on SSE events; `applySSEEvent` ignores events originating from the same tab.
2. **Version Monotonicity (`version` + `updatedAt`):** Each DB update increments `version` (exposed in SSE payloads and `X-Task-Version` headers without altering the REST `Task` JSON shape). Out-of-order stale SSE events (`incoming.version <= current.version`) are ignored.
3. **Field-Level Overlay & Active Drag Lock (`dragFreeze`):** Incoming SSE events update `confirmedTasks`, while `pendingMutations` only masks the specific fields currently in flight locally. During an active drag (`activeDragTaskId`), `dragFreeze` pins the dragged card's visual `status` and `position` until drop so `@dnd-kit` never jumps under the pointer while remote metadata updates still apply.
4. **Open Detail Drawer Protection (`dirtyFields`):** `TaskDrawer` tracks which fields the user has modified locally. When a remote `task:updated` arrives for the open task, **clean fields** auto-update seamlessly, whereas **dirty fields** that changed remotely are preserved and trigger a non-blocking conflict banner (**Accept latest** / **Keep my edits**). If the open task is deleted remotely, a deletion banner appears with Save/Delete disabled while keeping the user's draft readable.

---

## 5. Coding Agents Used

**Antigravity** (powered by **Claude Sonnet 4.6** and **Gemini**) was used selectively during development:

- **Frontend Implementation:** Built out most of the React and Tailwind CSS UI, including the Kanban board layout, `@dnd-kit` drag-and-drop wiring, task detail drawer interactions, and responsive styling.
- **Backend Debugging:** Assisted with troubleshooting backend edge cases, including PostgreSQL `LISTEN`/`NOTIFY` reconnect handling, SSE event ordering around column rebalancing, and integration test fixes.
- **Review & Verification:** All agent-assisted code and fixes were reviewed and verified manually.

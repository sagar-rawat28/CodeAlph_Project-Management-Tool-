# ProjectFlow — Collaborative Project Management Tool

A production-style full-stack collaborative project management platform inspired by Trello & Asana.

## Features

- **Authentication**: Register / Login with JWT, password hashing (bcrypt)
- **Projects**: Create projects, invite members, roles (OWNER / ADMIN / MEMBER)
- **Kanban Boards**: Default columns (Backlog → Completed), create tasks, drag-and-drop between columns
- **Tasks**: Title, description, priority (LOW/MEDIUM/HIGH/URGENT), assignee, due date, comments
- **Real-time**: Socket.IO for live task moves, new tasks, comments, notifications
- **Authorization**: Project membership required; role-based actions
- **Notifications**: Task assignment, comments, member added
- **Responsive dark UI**

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React 19 + Vite, React Router, Axios, Socket.IO Client, Lucide icons |
| Backend  | Node.js, Express, Prisma, Socket.IO, JWT, bcryptjs |
| Database | SQLite (easy local) / switchable to PostgreSQL |

## Quick Start (Local)

### Prerequisites
- Node.js 18+
- npm

### 1. Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run db:seed   # creates demo users
npm run dev       # http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

### Demo Accounts (after seed)
- `alice@example.com` / `password123`
- `bob@example.com` / `password123`
- `carol@example.com` / `password123`

## Switching to PostgreSQL

1. Change `prisma/schema.prisma` datasource:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
2. Set `DATABASE_URL="postgresql://user:pass@host:5432/projectflow"` in `.env`
3. Run `npx prisma db push` (or migrate)

## API Overview

- `POST /api/auth/register` — Register
- `POST /api/auth/login` — Login
- `GET  /api/auth/me` — Current user
- `GET/POST /api/projects` — List / create projects
- `GET/PUT/DELETE /api/projects/:id` — Project details / update / delete
- `POST /api/projects/:id/members` — Invite member
- `POST /api/tasks` — Create task
- `PUT /api/tasks/:id` — Update task
- `PATCH /api/tasks/:id/move` — Move task (column + order)
- `POST /api/tasks/:id/comments` — Add comment
- `GET /api/notifications` — Notifications

## Real-time Events (Socket.IO)

- `task:created`, `task:moved`, `task:updated`, `task:deleted`
- `comment:created`, `member:added`
- `notification:new`

Authenticate socket with `auth: { token: JWT }`.

## Project Structure

```
ProjectFlow/
├── backend/
│   ├── prisma/schema.prisma
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── sockets/
│   │   ├── utils/
│   │   └── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── context/
│   │   ├── pages/
│   │   └── ...
│   └── package.json
└── README.md
```

## Deployment Notes

- **Backend**: Deploy to Render / Railway / Fly.io. Set env vars (`DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL`).
- **Frontend**: Build with `npm run build` and deploy static dist to Netlify / Vercel. Set `VITE_API_URL` and `VITE_SOCKET_URL` to your backend URL.
- For production, use PostgreSQL and a strong `JWT_SECRET`.

## License

MIT

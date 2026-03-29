# Sabbatical Blog

A personal photo wall, blog, and 3D prints gallery. Password-protected, phone-friendly admin panel.

## Local dev

```bash
npm install
cp .env.example .env   # set your PASSWORD and SESSION_SECRET
npm run dev            # starts with --watch (Node 18+)
```

Open http://localhost:3000 — default password is `sabbatical2026`.

## Deploy to Railway

1. Push this folder to a GitHub repo
2. Create a new Railway project → "Deploy from GitHub repo"
3. Add environment variables in Railway dashboard:
   - `PASSWORD` — your chosen password
   - `SESSION_SECRET` — a long random string (e.g. from `openssl rand -hex 32`)
   - `PORT` — Railway sets this automatically, you don't need to add it
4. Add a Volume in Railway: mount path `/app/uploads` (so photos survive redeploys)
5. Also mount `/app/data` as a volume so JSON data persists

That's it. Railway auto-deploys on every push.

## Structure

```
public/        Static frontend (photo wall, blog, 3D prints)
admin/         Admin panel (upload photos, write posts, manage)
data/          JSON data store (photos.json, prints.json, posts.json)
uploads/       Uploaded images (full-size + thumbnails)
server.js      Express backend
```

## Env vars

| Variable | Description |
|---|---|
| `PASSWORD` | Site password (single shared password for all visitors) |
| `SESSION_SECRET` | Secret for signing session cookies — make it long and random |
| `PORT` | Port to listen on (default 3000) |

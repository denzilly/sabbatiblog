# Railway → local Docker migration

Status as of 2026-07-30: **live.** `https://btblog.dev` serves the blog
through Cloudflare → Tunnel → Caddy → the local container. Railway has
been paused (not deleted) as a rollback option.

## What's done

- `Dockerfile`, `.dockerignore`, `docker-compose.yml` written and working.
  Container runs as the non-root `node` user (uid 1000, matches `bart` on
  this host) so files written to the bind mount aren't root-owned.
- `.env` populated with real `PHOTOS_PASSWORD` / `BLOG_PASSWORD` /
  `ADMIN_PASSWORD` / `SESSION_SECRET` (copied from Railway's dashboard).
- `uploads/` populated from Railway's `sabbatiblog-volume` (was mounted at
  `/app/uploads`, 167MB) via `railway ssh` + tar. Verified file counts match
  (293 files) and `photos.json` is byte-identical.
- Container is up and confirmed working at `http://192.168.1.233:3000`
  (also `http://bartserver:3000`), joined to the shared `web` network.
- Temporary `ports: "3000:3000"` mapping removed from `docker-compose.yml`
  and the container recreated — no longer reachable directly, only via
  Caddy on the `web` network.
- Caddy block added in `~/projects/infra/caddy/Caddyfile`:
  ```
  http://btblog.dev {
  	reverse_proxy sabbatiblog:3000
  }
  ```
  Note the explicit `http://` scheme — **do not** write this as a bare
  `btblog.dev { ... }` block. Cloudflare's tunnel talks to Caddy over
  plain HTTP (`http://caddy:80`), and a bare domain block makes Caddy
  auto-provision TLS and force an HTTP→HTTPS redirect. Since the tunnel
  connection is already plain HTTP, that redirect sends the request right
  back to `https://btblog.dev`, which round-trips through Cloudflare's
  edge and hits the same redirect again — an infinite loop. The `http://`
  prefix disables Caddy's automatic HTTPS for this block since Cloudflare
  already terminates real TLS at the edge. Verified with
  `curl -H "Host: btblog.dev" http://localhost/login` returning `200`
  (was `308` before the fix).
- Reloaded via `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.

## Cloudflare Tunnel — recreated 2026-07-30

The original tunnel was accidentally deleted while looking for where to
configure the public hostname route. It's been recreated:

- New token generated and saved to `~/projects/infra/.env`
  (`TUNNEL_TOKEN=...`, gitignored).
- `cloudflared` recreated (`docker compose up -d` in `~/projects/infra`)
  and confirmed reconnected — logs showed `Registered tunnel connection`
  with 4 healthy connections.
- The tunnel had **only ever been used for this blog** (confirmed before
  recreating), so no other services' routes were lost.
- The new tunnel has **no routes configured yet** — see "What's left"
  below. Cloudflare's dashboard has changed since this repo's README was
  written: the old "Public Hostname" tab is now **Published application
  routes**, found under Networks > Connectors > Cloudflare Tunnels (or
  Networking > Tunnels) > select tunnel > Edit. The standalone Networks >
  Routes > Hostname routes page looks similar but only maps
  hostname→tunnel with no service target — it's a different feature and
  not what we want here.

## Blocked on: `btblog.dev` was never a Cloudflare zone

Discovered while trying to add the Published application route: the
domain dropdown was empty because `btblog.dev` DNS has always been
managed at the registrar (Namecheap, `*.registrar-servers.com`
nameservers), not Cloudflare. Only one record existed there — a CNAME at
the apex to Railway (`whef4woy.up.railway.app`). No MX, no `www`, no
other subdomains, so delegating the zone to Cloudflare is low-risk.

Steps taken (resolved):
1. Added `btblog.dev` in Cloudflare under **Domains > Onboard a domain**
   (DNS-only — did *not* use the domain-transfer flow, which would move
   registrar ownership; we only need Cloudflare DNS).
2. Cloudflare gave two nameservers; updated them at Namecheap (Domain
   List > btblog.dev > Nameservers > Custom DNS).
3. Propagated same day (2026-07-30) — `dig +short NS btblog.dev` returned
   Cloudflare's nameservers (`irma.ns.cloudflare.com` /
   `fred.ns.cloudflare.com`).
4. **Gotcha**: creating the Published application route for the apex
   `btblog.dev` initially failed/redirected into creating a route for
   `blog.btblog.dev` instead — Cloudflare had imported the pre-existing
   Railway CNAME at the apex during zone onboarding, and the route UI
   wouldn't let a new route claim an already-occupied hostname. Fix: went
   to **DNS > Records**, deleted the imported `btblog.dev` → Railway
   CNAME, deleted the stray `blog.btblog.dev` route, then re-added the
   Published application route at the apex (`btblog.dev`, blank
   subdomain) — succeeded once the conflicting record was gone.

## Known quirks / things to remember

- **Only `/app/uploads` is real.** The project's own `README.md` says to
  mount both `/app/uploads` and `/app/data` — that's stale. `server.js`
  only ever reads/writes under `uploads/` (data JSON in `uploads/data/`,
  sessions in `uploads/sessions/`). There never was a second volume; Railway
  only had `sabbatiblog-volume` at `/app/uploads`, confirming this.
- **`uploads/imgcache/`** (7.2MB, travel-photo-named files) was copied over
  from Railway but isn't referenced anywhere in current `server.js` or the
  frontend — looks like leftover from an older version. Left in place;
  safe to delete later if it's confirmed unused.
- **`ports: "3000:3000"` in `docker-compose.yml` is temporary**, added only
  for local testing before Caddy fronts the app. Remove it once the Caddy
  block is live (don't want the app reachable directly on 3000 alongside
  the reverse proxy).
- Railway CLI is installed at `~/.railway/bin/railway`, logged in as
  `btimmer313@gmail.com`, linked to project `Btblog` / service
  `sabbatiblog` / environment `production` from this directory. An SSH
  keypair (`~/.ssh/id_ed25519`) was generated and registered with Railway
  (`railway ssh keys add`) to enable `railway ssh`, if you need to pull
  anything else off Railway later.

## What's left

1. **Spot-check the site in a browser** — click through photos, admin
   login, etc. on the new path (`curl` only confirmed `/login` returns
   `200` over HTTP/2 through Cloudflare; hasn't exercised the app's
   actual features end-to-end).
2. **Decommission Railway** once confident (currently just paused, not
   deleted, as of 2026-07-30).

Already done, no longer pending: nameserver cutover, Published
application route, Caddy block, temporary port-mapping removal, Railway
pause — see sections above.

## Useful commands

```bash
# bring the stack up / down (from this repo directory)
docker compose up -d --build
docker compose down

# check Railway service/volume state
export PATH="$HOME/.railway/bin:$PATH"
railway status
railway volume list

# pull fresh data from Railway again if needed
ssh railway-sabbatiblog -- tar czf - -C /app/uploads --exclude=lost+found --exclude=sessions . \
  | tar xzf - -C uploads
```

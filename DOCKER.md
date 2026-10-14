# Running Lale Gülleri with Docker

Docker runs the whole shop in containers. You don't install Node.js or
PostgreSQL yourself, only Docker.

| Container | What it is |
|---|---|
| `db` | PostgreSQL: flowers, orders, customers, messages |
| `app` | The website + the shop server (built from this project) |
| `caddy` | HTTPS for the real site (only with `--profile https`) |

Your data lives in Docker **volumes**: `db-data` (the database) and `uploads`
(product photos). They survive `docker compose down`, restarts and updates.

---

## A. On your Windows computer (for testing)

1. Install **Docker Desktop** from https://www.docker.com/products/docker-desktop/
   and start it (wait until it says "Engine running"). It may ask to install
   or update **WSL**; accept and restart Windows if asked.
2. Open the project folder in VS Code and open a terminal (**Terminal → New Terminal**).
3. Create the settings file:

   ```bash
   copy .env.docker.example .env
   ```

   Open `.env` and change `POSTGRES_PASSWORD` to your own password (letters and
   digits only). Leave the rest as it is for testing.
4. Build and start everything (the first time takes a few minutes):

   ```bash
   docker compose up -d --build
   ```

5. Create your admin login (keyboard on **English**):

   ```bash
   docker compose exec app node scripts/create-admin.js
   ```

6. Open **http://localhost:8080** for the shop and **http://localhost:8080/admin**
   for the admin panel.

The first start creates the tables and adds the 16 original flowers by itself.

> **If you already ran the shop without Docker** (`npm run dev`), stop those
> terminals first (Ctrl+C). The Docker shop uses its own database, not the
> PostgreSQL you installed on Windows. That one can stay or be uninstalled.

## B. On the Ubuntu server (the real site, with HTTPS)

1. Install Docker:

   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER      # then log out and back in
   ```

2. Copy the project zip to the server and unpack it:

   ```bash
   sudo apt install -y unzip
   unzip lale-gulleri-shop.zip -d ~/lale-gulleri
   cd ~/lale-gulleri
   cp .env.docker.example .env
   nano .env
   ```

   In `.env` set:

   ```
   POSTGRES_PASSWORD=YourStrongPassword2026
   COOKIE_SECURE=1
   TRUST_PROXY=1
   DOMAIN=lalegulleri.tm, www.lalegulleri.tm
   ```

3. Your domain's DNS must point to the server, and ports **80** and **443**
   must be open. Then:

   ```bash
   docker compose --profile https up -d --build
   docker compose exec app node scripts/create-admin.js
   ```

   Caddy gets the HTTPS certificate by itself. Open `https://lalegulleri.tm`.

> Caddy uses Let's Encrypt, which checks your domain from outside
> Turkmenistan. If the server cannot be reached from abroad, the certificate
> fails (`docker compose logs caddy` shows why). Then use a certificate from
> your hosting provider. Ask me and I'll adjust the Caddyfile for it.

---

## Everyday commands

Run these in the project folder.

| What | Command |
|---|---|
| Start | `docker compose up -d` (server: `docker compose --profile https up -d`) |
| Stop (data is kept) | `docker compose down` |
| Is everything running? | `docker compose ps` |
| Server messages / errors | `docker compose logs -f app` (Ctrl+C to stop watching) |
| Add an admin / new admin password | `docker compose exec app node scripts/create-admin.js` |
| Update after changing files | `docker compose up -d --build` (add `--profile https` on the server) |

**Never run `docker compose down -v`.** The `-v` deletes the database and all photos.

## Backups

```bash
# database
docker compose exec -T db pg_dump -U lale -Fc lale > lale-db-backup.dump
# photos
docker compose cp app:/app/server/uploads ./uploads-backup
```

Keep copies on another computer too.

**Restore** (only if something went wrong):

```bash
docker compose exec -T db pg_restore -U lale -d lale --clean --no-owner < lale-db-backup.dump
docker compose cp ./uploads-backup/. app:/app/server/uploads
```

On the server, a nightly backup (`crontab -e`, then add this line):

```
0 3 * * * cd /home/YOUR-USER/lale-gulleri && docker compose exec -T db pg_dump -U lale -Fc lale > backups/db_$(date +\%F).dump
```

(create the `backups` folder first: `mkdir -p ~/lale-gulleri/backups`)

## If something does not work

| Problem | Fix |
|---|---|
| `POSTGRES_PASSWORD` error when starting | The `.env` file is missing or has no `POSTGRES_PASSWORD` line. |
| `docker: command not found` / "cannot connect to the Docker daemon" | Start Docker Desktop (Windows) or `sudo systemctl start docker` (server). |
| The build stops at `npm install` with timeouts / 403 | npm is slow or blocked: add `NPM_REGISTRY=https://registry.npmmirror.com` to `.env` and build again. |
| Pulling `node`, `postgres` or `caddy` fails ("forbidden", timeouts) | Docker Hub is blocked on your network. Use a VPN for the download, or set up a registry mirror in Docker Desktop → Settings → Docker Engine (`"registry-mirrors": ["https://mirror.gcr.io"]`). |
| Port 8080 is already in use | Change `SITE_PORT` in `.env` (e.g. `8081`) and run `docker compose up -d`. |
| Admin login keeps returning to the login form (testing on your computer) | `COOKIE_SECURE` must be `0` when you open the site with `http://`. |
| Opening the shop from your phone on the same Wi-Fi | Set `SITE_BIND=0.0.0.0`, run `docker compose up -d`, then open `http://YOUR-PC-IP:8080`. |

The old way without Docker (`DEPLOY.md`) still works. Use one way or the other on the same server, not both.

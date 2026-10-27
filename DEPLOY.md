# Putting Lale Gülleri on your Ubuntu server

This guide sets up the whole shop on one Ubuntu server (22.04 or 24.04):

- **PostgreSQL**: the database (flowers, orders, customers, messages)
- **Node.js**: the shop server (`server/` folder)
- **Nginx**: shows the website to visitors and passes `/api` to the shop server
- **HTTPS**: needed so logins are safe

Commands are run on the server over SSH. Lines starting with `#` are notes.
Replace `lalegulleri.tm` with your real domain everywhere.

---

## 1. Install the programs

```bash
sudo apt update
sudo apt install -y postgresql nginx git curl
```

**Node.js 22** (the version in Ubuntu is too old):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v      # must show v22.x (anything from v20.6 works)
```

> If `deb.nodesource.com` cannot be reached from the server, download the
> "Linux x64" file from https://nodejs.org on a computer that can open it,
> copy it to the server with `scp`, and unpack it to `/usr/local`:
> `sudo tar -xJf node-v22.*-linux-x64.tar.xz -C /usr/local --strip-components=1`
> (then use `/usr/local/bin/node` instead of `/usr/bin/node` in step 6).

## 2. Create the database

Choose a strong password and write it down. You need it in step 4.
Use only letters and digits in it, because symbols like `@ : / #` break the connection line in `.env`.

```bash
sudo -u postgres psql -c "CREATE USER lale WITH PASSWORD 'PUT-A-STRONG-PASSWORD-HERE';"
sudo -u postgres psql -c "CREATE DATABASE lale OWNER lale;"
```

## 3. Put the project on the server

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin lale
sudo mkdir -p /var/www/lale-gulleri
sudo chown $USER:$USER /var/www/lale-gulleri
```

Copy the project zip (`lale-gulleri-shop.zip`) to the server and unpack it:

```bash
# on YOUR computer:
scp lale-gulleri-shop.zip you@SERVER-IP:/tmp/

# on the server:
sudo apt install -y unzip
unzip /tmp/lale-gulleri-shop.zip -d /var/www/lale-gulleri
ls /var/www/lale-gulleri      # you should see: package.json  server  src  public ...
```

(Or use `git clone` if the project is on GitHub. Never copy a `node_modules` folder from your computer.)

## 4. Set up the shop server

```bash
cd /var/www/lale-gulleri/server
npm install --omit=dev
cp .env.example .env
nano .env
```

In `.env`, change only this line: put in the password from step 2.

```
DATABASE_URL=postgres://lale:PUT-A-STRONG-PASSWORD-HERE@127.0.0.1:5432/lale
```

Leave the other lines as they are (`COOKIE_SECURE=1` and `TRUST_PROXY=1` are
right for a real site behind Nginx with HTTPS). Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

Create the tables, add the 16 flowers, and create your admin login:

```bash
npm run setup          # tables + the 16 original flowers
npm run create-admin   # asks for a username and a password (at least 8 characters)
```

Run `npm run create-admin` again any time to add another admin, or to set a
new password for an existing one.

## 5. Build the website

```bash
cd /var/www/lale-gulleri
npm install
npm run build          # creates the dist folder
```

## 6. Start the shop server automatically

```bash
sudo mkdir -p /var/www/lale-gulleri/server/uploads
sudo chown -R lale:lale /var/www/lale-gulleri/server/uploads
sudo chmod 640 /var/www/lale-gulleri/server/.env
sudo chown $USER:lale /var/www/lale-gulleri/server/.env

sudo cp server/deploy/lale-gulleri.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lale-gulleri
sudo systemctl status lale-gulleri       # should say "active (running)"
curl http://127.0.0.1:3000/api/health    # should print {"ok":true}
```

## 7. Nginx

```bash
sudo cp server/deploy/nginx-lale-gulleri.conf /etc/nginx/sites-available/lale-gulleri
sudo sed -i 's/YOUR-DOMAIN/lalegulleri.tm/g' /etc/nginx/sites-available/lale-gulleri
sudo ln -s /etc/nginx/sites-available/lale-gulleri /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Nginx needs to read the website and the photos:

```bash
sudo chmod 755 /var/www /var/www/lale-gulleri /var/www/lale-gulleri/server
sudo chmod 755 /var/www/lale-gulleri/server/uploads
```

Your domain's DNS must point to the server's IP address. Then open
`http://lalegulleri.tm`. The shop should appear.

## 8. HTTPS (required for logins)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d lalegulleri.tm -d www.lalegulleri.tm
```

Certbot changes the Nginx file for you and renews the certificate
automatically.

> Let's Encrypt checks your domain from outside Turkmenistan. If the server
> cannot be reached from abroad, certbot fails. Then buy an SSL certificate
> from your domain/hosting provider and add it to the Nginx file (they give
> instructions), or ask your provider to open port 80 for the check.

**Until HTTPS works, customer and admin logins will not stay logged in**
(the login cookie is "HTTPS only" on purpose). Only for a short test without
HTTPS, set `COOKIE_SECURE=0` in `.env` and run `sudo systemctl restart lale-gulleri`.
Set it back to `1` afterwards.

## 9. Daily backups

```bash
sudo mkdir -p /var/backups/lale-gulleri
sudo chown $USER /var/backups/lale-gulleri
chmod +x /var/www/lale-gulleri/server/scripts/backup.sh
/var/www/lale-gulleri/server/scripts/backup.sh     # try it once
crontab -e
```

Add this line (backup every night at 03:00, the last 14 days are kept):

```
0 3 * * * /var/www/lale-gulleri/server/scripts/backup.sh >> /var/backups/lale-gulleri/backup.log 2>&1
```

Copy the backups to another computer from time to time. A backup on the same
server does not help if the server breaks.

**Restoring** (only if something went wrong):

```bash
pg_restore --clean --no-owner -d "postgres://lale:PASSWORD@127.0.0.1:5432/lale" /var/backups/lale-gulleri/db_DATE.dump
tar -xzf /var/backups/lale-gulleri/uploads_DATE.tar.gz -C /var/www/lale-gulleri/server
```

---

## Updating the site later

When you have new versions of the files:

```bash
cd /var/www/lale-gulleri
# copy the new files over the old ones (scp or git pull), then:
npm install && npm run build                 # website
cd server && npm install --omit=dev && npm run migrate
sudo systemctl restart lale-gulleri
```

Never copy your computer's `server/.env` or `server/uploads` over the
server's ones.

## Using the shop

- **Admin panel:** `https://lalegulleri.tm/admin`
  - **Orders:** new orders appear by themselves within about 15 seconds, with a sound (the bell button turns it on and off). Keep the page open in a tab. Press "Next: …" to move an order along (Confirmed → Being prepared → On the way → Delivered). The customer sees the status on the Track page and in their profile. "Clear history" deletes delivered / cancelled orders (all, or only older ones); orders in progress are never deleted, and deleting cannot be undone.
  - **Flowers:** add, edit and delete flowers, change prices, and mark a flower as out of stock. Changes are visible to every customer straight away.
  - **Messages:** what people send with the contact form.
  - **Customers:** if someone forgets their password, press "New password" and tell them the temporary password by phone. They can change it in their profile.
- **The admin login lasts 12 hours** or until the browser closes.

## If something does not work

```bash
sudo systemctl status lale-gulleri           # is the shop server running?
sudo journalctl -u lale-gulleri -n 100       # its last messages / errors
sudo nginx -t                                # is the Nginx file correct?
sudo tail -n 50 /var/log/nginx/error.log
curl http://127.0.0.1:3000/api/health        # database reachable? -> {"ok":true}
```

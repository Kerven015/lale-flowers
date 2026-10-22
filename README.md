# Lale Gülleri — flower shop

Website (React + Vite) and shop server (Node.js + PostgreSQL) in one project.

| Folder | What it is |
|---|---|
| `src/`, `public/` | The website customers see (TM / RU / TR, light + dark) |
| `src/store/` | Redux (Redux Toolkit): flowers, basket + favourites, logged-in customer |
| `src/styles/fonts/` | The site's fonts (Manrope, Playfair Display, SIL Open Font License), served by your own server instead of Google |
| `server/` | The shop server: flowers, orders, customer accounts, admin panel |
| `server/migrations/` | Database tables |
| `server/deploy/` | Nginx and systemd files for the Ubuntu server |
| `DEPLOY.md` | **Step-by-step guide for putting the shop on your server** |
| `DOCKER.md`, `Dockerfile`, `docker-compose.yml` | **The same shop with Docker** (one command starts database + website + server) |

## What is stored where

- **On the server (PostgreSQL):** flowers and prices, orders and their status, customer accounts, contact messages, newsletter emails, admin logins.
- **Uploaded photos:** `server/uploads/`
- **In each visitor's browser:** only the basket, favourites, language, theme and chosen city.

Google login and Firebase are no longer used.
Customers log in with email + password.

## Run everything on your own computer (for testing)

You need **Node.js 20.6 or newer** and **PostgreSQL** (Windows: the installer from
https://www.postgresql.org/download/windows/ — remember the password you choose for `postgres`).

1. Create a database (in "SQL Shell (psql)" or pgAdmin):

   ```sql
   CREATE USER lale WITH PASSWORD 'lale';
   CREATE DATABASE lale OWNER lale;
   ```

2. Shop server, in a terminal:

   ```bash
   cd server
   npm install
   copy .env.example .env      # Mac/Linux: cp .env.example .env
   ```

   In `server/.env` set:

   ```
   DATABASE_URL=postgres://lale:lale@127.0.0.1:5432/lale
   COOKIE_SECURE=0
   TRUST_PROXY=0
   NODE_ENV=development
   ```

   Then:

   ```bash
   npm run setup          # tables + the 16 original flowers
   npm run create-admin   # your admin username + password
   npm run dev            # keep this terminal open
   ```

3. Website, in a second terminal (project folder):

   ```bash
   npm install
   npm run dev
   ```

   Open http://localhost:5173. The admin panel is at http://localhost:5173/admin.
   Vite forwards `/api` and `/uploads` to the shop server (see `vite.config.js`).

## Redux (`src/store/`)

The shop's data is kept in one Redux store:

| File | What it holds |
|---|---|
| `productsSlice.js` | Flowers from the server (+ admin add / edit / delete) |
| `cartSlice.js` | Basket and favourites, totals and delivery price |
| `authSlice.js` | The logged-in customer (register, login, logout, profile) |
| `index.js` | Creates the store, saves basket/favourites to the browser, loads data on start |
| `hooks.js` | `useProducts()`, `useCart()`, `useAuth()`: what the pages use |

Language, theme, pop-up messages and the chosen city stay in small React Contexts
(`src/contexts/`). With the **Redux DevTools** browser extension you can watch every
change while `npm run dev` is running.

## Pages

| Path | Page |
|---|---|
| `/` | Home (flower listing) |
| `/catalog`, `/categories` | Catalog + filters, categories |
| `/roses` `/tulips` `/bouquets` `/gifts` | Category |
| `/product/:id` | Product |
| `/cart` `/checkout` `/favorites` | Shop |
| `/track` | Order tracking by order code |
| `/about` `/contact` `/delivery` | Info |
| `/login` `/register` `/profile` | Customer account |
| `/admin` | Admin panel (orders, flowers, messages, customers, newsletter) |

## Shop server API (for reference)

Public: `GET /api/products`, `POST /api/orders`, `GET /api/orders/:code`,
`POST /api/contact`, `POST /api/newsletter`, `/api/auth/*`, `GET /api/account/orders`.
Admin (login required): `/api/admin/*`.

**Continue with Google** (optional): set `GOOGLE_CLIENT_ID` in `server/.env`,
see [docs/google-sign-in.md](docs/google-sign-in.md).

**Tests:** `npm test` (website) and `cd server && npm test` (server; needs a
PostgreSQL database whose name ends in `_test`, set with `TEST_DATABASE_URL`,
default `postgres://lale_test:lale_test@127.0.0.1:5432/lale_test`).

**Shop settings** (delivery price, free-delivery amount, contacts, pausing
orders, first-order discount) are changed in the admin panel → **Settings**;
**discount codes** in admin → **Discounts**. The website only shows these
numbers; the server works out every order's price itself
(`server/src/pricing.js`). Flowers can have a count of how many are left
(admin → flower form): orders take from it, cancelling puts it back.

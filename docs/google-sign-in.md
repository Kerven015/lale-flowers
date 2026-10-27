# "Continue with Google" sign-in

Customers can sign in with their Google account: the **Continue with Google**
button on the sign-in and register pages, and Google's **One Tap** prompt
("Continue as …") on the other pages.

Google only proves who the person is. The customer account itself stays in
the shop's own database (`customers` table; the Google link is in
`user_identities`). No Firebase or other sign-in service is used, and no
client secret is needed: only a public **Client ID**.

While `GOOGLE_CLIENT_ID` is empty, the button and One Tap are hidden
completely and nothing is loaded from Google.

---

## 1. Create a Google Cloud project

1. Open <https://console.cloud.google.com/> and sign in with the Google account
   that should own the shop's settings.
2. At the top, click the **project picker** (next to "Google Cloud") →
   **New project**.
3. **Project name:** `Lale Gulleri` → **Create**.
4. Make sure the new project is selected in the project picker.

## 2. OAuth consent screen (Branding)

This is what customers see in the Google pop-up.

1. Menu ☰ → **APIs & Services** → **OAuth consent screen**
   (in the new console it is called **Google Auth Platform** → **Branding**).
   If you see **Get started**, click it.
2. **App name:** `Läle Gülleri`
3. **User support email:** choose your email.
4. **Audience:** **External** (any Google user can sign in).
5. **Contact information:** your email → **Next** → accept the policy →
   **Create**.
6. Optional but recommended (in **Branding**): the app logo, the
   **Application home page** (`https://your-domain`), the **privacy policy**
   link (`https://your-domain/privacy`, the shop has this page), the **terms
   of service** link (optional), and under **Authorized domains** your domain
   (e.g. `lalegulleri.tm`). → **Save**.

Only the basic scopes are used (`openid`, `email`, `profile`), so Google does
not need to review the app.

## 3. Create the Client ID

1. Menu ☰ → **APIs & Services** → **Credentials**
   (or **Google Auth Platform** → **Clients**).
2. **+ Create credentials** → **OAuth client ID**
   (or **+ Create client**).
3. **Application type:** **Web application**.
4. **Name:** `Lale Gulleri website`.
5. **Authorized JavaScript origins** → **+ Add URI**, one per line:
   - `http://localhost:5173` (the website while developing: `npm run dev`)
   - `http://localhost` (Google needs this one too for local testing)
   - `http://localhost:8080` (only if you test with Docker)
   - later, for the real site: `https://your-domain` (and
     `https://www.your-domain` if that address is used too)

   Write them exactly like this: `http` or `https`, no path, no `/` at the end.
6. **Authorized redirect URIs:** leave **empty**. The shop does not use the
   redirect flow.
7. **Create**. A window shows **Client ID**, something like
   `1234567890-abc123def456.apps.googleusercontent.com`. Copy it.
   (The "client secret" shown there is **not** needed. Do not put it anywhere.)

Adding an origin can take a few minutes (sometimes up to an hour) to work.

## 4. Put the Client ID into the shop

**Normal server** (`server/.env`):

```
GOOGLE_CLIENT_ID=1234567890-abc123def456.apps.googleusercontent.com
```

**Docker** (`.env` next to `docker-compose.yml`): the same line.

Then:

```
cd server
npm run migrate       # once: adds the Google tables/columns (003_google_sign_in.sql)
npm run dev           # or restart the service: sudo systemctl restart lale-gulleri
```

(Docker: `docker compose up -d --build`, the migration runs on start.)

No rebuild of the website is needed: the website asks the server for the
Client ID (`GET /api/auth/config`).

## 5. Publish the app before going live

New apps start in **Testing**: only the **test users** you list (max 100)
can sign in; everyone else gets "Access blocked".

- To test first: **Google Auth Platform** → **Audience** → **Test users** →
  **+ Add users** → your Gmail addresses.
- For the real site: **Audience** → **Publish app** → **Confirm**. The status
  becomes **In production**. (No Google review is needed for these basic
  scopes.)

## 6. How accounts are matched

1. The Google account was used before → the same customer is signed in
   (even if their Gmail address changed since).
2. A customer with the same email exists → Google is linked to that account
   and the customer is signed in. If that account's email was **never
   verified**, its password is removed and all its logins end first: someone
   else might have registered that email, and only the real inbox owner
   (signing in with Google now) may keep the account.
3. Otherwise a new account is created (name and email from Google, no
   password).

Google sign-in keeps the customer signed in for 30 days. Blocked customers
(admin panel → Customers → **Block**) cannot sign in with Google or a
password. Customers who signed up with Google can **Set a password** in their
profile; changing the email needs a password.

## 7. Troubleshooting

**The button does not show at all**
- `GOOGLE_CLIENT_ID` is empty or the server was not restarted. Check:
  open `https://your-domain/api/auth/config`; it must show your Client ID.
- An ad blocker / privacy extension blocks `accounts.google.com`.

**"Error 400: origin_mismatch" / "The given origin is not allowed for the given client ID"**
- The address in the browser's address bar is not in **Authorized JavaScript
  origins**. Compare exactly: `http` vs `https`, `www.` or not, the port
  (`:5173`), no `/` at the end. Add the missing one and wait a few minutes.
- Make sure the Client ID in `.env` belongs to the same project/client.

**"Access blocked: this app's request is invalid" / "Access blocked: Läle Gülleri has not completed the Google verification process"**
- The app is still in **Testing** and this Google account is not a test
  user. Add it under **Audience → Test users**, or **Publish app**.

**"Sign-in with Google failed" message on the site**
- The server could not verify the token. Check the server's clock is right
  (`timedatectl`), and that the server can reach `https://www.googleapis.com`
  (it downloads Google's public keys).
- The Google account's email is not verified with Google.

**One Tap ("Continue as …") does not show**
- It never shows on the sign-in, register, checkout, profile and admin pages,
  or when someone is already signed in.
- If the person closed it, Google waits before showing it again (from 2 hours
  up to 4 weeks after several closes). Clear it in Chrome: the 🔒 icon left
  of the address → **Site settings** → **Third-party sign-in** → Allow, or
  test in a new private window.
- The browser must be signed in to a Google account, and third-party
  sign-in must not be blocked in the browser settings.
- Some browsers (e.g. Safari with strict privacy) show the prompt only after
  a click; the button always works.

**Someone is signed straight back in after "Sign out"**
- It should not happen: signing out turns off One Tap's automatic sign-in for
  that browser. They can still choose the account in One Tap themselves.

**Content-Security-Policy**
- The shop sends a CSP header (the Node server in `server/src/app.js`, and the
  Nginx example in `server/deploy/`). For Google it allows only:
  `script-src https://accounts.google.com/gsi/client`,
  `frame-src https://accounts.google.com/gsi/`,
  `connect-src https://accounts.google.com/gsi/`,
  `style-src https://accounts.google.com/gsi/style`.
  If you change one of the two, change the other too.
- Keep `Cross-Origin-Opener-Policy: same-origin-allow-popups` (the server and
  the nginx example already send it), otherwise the Google pop-up cannot
  report back to the page.

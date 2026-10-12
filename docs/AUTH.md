# Sign-in and accounts

The app has real user accounts (Better Auth, running inside the web container). The workspace is shared: every signed-in member sees the same audits.

## How sign-in works

- Sign-up is invite-only. Nobody can create an account without an invitation.
- The people listed in `ADMIN_EMAILS` (comma separated, in `deploy/.env`) are admins. An admin signs up or signs in with one of those addresses and is allowed in without an invitation.
- Admins invite everyone else from Settings, Members: enter the email address, and the invited person can then register with email and password, Google or GitHub using that same address.
- Sign-in methods: email and password, Google, GitHub. Google and GitHub are shown only when their client id and secret are set.
- The study participant pages (`/study`, `/study/<code>`) stay public.
- Caddy no longer asks for a password. All access control is in the app.

## First start

1. Fill `deploy/.env` (see `deploy/.env.example`). Required: `DOMAIN`, `BETTER_AUTH_SECRET`, `INTERNAL_API_TOKEN`, `ADMIN_EMAILS`.
   - `openssl rand -base64 32` for `BETTER_AUTH_SECRET`
   - `openssl rand -hex 32` for `INTERNAL_API_TOKEN`
   - Changing `BETTER_AUTH_SECRET` later signs everyone out. Keep it stable.
2. `docker compose up -d --build`, open `https://<domain>/`, and register with an address from `ADMIN_EMAILS`.
3. Invite colleagues from Settings, Members.

## Google OAuth client

Why Testing mode is fine: with an External consent screen in Testing mode, only the Google accounts you list as test users can sign in, which matches an invite-only workspace, and Google does not require app verification. The limits are up to 100 test users, and Google expires the grant for test users after 7 days only for sensitive scopes; basic sign-in (email, profile) is not affected.

1. Open https://console.cloud.google.com and create a project (top bar, New project).
2. APIs and Services, OAuth consent screen (Google Auth platform, Branding): user type External, app name, support email, developer contact email. Leave publishing status as Testing.
3. Audience (or Test users): add the Google address of every person who will use Google sign-in.
4. Data access: the default scopes `openid`, `email`, `profile` are enough.
5. Credentials, Create credentials, OAuth client ID, application type Web application.
   - Authorized JavaScript origins: `https://<domain>`
   - Authorized redirect URIs: `https://<domain>/api/auth/callback/google`
6. Copy the client id and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then `docker compose up -d`.

Caveat: Google may refuse `sslip.io` (and other shared public-suffix style) domains when an app is published to production, and requires a verified domain you own. Testing mode avoids verification, so it works with sslip.io. If Google rejects the redirect URI, use your own domain or DuckDNS and set `DOMAIN` accordingly.

## GitHub OAuth app

1. GitHub, Settings, Developer settings, OAuth Apps, New OAuth App.
2. Application name of your choice. Homepage URL: `https://<domain>`. Authorization callback URL: `https://<domain>/api/auth/callback/github`.
3. Register the application, then Generate a new client secret.
4. Copy the client id and secret into `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, then `docker compose up -d`.

The invited address must match a verified email on the GitHub account.

## Optional: email for password reset and invitations

Set `SMTP_URL` and `MAIL_FROM`. Without them, password reset email is not sent.

A free sender is a Gmail account with an app password (Google Account, Security, 2-Step Verification on, App passwords):

```
SMTP_URL=smtps://you%40gmail.com:abcdefghijklmnop@smtp.gmail.com:465
MAIL_FROM="WCAG Auditor <you@gmail.com>"
```

URL-encode special characters in the user name (`@` becomes `%40`). Gmail limits sending to a few hundred messages a day, plenty for this use.

## Where the data lives

Accounts, sessions and invitations are in a SQLite file, `/data/auth.db` in the web container, on the Docker named volume `web_data`. It is separate from the audit data (`auditor_data`).

- `bash scripts/deploy/backup.sh` writes a consistent snapshot of it to `~/wcag-auditor-backups/wcag-auditor-auth-<timestamp>.tar.gz`, next to the audit backup. Treat these archives as sensitive: they hold password hashes and session tokens.
- Restore: stop the web container, extract `auth.backup.db` into the `web_data` volume as `auth.db` (for example `docker compose run --rm --no-deps -T --entrypoint sh web -c 'cat > /data/auth.db' < auth.backup.db`), and start it again.
- `docker compose down -v` deletes the volume and every account.

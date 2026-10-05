# Subscriptions, Sessions & User Management

## How subscriptions work
- A subscription is granted **until a calendar date (inclusive)**. "Valid until 28 Oct 2026" means the user can work all day on the 28th and is blocked from the start of the 29th.
- The day boundary uses the business time zone (`SUBSCRIPTION_TIMEZONE`, default `Asia/Kolkata`).
- Admin accounts never expire.
- States: **Active**, **Expiring soon** (7 days or fewer), **Expired**, **No expiry**.
- Expiry is enforced on **every request**, not only at login. A user whose subscription ends mid-session is signed out within seconds.

## What users see
- Header chip: `Valid until 28 Oct 2026 · 23 days left`.
- Reminder banner when 7 days or fewer remain (dismissible).
- Login page explains why access was refused or why a session ended (expired, banned, signed out by an admin).

## What admins can do (Manage Users)
- Summary cards: total, active, expiring, expired, online.
- Search and filter (Active / Expiring soon / Expired / Online / Banned).
- **Add user** with a plan: 7 days, 30 days, 90 days, 1 year, custom end date, or no expiry. The exact end date is previewed before saving.
- **Subscription dialog**: extend (+7/+30/+90/+365 days, added to the *current* end date so no paid time is lost), set an exact date, or remove expiry. Shows a preview of the new end date and a change history (who/when/from/to).
- Sign out a user, ban/unban, reset password (also signs the user out everywhere), delete: all with in-app confirmation dialogs.

## Why "Logout user" did not work before, and the fix
The API only checked that the JWT was validly signed. It never checked the `active_sessions` table, so deleting a user's sessions had no effect for up to 8 hours. Bans and expired subscriptions had the same hole.

Now `requireAuth` validates, on every request: JWT -> user exists -> not banned -> **session row exists** -> subscription not expired. The browser also re-checks `/api/auth/me` every 30 seconds and on tab focus, and returns to the login page with an explanation as soon as the server rejects the session. The normal Logout button now also closes the server-side session.

## API
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/auth/login` | Returns `user.subscription` |
| POST | `/api/auth/logout` | Ends the caller's own session |
| GET | `/api/auth/me` | Current user + subscription |
| GET | `/api/users` | `{ users, meta: { today, timezone } }` |
| POST | `/api/users` | `plan_days` **or** `expires_on` (`YYYY-MM-DD`), optional |
| PATCH | `/api/users/:id/subscription` | `{mode:"extend",days}` / `{mode:"set",expires_on}` / `{mode:"remove"}` |
| GET | `/api/users/:id/subscription-history` | Last 10 changes |
| POST | `/api/users/:id/logout` | Force sign-out (all sessions) |
| PATCH | `/api/users/:id/ban` | Ban / unban |

`subscription` object: `{ state, expires_on, expires_at, days_remaining, today, timezone }`.

## Database (auto-migrated on start)
- New table `subscription_events` (audit trail).
- Existing expiry values saved by the old version (midnight UTC) are converted once to end-of-day, so nobody loses the last day they were promised.

## Configuration
Add to `backend/.env` (optional): `SUBSCRIPTION_TIMEZONE=Asia/Kolkata`

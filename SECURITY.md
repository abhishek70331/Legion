# Legion security notes

## Production secrets

Never commit or distribute `backend/.env`. It contains production secrets.
Use the hosting provider's environment-variable settings instead.

If a real `.env` file has ever been shared, rotate at least:

- `DATABASE_URL` database password
- `JWT_SECRET`
- the administrator password

## Authentication hardening

- Passwords are stored with bcrypt cost 12.
- Login failures are rate-limited per IP, account, and IP/account pair.
- Repeated failures return HTTP 429 with `Retry-After`.
- Login always performs a bcrypt comparison even for an unknown username to reduce timing-based username enumeration.
- JWTs expire after 8 hours.
- Protected APIs validate the JWT server-side; frontend-only checks are not trusted.
- Admin-only APIs require the `admin` role in the verified JWT.
- Request bodies are limited to 100 KB.
- Security response headers are added by the backend.
- CORS accepts only the configured `FRONTEND_URL` origins (plus requests without an Origin header).
- Existing admin passwords are no longer overwritten on every backend restart.

## Rate-limit deployment note

The login limiter is intentionally dependency-free and stores counters in backend memory. It is strong for a single backend instance, but counters are not shared between multiple instances or restarts. If Legion is later scaled horizontally, move the limiter state to a shared store such as Redis.

## Recommended production settings

1. Set a long random `JWT_SECRET` (preferably 64+ random characters).
2. Set a unique admin password of at least 12 characters.
3. Set `FRONTEND_URL` to the exact production frontend origin.
4. Set `NODE_ENV=production`.
5. Rotate any secrets that were previously exposed in source archives, screenshots, logs, or chat.

# Session limit

The working Legion authentication now limits each account to exactly 1 active session.
When a new login is created beyond the limit, the oldest session is deleted from `active_sessions`,
so its JWT immediately stops working on the next protected request.

To allow only one device per account, set `MAX_ACTIVE_SESSIONS=1` in `backend/.env`.
The value is capped between 1 and 10.

# Legion Login + Multi-User Setup

This version keeps the original Legion PostgreSQL connection from the old project and adds:
- Login page
- JWT authentication
- bcrypt password hashing
- Protected record/search APIs
- Multiple users
- Admin-only user management
- Add users, reset passwords, delete users
- Admin/user roles

## Backend

Open PowerShell in `backend`:

```powershell
npm install
npm start
```

The backend automatically creates the `users` table if it does not exist and creates the initial admin account from `.env`.

## Frontend

Open a second PowerShell window:

```powershell
cd ..\frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`.

## Initial admin

The initial admin is controlled by:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=use-a-unique-password-at-least-12-characters
```

Change the admin password before deploying the site publicly.

## Important

Do not commit `.env` to GitHub. It contains the database connection string.

Any production database credentials should be supplied through the hosting provider environment variables, not stored in this project.


## Existing database migration
On backend startup, the application automatically adds missing authentication columns to an existing `users` table and creates the initial admin from `.env` only when that username does not already exist. No manual SQL is required.

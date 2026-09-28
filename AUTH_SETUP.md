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
ADMIN_PASSWORD=Admin@12345
```

Change the admin password before deploying the site publicly.

## Important

Do not commit `.env` to GitHub. It contains the database connection string.

The database connection string from the original project has been preserved in the updated project `.env`.


## Existing database migration
On backend startup, the application automatically adds missing authentication columns to an existing `users` table and synchronizes the configured admin password from `.env`. No manual SQL is required.

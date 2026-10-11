# Legion Role-Based Access Control & Feature Permission System

This update implements a secure, database-driven **Role-Based Access Control (RBAC)** and **Feature Permission Management System** for the Legion Insulator Ultrasonic Testing suite.

---

## Key Capabilities

1. **Enterprise Administrator Login Page**
   - Supports sign-in using either **Username** or **Email address**.
   - Show / Hide password visibility toggle.
   - Built-in **Forgot Password / Credential Assistance** modal submitting requests directly to administrators.
   - Strict server-side validation and brute-force rate-limiting.
   - No credentials stored in `.env`.

2. **Personalized User Dashboard & Navigation**
   - Navigation tabs, action buttons, and tools are conditionally shown based on each user's assigned permissions:
     - `Overview & Shift KPI`: requires `overview.view`
     - `New Inspection Data Entry`: requires `records.create`
     - `Records Explorer`: requires `records.view` or `records.search`
     - `Shift Analytics`: requires `shift_analytics.view`
     - `Administration Console`: requires administrative permissions
   - Unauthorized tabs and direct navigation attempts display a dedicated **Access Denied** interface.
   - Read-only mode automatically engaged if a user has permission to view records but not edit or delete them.

3. **Granular Feature Permission Management Matrix**
   - Administrators can assign or revoke individual permissions per feature:
     - **Overview**: `view`
     - **Records**: `view`, `create`, `edit`, `delete`, `search`, `export`
     - **Shift Analytics**: `view`, `export`
     - **User Management**: `view`, `create`, `edit`, `delete`, `manage_status`
     - **Permission Management**: `view`, `edit`
     - **Audit Logs**: `view`, `export`
   - Quick preset templates: *Operator*, *Auditor*, *Admin Full*, *Clear All*.
   - Permission summary preview before saving.
   - Real-time backend enforcement on every single API route.

4. **Dedicated Administrator Console**
   - **Metrics Overview**: Real-time stats on Total Users, Active Online, Administrators, Suspended / Inactive, and Pending Reset Requests.
   - **User Management Directory**: Search by username/email/name, filter by role/status, provision new IDs with secure hashing, edit profiles, reset passwords securely, suspend/activate accounts, and terminate remote sessions.
   - **Feature Permissions Panel**: Interactive switches/checkboxes matrix for any registered user.
   - **Role Management**: Clear hierarchy view (Super Admin, Administrator, Regular User) preventing privilege escalation.
   - **Security & Audit Logs**: Immutable audit trail recording logins, user creations, status toggles, password updates, and permission changes with timestamps and IP addresses.
   - **Password Reset Requests**: Console for reviewing and resolving employee assistance requests.

---

## Technology Stack & Security

- **Database**: PostgreSQL (Supabase / Render compatible)
- **Hashing**: bcryptjs (12 salt rounds)
- **Session Control**: Single-active-session policy enforced via `active_sessions` table (`MAX_ACTIVE_SESSIONS=1`).
- **No Credentials in `.env`**: Usernames and passwords are encrypted and managed exclusively in the PostgreSQL database.

---

## Starting the Application

### 1. Backend Service
```powershell
cd NDT\backend
npm start
```
*Runs on `http://localhost:5000`.*
*Authentication, RBAC, modules, permissions, and audit log tables are initialized automatically on startup.*

### 2. Frontend Application
```powershell
cd NDT\frontend
npm run dev
```
*Runs on `http://localhost:5173`.*

---

## Access & Account Roles

- **Super Admin**:
  - Access: Full universal access across all modules, user administration, and permission controls.
- **Regular User (Operator)**:
  - Access: Permitted operational modules (`Overview`, `Records View/Create/Search`, `Shift Analytics`). Access restricted to explicitly authorized operational modules.

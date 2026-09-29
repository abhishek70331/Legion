const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");
const { initializeAuthTables } = pool;
const {
    hashPassword,
    comparePassword,
    createToken,
    requireAuth,
    requireAdmin
} = require("./auth");

const app = express();

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(cors({
    origin: frontendUrl,
    credentials: true
}));
app.use(express.json());


// ------------------------------------
// AUTH INITIALIZATION
// ------------------------------------

async function ensureAdminUser() {
    const username = (process.env.ADMIN_USERNAME || "admin").trim();
    const password = process.env.ADMIN_PASSWORD;

    if (!password) {
        throw new Error("ADMIN_PASSWORD must be set in backend/.env");
    }

    const existing = await pool.query(
        "SELECT id FROM users WHERE username = $1",
        [username]
    );

    const hash = await hashPassword(password);

    if (existing.rows.length === 0) {
        await pool.query(
            "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
            [username, hash]
        );
        console.log(`✅ Initial admin user created: ${username}`);
    } else {
        // Migrate an existing users table and make the configured admin password usable.
        await pool.query(
            "UPDATE users SET password_hash = $1, role = 'admin' WHERE username = $2",
            [hash, username]
        );
        console.log(`✅ Admin user ready: ${username}`);
    }
}


// ------------------------------------
// HOME
// ------------------------------------

app.get("/", (req, res) => {
    res.json({
        message: "UID Data API is running"
    });
});


// ------------------------------------
// LOGIN
// ------------------------------------

app.post("/api/auth/login", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required"
            });
        }

        const result = await pool.query(
            "SELECT id, username, password_hash, role FROM users WHERE username = $1",
            [username]
        );

        const user = result.rows[0];

        if (!user || !(await comparePassword(password, user.password_hash))) {
            return res.status(401).json({
                message: "Invalid username or password"
            });
        }

        const token = createToken(user);

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Login failed" });
    }
});


// ------------------------------------
// CURRENT USER
// ------------------------------------

app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, username, role FROM users WHERE id = $1",
            [req.user.id]
        );

        if (!result.rows[0]) {
            return res.status(401).json({ message: "User no longer exists" });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        console.error("Auth check error:", error);
        res.status(500).json({ message: "Failed to verify login" });
    }
});


// ------------------------------------
// USER MANAGEMENT (ADMIN ONLY)
// ------------------------------------

app.get("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, username, role, created_at FROM users ORDER BY id ASC"
        );
        res.json(result.rows);
    } catch (error) {
        console.error("List users error:", error);
        res.status(500).json({ message: "Failed to load users" });
    }
});


app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");
        const role = req.body.role === "admin" ? "admin" : "user";

        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required"
            });
        }

        if (username.length < 3) {
            return res.status(400).json({
                message: "Username must be at least 3 characters"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters"
            });
        }

        const hash = await hashPassword(password);

        const result = await pool.query(
            `INSERT INTO users (username, password_hash, role)
             VALUES ($1, $2, $3)
             RETURNING id, username, role, created_at`,
            [username, hash, role]
        );

        res.status(201).json({
            message: "User created successfully",
            user: result.rows[0]
        });
    } catch (error) {
        console.error("Create user error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "Username already exists"
            });
        }

        res.status(500).json({ message: "Failed to create user" });
    }
});


app.patch("/api/users/:id/password", requireAuth, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const password = String(req.body.password || "");

        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters"
            });
        }

        const hash = await hashPassword(password);

        const result = await pool.query(
            "UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, username, role",
            [hash, id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            message: "Password updated successfully",
            user: result.rows[0]
        });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Failed to reset password" });
    }
});


app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        if (id === req.user.id) {
            return res.status(400).json({
                message: "You cannot delete your own account"
            });
        }

        const result = await pool.query(
            "DELETE FROM users WHERE id = $1 RETURNING id, username",
            [id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            message: "User deleted successfully"
        });
    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ message: "Failed to delete user" });
    }
});


// ------------------------------------
// RECORD APIs - LOGIN REQUIRED
// ------------------------------------

app.get("/api/data", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM records ORDER BY record_date DESC, record_time DESC LIMIT 10"
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching records:", error);

        res.status(500).json({
            message: "Failed to fetch records"
        });
    }
});


app.get("/api/data/search", requireAuth, async (req, res) => {
    try {
<<<<<<< HEAD
        const { heading, uid, customer_name, record_date } = req.query;

        if (!heading && !uid && !customer_name && !record_date) {
=======
        const { heading, uid, customer_name } = req.query;

        if (!heading && !uid && !customer_name) {
>>>>>>> 467f32d4cfeddb19c629f91a8257ffa9e0100a9f
            return res.status(400).json({
                message: "Please provide at least one search field"
            });
        }

        let query = `
            SELECT *
            FROM records
            WHERE 1 = 1
        `;

        const values = [];
        let paramIndex = 1;

        if (heading) {
            query += ` AND heading ILIKE $${paramIndex}`;
            values.push(`%${heading}%`);
            paramIndex++;
        }

        if (uid) {
            query += ` AND uid ILIKE $${paramIndex}`;
            values.push(`%${uid}%`);
            paramIndex++;
        }

        if (customer_name) {
            query += ` AND customer_name ILIKE $${paramIndex}`;
            values.push(`%${customer_name}%`);
            paramIndex++;
        }

<<<<<<< HEAD
        if (record_date) {
            query += ` AND record_date = $${paramIndex}`;
            values.push(record_date);
            paramIndex++;
        }

=======
>>>>>>> 467f32d4cfeddb19c629f91a8257ffa9e0100a9f
        query += `
            ORDER BY record_date DESC, record_time DESC
        `;

        const result = await pool.query(query, values);

        res.json(result.rows);
    } catch (error) {
        console.error("Error searching records:", error);

        res.status(500).json({
            message: "Failed to search records"
        });
    }
});


<<<<<<< HEAD
app.get("/api/data/last-7-days", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            WITH days AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '6 days',
                    CURRENT_DATE,
                    INTERVAL '1 day'
                )::date AS record_date
            )
            SELECT
                TO_CHAR(days.record_date, 'YYYY-MM-DD') AS record_date,
                COUNT(records.record_date)::int AS data_count,
                COUNT(records.record_date) FILTER (
                    WHERE records.record_time >= TIME '06:00:00'
                      AND records.record_time < TIME '14:00:00'
                )::int AS a_shift_count,
                COUNT(records.record_date) FILTER (
                    WHERE records.record_time >= TIME '14:00:00'
                      AND records.record_time < TIME '22:00:00'
                )::int AS b_shift_count,
                COUNT(records.record_date) FILTER (
                    WHERE records.record_time < TIME '06:00:00'
                       OR records.record_time >= TIME '22:00:00'
                )::int AS outside_shift_count
            FROM days
            LEFT JOIN records
                ON records.record_date = days.record_date
            GROUP BY days.record_date
            ORDER BY days.record_date DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching last 7 days summary:", error);
        res.status(500).json({
            message: "Failed to fetch last 7 days summary"
        });
    }
});


=======
>>>>>>> 467f32d4cfeddb19c629f91a8257ffa9e0100a9f
app.patch("/api/data", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { original_heading, original_customer_name, original_uid, ...record } = req.body || {};

        if (!original_heading || !original_customer_name || !original_uid) {
            return res.status(400).json({ message: "Original record identifiers are required" });
        }

        const {
            heading, customer_name, uid, record_date, record_time,
            loc1, loc2, loc3, loc4, loc5, loc6,
            loc7, loc8, loc9, loc10, loc11, loc12
        } = record;

        if (!String(heading || "").trim() || !String(customer_name || "").trim() || !String(uid || "").trim()) {
            return res.status(400).json({ message: "Heading, Customer Name and UID are required" });
        }

        const result = await pool.query(
            `UPDATE records SET
                heading = $1, customer_name = $2, uid = $3, record_date = $4, record_time = $5,
                loc1 = $6, loc2 = $7, loc3 = $8, loc4 = $9, loc5 = $10, loc6 = $11,
                loc7 = $12, loc8 = $13, loc9 = $14, loc10 = $15, loc11 = $16, loc12 = $17
             WHERE heading = $18 AND customer_name = $19 AND uid = $20
             RETURNING *`,
            [
                String(heading).trim().toUpperCase(),
                String(customer_name).trim().toUpperCase(),
                String(uid).trim().toUpperCase(),
                record_date, record_time,
                loc1, loc2, loc3, loc4, loc5, loc6,
                loc7, loc8, loc9, loc10, loc11, loc12,
                original_heading, original_customer_name, original_uid
            ]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.json({ message: "Record updated successfully", data: result.rows[0] });
    } catch (error) {
        console.error("Error updating record:", error);
        if (error.code === "23505") {
            return res.status(409).json({ message: "Another record already uses this Heading, Customer Name and UID combination" });
        }
        res.status(500).json({ message: "Failed to update record" });
    }
});

app.delete("/api/data", requireAuth, requireAdmin, async (req, res) => {
    try {
        const { heading, customer_name, uid } = req.body || {};
        if (!heading || !customer_name || !uid) {
            return res.status(400).json({ message: "Record identifiers are required" });
        }

        const result = await pool.query(
            "DELETE FROM records WHERE heading = $1 AND customer_name = $2 AND uid = $3 RETURNING heading, customer_name, uid",
            [heading, customer_name, uid]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.json({ message: "Record deleted successfully", data: result.rows[0] });
    } catch (error) {
        console.error("Error deleting record:", error);
        res.status(500).json({ message: "Failed to delete record" });
    }
});

app.post("/api/data", requireAuth, async (req, res) => {
    try {
        const {
            uid,
            heading,
            customer_name,
            record_date,
            record_time,
            loc1,
            loc2,
            loc3,
            loc4,
            loc5,
            loc6,
            loc7,
            loc8,
            loc9,
            loc10,
            loc11,
            loc12
        } = req.body;

        if (!uid) {
            return res.status(400).json({
                message: "UID is required"
            });
        }

        if (!heading) {
            return res.status(400).json({
                message: "Heading is required"
            });
        }

        if (!customer_name) {
            return res.status(400).json({
                message: "Customer name is required"
            });
        }

        const headingUpper = heading.trim().toUpperCase();
        const customerUpper = customer_name.trim().toUpperCase();
        const uidUpper = uid.trim().toUpperCase();

        const query = `
            INSERT INTO records (
                heading,
                customer_name,
                uid,
                record_date,
                record_time,
                loc1,
                loc2,
                loc3,
                loc4,
                loc5,
                loc6,
                loc7,
                loc8,
                loc9,
                loc10,
                loc11,
                loc12
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $17
            )
            RETURNING *
        `;

        const values = [
            headingUpper,
            customerUpper,
            uidUpper,
            record_date,
            record_time,
            loc1,
            loc2,
            loc3,
            loc4,
            loc5,
            loc6,
            loc7,
            loc8,
            loc9,
            loc10,
            loc11,
            loc12
        ];

        const result = await pool.query(query, values);

        res.status(201).json({
            message: "Record created successfully",
            data: result.rows[0]
        });
    } catch (error) {
        console.error("Error creating record:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "Heading, UID and Customer Name combination already exists"
            });
        }

        res.status(500).json({
            message: "Failed to create record",
            error: error.message
        });
    }
});


// ------------------------------------
// START SERVER
// ------------------------------------

async function startServer() {
    try {
        await pool.query("SELECT 1");
        console.log("✅ Database connected successfully");
        await initializeAuthTables();
        console.log("✅ Authentication tables ready");
        await ensureAdminUser();

        const PORT = process.env.PORT || 5000;

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Server startup failed:");
        console.error(error.message);
        process.exit(1);
    }
}

startServer();

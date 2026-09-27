const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json());


// ------------------------------------
// HOME
// ------------------------------------

app.get("/", (req, res) => {
    res.json({
        message: "UID Data API is running"
    });
});


// ------------------------------------
// GET ALL RECORDS
// ------------------------------------

app.get("/api/data", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM records ORDER BY record_date DESC, record_time DESC"
        );

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching records:", error);

        res.status(500).json({
            message: "Failed to fetch records"
        });
    }
});


// ------------------------------------
// GET RECORD BY UID AND HEADING
// ------------------------------------


//app.get("/api/data/:heading/:uid/:customer", async (req, res) => {
app.get("/api/data/search", async (req, res) => {
    try {
        const { heading, uid, customer_name } = req.query;

        // At least one search field is required
        if (!heading && !uid && !customer_name) {
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

        // Heading filter
        if (heading) {
            query += ` AND heading ILIKE $${paramIndex}`;
            values.push(`%${heading}%`);
            paramIndex++;
        }

        // UID filter
        if (uid) {
            query += ` AND uid ILIKE $${paramIndex}`;
            values.push(`%${uid}%`);
            paramIndex++;
        }

        // Customer filter
        if (customer_name) {
            query += ` AND customer_name ILIKE $${paramIndex}`;
            values.push(`%${customer_name}%`);
            paramIndex++;
        }

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

// ------------------------------------
// CREATE RECORD
// ------------------------------------

app.post("/api/data", async (req, res) => {
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

        // Basic validation
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

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
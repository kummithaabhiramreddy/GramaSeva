require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Request Logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Postgres Pool Setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gramaseva',
});

// Database Initialization
const initDb = async () => {
    // 1. First, try to create the database if it doesn't exist
    const adminPool = new Pool({
        connectionString: (process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gramaseva').replace('/gramaseva', '/postgres'),
    });
    
    try {
        await adminPool.query('CREATE DATABASE gramaseva');
        console.log("✨ Created database 'gramaseva'");
    } catch (err) {
        // Ignore error if database already exists (code 42P04)
        if (err.code !== '42P04') {
            console.log("Note: Database 'gramaseva' check complete.");
        }
    } finally {
        await adminPool.end();
    }

    // 2. Now initialize the table
    const query = `
        CREATE TABLE IF NOT EXISTS workers (
            id SERIAL PRIMARY KEY,
            worker_id TEXT UNIQUE,
            full_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            trade TEXT NOT NULL,
            village TEXT NOT NULL,
            mandal TEXT,
            landmark TEXT,
            experience INTEGER,
            availability TEXT,
            details TEXT,
            type TEXT NOT NULL,
            leader_name TEXT,
            members_count INTEGER DEFAULT 1,
            rating FLOAT DEFAULT 4.5,
            reviews_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await pool.query(query);
        console.log("✅ Database initialized (Workers table ready)");
    } catch (err) {
        console.error("❌ Error initializing database:", err.message);
        console.log("Tip: Please check your .env file and ensure PostgreSQL is running with the correct password.");
    }
};

initDb();

// API Endpoints

// 1. Get all workers with optional filtering
app.get('/api/workers', async (req, res) => {
    const { trade, village, search } = req.query;
    let query = 'SELECT * FROM workers WHERE 1=1';
    const params = [];

    if (trade) {
        params.push(trade);
        query += ` AND trade = $${params.length}`;
    }
    if (village) {
        params.push(village);
        query += ` AND village = $${params.length}`;
    }
    if (search) {
        params.push(`%${search.toLowerCase()}%`);
        query += ` AND (LOWER(full_name) LIKE $${params.length} OR LOWER(village) LIKE $${params.length} OR LOWER(trade) LIKE $${params.length})`;
    }

    query += ' ORDER BY created_at DESC';

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Register a worker
app.post('/api/register', async (req, res) => {
    const { 
        worker_id, full_name, phone, trade, village, mandal, 
        landmark, experience, availability, details, type, 
        leader_name, members_count 
    } = req.body;

    const query = `
        INSERT INTO workers (
            worker_id, full_name, phone, trade, village, mandal, 
            landmark, experience, availability, details, type, 
            leader_name, members_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *;
    `;
    const values = [
        worker_id, full_name, phone, trade, village, mandal, 
        landmark, experience || 0, availability, details, type, 
        leader_name, members_count || 1
    ];

    try {
        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("❌ Registration Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 3. Get Stats
app.get('/api/stats', async (req, res) => {
    try {
        const totalWorkers = await pool.query('SELECT COUNT(*) FROM workers');
        const totalVillages = await pool.query('SELECT COUNT(DISTINCT village) FROM workers');
        const totalGroups = await pool.query("SELECT COUNT(*) FROM workers WHERE type = 'group'");
        
        // Mocking jobs completed as it requires another table, but we'll base it on some logic
        const jobsCompleted = parseInt(totalWorkers.rows[0].count) * 4; 

        res.json({
            registeredWorkers: totalWorkers.rows[0].count,
            villagesCovered: totalVillages.rows[0].count,
            workGroups: totalGroups.rows[0].count,
            jobsCompleted: jobsCompleted
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

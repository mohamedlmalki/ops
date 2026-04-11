// --- FILE: server/database.js ---
const Database = require('better-sqlite3');
const path = require('path');

// Create or connect to the SQLite database file in the server folder
const dbPath = path.join(__dirname, 'zoho_jobs.db');
const db = new Database(dbPath);

// Optimize database for speed
db.pragma('journal_mode = WAL');

// Initialize the table if it doesn't exist
db.prepare(`
    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        profileName TEXT NOT NULL,
        jobType TEXT NOT NULL,
        status TEXT NOT NULL,
        totalToProcess INTEGER DEFAULT 0,
        consecutiveFailures INTEGER DEFAULT 0,
        stopAfterFailures INTEGER DEFAULT 0,
        formData TEXT,
        results TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

module.exports = {
    // Create or update a full job
    upsertJob: (job) => {
        const stmt = db.prepare(`
            INSERT INTO jobs (id, profileName, jobType, status, totalToProcess, consecutiveFailures, stopAfterFailures, formData, results, updatedAt)
            VALUES (@id, @profileName, @jobType, @status, @totalToProcess, @consecutiveFailures, @stopAfterFailures, @formData, @results, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                consecutiveFailures = excluded.consecutiveFailures,
                results = excluded.results,
                updatedAt = CURRENT_TIMESTAMP
        `);
        
        stmt.run({
            id: job.id,
            profileName: job.profileName,
            jobType: job.jobType,
            status: job.status,
            totalToProcess: job.totalToProcess || 0,
            consecutiveFailures: job.consecutiveFailures || 0,
            stopAfterFailures: job.stopAfterFailures || 0,
            formData: JSON.stringify(job.formData || {}),
            results: JSON.stringify(job.results || [])
        });
    },

    // Fast update just for appending results and updating status
    updateJobProgress: (id, status, consecutiveFailures, resultsArray) => {
        const stmt = db.prepare(`
            UPDATE jobs 
            SET status = ?, consecutiveFailures = ?, results = ?, updatedAt = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
        stmt.run(status, consecutiveFailures, JSON.stringify(resultsArray), id);
    },

    updateJobStatus: (id, status) => {
        db.prepare(`UPDATE jobs SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(status, id);
    },

    // Get a specific job
    getJobById: (id) => {
        const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
        if (!row) return null;
        return {
            ...row,
            formData: JSON.parse(row.formData),
            results: JSON.parse(row.results)
        };
    },

    // For the UI Handshake: Get all jobs so the UI knows where to resume
    getAllJobs: () => {
        const rows = db.prepare(`SELECT * FROM jobs`).all();
        return rows.map(row => ({
            ...row,
            formData: JSON.parse(row.formData),
            results: JSON.parse(row.results)
        }));
    },

    // Clear specific account (Button 1)
    deleteJob: (profileName, jobType) => {
        db.prepare(`DELETE FROM jobs WHERE profileName = ? AND jobType = ?`).run(profileName, jobType);
    },

    // Clear all accounts for a module (Button 2)
    deleteAllJobsByType: (jobType) => {
        db.prepare(`DELETE FROM jobs WHERE jobType = ?`).run(jobType);
    }
};
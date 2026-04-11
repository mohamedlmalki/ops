// --- FILE: server/database.js ---
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'zoho_jobs.db');

// 🚨 ENTERPRISE UPGRADE 1: The "Waiting Room" for heavy traffic
const db = new Database(dbPath, { timeout: 7000 });

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 7000');

// ENTERPRISE UPGRADE 2: Added processingTime and processingStartTime columns
db.prepare(`
    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        profileName TEXT NOT NULL,
        jobType TEXT NOT NULL,
        status TEXT NOT NULL,
        totalToProcess INTEGER DEFAULT 0,
        consecutiveFailures INTEGER DEFAULT 0,
        stopAfterFailures INTEGER DEFAULT 0,
        processingTime INTEGER DEFAULT 0,
        processingStartTime INTEGER,
        formData TEXT,
        results TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

// Safety fallback: Automatically inject columns if user forgets to delete the old DB file
try { db.prepare(`ALTER TABLE jobs ADD COLUMN processingTime INTEGER DEFAULT 0`).run(); } catch(e) {}
try { db.prepare(`ALTER TABLE jobs ADD COLUMN processingStartTime INTEGER`).run(); } catch(e) {}

module.exports = {
    upsertJob: (job) => {
        const now = Date.now();
        const stmt = db.prepare(`
            INSERT INTO jobs (id, profileName, jobType, status, totalToProcess, consecutiveFailures, stopAfterFailures, processingTime, processingStartTime, formData, results, updatedAt)
            VALUES (@id, @profileName, @jobType, @status, @totalToProcess, @consecutiveFailures, @stopAfterFailures, @processingTime, @processingStartTime, @formData, @results, CURRENT_TIMESTAMP)
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
            processingTime: job.processingTime || 0,
            processingStartTime: job.status === 'running' ? now : null,
            formData: JSON.stringify(job.formData || {}),
            results: JSON.stringify(job.results || [])
        });
    },

    updateJobProgress: (id, status, consecutiveFailures, resultsArray) => {
        const stmt = db.prepare(`
            UPDATE jobs 
            SET status = ?, consecutiveFailures = ?, results = ?, updatedAt = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
        stmt.run(status, consecutiveFailures, JSON.stringify(resultsArray), id);
    },

    // ENTERPRISE UPGRADE 3: The Database acts as the stopwatch natively!
    updateJobStatusByProfile: (profileName, jobType, status) => {
        const job = db.prepare(`SELECT * FROM jobs WHERE profileName = ? AND jobType = ?`).get(profileName, jobType);
        if (!job) return;

        let newTime = job.processingTime || 0;
        let newStartTime = job.processingStartTime;
        const now = Date.now();

        // Calculate time when pausing, stopping, or finishing
        if (status === 'paused' || status === 'complete' || status === 'ended') {
            if (job.status === 'running' && newStartTime) {
                newTime += Math.floor((now - newStartTime) / 1000);
            }
            newStartTime = null;
        } else if (status === 'running') {
            if (job.status !== 'running') {
                newStartTime = now;
            }
        }

        db.prepare(`UPDATE jobs SET status = ?, processingTime = ?, processingStartTime = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(status, newTime, newStartTime, job.id);
    },

    getJobById: (id) => {
        const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
        if (!row) return null;
        return {
            ...row,
            formData: JSON.parse(row.formData),
            results: JSON.parse(row.results)
        };
    },

    getAllJobs: () => {
        const rows = db.prepare(`SELECT * FROM jobs`).all();
        const now = Date.now();
        return rows.map(row => {
            let currentProcessingTime = row.processingTime || 0;
            // Add live active time to the saved time to get exact accuracy on refresh
            if (row.status === 'running' && row.processingStartTime) {
                currentProcessingTime += Math.floor((now - row.processingStartTime) / 1000);
            }
            return {
                ...row,
                processingTime: currentProcessingTime,
                formData: JSON.parse(row.formData),
                results: JSON.parse(row.results)
            };
        });
    },

    deleteJob: (profileName, jobType) => {
        db.prepare(`DELETE FROM jobs WHERE profileName = ? AND jobType = ?`).run(profileName, jobType);
    },

    deleteAllJobsByType: (jobType) => {
        db.prepare(`DELETE FROM jobs WHERE jobType = ?`).run(jobType);
    }, // <-- Notice the comma here!

    // 🚨 ENTERPRISE UPGRADE 4: The auto-shrinker
    vacuumDatabase: () => {
        try {
            db.exec('VACUUM');
            console.log('[INFO] 🧹 Database automatically shrunk (VACUUM successful).');
        } catch (error) {
            console.error('[ERROR] Could not vacuum database:', error.message);
        }
    }
};
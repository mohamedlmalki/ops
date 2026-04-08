// --- FILE: server/worker.js ---
const { Worker, Queue } = require('bullmq');
const IORedis = require('ioredis');

// Connect to Redis
const connection = new IORedis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null });

let ioInstance = null; // The Walkie-Talkie to React
const activeCashiers = {}; // Keep track of hired cashiers

const setSocketIo = (io) => {
    ioInstance = io;
};

const hireCashier = (profileName) => {
    const queueName = `ticketQueue_${profileName}`;
    if (activeCashiers[queueName]) return;

    console.log(`\n[MANAGER] 🟢 HIRING NEW CASHIER: "${profileName}"`);
    console.log(`[MANAGER] 🏢 Building dedicated factory: ${queueName}...\n`);

    const deskHandler = require('./desk-handler');
    const accountQueue = new Queue(queueName, { connection });

    const worker = new Worker(queueName, async (job) => {
        const activeJobs = deskHandler.getActiveJobs();
        const jobId = job.data.jobId;

        // --- PAUSE & CANCEL SAFETY ---
        // If the job is paused, safely skip it without freezing the worker!
        if (activeJobs[jobId] && activeJobs[jobId].status === 'paused') {
            console.log(`[🧑‍💼 ${profileName}] ⏸️ Job paused. Skipping ticket: ${job.data.email}`);
            return { success: false, ignored: true };
        }
        if (activeJobs[jobId] && activeJobs[jobId].status === 'ended') {
            return { success: false, ignored: true };
        }

        // --- DO THE WORK ---
        console.log(`[🧑‍💼 ${profileName}] ⚙️ Processing: ${job.data.email}...`);
        try {
            const result = await deskHandler.processSingleTicketJob(job.data);
            console.log(`[🧑‍💼 ${profileName}] ✅ Success: ${job.data.email}`);
            
            result.jobType = 'ticket'; 
            
            // Send to React Table!
            if (ioInstance) {
                ioInstance.emit('ticketResult', result);
            } else {
                console.log(`[🚨 ERROR] Walkie-Talkie is disconnected! React won't see this!`);
            }

            checkCompletion(accountQueue, profileName);
            return result;
        } catch (err) {
            console.log(`[🧑‍💼 ${profileName}] ❌ Failed: ${job.data.email} | Reason: ${err.message.substring(0, 80)}...`);
            
            let errorData;
            try { errorData = JSON.parse(err.message); } catch(e) { errorData = { success: false, error: err.message, profileName, email: job.data.email }; }
            errorData.jobType = 'ticket';
            
            if (ioInstance) ioInstance.emit('ticketResult', errorData);

            checkCompletion(accountQueue, profileName);
            throw err;
        }

    }, { 
        connection,
        concurrency: 5 // Reduced concurrency so logs are clean and the API doesn't crash
    });

    activeCashiers[queueName] = worker;
};

// Helper to safely close the frontend table
async function checkCompletion(queue, profileName) {
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const delayed = await queue.getDelayedCount();
    
    // Only close the table if absolutely ALL rooms are empty
    if (waiting === 0 && active <= 1 && delayed === 0) { 
        if (ioInstance) ioInstance.emit('bulkComplete', { profileName, jobType: 'ticket' });
        console.log(`\n[🧑‍💼 ${profileName}] 🏁 All out of tickets! Factory is empty.\n`);
    }
}

module.exports = { hireCashier, setSocketIo, connection };
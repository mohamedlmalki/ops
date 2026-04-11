// --- FILE: server/worker.js ---
const { Worker, Queue } = require('bullmq');
const IORedis = require('ioredis');

// Connect to Redis
const connection = new IORedis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null });

let ioInstance = null; 
const activeCashiers = {}; 

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

        // 🛑 1. TOP ALARM CHECK: Don't touch the next ticket if the alarm is on!
        if (activeJobs[jobId] && (activeJobs[jobId].status === 'ended' || activeJobs[jobId].status === 'paused')) {
            if (activeJobs[jobId].status === 'paused') {
                console.log(`[🧑‍💼 ${profileName}] 🛑 Alarm is active. Holding ticket safely...`);
            }
            while (activeJobs[jobId] && activeJobs[jobId].status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 2000)); 
            }
            if (activeJobs[jobId] && activeJobs[jobId].status === 'ended') {
                return { success: false, ignored: true };
            }
        }

        // --- 2. PROCESS TICKET ---
        console.log(`[🧑‍💼 ${profileName}] ⚙️ Processing: ${job.data.email}...`);
        
        let result;
        try {
            result = await deskHandler.processSingleTicketJob(job.data);
            console.log(`[🧑‍💼 ${profileName}] ✅ Success: ${job.data.email}`);
            result.jobType = 'ticket'; 
            
            if (ioInstance) ioInstance.emit('ticketResult', result);

        } catch (err) {
            console.log(`[🧑‍💼 ${profileName}] ❌ Failed: ${job.data.email}`);
            
            let errorData;
            try { errorData = JSON.parse(err.message); } catch(e) { errorData = { success: false, error: err.message, profileName, email: job.data.email }; }
            errorData.jobType = 'ticket';
            if (ioInstance) ioInstance.emit('ticketResult', errorData);
            
            // ✨ THE MASTER COUNTER
            if (activeJobs[jobId]) {
                // Add to the permanent record (No more resetting to zero!)
                activeJobs[jobId].consecutiveFailures = (activeJobs[jobId].consecutiveFailures || 0) + 1;
                
                // Get the limit you typed in the UI
                const limit = Number(activeJobs[jobId].stopAfterFailures) || 0;
                
                console.log(`[🧑‍💼 ${profileName}] ⚠️ Failure Tracker: ${activeJobs[jobId].consecutiveFailures} / ${limit} allowed.`);
                
                // 🚨 PULL THE ALARM IF LIMIT REACHED
                if (limit > 0 && activeJobs[jobId].consecutiveFailures >= limit) {
                    if (activeJobs[jobId].status !== 'paused') {
                        activeJobs[jobId].status = 'paused'; // 🔥 FLIP THE SWITCH
                        console.log(`\n[🚨 MANAGER] 🛑 PULLING THE ALARM FOR ${profileName}! (${limit} failures hit)\n`);
                        
                        if (ioInstance) {
                            ioInstance.emit('jobPaused', { profileName, reason: `Auto-Paused: Reached limit of ${limit} failures.` });
                        }
                    }
                }
            }
        }

        // 🛑 3. BOTTOM ALARM CHECK: Freeze instantly if the alarm was just pulled
        if (activeJobs[jobId] && activeJobs[jobId].status === 'paused') {
            console.log(`[🧑‍💼 ${profileName}] ⏸️ Standing completely still. Waiting for user to click Resume...`);
            while (activeJobs[jobId] && activeJobs[jobId].status === 'paused') {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        checkCompletion(accountQueue, profileName);
        return result || { success: false };

    }, { 
        connection: connection, 
        concurrency: 1,         
        lockDuration: 90000     
    });

    activeCashiers[queueName] = worker;
};

async function checkCompletion(queue, profileName) {
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const delayed = await queue.getDelayedCount();
    
    if (waiting === 0 && active <= 1 && delayed === 0) { 
        if (ioInstance) ioInstance.emit('bulkComplete', { profileName, jobType: 'ticket' });
        console.log(`\n[🧑‍💼 ${profileName}] 🏁 All out of tickets! Factory is empty.\n`);
    }
}

module.exports = { hireCashier, setSocketIo, connection };
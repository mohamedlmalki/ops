// --- FILE: server/worker.js ---
const { Worker } = require('bullmq');
const { connection } = require('./queue');
const deskHandler = require('./desk-handler');

console.log("👷 Factory Worker started! Waiting for tickets in Redis...");

const worker = new Worker('ticketQueue', async (job) => {
    const activeJobs = deskHandler.getActiveJobs();
    
    // THE PAUSE FIX: Wait quietly without crashing or dropping the job
    while (activeJobs[job.data.jobId] && activeJobs[job.data.jobId].status === 'paused') {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // If user clicked Stop/End
    if (activeJobs[job.data.jobId] && activeJobs[job.data.jobId].status === 'ended') {
        return { success: false, ignored: true }; 
    }

    // Process the ticket
    return await deskHandler.processSingleTicketJob(job.data);

}, { 
    connection,
    concurrency: 50 // Exactly 50 tickets at a time
});

worker.on('error', err => console.error('Worker Error:', err));

module.exports = worker;
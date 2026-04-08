// --- FILE: server/desk-handler.js ---
const { Queue } = require('bullmq');
const { connection, hireCashier } = require('./worker');
const { makeApiCall, parseError, writeToTicketLog, createJobId, readTicketLog, readProfiles } = require('./utils');

let activeJobs = {};

const getActiveJobs = () => activeJobs;

const setActiveJobs = (jobsObject) => {
    activeJobs = jobsObject;
};

const getRealDeskProfile = (profiles, profileName) => {
    return profiles.find(p => p.profileName === profileName && p.desk && p.desk.cloudflareTrackingUrl)
        || profiles.find(p => p.profileName === profileName && p.desk && p.desk.defaultDepartmentId)
        || profiles.find(p => p.profileName === profileName);
};

// 🧠 ULTRA-SIMPLE SCANNER: Logs Removed for Clean CMD!
async function injectSmartTracking(description, email, selectedProfileName, deskConfig, ticketId, enableTracking) {
    if (!enableTracking) return description;

    let newText = description;
    const workerUrlRegex = /(https?:\/\/[^\s'\"<>]+workers\.dev[^\s'\"<>]*)/gi;
    let rawMatches = description.match(workerUrlRegex) || [];
    let uniqueLinks = [...new Set(rawMatches)];

    for (let rawUrl of uniqueLinks) {
        if (rawUrl.match(/\.(png|jpg|jpeg|gif|webp|svg)(?:[?#].*)?$/i) || rawUrl.includes('track.gif')) {
            continue;
        }
        if (!rawUrl.includes('?email=') && !rawUrl.includes('&email=')) {
            const separator = rawUrl.includes('?') ? '&' : '?';
            const finalTrackedLink = `${rawUrl}${separator}email=${encodeURIComponent(email)}&profile=${encodeURIComponent(selectedProfileName + '_Desk')}&ticketId=${encodeURIComponent(ticketId)}`;
            newText = newText.split(rawUrl).join(finalTrackedLink);
        }
    }

    if (deskConfig && deskConfig.cloudflareTrackingUrl) {
        const baseUrl = deskConfig.cloudflareTrackingUrl.replace(/\/$/, '').trim();
        const pixel = `<img src="${baseUrl}/track.gif?email=${encodeURIComponent(email)}&ticketId=${ticketId}&profile=${encodeURIComponent(selectedProfileName + '_Desk')}" width="1" height="1" alt="" style="display:none;" />`;
        newText += pixel;
    }
    
    return newText;
}

const handleSendSingleTicket = async (data) => {
    const { email, subject, description, selectedProfileName, sendDirectReply, enableTracking } = data;
    if (!email || !selectedProfileName) return { success: false, error: 'Missing email or profile.' };
    
    const profiles = readProfiles();
    const activeProfile = getRealDeskProfile(profiles, selectedProfileName);

    try {
        if (!activeProfile) return { success: false, error: 'Profile not found.' };
        const deskConfig = activeProfile.desk;

        const finalDescription = await injectSmartTracking(description, email, selectedProfileName, deskConfig, 'Single', enableTracking);

        const ticketData = { subject, description: finalDescription, departmentId: deskConfig.defaultDepartmentId, contact: { email }, channel: 'Email' };

        const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
        const newTicket = ticketResponse.data;
        let fullResponseData = { ticketCreate: newTicket };
        writeToTicketLog({ ticketNumber: newTicket.ticketNumber, email });

        if (sendDirectReply) {
            try {
                const replyData = { fromEmailAddress: deskConfig.fromEmailAddress, to: email, content: finalDescription, contentType: 'html', channel: 'EMAIL' };
                const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                fullResponseData.sendReply = replyResponse.data;
            } catch (replyError) { fullResponseData.sendReply = parseError(replyError); }
        }
        return { success: true, fullResponse: fullResponseData, message: `Ticket #${newTicket.ticketNumber} created.` };
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        return { success: false, error: message, fullResponse };
    }
};

const handleVerifyTicketEmail = async (data) => {
    const { ticket, profileName } = data;
    if (!ticket || !profileName) return { success: false, details: 'Missing ticket/profile.' };
    const profiles = readProfiles();
    const activeProfile = getRealDeskProfile(profiles, profileName);
    if (!activeProfile) return { success: false, details: 'Profile not found.' };
    return await verifyTicketEmail(null, { ticket, profile: activeProfile });
};

const handleSendTestTicket = async (socket, data) => {
    const { email, subject, description, selectedProfileName, sendDirectReply, verifyEmail, enableTracking } = data;
    if (!email || !selectedProfileName) return socket.emit('testTicketResult', { success: false, error: 'Missing email or profile.' });
    
    const profiles = readProfiles();
    const activeProfile = getRealDeskProfile(profiles, selectedProfileName);

    try {
        if (!activeProfile) return socket.emit('testTicketResult', { success: false, error: 'Profile not found.' });
        const deskConfig = activeProfile.desk;

        const finalDescription = await injectSmartTracking(description, email, selectedProfileName, deskConfig, 'Test', enableTracking);

        const ticketData = { subject, description: finalDescription, departmentId: deskConfig.defaultDepartmentId, contact: { email }, channel: 'Email' };

        const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
        const newTicket = ticketResponse.data;
        let fullResponseData = { ticketCreate: newTicket };
        writeToTicketLog({ ticketNumber: newTicket.ticketNumber, email });

        if (sendDirectReply) {
            try {
                const replyData = { fromEmailAddress: deskConfig.fromEmailAddress, to: email, content: finalDescription, contentType: 'html', channel: 'EMAIL' };
                const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                fullResponseData.sendReply = replyResponse.data;
            } catch (replyError) { fullResponseData.sendReply = parseError(replyError); }
        }

        socket.emit('testTicketResult', { success: true, fullResponse: fullResponseData });

        if (verifyEmail) {
            verifyTicketEmail(socket, {ticket: newTicket, profile: activeProfile, resultEventName: 'testTicketVerificationResult', email});
        }
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('testTicketResult', { success: false, error: message, fullResponse });
    }
};

const handleStartBulkCreate = async (socket, data) => {
    const { emails, subject, description, delay, selectedProfileName, sendDirectReply, verifyEmail, stopAfterFailures = 0, displayName, enableTracking } = data;
    const profiles = readProfiles();
    const activeProfile = getRealDeskProfile(profiles, selectedProfileName);
    const jobId = createJobId(socket.id, selectedProfileName, 'ticket');
    
    activeJobs[jobId] = { status: 'running', consecutiveFailures: 0, stopAfterFailures: Number(stopAfterFailures) };
    
    try {
        if (!activeProfile) throw new Error('Profile not found.');
        const deskConfig = activeProfile.desk;
        const queueName = `ticketQueue_${selectedProfileName}`;
        
        hireCashier(selectedProfileName);

        const myAccountQueue = new Queue(queueName, { connection });
        await myAccountQueue.drain(true).catch(() => {});

        // 🚨 NATIVE DELAY RESTORED: BullMQ handles the waiting!
        const jobs = emails.filter(e => e.trim()).map((email, index) => ({
            name: 'createTicket',
            data: { email, subject, description, selectedProfileName, sendDirectReply, verifyEmail, displayName, enableTracking, deskConfig, activeProfile, jobId },
            opts: { delay: delay > 0 ? index * (delay * 1000) : 0 } 
        }));

        await myAccountQueue.addBulk(jobs);
        console.log(`[QUEUE] 📦 Dropped ${jobs.length} tickets onto ${queueName}'s desk!`);

    } catch (error) {
        socket.emit('bulkError', { message: error.message || 'Error', profileName: selectedProfileName, jobType: 'ticket' });
    }
};

const processSingleTicketJob = async (jobData) => {
    const { email, subject, description, selectedProfileName, sendDirectReply, verifyEmail, displayName, enableTracking, deskConfig, activeProfile, jobId } = jobData;
    
    try {
        const finalDescription = await injectSmartTracking(description, email, selectedProfileName, deskConfig, 'Bulk', enableTracking);
        const ticketData = { subject, description: finalDescription, departmentId: deskConfig.defaultDepartmentId, contact: { email }, channel: 'Email', resolution: displayName };
        
        const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
        const newTicket = ticketResponse.data;
        let successMessage = `Ticket #${newTicket.ticketNumber} created.`;
        let fullResponseData = { ticketCreate: newTicket };
        
        writeToTicketLog({ ticketNumber: newTicket.ticketNumber, email });

        if (sendDirectReply) {
            try {
                const replyData = { fromEmailAddress: deskConfig.fromEmailAddress, to: email, content: finalDescription, contentType: 'html', channel: 'EMAIL' };
                const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                successMessage += ` Reply sent.`;
                fullResponseData.sendReply = replyResponse.data;
            } catch (replyError) {
                successMessage += ` Reply Failed: ${parseError(replyError).message}`;
            }
        }

        if (verifyEmail) {
            const verifyResult = await verifyTicketEmail(null, { ticket: newTicket, profile: activeProfile, jobId, email });
            if (!verifyResult.success) {
                throw new Error(JSON.stringify({ email, success: false, error: verifyResult.details || "Verification Failed", fullResponse: fullResponseData, profileName: selectedProfileName }));
            }
            successMessage += ` | ${verifyResult.details}`;
        }

        return { email, success: true, ticketNumber: newTicket.ticketNumber, details: successMessage, fullResponse: fullResponseData, profileName: selectedProfileName };

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        throw new Error(JSON.stringify({ email, success: false, error: message, fullResponse, profileName: selectedProfileName }));
    }
};

const verifyTicketEmail = async (socket, { ticket, profile, resultEventName = 'ticketUpdate', jobId, email }) => {
    let fullResponse = { ticketCreate: ticket, verifyEmail: {} };
    try {
        if (socket) await new Promise(resolve => setTimeout(resolve, 25000)); 
        if (jobId && activeJobs[jobId] && activeJobs[jobId].status === 'ended') return { success: false, details: 'Job Ended' };
        
        const [workflowHistoryResponse, notificationHistoryResponse] = await Promise.all([
            makeApiCall('get', `/api/v1/tickets/${ticket.id}/History?eventFilter=WorkflowHistory`, null, profile, 'desk'),
            makeApiCall('get', `/api/v1/tickets/${ticket.id}/History?eventFilter=NotificationRuleHistory`, null, profile, 'desk')
        ]);

        const allHistoryEvents = [ ...(workflowHistoryResponse.data?.data || []), ...(notificationHistoryResponse.data?.data || []) ];
        fullResponse.verifyEmail.history = { workflowHistory: workflowHistoryResponse.data, notificationHistory: notificationHistoryResponse.data };

        if (allHistoryEvents.length > 0) {
            let eventDetails = [];
            allHistoryEvents.forEach(evt => {
                let detailStr = '';
                const actorType = evt.actor?.type;
                const actorName = evt.actor?.name || 'Unknown';
                const eventName = evt.eventName;

                if (actorType === 'NotificationRule') {
                    detailStr = `Notification: "${actorName}"`;
                } else if (actorType === 'Workflow') {
                    if (eventName === 'CustomFunctionExecuted') {
                        const funcNameInfo = evt.actorInfo?.find(info => info.propertyName === 'CustomFunctionName');
                        const funcName = funcNameInfo ? funcNameInfo.propertyValue : 'Unknown';
                        detailStr = `Function: "${funcName}"`;
                    } else if (eventName === 'NotificationSent') {
                        const alertNameInfo = evt.actorInfo?.find(info => info.propertyName === 'AlertName');
                        const alertName = alertNameInfo ? alertNameInfo.propertyValue : 'Unknown Alert';
                        detailStr = `Alert: "${alertName}"`;
                    } else {
                        detailStr = `Workflow: "${actorName}"`;
                    }
                } else if (actorType) {
                     detailStr = `${actorType}: "${actorName}"`;
                }

                if (detailStr && !eventDetails.includes(detailStr)) {
                    eventDetails.push(detailStr);
                }
            });

            const detailsMessage = eventDetails.length > 0 ? `Verified: ${eventDetails.join(' | ')}` : 'Verified: Automation executed.';

            if (jobId && activeJobs[jobId]) activeJobs[jobId].consecutiveFailures = 0;
            if (socket) {
                socket.emit(resultEventName, { 
                    ticketNumber: ticket.ticketNumber, success: true, details: detailsMessage, fullResponse, profileName: profile.profileName, email: email 
                });
            }
            return { success: true, details: detailsMessage };
        } else {
            const failureResponse = await makeApiCall('get', `/api/v1/emailFailureAlerts?department=${profile.desk.defaultDepartmentId}`, null, profile, 'desk');
            const failure = failureResponse.data.data?.find(f => String(f.ticketNumber) === String(ticket.ticketNumber));
            fullResponse.verifyEmail.failure = failure || "No specific failure found.";
            const failMessage = failure ? `Verification Failed: ${failure.reason}` : 'Verification Failed: No automation history found.';

            if (jobId && activeJobs[jobId]) {
                activeJobs[jobId].consecutiveFailures++;
                if (activeJobs[jobId].stopAfterFailures > 0 && activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                    if (activeJobs[jobId].status !== 'paused') {
                        activeJobs[jobId].status = 'paused';
                        if (socket) socket.emit('jobPaused', { profileName: profile.profileName, reason: `Paused: Verification failed for #${ticket.ticketNumber}.` });
                    }
                }
            }

            if (socket) {
                socket.emit(resultEventName, { 
                    ticketNumber: ticket.ticketNumber, success: false, details: failMessage, fullResponse, profileName: profile.profileName, email: email 
                });
            }
            return { success: false, details: failMessage };
        }
    } catch (error) {
        const { message, fullResponse: errorResponse } = parseError(error);
        fullResponse.verifyEmail.error = errorResponse;
        
        if (jobId && activeJobs[jobId]) {
            activeJobs[jobId].consecutiveFailures++;
             if (activeJobs[jobId].stopAfterFailures > 0 && activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                if (activeJobs[jobId].status !== 'paused') {
                    activeJobs[jobId].status = 'paused';
                    if (socket) socket.emit('jobPaused', { profileName: profile.profileName, reason: `Paused: Verification Error.` });
                }
            }
        }

        if (socket) {
             socket.emit(resultEventName, { ticketNumber: ticket.ticketNumber, success: false, details: `Verification Error: ${message}`, fullResponse, profileName: profile.profileName, email: email });
        }
        return { success: false, details: message };
    }
};

const handleGetEmailFailures = async (socket, data) => {
    try {
        const profiles = readProfiles();
        const activeProfile = getRealDeskProfile(profiles, data.selectedProfileName);

        if (!activeProfile || !activeProfile.desk) throw new Error('Desk profile not found for fetching email failures.');

        const departmentId = activeProfile.desk.defaultDepartmentId;
        const response = await makeApiCall('get', `/api/v1/emailFailureAlerts?department=${departmentId}&limit=50`, null, activeProfile, 'desk');
        
        const failures = response.data.data || [];
        const ticketLog = readTicketLog();
        const failuresWithEmails = failures.map(failure => {
            const logEntry = ticketLog.find(entry => String(entry.ticketNumber) === String(failure.ticketNumber));
            return { ...failure, email: logEntry ? logEntry.email : 'Unknown' };
        });

        socket.emit('emailFailuresResult', { success: true, data: failuresWithEmails });
    } catch (error) {
        socket.emit('emailFailuresResult', { success: false, error: parseError(error).message });
    }
};

const handleClearEmailFailures = async (socket, data) => {
    try {
        const profiles = readProfiles();
        const activeProfile = getRealDeskProfile(profiles, data.selectedProfileName);

        if (!activeProfile || !activeProfile.desk) throw new Error('Desk profile not found for clearing email failures.');

        const departmentId = activeProfile.desk.defaultDepartmentId;
        await makeApiCall('patch', `/api/v1/emailFailureAlerts?department=${departmentId}`, null, activeProfile, 'desk');
        
        socket.emit('clearEmailFailuresResult', { success: true });
    } catch (error) {
        socket.emit('clearEmailFailuresResult', { success: false, error: parseError(error).message });
    }
};

const handleGetMailReplyAddressDetails = async (socket, data) => {
    try {
        const profiles = readProfiles();
        const activeProfile = getRealDeskProfile(profiles, data.selectedProfileName);

        if (!activeProfile || !activeProfile.desk) return socket.emit('mailReplyAddressDetailsResult', { success: false, error: 'Desk profile not found' });
        
        const mailReplyAddressId = activeProfile.desk.mailReplyAddressId;
        if (!mailReplyAddressId) return socket.emit('mailReplyAddressDetailsResult', { success: true, notConfigured: true });

        const response = await makeApiCall('get', `/api/v1/mailReplyAddress/${mailReplyAddressId}`, null, activeProfile, 'desk');
        socket.emit('mailReplyAddressDetailsResult', { success: true, data: response.data });

    } catch (error) {
        socket.emit('mailReplyAddressDetailsResult', { success: false, error: parseError(error).message });
    }
};

const handleUpdateMailReplyAddressDetails = async (socket, data) => {
    try {
        const { displayName, selectedProfileName } = data;
        const profiles = readProfiles();
        const activeProfile = getRealDeskProfile(profiles, selectedProfileName);

        if (!activeProfile || !activeProfile.desk || !activeProfile.desk.mailReplyAddressId) throw new Error('Mail Reply Address ID is not configured for this profile.');

        const mailReplyAddressId = activeProfile.desk.mailReplyAddressId;
        const response = await makeApiCall('patch', `/api/v1/mailReplyAddress/${mailReplyAddressId}`, { displayName }, activeProfile, 'desk');
        
        socket.emit('mailReplyAddressDetailsResult', { success: true, data: response.data });
    } catch (error) {
        socket.emit('mailReplyAddressDetailsResult', { success: false, error: parseError(error).message });
    }
};

const handleGetDeskOrganizations = async (socket, data) => {
    try {
        const profile = data.activeProfile || data.profile || data;
        const response = await makeApiCall('get', '/api/v1/organizations', null, profile, 'desk');
        socket.emit('deskOrganizationsResult', { success: true, organizations: response.data.data || response.data });
    } catch (error) {
        socket.emit('deskOrganizationsError', { success: false, message: parseError(error).message });
    }
};

const handleGetDeskDepartments = async (socket, data) => {
    try {
        const profile = data.activeProfile || data.profile || data;
        if (data.orgId && (!profile.desk || !profile.desk.orgId)) {
            if(!profile.desk) profile.desk = {};
            profile.desk.orgId = data.orgId;
        }
        const response = await makeApiCall('get', '/api/v1/departments', null, profile, 'desk');
        socket.emit('deskDepartmentsResult', { success: true, departments: response.data.data || response.data });
    } catch (error) {
        socket.emit('deskDepartmentsError', { success: false, message: parseError(error).message });
    }
};

const handleGetDeskMailAddresses = async (socket, data) => {
    try {
        const profile = data.activeProfile || data.profile || data;
        if (data.orgId && (!profile.desk || !profile.desk.orgId)) {
            if(!profile.desk) profile.desk = {};
            profile.desk.orgId = data.orgId;
        }
        let url = '/api/v1/mailReplyAddress';
        if (data.departmentId) url += `?departmentId=${data.departmentId}`;
        const response = await makeApiCall('get', url, null, profile, 'desk');
        socket.emit('deskMailAddressesResult', { success: true, mailAddresses: response.data.data || response.data });
    } catch (error) {
        socket.emit('deskMailAddressesError', { success: false, message: parseError(error).message });
    }
};

module.exports = {
    setActiveJobs, getActiveJobs, handleSendTestTicket, handleStartBulkCreate, handleGetEmailFailures, handleClearEmailFailures, handleGetMailReplyAddressDetails, handleUpdateMailReplyAddressDetails, handleSendSingleTicket, handleVerifyTicketEmail, handleGetDeskOrganizations, handleGetDeskDepartments, handleGetDeskMailAddresses, processSingleTicketJob
};
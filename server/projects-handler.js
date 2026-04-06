// --- FILE: server/projects-handler.js ---

const { getValidAccessToken, makeApiCall, parseError, createJobId, readProfiles } = require('./utils');
const { delay } = require('./utils'); 
const axios = require('axios'); 

let activeJobs = {};

const getRealProjectsProfile = (profiles, profileName) => {
    return profiles.find(p => p.profileName === profileName && p.projects && p.projects.cloudflareTrackingUrl)
        || profiles.find(p => p.profileName === profileName && p.projects && p.projects.portalId)
        || profiles.find(p => p.profileName === profileName);
};

function injectProjectsTracking(dataForThisTask, taskDescription, email, selectedProfileName, projectsConfig, enableTracking) {
    console.log(`\n========== [DEBUG: PROJECTS TRACKING] ==========`);
    console.log(`[dev:server] 🔍 STARTING GPS TRACKING INJECTOR FOR: ${email}`);

    if (!enableTracking) {
        console.log(`[dev:server] ⚠️ Tracking Checkbox is OFF. Sending normal task.`);
        console.log(`================================================\n`);
        return { updatedDataForThisTask: dataForThisTask, updatedTaskDescription: taskDescription };
    }

    let updatedDataForThisTask = { ...dataForThisTask };
    let updatedTaskDescription = typeof taskDescription === 'string' ? taskDescription : '';

    // --- PREPARE THE EXACT DESK PIXEL ---
    let pixelHtml = "";
    let pixelInjected = false;
    if (projectsConfig && projectsConfig.cloudflareTrackingUrl) {
        const baseUrl = projectsConfig.cloudflareTrackingUrl.replace(/\/$/, '').trim();
        // Exact pixel from Desk with display:none
        pixelHtml = `<img src="${baseUrl}/track.gif?email=${encodeURIComponent(email)}&ticketId=Projects&profile=${encodeURIComponent(selectedProfileName + '_Projects')}" width="1" height="1" alt="" style="display:none;" />`;
    }

    // --- PART 1: PROCESS CUSTOM FIELDS USING "GPS MAPPING" ---
    let customFieldKeys = Object.keys(updatedDataForThisTask).filter(k => typeof updatedDataForThisTask[k] === 'string');
    customFieldKeys.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));

    let fieldBoundaries = [];
    let currentOffset = 0;
    let combinedString = "";

    for (let key of customFieldKeys) {
        let text = updatedDataForThisTask[key];
        combinedString += text;
        fieldBoundaries.push({
            key: key,
            start: currentOffset,
            end: currentOffset + text.length
        });
        currentOffset += text.length;
    }

    let insertionsByField = {};
    for (let key of customFieldKeys) insertionsByField[key] = [];

    const urlRegex = /(https?:\/\/[^\s'\"<>]+|www\.[^\s'\"<>]+)/gi;
    let match;
    let foundCount = 0;

    while ((match = urlRegex.exec(combinedString)) !== null) {
        let rawUrl = match[0];
        
        if (rawUrl.match(/\.(png|jpg|jpeg|gif|webp|svg)(?:[?#].*)?$/i) || rawUrl.includes('track.gif')) continue;
        if (!rawUrl.toLowerCase().includes('worker')) continue;
        if (rawUrl.includes('?email=') || rawUrl.includes('&email=')) continue;

        foundCount++;
        const sep = rawUrl.includes('?') ? '&' : '?';
        const paramsToInject = `${sep}email=${encodeURIComponent(email)}&profile=${encodeURIComponent(selectedProfileName + '_Projects')}&ticketId=Projects`;

        let injectionAbsoluteIndex = match.index + rawUrl.length;

        for (let boundary of fieldBoundaries) {
            if (injectionAbsoluteIndex > boundary.start && injectionAbsoluteIndex <= boundary.end) {
                let localIndex = injectionAbsoluteIndex - boundary.start;
                insertionsByField[boundary.key].push({
                    localIndex: localIndex,
                    textToInsert: paramsToInject,
                    rawUrl: rawUrl
                });
                break;
            }
        }
    }

    if (foundCount === 0) console.log(`[dev:server] ⚪ No valid Worker links found in Custom Fields.`);

    for (let key of customFieldKeys) {
        let insertions = insertionsByField[key];
        if (insertions.length > 0) {
            insertions.sort((a, b) => b.localIndex - a.localIndex);
            let text = updatedDataForThisTask[key];
            
            for (let ins of insertions) {
                console.log(`[dev:server] 💉 INJECTED parameters safely into [${key}] for URL: ${ins.rawUrl}`);
                text = text.substring(0, ins.localIndex) + ins.textToInsert + text.substring(ins.localIndex);
            }

            // 🚨 THE FIX: Inject the Pixel into the Custom Field so your Deluge script emails it!
            if (pixelHtml && !pixelInjected) {
                if (text.length + pixelHtml.length <= 1000) { // Safety check for your 1K limit
                    text += pixelHtml;
                    pixelInjected = true;
                    console.log(`[dev:server] 🖼️ Injected exact Desk Open Pixel into Custom Field [${key}]!`);
                } else {
                    console.log(`[dev:server] ⚠️ Could not put pixel in [${key}] (1000 char limit). Will try next field.`);
                }
            }

            updatedDataForThisTask[key] = text;
        }
    }

    // --- PART 2: PROCESS TASK DESCRIPTION ---
    const descMatches = updatedTaskDescription.match(urlRegex) || [];
    if (descMatches.length > 0) {
        console.log(`[dev:server] 📝 Scanning Task Description... Found links.`);
        updatedTaskDescription = updatedTaskDescription.replace(urlRegex, (rawUrl) => {
            if (rawUrl.match(/\.(png|jpg|jpeg|gif|webp|svg)(?:[?#].*)?$/i) || rawUrl.includes('track.gif')) return rawUrl;
            if (!rawUrl.toLowerCase().includes('worker')) return rawUrl;
            if (rawUrl.includes('?email=') || rawUrl.includes('&email=')) return rawUrl;
            
            const sep = rawUrl.includes('?') ? '&' : '?';
            const finalTrackedLink = `${rawUrl}${sep}email=${encodeURIComponent(email)}&profile=${encodeURIComponent(selectedProfileName + '_Projects')}&ticketId=Projects`;
            console.log(`[dev:server] 💉 INJECTED into Task Description.`);
            return finalTrackedLink;
        });
    } else {
        console.log(`[dev:server] ⚪ No Worker links found in Task Description.`);
    }


    // --- PART 3: PIXEL FALLBACK (If custom fields were empty or too full) ---
    if (pixelHtml && !pixelInjected) {
        updatedTaskDescription += pixelHtml;
        console.log(`[dev:server] 🖼️ Injected Open Pixel into Description (Fallback).`);
    } else if (!pixelHtml) {
        console.log(`[dev:server] ❌ No Cloudflare Tracking URL found. Pixel NOT added.`);
    }

    console.log(`[dev:server] 🏁 PROJECTS INJECTOR COMPLETE.`);
    console.log(`================================================\n`);

    return { updatedDataForThisTask, updatedTaskDescription };
}

async function getApiNameMap(portalId, projectId, activeProfile) {
    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const domain = 'https://projectsapi.zoho.com';
        const apiUrl = `${domain}/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`;

        const response = await axios.get(apiUrl, {
            headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` },
            timeout: 10000 
        });
        
        const layout = response.data;
        if (!layout || !layout.layout_id) {
            throw new Error('No task layout found for this project.');
        }

        const apiNameMap = {};
        if (layout.section_details) {
            for (const section of layout.section_details) {
                if (section.customfield_details) {
                    for (const field of section.customfield_details) {
                        apiNameMap[field.column_name] = field.api_name;
                    }
                }
            }
        }
        
        apiNameMap["name"] = "name"; 
        return apiNameMap; 

    } catch (error) {
        throw new Error(`Failed to get task layout map: ${parseError(error).message}`);
    }
}

function buildSmartV3Payload(data, apiNameMap) {
    const { taskName, taskDescription, tasklistId, bulkDefaultData } = data;
    const payload = { name: taskName, tasklist: { id: tasklistId } };
    if (taskDescription) payload.description = taskDescription;

    if (bulkDefaultData) {
        for (const [columnName, value] of Object.entries(bulkDefaultData)) {
            if (!value) continue; 
            const apiName = apiNameMap[columnName];
            if (apiName) payload[apiName] = value;
        }
    }
    return payload;
}

const setActiveJobs = (jobs) => { activeJobs = jobs; };

const interruptibleSleep = (ms, jobId) => {
    return new Promise(resolve => {
        if (ms <= 0) return resolve();
        const interval = 100;
        let elapsed = 0;
        const timerId = setInterval(() => {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') {
                clearInterval(timerId);
                return resolve();
            }
            elapsed += interval;
            if (elapsed >= ms) {
                clearInterval(timerId);
                resolve();
            }
        }, interval);
    });
};

const handleGetPortals = async (socket, data) => {
    const { clientId, clientSecret, refreshToken } = data;
    const tempProfile = {
        profileName: `temp_portal_fetch_${clientId || Date.now()}`, 
        clientId, clientSecret, refreshToken, projects: { portalId: '' }
    };
    try {
        await getValidAccessToken(tempProfile, 'projects');
        const response = await makeApiCall('get', '/portals', null, tempProfile, 'projects');
        if (Array.isArray(response.data) && response.data.length > 0) socket.emit('projectsPortalsResult', { portals: response.data });
        else socket.emit('projectsPortalsResult', { portals: [] });
    } catch (error) {
        socket.emit('projectsPortalsError', { message: parseError(error).message || 'Failed to fetch portals.' });
    }
};

const handleGetProjects = async (socket, data) => {
    const { activeProfile } = data;
    const portalId = activeProfile.projects?.portalId;
    if (!portalId) return socket.emit('projectsProjectsResult', { success: false, error: 'Portal ID missing.', data: [] });

    try {
        const path = `/portal/${portalId}/projects`;
        const response = await makeApiCall('get', path, null, activeProfile, 'projects');
        const projects = Array.isArray(response.data) ? response.data : (response.data.projects || []); 
        socket.emit('projectsProjectsResult', { success: true, data: projects });
    } catch (error) {
        socket.emit('projectsProjectsResult', { success: false, error: parseError(error).message, data: [] });
    }
};

const handleGetTaskLists = async (socket, data) => {
    const { activeProfile, projectId } = data;
    const portalId = activeProfile.projects?.portalId;
    if (!portalId) return socket.emit('projectsTaskListsResult', { success: false, error: 'Portal ID missing.', data: [] });

    try {
        const path = `/portal/${portalId}/all-tasklists`;
        const queryParams = projectId ? { project_id: projectId } : {};
        
        const response = await makeApiCall('get', path, null, activeProfile, 'projects', queryParams);
        const taskLists = response.data.tasklists || [];
        socket.emit('projectsTaskListsResult', { success: true, data: Array.isArray(taskLists) ? taskLists : [] });
    } catch (error) {
        socket.emit('projectsTaskListsResult', { success: false, error: parseError(error).message, data: [] });
    }
};

const handleGetTasks = async (socket, data) => {
    const { activeProfile, queryParams = {} } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) return socket.emit('projectsTasksResult', { success: false, error: 'Portal ID missing.', data: [] });

    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const targetLimit = parseInt(queryParams.limit) || 100;
        let allTasks = [];
        
        const projectId = queryParams.project_id;
        let basePath = `/api/v3/portal/${portalId}/tasks`;
        if (projectId) basePath = `/api/v3/portal/${portalId}/projects/${projectId}/tasks`;

        socket.emit('projectsTasksLog', { type: 'info', message: `🚀 Fetching up to ${targetLimit} tasks...` });

        const statusesToFetch = ['open', 'closed'];

        for (const currentStatus of statusesToFetch) {
            if (allTasks.length >= targetLimit) break;

            let page = 1; 
            let hasMore = true;

            while (allTasks.length < targetLimit && hasMore) {
                const per_page = 100; 
                const fetchUrl = `https://projectsapi.zoho.com${basePath}`;

                try {
                    const response = await axios.get(fetchUrl, {
                        headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` },
                        params: { page, per_page, status: currentStatus }, 
                        timeout: 10000 
                    });

                    const tasks = response.data.tasks || [];
                    const newTasks = tasks.filter(t => !allTasks.some(existing => (existing.id_string || String(existing.id)) === (t.id_string || String(t.id))));
                    
                    if (tasks.length === 0 || (newTasks.length === 0 && tasks.length > 0)) {
                        hasMore = false; 
                    } else {
                        allTasks = allTasks.concat(newTasks);
                        page++; 
                    }

                    if (response.data.page_info && response.data.page_info.has_next_page === false) {
                        hasMore = false;
                    } else if (tasks.length < per_page) {
                        hasMore = false;
                    }

                } catch (apiError) {
                    if (apiError.response && (apiError.response.status === 400 || apiError.response.status === 404)) {
                        hasMore = false;
                        break;
                    } else {
                        throw apiError;
                    }
                }
            }
        }
        
        if (allTasks.length > targetLimit) allTasks = allTasks.slice(0, targetLimit);
        socket.emit('projectsTasksResult', { success: true, data: allTasks, pageInfo: { total_fetched: allTasks.length } });

    } catch (error) {
        socket.emit('projectsTasksResult', { success: false, error: error.message, data: [] });
    }
};

const handleCreateSingleTask = async (data, providedMap = null) => {
    const { portalId, projectId, tasklistId, selectedProfileName } = data; 
    
    const profiles = readProfiles();
    const activeProfile = getRealProjectsProfile(profiles, selectedProfileName);
    
    if (!activeProfile || !portalId || !projectId || !tasklistId) return { success: false, error: 'Missing parameters.' };

    try {
        const path = `/portal/${portalId}/projects/${projectId}/tasks`;
        const apiNameMap = providedMap || await getApiNameMap(portalId, projectId, activeProfile);
        const taskData = buildSmartV3Payload(data, apiNameMap);
        
        const reverseMap = {};
        if (apiNameMap) Object.entries(apiNameMap).forEach(([label, apiName]) => reverseMap[apiName] = label);

        const response = await makeApiCall('post', path, taskData, activeProfile, 'projects', {}, reverseMap);
        
        let newTask;
        if (response.data && response.data.id && response.data.name) newTask = response.data;
        else if (response.data.tasks && Array.isArray(response.data.tasks) && response.data.tasks.length > 0) newTask = response.data.tasks[0];

        if (newTask) return { success: true, fullResponse: newTask, message: `Task "${newTask.name}" created successfully.`, taskId: newTask.id, taskPrefix: newTask.prefix };
        return { success: false, error: 'Format error', fullResponse: response.data };

    } catch (error) {
        return { success: false, error: parseError(error).message, fullResponse: parseError(error).fullResponse };
    }
};

const handleStartBulkCreateTasks = async (socket, data) => {
    const { formData, selectedProfileName } = data;
    const { taskName, primaryField, primaryValues, projectId, taskDescription, tasklistId, delay, bulkDefaultData, stopAfterFailures = 4, enableTracking } = formData; 
    
    const profiles = readProfiles();
    const realProfile = getRealProjectsProfile(profiles, selectedProfileName);

    const jobId = createJobId(socket.id, selectedProfileName, 'projects');
    activeJobs[jobId] = { status: 'running', consecutiveFailures: 0, stopAfterFailures: Number(stopAfterFailures) };
    
    const tasksToProcess = primaryValues.split('\n').map(name => name.trim()).filter(t => t.length > 0);
    if (tasksToProcess.length === 0) return socket.emit('bulkError', { message: 'No valid primary values provided.', profileName: selectedProfileName, jobType: 'projects' });
    
    const jobState = activeJobs[jobId] || {};
    jobState.totalToProcess = tasksToProcess.length;

    try {
        if (!realProfile || !realProfile.projects) throw new Error("Projects profile not found.");
        
        const portalId = realProfile.projects.portalId;
        const sharedApiNameMap = await getApiNameMap(portalId, projectId, realProfile);

        for (let i = 0; i < tasksToProcess.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') await new Promise(resolve => setTimeout(resolve, 500));

            if (activeJobs[jobId].stopAfterFailures > 0 && activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                 if (activeJobs[jobId].status !== 'paused') {
                     activeJobs[jobId].status = 'paused';
                     socket.emit('jobPaused', { profileName: selectedProfileName, reason: `Paused automatically after failures.` });
                 }
                 while (activeJobs[jobId]?.status === 'paused') await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const currentValue = tasksToProcess[i];
            let dataForThisTask = { ...bulkDefaultData }; 
            if (primaryField !== 'name') dataForThisTask[primaryField] = currentValue; 
            
            const trackingData = injectProjectsTracking(dataForThisTask, taskDescription, currentValue, selectedProfileName, realProfile.projects, enableTracking);
            
            dataForThisTask = trackingData.updatedDataForThisTask;
            const finalTaskDescription = trackingData.updatedTaskDescription;

            const result = await handleCreateSingleTask({
                portalId, projectId, taskName: primaryField === 'name' ? currentValue : `${taskName}_${i + 1}`, 
                taskDescription: finalTaskDescription, tasklistId, selectedProfileName, bulkDefaultData: dataForThisTask 
            }, sharedApiNameMap);
            
            if (result.success) {
                if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures = 0;
                socket.emit('projectsResult', { projectName: currentValue, success: true, details: result.message, fullResponse: result.fullResponse, profileName: selectedProfileName });
            } else {
                if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures++;
                socket.emit('projectsResult', { projectName: currentValue, success: false, error: result.error, fullResponse: result.fullResponse, profileName: selectedProfileName });
            }
        }
    } catch (error) {
        socket.emit('bulkError', { message: error.message, profileName: selectedProfileName, jobType: 'projects' });
    } finally {
        if (activeJobs[jobId]) {
            if (activeJobs[jobId].status === 'ended') socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'projects' });
            else socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'projects' });
            delete activeJobs[jobId];
        }
    }
};

const handleStartBulkDeleteTasks = async (socket, data) => {
    const { activeProfile: frontendProfile, selectedProfileName, portalId, projectId, taskIds, deleteAll } = data;
    const profiles = readProfiles();
    const activeProfile = getRealProjectsProfile(profiles, selectedProfileName) || frontendProfile;

    const jobId = createJobId(socket.id, selectedProfileName, 'projects_delete');
    activeJobs[jobId] = { status: 'running', type: 'delete' };

    try {
        let { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const domain = 'https://projectsapi.zoho.com';

        let targetIds = taskIds || [];

        if (deleteAll) {
             targetIds = [];
             const statusesToFetch = ['open', 'closed'];
             for (const currentStatus of statusesToFetch) {
                 let page = 1;
                 let hasMore = true;
                 while(hasMore && activeJobs[jobId].status !== 'ended') {
                     const fetchUrl = `${domain}/api/v3/portal/${portalId}/projects/${projectId}/tasks`;
                     try {
                         const response = await axios.get(fetchUrl, { 
                             headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` },
                             params: { page, per_page: 100, status: currentStatus }, 
                             timeout: 10000 
                         });
                         const tasks = response.data.tasks || [];
                         const newTasks = tasks.filter(t => !targetIds.includes(t.id_string || String(t.id)));
                         
                         if (newTasks.length > 0) {
                             targetIds.push(...newTasks.map(t => t.id_string || String(t.id)));
                             page++;
                         } else {
                             hasMore = false;
                         }

                         if (response.data.page_info && response.data.page_info.has_next_page === false) {
                             hasMore = false;
                         }
                     } catch(err) {
                         if (err.response && (err.response.status === 400 || err.response.status === 404)) hasMore = false; 
                         else throw err;
                     }
                 }
             }
        }

        activeJobs[jobId].totalToProcess = targetIds.length;
        socket.emit('projectsDeleteStarted', { total: targetIds.length, profileName: selectedProfileName });

        for (let i = 0; i < targetIds.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            const taskId = targetIds[i];
            let isDeleted = false;
            let retryCount = 0;

            while (!isDeleted && retryCount < 3) {
                if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
                try {
                    const deleteUrl = `${domain}/api/v3/portal/${portalId}/projects/${projectId}/tasks/${taskId}`;
                    await axios.delete(deleteUrl, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
                    socket.emit('projectsDeleteResult', { success: true, taskId, profileName: selectedProfileName });
                    isDeleted = true;
                } catch (err) {
                    const status = err.response?.status;
                    const errorCode = err.response?.data?.error?.code;
                    let errorMessage = err.message;
                    if (err.response) errorMessage = err.response.data?.error?.details?.[0]?.message || err.response.data?.message || err.message;

                    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
                        retryCount++; await interruptibleSleep(2000, jobId);
                    } else if (status === 401) {
                        const refreshed = await getValidAccessToken(activeProfile, 'projects', true); 
                        access_token = refreshed.access_token;
                        retryCount++;
                    } else if (status === 429 || errorCode === 8535 || errorCode === 6504 || (errorMessage && errorMessage.toLowerCase().includes('more than'))) {
                        let waitMinutes = 2; 
                        const waitMatch = errorMessage.match(/after (\d+) minutes/);
                        if (waitMatch) waitMinutes = parseInt(waitMatch[1]) + 1;
                        await interruptibleSleep(waitMinutes * 60000, jobId); 
                        retryCount++;
                    } else if (status >= 500) {
                        await interruptibleSleep(10000, jobId); retryCount++;
                    } else if (status === 404) {
                        socket.emit('projectsDeleteResult', { success: true, taskId, profileName: selectedProfileName });
                        isDeleted = true;
                    } else {
                        socket.emit('projectsDeleteResult', { success: false, taskId, error: errorMessage, profileName: selectedProfileName });
                        break; 
                    }
                }
            }
            await interruptibleSleep(1500, jobId); 
        }
    } catch (err) {
        socket.emit('projectsDeleteError', { message: err.message, profileName: selectedProfileName });
    } finally {
        if (activeJobs[jobId]) {
            socket.emit('bulkDeleteComplete', { profileName: selectedProfileName });
            delete activeJobs[jobId];
        }
    }
};

const handleGetTaskLayout = async (socket, data) => {
    const { activeProfile, projectId } = data;
    const portalId = activeProfile.projects?.portalId;
    if (!portalId || !projectId) return socket.emit('projectsTaskLayoutResult', { success: false, error: 'Portal/Project missing.' });

    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const apiUrl = `https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`;
        const response = await axios.get(apiUrl, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
        const layout = response.data; 

        if (!layout || !layout.layout_id) throw new Error('No task layout found.');

        socket.emit('projectsTaskLayoutResult', { success: true, data: layout });
    } catch (error) {
        let message = error.response?.data?.error?.details?.[0]?.message || error.response?.data?.message || error.message;
        socket.emit('projectsTaskLayoutResult', { success: false, error: message, fullResponse: error.response?.data });
    }
};

const handleGetProjectDetails = async (socket, data) => {
    const { activeProfile, portalId, projectId } = data;
    if (!portalId || !projectId) return socket.emit('projectsProjectDetailsError', { success: false, error: 'Portal/Project ID missing.' });

    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const apiUrl = `https://projectsapi.zoho.com/api/v3/portal/${portalId}/projects/${projectId}`;
        const response = await axios.get(apiUrl, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
        socket.emit('projectsProjectDetailsResult', { success: true, data: response.data });
    } catch (error) {
        socket.emit('projectsProjectDetailsError', { success: false, error: parseError(error).message, fullResponse: parseError(error).fullResponse });
    }
};

const handleUpdateProjectDetails = async (socket, data) => {
    const { activeProfile, portalId, projectId, payload } = data; 
    if (!portalId || !projectId || !payload) return socket.emit('projectsUpdateProjectError', { success: false, error: 'Missing parameters.' });

    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const apiUrl = `https://projectsapi.zoho.com/api/v3/portal/${portalId}/projects/${projectId}`;
        const response = await axios.patch(apiUrl, payload, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
        socket.emit('projectsUpdateProjectResult', { success: true, data: response.data });
    } catch (error) {
        socket.emit('projectsUpdateProjectError', { success: false, error: parseError(error).message, fullResponse: parseError(error).fullResponse });
    }
};

const getTaskModuleId = async (portalId, activeProfile) => {
    const { access_token } = await getValidAccessToken(activeProfile, 'projects');
    const apiUrl = `https://projectsapi.zoho.com/api/v3/portal/${portalId}/settings/modules`;
    const response = await axios.get(apiUrl, {
        headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` },
        timeout: 10000
    });

    const modules = Array.isArray(response.data) ? response.data : (response.data?.modules || response.data?.data || []);
    const taskModule = modules.find((module) => {
        const candidates = [module?.api_name, module?.name, module?.module_name, module?.display_name].filter(Boolean).map(v => String(v).toLowerCase());
        return candidates.includes('tasks') || candidates.includes('task');
    });

    if (!taskModule) throw new Error('Could not find the Tasks module in Zoho Projects.');
    return taskModule.id || taskModule.module_id || taskModule.moduleId;
};

const findFieldInLayout = (layout, fieldLookupValue) => {
    if (!layout || !Array.isArray(layout.section_details)) return null;
    for (const section of layout.section_details) {
        const fields = section.customfield_details || [];
        const found = fields.find((field) => {
            const candidates = [ field.column_name, field.api_name, field.display_name, field.i18n_display_name, field.id, field.field_id ].filter(Boolean).map(v => String(v).toLowerCase());
            return candidates.includes(String(fieldLookupValue || '').toLowerCase());
        });
        if (found) return found;
    }
    return null;
};

const handleCreateTaskField = async ({ activeProfile, portalId, projectId, layoutId, displayName, fieldType }) => {
    const { access_token } = await getValidAccessToken(activeProfile, 'projects');
    const moduleId = await getTaskModuleId(portalId, activeProfile);

    const layoutResponse = await axios.get(`https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000
    });

    const firstSection = layoutResponse.data?.section_details?.[0];
    const sectionId = firstSection?.id || firstSection?.section_id;

    if (!sectionId) throw new Error("Could not locate a Section ID.");

    let exactFieldType = "singleline";
    if (fieldType === "multiline" || fieldType === "textarea") exactFieldType = "multiline";
    if (fieldType === "integer" || fieldType === "number") exactFieldType = "integer";
    if (fieldType === "email") exactFieldType = "email"; 
    
    const fieldPayload = {
        module: String(moduleId),
        layout_id: String(layoutId),
        section_id: String(sectionId),
        field_type: exactFieldType,
        display_name: displayName, 
        field_property: { is_pii: false, is_encrypted: false, context_property: { is_mandatory: false, has_info: false } }
    };

    const createFieldUrl = `https://projectsapi.zoho.com/api/v3/portal/${portalId}/settings/fields`;

    try {
        const createdFieldResponse = await axios.put(createFieldUrl, fieldPayload, {
            headers: { 'Authorization': `Zoho-oauthtoken ${access_token}`, 'Content-Type': 'application/json' }, timeout: 10000
        });

        return { success: true, message: 'Field created successfully!', fullResponse: createdFieldResponse.data };
    } catch (error) {
        const message = error.response?.data?.error?.details?.[0]?.message || error.response?.data?.message || error.message;
        throw new Error(`Zoho field create failed: ${message}`);
    }
};

const handleUpdateTaskField = async ({ activeProfile, portalId, projectId, fieldIdentifier, displayName }) => {
    if (!portalId || !projectId || !fieldIdentifier || !displayName) {
        throw new Error('Missing required parameters for field update.');
    }

    const { access_token } = await getValidAccessToken(activeProfile, 'projects');
    const moduleId = await getTaskModuleId(portalId, activeProfile);
    const currentLayoutResponse = await axios.get(`https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` },
        timeout: 10000
    });

    const existingField = findFieldInLayout(currentLayoutResponse.data, fieldIdentifier);
    const resolvedFieldId = existingField?.id || existingField?.field_id || fieldIdentifier;
    const resolvedDataType = existingField?.column_type || existingField?.data_type || 'text';

    const updateUrl = `https://projectsapi.zoho.com/api/v3/portal/${portalId}/module/${moduleId}/fields`;

    try {
        const response = await axios.put(updateUrl, {
            id: resolvedFieldId,
            display_name: displayName,
            data_type: resolvedDataType
        }, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${access_token}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        return {
            success: true,
            message: 'Field updated successfully.',
            fullResponse: response.data
        };
    } catch (error) {
        const message = error.response?.data?.error?.details?.[0]?.message || error.response?.data?.message || error.message;
        throw new Error(`Zoho field update failed: ${message}`);
    }
};

module.exports = {
    setActiveJobs,
    handleGetPortals,
    handleGetProjects,
    handleGetTaskLists,
    handleGetTasks,
    handleCreateSingleTask,
    handleStartBulkCreateTasks,
    handleStartBulkDeleteTasks,
    handleGetTaskLayout,
    handleUpdateProjectDetails,
    handleGetProjectDetails,
    handleCreateTaskField,
    handleUpdateTaskField
};
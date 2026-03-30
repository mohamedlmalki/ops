// --- FILE: apps/ops/server/projects-handler.js ---

const { getValidAccessToken, makeApiCall, parseError, createJobId, readProfiles } = require('./utils');
const { delay } = require('./utils'); 
const axios = require('axios'); 

let activeJobs = {};

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

        socket.emit('projectsTasksLog', { type: 'info', message: `🚀 Fetching up to ${targetLimit} tasks (Using API V3 Pagination)...` });

        const statusesToFetch = ['open', 'closed'];

        for (const currentStatus of statusesToFetch) {
            if (allTasks.length >= targetLimit) break;

            let page = 1; 
            let hasMore = true;

            socket.emit('projectsTasksLog', { type: 'info', message: `📥 Scanning '${currentStatus.toUpperCase()}' tasks...` });

            while (allTasks.length < targetLimit && hasMore) {
                const per_page = 100; 
                const fetchUrl = `https://projectsapi.zoho.com${basePath}`;

                socket.emit('projectsTasksLog', { type: 'request', message: `GET [${currentStatus}] (Page: ${page}, Limit: ${per_page})` });

                try {
                    const response = await axios.get(fetchUrl, {
                        headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` },
                        params: { page, per_page, status: currentStatus }, 
                        timeout: 10000 
                    });

                    const tasks = response.data.tasks || [];
                    const newTasks = tasks.filter(t => !allTasks.some(existing => (existing.id_string || String(existing.id)) === (t.id_string || String(t.id))));
                    
                    socket.emit('projectsTasksLog', { type: 'response', message: `✅ Page ${page} returned ${tasks.length} tasks (${newTasks.length} unique).` });

                    if (tasks.length === 0) {
                        hasMore = false; 
                    } else if (newTasks.length === 0 && tasks.length > 0) {
                        socket.emit('projectsTasksLog', { type: 'error', message: `⚠️ Page ${page} contained 100% duplicates. Escaping loop.` });
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
                    if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) {
                        socket.emit('projectsTasksLog', { type: 'error', message: `❌ Network Timeout on Page ${page}.` });
                        hasMore = false;
                        break;
                    }
                    if (apiError.response && (apiError.response.status === 400 || apiError.response.status === 404)) {
                        hasMore = false;
                        break;
                    } else {
                        throw apiError;
                    }
                }
            }
        }
        
        if (allTasks.length > targetLimit) {
            allTasks = allTasks.slice(0, targetLimit);
        }

        socket.emit('projectsTasksLog', { type: 'success', message: `🎉 Finished! Compiled ${allTasks.length} total unique tasks.` });
        socket.emit('projectsTasksResult', { success: true, data: allTasks, pageInfo: { total_fetched: allTasks.length } });

    } catch (error) {
        socket.emit('projectsTasksLog', { type: 'error', message: `❌ Server Error: ${error.message}` });
        socket.emit('projectsTasksResult', { success: false, error: error.message, data: [] });
    }
};

const handleCreateSingleTask = async (data, providedMap = null) => {
    const { portalId, projectId, tasklistId, selectedProfileName } = data; 
    const profiles = readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
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
    const { formData, selectedProfileName, activeProfile } = data;
    const { taskName, primaryField, primaryValues, projectId, taskDescription, tasklistId, delay, bulkDefaultData, stopAfterFailures = 4 } = formData;
    
    const jobId = createJobId(socket.id, selectedProfileName, 'projects');
    activeJobs[jobId] = { status: 'running', consecutiveFailures: 0, stopAfterFailures: Number(stopAfterFailures) };
    
    const tasksToProcess = primaryValues.split('\n').map(name => name.trim()).filter(t => t.length > 0);
    if (tasksToProcess.length === 0) return socket.emit('bulkError', { message: 'No valid primary values provided.', profileName: selectedProfileName, jobType: 'projects' });
    
    const jobState = activeJobs[jobId] || {};
    jobState.totalToProcess = tasksToProcess.length;

    try {
        const portalId = activeProfile.projects.portalId;
        const sharedApiNameMap = await getApiNameMap(portalId, projectId, activeProfile);

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
            const dataForThisTask = { ...bulkDefaultData }; 
            if (primaryField !== 'name') dataForThisTask[primaryField] = currentValue; 
            
            const result = await handleCreateSingleTask({
                portalId, projectId, taskName: primaryField === 'name' ? currentValue : `${taskName}_${i + 1}`, 
                taskDescription, tasklistId, selectedProfileName, bulkDefaultData: dataForThisTask 
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
    const { activeProfile, selectedProfileName, portalId, projectId, taskIds, deleteAll } = data;
    const jobId = createJobId(socket.id, selectedProfileName, 'projects_delete');
    activeJobs[jobId] = { status: 'running', type: 'delete' };

    try {
        let { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const domain = 'https://projectsapi.zoho.com';

        let targetIds = taskIds || [];
        socket.emit('projectsTasksLog', { type: 'info', message: `🗑️ Starting Deletion Engine...` });

        if (deleteAll) {
             socket.emit('projectsTasksLog', { type: 'request', message: `Gathering ALL task IDs recursively via V3 API...` });
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
                             socket.emit('projectsTasksLog', { type: 'info', message: `Reached end of ${currentStatus} tasks.` });
                             hasMore = false;
                         }

                         if (response.data.page_info && response.data.page_info.has_next_page === false) {
                             hasMore = false;
                         }

                     } catch(err) {
                         if (err.response && (err.response.status === 400 || err.response.status === 404)) {
                             hasMore = false; 
                         } else {
                             throw err;
                         }
                     }
                 }
             }
             socket.emit('projectsTasksLog', { type: 'info', message: `Found ${targetIds.length} total unique tasks to delete.` });
        }

        activeJobs[jobId].totalToProcess = targetIds.length;
        socket.emit('projectsDeleteStarted', { total: targetIds.length, profileName: selectedProfileName });

        for (let i = 0; i < targetIds.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') {
                console.log(`[SERVER] Deletion aborted at task ${i}`);
                break;
            }
            
            const taskId = targetIds[i];
            let isDeleted = false;
            let retryCount = 0;

            if (i % 50 === 0) console.log(`[DELETE ENGINE] Processing task ${i + 1} of ${targetIds.length}...`);

            while (!isDeleted && retryCount < 3) {
                if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
                
                try {
                    const deleteUrl = `${domain}/api/v3/portal/${portalId}/projects/${projectId}/tasks/${taskId}`;
                    socket.emit('projectsTasksLog', { type: 'request', message: `DELETE Task ID: ${taskId} (Attempt ${retryCount + 1})` });
                    
                    await axios.delete(deleteUrl, { 
                        headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` },
                        timeout: 10000 
                    });
                    
                    socket.emit('projectsDeleteResult', { success: true, taskId, profileName: selectedProfileName });
                    isDeleted = true;
                    
                } catch (err) {
                    const status = err.response?.status;
                    const errorCode = err.response?.data?.error?.code;
                    let errorMessage = err.message;
                    if (err.response) errorMessage = err.response.data?.error?.details?.[0]?.message || err.response.data?.message || err.message;

                    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
                        socket.emit('projectsTasksLog', { type: 'error', message: `⚠️ Network Timeout on ${taskId}. Retrying...` });
                        retryCount++;
                        await interruptibleSleep(2000, jobId);
                    } else if (status === 401) {
                        socket.emit('projectsTasksLog', { type: 'info', message: `🔄 Token expired mid-job! Generating new token...` });
                        const refreshed = await getValidAccessToken(activeProfile, 'projects', true); 
                        access_token = refreshed.access_token;
                        retryCount++;
                    } else if (status === 429 || errorCode === 8535 || errorCode === 6504 || (errorMessage && errorMessage.toLowerCase().includes('more than'))) {
                        let waitMinutes = 2; 
                        const waitMatch = errorMessage.match(/after (\d+) minutes/);
                        if (waitMatch) waitMinutes = parseInt(waitMatch[1]) + 1;
                        socket.emit('projectsTasksLog', { type: 'error', message: `⚠️ ZOHO RATE LIMIT EXCEEDED. Automatic pause for ${waitMinutes} minutes...` });
                        await interruptibleSleep(waitMinutes * 60000, jobId); 
                        retryCount++;
                    } else if (status >= 500) {
                        socket.emit('projectsTasksLog', { type: 'error', message: `⚠️ Zoho Internal Error (500) on ${taskId}. Server overloaded, waiting 10 seconds...` });
                        await interruptibleSleep(10000, jobId);
                        retryCount++;
                    } else if (status === 404) {
                        socket.emit('projectsTasksLog', { type: 'info', message: `Task ${taskId} returned 404 (already deleted).` });
                        socket.emit('projectsDeleteResult', { success: true, taskId, profileName: selectedProfileName });
                        isDeleted = true;
                    } else {
                        socket.emit('projectsTasksLog', { type: 'error', message: `Failed DELETE on ${taskId}: ${errorMessage}` });
                        socket.emit('projectsDeleteResult', { success: false, taskId, error: errorMessage, profileName: selectedProfileName });
                        break; 
                    }
                }
            }
            
            await interruptibleSleep(1500, jobId); 
        }
    } catch (err) {
        socket.emit('projectsTasksLog', { type: 'error', message: `Critical Delete Error: ${err.message}` });
        socket.emit('projectsDeleteError', { message: err.message, profileName: selectedProfileName });
    } finally {
        if (activeJobs[jobId]) {
            console.log(`[DELETE ENGINE] Job Complete/Ended.`);
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

    const modules = Array.isArray(response.data)
        ? response.data
        : (response.data?.modules || response.data?.data || []);

    const taskModule = modules.find((module) => {
        const candidates = [module?.api_name, module?.name, module?.module_name, module?.display_name]
            .filter(Boolean)
            .map(v => String(v).toLowerCase());
        return candidates.includes('tasks') || candidates.includes('task');
    });

    if (!taskModule) {
        throw new Error('Could not find the Tasks module in Zoho Projects.');
    }

    return taskModule.id || taskModule.module_id || taskModule.moduleId;
};

const buildFieldTypePayload = (fieldType) => {
    const normalized = String(fieldType || '').toLowerCase();

    if (normalized === 'multiline') {
        return { data_type: 'multiline', field_type: 'textarea' };
    }
    if (normalized === 'integer') {
        return { data_type: 'integer', field_type: 'number' };
    }
    return { data_type: 'text', field_type: 'text' };
};

const findFieldInLayout = (layout, fieldLookupValue) => {
    if (!layout || !Array.isArray(layout.section_details)) return null;

    for (const section of layout.section_details) {
        const fields = section.customfield_details || [];
        const found = fields.find((field) => {
            const candidates = [
                field.column_name,
                field.api_name,
                field.display_name,
                field.i18n_display_name,
                field.id,
                field.field_id
            ].filter(Boolean).map(v => String(v).toLowerCase());

            return candidates.includes(String(fieldLookupValue || '').toLowerCase());
        });

        if (found) return found;
    }

    return null;
};

const handleCreateTaskField = async ({ activeProfile, portalId, projectId, layoutId, displayName, fieldType }) => {
    console.log(`\n========================================================`);
    console.log(`🚀 [DEBUG] STARTING ZOHO FIELD CREATION (INTERCEPTED METHOD)`);
    console.log(`========================================================`);

    const { access_token } = await getValidAccessToken(activeProfile, 'projects');
    const moduleId = await getTaskModuleId(portalId, activeProfile);

    // 1. Fetch the layout to dynamically get your Section ID (Task Information box)
    console.log(`🔄 Fetching Layout to get Section ID...`);
    const layoutResponse = await axios.get(`https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` },
        timeout: 10000
    });

    const firstSection = layoutResponse.data?.section_details?.[0];
    const sectionId = firstSection?.id || firstSection?.section_id;

    if (!sectionId) {
        throw new Error("Could not locate a Section ID in your Task Layout to place the field.");
    }
    console.log(`🎯 Found Section ID: ${sectionId}`);

    // 2. Format field type to match the exact string Zoho expects
    let exactFieldType = "singleline";
    if (fieldType === "multiline" || fieldType === "textarea") exactFieldType = "multiline";
    if (fieldType === "integer" || fieldType === "number") exactFieldType = "integer";
    if (fieldType === "email") exactFieldType = "email"; // 🔥 ADDED EMAIL LOGIC HERE
	
	
    // 3. Build the exact payload you intercepted from the Network Tab
    const fieldPayload = {
        module: String(moduleId),
        layout_id: String(layoutId),
        section_id: String(sectionId),
        field_type: exactFieldType,
        display_name: displayName, // Added so it gets your custom name immediately
        field_property: {
            is_pii: false,
            is_encrypted: false,
            context_property: {
                is_mandatory: false,
                has_info: false
            }
        }
    };

    // 4. Use the exact URL you discovered
    const createFieldUrl = `https://projectsapi.zoho.com/api/v3/portal/${portalId}/settings/fields`;

    console.log(`📡 [API CALL] Sending Intercepted PUT Request: ${createFieldUrl}`);
    console.dir(fieldPayload, { depth: null, colors: true });

    try {
        const createdFieldResponse = await axios.put(createFieldUrl, fieldPayload, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${access_token}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        console.log(`✅ [SUCCESS] Field created and attached directly to layout!`);
        console.log(`========================================================\n`);

        return {
            success: true,
            message: 'Field created and added to layout perfectly!',
            fullResponse: createdFieldResponse.data
        };
    } catch (error) {
        console.log(`❌ [FAILED] Zoho rejected the Intercepted Request!`);
        console.dir(error.response?.data || error.message, { depth: null, colors: true });
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
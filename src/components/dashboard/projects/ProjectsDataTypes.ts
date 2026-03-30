// --- FILE: src/components/dashboard/projects/ProjectsDataTypes.ts ---

import { ProjectsJobState, ProjectsResult } from '@/App';

export interface ZohoProject {
    id: string;
    name: string;
    status: string;
    portal_id: string; 
}

export interface ZohoTaskList {
    id: string;
    name: string;
}

export interface ZohoTask {
    id: string;
    id_string?: string;
    name: string;
    prefix: string;
    tasklist: {
        id: string;
        name: string;
    };
    status: {
        id: string;
        name: string;
    };
    created_time: string;
    due_date: string;
    details?: string;
    [key: string]: any; // Allows custom fields dynamically (UDF_CHAR1, etc)
}

export interface ProjectsTasksFormData {
    emails: string; 
    projectId: string; 
    tasklistId: string; 
    taskName: string;
    taskDescription: string;
    delay: number;
}

export interface TaskLogResult {
    projectName: string;
    success: boolean;
    details?: string;
    error?: string;
    fullResponse?: any;
}

export interface TaskProgressState {
    formData: ProjectsTasksFormData;
    results: TaskLogResult[];
    isProcessing: boolean;
    isPaused: boolean;
    isComplete: boolean;
    processingStartTime: Date | null;
    processingTime: number;
    totalToProcess: number;
    countdown: number;
    currentDelay: number;
    filterText: string;
}

// ---- NEW: ZOHO LAYOUT BLUEPRINT TYPES ----
export interface ZohoLayoutField {
  column_name: string;      
  display_name: string;     
  data_type: string;             
  is_mandatory: boolean;    
  is_readonly: boolean;     
  max_length?: number;
  pick_list_values?: Array<{ display_value: string, actual_value: string }>;
}

export interface ZohoLayoutSection {
  id: string;
  name: string; 
  customfield_details?: ZohoLayoutField[]; // For custom fields
  field_details?: ZohoLayoutField[]; // For standard fields
}

export interface ZohoTaskLayout {
  layout_id: string;
  name: string;
  section_details: ZohoLayoutSection[];
}
// --- FILE: src/App.tsx ---
import React, { useState, useEffect, useRef } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { io, Socket } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import SingleTicket from "@/pages/SingleTicket";
import { ProfileModal } from '@/components/dashboard/ProfileModal';
import EmailStatics from "@/pages/EmailStatics";
import { useJobTimer } from '@/hooks/useJobTimer';
import BulkSignup from './pages/BulkSignup';
import CatalystUsers from './pages/CatalystUsers';
import BulkEmail from './pages/BulkEmail'; 
import { EmailResult } from './components/dashboard/catalyst/EmailResultsDisplay'; 
import BulkQntrlCards from './pages/BulkQntrlCards';
import PeopleForms from './pages/PeopleForms'; 
import CreatorForms from './pages/CreatorForms';
import ProjectsTasksPage from './pages/ProjectsTasksPage';
import BulkWebinarRegistration from './pages/BulkWebinarRegistration';
import LiveStats from '@/pages/LiveStats';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import BulkContactsFsm from './pages/BulkContactsFsm';
import BulkBookings from './pages/BulkBookings';
import AppointmentManager from './pages/AppointmentManager';
import SpeedTest from './pages/SpeedTest';

const queryClient = new QueryClient();
const SERVER_URL = "http://localhost:3000";

// --- TYPES ---
export interface Profile {
  profileName: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  desk?: {
    orgId: string;
    defaultDepartmentId: string;
    fromEmailAddress?: string;
    mailReplyAddressId?: string;
    cloudflareTrackingUrl?: string;
  };
  catalyst?: {
    projectId: string;
    fromEmail?: string; 
  };
  qntrl?: {
    orgId: string; 
  };
  people?: { 
    orgId?: string;
  };
  creator?: {
    baseUrl: string;
    ownerName: string;
    appName: string;
  };
  projects?: {
    portalId: string;
  };
  meeting?: {
    zsoid?: string;
  };
  bookings?: {
    workspaceId: string;
  };
  imapSettings?: {
    email: string;
    password: string;
    host: string;
  }[];
}

export interface TicketFormData {
  emails: string;
  subject: string;
  description: string;
  delay: number;
  sendDirectReply: boolean;
  verifyEmail: boolean;
  displayName: string;
  stopAfterFailures: number; 
  enableTracking: boolean;
}
export interface InvoiceFormData {
  emails: string;
  subject: string;
  body: string;
  delay: number;
  displayName: string;
  sendCustomEmail: boolean;
  sendDefaultEmail: boolean;
}
export interface EmailFormData {
    emails: string;
    subject: string;
    content: string;
    delay: number;
    displayName: string; 
}
export interface EmailJobState {
    formData: EmailFormData;
    results: EmailResult[];
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
export interface EmailJobs {
    [profileName: string]: EmailJobState;
}
export interface TicketResult {
  email: string;
  success: boolean;
  ticketNumber?: string;
  details?: string;
  error?: string;
  fullResponse?: any;
  timestamp?: Date;
}
export interface CatalystSignupFormData {
  emails: string;
  firstName: string;
  lastName: string;
  delay: number;
}
export interface CatalystResult {
  email: string;
  success: boolean;
  details?: string;
  error?: string;
  fullResponse?: any;
}
export interface CatalystJobState {
    formData: CatalystSignupFormData;
    results: CatalystResult[];
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
export interface CatalystJobs {
    [profileName: string]: CatalystJobState;
}
export interface QntrlFormData {
  selectedFormId: string;
  bulkPrimaryField: string;
  bulkPrimaryValues: string;
  bulkDefaultData: { [key: string]: string };
  bulkDelay: number;
}
export interface QntrlResult {
  primaryValue: string;
  success: boolean;
  details?: string;
  error?: string;
  fullResponse?: any;
  timestamp?: Date;
}
export interface QntrlJobState {
    formData: QntrlFormData;
    results: QntrlResult[];
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
export interface QntrlJobs {
    [profileName: string]: QntrlJobState;
}
export interface PeopleFormData {
  selectedFormId: string;
  bulkPrimaryField: string;
  bulkPrimaryValues: string;
  bulkDefaultData: { [key: string]: string };
  bulkDelay: number;
  stopAfterFailures: number;
}
export interface PeopleResult {
  email: string;
  success: boolean;
  details?: string;
  error?: string;
  fullResponse?: any;
  timestamp?: Date;
}
export interface PeopleJobState {
    formData: PeopleFormData;
    results: PeopleResult[];
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
export interface PeopleJobs {
    [profileName: string]: PeopleJobState;
}
export interface JobState {
  formData: TicketFormData;
  results: TicketResult[];
  isProcessing: boolean;
  isPaused: boolean;
  isComplete: boolean;
  processingStartTime: Date | null;
  processingTime: number; 
  totalTicketsToProcess: number;
  countdown: number;
  currentDelay: 1;
  filterText: string;
}
export interface InvoiceJobState {
  formData: InvoiceFormData;
  results: InvoiceResult[];
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
export interface Jobs {
  [profileName: string]: JobState;
}
export interface InvoiceJobs {
    [profileName: string]: InvoiceJobState;
}
export interface CreatorFormData {
  selectedFormLinkName: string;
  bulkPrimaryField: string;
  bulkPrimaryValues: string;
  bulkDefaultData: { [key: string]: string };
  bulkDelay: number;
}
export interface CreatorResult {
  primaryValue: string;
  success: boolean;
  details?: string;
  error?: string;
  fullResponse?: any;
  timestamp?: Date; 
}
export interface CreatorJobState {
    formData: CreatorFormData;
    results: CreatorResult[];
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
export interface CreatorJobs {
    [profileName: string]: CreatorJobState;
}

export interface ProjectsFormData {
  taskName: string; 
  primaryField: string;
  primaryValues: string;
  taskDescription: string;
  projectId: string;
  tasklistId: string;
  delay: number;
  bulkDefaultData: { [key: string]: string }; 
  emails?: string;
  displayName?: string; 
  stopAfterFailures?: number; 
  enableTracking?: boolean;
  appendAccountNumber?: boolean;
  smartSplitterText?: string;
}
export interface ProjectsResult {
  projectName: string; 
  success: boolean;
  details?: string;
  error?: string;
  fullResponse?: any;
  timestamp?: Date;
}
export interface ProjectsJobState {
    formData: ProjectsFormData; 
    results: ProjectsResult[];
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
export interface ProjectsJobs {
    [profileName: string]: ProjectsJobState;
}

export interface WebinarFormData {
  webinarId: string;
  webinar: any | null;
  emails: string;
  firstName: string;
  delay: number;
  displayName?: string;
}
export interface WebinarResult {
  email: string;
  success: boolean;
  details?: string;
  error?: string;
  fullResponse?: any;
  displayName?: string;
  subject?: string;
  number?: number; 
}
export interface WebinarJobState {
    formData: WebinarFormData; 
    results: WebinarResult[];
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
export interface WebinarJobs {
    [profileName: string]: WebinarJobState;
}

export interface FsmContactFormData {
    emails: string;
    lastName: string;
    delay: number;
    stopAfterFailures: number;
}
export interface FsmContactResult {
    email: string;
    success: boolean;
    details?: string;
    error?: string;
    fullResponse?: any;
    timestamp?: Date;
}
export interface FsmContactJobState {
    formData: FsmContactFormData;
    results: FsmContactResult[];
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
export interface FsmContactJobs { [profileName: string]: FsmContactJobState; }

export interface BookingFormData {
    emails: string;
    defName: string;
    defPhone: string;
    serviceId: string;
    staffId: string;
    startTimeStr: string;
    timeGap: number;
    workStart: number;
    workEnd: number;
    delay: number; 
    stopAfterFailures: number; 
}
export interface BookingResult {
    email: string;
    success: boolean;
    time: string;
    details?: string;
    error?: string;
    fullResponse?: any;
    timestamp?: Date;
}
export interface BookingJobState {
    formData: BookingFormData;
    results: BookingResult[];
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
export interface BookingJobs { [profileName: string]: BookingJobState; }

// --- INITIAL STATES ---
const createInitialJobState = (): JobState => ({
  formData: { emails: '', subject: '', description: '', delay: 1, sendDirectReply: false, verifyEmail: false, displayName: '', stopAfterFailures: 4, enableTracking: false },
  results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalTicketsToProcess: 0, countdown: 0, currentDelay: 1, filterText: '',
});
const createInitialInvoiceJobState = (): InvoiceJobState => ({
    formData: { emails: '', subject: '', body: '', delay: 1, displayName: '', sendCustomEmail: false, sendDefaultEmail: false, },
    results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalToProcess: 0, countdown: 0, currentDelay: 1, filterText: '',
});
const createInitialCatalystJobState = (): CatalystJobState => ({
    formData: { emails: '', firstName: '', lastName: '', delay: 1, },
    results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalToProcess: 0, countdown: 0, currentDelay: 1, filterText: '',
});
const createInitialEmailJobState = (): EmailJobState => ({
    formData: { emails: '', subject: '', content: '', delay: 1, displayName: '', },
    results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalToProcess: 0, countdown: 0, currentDelay: 1, filterText: '',
});
const createInitialQntrlJobState = (): QntrlJobState => ({
    formData: { selectedFormId: "", bulkPrimaryField: "", bulkPrimaryValues: "", bulkDefaultData: {}, bulkDelay: 1, },
    results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalToProcess: 0, countdown: 0, currentDelay: 1, filterText: '',
});
const createInitialPeopleJobState = (): PeopleJobState => ({
    formData: { selectedFormId: "", bulkPrimaryField: "", bulkPrimaryValues: "", bulkDefaultData: {}, bulkDelay: 1, stopAfterFailures: 4, },
    results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalToProcess: 0, countdown: 0, currentDelay: 1, filterText: '',
});
const createInitialCreatorJobState = (): CreatorJobState => ({
    formData: { selectedFormLinkName: "", bulkPrimaryField: "", bulkPrimaryValues: "", bulkDefaultData: {}, bulkDelay: 1, },
    results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalToProcess: 0, countdown: 0, currentDelay: 1, filterText: '',
});
const createInitialProjectsJobState = (): ProjectsJobState => ({
    formData: { taskName: '', primaryField: 'name', primaryValues: '', taskDescription: '', projectId: '', tasklistId: '', delay: 1, bulkDefaultData: {}, emails: '', stopAfterFailures: 4, enableTracking: false, appendAccountNumber: false, smartSplitterText: '' },
    results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalToProcess: 0, countdown: 0, currentDelay: 1, filterText: ''
});
const createInitialWebinarJobState = (): WebinarJobState => ({
    formData: { webinarId: '', webinar: null, emails: '', firstName: '', delay: 1, displayName: 'webinar_registrations', },
    results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalToProcess: 0, countdown: 0, currentDelay: 1, filterText: '',
});
const createInitialFsmContactJobState = (): FsmContactJobState => ({
    formData: { emails: '', lastName: '', delay: 1, stopAfterFailures: 4 },
    results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalToProcess: 0, countdown: 0, currentDelay: 1, filterText: '',
});
const createInitialBookingJobState = (): BookingJobState => ({
    formData: { emails: '', defName: 'Bulk User', defPhone: '0000000000', serviceId: '', staffId: '', startTimeStr: new Date().toISOString().slice(0, 16), timeGap: 5, workStart: 9, workEnd: 17, delay: 0, stopAfterFailures: 4 },
    results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalToProcess: 0, countdown: 0, currentDelay: 0, filterText: '',
});

const MainApp = () => {
    const { toast } = useToast();
    const location = useLocation();
    
    // 🚨 REPLACED `usePersistentJobs` with standard React `useState`. The DB manages memory now!
    const [jobs, setJobs] = useState<Jobs>({});
    const [invoiceJobs, setInvoiceJobs] = useState<InvoiceJobs>({});
    const [catalystJobs, setCatalystJobs] = useState<CatalystJobs>({}); 
    const [emailJobs, setEmailJobs] = useState<EmailJobs>({}); 
    const [qntrlJobs, setQntrlJobs] = useState<QntrlJobs>({});
    const [peopleJobs, setPeopleJobs] = useState<PeopleJobs>({});
    const [creatorJobs, setCreatorJobs] = useState<CreatorJobs>({});
    const [projectsJobs, setProjectsJobs] = useState<ProjectsJobs>({});
    const [webinarJobs, setWebinarJobs] = useState<WebinarJobs>({});
    const [fsmContactJobs, setFsmContactJobs] = useState<FsmContactJobs>({});
    const [bookingJobs, setBookingJobs] = useState<BookingJobs>({});

    const socketRef = useRef<Socket | null>(null);
    const queryClient = useQueryClient();

    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
    const [isStartingAll, setIsStartingAll] = useState(false);
    const abortStartAllRef = useRef(false); 

    const { data: savedProfiles = [] } = useQuery<Profile[]>({
        queryKey: ['profiles'],
        queryFn: async () => {
            const response = await fetch(`${SERVER_URL}/api/profiles`);
            return response.ok ? response.json() : [];
        },
        refetchOnWindowFocus: false,
    });

    useJobTimer(jobs, setJobs, 'ticket');
    useJobTimer(invoiceJobs, setInvoiceJobs, 'invoice');
    useJobTimer(catalystJobs, setCatalystJobs, 'catalyst'); 
    useJobTimer(emailJobs, setEmailJobs, 'email'); 
    useJobTimer(qntrlJobs, setQntrlJobs, 'qntrl');
    useJobTimer(peopleJobs, setPeopleJobs, 'people');
    useJobTimer(creatorJobs, setCreatorJobs, 'creator');
    useJobTimer(projectsJobs, setProjectsJobs, 'projects');
    useJobTimer(webinarJobs, setWebinarJobs, 'webinar');
    useJobTimer(fsmContactJobs, setFsmContactJobs, 'fsm-contact');
    useJobTimer(bookingJobs, setBookingJobs, 'bookings');

    const resultBuckets = useRef<any>({
        ticket: {}, invoice: {}, catalyst: {}, email: {}, qntrl: {}, people: {}, 
        creator: {}, projects: {}, webinar: {}, fsmContact: {}, bookings: {}
    });

    const lastNotifiedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const pollTracker = async () => {
            try {
                const profilesRes = await fetch(`${SERVER_URL}/api/profiles`);
                const profiles = await profilesRes.json();
                const trackingUrls = new Set<string>();
                profiles.forEach((p: Profile) => {
                    if (p.desk?.cloudflareTrackingUrl) {
                        let baseUrl = p.desk.cloudflareTrackingUrl;
                        if (!baseUrl.endsWith('/api/logs')) baseUrl = baseUrl.replace(/\/$/, '') + '/api/logs';
                        trackingUrls.add(baseUrl);
                    }
                });

                for (const url of trackingUrls) {
                    try {
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data.success && data.logs) {
                            data.logs.forEach((log: any) => {
                                const logId = `${log.email}_${log.openedAt}`;
                                if (!lastNotifiedRef.current.has(logId)) lastNotifiedRef.current.add(logId); 
                            });
                        }
                    } catch (e) { }
                }
            } catch (e) { }
        };

        const interval = setInterval(pollTracker, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const socket = io(SERVER_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
            toast({ title: "Connected to server!" });
            // 🚨 REQUEST THE DATABASE TRUTH ON LOAD
            socket.emit('requestDatabaseSync'); 
        });
          
        const handleWakeUp = () => {
            if (document.visibilityState === 'visible') {
                if (!socket.connected) socket.connect();
                socket.emit('requestDatabaseSync');
            }
        };
        document.addEventListener("visibilitychange", handleWakeUp);

        // 🚨 RECEIVE THE DATABASE TRUTH AND UPDATE UI EXACTLY
        socket.on('databaseSync', (dbJobs: any[]) => {
            const nextJobs: any = {}; const nextInvoice: any = {}; const nextCatalyst: any = {};
            const nextEmail: any = {}; const nextQntrl: any = {}; const nextPeople: any = {};
            const nextCreator: any = {}; const nextProjects: any = {}; const nextWebinar: any = {};
            const nextFsm: any = {}; const nextBooking: any = {};

            dbJobs.forEach(dbJob => {
                const pName = dbJob.profileName;
                const type = dbJob.jobType;
                const stateObj = {
                    formData: dbJob.formData || {},
                    results: dbJob.results || [],
                    isProcessing: dbJob.status === 'running',
                    isPaused: dbJob.status === 'paused',
                    isComplete: dbJob.status === 'complete' || dbJob.status === 'ended',
                    processingStartTime: dbJob.status === 'running' ? new Date() : null,
                    processingTime: 0,
                    totalToProcess: dbJob.totalToProcess || 0,
                    totalTicketsToProcess: dbJob.totalToProcess || 0,
                    countdown: 0,
                    currentDelay: dbJob.formData?.delay || dbJob.formData?.bulkDelay || 1,
                    filterText: ''
                };

                if (type === 'ticket') nextJobs[pName] = stateObj;
                else if (type === 'invoice') nextInvoice[pName] = stateObj;
                else if (type === 'catalyst') nextCatalyst[pName] = stateObj;
                else if (type === 'email') nextEmail[pName] = stateObj;
                else if (type === 'qntrl') nextQntrl[pName] = stateObj;
                else if (type === 'people') nextPeople[pName] = stateObj;
                else if (type === 'creator') nextCreator[pName] = stateObj;
                else if (type === 'projects') nextProjects[pName] = stateObj;
                else if (type === 'webinar') nextWebinar[pName] = stateObj;
                else if (type === 'fsm-contact') nextFsm[pName] = stateObj;
                else if (type === 'bookings') nextBooking[pName] = stateObj;
            });

            setJobs(prev => ({ ...prev, ...nextJobs }));
            setInvoiceJobs(prev => ({ ...prev, ...nextInvoice }));
            setCatalystJobs(prev => ({ ...prev, ...nextCatalyst }));
            setEmailJobs(prev => ({ ...prev, ...nextEmail }));
            setQntrlJobs(prev => ({ ...prev, ...nextQntrl }));
            setPeopleJobs(prev => ({ ...prev, ...nextPeople }));
            setCreatorJobs(prev => ({ ...prev, ...nextCreator }));
            setProjectsJobs(prev => ({ ...prev, ...nextProjects }));
            setWebinarJobs(prev => ({ ...prev, ...nextWebinar }));
            setFsmContactJobs(prev => ({ ...prev, ...nextFsm }));
            setBookingJobs(prev => ({ ...prev, ...nextBooking }));
        });

        // 🚨 CLEAR JOB EVENTS
        socket.on('jobCleared', ({ profileName, jobType }) => {
            const clearProfile = (prev: any) => { const next = { ...prev }; delete next[profileName]; return next; };
            if (jobType === 'ticket') setJobs(clearProfile);
            else if (jobType === 'projects') setProjectsJobs(clearProfile);
            // Can add others if needed later
        });

        socket.on('allJobsCleared', ({ jobType }) => {
            if (jobType === 'ticket') setJobs({});
            else if (jobType === 'projects') setProjectsJobs({});
        });
        
        socket.on('ticketResult', (result: any) => {
            if (!resultBuckets.current.ticket[result.profileName]) resultBuckets.current.ticket[result.profileName] = [];
            resultBuckets.current.ticket[result.profileName].push({ ...result, timestamp: new Date() });
        });
        socket.on('projectsResult', (result: any) => {
            if (!resultBuckets.current.projects[result.profileName]) resultBuckets.current.projects[result.profileName] = [];
            resultBuckets.current.projects[result.profileName].push({ ...result, timestamp: new Date() });
        });
        // [Other bucket events remain the same - abbreviated for simplicity]
        socket.on('invoiceResult', (result: any) => { if (!resultBuckets.current.invoice[result.profileName]) resultBuckets.current.invoice[result.profileName] = []; resultBuckets.current.invoice[result.profileName].push(result); });
        socket.on('catalystResult', (result: any) => { if (!resultBuckets.current.catalyst[result.profileName]) resultBuckets.current.catalyst[result.profileName] = []; resultBuckets.current.catalyst[result.profileName].push(result); });
        socket.on('emailResult', (result: any) => { if (!resultBuckets.current.email[result.profileName]) resultBuckets.current.email[result.profileName] = []; resultBuckets.current.email[result.profileName].push(result); });
        socket.on('qntrlResult', (result: any) => { if (!resultBuckets.current.qntrl[result.profileName]) resultBuckets.current.qntrl[result.profileName] = []; resultBuckets.current.qntrl[result.profileName].push({ ...result, timestamp: new Date() }); });
        socket.on('peopleResult', (result: any) => { if (!resultBuckets.current.people[result.profileName]) resultBuckets.current.people[result.profileName] = []; resultBuckets.current.people[result.profileName].push({ ...result, timestamp: new Date() }); });
        socket.on('creatorResult', (result: any) => { if (!resultBuckets.current.creator[result.profileName]) resultBuckets.current.creator[result.profileName] = []; resultBuckets.current.creator[result.profileName].push({ ...result, timestamp: new Date() }); });
        socket.on('webinarResult', (result: any) => { if (!resultBuckets.current.webinar[result.profileName]) resultBuckets.current.webinar[result.profileName] = []; resultBuckets.current.webinar[result.profileName].push(result); });
        socket.on('fsmContactResult', (result: any) => { if (!resultBuckets.current.fsmContact[result.profileName]) resultBuckets.current.fsmContact[result.profileName] = []; resultBuckets.current.fsmContact[result.profileName].push({ ...result, timestamp: new Date() }); });
        socket.on('bookingResult', (result: any) => { if (!resultBuckets.current.bookings[result.profileName]) resultBuckets.current.bookings[result.profileName] = []; resultBuckets.current.bookings[result.profileName].push({ ...result, timestamp: new Date() }); });

        const flushInterval = setInterval(() => {
            const flushJobs = (bucketObj: any, setFunc: any, initialBuilder: any, reverseOrder = false) => {
                let hasDataToFlush = false;
                for (const profile in bucketObj) { if (bucketObj[profile].length > 0) hasDataToFlush = true; }

                if (hasDataToFlush) {
                    setFunc((prevJobs: any) => {
                        const nextJobs = { ...prevJobs };
                        for (const profile in bucketObj) {
                            const newItems = bucketObj[profile];
                            if (newItems.length > 0) {
                                const profileJob = nextJobs[profile] || initialBuilder();
                                
                                let updatedResults = [];
                                if (reverseOrder) {
                                    const mappedNewItems = newItems.map((r: any, idx: number) => ({ ...r, number: profileJob.results.length + newItems.length - idx }));
                                    updatedResults = [...mappedNewItems.reverse(), ...profileJob.results];
                                } else {
                                    updatedResults = [...profileJob.results, ...newItems];
                                }

                                const totalTarget = profileJob.totalTicketsToProcess || profileJob.totalToProcess || 0;
                                const isLast = updatedResults.length >= totalTarget && totalTarget > 0;
                                const defaultDelay = profileJob.formData?.delay || profileJob.formData?.bulkDelay || 1;

                                let actualCountdown = defaultDelay;
                                if (profileJob.processingStartTime && !isLast) {
                                    const startTimeMs = new Date(profileJob.processingStartTime).getTime();
                                    const nextTicketIndex = updatedResults.length;
                                    const scheduledTimeMs = startTimeMs + (nextTicketIndex * defaultDelay * 1000);
                                    const remainingMs = scheduledTimeMs - Date.now();
                                    actualCountdown = Math.ceil(Math.max(0, remainingMs / 1000));
                                } else if (isLast) {
                                    actualCountdown = 0;
                                }

                                nextJobs[profile] = {
                                    ...profileJob,
                                    results: updatedResults,
                                    countdown: actualCountdown,
                                };
                                bucketObj[profile] = []; 
                            }
                        }
                        return nextJobs;
                    });
                }
            };

            flushJobs(resultBuckets.current.ticket, setJobs, createInitialJobState);
            flushJobs(resultBuckets.current.invoice, setInvoiceJobs, createInitialInvoiceJobState);
            flushJobs(resultBuckets.current.catalyst, setCatalystJobs, createInitialCatalystJobState);
            flushJobs(resultBuckets.current.email, setEmailJobs, createInitialEmailJobState);
            flushJobs(resultBuckets.current.qntrl, setQntrlJobs, createInitialQntrlJobState);
            flushJobs(resultBuckets.current.people, setPeopleJobs, createInitialPeopleJobState);
            flushJobs(resultBuckets.current.creator, setCreatorJobs, createInitialCreatorJobState);
            flushJobs(resultBuckets.current.projects, setProjectsJobs, createInitialProjectsJobState);
            flushJobs(resultBuckets.current.webinar, setWebinarJobs, createInitialWebinarJobState, true);
            flushJobs(resultBuckets.current.fsmContact, setFsmContactJobs, createInitialFsmContactJobState);
            flushJobs(resultBuckets.current.bookings, setBookingJobs, createInitialBookingJobState);

        }, 1000); 

        socket.on('ticketUpdate', (updateData) => {
          setJobs(prevJobs => {
            if (!prevJobs[updateData.profileName]) return prevJobs;
            return {
              ...prevJobs,
              [updateData.profileName]: {
                ...prevJobs[updateData.profileName],
                results: prevJobs[updateData.profileName].results.map(r => 
                  String(r.ticketNumber) === String(updateData.ticketNumber) 
                    ? { ...r, success: updateData.success, details: updateData.details, fullResponse: updateData.fullResponse } 
                    : r
                )
              }
            }
          });
        });

        socket.on('jobPaused', (data: { profileName: string, reason: string, jobType?: string }) => {
            const type = data.jobType || 'ticket'; 
            const pauseUpdater = (prev: any) => {
                if (!prev[data.profileName]) return prev;
                return { ...prev, [data.profileName]: { ...prev[data.profileName], isPaused: true } };
            };

            if (type === 'ticket') setJobs(pauseUpdater);
            else if (type === 'invoice') setInvoiceJobs(pauseUpdater);
            else if (type === 'catalyst') setCatalystJobs(pauseUpdater);
            else if (type === 'email') setEmailJobs(pauseUpdater);
            else if (type === 'qntrl') setQntrlJobs(pauseUpdater);
            else if (type === 'people') setPeopleJobs(pauseUpdater);
            else if (type === 'creator') setCreatorJobs(pauseUpdater);
            else if (type === 'projects') setProjectsJobs(pauseUpdater);
            else if (type === 'webinar') setWebinarJobs(pauseUpdater);
            else if (type === 'fsm-contact') setFsmContactJobs(pauseUpdater);
            else if (type === 'bookings') setBookingJobs(pauseUpdater);

            toast({ title: "Job Paused Automatically", description: data.reason, variant: "destructive" });
        });

        const handleJobCompletion = (data: any, title: string, description: string, variant?: "destructive") => {
            const { profileName, jobType } = data;
            const getInitialState = (type: string) => {
                switch(type) {
                    case 'ticket': return createInitialJobState();
                    case 'invoice': return createInitialInvoiceJobState();
                    case 'catalyst': return createInitialCatalystJobState();
                    case 'email': return createInitialEmailJobState();
                    case 'qntrl': return createInitialQntrlJobState();
                    case 'people': return createInitialPeopleJobState();
                    case 'creator': return createInitialCreatorJobState();
                    case 'projects': return createInitialProjectsJobState();
                    case 'webinar': return createInitialWebinarJobState();
                    case 'fsm-contact': return createInitialFsmContactJobState();
                    case 'bookings': return createInitialBookingJobState();
                    default: return {} as any;
                }
            };

            const updater = (prev: any) => {
                const profileJob = prev[profileName] || getInitialState(jobType);
                return { ...prev, [profileName]: { ...profileJob, isProcessing: false, isPaused: false, isComplete: true, countdown: 0 } };
            };

            if (jobType === 'ticket') setJobs(updater);
            else if (jobType === 'invoice') setInvoiceJobs(updater);
            else if (jobType === 'catalyst') setCatalystJobs(updater);
            else if (jobType === 'email') setEmailJobs(updater);
            else if (jobType === 'qntrl') setQntrlJobs(updater);
            else if (jobType === 'people') setPeopleJobs(updater);
            else if (jobType === 'creator') setCreatorJobs(updater);
            else if (jobType === 'projects') setProjectsJobs(updater);
            else if (jobType === 'webinar') setWebinarJobs(updater);
            else if (jobType === 'fsm-contact') setFsmContactJobs(updater);
            else if (jobType === 'bookings') setBookingJobs(updater);
            
            toast({ title, description, variant });
        };

        socket.on('bulkComplete', (data) => handleJobCompletion(data, `Processing Complete for ${data.profileName}!`, "All items for this profile have been processed."));
        socket.on('bulkEnded', (data) => handleJobCompletion(data, `Job Ended for ${data.profileName}`, "The process was stopped by the user.", "destructive"));
        socket.on('bulkError', (data) => handleJobCompletion(data, `Server Error for ${data.profileName}`, data.message, "destructive"));

        return () => {
            document.removeEventListener("visibilitychange", handleWakeUp);
            clearInterval(flushInterval); 
            socket.disconnect();
        };
    }, [toast]);
    
    const handleOpenAddProfile = () => { setEditingProfile(null); setIsProfileModalOpen(true); };
    const handleOpenEditProfile = (profile: Profile) => { setEditingProfile(profile); setIsProfileModalOpen(true); };
    const handleSaveProfile = async (profileData: Profile, originalProfileName?: string) => {
        const isEditing = !!originalProfileName;
        const url = isEditing ? `${SERVER_URL}/api/profiles/${encodeURIComponent(originalProfileName)}` : `${SERVER_URL}/api/profiles`;
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profileData),
            });
            const result = await response.json();
            if (result.success) {
                toast({ title: `Profile ${isEditing ? 'updated' : 'added'} successfully!` });
                queryClient.invalidateQueries({ queryKey: ['profiles'] });
                setIsProfileModalOpen(false);
            } else toast({ title: 'Error', description: result.error, variant: 'destructive' });
        } catch (error) { toast({ title: 'Error', description: 'Failed to save profile.', variant: 'destructive' }); }
    };
    const handleDeleteProfile = async (profileNameToDelete: string) => {
        try {
            const response = await fetch(`${SERVER_URL}/api/profiles/${encodeURIComponent(profileNameToDelete)}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.success) {
                toast({ title: `Profile "${profileNameToDelete}" deleted successfully!` });
                await queryClient.invalidateQueries({ queryKey: ['profiles'] });
            } else toast({ title: 'Error', description: result.error, variant: 'destructive' });
        } catch (error) { toast({ title: 'Error', description: 'Failed to delete profile.', variant: 'destructive' }); }
    };

    const handleStartAll = async () => {
        if (!socketRef.current) return;
        setIsStartingAll(true);
        abortStartAllRef.current = false; 
        let startedCount = 0;
        const path = location.pathname;

        let liveProfiles: Profile[] = [];
        try {
            const res = await fetch(`${SERVER_URL}/api/profiles`);
            liveProfiles = await res.json();
        } catch (e) { }

        if (path === '/') {
            const profilesToStart = Object.keys(jobs).filter(profileName => {
                const job = jobs[profileName];
                if (!job || job.isProcessing) return false;
                const emailList = job.formData?.emails?.split('\n').map((e: string) => e.trim()).filter((e: string) => e !== '') || [];
                const hasSubject = job.formData?.subject?.trim().length > 0;
                const hasDescription = job.formData?.description?.trim().length > 0;
                return emailList.length > 0 && hasSubject && hasDescription;
            });

            if (profilesToStart.length === 0) {
                toast({ title: "Nothing to start", description: "No idle Desk accounts found." });
                setIsStartingAll(false); return;
            }

            toast({ title: "Starting Desk Fleet...", description: `Initializing ${profilesToStart.length} accounts.` });

            for (const pName of profilesToStart) {
                if (abortStartAllRef.current) break;
                setJobs((prev: any) => {
                    const freshJob = prev[pName];
                    const emailList = freshJob.formData.emails.split('\n').map((e: string) => e.trim()).filter((e: string) => e !== '');
                    socketRef.current?.emit('startBulkCreate', { ...freshJob.formData, emails: emailList, selectedProfileName: pName });
                    return { ...prev, [pName]: { ...freshJob, results: [], isProcessing: true, isPaused: false, isComplete: false, processingStartTime: new Date(), totalTicketsToProcess: emailList.length, processingTime: 0 }};
                });
                startedCount++;
                await new Promise(resolve => setTimeout(resolve, 1500)); 
            }
        } else if (path === '/projects-tasks') {
            const profilesToStart = Object.keys(projectsJobs).filter(profileName => {
                const job = projectsJobs[profileName];
                if (!job || job.isProcessing) return false;
                const tasksList = job.formData?.primaryValues?.split('\n').map((e: string) => e.trim()).filter((e: string) => e !== '') || [];
                return tasksList.length > 0;
            });

            if (profilesToStart.length === 0) {
                toast({ title: "Nothing to start", description: "No idle Project accounts found." });
                setIsStartingAll(false); return;
            }

            toast({ title: "Starting Projects Fleet...", description: `Initializing ${profilesToStart.length} accounts.` });

            for (const pName of profilesToStart) {
                if (abortStartAllRef.current) break;
                
                const matchedProfile = liveProfiles.find(p => p.profileName === pName);
                const activeProfileData = matchedProfile ? { projects: { portalId: matchedProfile.projects?.portalId } } : undefined;

                setProjectsJobs((prev: any) => {
                    const freshJob = prev[pName];
                    const tasksList = freshJob.formData.primaryValues.split('\n').map((e: string) => e.trim()).filter((e: string) => e !== '');
                    
                    socketRef.current?.emit('startBulkCreateTasks', { 
                        selectedProfileName: pName, 
                        activeProfile: activeProfileData, 
                        formData: freshJob.formData 
                    });
                    
                    return { ...prev, [pName]: { ...freshJob, results: [], isProcessing: true, isPaused: false, isComplete: false, processingStartTime: new Date(), totalToProcess: tasksList.length, processingTime: 0 }};
                });
                startedCount++;
                await new Promise(resolve => setTimeout(resolve, 1500)); 
            }
        }

        if (!abortStartAllRef.current && startedCount > 0) toast({ title: "Fleet Started", description: `Successfully started ${startedCount} jobs.` });
        setIsStartingAll(false);
    };

    const handlePauseAll = () => {
        if (!socketRef.current) return;
        abortStartAllRef.current = true; 
        const path = location.pathname;

        if (path === '/') {
            Object.keys(jobs).forEach(pName => { if (jobs[pName].isProcessing && !jobs[pName].isPaused) { socketRef.current?.emit('pauseJob', { profileName: pName, jobType: 'ticket' }); setJobs((prev: any) => ({ ...prev, [pName]: { ...prev[pName], isPaused: true } })); } });
            toast({ title: "Master Pause", description: "All active Desk jobs paused." });
        } else if (path === '/projects-tasks') {
            Object.keys(projectsJobs).forEach(pName => { if (projectsJobs[pName].isProcessing && !projectsJobs[pName].isPaused) { socketRef.current?.emit('pauseJob', { profileName: pName, jobType: 'projects' }); setProjectsJobs((prev: any) => ({ ...prev, [pName]: { ...prev[pName], isPaused: true } })); } });
            toast({ title: "Master Pause", description: "All active Projects jobs paused." });
        }
    };

    const handleResumeAll = () => {
        if (!socketRef.current) return;
        const path = location.pathname;

        if (path === '/') {
            Object.keys(jobs).forEach(pName => { if (jobs[pName].isProcessing && jobs[pName].isPaused) { socketRef.current?.emit('resumeJob', { profileName: pName, jobType: 'ticket' }); setJobs((prev: any) => ({ ...prev, [pName]: { ...prev[pName], isPaused: false } })); } });
            toast({ title: "Master Resume", description: "All Desk jobs are running again!" });
        } else if (path === '/projects-tasks') {
            Object.keys(projectsJobs).forEach(pName => { if (projectsJobs[pName].isProcessing && projectsJobs[pName].isPaused) { socketRef.current?.emit('resumeJob', { profileName: pName, jobType: 'projects' }); setProjectsJobs((prev: any) => ({ ...prev, [pName]: { ...prev[pName], isPaused: false } })); } });
            toast({ title: "Master Resume", description: "All Projects jobs are running again!" });
        }
    };

    const handleEndAll = () => {
        if (!socketRef.current) return;
        const path = location.pathname;
        let activeJobs = false;

        if (path === '/') activeJobs = Object.values(jobs).some((j: any) => j.isProcessing);
        else if (path === '/projects-tasks') activeJobs = Object.values(projectsJobs).some((j: any) => j.isProcessing);

        if (!activeJobs) return toast({ title: "N/A", description: "No active jobs to end." });
        if (!window.confirm("Are you sure you want to completely end ALL active jobs on this page?")) return;
        
        abortStartAllRef.current = true; 
        
        if (path === '/') {
            Object.keys(jobs).forEach(pName => { if (jobs[pName].isProcessing) { socketRef.current?.emit('endJob', { profileName: pName, jobType: 'ticket' }); setJobs((prev: any) => ({ ...prev, [pName]: { ...prev[pName], isProcessing: false, isPaused: false } })); } });
            toast({ title: "Master Stop", description: "All Desk jobs ended.", variant: "destructive" });
        } else if (path === '/projects-tasks') {
            Object.keys(projectsJobs).forEach(pName => { if (projectsJobs[pName].isProcessing) { socketRef.current?.emit('endJob', { profileName: pName, jobType: 'projects' }); setProjectsJobs((prev: any) => ({ ...prev, [pName]: { ...prev[pName], isProcessing: false, isPaused: false } })); } });
            toast({ title: "Master Stop", description: "All Projects jobs ended.", variant: "destructive" });
        }
    };

    return (
        <>
            <Routes>
                <Route path="/" element={<Index jobs={jobs} setJobs={setJobs} socket={socketRef.current} createInitialJobState={createInitialJobState} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/single-ticket" element={<SingleTicket onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/email-statics" element={<EmailStatics onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/bulk-signup" element={<BulkSignup jobs={catalystJobs} setJobs={setCatalystJobs} socket={socketRef.current} createInitialJobState={createInitialCatalystJobState} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/catalyst-users" element={<CatalystUsers socket={socketRef.current} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/bulk-email" element={<BulkEmail jobs={emailJobs} setJobs={setEmailJobs} socket={socketRef.current} createInitialJobState={createInitialEmailJobState} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/qntrl-forms" element={<BulkQntrlCards jobs={qntrlJobs} setJobs={setQntrlJobs} socket={socketRef.current} createInitialJobState={createInitialQntrlJobState} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/people-forms" element={<PeopleForms jobs={peopleJobs} setJobs={setPeopleJobs} socket={socketRef.current} createInitialJobState={createInitialPeopleJobState} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/creator-forms" element={<CreatorForms jobs={creatorJobs} setJobs={setCreatorJobs} socket={socketRef.current} createInitialJobState={createInitialCreatorJobState} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/projects-tasks" element={<ProjectsTasksPage jobs={projectsJobs} setJobs={setProjectsJobs} socket={socketRef.current} createInitialJobState={createInitialProjectsJobState} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/bulk-webinar-registration" element={<BulkWebinarRegistration jobs={webinarJobs} setJobs={setWebinarJobs} socket={socketRef.current} createInitialJobState={createInitialWebinarJobState} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/bulk-fsm-contacts" element={<BulkContactsFsm jobs={fsmContactJobs} setJobs={setFsmContactJobs} createInitialJobState={createInitialFsmContactJobState} socket={socketRef.current} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/bulk-bookings" element={<BulkBookings jobs={bookingJobs} setJobs={setBookingJobs} createInitialJobState={createInitialBookingJobState} socket={socketRef.current} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} profiles={[]} />} />
                <Route path="/appointment-manager" element={<AppointmentManager socket={socketRef.current} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} jobs={jobs} />} />
                <Route path="/live-stats" element={
                    <DashboardLayout onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} profiles={[]} selectedProfile={null} onProfileChange={() => {}} apiStatus={{ status: 'success', message: '' }} onShowStatus={() => {}} onManualVerify={() => {}} socket={socketRef.current} jobs={jobs}>
                        <LiveStats jobs={jobs} invoiceJobs={invoiceJobs} catalystJobs={catalystJobs} emailJobs={emailJobs} qntrlJobs={qntrlJobs} peopleJobs={peopleJobs} creatorJobs={creatorJobs} projectsJobs={projectsJobs} webinarJobs={bookingJobs} bookingJobs={bookingJobs} />
                    </DashboardLayout>
                } />
                <Route path="/speed-test" element={<SpeedTest />} />
                <Route path="*" element={<NotFound />} />
            </Routes>
            
            <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} onSave={handleSaveProfile} profile={editingProfile} socket={socketRef.current} />

            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 rounded-full shadow-2xl border border-slate-200 dark:border-slate-800 z-[9999] transition-all">
                <button 
                    onClick={handleStartAll} disabled={isStartingAll}
                    className={`flex items-center text-xs font-bold text-white px-5 py-2.5 rounded-full shadow-md transition-transform hover:scale-105 ${isStartingAll ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    {isStartingAll ? '⏳ Starting...' : '🚀 Start All'}
                </button>
                <button onClick={handlePauseAll} className="flex items-center text-xs font-bold bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-2.5 rounded-full shadow-md transition-transform hover:scale-105">
                    ⏸️ Pause All
                </button>
                <button onClick={handleResumeAll} className="flex items-center text-xs font-bold bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-full shadow-md transition-transform hover:scale-105">
                    ▶️ Resume All
                </button>
                <button onClick={handleEndAll} className="flex items-center text-xs font-bold bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-full shadow-md transition-transform hover:scale-105">
                    🛑 End All
                </button>
            </div>

            <button 
                onClick={() => {
                    if (window.confirm("Force Sync with Database?")) socketRef.current?.emit('requestDatabaseSync');
                }}
                className="fixed bottom-2 right-2 text-[10px] bg-blue-100 text-blue-800 px-2 py-1 rounded opacity-30 hover:opacity-100 z-[9999] transition-opacity"
            >
                Force DB Sync
            </button>
        </>
    );
};

const App = () => (
    <QueryClientProvider client={queryClient}>
        <TooltipProvider>
            <BrowserRouter>
                <Toaster />
                <Sonner />
                <MainApp />
            </BrowserRouter>
        </TooltipProvider>
    </QueryClientProvider>
);

export default App;
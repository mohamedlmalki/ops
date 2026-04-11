// --- FILE: src/hooks/useJobTimer.ts ---

import { useEffect } from 'react';
import { 
    Jobs, InvoiceJobs, CatalystJobs, EmailJobs, QntrlJobs, 
    PeopleJobs, CreatorJobs, ProjectsJobs, WebinarJobs, ExpenseJobs,
    BookingJobs, FsmContactJobs
} from '@/App'; 

// 1. Union of all Job State Objects
type AnyJobsState = Jobs | InvoiceJobs | CatalystJobs | EmailJobs | QntrlJobs | PeopleJobs | CreatorJobs | ProjectsJobs | WebinarJobs | ExpenseJobs | BookingJobs | FsmContactJobs;

type SetJobsState<T> = React.Dispatch<React.SetStateAction<T>>;

// 2. Added all JobTypes
type JobType = 'ticket' | 'invoice' | 'catalyst' | 'email' | 'qntrl' | 'people' | 'creator' | 'projects' | 'webinar' | 'expense' | 'bookings' | 'fsm-contact';

export function useJobTimer<T extends AnyJobsState>(
    jobsState: T, 
    setJobsState: SetJobsState<T>, 
    jobType: JobType 
) {
    useEffect(() => {
        // ENTERPRISE UPGRADE: This is just a dumb terminal metronome. 
        // It blindly adds +1 purely for visuals. The Database is the real source of truth now.
        const intervalId = setInterval(() => {
            
            // Use the functional state update to ALWAYS grab the freshest data
            setJobsState((prevState: any) => {
                let hasChanges = false;
                const nextState = { ...prevState };

                Object.keys(nextState).forEach(profileName => {
                    const job = nextState[profileName];

                    // Only tick if the job is actively processing
                    if (job && job.isProcessing && !job.isPaused) {
                        hasChanges = true;

                        // 1. Tick the Stopwatch
                        const newTime = (job.processingTime || 0) + 1;
                        
                        // 2. Tick the Countdown Timer
                        const newCountdown = Math.max(0, (job.countdown || 0) - 1);

                        nextState[profileName] = {
                            ...job,
                            processingTime: newTime,
                            countdown: newCountdown
                        };
                    }
                });

                // If no jobs are running, return prevState (this tells React NOT to re-render)
                return hasChanges ? nextState : prevState;
            });

        }, 1000);

        // 🧹 BULLETPROOF CLEANUP: When the page unmounts, strictly kill this exact interval.
        return () => clearInterval(intervalId);

    }, [setJobsState, jobType]);
}
// --- FILE: src/pages/PeopleForms.tsx ---

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { useLocation } from 'react-router-dom'; 
import { Profile, PeopleJobs, PeopleJobState, PeopleFormData } from '@/App';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
    FileText, RefreshCw, Loader2, Check, X, Shield, Send, Users, Clock, 
    Pause, Play, Square, CheckCircle2, XCircle, Hourglass, RotateCcw, Trash2
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeopleResultsDisplay } from "@/components/dashboard/people/PeopleResultsDisplay";
import { formatTime } from '@/lib/utils';

const SERVER_URL = "http://localhost:3000";

interface PeopleForm {
    componentId: number;
    iscustom: boolean;
    displayName: string;
    formLinkName: string;
    PermissionDetails: { Add: number; Edit: number; View: number; };
    isVisible: boolean;
    viewDetails: { view_Id: number; view_Name: string; };
}

interface FormComponent {
    comptype: string;
    ismandatory: boolean;
    displayname: string;
    labelname: string;
    maxLength?: number;
    Options?: { [key: string]: { Value: string; Id: string; } };
    tabularSections?: { [key: string]: any[] };
}

interface PeopleFormsProps {
  jobs: PeopleJobs;
  setJobs: React.Dispatch<React.SetStateAction<PeopleJobs>>;
  socket: Socket | null;
  createInitialJobState: () => PeopleJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

const DynamicFormField = ({ field, value, onChange, isBulk = false, disabled = false }: { 
    field: FormComponent, 
    value: string, 
    onChange: (labelname: string, value: string) => void,
    isBulk?: boolean,
    disabled?: boolean
}) => {
    const id = `field-${isBulk ? 'bulk-' : ''}${field.labelname}`;
    
    if (isBulk) {
        return (
            <div className="space-y-2">
                <Label htmlFor={id}>
                    {field.displayname} (default) {field.ismandatory && <span className="text-destructive">*</span>}
                </Label>
                <Input 
                    id={id} 
                    type="text" 
                    value={value} 
                    onChange={(e) => onChange(field.labelname, e.target.value)}
                    placeholder={`Default value for ${field.displayname}`}
                    disabled={disabled}
                />
            </div>
        );
    }
    
    switch (field.comptype) {
        case 'Email':
            return (
                <div className="space-y-2">
                    <Label htmlFor={id}>{field.displayname} {field.ismandatory && <span className="text-destructive">*</span>}</Label>
                    <Input id={id} type="email" value={value} onChange={(e) => onChange(field.labelname, e.target.value)} maxLength={field.maxLength} disabled={disabled} />
                </div>
            );
        case 'Text':
        case 'Phone':
        case 'Number':
        case 'Auto_Number':
            return (
                <div className="space-y-2">
                    <Label htmlFor={id}>{field.displayname} {field.ismandatory && <span className="text-destructive">*</span>}</Label>
                    <Input 
                        id={id} 
                        type={field.comptype === 'Number' ? 'number' : 'text'}
                        value={value} 
                        onChange={(e) => onChange(field.labelname, e.target.value)}
                        maxLength={field.maxLength}
                        disabled={field.comptype === 'Auto_Number' || disabled}
                    />
                </div>
            );
        case 'Multi_Line':
            return (
                 <div className="space-y-2">
                    <Label htmlFor={id}>{field.displayname} {field.ismandatory && <span className="text-destructive">*</span>}</Label>
                    <Textarea id={id} value={value} onChange={(e) => onChange(field.labelname, e.target.value)} maxLength={field.maxLength} disabled={disabled} />
                </div>
            );
        case 'Lookup':
            if (field.Options) {
                 return (
                    <div className="space-y-2">
                        <Label htmlFor={id}>{field.displayname} {field.ismandatory && <span className="text-destructive">*</span>}</Label>
                        <Select value={value} onValueChange={(val) => onChange(field.labelname, val)} disabled={disabled}>
                            <SelectTrigger id={id}><SelectValue placeholder="Select an option..." /></SelectTrigger>
                            <SelectContent>
                                {Object.values(field.Options).map(opt => (
                                    <SelectItem key={opt.Id} value={opt.Id}>{opt.Value}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                );
            }
            return (
                 <div className="space-y-2">
                    <Label htmlFor={id}>{field.displayname} (Lookup ID) {field.ismandatory && <span className="text-destructive">*</span>}</Label>
                    <Input id={id} type="text" value={value} onChange={(e) => onChange(field.labelname, e.target.value)} placeholder="Enter Lookup ID" disabled={disabled} />
                </div>
            )
        default:
            return (
                <div className="space-y-2">
                    <Label htmlFor={id}>{field.displayname} ({field.comptype}) {field.ismandatory && <span className="text-destructive">*</span>}</Label>
                    <Input id={id} type="text" value={value} onChange={(e) => onChange(field.labelname, e.target.value)} placeholder={`Enter value for ${field.labelname}`} disabled={disabled} />
                </div>
            );
    }
}

const PeopleForms: React.FC<PeopleFormsProps> = (props) => {
  const location = useLocation(); 
  const { toast } = useToast(); 
  const redirectProcessed = useRef(false);

  const [activeProfileName, setActiveProfileName] = useState<string | null>(() => {
      return localStorage.getItem('zoho_people_last_profile') || null;
  });

  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Checking...' });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [forms, setForms] = useState<PeopleForm[]>([]);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [components, setComponents] = useState<FormComponent[]>([]);
  const [isLoadingComponents, setIsLoadingComponents] = useState(false);
  const [singleFormData, setSingleFormData] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCustomOnly, setShowCustomOnly] = useState(true);

  const { jobs, setJobs, createInitialJobState } = props;

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: () => fetch(`${SERVER_URL}/api/profiles`).then(res => res.json()),
  });

  const peopleProfiles = useMemo(() => {
    return profiles.filter(p => p.people && p.people.orgId);
  }, [profiles]);

  useEffect(() => {
      if (activeProfileName) {
          localStorage.setItem('zoho_people_last_profile', activeProfileName);
      }
  }, [activeProfileName]);

  const selectedProfile = peopleProfiles.find(p => p.profileName === activeProfileName) || null;

  const activeJob = useMemo(() => {
      if (selectedProfile && jobs[selectedProfile.profileName]) {
          return jobs[selectedProfile.profileName];
      }
      return createInitialJobState();
  }, [jobs, selectedProfile, createInitialJobState]);

  const { formData } = activeJob;
  const { 
    selectedFormId, 
    bulkPrimaryField, 
    bulkPrimaryValues, 
    bulkDefaultData, 
    bulkDelay,
  } = formData;

  const stopAfterFailures = (formData as any).stopAfterFailures;

  useEffect(() => {
      if (activeProfileName && selectedFormId) {
          const cacheKey = `zoho_people_single_${activeProfileName}_${selectedFormId}`;
          const cachedStr = localStorage.getItem(cacheKey);
          if (cachedStr) {
              try { setSingleFormData(JSON.parse(cachedStr)); } catch(e){ setSingleFormData({}); }
          } else {
              setSingleFormData({});
          }
      }
  }, [activeProfileName, selectedFormId]);

  const recordCount = useMemo(() => {
      if (!bulkPrimaryValues) return 0;
      return bulkPrimaryValues.split('\n').filter(line => line.trim() !== '').length;
  }, [bulkPrimaryValues]);

  const filteredForms = useMemo(() => {
    if (!showCustomOnly) return forms;
    return forms.filter(form => form.iscustom === true);
  }, [forms, showCustomOnly]);

  const selectedForm = useMemo(() => {
    return forms.find(form => form.componentId.toString() === selectedFormId);
  }, [forms, selectedFormId]);
  
  const formFields = useMemo(() => {
      return components.filter(c => !c.tabularSections);
  }, [components]);

  const autoEmailField = useMemo(() => {
      return formFields.find(f => f.comptype === 'Email' || f.labelname.includes('Email'))?.labelname || null;
  }, [formFields]);

  useEffect(() => {
    if (peopleProfiles.length === 0) return;

    if (!redirectProcessed.current && location.state?.targetProfile) {
        const target = peopleProfiles.find(p => p.profileName === location.state.targetProfile);
        if (target) {
            setActiveProfileName(target.profileName);
            redirectProcessed.current = true;
            return;
        }
    }

    if (!activeProfileName || !peopleProfiles.find(p => p.profileName === activeProfileName)) {
      setActiveProfileName(peopleProfiles[0].profileName);
    }
  }, [peopleProfiles, activeProfileName, location.state]);
  
  const fetchForms = useCallback(() => {
    if (props.socket && selectedProfile) {
        setIsLoadingForms(true);
        props.socket.emit('getPeopleForms', { selectedProfileName: selectedProfile.profileName });
    }
  }, [props.socket, selectedProfile]);

  useEffect(() => {
    if (!props.socket) return;
    
    const handleApiStatus = (result: any) => {
      setApiStatus(result.success ? 
        { status: 'success', message: result.message, fullResponse: result.fullResponse } :
        { status: 'error', message: result.message, fullResponse: result.fullResponse }
      );
    };
    
    const handleFormsResult = (result: { success: boolean, forms?: PeopleForm[], error?: string }) => {
        setIsLoadingForms(false);
        if (result.success && result.forms) setForms(result.forms);
        else { setForms([]); toast({ title: "Error Fetching Forms", description: result.error, variant: "destructive" }); }
    };
    
    const handleFormComponentsResult = (result: { success: boolean, components?: FormComponent[], error?: string }) => {
        setIsLoadingComponents(false);
        if (result.success && result.components) { 
            setComponents(result.components); 
        } else { 
            setComponents([]); 
            toast({ title: "Error Fetching Form Fields", description: result.error, variant: "destructive" }); 
        }
    };
    
    const handleInsertResult = (result: { success: boolean, result?: any, error?: string }) => {
        setIsSubmitting(false);
        if (result.success) {
            toast({ title: "Record Added Successfully", description: result.result?.message || `Record ID: ${result.result?.pkId}` });
            setSingleFormData({});
            if (activeProfileName && selectedFormId) {
                localStorage.removeItem(`zoho_people_single_${activeProfileName}_${selectedFormId}`);
            }
        } else {
            toast({ title: "Failed to Add Record", description: result.error, variant: "destructive" });
        }
    };

    const handleJobPaused = (data: { profileName: string, reason: string, jobType: string }) => {
        if (data.jobType === 'people') {
            setJobs((prev: any) => ({
                ...prev,
                [data.profileName]: { ...prev[data.profileName], isPaused: true }
            }));
            toast({ title: "Auto-Paused", description: data.reason, variant: "destructive" });
        }
    };

    const handleBulkComplete = (data: { profileName: string, jobType: string }) => {
        if (data.jobType === 'people') {
            setJobs((prev: any) => ({
                ...prev,
                [data.profileName]: { ...prev[data.profileName], isProcessing: false, isPaused: false, isComplete: true }
            }));
            toast({ title: "Job Complete", description: "All records have been processed." });
        }
    };

    const handleBulkEnded = (data: { profileName: string, jobType: string }) => {
        if (data.jobType === 'people') {
            setJobs((prev: any) => ({
                ...prev,
                [data.profileName]: { ...prev[data.profileName], isProcessing: false, isPaused: false }
            }));
            toast({ title: "Job Ended", description: "The bulk job was ended." });
        }
    };
    
    props.socket.on('apiStatusResult', handleApiStatus);
    props.socket.on('peopleFormsResult', handleFormsResult);
    props.socket.on('peopleFormComponentsResult', handleFormComponentsResult);
    props.socket.on('peopleInsertRecordResult', handleInsertResult);
    props.socket.on('jobPaused', handleJobPaused);
    props.socket.on('bulkComplete', handleBulkComplete);
    props.socket.on('bulkEnded', handleBulkEnded);
    
    return () => {
      props.socket.off('apiStatusResult', handleApiStatus);
      props.socket.off('peopleFormsResult', handleFormsResult);
      props.socket.off('peopleFormComponentsResult', handleFormComponentsResult);
      props.socket.off('peopleInsertRecordResult', handleInsertResult);
      props.socket.off('jobPaused', handleJobPaused);
      props.socket.off('bulkComplete', handleBulkComplete);
      props.socket.off('bulkEnded', handleBulkEnded);
    };
  }, [props.socket, toast, setJobs, activeProfileName, selectedFormId]);

  useEffect(() => {
      if (!props.socket || !selectedProfile || !selectedForm) return;
      
      const onRecovery = (data: { profileName: string, jobType: string }) => {
          if (data.profileName === selectedProfile.profileName && data.jobType === 'people') {
              const allValues = bulkPrimaryValues.split('\n').map(v => v.trim()).filter(Boolean);
              const processedCount = activeJob.results.length;
              const remainingValues = allValues.slice(processedCount);

              if (remainingValues.length === 0) {
                  toast({ title: 'Complete', description: 'No remaining records.' });
                  setJobs((prev: any) => ({ ...prev, [selectedProfile.profileName]: { ...prev[selectedProfile.profileName], isPaused: false, isProcessing: false, isComplete: true }}));
                  return;
              }

              setJobs(prev => ({ 
                  ...prev, 
                  [selectedProfile.profileName]: { ...prev[selectedProfile.profileName], isPaused: false, isProcessing: true, isComplete: false }
              }));

              props.socket.emit('startBulkInsertPeopleRecords', {
                  selectedProfileName: selectedProfile.profileName,
                  formLinkName: selectedForm.formLinkName,
                  primaryFieldLabelName: bulkPrimaryField,
                  primaryFieldValues: remainingValues,
                  defaultData: bulkDefaultData,
                  delay: bulkDelay,
                  stopAfterFailures: stopAfterFailures 
              });

              toast({ title: 'Session Recovered', description: `Resuming ${remainingValues.length} remaining records...` });
          }
      };
      
      props.socket.on('requestJobRecovery', onRecovery);
      return () => { props.socket.off('requestJobRecovery', onRecovery); };
  }, [props.socket, selectedProfile, selectedForm, bulkPrimaryValues, activeJob.results.length, bulkPrimaryField, bulkDefaultData, bulkDelay, stopAfterFailures]);


  useEffect(() => {
    if (selectedProfile && props.socket) {
        fetchForms();
    }
  }, [selectedProfile, props.socket]);

  useEffect(() => {
    if (selectedForm && props.socket) {
        setIsLoadingComponents(true);
        setComponents([]);
        props.socket.emit('getPeopleFormComponents', {
            selectedProfileName: selectedProfile?.profileName,
            formLinkName: selectedForm.formLinkName
        });
    } else {
        setComponents([]);
    }
  }, [selectedForm, props.socket, selectedProfile]);
  
  const handleFormStateChange = useCallback((field: keyof PeopleFormData, value: any) => {
    if (activeProfileName) {
      setJobs(prev => {
        const currentJob = prev[activeProfileName] || createInitialJobState();
        const newFormData = { ...currentJob.formData, [field]: value };
        
        if (field === 'selectedFormId' && value !== currentJob.formData.selectedFormId) {
            newFormData.bulkDefaultData = {};
            newFormData.bulkPrimaryField = '';
        }

        return {
          ...prev,
          [activeProfileName]: {
            ...currentJob,
            formData: newFormData
          }
        };
      });
    }
  }, [activeProfileName, setJobs, createInitialJobState]);

  useEffect(() => {
    if (isLoadingForms || forms.length === 0) return;
    
    if (!activeJob.isProcessing && filteredForms.length > 0 && !selectedFormId) {
      handleFormStateChange('selectedFormId', filteredForms[0].componentId.toString());
    }
    
    if (selectedFormId && !filteredForms.find(f => f.componentId.toString() === selectedFormId)) {
        if (!activeJob.isProcessing) {
             handleFormStateChange('selectedFormId', filteredForms.length > 0 ? filteredForms[0].componentId.toString() : "");
        }
    }
  }, [filteredForms, selectedFormId, activeJob.isProcessing, isLoadingForms, forms.length, handleFormStateChange]);

  useEffect(() => {
    if (isLoadingComponents || components.length === 0) return;

    if (!bulkPrimaryField && !activeJob.isProcessing) {
      if (autoEmailField) {
        handleFormStateChange('bulkPrimaryField', autoEmailField);
      } else if (formFields.length > 0) {
        handleFormStateChange('bulkPrimaryField', formFields[0].labelname);
      }
    }
  }, [autoEmailField, formFields, activeJob.isProcessing, isLoadingComponents, components.length, bulkPrimaryField, handleFormStateChange]);

  const handleManualVerify = (service: string = 'people') => {
    if (props.socket && selectedProfile) {
      setApiStatus({ status: 'loading', message: 'Verifying...' });
      props.socket.emit('checkApiStatus', { selectedProfileName: selectedProfile.profileName, service: service });
    }
  };

  const handleProfileChange = (profileName: string) => {
    setActiveProfileName(profileName);
    setApiStatus({ status: 'loading', message: 'Checking...' });
    setForms([]);
    setComponents([]);
  };
  
  const handleSingleFormChange = (labelname: string, value: string) => {
      setSingleFormData(prev => {
          const newData = { ...prev, [labelname]: value };
          if (activeProfileName && selectedFormId) {
              try {
                  const cacheKey = `zoho_people_single_${activeProfileName}_${selectedFormId}`;
                  localStorage.setItem(cacheKey, JSON.stringify(newData));
              } catch (e) {
                  // Safety net
              }
          }
          return newData;
      });
  };
  
  const handleSubmit = () => {
      if (!selectedForm || !props.socket) return;
      for (const field of formFields) {
          if (field.ismandatory && !singleFormData[field.labelname]) {
              toast({ title: "Missing Mandatory Field", description: `"${field.displayname}" is required.`, variant: "destructive" });
              return;
          }
      }
      setIsSubmitting(true);
      props.socket.emit('insertPeopleRecord', { selectedProfileName: selectedProfile?.profileName, formLinkName: selectedForm.formLinkName, inputData: singleFormData });
  };

  const handleToggleChange = (checked: boolean) => setShowCustomOnly(checked);
  
  const handleBulkDefaultDataChange = useCallback((labelname: string, value: string) => {
    if (activeProfileName && selectedFormId) {
      setJobs(prev => {
        const currentJob = prev[activeProfileName] || createInitialJobState();
        return {
          ...prev,
          [activeProfileName]: {
            ...currentJob,
            formData: {
              ...currentJob.formData,
              bulkDefaultData: {
                  ...currentJob.formData.bulkDefaultData,
                  [labelname]: value
              }
            }
          }
        };
      });
    }
  }, [activeProfileName, selectedFormId, setJobs, createInitialJobState]);

  const handleClearDefaults = () => {
      handleFormStateChange('bulkDefaultData', {});
      toast({ title: "Defaults Cleared", description: "Wiped all default values." });
  };

  const handleStartBulkImport = () => {
    if (!props.socket || !selectedProfile || !selectedForm || !bulkPrimaryField) {
        toast({ title: "Error", description: "Missing profile, form, or primary field.", variant: "destructive" }); return;
    }
    
    const primaryValues = bulkPrimaryValues.split('\n').map(v => v.trim()).filter(Boolean);
    if (primaryValues.length === 0) {
        toast({ title: "No Primary Values", description: "Please paste values into the list.", variant: "destructive" }); return;
    }

    setJobs(prev => {
      const currentJob = prev[selectedProfile.profileName] || createInitialJobState();
      return {
        ...prev,
        [selectedProfile.profileName]: {
            ...currentJob, isProcessing: true, isPaused: false, isComplete: false, processingStartTime: new Date(),
            totalToProcess: primaryValues.length, currentDelay: bulkDelay, results: [], filterText: '', processingTime: 0, 
        }
      };
    });
    
    props.socket.emit('startBulkInsertPeopleRecords', {
        selectedProfileName: selectedProfile.profileName,
        formLinkName: selectedForm.formLinkName,
        primaryFieldLabelName: bulkPrimaryField,
        primaryFieldValues: primaryValues,
        defaultData: bulkDefaultData,
        delay: bulkDelay,
        stopAfterFailures: stopAfterFailures 
    });
  };

  const handlePauseResume = () => {
    if (!props.socket || !selectedProfile) return;
    const isPaused = activeJob.isPaused;
    
    if (isPaused) {
        props.socket.emit('resumeJob', { profileName: selectedProfile.profileName, jobType: 'people' });
        setJobs(prev => ({ ...prev, [selectedProfile.profileName]: { ...prev[selectedProfile.profileName], isPaused: false, isProcessing: true }}));
        toast({ title: 'Job Resuming...' });
    } else {
        props.socket.emit('pauseJob', { profileName: selectedProfile.profileName, jobType: 'people' });
        setJobs(prev => ({ ...prev, [selectedProfile.profileName]: { ...prev[selectedProfile.profileName], isPaused: true }}));
        toast({ title: `Job Paused` });
    }
  };

  const handleEndJob = () => {
    if (!props.socket || !selectedProfile) return;
    props.socket.emit('endJob', { profileName: selectedProfile.profileName, jobType: 'people' });
  };
  
  const handleFilterTextChange = (text: string) => {
    if (selectedProfile) {
      setJobs(prev => {
        const profileJob = prev[selectedProfile.profileName] || createInitialJobState();
        return { ...prev, [selectedProfile.profileName]: { ...profileJob, filterText: text } };
      });
    }
  };

  const handleRetryFailed = () => {
      if (!selectedProfile || !activeJob) return;
      const failedItems = activeJob.results.filter(r => !r.success);
      if (failedItems.length === 0) { toast({ title: "No failed items found to retry." }); return; }

      const failedValues = failedItems.map(r => r.email).join('\n'); 
      handleFormStateChange('bulkPrimaryValues', failedValues);

      setJobs(prev => ({
          ...prev,
          [selectedProfile.profileName]: {
              ...prev[selectedProfile.profileName],
              isProcessing: false, isPaused: false, isComplete: false, results: [], processingTime: 0, totalToProcess: failedItems.length
          }
      }));
      toast({ title: "Retry Ready", description: `${failedItems.length} failed records loaded. Click Start.` });
  };

  const layoutProps = {
    onAddProfile: props.onAddProfile,
    onEditProfile: props.onEditProfile,
    onDeleteProfile: props.onDeleteProfile,
    profiles: peopleProfiles,
    selectedProfile: selectedProfile,
    onProfileChange: handleProfileChange,
    apiStatus: apiStatus,
    onShowStatus: () => setIsStatusModalOpen(true),
    onManualVerify: () => handleManualVerify('people'),
    socket: props.socket,
    jobs: props.jobs,
    stats: {
      totalTickets: activeJob?.results.length || 0,
      totalToProcess: activeJob?.totalToProcess || 0,
      isProcessing: activeJob?.isProcessing || false,
    },
    service: 'people' as const, 
  };
  
  const remainingCount = activeJob.totalToProcess - activeJob.results.length;

  return (
    <>
      <DashboardLayout {...layoutProps}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Zoho People Forms</h1>
          <Button onClick={fetchForms} disabled={isLoadingForms || !selectedProfile} variant="outline" className="bg-background">
            {isLoadingForms ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh Forms
          </Button>
        </div>
        
        {/* 🔥 NEW SIDE-BY-SIDE GRID LAYOUT 🔥 */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            
            {/* LEFT COLUMN: RESULTS TABLE */}
            <div className="xl:col-span-7 2xl:col-span-8 order-2 xl:order-1">
                {selectedProfile ? (
                    <div className="bg-card border rounded-xl shadow-sm overflow-hidden h-full">
                        <PeopleResultsDisplay
                            results={activeJob.results}
                            isProcessing={activeJob.isProcessing}
                            isComplete={activeJob.isComplete}
                            totalToProcess={activeJob.totalToProcess}
                            countdown={activeJob.countdown}
                            filterText={activeJob.filterText}
                            onFilterTextChange={handleFilterTextChange}
                            primaryFieldLabel={formFields.find(f => f.labelname === bulkPrimaryField)?.displayname || 'Primary Field'}
                        />
                    </div>
                ) : (
                    <Card className="flex flex-col min-h-[400px] items-center justify-center text-muted-foreground border-dashed">
                        <Users className="h-12 w-12 mb-4 opacity-20" />
                        <p>Please select or add a People profile to continue.</p>
                    </Card>
                )}
            </div>

            {/* RIGHT COLUMN: FORMS (Sticky) */}
            <div className="xl:col-span-5 2xl:col-span-4 order-1 xl:order-2">
                <Card className="sticky top-6 shadow-md border-primary/10">
                    <CardHeader className="bg-muted/30 pb-4 border-b">
                        <CardTitle className="flex items-center text-lg"><FileText className="mr-2 h-5 w-5 text-primary" /> Active Form Controls</CardTitle>
                        <CardDescription>Select a form and fill in the details below.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 space-y-6">
                        
                        {/* FORM SELECTOR */}
                        <div className="space-y-3 bg-muted/20 p-4 rounded-lg border">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="form-select" className="font-semibold">Available Forms ({filteredForms.length})</Label>
                                <div className="flex items-center space-x-2">
                                    <Switch id="custom-forms-only" checked={showCustomOnly} onCheckedChange={handleToggleChange} disabled={activeJob.isProcessing} />
                                    <Label htmlFor="custom-forms-only" className="text-xs">Custom Only</Label>
                                </div>
                            </div>
                            <Select value={selectedFormId} onValueChange={(val) => handleFormStateChange('selectedFormId', val)} disabled={isLoadingForms || forms.length === 0 || activeJob.isProcessing}>
                                <SelectTrigger id="form-select" className="w-full bg-background font-medium">
                                    <SelectValue placeholder={isLoadingForms ? "Loading forms..." : "Select a form..."} />
                                </SelectTrigger>
                                <SelectContent className="z-[99]">
                                    {filteredForms.map((form) => (
                                        <SelectItem key={form.componentId} value={form.componentId.toString()}>
                                            <div className="flex items-center space-x-2">
                                                {form.iscustom ? <Badge variant="outline" className="text-[10px] h-5">Custom</Badge> : <Badge variant="secondary" className="text-[10px] h-5">System</Badge>}
                                                <span className="truncate">{form.displayName}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {selectedForm && (
                        <Tabs defaultValue="bulk" className="w-full"> 
                            <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="single" disabled={activeJob.isProcessing}>Single Record</TabsTrigger>
                            <TabsTrigger value="bulk" disabled={activeJob.isProcessing}>Bulk Import</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="single" className="mt-0">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">New Record Details</h3>
                                        <Button variant="ghost" size="sm" onClick={() => { if (activeProfileName && selectedFormId) { localStorage.removeItem(`zoho_people_single_${activeProfileName}_${selectedFormId}`); setSingleFormData({}); toast({ title: "Form Cleared" }); } }} className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-3 w-3 mr-1" /> Clear</Button>
                                    </div>
                                    
                                    <div className="bg-muted/10 p-4 rounded-lg border">
                                        {isLoadingComponents ? (
                                            <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                                        ) : formFields.length > 0 ? (
                                            <div className="grid grid-cols-1 gap-5">
                                                {formFields.map(field => (
                                                    <DynamicFormField key={field.labelname} field={field} value={singleFormData[field.labelname] || ''} onChange={handleSingleFormChange} disabled={isSubmitting} />
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-center text-muted-foreground py-4">No fields available.</p>
                                        )}
                                    </div>
                                    
                                    {formFields.length > 0 && (
                                        <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full mt-4">
                                            {isSubmitting ? ( <Loader2 className="mr-2 h-4 w-4 animate-spin" /> ) : ( <Send className="mr-2 h-4 w-4" /> )} Submit Record
                                        </Button>
                                    )}
                                </div>
                            </TabsContent>
                            
                            <TabsContent value="bulk" className="mt-0">
                                <div className="flex flex-col gap-5">
                                    
                                    {/* BLOCK 1: PRIMARY VALUES & SETTINGS */}
                                    <div className="space-y-4 p-4 border rounded-lg bg-card shadow-sm">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center mb-1">
                                                <Label htmlFor="primary-values" className="font-bold">{formFields.find(f => f.labelname === bulkPrimaryField)?.displayname || 'Primary Values'}</Label>
                                                <Badge variant="secondary" className="font-mono text-xs">{recordCount} lines</Badge>
                                            </div>
                                            <Textarea
                                                id="primary-values" placeholder="Paste your list here...&#x0A;One value per line" className="min-h-[150px] font-mono text-sm resize-y"
                                                value={bulkPrimaryValues} onChange={(e) => handleFormStateChange('bulkPrimaryValues', e.target.value)} disabled={activeJob.isProcessing}
                                            />
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <Label htmlFor="primary-field" className="text-xs text-muted-foreground font-semibold uppercase">Map List To Field:</Label>
                                            <Select value={bulkPrimaryField} onValueChange={(val) => handleFormStateChange('bulkPrimaryField', val)} disabled={activeJob.isProcessing}>
                                                <SelectTrigger id="primary-field" className="bg-background"><SelectValue placeholder="Select primary field..." /></SelectTrigger>
                                                <SelectContent>
                                                    {formFields.map(f => (<SelectItem key={f.labelname} value={f.labelname}>{f.displayname}</SelectItem>))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="delay" className="text-xs">Delay (seconds)</Label>
                                                <Input id="delay" type="number" min="0" step="1" value={bulkDelay} onChange={(e) => handleFormStateChange('bulkDelay', parseInt(e.target.value) || 0)} disabled={activeJob.isProcessing} className="bg-background" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="stopFailures" className="text-xs whitespace-nowrap">Auto-Pause Error Limit</Label>
                                                <Input id="stopFailures" type="number" min="0" placeholder="0 = Off" value={stopAfterFailures === undefined ? '' : stopAfterFailures} onChange={(e) => { const val = e.target.value; handleFormStateChange('stopAfterFailures' as any, val === '' ? 0 : parseInt(val)); }} disabled={activeJob.isProcessing} className="bg-background" />
                                            </div>
                                        </div>

                                        {/* Mini Live Status Bar (Only shows when running) */}
                                        {activeJob && (activeJob.isProcessing || activeJob.results.length > 0) && (
                                            <div className="flex items-center justify-between bg-zinc-900 text-zinc-100 p-2.5 rounded-md mt-4 shadow-inner">
                                                <div className="flex flex-col items-center px-2"><Clock className="h-3 w-3 mb-1 opacity-50" /><span className="font-mono text-[10px] font-medium">{formatTime(activeJob.processingTime)}</span></div>
                                                <Separator orientation="vertical" className="h-6 bg-zinc-700" />
                                                <div className="flex flex-col items-center px-2"><Hourglass className="h-3 w-3 mb-1 opacity-50" /><span className="font-mono text-[10px] font-medium">{remainingCount < 0 ? 0 : remainingCount} Left</span></div>
                                                <Separator orientation="vertical" className="h-6 bg-zinc-700" />
                                                <div className="flex flex-col items-center px-2 text-green-400"><CheckCircle2 className="h-3 w-3 mb-1" /><span className="font-mono text-[10px] font-bold">{activeJob.results.filter(r => r.success).length} OK</span></div>
                                                <Separator orientation="vertical" className="h-6 bg-zinc-700" />
                                                <div className="flex flex-col items-center px-2 text-red-400"><XCircle className="h-3 w-3 mb-1" /><span className="font-mono text-[10px] font-bold">{activeJob.results.filter(r => !r.success).length} Err</span></div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* BLOCK 2: DEFAULT VALUES */}
                                    <div className="space-y-4 p-4 border rounded-lg bg-card shadow-sm">
                                        <div className="flex items-center justify-between border-b pb-2 mb-2">
                                            <Label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Static Default Values</Label>
                                            <Button variant="ghost" size="sm" onClick={handleClearDefaults} className="h-6 px-2 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-3 w-3 mr-1" /> Clear</Button>
                                        </div>
                                        
                                        {isLoadingComponents ? (
                                            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                                        ) : formFields.length > 0 ? (
                                            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                                {formFields.filter(f => f.labelname !== bulkPrimaryField).map(field => (
                                                    <DynamicFormField key={`bulk-${field.labelname}`} field={field} value={bulkDefaultData[field.labelname] || ''} onChange={handleBulkDefaultDataChange} isBulk={true} disabled={activeJob.isProcessing} />
                                                ))}
                                                {formFields.filter(f => f.labelname !== bulkPrimaryField).length === 0 && (
                                                    <p className="text-xs text-center text-muted-foreground italic py-2">No other fields available to set defaults.</p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-center text-muted-foreground py-2">Fields failed to load.</p>
                                        )}
                                    </div>
                                    
                                    {/* BLOCK 3: ACTION BUTTONS */}
                                    {formFields.length > 0 && (
                                        <div className="pt-2">
                                            {!activeJob.isProcessing ? (
                                                <div className="flex flex-col gap-2 w-full">
                                                    <Button onClick={handleStartBulkImport} disabled={!bulkPrimaryField || !bulkPrimaryValues} variant="default" size="lg" className="w-full shadow-md"><Send className="mr-2 h-4 w-4" /> Start Bulk Import</Button>
                                                    {activeJob.results.filter(r => !r.success).length > 0 && (
                                                        <Button variant="outline" size="sm" className="border-red-200 hover:bg-red-50 text-red-700" onClick={handleRetryFailed}><RotateCcw className="mr-2 h-3 w-3" /> Retry {activeJob.results.filter(r => !r.success).length} Failed Items</Button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-3 w-full">
                                                    <Button type="button" variant={activeJob.isPaused ? "default" : "secondary"} size="lg" onClick={handlePauseResume} className="shadow-sm">
                                                        {activeJob.isPaused ? <><Play className="h-4 w-4 mr-2" />Resume</> : <><Pause className="h-4 w-4 mr-2" />Pause</>}
                                                    </Button>
                                                    <Button type="button" variant="destructive" size="lg" onClick={handleEndJob} className="shadow-sm"><Square className="h-4 w-4 mr-2" /> End Job</Button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </div>
                            </TabsContent>
                        </Tabs>
                        )}
                    </CardContent>
                </Card>
            </div>

        </div>
      </DashboardLayout>

      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>API Connection Status</DialogTitle>
            <DialogDescription>This is the live status of the connection to the Zoho People API.</DialogDescription>
          </DialogHeader>
          <div className={`p-4 rounded-md ${apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50 text-green-900 dark:text-green-100' : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-100' : 'bg-muted'}`}>
            <p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p>
            <p className="text-sm mt-1 opacity-90">{apiStatus.message}</p>
          </div>
          {apiStatus.fullResponse && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4>
              <pre className="bg-zinc-950 p-4 rounded-lg text-xs font-mono text-zinc-300 border max-h-60 overflow-y-auto shadow-inner">{JSON.stringify(apiStatus.fullResponse, null, 2)}</pre>
            </div>
          )}
          <DialogFooter><Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PeopleForms;
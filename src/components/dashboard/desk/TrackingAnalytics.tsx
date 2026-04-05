// --- FILE: src/components/dashboard/desk/TrackingAnalytics.tsx ---

import React, { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RefreshCw, Eye, Users, Globe, Activity, Mail, Calendar as CalendarIcon, Trash2, MousePointerClick } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TrackingAnalyticsProps {
    isOpen: boolean;
    onClose: () => void;
    trackingUrl: string;
    profileName: string; 
}

interface LogEntry {
    email: string;
    ticketId: string;
    openedAt: string;
    country?: string;
    profileName?: string; 
    hasClicked?: boolean; 
    clickCount?: number; 
    clickCountry?: string; // <-- ADDED CLICK COUNTRY
}

export const TrackingAnalytics: React.FC<TrackingAnalyticsProps> = ({ isOpen, onClose, trackingUrl, profileName }) => {
    const { toast } = useToast();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [date, setDate] = useState<DateRange | undefined>({
        from: undefined,
        to: undefined,
    });

    const getApiUrl = () => {
        if (!trackingUrl) return '';
        return trackingUrl.endsWith('/api/logs') ? trackingUrl : trackingUrl.replace(/\/$/, '') + '/api/logs';
    };

    const fetchLogs = async () => {
        const url = getApiUrl();
        if (!url) return;
        setIsLoading(true);
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.success && data.logs) {
                const sorted = data.logs.sort((a: LogEntry, b: LogEntry) => 
                    new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
                );
                setLogs(sorted);
            }
        } catch (error) {
            console.error("Failed to fetch tracking logs", error);
            toast({ title: "Fetch Failed", description: "Could not reach Cloudflare.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearLogs = async () => {
        const url = getApiUrl();
        if (!url) return;
        
        if (!window.confirm("WARNING: This will permanently delete ALL tracking logs from your Cloudflare database. Continue?")) return;

        setIsClearing(true);
        try {
            const res = await fetch(url, {
                method: 'DELETE',
                headers: { 'x-tracking-secret': 'eygirl-secret-key-2026' }
            });
            const data = await res.json();
            
            if (data.success) {
                setLogs([]);
                toast({ title: "Database Cleared", description: "All tracking logs have been deleted." });
            } else {
                toast({ title: "Clear Failed", description: data.error || "Unauthorized", variant: "destructive" });
            }
        } catch (error) {
            toast({ title: "Clear Failed", description: "Network error occurred.", variant: "destructive" });
        } finally {
            setIsClearing(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchLogs();
    }, [isOpen, trackingUrl]);

    const filteredLogs = useMemo(() => {
        let filtered = logs.filter(log => log.profileName === profileName);

        if (date?.from) {
            filtered = filtered.filter(log => {
                const logDate = parseISO(log.openedAt);
                if (date.from && date.to) {
                    return isWithinInterval(logDate, { start: startOfDay(date.from), end: endOfDay(date.to) });
                }
                return logDate >= startOfDay(date.from);
            });
        }
        return filtered;
    }, [logs, date, profileName]);

    // --- DATA PROCESSING FOR CHARTS ---
    const uniqueViewers = new Set(filteredLogs.map(log => log.email)).size;
    const clickersCount = filteredLogs.filter(log => log.hasClicked).length;
    
    const timelineDataMap: Record<string, number> = {};
    filteredLogs.forEach(log => {
        const dateStr = format(parseISO(log.openedAt), 'MMM dd');
        timelineDataMap[dateStr] = (timelineDataMap[dateStr] || 0) + 1;
    });
    const timelineData = Object.keys(timelineDataMap).reverse().map(d => ({ name: d, Opens: timelineDataMap[d] }));

    const countryMap: Record<string, number> = {};
    filteredLogs.forEach(log => {
        const c = log.country || 'Unknown';
        countryMap[c] = (countryMap[c] || 0) + 1;
    });
    const pieData = Object.keys(countryMap).map(c => ({ name: c, value: countryMap[c] }));
    const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#64748b'];

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[400px] sm:w-[600px] sm:max-w-none overflow-y-auto bg-slate-50/50 dark:bg-slate-950">
                <SheetHeader className="mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                            <SheetTitle className="flex items-center text-2xl">
                                <Activity className="mr-2 h-6 w-6 text-blue-500" />
                                Live Analytics
                            </SheetTitle>
                            <SheetDescription>Showing data for: <strong className="text-primary">{profileName}</strong></SheetDescription>
                        </div>
                        
                        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !date && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date?.from ? (
                                            date.to ? (<>{format(date.from, "LLL dd")} - {format(date.to, "LLL dd")}</>) : (format(date.from, "LLL dd"))
                                        ) : (
                                            <span>Filter Date</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
                                </PopoverContent>
                            </Popover>

                            <Button variant="destructive" size="icon" onClick={handleClearLogs} disabled={isClearing || logs.length === 0} className="h-8 w-8 rounded-full" title="Clear Database">
                                <Trash2 className={`h-4 w-4 ${isClearing ? 'animate-pulse' : ''}`} />
                            </Button>

                            <Button variant="outline" size="icon" onClick={fetchLogs} disabled={isLoading} className="h-8 w-8 rounded-full" title="Refresh Data">
                                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
                            </Button>
                        </div>
                    </div>
                </SheetHeader>

                {!trackingUrl ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground bg-card rounded-lg border border-dashed">
                        <Globe className="h-12 w-12 mb-4 opacity-20" />
                        <p>No Tracking URL configured.</p>
                        <p className="text-xs mt-1">Add your Cloudflare Worker URL in your Profile Settings.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* KPI CARDS */}
                        <div className="grid grid-cols-3 gap-4">
                            <Card className="shadow-sm">
                                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                    <Eye className="h-5 w-5 text-blue-500 mb-2" />
                                    <p className="text-3xl font-bold">{filteredLogs.length}</p>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Opens</p>
                                </CardContent>
                            </Card>
                            <Card className="shadow-sm">
                                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                    <Users className="h-5 w-5 text-emerald-500 mb-2" />
                                    <p className="text-3xl font-bold">{uniqueViewers}</p>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Unique</p>
                                </CardContent>
                            </Card>
                            <Card className="shadow-sm border-purple-200 dark:border-purple-900 bg-purple-50/30 dark:bg-purple-900/10">
                                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                    <MousePointerClick className="h-5 w-5 text-purple-500 mb-2" />
                                    <p className="text-3xl font-bold text-purple-700 dark:text-purple-400">{clickersCount}</p>
                                    <p className="text-xs text-purple-600/70 dark:text-purple-400/70 font-medium uppercase tracking-wider">Clickers</p>
                                </CardContent>
                            </Card>
                        </div>

                        {/* TIMELINE CHART */}
                        {timelineData.length > 0 && (
                            <Card className="shadow-sm">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Engagement Timeline</CardTitle>
                                </CardHeader>
                                <CardContent className="h-[200px] p-0 px-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={timelineData}>
                                            <defs>
                                                <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                                            <YAxis fontSize={10} tickLine={false} axisLine={false} width={30} />
                                            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                                            <Area type="monotone" dataKey="Opens" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorOpens)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        )}

                        {/* TOP COUNTRIES PIE CHART */}
                        {pieData.length > 0 && (
                            <Card className="shadow-sm">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Top Locations</CardTitle>
                                </CardHeader>
                                <CardContent className="h-[180px] flex items-center">
                                    <ResponsiveContainer width="50%" height="100%">
                                        <PieChart>
                                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                                                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="w-[50%] pl-4 space-y-2">
                                        {pieData.map((entry, index) => (
                                            <div key={entry.name} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center">
                                                    <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                                    <span className="font-medium">{entry.name}</span>
                                                </div>
                                                <span className="text-muted-foreground">{entry.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* RAW DATA TABLE */}
                        <Card className="shadow-sm">
                            <CardHeader className="pb-2 border-b">
                                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Recent Activity</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[300px]">
                                    {filteredLogs.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-muted-foreground">No tracking logs found for this account.</div>
                                    ) : (
                                        <div className="divide-y">
                                            {filteredLogs.map((log, i) => (
                                                <div key={i} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                                                    <div className="flex items-center space-x-3">
                                                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full">
                                                            <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center space-x-2">
                                                                <p className="text-sm font-medium">{log.email}</p>
                                                                {log.hasClicked && (
                                                                    <span className="bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center shadow-sm">
                                                                        🖱️ Clicked {log.clickCount || 1}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center text-[10px] text-muted-foreground mt-0.5 space-x-2">
                                                                <span className="bg-muted px-1.5 py-0.5 rounded">{log.ticketId || 'Bulk'}</span>
                                                                
                                                                {/* 🚨 NOW SHOWS BOTH OPEN AND CLICK LOCATIONS */}
                                                                {log.country && <span>👁️ Open: {log.country}</span>}
                                                                {log.clickCountry && <span>🖱️ Click: {log.clickCountry}</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-right text-muted-foreground">
                                                        {format(parseISO(log.openedAt), 'MMM d, h:mm a')}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
};
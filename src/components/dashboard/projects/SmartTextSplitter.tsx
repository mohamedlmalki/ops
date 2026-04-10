// --- FILE: src/components/dashboard/projects/SmartTextSplitter.tsx ---
import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SplitSquareHorizontal, CheckCircle2, AlertCircle, X, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SmartTextSplitterProps {
    fields: Array<{
        api_name: string;
        field_label: string;
        data_type: string;
    }>;
    onSplitValues: (values: Record<string, string>) => void;
    value?: string;
    onChange?: (val: string) => void;
    appendAccountNumber?: boolean; 
    accountName?: string | null;   
    accountIndex?: number;         
}

export const SmartTextSplitter: React.FC<SmartTextSplitterProps> = ({ 
    fields, onSplitValues, value, onChange, appendAccountNumber, accountName, accountIndex 
}) => {
    const [internalText, setInternalText] = useState('');
    const text = value !== undefined ? value : internalText;

    const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });

    const handleTextChange = (newText: string) => {
        if (onChange) onChange(newText);
        else setInternalText(newText);
        if (status.type !== 'idle') setStatus({ type: 'idle', message: '' });
    };

    const multilineFields = useMemo(() => {
        return fields.filter(f => f.data_type === 'multiline');
    }, [fields]);

    const handleSplit = () => {
        if (!text.trim()) {
            setStatus({ type: 'error', message: 'Please enter some text to split.' });
            return;
        }

        if (multilineFields.length === 0) {
            setStatus({ type: 'error', message: 'No multiline custom fields available to split into.' });
            return;
        }

        const maxCharsPerField = 800;
        let remainingText = text;
        const mapping: Record<string, string> = {};

        for (const field of multilineFields) {
            if (remainingText.length === 0) break;

            let cutIndex = remainingText.length;
            if (remainingText.length > maxCharsPerField) {
                cutIndex = remainingText.lastIndexOf('\n', maxCharsPerField);
                if (cutIndex === -1 || cutIndex < maxCharsPerField * 0.5) {
                    cutIndex = remainingText.lastIndexOf(' ', maxCharsPerField);
                }
                if (cutIndex === -1 || cutIndex < maxCharsPerField * 0.5) {
                    cutIndex = maxCharsPerField;
                }
            }

            let chunk = remainingText.substring(0, cutIndex).trim();

            // 🚨 INJECT THE EXACT FORMAT YOU REQUESTED
            if (appendAccountNumber && accountName) {
                const prefix = `${accountName}<br><br>`;
                const suffix = `<br><br><br>account number ${accountIndex || 1}`;
                
                // Prevent double injection if they click split multiple times
                if (!chunk.startsWith(prefix)) {
                    chunk = `${prefix}${chunk}${suffix}`;
                }
            }

            mapping[field.api_name] = chunk;
            remainingText = remainingText.substring(cutIndex).trim();
        }

        onSplitValues(mapping);

        if (remainingText.length > 0) {
            setStatus({ 
                type: 'error', 
                message: `Split completed, but text was too long! Ran out of fields. ${remainingText.length} characters could not be assigned.` 
            });
        } else {
            setStatus({ 
                type: 'success', 
                message: `Successfully split across ${Object.keys(mapping).length} fields!` 
            });
        }
    };

    const handleClear = () => {
        if (onChange) onChange('');
        else setInternalText('');
        setStatus({ type: 'idle', message: '' });
    };

    return (
        <div className="space-y-4 p-4 border rounded-xl bg-slate-50 dark:bg-slate-900/30">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <SplitSquareHorizontal className="h-5 w-5 text-indigo-600" />
                    <Label className="text-base font-semibold text-indigo-900 dark:text-indigo-300">
                        Smart Text Splitter
                    </Label>
                    <Badge variant="outline" className="bg-indigo-100 text-indigo-800 border-indigo-200">
                        {multilineFields.length} Fields Available
                    </Badge>
                </div>
                {text && (
                    <Button variant="ghost" size="sm" onClick={handleClear} className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="h-3 w-3 mr-1" /> Clear
                    </Button>
                )}
            </div>

            <p className="text-xs text-muted-foreground">
                Paste your large text/code here. Then click Split & Fill Fields below!
            </p>

            <Textarea
                placeholder="Paste large block of text..."
                className="min-h-[150px] font-mono text-sm bg-white dark:bg-slate-950 border-indigo-100 dark:border-indigo-900"
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
            />

            <div className="flex items-center justify-between">
                <div className="flex-1 mr-4">
                    {status.type === 'success' && (
                        <Alert className="bg-green-50 text-green-800 border-green-200 py-2">
                            <CheckCircle2 className="h-4 w-4 !text-green-600" />
                            <AlertDescription className="text-xs font-medium ml-2">{status.message}</AlertDescription>
                        </Alert>
                    )}
                    {status.type === 'error' && (
                        <Alert className="bg-red-50 text-red-800 border-red-200 py-2">
                            <AlertCircle className="h-4 w-4 !text-red-600" />
                            <AlertDescription className="text-xs font-medium ml-2">{status.message}</AlertDescription>
                        </Alert>
                    )}
                </div>
                
                <Button 
                    onClick={handleSplit} 
                    disabled={!text.trim() || multilineFields.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shrink-0 transition-all hover:scale-105"
                >
                    <SplitSquareHorizontal className="h-4 w-4 mr-2" />
                    Split & Fill Fields
                </Button>
            </div>
        </div>
    );
};
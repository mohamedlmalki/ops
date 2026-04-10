import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Field {
  api_name: string;
  field_label: string;
  data_type: string;
}

interface SmartTextSplitterProps {
  fields: Field[]; 
  onSplitValues: (updatedFields: Record<string, string>) => void; 
  // 🚨 FIXED: Added these to sync with the main form and "Apply All"
  value?: string;
  onChange?: (val: string) => void;
}

export function SmartTextSplitter({ fields, onSplitValues, value, onChange }: SmartTextSplitterProps) {
  const [internalText, setInternalText] = useState("");
  
  // Use the parent's value if provided, otherwise use internal state
  const bigText = value !== undefined ? value : internalText;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    if (onChange) {
        onChange(newText); // 🚨 Sends text to TaskBulkForm immediately
    } else {
        setInternalText(newText);
    }
  };

  const multilineFields = fields.filter(field => field.data_type === 'multiline');

  const handleSplitText = () => {
    if (multilineFields.length === 0) {
      alert("No multiline fields found!");
      return;
    }

    if (!bigText) return;

    const numFields = multilineFields.length;
    const totalLength = bigText.length;
    const chunkSize = Math.ceil(totalLength / numFields); 

    if (chunkSize > 800) {
        alert(`Error: Too large! Max 800 chars per field. You have ${numFields} fields, so max total is ${numFields * 800} characters.`);
        return;
    }

    const newFieldValues: Record<string, string> = {};

    for (let i = 0; i < numFields; i++) {
      const fieldApiName = multilineFields[i].api_name;
      const startIndex = i * chunkSize;
      const endIndex = startIndex + chunkSize;
      newFieldValues[fieldApiName] = bigText.substring(startIndex, endIndex);
    }

    onSplitValues(newFieldValues);
    alert(`Success! Split across ${numFields} fields.`);
  };

  return (
    <div className="p-4 mb-6 border rounded-lg bg-slate-50 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-800">Smart Text Splitter</h3>
        <p className="text-xs text-slate-500">
          Paste text here to split it equally across <strong>{multilineFields.length}</strong> fields.
        </p>
      </div>

      <Textarea 
        placeholder="Paste your giant block of text here..."
        value={bigText}
        onChange={handleTextChange}
        className="min-h-[120px] bg-white"
      />

      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-500">
          Total Characters: {bigText.length} 
          {bigText.length > 0 && multilineFields.length > 0 && (
            <span className={`ml-2 ${Math.ceil(bigText.length / multilineFields.length) > 800 ? 'text-red-600' : 'text-blue-600'}`}>
              (~{Math.ceil(bigText.length / multilineFields.length)} per field)
            </span>
          )}
        </div>
        <Button 
          type="button" 
          onClick={handleSplitText}
          disabled={multilineFields.length === 0 || bigText.length === 0}
        >
          Split & Fill Fields
        </Button>
      </div>
    </div>
  );
}
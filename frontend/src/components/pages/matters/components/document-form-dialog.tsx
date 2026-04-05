'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ApiClientError } from '@/lib/api-client';
import {
  linkDocument,
  type BackendDocument,
  type BackendDocumentType,
} from '@/lib/api/documents';
import { DocumentType } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DocumentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matterId: string;
  onSave: (doc: BackendDocument) => void;
}

interface FormErrors {
  name?: string;
  driveFileId?: string;
  driveUrl?: string;
}

function validateForm(data: { name: string; driveFileId: string; driveUrl: string }): FormErrors {
  const errors: FormErrors = {};
  if (!data.name.trim()) {
    errors.name = 'Document name is required';
  }
  if (!data.driveFileId.trim()) {
    errors.driveFileId = 'Drive file id is required';
  }
  if (!data.driveUrl.trim()) {
    errors.driveUrl = 'Drive URL is required';
  } else {
    try {
      new URL(data.driveUrl.trim());
    } catch {
      errors.driveUrl = 'Please enter a valid URL';
    }
  }
  return errors;
}

export function DocumentFormDialog({
  open,
  onOpenChange,
  matterId,
  onSave,
}: DocumentFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [name, setName] = useState('');
  const [driveFileId, setDriveFileId] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [documentType, setDocumentType] = useState<string>(DocumentType.OTHER);
  const [label, setLabel] = useState('');

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setName('');
      setDriveFileId('');
      setDriveUrl('');
      setDocumentType(DocumentType.OTHER);
      setLabel('');
      setErrors({});
    }
    onOpenChange(newOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateForm({ name, driveFileId, driveUrl });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    try {
      const savedDoc = await linkDocument(matterId, {
        name: name.trim(),
        drive_file_id: driveFileId.trim(),
        drive_url: driveUrl.trim(),
        doc_type: documentType as BackendDocumentType,
        label: label.trim() || undefined,
      });

      onSave(savedDoc);
      toast.success('Document linked successfully');
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.detail : 'Unable to link document.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const docTypeOptions = [
    { value: DocumentType.ENGAGEMENT_LETTER, label: 'Engagement Letter' },
    { value: DocumentType.MEMO, label: 'Memo' },
    { value: DocumentType.CONTRACT, label: 'Contract' },
    { value: DocumentType.FILING, label: 'Filing' },
    { value: DocumentType.CORRESPONDENCE, label: 'Correspondence' },
    { value: DocumentType.REPORT, label: 'Report' },
    { value: DocumentType.OTHER, label: 'Other' },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Link Document</DialogTitle>
          <DialogDescription>
            Link an existing document from Google Drive to this matter.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Document Name */}
          <div className="space-y-2">
            <Label htmlFor="doc-name">
              Document Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="doc-name"
              placeholder="e.g. Writ of Summons"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors({});
              }}
              className={cn(
                'h-10',
                errors.name && 'border-red-300 focus-visible:ring-red-300'
              )}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          {/* Drive File ID */}
          <div className="space-y-2">
            <Label htmlFor="drive-file-id">
              Google Drive File ID <span className="text-red-500">*</span>
            </Label>
            <Input
              id="drive-file-id"
              placeholder="e.g. 1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
              value={driveFileId}
              onChange={(e) => {
                setDriveFileId(e.target.value);
                if (errors.driveFileId) setErrors((current) => ({ ...current, driveFileId: undefined }));
              }}
              className={cn(
                'h-10 font-mono',
                errors.driveFileId && 'border-red-300 focus-visible:ring-red-300'
              )}
            />
            {errors.driveFileId && (
              <p className="text-sm text-red-500">{errors.driveFileId}</p>
            )}
          </div>

          {/* Drive URL */}
          <div className="space-y-2">
            <Label htmlFor="drive-url">
              Drive URL <span className="text-red-500">*</span>
            </Label>
            <Input
              id="drive-url"
              placeholder="https://drive.google.com/file/d/..."
              value={driveUrl}
              onChange={(e) => {
                setDriveUrl(e.target.value);
                if (errors.driveUrl) setErrors({});
              }}
              className={cn(
                'h-10',
                errors.driveUrl && 'border-red-300 focus-visible:ring-red-300'
              )}
            />
            {errors.driveUrl && (
              <p className="text-sm text-red-500">{errors.driveUrl}</p>
            )}
          </div>

          {/* Document Type & Label row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {docTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-label">Label</Label>
              <Input
                id="doc-label"
                placeholder="Optional label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          {/* Actions */}
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                'Link Document'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

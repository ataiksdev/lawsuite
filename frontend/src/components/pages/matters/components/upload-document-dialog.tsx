// frontend/src/components/pages/matters/components/upload-document-dialog.tsx
'use client';

import React, { useCallback, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadDocumentToDrive, type BackendDocument, type BackendDocumentType } from '@/lib/api/documents';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

const DOCUMENT_TYPE_OPTIONS: { value: BackendDocumentType; label: string }[] = [
  { value: 'engagement_letter', label: 'Engagement Letter' },
  { value: 'memo',              label: 'Memo' },
  { value: 'contract',          label: 'Contract' },
  { value: 'filing',            label: 'Filing' },
  { value: 'correspondence',    label: 'Correspondence' },
  { value: 'report',            label: 'Report' },
  { value: 'other',             label: 'Other' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(type: string): string {
  if (type.includes('pdf')) return '📄';
  if (type.includes('word') || type.includes('document')) return '📝';
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return '📊';
  if (type.includes('presentation') || type.includes('powerpoint')) return '📑';
  if (type.includes('image')) return '🖼️';
  return '📎';
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matterId: string;
  onUploaded: (document: BackendDocument) => void;
}

export function UploadDocumentDialog({ open, onOpenChange, matterId, onUploaded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [docType, setDocType] = useState<BackendDocumentType>('other');
  const [label, setLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedDoc, setUploadedDoc] = useState<BackendDocument | null>(null);
  const [serverError, setServerError] = useState('');

  const reset = () => {
    setSelectedFile(null);
    setFileError('');
    setDocumentName('');
    setDocType('other');
    setLabel('');
    setProgress(0);
    setUploadedDoc(null);
    setServerError('');
    setUploading(false);
  };

  const handleClose = (open: boolean) => {
    if (!uploading) {
      if (!open) reset();
      onOpenChange(open);
    }
  };

  const validateAndSet = (file: File) => {
    setFileError('');
    if (file.size > MAX_SIZE_BYTES) {
      setFileError(`File is too large (${formatBytes(file.size)}). Maximum is ${MAX_SIZE_MB} MB.`);
      return;
    }
    if (!ACCEPTED_MIME_TYPES.includes(file.type) && file.type !== '') {
      // Allow unknown MIME types with a warning rather than hard reject
    }
    setSelectedFile(file);
    if (!documentName) setDocumentName(file.name.replace(/\.[^.]+$/, ''));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) validateAndSet(f);
    e.target.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) validateAndSet(f);
  }, [documentName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setServerError('');
    setUploading(true);
    setProgress(0);

    try {
      const doc = await uploadDocumentToDrive(matterId, selectedFile, {
        docType,
        label: label.trim() || undefined,
        documentName: documentName.trim() || selectedFile.name,
        onProgress: setProgress,
      });
      setUploadedDoc(doc);
      onUploaded(doc);
      setUploading(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setUploading(false);
      setProgress(0);
    }
  };

  // ── Success state ─────────────────────────────────────────────────────────

  if (uploadedDoc) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[480px]">
          <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">Upload complete!</p>
              <p className="text-sm text-slate-500 mt-1">
                <span className="font-medium break-words break-all">{uploadedDoc.name}</span> has been uploaded to Drive and linked to this matter.
              </p>
            </div>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleClose(false)}
            >
              Done
            </Button>
            <button
              type="button"
              className="text-sm text-slate-400 hover:text-slate-600"
              onClick={reset}
            >
              Upload another file
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Upload Document to Drive</DialogTitle>
          <DialogDescription>
            Upload a file from your device. It will be saved to this matter&apos;s Google Drive folder and linked automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              'relative rounded-xl border-2 border-dashed transition-colors cursor-pointer',
              dragging
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                : selectedFile
                  ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/10'
                  : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-900/50',
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              onChange={handleFileInput}
              accept={ACCEPTED_MIME_TYPES.join(',')}
            />

            {selectedFile ? (
              /* File selected — show info */
              <div className="flex items-center gap-3 p-4">
                <span className="text-3xl">{fileIcon(selectedFile.type)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 break-words break-all">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 break-words break-all">
                    {formatBytes(selectedFile.size)} · {selectedFile.type || 'Unknown type'}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-slate-400 hover:text-red-500 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setDocumentName(''); }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-6">
                <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Drop a file here, or{' '}
                    <span className="text-emerald-600 dark:text-emerald-400">browse</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    PDF, Word, Excel, images and more · Max {MAX_SIZE_MB} MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {fileError && (
            <p className="text-sm text-red-600 dark:text-red-400">{fileError}</p>
          )}

          {/* Upload progress */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Uploading to Drive…
                </span>
                <span className="tabular-nums font-medium">{progress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {serverError && !uploading && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 px-4 py-3">
              <p className="text-sm text-red-700 dark:text-red-400">{serverError}</p>
            </div>
          )}

          {/* Document metadata */}
          {selectedFile && !uploading && (
            <>
              <div className="space-y-2">
                <Label htmlFor="upload-doc-name">Document Name</Label>
                <Input
                  id="upload-doc-name"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder={selectedFile.name}
                  className="h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <Select value={docType} onValueChange={(v) => setDocType(v as BackendDocumentType)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upload-label">
                    Label <span className="text-slate-400 font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="upload-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. unsigned draft"
                    className="h-9"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button
            disabled={!selectedFile || uploading || !!fileError}
            onClick={() => void handleUpload()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[120px]"
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{progress > 0 ? `${progress}%` : 'Uploading…'}</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" />Upload to Drive</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UploadDocumentDialog;

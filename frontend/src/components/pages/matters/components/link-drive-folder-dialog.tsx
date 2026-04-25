// frontend/src/components/pages/matters/components/link-drive-folder-dialog.tsx
'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { linkDriveFolder, syncDriveFolder, type DriveFolderInfo } from '@/lib/api/matters';
import { handleApiError } from '@/lib/error-utils';
import { ApiClientError } from '@/lib/api-client';

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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate that a string looks like a Drive folder URL or bare ID.
 * We are lenient here — the backend does the final extraction + verification.
 */
function looksLikeDriveFolder(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  // Bare ID: 10+ alphanumeric / hyphen / underscore chars with no spaces
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return true;
  // URL containing /folders/ or drive.google.com
  if (s.includes('drive.google.com')) return true;
  return false;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matterId: string;
  /** Currently linked folder (if any) — passed so the dialog shows the existing state */
  existingFolderId?: string | null;
  existingFolderUrl?: string | null;
  onLinked: (info: DriveFolderInfo) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LinkDriveFolderDialog({
  open,
  onOpenChange,
  matterId,
  existingFolderId,
  existingFolderUrl,
  onLinked,
}: Props) {
  const [input, setInput] = useState('');
  const [importExisting, setImportExisting] = useState(true);
  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<DriveFolderInfo | null>(null);
  const [error, setError] = useState('');

  const reset = () => {
    setInput('');
    setImportExisting(true);
    setResult(null);
    setError('');
    setLinking(false);
    setSyncing(false);
  };

  const handleClose = (v: boolean) => {
    if (!linking && !syncing) {
      if (!v) reset();
      onOpenChange(v);
    }
  };

  const handleLink = async () => {
    setError('');
    if (!looksLikeDriveFolder(input)) {
      setError('Please enter a valid Google Drive folder URL or folder ID.');
      return;
    }

    setLinking(true);
    try {
      const info = await linkDriveFolder(matterId, {
        folder_url: input.trim(),
        import_existing: importExisting,
      });
      setResult(info);
      onLinked(info);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.detail
          : 'Could not link the Drive folder. Check the URL and try again.';
      setError(msg);
    } finally {
      setLinking(false);
    }
  };

  const handleSync = async () => {
    setError('');
    setSyncing(true);
    try {
      const syncResult = await syncDriveFolder(matterId);
      // Build a minimal DriveFolderInfo from the sync result
      const partial: DriveFolderInfo = {
        folder_id: existingFolderId ?? '',
        folder_name: '',
        folder_url: existingFolderUrl ?? '',
        file_count: syncResult.file_count,
        imported_count: syncResult.imported_count,
      };
      setResult(partial);
      onLinked(partial);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.detail
          : 'Could not sync the Drive folder. Try again.';
      setError(msg);
    } finally {
      setSyncing(false);
    }
  };

  const hasExisting = !!existingFolderId;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {hasExisting ? 'Linked Drive Folder' : 'Link Google Drive Folder'}
          </DialogTitle>
          <DialogDescription>
            {hasExisting
              ? 'This matter already has a Drive folder linked. You can sync to import new files, or link a different folder.'
              : 'Paste a Google Drive folder URL or ID. All files inside will be automatically imported as documents.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Existing folder status ── */}
          {hasExisting && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 p-4">
              <div className="flex items-start gap-3">
                <FolderOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                    Folder linked
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5 font-mono break-all">
                    {existingFolderId}
                  </p>
                </div>
                {existingFolderUrl && (
                  <a
                    href={existingFolderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-emerald-600 hover:text-emerald-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300"
                disabled={syncing}
                onClick={() => void handleSync()}
              >
                {syncing ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Syncing…</>
                ) : (
                  <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sync New Files</>
                )}
              </Button>
            </div>
          )}

          {/* ── Link result banner ── */}
          {result && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {result.imported_count > 0
                    ? `${result.imported_count} file${result.imported_count !== 1 ? 's' : ''} imported`
                    : 'No new files to import'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Files in folder', value: result.file_count },
                  { label: 'Newly imported', value: result.imported_count },
                  { label: 'Already linked', value: Math.max(0, result.file_count - result.imported_count) },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-md border border-slate-200 dark:border-slate-700 py-2 px-1">
                    <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Input form ── */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="folder-input">
                {hasExisting ? 'Link a different folder' : 'Drive Folder URL or ID'}
              </Label>
              <Input
                id="folder-input"
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(''); }}
                placeholder="https://drive.google.com/drive/folders/... or folder ID"
                className={cn('h-10 font-mono text-xs', error && 'border-red-400 focus-visible:ring-red-400')}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleLink(); }}
              />
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              <p className="text-xs text-slate-500">
                The folder must be shared with the Google account connected to this workspace.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Import existing files
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically create document records for files already in the folder
                </p>
              </div>
              <Switch
                checked={importExisting}
                onCheckedChange={setImportExisting}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={linking || syncing}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button
            disabled={!input.trim() || linking}
            onClick={() => void handleLink()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[120px]"
          >
            {linking ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Linking…</>
            ) : (
              <><FolderOpen className="h-4 w-4 mr-2" />{hasExisting ? 'Re-link Folder' : 'Link Folder'}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LinkDriveFolderDialog;

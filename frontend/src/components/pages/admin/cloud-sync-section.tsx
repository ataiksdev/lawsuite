// ============================================================================
// Lawmate - Cloud Sync Section (desktop app only)
// Connect the local desktop install to a cloud org, then push/pull changes
// on demand (or automatically on login — see desktop/src/main.ts). Only
// ever rendered inside the desktop shell; window.desktopSync (implemented
// in the Electron preload script) does the actual work.
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { CloudCog, Loader2, RefreshCw, Unplug, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getDesktopSyncBridge, isDesktopBuild, type SyncConflict, type SyncStatus } from '@/lib/desktop-sync';

export function CloudSyncSection() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [cloudUrl, setCloudUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflict[] | null>(null);

  const bridge = getDesktopSyncBridge();

  useEffect(() => {
    if (!bridge) {
      setIsLoadingStatus(false);
      return;
    }
    void bridge.getStatus().then((s) => {
      setStatus(s);
      setIsLoadingStatus(false);
    });
  }, [bridge]);

  if (!isDesktopBuild()) return null;

  if (!bridge) {
    // Desktop build, but the preload bridge somehow isn't present (e.g.
    // running the frontend standalone during development) — say so
    // rather than silently showing a broken form.
    return (
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CloudCog className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-base font-semibold">Cloud Sync</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Sync isn&apos;t available in this context.</p>
        </CardContent>
      </Card>
    );
  }

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloudUrl.trim() || !email.trim() || !password) {
      toast.error('Fill in the cloud URL, email, and password.');
      return;
    }
    setIsConnecting(true);
    try {
      const result = await bridge.connect(cloudUrl.trim(), email.trim(), password);
      if (!result.success) {
        toast.error(result.error || 'Could not connect to the cloud account.');
        return;
      }
      setPassword('');
      const s = await bridge.getStatus();
      setStatus(s);
      toast.success('Connected to cloud.');
    } catch {
      toast.error('Could not connect to the cloud account.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await bridge.disconnect();
    setStatus(await bridge.getStatus());
    toast.success('Disconnected from cloud.');
  };

  const runSync = async (forceThroughConflicts: boolean) => {
    setIsSyncing(true);
    try {
      const result = await bridge.syncNow({ forceThroughConflicts });
      if (result.status === 'no_changes') {
        toast.info('Already up to date.');
      } else if (result.status === 'synced') {
        toast.success(`Synced — ${result.pushed} pushed, ${result.pulled} pulled.`);
        setConflicts(null);
      } else if (result.status === 'conflicts') {
        setConflicts(result.conflicts);
      } else {
        toast.error(result.message || 'Sync failed.');
      }
      setStatus(await bridge.getStatus());
    } catch {
      toast.error('Sync failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CloudCog className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-base font-semibold">Cloud Sync</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Keep this desktop install and your hosted Lawmate account in sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingStatus ? (
            <div className="flex items-center gap-3 py-6">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <span className="text-sm text-slate-500">Checking connection...</span>
            </div>
          ) : status?.connected ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-slate-500">Connected to</span>
                <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{status.cloudUrl}</span>
                <span className="text-slate-500 mt-2">
                  Last synced:{' '}
                  {status.lastSyncedAt
                    ? new Date(status.lastSyncedAt).toLocaleString('en-NG')
                    : 'never'}
                </span>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => runSync(false)} disabled={isSyncing}>
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sync Now
                </Button>
                <Button variant="outline" onClick={handleDisconnect} disabled={isSyncing}>
                  <Unplug className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleConnect} className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="cloud-url">Cloud URL</Label>
                <Input
                  id="cloud-url"
                  value={cloudUrl}
                  onChange={(e) => setCloudUrl(e.target.value)}
                  placeholder="https://app.lawmate.ng"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cloud-email">Email</Label>
                <Input
                  id="cloud-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourfirm.ng"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cloud-password">Password</Label>
                <Input
                  id="cloud-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={isConnecting}>
                {isConnecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Connect to Cloud
              </Button>
              <p className="text-xs text-slate-400">
                One-time step — your login is stored securely on this device so future syncs don&apos;t ask again.
              </p>
            </form>
          )}
        </CardContent>
      </Card>

      <Dialog open={conflicts !== null} onOpenChange={(open) => !open && setConflicts(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <DialogTitle>{conflicts?.length} record{conflicts?.length === 1 ? '' : 's'} changed in both places</DialogTitle>
            </div>
            <DialogDescription>
              These records were edited on both desktop and cloud since the last sync. Nothing has
              been written yet — you can abort and resolve them yourself, or continue and keep
              whichever side&apos;s edit is newer.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-2 py-2">
            {conflicts?.map((c) => (
              <div key={`${c.table}-${c.id}`} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                <p className="font-medium text-slate-900 dark:text-slate-100">{c.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{c.table}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflicts(null)} disabled={isSyncing}>
              Abort
            </Button>
            <Button onClick={() => runSync(true)} disabled={isSyncing}>
              {isSyncing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Continue Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CloudSyncSection;

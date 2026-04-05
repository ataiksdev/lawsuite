'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Unplug,
  RefreshCw,
  FolderSync,
  FileText,
  Mail,
  ExternalLink,
  Shield,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { ApiClientError } from '@/lib/api-client';
import { UserRole } from '@/lib/types';
import { mockIntegrations } from '@/lib/mock-data';
import {
  disconnectGoogleWorkspace,
  getGoogleAuthorizationUrl,
  getGoogleIntegrationStatus,
  type GoogleIntegrationStatus,
} from '@/lib/api/integrations';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

function FeatureCard({
  icon: Icon,
  title,
  description,
  isActive,
  stat,
  statLabel,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  isActive: boolean;
  stat: string;
  statLabel: string;
}) {
  return (
    <Card
      className={cn(
        'border-slate-200/80 dark:border-slate-700/80',
        isActive && 'border-emerald-200 dark:border-emerald-900/40'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              isActive ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-slate-50 dark:bg-slate-800'
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5',
                isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
              <Badge
                variant="outline"
                className={cn(
                  'px-1.5 py-0 text-[10px]',
                  isActive
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                )}
              >
                {isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
            <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              {stat} <span className="font-normal text-slate-400">{statLabel}</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function IntegrationsPage() {
  const { user } = useAuthStore();
  const [status, setStatus] = useState<GoogleIntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const loadStatus = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await getGoogleIntegrationStatus();
      setStatus(response);
      return response;
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.detail
          : 'Unable to load Google Workspace integration status.';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  if (user?.role !== UserRole.ADMIN) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="mb-4 h-12 w-12 text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Access Denied</h2>
        <p className="mt-1 text-sm text-slate-500">
          Only administrators can manage integrations.
        </p>
      </div>
    );
  }

  const handleRefresh = async () => {
    const refreshedStatus = await loadStatus('refresh');
    if (refreshedStatus?.connected) {
      toast.success('Integration status refreshed.');
    } else {
      toast.info('Google Workspace is not connected yet.');
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const response = await getGoogleAuthorizationUrl();
      window.location.href = response.authorization_url;
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.detail
          : 'Unable to start the Google Workspace connection flow.';
      toast.error(message);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const response = await disconnectGoogleWorkspace();
      await loadStatus();
      toast.success(response.message);
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.detail
          : 'Unable to disconnect Google Workspace right now.';
      toast.error(message);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = status?.connected ?? false;
  const googleScopes = status?.scopes ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Integrations
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Connect third-party services to enhance your workflow.
        </p>
      </div>

      {isLoading ? (
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardContent className="flex items-center gap-3 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Loading integration status...
            </span>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-slate-200/80 dark:border-slate-700/80">
          <CardContent className="space-y-4 py-8">
            <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
            <Button variant="outline" onClick={() => void loadStatus()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card
            className={cn(
              'border-slate-200/80 dark:border-slate-700/80',
              isConnected && 'border-emerald-200 dark:border-emerald-900/40'
            )}
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-xl',
                      isConnected ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-slate-50 dark:bg-slate-800'
                    )}
                  >
                    {isConnected ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Unplug className="h-6 w-6 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-lg">Google Workspace</CardTitle>
                    <CardDescription className="mt-0.5">
                      {isConnected ? 'Connected and ready for live usage' : 'Not connected'}
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  className={cn(
                    'text-xs font-semibold',
                    isConnected
                      ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                      : 'border-slate-200 bg-slate-100 text-slate-500'
                  )}
                >
                  {isConnected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
            </CardHeader>

            {isConnected ? (
              <CardContent className="pt-0">
                <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="mb-1 text-xs text-slate-500">Access Token</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Stored for this organisation
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="mb-1 text-xs text-slate-500">Token Expires</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {formatDateTime(status?.token_expiry ?? null)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="mb-1 text-xs text-slate-500">Drive Webhook</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {status?.webhook_active
                        ? `Active until ${formatDateTime(status.webhook_expires_at)}`
                        : 'Inactive'}
                    </p>
                  </div>
                </div>

                <div className="mb-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-900">
                  <p className="mb-2 text-xs font-medium text-slate-500">Scopes Granted</p>
                  <div className="flex flex-wrap gap-2">
                    {googleScopes.length ? (
                      googleScopes.map((scope) => (
                        <Badge key={scope} variant="outline" className="text-xs font-normal">
                          {scope}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">
                        No scopes were returned by the backend for this organisation.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={() => void handleRefresh()}
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Refreshing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh Status
                      </>
                    )}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        disabled={isDisconnecting}
                      >
                        <Unplug className="mr-2 h-4 w-4" />
                        Disconnect
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect Google Workspace?</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                          <p>This will stop Drive, Docs, Gmail, and webhook access for this organisation.</p>
                          <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>Previously synced data stays in LegalOps, but it will no longer update automatically.</span>
                          </p>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={() => void handleDisconnect()}
                        >
                          {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            ) : (
              <CardContent className="pt-0">
                <div className="rounded-lg border border-dashed border-slate-300 p-6 dark:border-slate-700">
                  <div className="mx-auto max-w-md text-center">
                    <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Connect Google Workspace
                    </h3>
                    <p className="mb-4 text-xs text-slate-500">
                      LegalOps will request access to your Google Workspace so matters can use Drive, Docs, and Gmail features.
                    </p>
                    <div className="mb-6 space-y-2 text-left">
                      {[
                        'Auto-create matter folders in Google Drive',
                        'Generate document templates from Google Docs',
                        'Link emails from Gmail to matters',
                        'Set up Drive webhooks for real-time file monitoring',
                      ].map((feature) => (
                        <div key={feature} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{feature}</span>
                        </div>
                      ))}
                    </div>
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => void handleConnect()}
                      disabled={isConnecting}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {isConnecting ? 'Redirecting...' : 'Connect Google Workspace'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {isConnected && (
            <div>
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                Integration Features
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FeatureCard
                  icon={FolderSync}
                  title="Google Drive"
                  description="Automatically create matter folders and sync documents."
                  isActive={isConnected}
                  stat={status?.webhook_active ? 'Live' : 'Manual'}
                  statLabel="sync mode"
                />
                <FeatureCard
                  icon={FileText}
                  title="Google Docs"
                  description="Use document templates and generate legal documents."
                  isActive={isConnected}
                  stat={googleScopes.some((scope) => scope.includes('documents')) ? 'Enabled' : 'Unavailable'}
                  statLabel="document access"
                />
                <FeatureCard
                  icon={Mail}
                  title="Gmail"
                  description="Link client emails to matters automatically."
                  isActive={isConnected}
                  stat={googleScopes.some((scope) => scope.includes('gmail')) ? 'Enabled' : 'Unavailable'}
                  statLabel="mail access"
                />
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
              Other Integrations
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mockIntegrations
                .filter((integration) => integration.slug !== 'google-workspace')
                .map((integration) => (
                  <Card key={integration.id} className="border-slate-200/80 dark:border-slate-700/80">
                    <CardContent className="p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {integration.name}
                        </h4>
                        <Badge
                          variant="outline"
                          className="border-slate-200 bg-slate-50 px-1.5 py-0 text-[10px] text-slate-500"
                        >
                          Roadmap
                        </Badge>
                      </div>
                      <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {integration.description}
                      </p>
                      <Button variant="outline" size="sm" className="h-8 text-xs" disabled>
                        Coming Soon
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default IntegrationsPage;

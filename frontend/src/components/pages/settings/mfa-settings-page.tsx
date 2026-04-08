// ============================================================================
// LegalOps - MFA Settings Page
// Enable/disable TOTP-based two-factor authentication
// ============================================================================

'use client';

import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Shield,
  QrCode,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Key,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import apiClient, { ApiClientError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

// ============================================================================
// API helpers (no dedicated module yet — inlined here)
// ============================================================================

interface MfaStatus {
  mfa_enabled: boolean;
  backup_codes_remaining: number;
}

interface MfaSetupResponse {
  otpauth_uri: string;
  qr_code_svg: string;
  secret: string;
}

interface MfaVerifyResponse {
  message: string;
  backup_codes: string[];
  warning: string;
}

async function getMfaStatus() {
  return apiClient.get<MfaStatus>('/auth/mfa/status');
}

async function setupMfa() {
  return apiClient.post<MfaSetupResponse>('/auth/mfa/setup');
}

async function verifyMfa(code: string) {
  return apiClient.post<MfaVerifyResponse>('/auth/mfa/verify', { code });
}

async function disableMfa(code: string) {
  return apiClient.post<void>('/auth/mfa/disable', { code });
}

async function regenerateBackupCodes(code: string) {
  return apiClient.post<{ backup_codes: string[]; warning: string }>(
    '/auth/mfa/backup-codes/regenerate',
    { code }
  );
}

// ============================================================================
// Backup codes display
// ============================================================================

function BackupCodesDisplay({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codes.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Backup codes copied to clipboard');
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
        <div className="flex items-start gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>Save these codes now.</strong> Each code can only be used once.
            Store them somewhere safe — they won&apos;t be shown again.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {codes.map((code, i) => (
            <div
              key={i}
              className="rounded bg-white px-3 py-2 font-mono text-sm text-slate-800 border border-amber-200 dark:bg-slate-900 dark:text-slate-200 dark:border-amber-800"
            >
              {code}
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
          {copied ? 'Copied!' : 'Copy all codes'}
        </Button>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onDone}>
          I&apos;ve saved my codes
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Setup flow
// ============================================================================

function MfaSetupFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<'qr' | 'verify' | 'codes'>('qr');
  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const data = await setupMfa();
        setSetupData(data);
      } catch (err) {
        const msg = err instanceof ApiClientError ? err.detail : 'Could not start MFA setup.';
        toast.error(msg);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setIsLoading(true);
    setError('');
    try {
      const result = await verifyMfa(verifyCode.trim());
      setBackupCodes(result.backup_codes);
      setStep('codes');
      toast.success('MFA enabled successfully!');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.detail : 'Invalid code. Please try again.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !setupData) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        <span className="text-sm text-slate-500">Loading setup...</span>
      </div>
    );
  }

  if (step === 'codes') {
    return <BackupCodesDisplay codes={backupCodes} onDone={onComplete} />;
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Scan QR */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">1</div>
          <p className="text-sm font-medium">Scan this QR code in your authenticator app</p>
        </div>
        <div className="flex gap-6 items-start">
          {setupData?.qr_code_svg && (
            <div
              className="h-40 w-40 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-2"
              dangerouslySetInnerHTML={{ __html: setupData.qr_code_svg }}
            />
          )}
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Works with Google Authenticator, Authy, 1Password, and any TOTP app.</p>
            <p className="text-xs text-slate-500">Can&apos;t scan? Enter this secret manually:</p>
            <div className="flex items-center gap-2">
              <code className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 break-all">
                {setupData?.secret}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(setupData?.secret ?? '');
                  setSecretCopied(true);
                  setTimeout(() => setSecretCopied(false), 2000);
                }}
                className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {secretCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Step 2: Verify */}
      <form onSubmit={handleVerify} className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">2</div>
          <p className="text-sm font-medium">Enter the 6-digit code to confirm</p>
        </div>
        <div className="space-y-2">
          <Input
            type="text"
            inputMode="numeric"
            placeholder="000000"
            value={verifyCode}
            onChange={(e) => {
              setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              if (error) setError('');
            }}
            className="h-12 text-center text-2xl tracking-widest font-mono max-w-[180px]"
            autoComplete="one-time-code"
            autoFocus
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <Button
          type="submit"
          disabled={isLoading || verifyCode.length < 6}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
          Enable Two-Factor Authentication
        </Button>
      </form>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function MfaSettingsPage() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [regenCode, setRegenCode] = useState('');
  const [regening, setRegening] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const data = await getMfaStatus();
      setStatus(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadStatus(); }, []);

  const handleDisable = async () => {
    if (!disableCode.trim()) return;
    setDisabling(true);
    try {
      await disableMfa(disableCode.trim());
      toast.success('Two-factor authentication disabled.');
      setDisableCode('');
      await loadStatus();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.detail : 'Could not disable MFA.';
      toast.error(msg);
    } finally {
      setDisabling(false);
    }
  };

  const handleRegen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regenCode.trim()) return;
    setRegening(true);
    try {
      const result = await regenerateBackupCodes(regenCode.trim());
      setNewBackupCodes(result.backup_codes);
      setRegenCode('');
      toast.success('Backup codes regenerated.');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.detail : 'Could not regenerate codes.';
      toast.error(msg);
    } finally {
      setRegening(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-10">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        <span className="text-sm text-slate-500">Loading MFA status...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">Two-Factor Authentication</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Add an extra layer of security to your account using a TOTP authenticator app.
        </p>
      </div>

      {/* Status card */}
      <Card className="border-slate-200/80 dark:border-slate-700/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {status?.mfa_enabled
                ? <ShieldCheck className="h-5 w-5 text-emerald-600" />
                : <Shield className="h-5 w-5 text-slate-400" />
              }
              <CardTitle className="text-base">
                {status?.mfa_enabled ? 'Two-factor authentication is enabled' : 'Two-factor authentication is disabled'}
              </CardTitle>
            </div>
            <Badge
              className={cn(
                'text-xs font-semibold',
                status?.mfa_enabled
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              )}
            >
              {status?.mfa_enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          {status?.mfa_enabled && (
            <CardDescription className="text-xs mt-1">
              {status.backup_codes_remaining} backup {status.backup_codes_remaining === 1 ? 'code' : 'codes'} remaining
            </CardDescription>
          )}
        </CardHeader>

        <CardContent>
          {!status?.mfa_enabled ? (
            showSetup ? (
              <MfaSetupFlow onComplete={() => { setShowSetup(false); void loadStatus(); }} />
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Protect your account with a time-based one-time password (TOTP).
                  Works with Google Authenticator, Authy, 1Password, and more.
                </p>
                <Button
                  onClick={() => setShowSetup(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  Set Up Two-Factor Authentication
                </Button>
              </div>
            )
          ) : (
            <div className="space-y-6">
              {/* Disable MFA */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">
                    Disable Two-Factor Authentication
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disable Two-Factor Authentication?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the extra security layer from your account.
                      Enter your current 6-digit code to confirm.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-2">
                    <Label htmlFor="disable-code">Verification Code</Label>
                    <Input
                      id="disable-code"
                      type="text"
                      inputMode="numeric"
                      placeholder="000000"
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      className="mt-2 h-12 text-center text-xl tracking-widest font-mono"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDisableCode('')}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => void handleDisable()}
                      disabled={disabling || disableCode.length < 6}
                    >
                      {disabling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disable MFA'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Regenerate backup codes */}
              {newBackupCodes.length > 0 ? (
                <div>
                  <p className="text-sm font-medium mb-3">New backup codes generated:</p>
                  <BackupCodesDisplay codes={newBackupCodes} onDone={() => setNewBackupCodes([])} />
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-slate-500" />
                    <p className="text-sm font-medium">Regenerate Backup Codes</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Generate a new set of backup codes. Your old codes will be invalidated immediately.
                  </p>
                  <form onSubmit={handleRegen} className="flex items-end gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="regen-code" className="text-xs">Current TOTP code</Label>
                      <Input
                        id="regen-code"
                        type="text"
                        inputMode="numeric"
                        placeholder="000000"
                        value={regenCode}
                        onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="h-10 w-36 text-center font-mono tracking-widest"
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={regening || regenCode.length < 6}
                    >
                      {regening
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <RefreshCw className="h-4 w-4 mr-2" />
                      }
                      Regenerate
                    </Button>
                  </form>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default MfaSettingsPage;

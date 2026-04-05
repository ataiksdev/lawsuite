'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { navigate, useCurrentRoute, useRouteParams } from '@/lib/router';
import { ApiClientError } from '@/lib/api-client';
import {
  createClient,
  getClient,
  updateClient,
  type BackendClient,
  type ClientUpsertPayload,
} from '@/lib/api/clients';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FormErrors {
  name?: string;
  email?: string;
}

interface ClientFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

function validateForm(data: ClientUpsertPayload): FormErrors {
  const errors: FormErrors = {};

  if (!data.name.trim()) {
    errors.name = 'Client name is required';
  } else if (data.name.trim().length < 2) {
    errors.name = 'Client name must be at least 2 characters';
  }

  if (data.email && data.email.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }
  }

  return errors;
}

function mapClientToFormData(client?: BackendClient | null): ClientFormData {
  return {
    name: client?.name ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    address: client?.address ?? '',
    notes: client?.notes ?? '',
  };
}

export function ClientFormPage() {
  const route = useCurrentRoute();
  const params = useRouteParams();
  const isEditMode = route.includes('/edit');
  const clientId = params.id;

  const [existingClient, setExistingClient] = useState<BackendClient | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(isEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState<ClientFormData>(() => mapClientToFormData());

  useEffect(() => {
    if (!isEditMode || !clientId) {
      setExistingClient(null);
      setFormData(mapClientToFormData());
      setIsBootstrapping(false);
      return;
    }

    let cancelled = false;

    async function loadClient() {
      setIsBootstrapping(true);
      setLoadError(null);
      try {
        const client = await getClient(clientId);
        if (!cancelled) {
          setExistingClient(client);
          setFormData(mapClientToFormData(client));
          setIsDirty(false);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof ApiClientError ? err.detail : 'Unable to load this client.';
          setLoadError(message);
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    }

    loadClient();

    return () => {
      cancelled = true;
    };
  }, [clientId, isEditMode]);

  const pageTitle = isEditMode ? 'Edit Client' : 'New Client';
  const pageDescription = useMemo(() => {
    if (isEditMode) {
      return existingClient
        ? `Update information for ${existingClient.name}`
        : 'Update client information';
    }
    return 'Add a new client to your practice';
  }, [existingClient, isEditMode]);

  const updateField = (field: keyof ClientFormData, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setIsDirty(true);

    if (errors[field as keyof FormErrors]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const handleCancel = () => {
    if (isEditMode && clientId) {
      navigate(`/clients/${clientId}`);
      return;
    }
    navigate('/clients');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload: ClientUpsertPayload = {
      name: formData.name.trim(),
      email: formData.email.trim() || undefined,
      phone: formData.phone.trim() || undefined,
      address: formData.address.trim() || undefined,
      notes: formData.notes.trim() || undefined,
    };

    const validationErrors = validateForm(payload);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSaving(true);
    try {
      if (isEditMode && clientId) {
        const updatedClient = await updateClient(clientId, payload);
        toast.success(`"${updatedClient.name}" has been updated successfully.`);
        navigate(`/clients/${updatedClient.id}`);
      } else {
        const createdClient = await createClient(payload);
        toast.success(`"${createdClient.name}" has been created successfully.`);
        navigate(`/clients/${createdClient.id}`);
      }
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.detail : 'Unable to save client right now.';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isBootstrapping) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="h-9 w-9 text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="page-title">{pageTitle}</h1>
            <p className="page-description">Loading client details...</p>
          </div>
        </div>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 py-10">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Fetching the latest client record.
            </span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="h-9 w-9 text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="page-title">{pageTitle}</h1>
            <p className="page-description">{pageDescription}</p>
          </div>
        </div>
        <Card className="shadow-sm">
          <CardContent className="space-y-4 py-8">
            <p className="text-sm text-slate-600 dark:text-slate-400">{loadError}</p>
            <Button variant="outline" onClick={() => navigate('/clients')}>
              Back to Clients
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCancel}
          className="h-9 w-9 text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="page-title">{pageTitle}</h1>
          <p className="page-description">{pageDescription}</p>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-0">
          <CardTitle className="text-base font-semibold">
            {isEditMode ? 'Client Information' : 'Client Details'}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">
                Client Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g. Zenith Bank Plc"
                value={formData.name}
                onChange={(event) => updateField('name', event.target.value)}
                className={cn(
                  'h-10',
                  errors.name && 'border-red-300 focus-visible:ring-red-300'
                )}
              />
              {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="legal@company.com"
                  value={formData.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  className={cn(
                    'h-10',
                    errors.email && 'border-red-300 focus-visible:ring-red-300'
                  )}
                />
                {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+234 1 234 5678"
                  value={formData.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                placeholder="Enter client address..."
                value={formData.address}
                onChange={(event) => updateField('address', event.target.value)}
                className="min-h-[80px] resize-y"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes about this client..."
                value={formData.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                className="min-h-[100px] resize-y"
              />
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-2 dark:border-slate-800 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={handleCancel} className="h-10">
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving || (isEditMode && !isDirty)}
                className="h-10 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {isEditMode ? 'Update Client' : 'Create Client'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default ClientFormPage;

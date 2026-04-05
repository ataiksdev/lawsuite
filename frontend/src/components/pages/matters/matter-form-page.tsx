'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Save, X, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { navigate, useCurrentRoute, useRouteParams } from '@/lib/router';
import { ApiClientError } from '@/lib/api-client';
import { listClients, type BackendClient } from '@/lib/api/clients';
import { listMembers, type MemberSummary } from '@/lib/api/members';
import {
  createMatter,
  getMatter,
  updateMatter,
  type BackendMatter,
  type MatterUpsertPayload,
} from '@/lib/api/matters';
import { MatterType } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

interface FormErrors {
  title?: string;
  client_id?: string;
  matter_type?: string;
}

interface MatterFormData {
  title: string;
  clientId: string;
  matterType: string;
  description: string;
  assignedTo: string;
  targetCloseDate?: Date;
}

function validateForm(data: MatterFormData): FormErrors {
  const errors: FormErrors = {};
  if (!data.title.trim()) {
    errors.title = 'Matter title is required';
  }
  if (!data.clientId) {
    errors.client_id = 'Please select a client';
  }
  if (!data.matterType) {
    errors.matter_type = 'Please select a matter type';
  }
  return errors;
}

function toDate(value?: string | null): Date | undefined {
  return value ? new Date(value) : undefined;
}

function mapMatterToFormData(matter?: BackendMatter | null): MatterFormData {
  return {
    title: matter?.title ?? '',
    clientId: matter?.client_id ?? '',
    matterType: matter?.matter_type ?? '',
    description: matter?.description ?? '',
    assignedTo: matter?.assigned_to ?? 'none',
    targetCloseDate: toDate(matter?.target_close_at),
  };
}

const MATTER_TYPE_OPTIONS = [
  { value: MatterType.ADVISORY, label: 'Advisory' },
  { value: MatterType.LITIGATION, label: 'Litigation' },
  { value: MatterType.COMPLIANCE, label: 'Compliance' },
  { value: MatterType.DRAFTING, label: 'Drafting' },
  { value: MatterType.TRANSACTIONAL, label: 'Transactional' },
];

export function MatterFormPage() {
  const route = useCurrentRoute();
  const params = useRouteParams();
  const isEditMode = route.includes('/edit');
  const matterId = params.id;

  const [formData, setFormData] = useState<MatterFormData>(() => mapMatterToFormData());
  const [clients, setClients] = useState<BackendClient[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [existingMatter, setExistingMatter] = useState<BackendMatter | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    let cancelled = false;

    async function loadFormData() {
      setIsBootstrapping(true);
      setLoadError(null);

      try {
        const [clientResponse, memberResponse, matterResponse] = await Promise.all([
          listClients({ include_inactive: false, page_size: 100 }),
          listMembers(),
          isEditMode && matterId ? getMatter(matterId) : Promise.resolve(null),
        ]);

        if (!cancelled) {
          setClients(clientResponse.items.filter((client) => client.is_active));
          setMembers(memberResponse.filter((member) => member.is_active));
          setExistingMatter(matterResponse);
          setFormData(mapMatterToFormData(matterResponse));
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof ApiClientError
              ? err.detail
              : 'Unable to load the matter form right now.';
          setLoadError(message);
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    }

    loadFormData();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, matterId]);

  const pageTitle = isEditMode ? 'Edit Matter' : 'New Matter';
  const pageDescription = useMemo(() => {
    if (isEditMode) {
      return existingMatter
        ? `Update matter: ${existingMatter.reference_no}`
        : 'Update matter details';
    }
    return 'Create a new legal matter or engagement';
  }, [existingMatter, isEditMode]);

  const updateField = (field: keyof MatterFormData, value: string | Date | undefined) => {
    setFormData((current) => ({ ...current, [field]: value }));

    const errorField =
      field === 'clientId'
        ? 'client_id'
        : field === 'matterType'
          ? 'matter_type'
          : field;

    if (errorField in errors) {
      setErrors((current) => ({ ...current, [errorField]: undefined }));
    }
  };

  const handleCancel = () => {
    if (isEditMode && matterId) {
      navigate(`/matters/${matterId}`);
      return;
    }
    navigate('/matters');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const payload: MatterUpsertPayload = {
      title: formData.title.trim(),
      client_id: formData.clientId,
      matter_type: formData.matterType as MatterUpsertPayload['matter_type'],
      description: formData.description.trim() || undefined,
      assigned_to: formData.assignedTo === 'none' ? undefined : formData.assignedTo,
      target_close_at: formData.targetCloseDate?.toISOString(),
    };

    setIsSaving(true);
    try {
      if (isEditMode && matterId) {
        const updatedMatter = await updateMatter(matterId, payload);
        toast.success(`"${updatedMatter.title}" has been updated successfully.`);
        navigate(`/matters/${updatedMatter.id}`);
      } else {
        const createdMatter = await createMatter(payload);
        toast.success(`"${createdMatter.title}" has been created successfully.`);
        navigate(`/matters/${createdMatter.id}`);
      }
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.detail : 'Unable to save matter right now.';
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
            <p className="page-description">Loading matter details...</p>
          </div>
        </div>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 py-10">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Fetching clients, assignees, and matter details.
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
            <Button variant="outline" onClick={() => navigate('/matters')}>
              Back to Matters
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
            {isEditMode ? 'Matter Information' : 'Matter Details'}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g. Zenith Bank v. Sterling Finance — Loan Recovery"
                value={formData.title}
                onChange={(event) => updateField('title', event.target.value)}
                className={cn(
                  'h-10',
                  errors.title && 'border-red-300 focus-visible:ring-red-300'
                )}
              />
              {errors.title && <p className="text-sm text-red-500">{errors.title}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Client <span className="text-red-500">*</span>
                </Label>
                <Select value={formData.clientId} onValueChange={(value) => updateField('clientId', value)}>
                  <SelectTrigger className={cn('h-10', errors.client_id && 'border-red-300')}>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.client_id && <p className="text-sm text-red-500">{errors.client_id}</p>}
              </div>

              <div className="space-y-2">
                <Label>
                  Matter Type <span className="text-red-500">*</span>
                </Label>
                <Select value={formData.matterType} onValueChange={(value) => updateField('matterType', value)}>
                  <SelectTrigger className={cn('h-10', errors.matter_type && 'border-red-300')}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MATTER_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.matter_type && <p className="text-sm text-red-500">{errors.matter_type}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of the matter..."
                value={formData.description}
                onChange={(event) => updateField('description', event.target.value)}
                className="min-h-[100px] resize-y"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Assigned To</Label>
                <Select value={formData.assignedTo} onValueChange={(value) => updateField('assignedTo', value)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target Close Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'h-10 w-full justify-start text-left font-normal',
                        !formData.targetCloseDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.targetCloseDate
                        ? formData.targetCloseDate.toLocaleDateString('en-NG', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.targetCloseDate}
                      onSelect={(value) => updateField('targetCloseDate', value)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-2 dark:border-slate-800 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={handleCancel} className="h-10">
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
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
                    {isEditMode ? 'Update Matter' : 'Create Matter'}
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

export default MatterFormPage;

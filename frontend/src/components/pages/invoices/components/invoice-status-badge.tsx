'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { InvoiceStatus } from '@/lib/api/invoices';

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300 dark:border-slate-700',
  sent: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800',
  part_paid: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800',
  overdue: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800',
  void: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 line-through',
  written_off: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  part_paid: 'Part Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
  written_off: 'Written Off',
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge className={cn('text-xs font-medium', STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

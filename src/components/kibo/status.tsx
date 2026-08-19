import type { HTMLAttributes } from 'react';
import { Badge } from '../ui/shadcn/badge';
import { cn } from '../../lib/utils';

export type StatusKind = 'online' | 'offline' | 'maintenance' | 'degraded' | 'pending' | 'neutral';

export type StatusProps = HTMLAttributes<HTMLDivElement> & {
  status: StatusKind;
};

/** Kibo Status — badge with a pulsing dot indicator. */
export const Status = ({ className, status, ...props }: StatusProps) => (
  <Badge className={cn('flex items-center gap-2 group', status, className)} variant="secondary" {...props} />
);

export type StatusIndicatorProps = HTMLAttributes<HTMLSpanElement>;

export const StatusIndicator = ({ className, ...props }: StatusIndicatorProps) => (
  <span className="relative flex h-2 w-2" {...props}>
    <span
      className={cn(
        'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
        'group-[.online]:bg-emerald-500',
        'group-[.offline]:bg-red-500',
        'group-[.maintenance]:bg-blue-500',
        'group-[.degraded]:bg-amber-500',
        'group-[.pending]:bg-amber-500',
        'group-[.neutral]:bg-slate-400',
      )}
    />
    <span
      className={cn(
        'relative inline-flex h-2 w-2 rounded-full',
        'group-[.online]:bg-emerald-500',
        'group-[.offline]:bg-red-500',
        'group-[.maintenance]:bg-blue-500',
        'group-[.degraded]:bg-amber-500',
        'group-[.pending]:bg-amber-500',
        'group-[.neutral]:bg-slate-400',
      )}
    />
  </span>
);

export type StatusLabelProps = HTMLAttributes<HTMLSpanElement>;

export const StatusLabel = ({ className, children, ...props }: StatusLabelProps) => (
  <span className={cn('text-muted-foreground', className)} {...props}>
    {children}
  </span>
);

/** Map our domain status values onto Kibo status kinds. */
export function statusKind(status: string): StatusKind {
  switch (status) {
    case 'ACTIVE':
    case 'PAID':
    case 'ENABLED':
      return 'online';
    case 'SUSPENDED':
    case 'CANCELLED':
    case 'VOID':
    case 'DISABLED':
    case 'INACTIVE':
      return 'offline';
    case 'TRIAL':
    case 'PAST_DUE':
    case 'PENDING':
    case 'INVITED':
    case 'REFUNDED':
      return 'degraded';
    case 'EXPIRED':
    case 'FAILED':
      return 'maintenance';
    default:
      return 'neutral';
  }
}

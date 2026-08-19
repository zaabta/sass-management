import type { ComponentProps } from 'react';
import { Badge, type BadgeProps } from '../ui/shadcn/badge';
import { cn } from '../../lib/utils';

export type PillProps = BadgeProps & {
  themed?: boolean;
};

/**
 * Kibo Pill — rounded-full badge with a subtle tone.
 */
export const Pill = ({ variant = 'secondary', themed = false, className, ...props }: PillProps) => (
  <Badge className={cn('gap-2 rounded-full px-3 py-1 font-normal', className)} variant={variant} {...props} />
);

export type PillButtonProps = ComponentProps<'button'> & {
  tone?: 'primary' | 'success' | 'warning' | 'destructive' | 'info' | 'muted';
};

/** Kibo-style pill-shaped action button (dismissable chip). */
export const PillButton = ({ tone = 'muted', className, ...props }: PillButtonProps) => {
  const toneClass = {
    primary: 'bg-primary/10 text-primary hover:bg-primary/20',
    success: 'bg-success/10 text-success hover:bg-success/20',
    warning: 'bg-warning/10 text-warning hover:bg-warning/20',
    destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/20',
    info: 'bg-info/10 text-info hover:bg-info/20',
    muted: 'bg-muted text-muted-foreground hover:bg-secondary',
  }[tone];
  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        toneClass,
        className,
      )}
      {...props}
    />
  );
};

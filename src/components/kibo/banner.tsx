import { useState } from 'react';
import { type LucideIcon, XIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export type BannerTone = 'primary' | 'success' | 'warning' | 'destructive' | 'info';

const TONE_CLASS: Record<BannerTone, string> = {
  primary: 'bg-primary text-primary-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  info: 'bg-info text-info-foreground',
};

export interface BannerProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: BannerTone;
  defaultVisible?: boolean;
  onClose?: () => void;
  inset?: boolean;
}

/**
 * Kibo Banner — dismissible full-width bar (tones: primary/success/warning/
 * destructive/info). Used for subscription alerts.
 */
export function Banner({ children, tone = 'primary', defaultVisible = true, onClose, className, inset = false, ...props }: BannerProps) {
  const [show, setShow] = useState(defaultVisible);
  if (!show) return null;
  return (
    <div className={cn('flex w-full items-center justify-between gap-2 px-4 py-2', TONE_CLASS[tone], inset && 'rounded-lg', className)} {...props}>
      <div className="flex flex-1 items-center gap-2">{children}</div>
      <button
        type="button"
        aria-label="Close banner"
        className="shrink-0 rounded-full p-1 opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
        onClick={() => {
          setShow(false);
          onClose?.();
        }}
      >
        <XIcon size={16} />
      </button>
    </div>
  );
}

export interface BannerIconProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
}

export const BannerIcon = ({ icon: Icon, className, ...props }: BannerIconProps) => (
  <div className={cn('rounded-full border border-background/20 bg-background/10 p-1 shadow-sm', className)} {...props}>
    <Icon size={16} />
  </div>
);

export const BannerTitle = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('flex-1 text-sm font-medium', className)} {...props} />
);

export const BannerAction = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    className={cn(
      'shrink-0 rounded-md bg-background/10 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-background/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background',
      className,
    )}
    {...props}
  />
);

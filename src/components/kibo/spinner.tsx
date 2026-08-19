import { LoaderCircleIcon, LoaderIcon, LoaderPinwheelIcon, type LucideProps } from 'lucide-react';
import { cn } from '../../lib/utils';

type SpinnerVariant = 'circle' | 'throbber' | 'pinwheel';

export interface SpinnerProps extends LucideProps {
  variant?: SpinnerVariant;
}

const Throbber = ({ className, ...props }: LucideProps) => <LoaderIcon className={cn('animate-spin', className)} {...props} />;
const Pinwheel = ({ className, ...props }: LucideProps) => <LoaderPinwheelIcon className={cn('animate-spin', className)} {...props} />;

/**
 * Kibo Spinner — circle (default), throbber, pinwheel variants.
 */
export function Spinner({ variant = 'circle', className, ...props }: SpinnerProps) {
  if (variant === 'throbber') return <Throbber className={className} {...props} />;
  if (variant === 'pinwheel') return <Pinwheel className={className} {...props} />;
  return <LoaderCircleIcon className={cn('animate-spin', className)} {...props} />;
}

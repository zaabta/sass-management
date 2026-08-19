import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type TagsProps = HTMLAttributes<HTMLDivElement> & {
  tags: string[];
  onRemove?: (tag: string) => void;
};

/**
 * Kibo Tags — a list of removable chips. Used for active filter chips.
 */
export function Tags({ tags, onRemove, className, ...props }: TagsProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} {...props}>
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
          {tag}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none"
              onClick={() => onRemove(tag)}
            >
              ✕
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

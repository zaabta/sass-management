import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/utils';

export type Theme = 'light' | 'dark' | 'system';

const THEMES: { key: Theme; icon: typeof Sun; label: string }[] = [
  { key: 'system', icon: Monitor, label: 'System theme' },
  { key: 'light', icon: Sun, label: 'Light theme' },
  { key: 'dark', icon: Moon, label: 'Dark theme' },
];

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark =
    theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  if (dark) root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  root.style.colorScheme = dark ? 'dark' : 'light';
}

/**
 * Kibo ThemeSwitcher — light / dark / system segmented control.
 * Persists the choice and applies it to the whole app (CSS variables).
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('vcfo.theme') as Theme) || 'system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  if (!mounted) return null;

  return (
    <div className={cn('relative isolate flex h-8 rounded-full bg-background p-1 ring-1 ring-border', className)} role="group" aria-label="Theme">
      {THEMES.map(({ key, icon: Icon, label }) => {
        const isActive = theme === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-pressed={isActive}
            className={cn('relative h-6 w-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            onClick={() => {
              setTheme(key);
              localStorage.setItem('vcfo.theme', key);
            }}
          >
            <Icon className="absolute inset-0 m-auto h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

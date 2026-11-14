import { useTranslation } from '@nocobase/i18n/client';
import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Badge } from '#components/ui/badge';
import { Card, CardContent } from '#components/ui/card';
import { text } from './kit.js';

const CHESS_ICONS: Record<string, string> = {
  tot: '♟',
  ma: '♞',
  tuong: '♝',
  xe: '♜',
  hau: '♛',
  vua: '♚',
};

const LEVEL_STYLES: Record<string, string> = {
  tot: 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  ma: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  tuong: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  xe: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  hau: 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  vua: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

/**
 * Visual badge for chess level with unicode chess piece and semantic styling.
 */
export function LevelBadge({
  levelKey,
  size = 'default',
  className,
}: {
  readonly levelKey: unknown;
  readonly size?: 'sm' | 'default';
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  const key = text(levelKey).toLowerCase() || 'tot';
  const icon = CHESS_ICONS[key] ?? '♟';
  const label = t(`edu.level.${key}`);
  const style = LEVEL_STYLES[key] ?? LEVEL_STYLES.tot;

  return (
    <Badge
      variant='outline'
      data-size={size === 'sm' ? 'sm' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium transition-colors',
        style,
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      <span className='text-sm leading-none' aria-hidden='true'>
        {icon}
      </span>
      <span>{label}</span>
    </Badge>
  );
}

/**
 * 3-stage color alert badge for remaining student session balance:
 * - > 4 sessions: Green (Safe)
 * - 1..3 sessions: Amber (Warning: Running low)
 * - <= 0 sessions: Rose/Red (Alert: Exhausted / In debt)
 */
export function SessionBalanceBadge({
  balance,
  size = 'default',
  className,
}: {
  readonly balance: number | null | undefined;
  readonly size?: 'sm' | 'default';
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  if (balance == null) {
    return <span className='text-muted-foreground'>–</span>;
  }

  let style = 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  let dotColor = 'bg-emerald-500';

  if (balance <= 0) {
    style = 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold';
    dotColor = 'bg-rose-500';
  } else if (balance <= 3) {
    style = 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium';
    dotColor = 'bg-amber-500';
  }

  return (
    <Badge
      variant='outline'
      data-size={size === 'sm' ? 'sm' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5',
        style,
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} />
      <span>{balance} {t('edu.home.sessionsLeft', { count: balance })}</span>
    </Badge>
  );
}

const AVATAR_BG_COLORS = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/20',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/20',
  'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase();
  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Generates an initials avatar with deterministic pleasant background color.
 */
export function InitialsAvatar({
  name,
  size = 'md',
  className,
}: {
  readonly name: string;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
  readonly className?: string;
}): ReactElement {
  const initials = getInitials(name);
  const colorIndex = hashString(name) % AVATAR_BG_COLORS.length;
  const colorStyle = AVATAR_BG_COLORS[colorIndex] ?? AVATAR_BG_COLORS[0];

  const sizeClasses = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-xs font-semibold',
    lg: 'h-11 w-11 text-sm font-semibold',
    xl: 'h-14 w-14 text-base font-bold',
  }[size];

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border',
        sizeClasses,
        colorStyle,
        className,
      )}
      aria-hidden='true'
    >
      {initials}
    </div>
  );
}

/**
 * Metric KPI Card for dashboards and page headers.
 */
export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  badgeText,
  onClick,
  className,
  tone = 'neutral',
}: {
  readonly title: string;
  readonly value: ReactNode;
  readonly subtitle?: string;
  readonly icon?: LucideIcon;
  readonly badgeText?: string;
  readonly onClick?: () => void;
  readonly className?: string;
  readonly tone?: 'neutral' | 'primary' | 'warning' | 'success' | 'destructive' | 'info';
}): ReactElement {
  const toneClasses = {
    neutral: 'hover:border-border',
    primary: 'border-primary/20 hover:border-primary/40',
    warning: 'border-amber-500/20 hover:border-amber-500/40',
    success: 'border-emerald-500/20 hover:border-emerald-500/40',
    destructive: 'border-rose-500/20 hover:border-rose-500/40',
    info: 'border-cyan-500/20 hover:border-cyan-500/40',
  }[tone];

  const iconBgClasses = {
    neutral: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    destructive: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    info: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  }[tone];

  return (
    <Card
      onClick={onClick}
      className={cn(
        'relative overflow-hidden transition-all duration-200',
        onClick ? 'cursor-pointer hover:shadow-sm' : '',
        toneClasses,
        className,
      )}
    >
      <CardContent className='p-5'>
        <div className='flex items-start justify-between gap-3'>
          <div className='space-y-1.5'>
            <p className='text-xs font-medium uppercase tracking-wider text-muted-foreground'>
              {title}
            </p>
            <div className='text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>
              {value}
            </div>
            {subtitle ? (
              <p className='text-xs text-muted-foreground'>{subtitle}</p>
            ) : null}
          </div>
          <div className='flex flex-col items-end gap-2'>
            {Icon ? (
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  iconBgClasses,
                )}
              >
                <Icon className='h-5 w-5' />
              </div>
            ) : null}
            {badgeText ? (
              <Badge variant='outline' className='text-[10px]'>
                {badgeText}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Visual progress bar for capacity, attendance rate, or filling ratio.
 */
export function CapacityProgressBar({
  current,
  max,
  label,
  className,
}: {
  readonly current: number;
  readonly max: number;
  readonly label?: string;
  readonly className?: string;
}): ReactElement {
  const percent = max > 0 ? Math.min(Math.round((current / max) * 100), 100) : 0;
  let barColor = 'bg-emerald-500';
  if (percent >= 100) {
    barColor = 'bg-rose-500';
  } else if (percent >= 80) {
    barColor = 'bg-amber-500';
  }

  return (
    <div className={cn('space-y-1', className)}>
      <div className='flex items-center justify-between text-xs text-muted-foreground'>
        <span>{label ?? `${current}/${max}`}</span>
        <span>{percent}%</span>
      </div>
      <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
        <div
          className={cn('h-full transition-all duration-300', barColor)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

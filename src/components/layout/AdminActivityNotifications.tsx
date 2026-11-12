import { ChevronDown, ClipboardList, History } from 'lucide-react';
import type { ActivityLogRow, ActivityPresentationContext } from '../../services/activityLogService';
import { formatAdminActivity } from '../../services/adminActivityPresentation';
import { cn } from '../../lib/utils';

interface Props {
  logs: ActivityLogRow[];
  contexts: Map<string, ActivityPresentationContext>;
  unreadIds: ReadonlySet<string>;
}

const reportStatuses: Record<string, { label: string; className: string }> = {
  'report.pending': { label: 'Received', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  'report.under_review': { label: 'Under review', className: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  'report.in_progress': { label: 'In progress', className: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  'report.resolved': { label: 'Resolved', className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  'report.rejected': { label: 'Dismissed', className: 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200' },
};

function reportName(log: ActivityLogRow, context?: ActivityPresentationContext): string | undefined {
  if (context?.targetName?.trim()) return context.targetName.trim();
  const metadata = log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata) ? log.metadata : {};
  for (const key of ['target_name', 'targetName', 'title', 'name', 'report_title']) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
}

/** Notification-only grouping; the complete audit history remains unchanged. */
export function AdminActivityNotifications({ logs, contexts, unreadIds }: Props) {
  const groups = new Map<string, ActivityLogRow[]>();
  for (const log of [...logs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
    const key = log.action.startsWith('report.') && log.entity_id ? `report:${log.entity_id}` : `activity:${log.id}`;
    const group = groups.get(key);
    if (group) group.push(log);
    else groups.set(key, [log]);
  }

  return <ul aria-label="Recent activity" className="divide-y divide-border">
    {[...groups.values()].slice(0, 6).map(group => {
      const latest = group[0];
      const formatted = formatAdminActivity(latest, contexts.get(latest.id));
      const isReport = latest.action.startsWith('report.');
      const name = isReport ? reportName(latest, contexts.get(latest.id)) : undefined;
      const status = isReport ? reportStatuses[latest.action] : undefined;
      const isUnread = group.some(log => unreadIds.has(log.id));
      const Icon = isReport ? ClipboardList : History;
      return <li key={latest.id} className={cn('px-4 py-4', isUnread && 'bg-blue-50/60 dark:bg-blue-950/25')}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-muted/60 text-slate-600 dark:text-slate-300"><Icon className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 break-words text-sm font-bold leading-5 [overflow-wrap:anywhere]">{name || formatted.title}</h3>
              {isUnread && <span aria-label="Unread activity" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400" />}
            </div>
            {name ? <span className={cn('inline-flex max-w-full rounded-md px-2 py-1 text-xs font-semibold', status?.className || 'bg-muted text-foreground')}>
              {status?.label || formatted.title}
            </span> : <div className="break-words text-xs leading-5 text-slate-600 dark:text-slate-300">{formatted.notificationText}</div>}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              <span className="break-words [overflow-wrap:anywhere]">{formatted.category} · {formatted.actorLabel}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={latest.created_at} title={formatted.timestamp} className="shrink-0">{formatted.relativeTime}</time>
            </div>
            {group.length > 1 && <details className="group">
              <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {group.length} updates <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 group-open:rotate-180" />
              </summary>
              <ul aria-label="Earlier report updates" className="space-y-3 border-l-2 border-border pl-3 pb-1">
                {group.slice(1).map(log => {
                  const previous = formatAdminActivity(log, contexts.get(log.id));
                  return <li key={log.id} className="space-y-1 text-xs leading-5">
                    <div className="font-semibold text-foreground">{previous.title}</div>
                    <div className="break-words text-slate-600 dark:text-slate-300">{previous.actorLabel} · <time dateTime={log.created_at} title={previous.timestamp}>{previous.relativeTime}</time></div>
                  </li>;
                })}
              </ul>
            </details>}
          </div>
        </div>
      </li>;
    })}
  </ul>;
}

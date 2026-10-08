import type { CampusEventOverlay } from '../map-builder/types';
import { formatEventDate, getStudentEventPhase } from '../../lib/eventPublication';
import { cn } from '../../lib/utils';

/** Publication is independent of the review decision displayed beside it. */
export function EventStudentVisibility({ overlay, nowMs = Date.now() }: { overlay: CampusEventOverlay; nowMs?: number }) {
  if (overlay.status !== 'approved') return null;
  const phase = getStudentEventPhase(overlay, nowMs);
  const ended = Number.isFinite(Date.parse(overlay.dateEnd ?? '')) && Date.parse(overlay.dateEnd!) <= nowMs;
  const published = phase === 'upcoming' || phase === 'ongoing';
  const label = ended ? 'Ended' : !overlay.isActive ? 'Unpublished' : phase === 'scheduled' ? 'Scheduled' : published ? 'Published' : 'Schedule unavailable';
  const detail = ended ? 'Hidden from students; the event has ended.' : !overlay.isActive ? 'Hidden from students. Approval is kept.' : phase === 'scheduled' ? `Hidden until ${formatEventDate(overlay.publicationAt)} (Asia/Manila).` : published ? `Visible to students · ${phase === 'upcoming' ? 'Upcoming' : 'Ongoing'}` : 'Hidden from students until a valid publication schedule is set.';
  return <div aria-label="Student visibility" data-publication-state={label} className="mt-3 rounded-xl border border-border bg-muted/30 px-3 py-2">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-[11px] font-semibold text-muted-foreground">Student visibility</span><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', published && !ended ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>{label}</span></div>
    <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{detail}</p>
  </div>;
}

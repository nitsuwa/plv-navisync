export function EventUnreadBadge({ count, className = "" }: { count: number; className?: string }) {
  if (!count) return null;
  return <span aria-hidden="true" data-testid="event-unread-count" className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold leading-none text-white ${className}`}>{count > 99 ? "99+" : count}</span>;
}

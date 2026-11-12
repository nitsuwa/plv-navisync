import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ActivityLogRow } from '../../../services/activityLogService';
import { AdminActivityNotifications } from '../AdminActivityNotifications';

const row = (id: string, entityId: string | null, action = 'report.under_review', createdAt = '2026-11-13T01:00:00Z'): ActivityLogRow => ({
  id, action, entity_id: entityId, entity_type: 'reports', actor_id: null, campus_id: null,
  metadata: { report_title: 'Broken light at Student Center', actor_name: 'Demo Administrator' }, created_at: createdAt,
});

describe('Admin activity notification presentation', () => {
  it('leads with the report name and groups its older updates into expandable history', () => {
    render(<AdminActivityNotifications logs={[row('old', 'report-1', 'report.pending', '2026-11-12T01:00:00Z'), row('new', 'report-1')]} contexts={new Map()} unreadIds={new Set(['old'])} />);
    expect(screen.getAllByText('Broken light at Student Center')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Broken light at Student Center' })).toBeInTheDocument();
    const summary = screen.getByText('2 updates');
    const details = summary.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getByText('Report received')).toBeInTheDocument();
    expect(screen.getByLabelText('Unread activity')).toBeInTheDocument();
    expect(screen.getByText('Under review')).toBeInTheDocument();
  });

  it('does not combine reports with identical titles or missing entity IDs', () => {
    render(<AdminActivityNotifications logs={[row('a', 'one'), row('b', 'two'), row('c', null), row('d', null)]} contexts={new Map()} unreadIds={new Set()} />);
    expect(screen.getAllByRole('heading', { name: 'Broken light at Student Center' })).toHaveLength(4);
    expect(screen.queryByText(/updates/)).not.toBeInTheDocument();
  });

  it('prefers resolved names and keeps unknown actions and missing metadata readable', () => {
    const unknown = { ...row('unknown', null, 'custom.changed'), metadata: null };
    render(<AdminActivityNotifications logs={[row('resolved', 'one'), unknown]} contexts={new Map([['resolved', { targetName: 'Resolved report name' }]])} unreadIds={new Set()} />);
    expect(screen.getByRole('heading', { name: 'Resolved report name' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Custom changed' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Unread activity')).not.toBeInTheDocument();
  });

  it('limits groups after grouping so repeated reports do not crowd out other activity', () => {
    render(<AdminActivityNotifications logs={[...Array.from({ length: 8 }, (_, i) => row(`repeat-${i}`, 'same')), row('other', 'other', 'report.resolved')]} contexts={new Map([['other', { targetName: 'Separate report' }]])} unreadIds={new Set()} />);
    expect(screen.getByRole('heading', { name: 'Separate report' })).toBeInTheDocument();
    expect(screen.getByText('8 updates')).toBeInTheDocument();
  });
});

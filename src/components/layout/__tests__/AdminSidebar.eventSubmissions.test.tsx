import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../hooks/useAdminAuth', () => ({ useAdminAuth: () => ({ profile: { id: 'admin' }, isAdmin: true, loading: false }) }));
vi.mock('../../../hooks/useStudentAuth', () => ({ useStudentAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('../../../hooks/useAdminEventSubmissions', () => ({ useAdminEventSubmissions: () => ({ pendingCount: 2, unreadCount: 0 }) }));
vi.mock('../../../services/reportService', () => ({ reportService: { countPendingReports: async () => 0 } }));
vi.mock('../../map-builder/UnsavedChangesContext', () => ({ useUnsavedChangesContext: () => ({ requestGuarded: (fn: () => void) => fn() }) }));
import { AdminSidebar } from '../AdminSidebar';
describe('admin event queue navigation', () => {
  it('keeps pending review work visible after notifications are read in expanded and collapsed navigation', () => {
    const page = render(<MemoryRouter><AdminSidebar /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Event Layouts, 2 pending reviews/i })).toHaveTextContent('2');
    page.rerender(<MemoryRouter><AdminSidebar collapsed /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Event Layouts, 2 pending reviews/i })).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CampusEventOverlay } from '../../map-builder/types';
import { eventPreviewFixture } from '../../../test/eventFullPackFixtures';
import { EventStudentVisibility } from '../EventStudentVisibility';

const approved = { ...eventPreviewFixture(), restrictedAreas: [] } as unknown as CampusEventOverlay;
describe('review approval versus student publication', () => {
  it('does not imply student visibility simply because an event is approved', () => {
    render(<EventStudentVisibility overlay={{ ...approved, isActive: false }} nowMs={Date.parse('2026-10-07T02:00:00Z')} />);
    expect(screen.getByText('Unpublished')).toBeInTheDocument();
    expect(screen.getByText(/Hidden from students/i)).toBeInTheDocument();
    expect(screen.queryByText('Published', { exact: true })).not.toBeInTheDocument();
  });
  it('shows scheduled publication time before visibility and Published + Upcoming after publication', () => {
    const event = { ...approved, publicationAt: '2026-10-07T04:00:00Z' };
    const view = render(<EventStudentVisibility overlay={event} nowMs={Date.parse('2026-10-07T02:00:00Z')} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText(/Hidden until/i)).toBeInTheDocument();
    view.rerender(<EventStudentVisibility overlay={event} nowMs={Date.parse('2026-10-07T05:00:00Z')} />);
    expect(screen.getByText('Published', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Visible to students.*Upcoming/i)).toBeInTheDocument();
    view.rerender(<EventStudentVisibility overlay={event} nowMs={Date.parse('2026-10-09T00:00:00Z')} />);
    expect(screen.getByText('Ended')).toBeInTheDocument();
    expect(screen.queryByText('Published', { exact: true })).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api-client', () => ({
  getSubscribedSpaceIds: vi.fn(),
  subscribeToSpaceNotifications: vi.fn(),
  unsubscribeFromSpaceNotifications: vi.fn(),
}));

import { NotifyMeButton } from './NotifyMeButton';
import {
  getSubscribedSpaceIds,
  subscribeToSpaceNotifications,
  unsubscribeFromSpaceNotifications,
} from '@/lib/api-client';

describe('NotifyMeButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscribeToSpaceNotifications).mockResolvedValue();
    vi.mocked(unsubscribeFromSpaceNotifications).mockResolvedValue();
  });

  it('subscribes when not yet subscribed', async () => {
    vi.mocked(getSubscribedSpaceIds).mockResolvedValue([]);
    render(<NotifyMeButton spaceId="board" />);

    // Once state loads, it shows the un-subscribed label.
    await waitFor(() => expect(screen.getByText('Notify me')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button'));
    expect(subscribeToSpaceNotifications).toHaveBeenCalledWith('board');
    await waitFor(() => expect(screen.getByText('Notifications on')).toBeInTheDocument());
  });

  it('unsubscribes when already subscribed', async () => {
    vi.mocked(getSubscribedSpaceIds).mockResolvedValue(['board']);
    render(<NotifyMeButton spaceId="board" />);

    await waitFor(() => expect(screen.getByText('Notifications on')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button'));
    expect(unsubscribeFromSpaceNotifications).toHaveBeenCalledWith('board');
    await waitFor(() => expect(screen.getByText('Notify me')).toBeInTheDocument());
  });

  it('reverts optimistic state if the request fails', async () => {
    vi.mocked(getSubscribedSpaceIds).mockResolvedValue([]);
    vi.mocked(subscribeToSpaceNotifications).mockRejectedValue(new Error('boom'));
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<NotifyMeButton spaceId="board" />);

    await waitFor(() => expect(screen.getByText('Notify me')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button'));

    // After the failure it falls back to the un-subscribed label.
    await waitFor(() => expect(screen.getByText('Notify me')).toBeInTheDocument());
  });
});

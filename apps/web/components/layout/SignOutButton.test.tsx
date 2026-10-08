import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/csrf', () => ({ csrfFetch: vi.fn() }));

import { SignOutButton } from './SignOutButton';
import { csrfFetch } from '@/lib/csrf';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('SignOutButton', () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', { ...window.location, assign, origin: 'http://localhost' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to the logout endpoint and navigates to the Keycloak logout URL', async () => {
    const logoutUrl = 'https://sso.example.org/logout?id_token_hint=abc';
    vi.mocked(csrfFetch).mockResolvedValue(jsonResponse(200, { logoutUrl }));

    render(<SignOutButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(csrfFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    await waitFor(() => expect(assign).toHaveBeenCalledWith(logoutUrl));
  });

  it('refuses to navigate to a non-http URL', async () => {
    vi.mocked(csrfFetch).mockResolvedValue(jsonResponse(200, { logoutUrl: 'javascript:alert(1)' }));

    render(<SignOutButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
  });

  it('stays on the page and says so when sign out fails', async () => {
    vi.mocked(csrfFetch).mockResolvedValue(jsonResponse(500, { error: 'boom' }));

    render(<SignOutButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('still signed in');
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });
});

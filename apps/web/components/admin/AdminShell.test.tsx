import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceConfig } from '@snomed/types';
import { AdminShell } from './AdminShell';

// MetricsPanel has its own data loading; keep this test about the shell.
vi.mock('./MetricsPanel', () => ({
  MetricsPanel: () => <div data-testid="metrics-panel">metrics</div>,
}));

vi.mock('@/lib/csrf', () => ({
  csrfFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)),
}));

const SPACES: SpaceConfig[] = [
  {
    id: 'board',
    name: 'Board of Management',
    keycloakGroup: '/board-members',
    driveFolderId: 'folder-board',
    hierarchyCategory: 'Board Level',
    uploadGroups: ['secretariat'],
    sortOrder: 0,
    sections: [
      { id: 'agendas', name: 'Agendas', driveFolderId: 'folder-agendas', sortOrder: 0 },
    ],
  },
  {
    id: 'finance',
    name: 'Finance Committee',
    keycloakGroup: '/finance',
    driveFolderId: 'folder-finance',
    hierarchyCategory: 'Committees',
    uploadGroups: [],
    sortOrder: 1,
    sections: [],
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

/** Routes each /api/admin/* call to a canned response and records the URL. */
function routeFetch(routes: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/\?.*$/, '');
    if (path in routes) return jsonResponse(routes[path]);
    return jsonResponse({ error: `unexpected ${url}`, code: 'TEST' }, 500);
  });
}

function calledPaths(): string[] {
  return fetchMock.mock.calls.map(([input]) =>
    (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).replace(/\?.*$/, ''),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('AdminShell', () => {
  it('renders the spaces list with sections collapsed by default', () => {
    routeFetch({});
    render(<AdminShell initialSpaces={SPACES} />);

    expect(screen.getByText('Board of Management')).toBeInTheDocument();
    expect(screen.getByText('Finance Committee')).toBeInTheDocument();
    expect(screen.getByText('1 section')).toBeInTheDocument();
    expect(screen.queryByText('Agendas')).not.toBeInTheDocument();
    // Site-level actions live on the Spaces tab.
    expect(screen.getByRole('button', { name: /new space/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset site/i })).toBeInTheDocument();
  });

  it('expands a space to show its sections and the add-section action', async () => {
    routeFetch({});
    const user = userEvent.setup();
    render(<AdminShell initialSpaces={SPACES} />);

    await user.click(screen.getAllByRole('button', { name: 'Expand' })[0]);

    expect(screen.getByText('Agendas')).toBeInTheDocument();
    expect(screen.getByText('folder-agendas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add document section/i })).toBeInTheDocument();
  });

  it('opens the create-space form and returns to the list on cancel', async () => {
    routeFetch({});
    const user = userEvent.setup();
    render(<AdminShell initialSpaces={SPACES} />);

    await user.click(screen.getByRole('button', { name: /new space/i }));
    expect(screen.getByRole('heading', { name: 'Create Space' })).toBeInTheDocument();
    // Create button stays disabled until the required fields are filled.
    expect(screen.getByRole('button', { name: /create space/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Board of Management')).toBeInTheDocument();
  });

  it('opens the edit form pre-filled and with the id locked', async () => {
    routeFetch({});
    const user = userEvent.setup();
    render(<AdminShell initialSpaces={SPACES} />);

    const boardRow = screen.getByText('Board of Management').closest('div.rounded-xl') as HTMLElement;
    await user.click(within(boardRow).getByRole('button', { name: /edit/i }));

    expect(screen.getByRole('heading', { name: 'Edit: Board of Management' })).toBeInTheDocument();
    const idInput = screen.getByDisplayValue('board') as HTMLInputElement;
    expect(idInput).toBeDisabled();
    expect(screen.getByDisplayValue('secretariat')).toBeInTheDocument();
  });

  it('saves a new space, refreshes the list and shows a toast', async () => {
    const created: SpaceConfig = {
      id: 'audit',
      name: 'Audit Committee',
      keycloakGroup: '/audit',
      driveFolderId: 'folder-audit',
      hierarchyCategory: 'Committees',
      uploadGroups: [],
      sortOrder: 0,
      sections: [],
    };
    routeFetch({
      'http://localhost:3000/api/admin/spaces': [...SPACES, created],
      '/api/admin/spaces': [...SPACES, created],
    });
    const user = userEvent.setup();
    render(<AdminShell initialSpaces={SPACES} />);

    await user.click(screen.getByRole('button', { name: /new space/i }));
    await user.type(screen.getByPlaceholderText('board'), 'audit');
    await user.type(screen.getByPlaceholderText('Board of Management'), 'Audit Committee');
    // Keycloak Group (the Discourse slug field shares the placeholder).
    await user.type(screen.getAllByPlaceholderText('board-members')[0], 'audit');
    await user.type(screen.getByPlaceholderText('Board Level'), 'Committees');
    await user.type(screen.getByPlaceholderText(/1BxiMVs0/), 'folder-audit');
    await user.click(screen.getByRole('button', { name: /create space/i }));

    await waitFor(() => expect(screen.getByText('Audit Committee')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Space created.');

    // POST to create, then GET to refresh.
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toMatchObject({ id: 'audit', name: 'Audit Committee' });
  });

  it('switches tabs and each view loads its own data', async () => {
    routeFetch({
      '/api/admin/categories': [{ name: 'Board Level', sortOrder: 0 }, { name: 'Committees', sortOrder: null }],
      '/api/admin/audit-logs': [
        {
          id: 1,
          timestamp: '2026-01-05T10:00:00.000Z',
          userId: 'user-12345678',
          userName: 'Rory',
          action: 'CREATE_SPACE',
          entityType: 'SPACE',
          entityId: 'board',
          details: 'not json',
        },
      ],
      '/api/admin/subscriptions': {
        subscriptions: [{ userId: 'u1', spaceId: 'board', email: 'u1@example.com', createdAt: '2026-01-01 09:00:00' }],
      },
    });
    const user = userEvent.setup();
    render(<AdminShell initialSpaces={SPACES} />);

    await user.click(screen.getByRole('button', { name: 'Category Order' }));
    await waitFor(() => expect(screen.getByText('Committees')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save order/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Audit Log' }));
    // The action also appears as a filter <option>; look inside the table.
    await waitFor(() => expect(within(screen.getByRole('table')).getByText('CREATE_SPACE')).toBeInTheDocument());
    // A non-JSON details value must not crash the table.
    expect(screen.getByText('not json')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute('href', '/api/admin/audit-logs/export');

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await waitFor(() => expect(screen.getByText('u1@example.com')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /send test email/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Analytics' }));
    expect(screen.getByTestId('metrics-panel')).toBeInTheDocument();

    expect(calledPaths()).toEqual(
      expect.arrayContaining(['/api/admin/categories', '/api/admin/audit-logs', '/api/admin/subscriptions']),
    );
  });

  it('audit log Clear resets the filters and refetches without them', async () => {
    routeFetch({ '/api/admin/audit-logs': [] });
    const user = userEvent.setup();
    render(<AdminShell initialSpaces={SPACES} />);

    await user.click(screen.getByRole('button', { name: 'Audit Log' }));
    await waitFor(() => expect(screen.getByText('No audit logs found.')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Name contains…'), 'rory');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([i]) => String(i).includes('user=rory'))).toBe(true),
    );

    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(lastUrl).not.toContain('user=');
    expect((screen.getByPlaceholderText('Name contains…') as HTMLInputElement).value).toBe('');
  });
});

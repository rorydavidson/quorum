import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DriveFile } from '@snomed/types';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/api-client', () => ({
  fileDownloadUrl: (s: string, f: string) => `/api/documents/${s}/${f}/download`,
  fileForceDownloadUrl: (s: string, f: string) => `/api/documents/${s}/${f}/download?download=1`,
  deleteFileFromSpace: vi.fn().mockResolvedValue(undefined),
  createOfficialRecord: vi.fn().mockResolvedValue(undefined),
  markDocumentRead: vi.fn().mockResolvedValue(undefined),
  unmarkDocumentRead: vi.fn().mockResolvedValue(undefined),
  getDocumentReaders: vi.fn(),
}));

import { DocumentList } from './DocumentList';
import { markDocumentRead, unmarkDocumentRead, getDocumentReaders } from '@/lib/api-client';

const pdf: DriveFile = {
  id: 'file-pdf',
  name: 'Minutes.pdf',
  mimeType: 'application/pdf',
  createdTime: '2025-01-01T00:00:00Z',
  modifiedTime: '2025-01-02T00:00:00Z',
  isOfficialRecord: false,
};
const official: DriveFile = {
  id: 'file-rec',
  name: '_OFFICIAL_RECORD_2025-01-01_Report.pdf',
  mimeType: 'application/pdf',
  createdTime: '2025-01-01T00:00:00Z',
  modifiedTime: '2025-01-01T00:00:00Z',
  isOfficialRecord: true,
};
const folder: DriveFile = {
  id: 'folder-1',
  name: 'Sub Folder',
  mimeType: 'application/vnd.google-apps.folder',
  createdTime: '2025-01-01T00:00:00Z',
  modifiedTime: '2025-01-01T00:00:00Z',
  isOfficialRecord: false,
};

const files = [pdf, official, folder];

describe('DocumentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders each file name', () => {
    render(<DocumentList spaceId="board" files={files} />);
    expect(screen.getAllByText('Minutes.pdf').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sub Folder').length).toBeGreaterThan(0);
  });

  it('marks an unread document as read', async () => {
    render(<DocumentList spaceId="board" files={[pdf]} readFileIds={[]} />);
    // Desktop table + mobile card both render, so the control appears twice.
    await userEvent.click(screen.getAllByRole('button', { name: /mark minutes\.pdf as read/i })[0]);
    expect(markDocumentRead).toHaveBeenCalledWith('board', 'file-pdf');
    // After marking, the control flips to "mark as unread".
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /mark minutes\.pdf as unread/i }).length).toBeGreaterThan(0),
    );
  });

  it('unmarks a document seeded as read', async () => {
    render(<DocumentList spaceId="board" files={[pdf]} readFileIds={['file-pdf']} />);
    await userEvent.click(screen.getAllByRole('button', { name: /mark minutes\.pdf as unread/i })[0]);
    expect(unmarkDocumentRead).toHaveBeenCalledWith('board', 'file-pdf');
  });

  it('filters to Official Records only', async () => {
    render(<DocumentList spaceId="board" files={files} />);
    // Before filtering, the ordinary document is visible.
    expect(screen.getAllByText('Minutes.pdf').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /official records only/i }));
    // The non-record document is filtered out; the record remains.
    await waitFor(() => expect(screen.queryByText('Minutes.pdf')).toBeNull());
    expect(screen.getAllByText(/_OFFICIAL_RECORD_/).length).toBeGreaterThan(0);
  });

  it('navigates into a folder on row click', async () => {
    render(<DocumentList spaceId="board" files={[folder]} />);
    await userEvent.click(screen.getAllByText('Sub Folder')[0]);
    expect(pushMock).toHaveBeenCalled();
    expect(pushMock.mock.calls.at(-1)![0]).toContain('folderId=folder-1');
  });

  it('opens the readers modal for admins', async () => {
    vi.mocked(getDocumentReaders).mockResolvedValue([
      { userId: 'u1', userName: 'Ada Lovelace', readAt: '2026-07-04T09:00:00Z' },
    ]);
    render(<DocumentList spaceId="board" files={[pdf]} canViewReaders />);

    await userEvent.click(screen.getAllByRole('button', { name: /see who has read minutes\.pdf/i })[0]);
    expect(getDocumentReaders).toHaveBeenCalledWith('board', 'file-pdf');

    // The modal renders once and lists the reader.
    expect(await screen.findByText('Read by')).toBeInTheDocument();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('does not show read controls when there are no documents', () => {
    render(<DocumentList spaceId="board" files={[]} />);
    expect(screen.getByText('No documents found')).toBeInTheDocument();
  });
});

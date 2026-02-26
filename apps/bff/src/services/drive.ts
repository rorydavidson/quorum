import { google } from 'googleapis';
import type { DriveFile } from '@snomed/types';
import { Readable } from 'stream';

// ---------------------------------------------------------------------------
// Google Drive client — Service Account credentials
// ---------------------------------------------------------------------------

function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !key) {
    throw new Error('Google Service Account credentials not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)');
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  return google.drive({ version: 'v3', auth });
}

// Lazy singleton — only creates client when first needed
let _drive: ReturnType<typeof getDriveClient> | null = null;

function drive() {
  if (!_drive) _drive = getDriveClient();
  return _drive;
}

function isMockMode(): boolean {
  return !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OFFICIAL_RECORD_MARKER = '_OFFICIAL_RECORD_';

function toMb(bytes?: string | null): number | undefined {
  if (!bytes) return undefined;
  return Math.round(parseInt(bytes, 10) / 1024 / 1024 * 100) / 100;
}

function mapFile(f: {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: string | null;
  createdTime?: string | null;
  modifiedTime?: string | null;
  webViewLink?: string | null;
}): DriveFile {
  return {
    id: f.id ?? '',
    name: f.name ?? '',
    mimeType: f.mimeType ?? 'application/octet-stream',
    size: toMb(f.size),
    createdTime: f.createdTime ?? new Date().toISOString(),
    modifiedTime: f.modifiedTime ?? new Date().toISOString(),
    webViewLink: f.webViewLink ?? undefined,
    isOfficialRecord: (f.name ?? '').includes(OFFICIAL_RECORD_MARKER),
  };
}

// ---------------------------------------------------------------------------
// Mock data — used when Google SA credentials are not configured
// ---------------------------------------------------------------------------

const MOCK_FILES: DriveFile[] = [
  {
    id: 'mock-file-1',
    name: 'Board Meeting Agenda – March 2025.pdf',
    mimeType: 'application/pdf',
    size: 0.42,
    createdTime: '2025-03-01T09:00:00Z',
    modifiedTime: '2025-03-10T14:30:00Z',
    isOfficialRecord: false,
  },
  {
    id: 'mock-file-2',
    name: '_OFFICIAL_RECORD_2024-12-15_Annual-Report.pdf',
    mimeType: 'application/pdf',
    size: 2.1,
    createdTime: '2024-12-15T10:00:00Z',
    modifiedTime: '2024-12-15T10:00:00Z',
    isOfficialRecord: true,
  },
  {
    id: 'mock-file-3',
    name: 'Q1 Financial Summary.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 0.18,
    createdTime: '2025-02-01T08:00:00Z',
    modifiedTime: '2025-02-28T16:45:00Z',
    isOfficialRecord: false,
  },
  {
    id: 'mock-file-4',
    name: 'Governance Framework v3.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 0.31,
    createdTime: '2025-01-15T11:00:00Z',
    modifiedTime: '2025-01-20T09:15:00Z',
    isOfficialRecord: false,
  },
  {
    id: 'mock-file-5',
    name: 'Strategic Plan 2025–2030.pdf',
    mimeType: 'application/pdf',
    size: 1.75,
    createdTime: '2025-01-05T12:00:00Z',
    modifiedTime: '2025-01-05T12:00:00Z',
    isOfficialRecord: false,
  },
];

// A minimal valid single-page PDF for mock downloads
const MOCK_PDF_BYTES = Buffer.from(
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NCA+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDEwMCA3MDAgVGQgKE1vY2sgRG9jdW1lbnQpIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI3NCAwMDAwMCBuIAowMDAwMDAwMzY4IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDQ3CiUlRU9G',
  'base64'
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all non-trashed files directly inside a Drive folder.
 * Returns most-recently-modified first.
 */
export async function listFiles(_folderId: string): Promise<DriveFile[]> {
  if (isMockMode()) return MOCK_FILES;

  const res = await drive().files.list({
    q: `'${_folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
    orderBy: 'modifiedTime desc',
    pageSize: 200,
  });

  return (res.data.files ?? []).map(mapFile);
}

/**
 * Fetch metadata for a single file.
 */
export async function getFileMetadata(fileId: string): Promise<DriveFile> {
  if (isMockMode()) {
    return MOCK_FILES.find((f) => f.id === fileId) ?? MOCK_FILES[0];
  }

  const res = await drive().files.get({
    fileId,
    fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink',
  });
  return mapFile(res.data);
}

/**
 * Stream a file's content from Drive.
 * Pass the stream directly to the Express response to proxy it to the browser.
 */
export async function downloadFile(fileId: string): Promise<{
  stream: Readable;
  mimeType: string;
  name: string;
}> {
  if (isMockMode()) {
    const meta = MOCK_FILES.find((f) => f.id === fileId) ?? MOCK_FILES[0];
    const stream = Readable.from(MOCK_PDF_BYTES);
    return { stream, mimeType: 'application/pdf', name: meta.name };
  }

  // First get metadata so we know the MIME type
  const meta = await drive().files.get({
    fileId,
    fields: 'name, mimeType',
  });

  const mimeType = meta.data.mimeType ?? 'application/octet-stream';
  const name = meta.data.name ?? fileId;

  // For Google Docs / Sheets / Slides, export as PDF
  let stream: Readable;
  if (mimeType.startsWith('application/vnd.google-apps.')) {
    const exportRes = await drive().files.export(
      { fileId, mimeType: 'application/pdf' },
      { responseType: 'stream' }
    );
    stream = exportRes.data as unknown as Readable;
    return { stream, mimeType: 'application/pdf', name: `${name}.pdf` };
  }

  const downloadRes = await drive().files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  stream = downloadRes.data as unknown as Readable;
  return { stream, mimeType, name };
}

/**
 * Check whether the Drive service is reachable (used at startup).
 */
export async function checkDriveAccess(): Promise<boolean> {
  if (isMockMode()) return false;
  try {
    await drive().about.get({ fields: 'user' });
    return true;
  } catch {
    return false;
  }
}

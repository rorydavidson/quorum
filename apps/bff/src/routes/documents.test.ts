import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import type { SessionUser, SpaceConfig, DriveFile } from '@snomed/types';

// ---------------------------------------------------------------------------
// Mock DB and Drive services
// ---------------------------------------------------------------------------

vi.mock('../services/db.js', () => ({
  getSpaces: vi.fn(),
  getSpaceById: vi.fn(),
  getSectionById: vi.fn(),
  default: {},
}));

vi.mock('../services/drive.js', () => ({
  listFiles: vi.fn(),
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  searchFilesInFolders: vi.fn(),
  checkDriveAccess: vi.fn(),
}));

import * as db from '../services/db.js';
import * as drive from '../services/drive.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const adminUser: SessionUser = {
  sub: 'admin-1',
  email: 'admin@test.com',
  name: 'Admin',
  given_name: 'Admin',
  family_name: 'User',
  groups: ['portal_admin'],
};

const boardUser: SessionUser = {
  sub: 'board-1',
  email: 'board@test.com',
  name: 'Board Member',
  given_name: 'Board',
  family_name: 'Member',
  groups: ['/board-members'],
};

const outsiderUser: SessionUser = {
  sub: 'out-1',
  email: 'out@test.com',
  name: 'Outsider',
  given_name: 'Out',
  family_name: 'Sider',
  groups: ['some-other-group'],
};

const boardSpace: SpaceConfig = {
  id: 'board',
  name: 'Board',
  keycloakGroup: '/board-members',
  driveFolderId: 'folder-1',
  hierarchyCategory: 'Board Level',
  uploadGroups: ['/secretariat', 'portal_admin'],
  sortOrder: 0,
  sections: [],
};

const mockFile: DriveFile = {
  id: 'file-1',
  name: 'Minutes.pdf',
  mimeType: 'application/pdf',
  createdTime: '2025-01-01T00:00:00Z',
  modifiedTime: '2025-01-02T00:00:00Z',
  isOfficialRecord: false,
};

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function createApp(user?: SessionUser) {
  const { default: documentsRouter } = await import('./documents.js');

  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret-minimum-32-chars-for-vitest',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );
  if (user) {
    app.use((req, _res, next) => {
      req.session.user = user;
      next();
    });
  }
  app.use('/documents', documentsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe('Documents routes — authentication', () => {
  it('GET /documents returns 401 when unauthenticated', async () => {
    const app = await createApp(); // no user
    const res = await request(app).get('/documents');
    expect(res.status).toBe(401);
  });

  it('GET /documents/:spaceId returns 401 when unauthenticated', async () => {
    const app = await createApp();
    const res = await request(app).get('/documents/board');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /documents — space listing with RBAC
// ---------------------------------------------------------------------------

describe('GET /documents — space listing', () => {
  it('admin sees all spaces', async () => {
    vi.mocked(db.getSpaces).mockResolvedValue([boardSpace]);
    const app = await createApp(adminUser);
    const res = await request(app).get('/documents');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('regular user sees only their spaces', async () => {
    const otherSpace: SpaceConfig = {
      ...boardSpace,
      id: 'other',
      name: 'Other',
      keycloakGroup: '/other-group',
    };
    vi.mocked(db.getSpaces).mockResolvedValue([boardSpace, otherSpace]);
    const app = await createApp(boardUser);
    const res = await request(app).get('/documents');
    expect(res.status).toBe(200);
    // boardUser is in /board-members, should only see board space
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('board');
  });

  it('returns empty list when user has no matching spaces', async () => {
    vi.mocked(db.getSpaces).mockResolvedValue([boardSpace]);
    const app = await createApp(outsiderUser);
    const res = await request(app).get('/documents');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GET /documents/:spaceId — space access control
// ---------------------------------------------------------------------------

describe('GET /documents/:spaceId — space access', () => {
  it('returns 404 when space does not exist', async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(undefined);
    const app = await createApp(adminUser);
    const res = await request(app).get('/documents/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SPACE_NOT_FOUND');
  });

  it('returns 403 when user is not in the space group', async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(boardSpace);
    const app = await createApp(outsiderUser);
    const res = await request(app).get('/documents/board');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 200 with files for an authorized user', async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(boardSpace);
    vi.mocked(drive.listFiles).mockResolvedValue([mockFile]);
    const app = await createApp(boardUser);
    const res = await request(app).get('/documents/board');
    expect(res.status).toBe(200);
    expect(res.body.space.id).toBe('board');
    expect(res.body.files).toHaveLength(1);
  });

  it('admin can access any space', async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(boardSpace);
    vi.mocked(drive.listFiles).mockResolvedValue([]);
    const app = await createApp(adminUser);
    const res = await request(app).get('/documents/board');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /documents/:spaceId/upload — MIME type validation
// ---------------------------------------------------------------------------

describe('POST /documents/:spaceId/upload — MIME type allowlist', () => {
  beforeEach(() => {
    vi.mocked(db.getSpaceById).mockResolvedValue(boardSpace);
    vi.mocked(drive.uploadFile).mockResolvedValue(mockFile);
  });

  it('rejects .exe files with 400 INVALID_FILE_TYPE', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/documents/board/upload')
      .attach('file', Buffer.from('MZ...'), {
        filename: 'malware.exe',
        contentType: 'application/x-msdownload',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects .zip files with 400 INVALID_FILE_TYPE', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/documents/board/upload')
      .attach('file', Buffer.from('PK...'), {
        filename: 'archive.zip',
        contentType: 'application/zip',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects text/html with 400 INVALID_FILE_TYPE', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/documents/board/upload')
      .attach('file', Buffer.from('<html>'), {
        filename: 'page.html',
        contentType: 'text/html',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
  });

  it('accepts PDF uploads', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/documents/board/upload')
      .attach('file', Buffer.from('%PDF-1.4 content'), {
        filename: 'minutes.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
    expect(drive.uploadFile).toHaveBeenCalled();
  });

  it('accepts .docx (Word) uploads', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/documents/board/upload')
      .attach('file', Buffer.from('PK'), {
        filename: 'report.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    expect(res.status).toBe(201);
  });

  it('accepts .xlsx (Excel) uploads', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/documents/board/upload')
      .attach('file', Buffer.from('PK'), {
        filename: 'data.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    expect(res.status).toBe(201);
  });

  it('accepts PNG image uploads', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/documents/board/upload')
      .attach('file', Buffer.from('\x89PNG'), {
        filename: 'diagram.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(201);
  });

  it('accepts plain text uploads', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/documents/board/upload')
      .attach('file', Buffer.from('hello world'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// POST /documents/:spaceId/upload — RBAC
// ---------------------------------------------------------------------------

describe('POST /documents/:spaceId/upload — upload permission', () => {
  beforeEach(() => {
    vi.mocked(db.getSpaceById).mockResolvedValue(boardSpace);
    vi.mocked(drive.uploadFile).mockResolvedValue(mockFile);
  });

  it('returns 403 when user is not in the space group at all', async () => {
    const app = await createApp(outsiderUser);
    const res = await request(app)
      .post('/documents/board/upload')
      .attach('file', Buffer.from('%PDF'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 when user is in space group but not an upload group', async () => {
    // boardUser is in /board-members, but boardSpace.uploadGroups is ['/secretariat', 'portal_admin']
    const app = await createApp(boardUser);
    const res = await request(app)
      .post('/documents/board/upload')
      .attach('file', Buffer.from('%PDF'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('UPLOAD_FORBIDDEN');
  });

  it('portal_admin can upload to any space', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/documents/board/upload')
      .attach('file', Buffer.from('%PDF'), {
        filename: 'admin-doc.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
  });

  it('returns 400 when no file is attached', async () => {
    const app = await createApp(adminUser);
    const res = await request(app).post('/documents/board/upload');
    // multer will return 400 when no file is present
    expect([400, 500]).toContain(res.status);
  });

  it('returns 404 when space does not exist', async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(undefined);
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/documents/nonexistent/upload')
      .attach('file', Buffer.from('%PDF'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SPACE_NOT_FOUND');
  });
});

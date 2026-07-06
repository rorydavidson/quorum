import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import type { SessionUser, SpaceConfig, SpaceSection } from '@snomed/types';

// ---------------------------------------------------------------------------
// Mock the DB service so tests never touch the filesystem
// ---------------------------------------------------------------------------

vi.mock('../services/db.js', () => ({
  getSpaces: vi.fn(),
  getSpaceById: vi.fn(),
  upsertSpace: vi.fn(),
  deleteSpace: vi.fn(),
  upsertSection: vi.fn(),
  deleteSection: vi.fn(),
  getSectionById: vi.fn(),
  getBackup: vi.fn(),
  restoreBackup: vi.fn(),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  getAuditLogs: vi.fn().mockResolvedValue([]),
  getUsageMetrics: vi.fn(),
  getAllSubscriptions: vi.fn().mockResolvedValue([]),
  default: {},
}));

// Mock the Drive service so snapshot tests never hit Google APIs.
vi.mock('../services/drive.js', () => ({
  copyFileInDrive: vi.fn(),
  verifyFileAncestry: vi.fn(),
}));

vi.mock('../services/notifications.js', () => ({
  notifyActivity: vi.fn().mockResolvedValue(0),
}));

vi.mock('../services/mailer.js', () => ({
  sendMail: vi.fn().mockResolvedValue(true),
  isMailerConfigured: vi.fn().mockReturnValue(true),
}));

import * as db from '../services/db.js';
import * as drive from '../services/drive.js';
import * as mailer from '../services/mailer.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const adminUser: SessionUser = {
  sub: 'admin-1',
  email: 'admin@test.com',
  name: 'Admin User',
  given_name: 'Admin',
  family_name: 'User',
  groups: ['portal_admin'],
};

const regularUser: SessionUser = {
  sub: 'user-1',
  email: 'user@test.com',
  name: 'Regular User',
  given_name: 'Regular',
  family_name: 'User',
  groups: ['board-members'],
};

const mockSpace: SpaceConfig = {
  id: 'board',
  name: 'Board',
  keycloakGroup: '/board-members',
  driveFolderId: 'folder-1',
  hierarchyCategory: 'Board Level',
  uploadGroups: [],
  sortOrder: 0,
  sections: [],
};

const mockSection: SpaceSection = {
  id: 'agenda',
  name: 'Agenda',
  driveFolderId: 'folder-2',
  sortOrder: 0,
};

const validSpacePayload = {
  id: 'board',
  name: 'Board',
  keycloakGroup: '/board-members',
  driveFolderId: 'folder-1',
  hierarchyCategory: 'Board Level',
};

const validSectionPayload = {
  id: 'agenda',
  name: 'Agenda',
  driveFolderId: 'folder-2',
};

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

async function createApp(user?: SessionUser) {
  // Import router here (after mocks are installed)
  const { default: adminRouter } = await import('./admin.js');

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
  // Inject user into session before route handlers run
  if (user) {
    app.use((req, _res, next) => {
      req.session.user = user;
      next();
    });
  }
  app.use('/admin', adminRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Auth / authorisation
// ---------------------------------------------------------------------------

describe('Admin routes — authentication & authorisation', () => {
  it('GET /admin/spaces returns 401 when not authenticated', async () => {
    vi.mocked(db.getSpaces).mockResolvedValue([]);
    const app = await createApp(); // no user
    const res = await request(app).get('/admin/spaces');
    expect(res.status).toBe(401);
  });

  it('GET /admin/spaces returns 403 for non-admin users', async () => {
    const app = await createApp(regularUser);
    const res = await request(app).get('/admin/spaces');
    expect(res.status).toBe(403);
  });

  it('GET /admin/spaces returns 200 for admin users', async () => {
    vi.mocked(db.getSpaces).mockResolvedValue([mockSpace]);
    const app = await createApp(adminUser);
    const res = await request(app).get('/admin/spaces');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST /admin/spaces — Zod validation
// ---------------------------------------------------------------------------

describe('POST /admin/spaces — Zod validation', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp(adminUser);
    vi.mocked(db.getSpaceById).mockResolvedValue(undefined);
    vi.mocked(db.upsertSpace).mockResolvedValue(mockSpace);
  });

  it('returns 400 INVALID_PAYLOAD with empty body', async () => {
    const res = await request(app).post('/admin/spaces').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PAYLOAD');
    expect(res.body.details).toBeInstanceOf(Array);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('returns 400 when "id" is missing', async () => {
    const { id: _id, ...noId } = validSpacePayload;
    const res = await request(app).post('/admin/spaces').send(noId);
    expect(res.status).toBe(400);
    expect(res.body.details.some((d: { path: string }) => d.path === 'id')).toBe(true);
  });

  it('returns 400 when "name" is missing', async () => {
    const { name: _name, ...noName } = validSpacePayload;
    const res = await request(app).post('/admin/spaces').send(noName);
    expect(res.status).toBe(400);
  });

  it('returns 400 when "keycloakGroup" is missing', async () => {
    const { keycloakGroup: _kg, ...noKg } = validSpacePayload;
    const res = await request(app).post('/admin/spaces').send(noKg);
    expect(res.status).toBe(400);
  });

  it('returns 400 when "driveFolderId" is missing', async () => {
    const { driveFolderId: _df, ...noDf } = validSpacePayload;
    const res = await request(app).post('/admin/spaces').send(noDf);
    expect(res.status).toBe(400);
  });

  it('returns 400 when "hierarchyCategory" is missing', async () => {
    const { hierarchyCategory: _hc, ...noHc } = validSpacePayload;
    const res = await request(app).post('/admin/spaces').send(noHc);
    expect(res.status).toBe(400);
  });

  it('returns 400 when "name" exceeds 200 characters', async () => {
    const res = await request(app)
      .post('/admin/spaces')
      .send({ ...validSpacePayload, name: 'x'.repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.details.some((d: { path: string }) => d.path === 'name')).toBe(true);
  });

  it('returns 400 when "sortOrder" is negative', async () => {
    const res = await request(app)
      .post('/admin/spaces')
      .send({ ...validSpacePayload, sortOrder: -1 });
    expect(res.status).toBe(400);
    expect(res.body.details.some((d: { path: string }) => d.path === 'sortOrder')).toBe(true);
  });

  it('returns 400 when "sortOrder" is not an integer', async () => {
    const res = await request(app)
      .post('/admin/spaces')
      .send({ ...validSpacePayload, sortOrder: 1.5 });
    expect(res.status).toBe(400);
  });

  it('returns 201 with a valid payload', async () => {
    const res = await request(app).post('/admin/spaces').send(validSpacePayload);
    expect(res.status).toBe(201);
  });

  it('returns 409 when space ID already exists', async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(mockSpace); // already exists
    const res = await request(app).post('/admin/spaces').send(validSpacePayload);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('passes optional fields (calendarId, icalUrl, sortOrder, uploadGroups)', async () => {
    const res = await request(app)
      .post('/admin/spaces')
      .send({
        ...validSpacePayload,
        calendarId: 'cal-123',
        icalUrl: 'https://example.com/cal.ics',
        sortOrder: 5,
        uploadGroups: ['/secretariat'],
      });
    expect(res.status).toBe(201);
    expect(db.upsertSpace).toHaveBeenCalledWith(
      'board',
      expect.objectContaining({ calendarId: 'cal-123', sortOrder: 5 })
    );
  });
});

// ---------------------------------------------------------------------------
// PUT /admin/spaces/:id — Zod validation
// ---------------------------------------------------------------------------

describe('PUT /admin/spaces/:id — Zod validation', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp(adminUser);
    vi.mocked(db.upsertSpace).mockResolvedValue(mockSpace);
  });

  it('returns 400 with empty body', async () => {
    const res = await request(app).put('/admin/spaces/board').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PAYLOAD');
  });

  it('returns 200 with valid payload', async () => {
    const { id: _id, ...updatePayload } = validSpacePayload; // PUT has no id in body
    const res = await request(app).put('/admin/spaces/board').send(updatePayload);
    expect(res.status).toBe(200);
    expect(db.upsertSpace).toHaveBeenCalledWith('board', expect.objectContaining({ name: 'Board' }));
  });
});

// ---------------------------------------------------------------------------
// DELETE /admin/spaces/:id
// ---------------------------------------------------------------------------

describe('DELETE /admin/spaces/:id', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp(adminUser);
  });

  it('returns 404 when space does not exist', async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(undefined);
    const res = await request(app).delete('/admin/spaces/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SPACE_NOT_FOUND');
  });

  it('returns 204 when space is deleted', async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(mockSpace);
    vi.mocked(db.deleteSpace).mockResolvedValue();
    const res = await request(app).delete('/admin/spaces/board');
    expect(res.status).toBe(204);
    expect(db.deleteSpace).toHaveBeenCalledWith('board');
  });
});

// ---------------------------------------------------------------------------
// GET /admin/spaces/:id
// ---------------------------------------------------------------------------

describe('GET /admin/spaces/:id', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp(adminUser);
  });

  it('returns 404 when space not found', async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(undefined);
    const res = await request(app).get('/admin/spaces/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns 200 with space data', async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(mockSpace);
    const res = await request(app).get('/admin/spaces/board');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('board');
  });
});

// ---------------------------------------------------------------------------
// POST /admin/spaces/:spaceId/sections — Zod validation
// ---------------------------------------------------------------------------

describe('POST /admin/spaces/:spaceId/sections — Zod validation', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp(adminUser);
    vi.mocked(db.getSpaceById).mockResolvedValue(mockSpace);
    vi.mocked(db.getSectionById).mockResolvedValue(undefined);
    vi.mocked(db.upsertSection).mockResolvedValue(mockSection);
  });

  it('returns 400 with empty body', async () => {
    const res = await request(app).post('/admin/spaces/board/sections').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PAYLOAD');
  });

  it('returns 400 when "driveFolderId" is missing', async () => {
    const { driveFolderId: _df, ...noDf } = validSectionPayload;
    const res = await request(app).post('/admin/spaces/board/sections').send(noDf);
    expect(res.status).toBe(400);
  });

  it('returns 400 when description exceeds 1000 characters', async () => {
    const res = await request(app)
      .post('/admin/spaces/board/sections')
      .send({ ...validSectionPayload, description: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
  });

  it('returns 201 with valid payload', async () => {
    const res = await request(app)
      .post('/admin/spaces/board/sections')
      .send(validSectionPayload);
    expect(res.status).toBe(201);
  });

  it('returns 404 when space does not exist', async () => {
    vi.mocked(db.getSpaceById).mockResolvedValue(undefined);
    const res = await request(app)
      .post('/admin/spaces/nonexistent/sections')
      .send(validSectionPayload);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SPACE_NOT_FOUND');
  });

  it('returns 409 when section ID already exists in the space', async () => {
    vi.mocked(db.getSectionById).mockResolvedValue(mockSection);
    const res = await request(app)
      .post('/admin/spaces/board/sections')
      .send(validSectionPayload);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });
});

// ---------------------------------------------------------------------------
// PUT /admin/spaces/:spaceId/sections/:sectionId
// ---------------------------------------------------------------------------

describe('PUT /admin/spaces/:spaceId/sections/:sectionId — Zod validation', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp(adminUser);
    vi.mocked(db.getSpaceById).mockResolvedValue(mockSpace);
    vi.mocked(db.upsertSection).mockResolvedValue(mockSection);
  });

  it('returns 400 with empty body', async () => {
    const res = await request(app).put('/admin/spaces/board/sections/agenda').send({});
    expect(res.status).toBe(400);
  });

  it('returns 200 with valid payload', async () => {
    const { id: _id, ...updatePayload } = validSectionPayload;
    const res = await request(app)
      .put('/admin/spaces/board/sections/agenda')
      .send(updatePayload);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /admin/spaces/:spaceId/sections/:sectionId
// ---------------------------------------------------------------------------

describe('DELETE /admin/spaces/:spaceId/sections/:sectionId', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp(adminUser);
    vi.mocked(db.getSpaceById).mockResolvedValue(mockSpace);
  });

  it('returns 404 when section not found', async () => {
    vi.mocked(db.getSectionById).mockResolvedValue(undefined);
    const res = await request(app).delete('/admin/spaces/board/sections/missing');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SECTION_NOT_FOUND');
  });

  it('returns 204 on success', async () => {
    vi.mocked(db.getSectionById).mockResolvedValue(mockSection);
    vi.mocked(db.deleteSection).mockResolvedValue();
    const res = await request(app).delete('/admin/spaces/board/sections/agenda');
    expect(res.status).toBe(204);
    expect(db.deleteSection).toHaveBeenCalledWith('board', 'agenda');
  });
});

// ---------------------------------------------------------------------------
// Official Record snapshot — POST /admin/spaces/:spaceId/files/:fileId/snapshot
// ---------------------------------------------------------------------------

describe('Admin routes — Official Record snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getSpaceById).mockResolvedValue(mockSpace);
    vi.mocked(drive.verifyFileAncestry).mockResolvedValue(true);
    vi.mocked(drive.copyFileInDrive).mockResolvedValue({
      id: 'copy-1',
      name: '_OFFICIAL_RECORD_2026-07-04_Report.pdf',
      mimeType: 'application/pdf',
      size: 0.5,
      createdTime: '2026-07-04T00:00:00Z',
      modifiedTime: '2026-07-04T00:00:00Z',
      isOfficialRecord: true,
    });
  });

  it('copies the file when it belongs to the space', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/admin/spaces/board/files/file-9/snapshot')
      .send({ fileName: 'Report.pdf' });

    expect(res.status).toBe(201);
    expect(drive.verifyFileAncestry).toHaveBeenCalledWith('file-9', 'folder-1');
    expect(drive.copyFileInDrive).toHaveBeenCalled();
  });

  it('rejects with 403 when the file is outside the space tree', async () => {
    vi.mocked(drive.verifyFileAncestry).mockResolvedValue(false);
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/admin/spaces/board/files/foreign-file/snapshot')
      .send({ fileName: 'Report.pdf' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FILE_OUTSIDE_SPACE');
    expect(drive.copyFileInDrive).not.toHaveBeenCalled();
  });

  it('rejects re-snapshotting an existing Official Record', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/admin/spaces/board/files/file-9/snapshot')
      .send({ fileName: '_OFFICIAL_RECORD_2025-01-01_Report.pdf' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ALREADY_OFFICIAL_RECORD');
    expect(drive.copyFileInDrive).not.toHaveBeenCalled();
  });

  it('requires admin', async () => {
    const app = await createApp(regularUser);
    const res = await request(app)
      .post('/admin/spaces/board/files/file-9/snapshot')
      .send({ fileName: 'Report.pdf' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Usage metrics
// ---------------------------------------------------------------------------

describe('Admin routes — usage metrics', () => {
  const bundle = {
    generatedAt: '2026-07-04T00:00:00Z',
    totals: { views: 10, uniqueUsers: 3 },
    today: { views: 2, uniqueUsers: 2 },
    last7d: { views: 6, uniqueUsers: 3 },
    last30d: { views: 10, uniqueUsers: 3 },
    daily: [],
    perSpace: [{ spaceId: 'board', views: 5 }],
    topPaths: [{ path: '/dashboard', views: 4 }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getUsageMetrics).mockResolvedValue(bundle);
  });

  it('returns the metrics bundle for an admin', async () => {
    const app = await createApp(adminUser);
    const res = await request(app).get('/admin/metrics');
    expect(res.status).toBe(200);
    expect(res.body.totals.uniqueUsers).toBe(3);
    expect(res.body.perSpace[0].spaceId).toBe('board');
  });

  it('is forbidden for non-admins', async () => {
    const app = await createApp(regularUser);
    const res = await request(app).get('/admin/metrics');
    expect(res.status).toBe(403);
    expect(db.getUsageMetrics).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Notifications — subscriptions listing & test email
// ---------------------------------------------------------------------------

describe('Admin routes — notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mailer.sendMail).mockResolvedValue(true);
    vi.mocked(mailer.isMailerConfigured).mockReturnValue(true);
    vi.mocked(db.getAllSubscriptions).mockResolvedValue([
      { userId: 'u1', spaceId: 'board', email: 'member@example.com', createdAt: '2026-07-01 09:00:00' },
    ]);
  });

  it('lists all subscriptions for an admin', async () => {
    const app = await createApp(adminUser);
    const res = await request(app).get('/admin/subscriptions');
    expect(res.status).toBe(200);
    expect(res.body.subscriptions).toHaveLength(1);
    expect(res.body.subscriptions[0].email).toBe('member@example.com');
  });

  it('subscriptions listing is admin-only', async () => {
    const app = await createApp(regularUser);
    const res = await request(app).get('/admin/subscriptions');
    expect(res.status).toBe(403);
  });

  it('sends a test email to the calling admin', async () => {
    const app = await createApp(adminUser);
    const res = await request(app).post('/admin/notifications/test');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sent: true, smtpConfigured: true, to: adminUser.email });
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: adminUser.email, subject: expect.stringContaining('Test notification') }),
    );
  });

  it('reports mock mode when SMTP is not configured', async () => {
    vi.mocked(mailer.isMailerConfigured).mockReturnValue(false);
    const app = await createApp(adminUser);
    const res = await request(app).post('/admin/notifications/test');
    expect(res.status).toBe(200);
    expect(res.body.smtpConfigured).toBe(false);
  });

  it('test email is admin-only', async () => {
    const app = await createApp(regularUser);
    const res = await request(app).post('/admin/notifications/test');
    expect(res.status).toBe(403);
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Audit logs — filtering, pagination & CSV export
// ---------------------------------------------------------------------------

describe('Admin routes — audit logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getAuditLogs).mockResolvedValue([]);
  });

  it('passes parsed filters through to getAuditLogs', async () => {
    const app = await createApp(adminUser);
    const res = await request(app).get(
      '/admin/audit-logs?action=DELETE_SPACE&entityType=SPACE&user=admin&from=2026-01-01&to=2026-12-31&limit=50&offset=10',
    );

    expect(res.status).toBe(200);
    expect(db.getAuditLogs).toHaveBeenCalledWith({
      action: 'DELETE_SPACE',
      entityType: 'SPACE',
      user: 'admin',
      from: '2026-01-01',
      to: '2026-12-31',
      limit: 50,
      offset: 10,
    });
  });

  it('treats empty query params as no filter', async () => {
    const app = await createApp(adminUser);
    const res = await request(app).get('/admin/audit-logs?action=&user=');
    expect(res.status).toBe(200);
    expect(db.getAuditLogs).toHaveBeenCalledWith({});
  });

  it('rejects a malformed date with 400', async () => {
    const app = await createApp(adminUser);
    const res = await request(app).get('/admin/audit-logs?from=07-04-2026');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PAYLOAD');
    expect(db.getAuditLogs).not.toHaveBeenCalled();
  });

  it('exports CSV with headers and RFC-4180 escaping', async () => {
    vi.mocked(db.getAuditLogs).mockResolvedValue([
      {
        id: 1,
        timestamp: '2026-07-04 09:00:00',
        userId: 'u1',
        userName: 'Ada Lovelace',
        action: 'UPLOAD_DOCUMENT',
        entityType: 'DOCUMENT',
        entityId: 'file-1',
        details: '{"name":"Q1, Report","note":"has \\"quotes\\""}',
      },
    ]);

    const app = await createApp(adminUser);
    const res = await request(app).get('/admin/audit-logs/export');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text.split('\r\n')[0]).toBe(
      'timestamp,userName,userId,action,entityType,entityId,details',
    );
    // details contains a comma and quotes → must be wrapped and quotes doubled
    expect(res.text).toContain('"{""name"":""Q1, Report""');
  });

  it('export requires admin', async () => {
    const app = await createApp(regularUser);
    const res = await request(app).get('/admin/audit-logs/export');
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// icalUrl validation — POST /admin/spaces
// ---------------------------------------------------------------------------

describe('Admin routes — icalUrl scheme validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getSpaceById).mockResolvedValue(undefined);
    vi.mocked(db.upsertSpace).mockResolvedValue(mockSpace);
  });

  it('accepts an https icalUrl', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/admin/spaces')
      .send({ ...validSpacePayload, icalUrl: 'https://calendar.example/feed.ics' });
    expect(res.status).toBe(201);
  });

  it('rejects a non-https (http) icalUrl', async () => {
    const app = await createApp(adminUser);
    const res = await request(app)
      .post('/admin/spaces')
      .send({ ...validSpacePayload, icalUrl: 'http://169.254.169.254/latest/meta-data/' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PAYLOAD');
    expect(db.upsertSpace).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from 'vitest';
import { mimeTypeLabel } from './DocumentTypeIcon';

describe('mimeTypeLabel', () => {
  it.each([
    ['application/vnd.google-apps.folder', 'Folder'],
    ['application/pdf', 'PDF'],
    ['application/vnd.google-apps.document', 'Google Doc'],
    ['application/vnd.google-apps.spreadsheet', 'Google Sheet'],
    ['application/vnd.google-apps.presentation', 'Google Slides'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'PowerPoint'],
    ['image/png', 'Image'],
    ['application/octet-stream', 'File'],
  ])('labels %s as %s', (mime, label) => {
    expect(mimeTypeLabel(mime)).toBe(label);
  });
});

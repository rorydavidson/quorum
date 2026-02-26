import {
  FileText,
  FileSpreadsheet,
  Presentation,
  File,
  Image,
  Archive,
} from 'lucide-react';

interface Props {
  mimeType: string;
  size?: number;
  className?: string;
}

export function DocumentTypeIcon({ mimeType, size = 18, className }: Props) {
  if (
    mimeType === 'application/pdf' ||
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType === 'application/msword' ||
    mimeType.includes('wordprocessingml')
  ) {
    return <FileText size={size} className={className} />;
  }

  if (
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType.includes('spreadsheetml')
  ) {
    return <FileSpreadsheet size={size} className={className} />;
  }

  if (
    mimeType === 'application/vnd.google-apps.presentation' ||
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType.includes('presentationml')
  ) {
    return <Presentation size={size} className={className} />;
  }

  if (mimeType.startsWith('image/')) {
    return <Image size={size} className={className} />;
  }

  if (mimeType === 'application/zip' || mimeType === 'application/x-tar') {
    return <Archive size={size} className={className} />;
  }

  return <File size={size} className={className} />;
}

export function mimeTypeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'application/vnd.google-apps.document') return 'Google Doc';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Google Sheet';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'Google Slides';
  if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') return 'Word';
  if (mimeType.includes('spreadsheetml') || mimeType === 'application/vnd.ms-excel') return 'Excel';
  if (mimeType.includes('presentationml') || mimeType === 'application/vnd.ms-powerpoint') return 'PowerPoint';
  if (mimeType.startsWith('image/')) return 'Image';
  return 'File';
}

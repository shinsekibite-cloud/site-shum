/** Client-safe document MIME helpers (no Node fs). */

export function isOfficeDoc(mimeType: string, fileName = ''): boolean {
  const lower = fileName.toLowerCase();
  return (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.ms-word' ||
    lower.endsWith('.doc') ||
    lower.endsWith('.docx')
  );
}

export function isViewableInBrowser(mimeType: string, fileName = ''): boolean {
  return (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/') ||
    mimeType === 'text/plain' ||
    isOfficeDoc(mimeType, fileName)
  );
}

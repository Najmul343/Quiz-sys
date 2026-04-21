import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDirectImageUrl(url: string) {
  if (!url) return '';
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return '';

  if (trimmedUrl.startsWith('data:image/')) {
    return trimmedUrl;
  }

  // Handle Google Drive
  if (trimmedUrl.includes('drive.google.com')) {
    const fileIdMatch = trimmedUrl.match(/\/d\/([^/]+)/) || trimmedUrl.match(/id=([^&]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      return `/api/image-proxy?url=${encodeURIComponent(`https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`)}`;
    }
  }

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return `/api/image-proxy?url=${encodeURIComponent(trimmedUrl)}`;
  }

  return trimmedUrl;
}

export function isLikelyImageUrl(url: string) {
  const normalized = (url || '').trim().toLowerCase();
  return (
    normalized.startsWith('data:image/') ||
    normalized.includes('drive.google.com') ||
    /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/.test(normalized)
  );
}

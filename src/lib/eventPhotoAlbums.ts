import type { DayLink } from '../types';

export function isGoogleDriveFolderUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'drive.google.com' && !url.username && !url.password
      && (/^\/drive\/(?:u\/\d+\/)?folders\/[^/]+\/?$/.test(url.pathname)
        || ['/open', '/folderview'].includes(url.pathname) && Boolean(url.searchParams.get('id')));
  } catch { return false; }
}

export function getEventPhotoAlbums(days: DayLink[]) {
  return days.filter(item => item.day.trim() && isGoogleDriveFolderUrl(item.driveLink))
    .map(item => ({ ...item, day: item.day.trim(), driveLink: item.driveLink.trim() }));
}

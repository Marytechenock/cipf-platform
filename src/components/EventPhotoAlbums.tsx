import { useEffect, useState } from 'react';
import { ExternalLink, FolderOpen } from 'lucide-react';
import { api } from '../lib/api';
import { getEventPhotoAlbums } from '../lib/eventPhotoAlbums';
import type { DayLink } from '../types';

export default function EventPhotoAlbums() {
  const [days, setDays] = useState<DayLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const albums = getEventPhotoAlbums(days);
  useEffect(() => {
    const controller = new AbortController();
    api.getGalleryDayLinks(controller.signal).then(data => {
      if (!controller.signal.aborted) setDays(data);
    }).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load event photo albums.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return <section className="space-y-4" aria-labelledby="event-photo-albums">
    <div><h2 id="event-photo-albums" className="text-xl font-bold text-gray-950">Event Gallery</h2><p className="mt-1 text-sm text-gray-500">Explore photos from each day of the event.</p></div>
    {loading ? <p role="status" className="text-sm text-gray-500">Loading photo albums…</p> : error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : !albums.length ? <p className="text-sm text-gray-500">No photo albums have been added yet.</p> : <div className="grid gap-3 sm:grid-cols-3">
      {albums.map(album => <article key={album.id} className="flex flex-col items-start rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2"><FolderOpen className="h-5 w-5 text-[#B8922A]" aria-hidden="true" />
        <h3 className="text-sm font-bold text-gray-950">{album.day}</h3></div>
        <p className="mb-2 mt-1 text-xs text-gray-500">Open the photo album on Google Drive.</p>
        <a href={album.driveLink} target="_blank" rel="noopener noreferrer" aria-label={`View ${album.day} photos on Google Drive`} className="mt-auto inline-flex min-h-9 items-center gap-2 rounded-sm py-2 text-sm font-normal text-[#9A6A0A] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B8922A]">View photos <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" /></a>
      </article>)}
    </div>}
  </section>;
}

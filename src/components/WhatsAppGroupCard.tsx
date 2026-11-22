import { ExternalLink } from 'lucide-react';
import whatsappIcon from '../../assets/images/whatsapp.svg';
import { eventWhatsAppGroupUrl } from '../config/eventWhatsAppGroup';

export default function WhatsAppGroupCard({ compact = false }: { compact?: boolean }) {
  if (!eventWhatsAppGroupUrl) return null;

  return (
    <section aria-label="Official event WhatsApp group" className={`rounded-2xl border border-[#B8922A]/25 bg-amber-50/60 p-5 ${compact ? 'mt-6 text-center' : 'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:p-6'}`}>
      <div className={compact ? '' : 'flex items-start gap-3'}>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#B8922A] ${compact ? 'mx-auto mb-3' : ''}`} aria-hidden="true">
          <img src={whatsappIcon} alt="" className="h-6 w-6 brightness-0 invert" />
        </span>
        <div>
          <h2 className="text-base font-bold text-slate-950">Join the official event WhatsApp group</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">Get event updates, announcements, and reminders.</p>
        </div>
      </div>
      <a href={eventWhatsAppGroupUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#B8922A] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#8B6914] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B8922A] ${compact ? 'mt-4 w-full' : ''}`}>
        Join WhatsApp Group <ExternalLink className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </section>
  );
}

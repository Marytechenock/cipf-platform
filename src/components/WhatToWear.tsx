import { Award, Calendar, ExternalLink, Mail, MapPin, Phone } from 'lucide-react';
import dressCodePoster from '../../assets/images/indaba-expo-dress-code.jpeg';
import { eventDressCode, getDressCodeContext } from '../config/dressCode';

export default function WhatToWear() {
  return (
    <section className="col-span-full space-y-6 animate-fadeIn" aria-labelledby="dress-code-title">
      <header className="space-y-3">
        <h2 id="dress-code-title" className="flex items-center gap-2 text-xl font-black tracking-tight text-gray-900">
          <Award className="h-6 w-6 text-[#B8922A]" aria-hidden="true" /> What to Wear
        </h2>
        <p className="text-sm font-semibold text-gray-600">{eventDressCode.eventName}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#8B6914]">
          <span className="flex items-center gap-2"><Calendar className="h-4 w-4" aria-hidden="true" />{eventDressCode.dates}</span>
          <span className="flex items-center gap-2"><MapPin className="h-4 w-4" aria-hidden="true" />{eventDressCode.venue}</span>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          {eventDressCode.days.map(({ day, conference, details }) => (
            <article key={day} id={`wear-day-${day}`} className="overflow-hidden rounded-2xl border border-[#B8922A]/25 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-[#B8922A]/15 bg-amber-50/70 px-5 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8B6914] text-sm font-bold text-white" aria-hidden="true">{day}</span>
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#8B6914]">Day {day} · Conference dress code</h3>
              </div>
              <div className="space-y-4 p-5">
                <p className="text-base font-bold leading-relaxed text-gray-900">{conference}</p>
                {details.length > 0 && (
                  <dl className="space-y-4 border-t border-gray-100 pt-4">
                    {details.map(({ label, description }) => (
                      <div key={label}>
                        <dt className="text-xs font-bold uppercase tracking-wide text-[#8B6914]">{label}</dt>
                        <dd className="mt-1 text-sm leading-relaxed text-gray-600">{description}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </article>
          ))}

          <aside className="rounded-2xl border border-gray-200 bg-white p-5 text-sm shadow-sm" aria-label="Dress code enquiries">
            <h3 className="font-bold text-gray-900">For more information</h3>
            <div className="mt-3 flex flex-col items-start gap-3">
              <a href={`tel:${eventDressCode.contact.telephone}`} className="flex items-center gap-2 text-[#8B6914] hover:underline"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" />{eventDressCode.contact.name} · {eventDressCode.contact.phone}</a>
              <a href={`mailto:${eventDressCode.contact.email}`} className="flex items-center gap-2 break-all text-[#8B6914] hover:underline"><Mail className="h-4 w-4 shrink-0" aria-hidden="true" />{eventDressCode.contact.email}</a>
            </div>
          </aside>
        </div>

        <figure className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-[#B8922A]/25 bg-white shadow-sm">
          <a href={dressCodePoster} target="_blank" rel="noopener noreferrer" aria-label="Open the full dress code poster in a new tab">
            <img src={dressCodePoster} alt={`Official Indaba and Expo dress code poster. ${getDressCodeContext()}`} className="h-auto w-full" width={1024} height={1280} />
          </a>
          <figcaption className="flex items-center justify-center gap-2 px-4 py-3 text-xs text-gray-500"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Select the poster to view it in full.</figcaption>
        </figure>
      </div>
    </section>
  );
}

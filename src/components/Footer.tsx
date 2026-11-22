import { Shield } from 'lucide-react';
import logo from '../../assets/images/marytechsolutions-cropped.png';
import whatsappIcon from '../../assets/images/whatsapp.svg';
import { eventWhatsAppGroupUrl } from '../config/eventWhatsAppGroup';

export default function Footer({ showWhatsAppGroup = false }: { showWhatsAppGroup?: boolean }) {
  const currentYear = new Date().getFullYear();

  return (
      <footer className="w-full bg-[#111111] text-gray-400 border-t border-[#B8922A]/20">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

          {/* Core Layout */}
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row text-center md:text-left">

            {/* Logo and advisor tagline */}
            <div className="flex flex-col md:flex-row items-center gap-4">
              <img
                  src={logo}
                  alt="Marytechenock Solutions Logo"
                  className="h-11 w-11 object-contain sm:h-12 sm:w-12"
              />
              <div>
                <div className="flex items-center justify-center md:justify-start gap-1.5">
                  <span className="text-sm font-bold text-white tracking-wide">Marytechenock Solutions</span>
                  {/*<span className="rounded-full bg-gradient-to-r from-amber-500/10 to-amber-600/15 border border-[#FFD700]/30 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#FFD700]">Technology Partner</span>*/}
                </div>
                <p className="text-xs text-gray-400 mt-1 font-semibold tracking-tight">
                  Delivering premium enterprise solutions
                </p>
              </div>
            </div>

            {/* Copyrights and info */}
            <div className="flex flex-col items-center md:items-end">
              {/*<span className="text-xs font-bold text-white tracking-widest uppercase mb-1">Strategic Marketing & Business Growth Indaba & Expo</span>*/}
              {/*<p className="text-[11px] text-gray-400">*/}
              {/*  Official Program Event Management System. Strictly authorized for registered attendees.*/}
              {/*</p>*/}
              {/*{showWhatsAppGroup && eventWhatsAppGroupUrl && (*/}
              {/*  <a href={eventWhatsAppGroupUrl} target="_blank" rel="noopener noreferrer"*/}
              {/*    className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#B8922A]/50 px-4 py-2.5 text-xs font-semibold text-[#FFD700] transition-colors hover:bg-[#B8922A]/15 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B8922A]">*/}
              {/*    <img src={whatsappIcon} alt="" className="h-5 w-5 brightness-0 invert" />*/}
              {/*    Join WhatsApp Group<span className="sr-only"> (opens in a new tab)</span>*/}
              {/*  </a>*/}
              {/*)}*/}
            </div>
          </div>

          {/* Bottm Banner Row */}
          <div className="mt-8 border-t border-gray-800/60 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-[10px] text-gray-500 font-semibold tracking-wider">
            <p>&copy; {currentYear} Construction Industry Pension Fund. All Rights Reserved.</p>
            <a
              href="https://www.marytechenock.com"
              className="flex items-center gap-1 rounded text-[#FFD700] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FFD700]"
            >
              <Shield className="h-3 w-3" aria-hidden="true" /> Developed by Marytechenock Solutions
            </a>
          </div>

        </div>
      </footer>
  );
}

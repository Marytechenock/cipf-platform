import { useEffect, useRef } from 'react';
import whatsappIcon from '@/assets/images/whatsapp.svg';
import { checkinSupportContact, votingSupportContacts } from '../../config/supportContacts';

export default function WhatsAppSupport({ floating = false, topic = 'checkin' }: { floating?: boolean; topic?: 'checkin' | 'voting' }) {
  const pickerRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!floating || topic !== 'voting') return;

    const closeOutside = (event: PointerEvent) => {
      const picker = pickerRef.current;
      if (picker?.open && event.target instanceof Node && !picker.contains(event.target)) {
        picker.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const picker = pickerRef.current;
      if (event.key === 'Escape' && picker?.open) {
        picker.open = false;
        picker.querySelector('summary')?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [floating, topic]);

  if (topic === 'voting') {
    const contactLinks = (
      <div className="checkin-whatsapp-options">
        <h2>Voting support</h2>
        <p>Choose a WhatsApp contact.</p>
        {votingSupportContacts.map(contact => (
          <a key={contact.href} href={contact.href} target="_blank" rel="noopener noreferrer"
            aria-label={`Contact voting support on WhatsApp at ${contact.number} (opens in a new tab)`}>
            <img src={whatsappIcon} alt="" width={20} height={20} />
            {contact.number}
          </a>
        ))}
      </div>
    );

    return floating ? (
      <details ref={pickerRef} className="checkin-whatsapp-picker">
        <summary className="checkin-whatsapp-float" aria-label="Contact voting support on WhatsApp" title="Choose a voting support contact">
          <img src={whatsappIcon} alt="" width={32} height={32} />
        </summary>
        {contactLinks}
      </details>
    ) : contactLinks;
  }

  return (
    <a
      href={checkinSupportContact.href}
      target="_blank"
      rel="noopener noreferrer"
      className={floating ? 'checkin-whatsapp-float' : 'checkin-whatsapp-contact'}
      aria-label={`Contact check-in support on WhatsApp at ${checkinSupportContact.number} (opens in a new tab)`}
      title={`WhatsApp support: ${checkinSupportContact.number}`}
    >
      <img src={whatsappIcon} alt="" width={floating ? 32 : 24} height={floating ? 32 : 24} />
      {!floating && <span><strong>Chat on WhatsApp</strong><span>{checkinSupportContact.number}</span></span>}
    </a>
  );
}

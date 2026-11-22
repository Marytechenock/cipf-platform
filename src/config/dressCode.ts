// Shared by the What to Wear page and the event assistant.
export const eventDressCode = {
  eventName: 'Strategic Marketing & Business Growth Indaba and Expo',
  dates: '19–22 October 2026',
  venue: 'Victoria Falls Safari Lodge',
  contact: { name: 'Rudo', phone: '+263 787 933 120', telephone: '+263787933120', email: 'events@mazim.co.zw' },
  days: [
    { day: 1, conference: 'Own branded casual', details: [] },
    {
      day: 2,
      conference: 'Khaki chinos or trousers and Delta white shirts',
      details: [
        { label: 'AGM', description: 'Carry your MAZ blazer for the AGM.' },
        { label: 'Presidential dinner', description: 'Ethnic dress code.' }
      ]
    },
    {
      day: 3,
      conference: 'Econet denim shirt and denim jeans',
      details: [{ label: 'Night event: boat cruise + dinner cruise', description: 'Safari dress code.' }]
    }
  ]
};

export function getDressCodeContext() {
  return eventDressCode.days.map(({ day, conference, details }) => [
    `Day ${day} conference: ${conference}.`,
    ...details.map(({ label, description }) => `${label}: ${description}`)
  ].join('\n')).join('\n\n');
}

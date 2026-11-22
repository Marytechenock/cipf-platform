import type { Session } from '../types';

type ProgrammeItem = Omit<Session, 'id' | 'category'>;

const conventionProgrammeItems: ProgrammeItem[] = [
  {
    day: 1,
    dayLabel: 'Day 1 · Monday 19 October 2026',
    time: '09:00',
    topic: 'Delegates Travel',
    facilitator: 'Individual',
    venue: 'Travel to venue',
    type: 'break'
  },
  {
    day: 1,
    dayLabel: 'Day 1 · Monday 19 October 2026',
    time: '09:00',
    topic: 'Optional Activities: Tennis, City Tour, Golf and Swimming',
    facilitator: 'Delegates',
    venue: 'Venue activity points',
    type: 'social'
  },
  {
    day: 1,
    dayLabel: 'Day 1 · Monday 19 October 2026',
    time: '13:00',
    topic: 'Lunch and Hotel Check-in',
    facilitator: 'All Delegates',
    venue: 'Hotel / Dining Area',
    type: 'break'
  },
  {
    day: 1,
    dayLabel: 'Day 1 · Monday 19 October 2026',
    time: '16:30 - 18:00',
    topic: 'Session 1: Opening Remarks, Welcome Remarks and Introduction',
    facilitator: 'Opening Remarks: Dr Gillian Rusike; Welcome Remarks and Introduction: Dr Miriam Mugwati',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 1,
    dayLabel: 'Day 1 · Monday 19 October 2026',
    time: '16:30 - 18:00',
    topic: 'Session 2: SoMCIR',
    facilitator: 'Patson Gatsura',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 1,
    dayLabel: 'Day 1 · Monday 19 October 2026',
    time: '16:30 - 18:00',
    topic: 'Session 3: The Future Consumer',
    facilitator: 'Ivan Moroke',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 1,
    dayLabel: 'Day 1 · Monday 19 October 2026',
    time: '18:30',
    topic: 'Dinner Opening Night: Networking Night',
    facilitator: 'All Delegates',
    venue: 'Dining Area',
    type: 'social'
  },
  {
    day: 2,
    dayLabel: 'Day 2 · Tuesday 20 October 2026',
    time: '08:30 - 09:15',
    topic: 'Building High-Performance Marketing Teams',
    facilitator: 'Dr Lawrence Kupika',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 2,
    dayLabel: 'Day 2 · Tuesday 20 October 2026',
    time: '09:30 - 10:15',
    topic: 'The New Money: Growing Markets Through Inclusion and Reaching the Next Billion Customers',
    facilitator: 'Gerald Chinogara',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 2,
    dayLabel: 'Day 2 · Tuesday 20 October 2026',
    time: '10:15 - 10:30',
    topic: 'Tea Break',
    facilitator: 'All Delegates',
    venue: 'Dining Area',
    type: 'break'
  },
  {
    day: 2,
    dayLabel: 'Day 2 · Tuesday 20 October 2026',
    time: '10:30 - 11:00',
    topic: 'Session 4: Official Opening of the Conference',
    facilitator: 'The Minister of Industry and Commerce',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 2,
    dayLabel: 'Day 2 · Tuesday 20 October 2026',
    time: '11:30 - 12:30',
    topic: 'Session 5: Keynote Address - Marketing for Competitive Growth',
    facilitator: 'Rumbidzai Hondora',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 2,
    dayLabel: 'Day 2 · Tuesday 20 October 2026',
    time: '12:30 - 13:00',
    topic: 'Session 6: Marketing Zimbabwe - Building Competitive Brands for Global Markets',
    facilitator: 'Dennis Goguya',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 2,
    dayLabel: 'Day 2 · Tuesday 20 October 2026',
    time: '13:00 - 14:00',
    topic: 'Lunch Break',
    facilitator: 'All Delegates',
    venue: 'Dining Area',
    type: 'break'
  },
  {
    day: 2,
    dayLabel: 'Day 2 · Tuesday 20 October 2026',
    time: '14:00 - 15:00',
    topic: 'Panel Session 1: The Competitiveness Agenda',
    facilitator: 'Mthulis Ncube, Admire Ndumo, Daniel Chipato, Sebastian Musendo',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 2,
    dayLabel: 'Day 2 · Tuesday 20 October 2026',
    time: '15:00 - 16:00',
    topic: 'Panel Session 2: The Marketing Value Chain - Strengthening the Industry that Builds Brands',
    facilitator: 'Karen Gondo, Manatsa Gaka',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 2,
    dayLabel: 'Day 2 · Tuesday 20 October 2026',
    time: '16:30',
    topic: 'Optional Activities',
    facilitator: 'All Delegates',
    venue: 'Venue activity points',
    type: 'social'
  },
  {
    day: 2,
    dayLabel: 'Day 2 · Tuesday 20 October 2026',
    time: '18:00',
    topic: 'MAZ Presidents Dinner and New MAZ Fellow Inauguration',
    facilitator: 'All Delegates',
    venue: 'Dinner Venue',
    type: 'social'
  },
  {
    day: 3,
    dayLabel: 'Day 3 · Wednesday 21 October 2026',
    time: '07:00 - 08:00',
    topic: 'Breakfast',
    facilitator: 'All Delegates',
    venue: 'Dining Area',
    type: 'break'
  },
  {
    day: 3,
    dayLabel: 'Day 3 · Wednesday 21 October 2026',
    time: '08:30 - 09:15',
    topic: 'Session 8: Data Protection and Data Governance Beyond Compliance',
    facilitator: 'Dr G K Machengete',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 3,
    dayLabel: 'Day 3 · Wednesday 21 October 2026',
    time: '09:15 - 10:00',
    topic: 'Session 9: Measuring What Matters',
    facilitator: 'Ryan Sauer',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 3,
    dayLabel: 'Day 3 · Wednesday 21 October 2026',
    time: '10:00 - 10:30',
    topic: 'Tea Break',
    facilitator: 'All Delegates',
    venue: 'Dining Area',
    type: 'break'
  },
  {
    day: 3,
    dayLabel: 'Day 3 · Wednesday 21 October 2026',
    time: '10:30 - 11:15',
    topic: 'Session 10: The Future CMO or Industry and Academia Interface',
    facilitator: 'Forbes Makuza, Izzi Ndhlovu',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 3,
    dayLabel: 'Day 3 · Wednesday 21 October 2026',
    time: '11:15 - 12:15',
    topic: 'Session 11: Marketing in the Age of AI - Innovating for Competitive Advantage',
    facilitator: 'Reginald Chihota',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 3,
    dayLabel: 'Day 3 · Wednesday 21 October 2026',
    time: '12:15',
    topic: 'Round Up',
    facilitator: 'All Delegates',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 3,
    dayLabel: 'Day 3 · Wednesday 21 October 2026',
    time: '13:30',
    topic: 'MAZ AGM',
    facilitator: 'MAZ',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    day: 3,
    dayLabel: 'Day 3 · Wednesday 21 October 2026',
    time: '18:30',
    topic: 'Dinner Cruise',
    facilitator: 'All Delegates',
    venue: 'Cruise Venue',
    type: 'social'
  }
];

function buildProgrammeForCategory(category: Session['category'], prefix: string): Session[] {
  return conventionProgrammeItems.map((item, index) => ({
    id: `${prefix}_${index + 1}`,
    category,
    ...item
  }));
}

export const officialProgrammeSessions: Session[] = [
  ...buildProgrammeForCategory('Class B', 'conv_b'),
  ...buildProgrammeForCategory('Class A', 'conv_a')
];

export const officialProgrammeSessionIds = new Set(officialProgrammeSessions.map(session => session.id));
export const officialProgrammeSessionOrder = new Map(officialProgrammeSessions.map((session, index) => [session.id, index]));

function parseTimeOrder(time: string) {
  const match = time.match(/(\d{1,2})[:.]?(\d{2})?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hours = Number.parseInt(match[1], 10);
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  return hours * 60 + minutes;
}

export function sortSessionsInProgrammeOrder<T extends Session>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    const orderA = officialProgrammeSessionOrder.get(a.id);
    const orderB = officialProgrammeSessionOrder.get(b.id);

    if (orderA !== undefined && orderB !== undefined) {
      return orderA - orderB;
    }

    if (orderA !== undefined) return -1;
    if (orderB !== undefined) return 1;

    return a.day - b.day || parseTimeOrder(a.time) - parseTimeOrder(b.time) || a.topic.localeCompare(b.topic);
  });
}

export function isLegacyWinterSchoolProgramme(sessions: Session[] = []) {
  return sessions.some(session => /24 June|25 June|26 June|27 June|Kariba Winter School/i.test(session.dayLabel));
}

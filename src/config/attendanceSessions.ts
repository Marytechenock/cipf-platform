import type { Session } from '../types';

export const attendanceSessions: Session[] = [
  {
    id: 'attendance_session_1',
    category: 'Class B',
    day: 1,
    dayLabel: 'Day 1 · 19 October 2026',
    time: '16:30 - 18:00',
    topic: 'Session 1: Opening Remarks, Welcome Remarks and Introduction',
    facilitator: 'Opening Remarks: Dr Gillian Rusike; Welcome Remarks and Introduction: Dr Miriam Mugwati',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    id: 'attendance_session_2',
    category: 'Class B',
    day: 1,
    dayLabel: 'Day 1 · 19 October 2026',
    time: '16:30 - 18:00',
    topic: 'Session 2: SoMCIR',
    facilitator: 'Patson Gatsura',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    id: 'attendance_session_3',
    category: 'Class B',
    day: 1,
    dayLabel: 'Day 1 · 19 October 2026',
    time: '16:30 - 18:00',
    topic: 'Session 3: The Future Consumer',
    facilitator: 'Ivan Moroke',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    id: 'attendance_session_4',
    category: 'Class B',
    day: 2,
    dayLabel: 'Day 2 · 20 October 2026',
    time: '10:30 - 11:00',
    topic: 'Session 4: Official Opening of the Conference',
    facilitator: 'The Minister of Industry and Commerce',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    id: 'attendance_session_5',
    category: 'Class B',
    day: 2,
    dayLabel: 'Day 2 · 20 October 2026',
    time: '11:30 - 12:30',
    topic: 'Session 5: Keynote Address - Marketing for Competitive Growth',
    facilitator: 'Rumbidzai Hondora',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    id: 'attendance_session_6',
    category: 'Class B',
    day: 2,
    dayLabel: 'Day 2 · 20 October 2026',
    time: '12:30 - 13:00',
    topic: 'Session 6: Marketing Zimbabwe - Building Competitive Brands for Global Markets',
    facilitator: 'Dennis Goguya',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    id: 'attendance_session_7',
    category: 'Class B',
    day: 2,
    dayLabel: 'Day 2 · 20 October 2026',
    time: '14:00 - 16:00',
    topic: 'Session 7: Panel Discussions - Competitiveness Agenda and Marketing Value Chain',
    facilitator: 'Mthulis Ncube, Admire Ndumo, Daniel Chipato, Sebastian Musendo, Karen Gondo, Manatsa Gaka',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    id: 'attendance_session_8',
    category: 'Class B',
    day: 3,
    dayLabel: 'Day 3 · 21 October 2026',
    time: '08:30 - 09:15',
    topic: 'Session 8: Data Protection and Data Governance Beyond Compliance',
    facilitator: 'Dr G K Machengete',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    id: 'attendance_session_9',
    category: 'Class B',
    day: 3,
    dayLabel: 'Day 3 · 21 October 2026',
    time: '09:15 - 10:00',
    topic: 'Session 9: Measuring What Matters',
    facilitator: 'Ryan Sauer',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    id: 'attendance_session_10',
    category: 'Class B',
    day: 3,
    dayLabel: 'Day 3 · 21 October 2026',
    time: '10:30 - 11:15',
    topic: 'Session 10: The Future CMO or Industry and Academia Interface',
    facilitator: 'Forbes Makuza, Izzi Ndhlovu',
    venue: 'Main Conference Room',
    type: 'session'
  },
  {
    id: 'attendance_session_11',
    category: 'Class B',
    day: 3,
    dayLabel: 'Day 3 · 21 October 2026',
    time: '11:15 - 12:15',
    topic: 'Session 11: Marketing in the Age of AI - Innovating for Competitive Advantage',
    facilitator: 'Reginald Chihota',
    venue: 'Main Conference Room',
    type: 'session'
  }
];

export function findAttendanceSession(sessionId: string) {
  return attendanceSessions.find(session => session.id === sessionId);
}

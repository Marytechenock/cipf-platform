import fs from 'fs';
import path from 'path';
import {
  AdminUserListQuery,
  DatabaseState,
  FeedbackSubmission,
  GalleryImage,
  PaginatedResult,
  PublicAttendeeDirectoryEntry,
  PublicAttendeeListQuery,
  Session,
  SessionNote,
  Speaker,
  StoredUser as User,
  Sponsor,
  Testimonial,
  VenueInfo,
  AdventureActivity,
  AttendanceRecord,
  Election,
  ElectionBallot,
  ElectionCandidate,
  ElectionCandidateCategory,
  ElectionDashboard,
  ElectionVote,
  ElectionVoter,
  QAQuestion,
  QAResponse
} from '../types';
import {
  filterAdminUsers,
  listAdminUsers as listAdminUsersInUsers,
  listPublicAttendees as listPublicAttendeesInUsers,
  searchAttendees as searchAttendeesInUsers
} from './attendee-search';
import { findAttendanceSession } from '../config/attendanceSessions';
import { isLegacyWinterSchoolProgramme, officialProgrammeSessions, sortSessionsInProgrammeOrder } from '../config/programmeSessions';

// DB file path
const DB_FILE = path.join(process.cwd(), 'src', 'server', 'db.json');

// Ensure parent directory exists
function ensureDirectoryExistence(filePath: string) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

// Default Seed Data based directly on the Kariba Winter School 2026 Booklet
const SEED_DATA: DatabaseState = {
  users: [
    {
      id: 'usr_1',
      email: 'admin@maz.co.zw',
      firstName: 'Gilbert',
      lastName: 'Rusike',
      role: 'admin',
      organization: 'MAZ Business Institute',
      position: 'Secretary General',
      status: 'active',
      // New check-in fields
      accommodationProvided: false,
      roomNumber: '',
      transportProvided: false,
      selectedActivity: '',
      checkedIn: false,
      checkedInAt: '',
      hasSetPassword: false,
      password: ''
    },
    {
      id: 'usr_2',
      email: 'marytechenocks@gmail.com',
      firstName: 'Mary',
      lastName: 'Techenock',
      role: 'attendee',
      organization: 'Marytechenock Solutions',
      position: 'Managing Director & Tech Advisor',
      status: 'active',
      accommodationProvided: true,
      roomNumber: '205',
      transportProvided: true,
      selectedActivity: '',
      checkedIn: false,
      checkedInAt: '',
      hasSetPassword: false,
      password: ''
    },
    {
      id: 'usr_3',
      email: 'collins@delta.co.zw',
      firstName: 'Collins',
      lastName: 'Tonhodzayi',
      role: 'attendee',
      organization: 'Delta Beverages (Pvt) Ltd',
      position: 'Sales Specialist',
      status: 'active',
      accommodationProvided: true,
      roomNumber: '312',
      transportProvided: false,
      selectedActivity: '',
      checkedIn: false,
      checkedInAt: '',
      hasSetPassword: false,
      password: ''
    },
    {
      id: 'usr_4',
      email: 'linda@nedbank.co.zw',
      firstName: 'Linda',
      lastName: 'Matowa',
      role: 'attendee',
      organization: 'NedBank Zimbabwe',
      position: 'Marketing & PR Officer',
      status: 'active',
      accommodationProvided: false,
      roomNumber: '',
      transportProvided: true,
      selectedActivity: '',
      checkedIn: false,
      checkedInAt: '',
      hasSetPassword: false,
      password: ''
    }
  ],
  sessions: [
    // CLASS B - ANNUAL CPD PROGRAMME (Senior/Chartered)
    {
      id: 'sb_1',
      category: 'Class B',
      day: 1,
      dayLabel: 'Day 1 · Wednesday 24 June — Arrival Day',
      time: '14:00 - 16:00',
      topic: 'Registration, Check-in & Networking',
      facilitator: 'Mr G Rusike (MAZ Secretary General)',
      venue: 'Main Foyer / Tamarind grounds',
      type: 'break'
    },
    {
      id: 'sb_2',
      category: 'Class B',
      day: 1,
      dayLabel: 'Day 1 · Wednesday 24 June — Arrival Day',
      time: '16:00 - 17:00',
      topic: 'Building Brand Advocacy: Engaging Stakeholders in Zimbabwe\'s Multi-Sector Economy',
      facilitator: 'Dr Sibongile Tino Jamela (Managing Director, Effective Media)',
      venue: 'Main Conference Room',
      type: 'session'
    },
    {
      id: 'sb_3',
      category: 'Class B',
      day: 1,
      dayLabel: 'Day 1 · Wednesday 24 June — Arrival Day',
      time: '18:00 - 20:30',
      topic: '🔥 Bonfire Braai Dinner & Networking',
      facilitator: 'All Delegates',
      venue: 'Tamarind Resort Grounds',
      type: 'social'
    },
    {
      id: 'sb_4',
      category: 'Class B',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '09:00 - 10:30',
      topic: 'From Strategy to Execution: Project Management Essentials for Marketing Leaders',
      facilitator: 'Peter Banda (CEO, Project Management Zimbabwe)',
      venue: 'Main Conference Room',
      type: 'session'
    },
    {
      id: 'sb_5',
      category: 'Class B',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '10:30 - 11:00',
      topic: '🥐 Tea Break',
      facilitator: 'All Delegates',
      venue: 'Dining Terrace',
      type: 'break'
    },
    {
      id: 'sb_6',
      category: 'Class B',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '11:00 - 12:00',
      topic: 'Digital Brand Storytelling: Creating Compelling Narratives for Social & Content Marketing',
      facilitator: 'Gerald Ngonyamo (Head of Corporate Affairs & PR, MultiChoice Group)',
      venue: 'Main Conference Room',
      type: 'session'
    },
    {
      id: 'sb_7',
      category: 'Class B',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '12:00 - 13:00',
      topic: 'Keep the Core, Own the Market: Brand Consistency vs Local Relevance',
      facilitator: 'Shalmore Khuleya (Nestlé Professional Channel Manager, Greater Zambezi Cluster)',
      venue: 'Main Conference Room',
      type: 'session'
    },
    {
      id: 'sb_8',
      category: 'Class B',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '13:00 - 14:00',
      topic: '🍱 Lunch Break',
      facilitator: 'All Delegates',
      venue: 'Dining Terrace',
      type: 'break'
    },
    {
      id: 'sb_9',
      category: 'Class B',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '14:00 - 16:30',
      topic: 'Case Studies: Group Allocation, Discussion & Presentation Preparation',
      facilitator: 'Moderators: Khuleya, Ngonyamo, Dr Jamela',
      venue: 'Breakout Areas (Group 1: Brand Resilience, Group 2: Digital Transformation, Group 3: Purpose-Driven Growth)',
      type: 'session'
    },
    {
      id: 'sb_10',
      category: 'Class B',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '18:30 - 20:30',
      topic: '🥂 Dinner & Celebration with Live Music',
      facilitator: 'All Delegates',
      venue: 'Tamarind Resort Restaurant',
      type: 'social'
    },
    {
      id: 'sb_11',
      category: 'Class B',
      day: 3,
      dayLabel: 'Day 3 · Friday 26 June — Presentations & Adventure',
      time: '08:00 - 11:00',
      topic: 'Case Study Final Preparation & Group Presentations',
      facilitator: 'All speakers acting as Judges',
      venue: 'Main Conference Room',
      type: 'session'
    },
    {
      id: 'sb_12',
      category: 'Class B',
      day: 3,
      dayLabel: 'Day 3 · Friday 26 June — Presentations & Adventure',
      time: '11:00 - 12:30',
      topic: '🎓 CPD Certificate Handover Ceremony & Summary Wrapup',
      facilitator: 'Mr F Mambondiani (Head, MAZ Business Institute)',
      venue: 'Main Conference Room',
      type: 'session'
    },
    {
      id: 'sb_13',
      category: 'Class B',
      day: 3,
      dayLabel: 'Day 3 · Friday 26 June — Presentations & Adventure',
      time: '14:00 - 17:30',
      topic: '🚤 Adventure Choice Sessions on Lake Kariba',
      facilitator: 'Sunset Cruise Vessel (actual yellow double-deck boat) / Quad Biking / Game Drives',
      venue: 'Lake Kariba and Surroundings',
      type: 'social'
    },
    {
      id: 'sb_14',
      category: 'Class B',
      day: 3,
      dayLabel: 'Day 3 · Friday 26 June — Presentations & Adventure',
      time: '18:30 - 20:30',
      topic: '🌅 Lakeside Sunset Dinner & Informal Networking',
      facilitator: 'All Delegates',
      venue: 'CBR Thatch Venue',
      type: 'social'
    },
    {
      id: 'sb_15',
      category: 'Class B',
      day: 4,
      dayLabel: 'Day 4 · Saturday 27 June — Departure Day',
      time: '07:30 - 10:00',
      topic: 'Breakfast, Guest Checkout and Departure',
      facilitator: 'All Delegates',
      venue: 'Tamarind Resort',
      type: 'break'
    },

    // CLASS A - MARKETING PRACTITIONERS PROGRAMME
    {
      id: 'sa_1',
      category: 'Class A',
      day: 1,
      dayLabel: 'Day 1 · Wednesday 24 June — Shared Opening',
      time: '14:00 - 16:00',
      topic: 'Registration, Check-in & Opening Remarks',
      facilitator: 'Mr G Rusike (MAZ SG)',
      venue: 'Main Foyer / Tamarind grounds',
      type: 'break'
    },
    {
      id: 'sa_2',
      category: 'Class A',
      day: 1,
      dayLabel: 'Day 1 · Wednesday 24 June — Shared Opening',
      time: '16:00 - 17:00',
      topic: 'Building Brand Advocacy: Engaging Stakeholders in Zimbabwe\'s Multi-Sector Economy',
      facilitator: 'Dr Sibongile Tino Jamela (Managing Director, Effective Media)',
      venue: 'Main Conference Room',
      type: 'session'
    },
    {
      id: 'sa_3',
      category: 'Class A',
      day: 1,
      dayLabel: 'Day 1 · Wednesday 24 June — Shared Opening',
      time: '18:00 - 20:30',
      topic: '🔥 Bonfire Braai Dinner & Networking',
      facilitator: 'All Delegates',
      venue: 'Tamarind Resort Grounds',
      type: 'social'
    },
    {
      id: 'sa_4',
      category: 'Class A',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '09:00 - 10:30',
      topic: 'From Strategy to Execution: Project Management Essentials for Marketing Leaders',
      facilitator: 'Project Management Zimbabwe Support',
      venue: 'Main Conference Room',
      type: 'session'
    },
    {
      id: 'sa_5',
      category: 'Class A',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '10:30 - 11:00',
      topic: '🥐 Tea Break',
      facilitator: 'All Delegates',
      venue: 'Dining Terrace',
      type: 'break'
    },
    {
      id: 'sa_6',
      category: 'Class A',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '11:00 - 12:00',
      topic: 'The Modern Marketing Practitioner: Blending Data, Creativity & Ethics in African Markets',
      facilitator: 'Kugandrie Govender (Campus Academic Head, IMM South Africa)',
      venue: 'Breakaway Room',
      type: 'session'
    },
    {
      id: 'sa_7',
      category: 'Class A',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '12:00 - 13:00',
      topic: 'Marketing Measurement and ROI: Proving Your Value in a Data-Driven Organisation',
      facilitator: 'Tricea Valentine (Director of Product Management, RAIC Labs)',
      venue: 'Breakaway Room',
      type: 'session'
    },
    {
      id: 'sa_8',
      category: 'Class A',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '13:00 - 14:00',
      topic: '🍱 Lunch Break',
      facilitator: 'All Delegates',
      venue: 'Dining Terrace',
      type: 'break'
    },
    {
      id: 'sa_9',
      category: 'Class A',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '14:00 - 16:30',
      topic: 'Case Studies: Group Allocation, Discussion & Presentation Preparation',
      facilitator: 'Moderators: Govender, Valentine',
      venue: 'Breakaway Room (Group 1: Brand Crisis Management, Group 2: SME Marketing on a Budget)',
      type: 'session'
    },
    {
      id: 'sa_10',
      category: 'Class A',
      day: 2,
      dayLabel: 'Day 2 · Thursday 25 June — Full Conference Day',
      time: '18:30 - 20:30',
      topic: '🥂 Dinner & Networking - All Delegates',
      facilitator: 'All Delegates',
      venue: 'Tamarind Resort',
      type: 'social'
    },
    {
      id: 'sa_11',
      category: 'Class A',
      day: 3,
      dayLabel: 'Day 3 · Friday 26 June — Presentations & Adventure',
      time: '08:00 - 11:00',
      topic: 'Case Study Final Preparation & Group Presentations',
      facilitator: 'Judging Panel: Strategic Thinking, Practicality & Communication Clarity',
      venue: 'Breakaway Room',
      type: 'session'
    },
    {
      id: 'sa_12',
      category: 'Class A',
      day: 3,
      dayLabel: 'Day 3 · Friday 26 June — Presentations & Adventure',
      time: '11:00 - 12:30',
      topic: '🎓 Certificate Handover & Closing Remarks',
      facilitator: 'Mr F Mambondiani (Head, MAZ Business Institute)',
      venue: 'Main Conference Room',
      type: 'session'
    },
    {
      id: 'sa_13',
      category: 'Class A',
      day: 3,
      dayLabel: 'Day 3 · Friday 26 June — Presentations & Adventure',
      time: '14:00 - 17:30',
      topic: '🚤 Adventure Choice Sessions (Sunset Cruise / Game Drives / Quads)',
      facilitator: 'Sunset Cruise / Quad Biking / Game Drive Coordination',
      venue: 'Lake Kariba and Surroundings',
      type: 'social'
    },
    {
      id: 'sa_14',
      category: 'Class A',
      day: 3,
      dayLabel: 'Day 3 · Friday 26 June — Presentations & Adventure',
      time: '18:30 - 20:30',
      topic: '🌅 Lakeside Sunset Dinner & Informal Networking',
      facilitator: 'All Delegates',
      venue: 'CBR Thatch Venue',
      type: 'social'
    },
    {
      id: 'sa_15',
      category: 'Class A',
      day: 4,
      dayLabel: 'Day 4 · Saturday 27 June — Departure Day',
      time: '07:30 - 10:00',
      topic: 'Breakfast, Guest Checkout and Departure',
      facilitator: 'All Delegates',
      venue: 'Tamarind Resort',
      type: 'break'
    }
  ],
  notes: [],
  speakers: [
    {
      id: 'spk_1',
      name: 'Peter Banda',
      position: 'CEO',
      organization: 'Project Management Zimbabwe',
      topic: 'From Strategy to Execution: Project Management Essentials for Marketing Leaders',
      speakingTime: 'Day 2 · 09:00 - 10:30',
      bio: 'Peter Banda is a celebrated project management consultant in Southern Africa. With over 20 years of experience aligning project lifecycles with corporate strategy, he helps CMOs and marketing teams establish structured execution methodologies to secure high ROI and flawless campaign launches.',
      photoUrl: 'PB'
    },
    {
      id: 'spk_2',
      name: 'Kugandrie Govender',
      position: 'Campus Academic Head',
      organization: 'IMM South Africa',
      topic: 'The Modern Marketing Practitioner: Blending Data, Creativity & Ethics in African Markets',
      speakingTime: 'Day 2 · 11:00 - 12:00',
      photoUrl: 'KG',
      bio: 'Kugandrie Govender is a respected marketing academic and practitioner, currently heading IMM South Africa\'s academic efforts. She specialises in data-driven marketing frameworks, ethical digital strategies, and equipping SADC brand leaders with globally benchmarked continuous professional development.'
    },
    {
      id: 'spk_3',
      name: 'Gerald Ngonyamo',
      position: 'Head of Corporate Affairs & PR',
      organization: 'MultiChoice Group',
      topic: 'Digital Brand Storytelling: Creating Compelling Narratives for Social & Content Marketing',
      speakingTime: 'Day 2 · 11:00 - 12:00',
      photoUrl: 'GN',
      bio: 'Gerald Ngonyamo serves as the Head of Corporate Affairs & PR for MultiChoice. He brings exceptional insight into digital entertainment, narrative strategy, user-generated content engagement, and crisis communications across pan-African digital ecosystems.'
    },
    {
      id: 'spk_4',
      name: 'Shalmore Khuleya',
      position: 'Professional Channel Manager, Greater Zambezi Cluster',
      organization: 'Nestlé Zimbabwe',
      topic: 'Keep the Core, Own the Market: Brand Consistency vs Local Relevance',
      speakingTime: 'Day 2 · 12:00 - 13:00',
      photoUrl: 'SK',
      bio: 'Shalmore Khuleya is Nestlé\'s Channel Manager for the Greater Zambezi Cluster. He drives brand development and distribution across high-growth sub-Saharan markets, reconciling strict global brand governance with powerful local cultural and commercial adaptation levers.'
    },
    {
      id: 'spk_5',
      name: 'Dr Sibongile Tino Jamela',
      position: 'Managing Director',
      organization: 'Effective Media',
      topic: 'Building Brand Advocacy: Engaging Stakeholders in Zimbabwe\'s Multi-Sector Economy',
      speakingTime: 'Day 1 · 16:00 - 17:00 & Case Moderation',
      photoUrl: 'SJ',
      bio: 'Dr Sibongile Tino Jamela is the Managing Director of Effective Media. With deep insights across parastatals, financial services, and FMCG sectors, she is an expert on corporate reputation, multi-stakeholder mapping, brand advocacy, and proving marketing value to boards.'
    },
    {
      id: 'spk_6',
      name: 'Tricea Valentine',
      position: 'Director of Product Management',
      organization: 'RAIC Labs',
      topic: 'Marketing Measurement and ROI: Proving Your Value in a Data-Driven Organisation',
      speakingTime: 'Day 2 · 12:00 - 13:00 (Class A)',
      photoUrl: 'TV',
      bio: 'Tricea Valentine is an expert software product leader at RAIC Labs. She is passionate about tech disruption, building scalable analytics tools, automated attribution pathways, and helping marketers validate campaign metrics with precision financial forecasting models.'
    },
    {
      id: 'spk_7',
      name: 'Mr F Mambondiani',
      position: 'Head',
      organization: 'MAZ Business Institute',
      topic: 'Closing Ceremony & SADC-Wide Professional Certification Handover',
      speakingTime: 'Day 3 · 11:00 - 12:30',
      photoUrl: 'FM',
      bio: 'Mr F Mambondiani leads the MAZ Business Institute (MAZBI). He has championed SADC-wide continuous professional developments for over a decade. He supervises SADC co-branding alliances such as the IMM South Africa partnership, ensuring certificates hold prestigious regional academic weight.'
    }
  ],
  sponsors: [
    {
      id: 'spon_1',
      name: 'Image Magic',
      logoUrl: '🧥',
      description: 'Supplying the iconic custom-embroidered MAZ Winter School premium jackets and beanie hats since 2021 — making them a proud and warm hallmark of the Kariba experience.',
      website: 'https://imagemagic.co.zw',
      durationLabel: '2021 – Present · Winter Wear Partner',
      tier: 'Gold'
    },
    {
      id: 'spon_2',
      name: 'IMM South Africa',
      logoUrl: '🎓',
      description: 'Our primary academic and joint certification partner, co-branding Kariba Winter School certificates to ensure premium, validated, SADC-wide recognition.',
      website: 'https://imminstitute.co.za',
      durationLabel: '2021 – Present · Academic Partner',
      tier: 'Gold'
    },
    {
      id: 'spon_3',
      name: 'Marytechenock Solutions',
      "logoUrl": "🍽️",
      description: 'Generously sponsored delegate dinners across three legendary editions, facilitating immersive networking over beautifully curated lakeside braais and dining spreads.',
      website: 'https://www.marytechenock.com',
      durationLabel: '2024 – 2026 · Event Sponsor',
      tier: 'Silver'
    },
    {
      id: 'spon_4',
      name: 'NetOne Cellular',
      logoUrl: '🍽️',
      description: 'Generously sponsored delegate dinners across three legendary editions, facilitating immersive networking over beautifully curated lakeside braais and dining spreads.',
      website: 'https://netone.co.zw',
      durationLabel: '2021 – 2023 · Event Sponsor',
      tier: 'Silver'
    },
    {
      id: 'spon_5',
      name: 'Proton Bakers (Pvt) Ltd',
      logoUrl: '📝',
      description: 'Supplied high-quality delegate writing cases and stationery packs to enhance the note-taking and collaborative experience during strategy sessions.',
      website: 'https://protonbakers.co.zw',
      durationLabel: '2022 · Stationery Sponsor',
      tier: 'Silver'
    },
    {
      id: 'spon_6',
      name: 'Delta Beverages (Pvt) Ltd',
      logoUrl: '🥤',
      description: 'Sponsored premium branded delegate study desks and stationery clusters through their iconic Coca-Cola portfolio, ensuring a perfectly equipped learning space.',
      website: 'https://deltacorporation.co.zw',
      durationLabel: '2023 · Study Tables Sponsor',
      tier: 'Gold'
    },
    {
      id: 'spon_7',
      name: 'Moonlight Funeral Services',
      logoUrl: '✒️',
      description: 'Co-sponsored delegate writing and creative brainstorming materials during the fast-paced marketing strategy challenges.',
      website: 'https://moonlight.co.zw',
      durationLabel: '2023 · Joint Sponsor',
      tier: 'Silver'
    }
  ],
  testimonials: [
    {
      id: 't_1',
      name: 'Collins Tonhodzayi',
      company: 'Delta Beverages (Pvt) Ltd',
      position: 'Sales Specialist (Winter School 2024)',
      text: 'Attending the Winterschool at Tamarind, Kariba in 2024 was a defining moment in my professional journey. Sponsored by Delta Beverages, I came in expecting to refine my sales skills — but what I gained was a complete transformation in how I think, plan, and execute. Since completing the program and attaining my Sales Practitioner status, I secured 2nd Position in the Supersurprise Nationwide Event (2026) and 4th Position at the Chibuku Sales Rally. It\'s not just a course, it\'s a catalyst for real success.',
      photoUrl: 'CT',
      accentChar: 'C'
    },
    {
      id: 't_2',
      name: 'Kudzanayi Mudhanyani',
      company: 'CBZ Bank',
      position: 'Marketing Manager',
      text: 'The most enduring value has been the shift in how I approach marketing as a driver of enterprise value. The program\'s deep dive into Financial Forecasting gave me the framework to align marketing objectives with the organisation\'s bottom-line targets, de-risk investments through data-backed projections, and communicate value to the board in the language of ROI. MAZBI doesn\'t just refine marketing skills — it matures the marketing leader\'s perspective.',
      photoUrl: 'KM',
      accentChar: 'K'
    },
    {
      id: 't_3',
      name: 'Tinashe Sanyamawe',
      company: 'EcoCash (Pvt) Ltd',
      position: 'Brand Executive',
      text: 'The MAZBI Winter School was a transformative experience that strengthened my approach to strategic thinking, leadership, and innovation. The programme challenged me to adopt a more insight-driven approach to problem-solving while connecting me with forward-thinking professionals. I highly recommend the MAZBI Winter School to anyone looking to accelerate their professional and leadership development.',
      photoUrl: 'TS',
      accentChar: 'T'
    },
    {
      id: 't_4',
      name: 'Linda Matowa',
      company: 'NedBank Zimbabwe',
      position: 'Marketing, PR & Communications Officer',
      text: 'The 2025 CPD Winter School was a real eye-opener! It drove home the point that marketers need to show the value they bring to the table — we\'re not just a cost centre, we\'re revenue drivers! Kudos to the presenters for covering hot topics like aligning marketing and sales, and the rise of personalisation. I\'m already implementing some of these strategies to boost our marketing impact.',
      photoUrl: 'LM',
      accentChar: 'L'
    }
  ],
  gallery: [
    { id: 'g_1', url: '/images/gallery/m2.jpg', caption: 'Graduation Day: SADC Certificates Handed Out (2024)', category: '2024' },
    { id: 'g_2', url: '/images/gallery/m1.jpg', caption: 'Delegates in deep strategy debates during Group Challenge', category: '2024' },
    { id: 'g_3', url: '/images/gallery/MAZ0.jpg', caption: 'Sunset boat cruise on Lake Kariba: Pure networking breeze', category: '2025' },
    { id: 'g_4', url: '/images/gallery/g2.jpeg', caption: 'Bonfire Networking: Barbeque and storytelling under stars', category: '2025' },
    { id: 'g_5', url: '/images/gallery/MAZ8.jpg', caption: 'Newly Refurbished Conference Venue at Tamarind Resort', category: '2026' },
    { id: 'g_6', url: '/images/gallery/MAZBI 1.jpeg', caption: 'Executive roundtables centering Brand Resilience themes', category: '2026' }
  ],

  venue: {
    id: 'venue_1',
    title: 'Tamarind Resort, Kariba',
    overview: 'Tamarind Resort sits majestically directly on the shores of Lake Kariba, offering awe-inspiring views, beautiful sub-tropical gardens, and newly refurbished spaces that seamlessly blend modern African luxury with exceptional hospitality. An ideal professional sanctuary.',
    accommodation: 'Newly refurbished luxury King Bedrooms. Features premium king beds, plush therapeutic linens, rich custom timber headboards, energy-efficient modern cooling, and warm LED ambient systems.',
    conference: 'Modernised Conference Rooms + Breakaway Hubs + a traditional thatch-roofed Lakeside CBR venue, fitted with state-of-the-art acoustics, wide-screen A/V projections, and dual-layer high-speed Wi-Fi matrices.',
    views: 'Majestic open prospects over Lake Kariba lake-shores, beautiful outdoor sunset dining structures, deep blue pool lounges, and a glorious lake sunset view deck.',
    amenities: [
      'Lakeview Sundowner Terrace',
      'Designer En-Suite Marble Bathrooms',
      'SADC High-Speed Event Wi-Fi',
      'Lakeside Swimming Pool & Poolside Braai Pit',
      'All-Day Dining Terrace',
      'Free secure shuttle services inside the resort grounds'
    ],
    imageUrl: 'https://images.unsplash.com/photo-1455587734955-081b22074882?auto=format&fit=crop&q=80&w=1200'
  },
  adventures: [
    {
      id: 'adv_1',
      title: 'Sunset Cruise on Lake Kariba',
      description: 'Board the iconic gold and yellow double-deck Lake Kariba Cruise Vessel. Enjoy standard two storeys of open observation decks combined with shaded lower dining lounges, full catering service, and elephant spotting along the river shorelines at sunset.'
    },
    {
      id: 'adv_2',
      title: 'Game Drives in Kariba National Park',
      description: 'A guided high-clearance truck safari traversing beautiful paths along the shores of Lake Kariba to observe herds of elephants, antelopes, zebras, and native birdlife in their historic natural terrains.'
    },
    {
      id: 'adv_3',
      title: 'Exciting Quad Biking Trails',
      description: 'Rev up your quad bike and follow experienced guides across the rustic paths, scenic lakeside ridges, and dusty bush tracks of Kariba for an blood-pumping team adventure.'
    },
    {
      id: 'adv_4',
      title: 'Lakeside Networking Sundowners',
      description: 'Share stories, drinks, and network informally with CMOs and parastatal directors on the sundowner terrace of Tamarind Resort, directly overlooking Africa\'s greatest man-made waters.'
    },
    {
      id: 'adv_5',
      title: 'Warm Bonfire and Traditional Braai',
      description: 'Settle in for a traditional Zimbabwean braai dinner next to a crackling hardwood bonfire under the clear, crisp June Kariba sky, accompanied by local acoustic ambient sounds and networking.'
    }
  ],
  feedback: [
    {
      id: 'fb_demo1',
      userId: 'usr_3',
      userEmail: 'collins@delta.co.zw',
      userName: 'Collins Tonhodzayi',
      rating: 5,
      bestSession: 'Keep the Core, Own the Market: Brand Consistency vs Local Relevance',
      bestFacilitator: 'Shalmore Khuleya',
      improvements: 'Everything is exceptional! Maybe provide return transport for all classes.',
      attendAgain: true,
      submittedAt: '2026-06-08T09:12:00Z'
    }
  ],
  googleDriveLink: 'https://drive.google.com/drive/folders/18K9p_0S79z77X-maz-kariba-winter-school-gallery-2026',
  dayLinks: [],
  elections: [],
  electionCandidates: [],
  electionVoters: [],
  electionVotes: []
};

SEED_DATA.sessions = officialProgrammeSessions;

class FileDatabase {
  private cache: DatabaseState | null = null;

  constructor() {
    this.init();
  }

  private init() {
    try {
      ensureDirectoryExistence(DB_FILE);
      if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify(SEED_DATA, null, 2), 'utf-8');
        this.cache = JSON.parse(JSON.stringify(SEED_DATA));
      } else {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.cache = JSON.parse(fileContent);
        const cache = this.cache;

        if (!cache) {
          throw new Error('Failed to load file database state');
        }

        // Migrate existing users to have new fields if missing
        let needsSave = false;
        if (!Array.isArray(cache.dayLinks)) {
          cache.dayLinks = [];
          needsSave = true;
        }
        if (!Array.isArray(cache.attendanceRecords)) {
          cache.attendanceRecords = [];
          needsSave = true;
        }
        if (!Array.isArray(cache.qaQuestions)) {
          cache.qaQuestions = [];
          needsSave = true;
        }
        if (!Array.isArray(cache.qaResponses)) {
          cache.qaResponses = [];
          needsSave = true;
        }
        if (!Array.isArray(cache.elections)) {
          cache.elections = [];
          needsSave = true;
        }
        if (!Array.isArray(cache.electionCandidates)) {
          cache.electionCandidates = [];
          needsSave = true;
        }
        if (!Array.isArray(cache.electionVoters)) {
          cache.electionVoters = [];
          needsSave = true;
        }
        if (!Array.isArray(cache.electionVotes)) {
          cache.electionVotes = [];
          needsSave = true;
        }
        if (!Array.isArray(cache.sessions) || isLegacyWinterSchoolProgramme(cache.sessions)) {
          cache.sessions = officialProgrammeSessions;
          needsSave = true;
        }

        for (const user of cache.users) {
          if (user.accommodationProvided === undefined) {
            user.accommodationProvided = false;
            needsSave = true;
          }
          if (user.roomNumber === undefined) {
            user.roomNumber = '';
            needsSave = true;
          }
          if (user.transportProvided === undefined) {
            user.transportProvided = false;
            needsSave = true;
          }
          if (user.selectedActivity === undefined) {
            user.selectedActivity = '';
            needsSave = true;
          }
          if (user.checkedIn === undefined) {
            user.checkedIn = false;
            needsSave = true;
          }
          if (user.checkedInAt === undefined) {
            user.checkedInAt = '';
            needsSave = true;
          }
          if (user.hasSetPassword === undefined) {
            user.hasSetPassword = false;
            needsSave = true;
          }
          if (user.password === undefined) {
            user.password = '';
            needsSave = true;
          }
          if (user.qrToken === undefined) {
            user.qrToken = '';
            needsSave = true;
          }
          if (user.qrIssuedAt === undefined) {
            user.qrIssuedAt = '';
            needsSave = true;
          }
          if (user.qrEmailSentAt === undefined) {
            user.qrEmailSentAt = '';
            needsSave = true;
          }
        }
        if (needsSave) {
          this.save();
        }
      }
    } catch (e) {
      console.error('Failed to initialize database:', e);
      this.cache = JSON.parse(JSON.stringify(SEED_DATA));
    }
  }

  private save() {
    if (!this.cache) return;
    try {
      ensureDirectoryExistence(DB_FILE);
      fs.writeFileSync(DB_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save file database:', e);
    }
  }

  get(): DatabaseState {
    if (!this.cache) {
      this.init();
    }
    return this.cache!;
  }

  // Users Auth
  findUserByEmail(email: string): User | undefined {
    const data = this.get();
    const normalizedEmail = email.toLowerCase();
    return data.users.find(u => u.email?.toLowerCase() === normalizedEmail);
  }

  // Get user by ID (NEW)
  getUserById(id: string): User | undefined {
    const data = this.get();
    return data.users.find(u => u.id === id);
  }

  findUserByQrToken(qrToken: string): User | undefined {
    const data = this.get();
    return data.users.find(u => u.qrToken === qrToken);
  }

  // Users Admin
  getUsers(): User[] {
    return this.get().users;
  }

  saveUser(user: User): User {
    const data = this.get();
    const index = data.users.findIndex(u => u.id === user.id);
    if (index >= 0) {
      data.users[index] = { ...user };
    } else {
      data.users.push(user);
    }
    this.save();
    return user;
  }

  deleteUser(id: string): boolean {
    const data = this.get();
    const initialLen = data.users.length;
    data.users = data.users.filter(u => u.id !== id);
    if (data.users.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Update user check-in (NEW)
  updateUserCheckin(userId: string, updates: Partial<User>): User {
    const data = this.get();
    const index = data.users.findIndex(u => u.id === userId);
    if (index === -1) {
      throw new Error('User not found');
    }
    data.users[index] = { ...data.users[index], ...updates };
    this.save();
    return data.users[index];
  }

  // Get checked-in users (NEW)
  getCheckedInUsers(): User[] {
    const data = this.get();
    return data.users.filter(u => u.checkedIn === true);
  }

  // Get pending check-in users (NEW)
  getPendingCheckInUsers(): User[] {
    const data = this.get();
    return data.users.filter(u => u.role === 'attendee' && u.checkedIn !== true);
  }

  // Search attendees (NEW)
  searchAttendees(query: string, limit: number = 10): User[] {
    return searchAttendeesInUsers(this.get().users, query, limit);
  }

  listPublicAttendees(query: PublicAttendeeListQuery = {}): PaginatedResult<PublicAttendeeDirectoryEntry> {
    return listPublicAttendeesInUsers(this.get().users, query);
  }

  listAdminUsers(query: AdminUserListQuery = {}): PaginatedResult<User> {
    return listAdminUsersInUsers(this.get().users, query);
  }

  private enrichAttendanceRecord(record: AttendanceRecord): AttendanceRecord {
    const data = this.get();
    const attendee = data.users.find(user => user.id === record.attendeeId);
    const session = findAttendanceSession(record.sessionId) || data.sessions.find(item => item.id === record.sessionId);
    const scanner = data.users.find(user => user.id === record.scannedBy);

    return {
      ...record,
      attendee: attendee ? {
        id: attendee.id,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        organization: attendee.organization,
        position: attendee.position,
        class: attendee.class
      } : undefined,
      session: session ? {
        id: session.id,
        day: session.day,
        dayLabel: session.dayLabel,
        time: session.time,
        topic: session.topic,
        category: session.category,
        venue: session.venue
      } : undefined,
      scannedByUser: scanner ? {
        id: scanner.id,
        firstName: scanner.firstName,
        lastName: scanner.lastName
      } : undefined
    };
  }

  getAttendanceRecord(attendeeId: string, sessionId: string): AttendanceRecord | undefined {
    const record = this.get().attendanceRecords?.find(item => item.attendeeId === attendeeId && item.sessionId === sessionId);
    return record ? this.enrichAttendanceRecord(record) : undefined;
  }

  saveAttendanceRecord(record: AttendanceRecord): AttendanceRecord {
    const data = this.get();
    data.attendanceRecords = data.attendanceRecords || [];
    const existing = data.attendanceRecords.find(item => item.attendeeId === record.attendeeId && item.sessionId === record.sessionId);
    if (existing) {
      return this.enrichAttendanceRecord(existing);
    }

    data.attendanceRecords.push(record);
    this.save();
    return this.enrichAttendanceRecord(record);
  }

  listAttendanceRecords(sessionId: string): AttendanceRecord[] {
    return (this.get().attendanceRecords || [])
      .filter(record => record.sessionId === sessionId)
      .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
      .map(record => this.enrichAttendanceRecord(record));
  }

  private enrichQAQuestion(question: QAQuestion): QAQuestion {
    const responses = this.get().qaResponses || [];
    const session = this.get().sessions.find(item => item.id === question.sessionId);

    return {
      ...question,
      responseCount: responses.filter(response => response.questionId === question.id).length,
      session: session ? {
        id: session.id,
        day: session.day,
        dayLabel: session.dayLabel,
        time: session.time,
        topic: session.topic,
        category: session.category,
        venue: session.venue
      } : undefined
    };
  }

  private enrichQAResponse(response: QAResponse): QAResponse {
    const attendee = this.get().users.find(user => user.id === response.attendeeId);

    return {
      ...response,
      attendee: attendee ? {
        id: attendee.id,
        firstName: attendee.firstName,
        lastName: attendee.lastName,
        email: attendee.email,
        organization: attendee.organization,
        position: attendee.position,
        class: attendee.class
      } : undefined
    };
  }

  listQAQuestions(sessionId?: string): QAQuestion[] {
    return (this.get().qaQuestions || [])
      .filter(question => !sessionId || question.sessionId === sessionId)
      .sort((a, b) => a.order - b.order || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(question => this.enrichQAQuestion(question));
  }

  getQAQuestion(id: string): QAQuestion | undefined {
    const question = (this.get().qaQuestions || []).find(item => item.id === id);
    return question ? this.enrichQAQuestion(question) : undefined;
  }

  getLiveQAQuestion(sessionId?: string): QAQuestion | undefined {
    const question = (this.get().qaQuestions || []).find(item => item.status === 'live' && (!sessionId || item.sessionId === sessionId));
    return question ? this.enrichQAQuestion(question) : undefined;
  }

  saveQAQuestion(question: QAQuestion): QAQuestion {
    const data = this.get();
    data.qaQuestions = data.qaQuestions || [];
    const index = data.qaQuestions.findIndex(item => item.id === question.id);
    if (index >= 0) {
      data.qaQuestions[index] = { ...question };
    } else {
      data.qaQuestions.push(question);
    }
    this.save();
    return this.enrichQAQuestion(question);
  }

  updateQAQuestionStatus(id: string, status: QAQuestion['status']): QAQuestion | undefined {
    const data = this.get();
    const question = (data.qaQuestions || []).find(item => item.id === id);
    if (!question) return undefined;

    if (status === 'live') {
      data.qaQuestions = (data.qaQuestions || []).map(item => item.id !== id && item.status === 'live'
        ? { ...item, status: 'closed', closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        : item
      );
    }

    const updated = {
      ...question,
      status,
      updatedAt: new Date().toISOString(),
      publishedAt: status === 'live' ? new Date().toISOString() : question.publishedAt,
      closedAt: status === 'closed' ? new Date().toISOString() : question.closedAt
    };
    data.qaQuestions = data.qaQuestions.map(item => item.id === id ? updated : item);
    this.save();
    return this.enrichQAQuestion(updated);
  }

  deleteQAQuestion(id: string): boolean {
    const data = this.get();
    const initialLen = (data.qaQuestions || []).length;
    data.qaQuestions = (data.qaQuestions || []).filter(item => item.id !== id);
    data.qaResponses = (data.qaResponses || []).filter(item => item.questionId !== id);
    if (data.qaQuestions.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  listQAResponses(questionId: string): QAResponse[] {
    return (this.get().qaResponses || [])
      .filter(response => response.questionId === questionId)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
      .map(response => this.enrichQAResponse(response));
  }

  getQAResponse(questionId: string, attendeeId: string): QAResponse | undefined {
    const response = (this.get().qaResponses || []).find(item => item.questionId === questionId && item.attendeeId === attendeeId);
    return response ? this.enrichQAResponse(response) : undefined;
  }

  saveQAResponse(response: QAResponse): QAResponse {
    const data = this.get();
    data.qaResponses = data.qaResponses || [];
    const existing = data.qaResponses.find(item => item.questionId === response.questionId && item.attendeeId === response.attendeeId);
    if (existing) {
      return this.enrichQAResponse(existing);
    }

    data.qaResponses.push(response);
    this.save();
    return this.enrichQAResponse(response);
  }

  private enrichElectionVoter(voter: ElectionVoter): ElectionVoter {
    const user = this.get().users.find(item => item.id === voter.userId);
    const hasVoted = (this.get().electionVotes || []).some(vote => vote.electionId === voter.electionId && vote.voterId === voter.userId);
    const voterVotes = (this.get().electionVotes || []).filter(vote => vote.electionId === voter.electionId && vote.voterId === voter.userId);

    return {
      ...voter,
      hasVoted,
      votedAt: voterVotes[0]?.submittedAt,
      user: user ? {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        organization: user.organization,
        position: user.position,
        class: user.class
      } : undefined
    };
  }

  private enrichElectionCandidate(candidate: ElectionCandidate): ElectionCandidate {
    const voteCount = (this.get().electionVotes || []).filter(vote => vote.candidateId === candidate.id).length;
    return { ...candidate, voteCount };
  }

  private getEffectiveElectionStatus(election: Election): Election['status'] {
    if (election.status === 'closed') return 'closed';
    if (election.status === 'draft') return 'draft';
    const now = this.getZonedNowParts(election.timezone || 'Africa/Harare');
    if (election.endsAt && now >= this.getWallClockComparable(election.endsAt)) return 'closed';
    if (election.startsAt && now < this.getWallClockComparable(election.startsAt)) return 'scheduled';
    return 'open';
  }

  private getZonedNowParts(timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
  }

  private getWallClockComparable(value: string) {
    return value.replace(' ', 'T').slice(0, 19);
  }

  private enrichElection(election: Election): Election {
    return {
      ...election,
      status: this.getEffectiveElectionStatus(election),
      timezone: election.timezone || 'Africa/Harare'
    };
  }

  getActiveElection(): Election | undefined {
    const elections = this.get().elections || [];
    const ranked = [...elections].sort((a, b) => {
      const statusRank = (status: Election['status']) => status === 'open' ? 0 : status === 'scheduled' ? 1 : status === 'draft' ? 2 : 3;
      return statusRank(this.getEffectiveElectionStatus(a)) - statusRank(this.getEffectiveElectionStatus(b))
        || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return ranked[0] ? this.enrichElection(ranked[0]) : undefined;
  }

  getElection(id: string): Election | undefined {
    const election = (this.get().elections || []).find(item => item.id === id);
    return election ? this.enrichElection(election) : undefined;
  }

  saveElection(election: Election): Election {
    const data = this.get();
    data.elections = data.elections || [];
    const index = data.elections.findIndex(item => item.id === election.id);
    if (index >= 0) {
      data.elections[index] = { ...election };
    } else {
      data.elections.push(election);
    }
    this.save();
    return this.enrichElection(election);
  }

  updateElectionStatus(id: string, status: Election['status']): Election | undefined {
    const data = this.get();
    const election = (data.elections || []).find(item => item.id === id);
    if (!election) return undefined;

    const now = new Date().toISOString();
    if (status === 'open') {
      data.elections = (data.elections || []).map(item => item.status === 'open'
        ? { ...item, status: 'closed', closedAt: item.closedAt || now, updatedAt: now }
        : item
      );
    }

    const updated: Election = {
      ...election,
      status,
      updatedAt: now,
      openedAt: status === 'open' ? now : election.openedAt,
      closedAt: status === 'closed' ? now : election.closedAt
    };
    data.elections = data.elections.map(item => item.id === id ? updated : item);
    this.save();
    return updated;
  }

  listElectionCandidates(electionId: string): ElectionCandidate[] {
    return (this.get().electionCandidates || [])
      .filter(candidate => candidate.electionId === electionId)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.fullName.localeCompare(b.fullName))
      .map(candidate => this.enrichElectionCandidate(candidate));
  }

  saveElectionCandidate(candidate: ElectionCandidate): ElectionCandidate {
    const data = this.get();
    data.electionCandidates = data.electionCandidates || [];
    const index = data.electionCandidates.findIndex(item => item.id === candidate.id);
    if (index >= 0) {
      data.electionCandidates[index] = { ...candidate };
    } else {
      data.electionCandidates.push(candidate);
    }
    this.save();
    return this.enrichElectionCandidate(candidate);
  }

  deleteElectionCandidate(id: string): boolean {
    const data = this.get();
    const initialLen = (data.electionCandidates || []).length;
    data.electionCandidates = (data.electionCandidates || []).filter(item => item.id !== id);
    data.electionVotes = (data.electionVotes || []).filter(item => item.candidateId !== id);
    if (data.electionCandidates.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  listElectionVoters(electionId: string): ElectionVoter[] {
    return (this.get().electionVoters || [])
      .filter(voter => voter.electionId === electionId)
      .map(voter => this.enrichElectionVoter(voter))
      .sort((a, b) => `${a.user?.lastName || ''} ${a.user?.firstName || ''}`.localeCompare(`${b.user?.lastName || ''} ${b.user?.firstName || ''}`));
  }

  saveElectionVoter(voter: ElectionVoter): ElectionVoter {
    const data = this.get();
    data.electionVoters = data.electionVoters || [];
    const existing = data.electionVoters.find(item => item.electionId === voter.electionId && item.userId === voter.userId);
    if (existing) {
      if (voter.identifier && existing.identifier !== voter.identifier) {
        existing.identifier = voter.identifier;
        this.save();
      }
      if (voter.memberCategory && existing.memberCategory !== voter.memberCategory) {
        existing.memberCategory = voter.memberCategory;
        this.save();
      }
      if (voter.eligibleCategory && existing.eligibleCategory !== voter.eligibleCategory) {
        existing.eligibleCategory = voter.eligibleCategory;
        this.save();
      }
      return this.enrichElectionVoter(existing);
    }
    data.electionVoters.push(voter);
    this.save();
    return this.enrichElectionVoter(voter);
  }

  deleteElectionVoter(electionId: string, userId: string): boolean {
    const data = this.get();
    const initialLen = (data.electionVoters || []).length;
    data.electionVoters = (data.electionVoters || []).filter(item => !(item.electionId === electionId && item.userId === userId));
    data.electionVotes = (data.electionVotes || []).filter(item => !(item.electionId === electionId && item.voterId === userId));
    if (data.electionVoters.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  getElectionVoter(electionId: string, userId: string): ElectionVoter | undefined {
    const voter = (this.get().electionVoters || []).find(item => item.electionId === electionId && item.userId === userId);
    return voter ? this.enrichElectionVoter(voter) : undefined;
  }

  listElectionVotes(electionId: string, voterId?: string): ElectionVote[] {
    return (this.get().electionVotes || [])
      .filter(vote => vote.electionId === electionId && (!voterId || vote.voterId === voterId));
  }

  saveElectionVotes(electionId: string, voterId: string, votes: ElectionVote[]): ElectionVote[] {
    const data = this.get();
    data.electionVotes = data.electionVotes || [];
    const existing = data.electionVotes.some(vote => vote.electionId === electionId && vote.voterId === voterId);
    if (existing) {
      return data.electionVotes.filter(vote => vote.electionId === electionId && vote.voterId === voterId);
    }

    data.electionVotes.push(...votes);
    this.save();
    return votes;
  }

  getElectionDashboard(electionId?: string): ElectionDashboard {
    const election = electionId ? this.getElection(electionId) : this.getActiveElection();
    if (!election) {
      return { election: null, candidates: [], voters: [], votes: [] };
    }
    return {
      election,
      candidates: this.listElectionCandidates(election.id),
      voters: this.listElectionVoters(election.id),
      votes: this.listElectionVotes(election.id)
    };
  }

  getElectionBallot(userId: string): ElectionBallot {
    const election = this.getActiveElection();
    if (!election) {
      return { election: null, candidates: [], voter: null, votes: [] };
    }
    const voter = this.getElectionVoter(election.id, userId) || null;
    return {
      election,
      candidates: this.listElectionCandidates(election.id),
      voter,
      votes: this.listElectionVotes(election.id, userId)
    };
  }

  exportAdminUsers(query: AdminUserListQuery = {}): User[] {
    return filterAdminUsers(this.get().users, query);
  }

  // Sessions
  getSessions(): Session[] {
    return sortSessionsInProgrammeOrder(this.get().sessions);
  }

  saveSession(session: Session): Session {
    const data = this.get();
    const index = data.sessions.findIndex(s => s.id === session.id);
    if (index >= 0) {
      data.sessions[index] = { ...session };
    } else {
      data.sessions.push(session);
    }
    this.save();
    return session;
  }

  deleteSession(id: string): boolean {
    const data = this.get();
    const initialLen = data.sessions.length;
    data.sessions = data.sessions.filter(s => s.id !== id);
    if (data.sessions.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Notes
  getNotes(userId: string): SessionNote[] {
    return this.get().notes.filter(n => n.userId === userId);
  }

  saveNote(note: Partial<SessionNote> & { userId: string; sessionId: string }): SessionNote {
    const data = this.get();
    const existingIndex = data.notes.findIndex(
        n => n.userId === note.userId && n.sessionId === note.sessionId
    );

    let savedNote: SessionNote;
    if (existingIndex >= 0) {
      savedNote = {
        ...data.notes[existingIndex],
        content: note.content ?? '',
        updatedAt: new Date().toISOString()
      };
      data.notes[existingIndex] = savedNote;
    } else {
      savedNote = {
        id: note.id ?? `note_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        userId: note.userId,
        sessionId: note.sessionId,
        content: note.content ?? '',
        updatedAt: new Date().toISOString()
      };
      data.notes.push(savedNote);
    }
    this.save();
    return savedNote;
  }

  deleteNote(userId: string, sessionId: string): boolean {
    const data = this.get();
    const initialLen = data.notes.length;
    data.notes = data.notes.filter(n => !(n.userId === userId && n.sessionId === sessionId));
    if (data.notes.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Speakers
  getSpeakers(): Speaker[] {
    return this.get().speakers;
  }

  saveSpeaker(speaker: Speaker): Speaker {
    const data = this.get();
    const index = data.speakers.findIndex(s => s.id === speaker.id);
    if (index >= 0) {
      data.speakers[index] = { ...speaker };
    } else {
      data.speakers.push(speaker);
    }
    this.save();
    return speaker;
  }

  deleteSpeaker(id: string): boolean {
    const data = this.get();
    const initialLen = data.speakers.length;
    data.speakers = data.speakers.filter(s => s.id !== id);
    if (data.speakers.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Sponsors
  getSponsors(): Sponsor[] {
    return this.get().sponsors;
  }

  saveSponsor(sponsor: Sponsor): Sponsor {
    const data = this.get();
    const index = data.sponsors.findIndex(s => s.id === sponsor.id);
    if (index >= 0) {
      data.sponsors[index] = { ...sponsor };
    } else {
      data.sponsors.push(sponsor);
    }
    this.save();
    return sponsor;
  }

  deleteSponsor(id: string): boolean {
    const data = this.get();
    const initialLen = data.sponsors.length;
    data.sponsors = data.sponsors.filter(s => s.id !== id);
    if (data.sponsors.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Testimonials
  getTestimonials(): Testimonial[] {
    return this.get().testimonials;
  }

  saveTestimonial(t: Testimonial): Testimonial {
    const data = this.get();
    const index = data.testimonials.findIndex(x => x.id === t.id);
    if (index >= 0) {
      data.testimonials[index] = { ...t };
    } else {
      data.testimonials.push(t);
    }
    this.save();
    return t;
  }

  deleteTestimonial(id: string): boolean {
    const data = this.get();
    const initialLen = data.testimonials.length;
    data.testimonials = data.testimonials.filter(x => x.id !== id);
    if (data.testimonials.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Gallery
  getGallery(): GalleryImage[] {
    return this.get().gallery;
  }

  saveGalleryImage(img: GalleryImage): GalleryImage {
    const data = this.get();
    const index = data.gallery.findIndex(g => g.id === img.id);
    if (index >= 0) {
      data.gallery[index] = { ...img };
    } else {
      data.gallery.push(img);
    }
    this.save();
    return img;
  }

  deleteGalleryImage(id: string): boolean {
    const data = this.get();
    const initialLen = data.gallery.length;
    data.gallery = data.gallery.filter(g => g.id !== id);
    if (data.gallery.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Venue
  getVenue(): VenueInfo {
    return this.get().venue;
  }

  saveVenue(venue: VenueInfo): VenueInfo {
    const data = this.get();
    data.venue = { ...venue };
    this.save();
    return venue;
  }

  // Adventures
  getAdventures(): AdventureActivity[] {
    return this.get().adventures;
  }

  saveAdventure(adventure: AdventureActivity): AdventureActivity {
    const data = this.get();
    const index = data.adventures.findIndex(a => a.id === adventure.id);
    if (index >= 0) {
      data.adventures[index] = { ...adventure };
    } else {
      data.adventures.push(adventure);
    }
    this.save();
    return adventure;
  }

  deleteAdventure(id: string): boolean {
    const data = this.get();
    const initialLen = data.adventures.length;
    data.adventures = data.adventures.filter(a => a.id !== id);
    if (data.adventures.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Feedback submissions
  getFeedback(): FeedbackSubmission[] {
    return this.get().feedback;
  }

  saveFeedback(fb: FeedbackSubmission): FeedbackSubmission {
    const data = this.get();
    data.feedback.push(fb);
    this.save();
    return fb;
  }

  // Google Drive
  getGoogleDriveLink(): string {
    return this.get().googleDriveLink;
  }

  saveGoogleDriveLink(link: string): string {
    const data = this.get();
    data.googleDriveLink = link;
    this.save();
    return link;
  }
}

export const db = new FileDatabase();

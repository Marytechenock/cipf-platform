import {
  AdminUserListQuery,
  PaginatedResult,
  PublicAttendeeDirectoryEntry,
  PublicAttendeeListQuery,
  StoredUser as User
} from '../types';

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'professor']);
const NON_EMAIL_PUNCTUATION = /[^\p{L}\p{N}@._+\-\s]+/gu;
const MULTISPACE = /\s+/g;
const EMAIL_TOKEN_SPLIT = /[@._+\-]+/g;

interface SearchCandidate {
  user: User;
  normalizedFullName: string;
  normalizedReversedName: string;
  normalizedEmail: string;
  tokens: string[];
  score: number;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(NON_EMAIL_PUNCTUATION, ' ')
    .replace(MULTISPACE, ' ')
    .trim();
}

function tokenizeSearchText(value: string, removeHonorifics: boolean): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length > 0)
    .filter(token => !removeHonorifics || !HONORIFICS.has(token));
}

function getUserSearchTokens(user: User): string[] {
  const nameTokens = tokenizeSearchText(`${user.firstName} ${user.lastName}`, false);
  const emailTokens = normalizeSearchText(user.email ?? '')
    .split(EMAIL_TOKEN_SPLIT)
    .map(token => token.trim())
    .filter(token => token.length > 0);

  return [...new Set([...nameTokens, ...emailTokens])];
}

export function getMeaningfulSearchQuery(query: string): string {
  return normalizeSearchText(query);
}

export function getSearchTokens(query: string, removeHonorifics: boolean = true): string[] {
  return tokenizeSearchText(query, removeHonorifics);
}

export function hasMinimumSearchLength(query: string, minLength: number = 2): boolean {
  const compactQuery = getMeaningfulSearchQuery(query).replace(/\s/g, '');
  return compactQuery.length >= minLength;
}

function scoreQueryToken(token: string, candidate: SearchCandidate): number | null {
  if (
    candidate.normalizedFullName === token ||
    candidate.normalizedReversedName === token ||
    candidate.normalizedEmail === token
  ) {
    return 0;
  }

  if (candidate.tokens.some(candidateToken => candidateToken === token)) {
    return 1;
  }

  if (candidate.tokens.some(candidateToken => candidateToken.startsWith(token))) {
    return 2;
  }

  if (
    candidate.normalizedFullName.includes(token) ||
    candidate.normalizedReversedName.includes(token) ||
    candidate.normalizedEmail.includes(token) ||
    candidate.tokens.some(candidateToken => candidateToken.includes(token))
  ) {
    return 3;
  }

  return null;
}

function getSearchCandidate(user: User): SearchCandidate {
  const normalizedFullName = normalizeSearchText(`${user.firstName} ${user.lastName}`);
  const normalizedReversedName = normalizeSearchText(`${user.lastName} ${user.firstName}`);
  const normalizedEmail = normalizeSearchText(user.email ?? '');

  return {
    user,
    normalizedFullName,
    normalizedReversedName,
    normalizedEmail,
    tokens: getUserSearchTokens(user),
    score: Number.MAX_SAFE_INTEGER
  };
}

function createTokensFromParts(...parts: Array<string | undefined>): string[] {
  return [...new Set(
    parts
      .flatMap(part => tokenizeSearchText(part ?? '', false))
      .filter(token => token.length > 0)
  )];
}

function createSearchTexts(...parts: Array<string | undefined>): string[] {
  return parts
    .map(part => normalizeSearchText(part ?? ''))
    .filter(part => part.length > 0);
}

interface GenericCandidate<T> {
  item: T;
  exactTexts: string[];
  tokens: string[];
  score: number;
  sortKey: string;
}

function scoreCandidateToken(token: string, candidate: GenericCandidate<unknown>): number | null {
  if (candidate.exactTexts.some(text => text === token)) {
    return 0;
  }

  if (candidate.tokens.some(candidateToken => candidateToken === token)) {
    return 1;
  }

  if (candidate.tokens.some(candidateToken => candidateToken.startsWith(token))) {
    return 2;
  }

  if (
    candidate.exactTexts.some(text => text.includes(token)) ||
    candidate.tokens.some(candidateToken => candidateToken.includes(token))
  ) {
    return 3;
  }

  return null;
}

function rankCandidates<T>(
  query: string,
  candidates: GenericCandidate<T>[],
  limit?: number
): GenericCandidate<T>[] {
  const normalizedQuery = getMeaningfulSearchQuery(query);
  const queryTokens = getSearchTokens(query, true);

  if (!normalizedQuery || queryTokens.length === 0) {
    return [];
  }

  const ranked = candidates
    .map(candidate => {
      if (candidate.exactTexts.some(text => text === normalizedQuery)) {
        return { ...candidate, score: 0 };
      }

      const tokenScores = queryTokens.map(token => scoreCandidateToken(token, candidate));
      if (tokenScores.some(score => score === null)) {
        return null;
      }

      return {
        ...candidate,
        score: Math.max(...tokenScores.filter((score): score is number => score !== null)) + 1
      };
    })
    .filter((candidate): candidate is GenericCandidate<T> => candidate !== null)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }
      return left.sortKey.localeCompare(right.sortKey);
    });

  return typeof limit === 'number' ? ranked.slice(0, limit) : ranked;
}

function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const start = (safePage - 1) * safePageSize;
  const pagedItems = items.slice(start, start + safePageSize);

  return {
    items: pagedItems,
    page: safePage,
    pageSize: safePageSize,
    total: items.length,
    hasMore: start + safePageSize < items.length
  };
}

function normalizePage(value: number | undefined, defaultValue: number): number {
  if (!value || Number.isNaN(value)) {
    return defaultValue;
  }

  return Math.max(1, Math.floor(value));
}

function normalizePageSize(value: number | undefined, defaultValue: number, maxValue: number): number {
  if (!value || Number.isNaN(value)) {
    return defaultValue;
  }

  return Math.min(maxValue, Math.max(1, Math.floor(value)));
}

export function filterAdminUsers(users: User[], query: AdminUserListQuery = {}): User[] {
  const status = query.status ?? 'all';
  const role = query.role ?? 'all';
  const checkedIn = query.checkedIn ?? 'all';
  const sort = query.sort ?? 'created_desc';
  const normalizedQuery = getMeaningfulSearchQuery(query.q ?? '');

  let filtered = users.filter(user => {
    if (status !== 'all' && user.status !== status) {
      return false;
    }

    if (role !== 'all' && user.role !== role) {
      return false;
    }

    if (checkedIn === 'true' && !user.checkedIn) {
      return false;
    }

    if (checkedIn === 'false' && user.checkedIn) {
      return false;
    }

    return true;
  });

  if (normalizedQuery) {
    const candidates: GenericCandidate<User>[] = filtered.map(user => ({
      item: user,
      exactTexts: createSearchTexts(
        `${user.firstName} ${user.lastName}`,
        `${user.lastName} ${user.firstName}`,
        user.email,
        user.organization,
        user.position
      ),
      tokens: createTokensFromParts(
        user.firstName,
        user.lastName,
        user.email?.replace(EMAIL_TOKEN_SPLIT, ' '),
        user.organization,
        user.position
      ),
      score: Number.MAX_SAFE_INTEGER,
      sortKey: `${user.firstName} ${user.lastName}`
    }));

    filtered = rankCandidates(normalizedQuery, candidates).map(candidate => candidate.item);
    return filtered;
  }

  filtered = [...filtered];

  if (sort === 'name_asc') {
    filtered.sort((left, right) =>
      `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`)
    );
  } else {
    filtered.reverse();
  }

  return filtered;
}

export function listAdminUsers(users: User[], query: AdminUserListQuery = {}): PaginatedResult<User> {
  const page = normalizePage(query.page, 1);
  const pageSize = normalizePageSize(query.pageSize, 25, 100);
  return paginate(filterAdminUsers(users, query), page, pageSize);
}

export function filterPublicAttendees(
  users: User[],
  query: PublicAttendeeListQuery = {}
): PublicAttendeeDirectoryEntry[] {
  const attendees = users
    .filter(user => user.role === 'attendee' && user.status === 'active')
    .map(user => ({
      user,
      entry: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        organization: user.organization || 'N/A'
      }
    }));

  const normalizedQuery = getMeaningfulSearchQuery(query.q ?? '');

  let results: PublicAttendeeDirectoryEntry[];
  if (normalizedQuery) {
    const candidates: GenericCandidate<typeof attendees[number]>[] = attendees.map(({ user, entry }) => ({
      item: { user, entry },
      exactTexts: createSearchTexts(
        `${user.firstName} ${user.lastName}`,
        `${user.lastName} ${user.firstName}`,
        user.organization
      ),
      tokens: createTokensFromParts(user.firstName, user.lastName, user.organization),
      score: Number.MAX_SAFE_INTEGER,
      sortKey: `${user.lastName} ${user.firstName}`
    }));

    results = rankCandidates(normalizedQuery, candidates).map(candidate => candidate.item.entry);
  } else {
    results = attendees
      .map(({ entry }) => entry)
      .sort((left, right) =>
        `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`)
      );
  }

  return results;
}

export function listPublicAttendees(
  users: User[],
  query: PublicAttendeeListQuery = {}
): PaginatedResult<PublicAttendeeDirectoryEntry> {
  const page = normalizePage(query.page, 1);
  const pageSize = normalizePageSize(query.pageSize, 25, 50);
  return paginate(filterPublicAttendees(users, query), page, pageSize);
}

export function searchAttendees(users: User[], query: string, limit: number = 10): User[] {
  const rankedMatches = rankCandidates(query, users
    .filter(user => user.role === 'attendee' && user.status === 'active')
    .map(getSearchCandidate)
    .map(candidate => ({
      item: candidate.user,
      exactTexts: [candidate.normalizedFullName, candidate.normalizedReversedName, candidate.normalizedEmail],
      tokens: candidate.tokens,
      score: Number.MAX_SAFE_INTEGER,
      sortKey: `${candidate.user.firstName} ${candidate.user.lastName}`
    })), limit);

  return rankedMatches.map(candidate => candidate.item);
}

export function toPublicAttendeeSearchResults(users: User[]): PublicAttendeeDirectoryEntry[] {
  return users.map(user => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    organization: user.organization
  }));
}

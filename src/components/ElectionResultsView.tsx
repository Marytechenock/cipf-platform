import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { Election, ElectionCandidate, ElectionDashboard, ElectionVoter } from '../types';
import {
  Award,
  BarChart3,
  CheckCircle2,
  Download,
  FileText,
  Loader,
  RefreshCcw,
  Trophy,
  Users,
  Vote
} from 'lucide-react';

const RESULT_COLORS = ['#22C55E', '#2F80ED', '#60A5FA', '#A855F7', '#F59E0B', '#EF4444'];

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function formatDateTime(value?: string) {
  if (!value) return 'Not published';
  return new Date(value).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getCandidateVotes(candidate: ElectionCandidate) {
  return candidate.voteCount || 0;
}

function getDisplayName(candidate?: ElectionCandidate) {
  return candidate?.fullName || 'No winner yet';
}

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = rows.map(row => row.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ElectionResultsView() {
  const [dashboard, setDashboard] = useState<ElectionDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadResults = async (showLoader = false) => {
    if (showLoader) setIsLoading(true);
    setError('');
    try {
      const data = await api.getAdminElectionDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load election results.');
    } finally {
      if (showLoader) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadResults(true);
    const interval = window.setInterval(() => void loadResults(false), 10000);
    return () => window.clearInterval(interval);
  }, []);

  const election = dashboard?.election || null;
  const candidates = dashboard?.candidates || [];
  const voters = dashboard?.voters || [];
  const votes = dashboard?.votes || [];

  const submittedVoterIds = useMemo(() => new Set(votes.map(vote => vote.voterId)), [votes]);
  const submittedCount = submittedVoterIds.size;
  const eligibleCount = voters.length;
  const turnout = percent(submittedCount, eligibleCount);

  const chairpersonCandidates = useMemo(
    () => candidates.filter(candidate => candidate.category === 'employee_representative').sort((a, b) => getCandidateVotes(b) - getCandidateVotes(a)),
    [candidates]
  );
  const boardCandidates = useMemo(
    () => ['employer_cifoz', 'employer_zbca'].flatMap(category => candidates.filter(candidate => candidate.category === category).sort((a, b) => getCandidateVotes(b) - getCandidateVotes(a))),
    [candidates]
  );
  const chairVoteTotal = chairpersonCandidates.reduce((sum, candidate) => sum + getCandidateVotes(candidate), 0);
  const boardShareTotal = Math.max(submittedCount, 1);
  const chairWinner = chairpersonCandidates[0];
  const boardRank = (candidate: ElectionCandidate) => boardCandidates.filter(item => item.category === candidate.category).indexOf(candidate) + 1;
  const boardPosition = (candidate: ElectionCandidate) => candidate.category === 'employer_cifoz' ? 'Employer Representative (CIFOZ)' : 'Employer Representative (ZBCA)';
  const maxChairVotes = Math.max(...chairpersonCandidates.map(getCandidateVotes), 1);
  const employerGroups = [
    { category: 'employer_cifoz', label: 'CIFOZ Employer Representative' },
    { category: 'employer_zbca', label: 'ZBCA Employer Representative' }
  ] as const;

  const exportResults = () => {
    if (!election) return;
    downloadCsv(`election-results-${election.id}.csv`, [
      ['Category', 'Rank', 'Candidate', 'Organization', 'Position', 'Votes', 'Share', 'Status'],
      ...chairpersonCandidates.map((candidate, index) => [
        'Employee Representative',
        String(index + 1),
        candidate.fullName,
        candidate.organization,
        candidate.position,
        String(getCandidateVotes(candidate)),
        `${percent(getCandidateVotes(candidate), chairVoteTotal)}%`,
        index === 0 && chairVoteTotal > 0 ? 'Winner' : ''
      ]),
      ...boardCandidates.map(candidate => [
        boardPosition(candidate),
        String(boardRank(candidate)),
        candidate.fullName,
        candidate.organization,
        candidate.position,
        String(getCandidateVotes(candidate)),
        `${percent(getCandidateVotes(candidate), boardShareTotal)}%`,
        boardRank(candidate) === 1 && getCandidateVotes(candidate) > 0 ? 'Elected' : ''
      ])
    ]);
  };

  const exportAuditLog = () => {
    if (!election) return;
    downloadCsv(`election-audit-${election.id}.csv`, [
      ['Voter', 'Identifier', 'Company', 'Status', 'Submitted At'],
      ...voters.map((voter: ElectionVoter) => [
        `${voter.user?.firstName || ''} ${voter.user?.lastName || ''}`.trim(),
        voter.identifier || '',
        voter.user?.organization || '',
        voter.hasVoted ? 'Submitted' : 'Not Voted',
        voter.votedAt || ''
      ])
    ]);
  };

  if (isLoading) {
    return (
      <div className="min-h-[70vh] rounded-xl border border-gray-200 bg-white p-10 text-center shadow-xl">
        <Loader className="mx-auto h-9 w-9 animate-spin text-[#A88D55]" />
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#A88D55]">Loading election results</p>
      </div>
    );
  }

  if (error || !election) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-8 text-center shadow-xl">
        <p className="text-sm font-semibold text-red-600">{error || 'No election has been created yet.'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 bg-[#F6F8FB] p-3 text-slate-950 animate-fadeIn">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#A88D55]">Election Results</p>
          <h1 className="text-2xl font-semibold leading-tight text-[#17233F]">{election.title}</h1>
          <p className="mt-1 text-xs font-medium text-gray-500">{election.description || 'Official election results.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportResults} className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-[#17233F] shadow-sm hover:bg-gray-50">
            <Download className="h-3.5 w-3.5" /> Export Results
          </button>
          <button type="button" onClick={exportAuditLog} className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-[#17233F] shadow-sm hover:bg-gray-50">
            <FileText className="h-3.5 w-3.5" /> View Audit Log
          </button>
          <button type="button" onClick={() => loadResults(true)} className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-600 shadow-sm hover:bg-gray-50">
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 text-[10px] font-medium text-gray-500">
        <span className={`rounded-full px-3 py-1 font-semibold ${election.status === 'closed' ? 'bg-red-50 text-red-600' : election.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
          Voting {election.status === 'closed' ? 'Closed' : election.status}
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> {election.status === 'closed' ? 'Voting closed' : 'Live results'}
        </span>
        <span>Published: {formatDateTime(election.closedAt || election.updatedAt)}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={<Users className="h-5 w-5" />} label="Total Votes" value={votes.length.toLocaleString()} tone="blue" />
        <SummaryCard icon={<Vote className="h-5 w-5" />} label="Turnout" value={`${turnout}%`} detail={`${submittedCount.toLocaleString()} of ${eligibleCount.toLocaleString()} eligible voters`} tone="sky" />
        <SummaryCard icon={<Trophy className="h-5 w-5" />} label="Employee Representative" value={getDisplayName(chairVoteTotal > 0 ? chairWinner : undefined)} detail={chairWinner ? `${getCandidateVotes(chairWinner).toLocaleString()} votes (${percent(getCandidateVotes(chairWinner), chairVoteTotal)}%)` : 'Awaiting votes'} tone="gold" />
        {employerGroups.map(group => {
          const groupCandidates = boardCandidates.filter(candidate => candidate.category === group.category);
          const leader = groupCandidates[0];
          const groupVotes = groupCandidates.reduce((sum, candidate) => sum + getCandidateVotes(candidate), 0);
          return <div key={group.category}><SummaryCard icon={<Users className="h-5 w-5" />} label={group.label} value={getDisplayName(groupVotes > 0 ? leader : undefined)} detail={leader && groupVotes > 0 ? `${getCandidateVotes(leader).toLocaleString()} votes (${percent(getCandidateVotes(leader), groupVotes)}%)` : 'Awaiting votes'} tone="green" /></div>;
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(420px,0.9fr)]">
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            <Trophy className="h-4 w-4 text-[#A88D55]" />
            <h2 className="text-sm font-semibold text-[#17233F]">Employee Representative Results</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-gray-50 text-[10px] font-semibold uppercase text-gray-500">
                <tr>
                  <th className="w-12 px-4 py-2">#</th>
                  <th className="px-4 py-2">Candidate</th>
                  <th className="w-24 px-4 py-2 text-right">Votes</th>
                  <th className="w-24 px-4 py-2 text-right">Share</th>
                  <th className="w-52 px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {chairpersonCandidates.map((candidate, index) => {
                  const votesForCandidate = getCandidateVotes(candidate);
                  const share = percent(votesForCandidate, chairVoteTotal);
                  const winner = index === 0 && chairVoteTotal > 0;
                  return (
                    <tr key={candidate.id} className={winner ? 'bg-amber-50/70' : 'bg-white'}>
                      <td className="px-4 py-3">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold ${winner ? 'bg-amber-100 text-[#8B6914]' : 'bg-gray-100 text-gray-500'}`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <CandidateIdentity candidate={candidate} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{votesForCandidate.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold">{share}%</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-200">
                            <div className="h-full rounded-full bg-[#22C55E]" style={{ width: `${Math.max(share, votesForCandidate > 0 ? 3 : 0)}%` }} />
                          </div>
                          {winner ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                              <Trophy className="h-3 w-3" /> Winner
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#2F80ED]" />
            <h2 className="text-sm font-semibold text-[#17233F]">Employee Representative Vote Distribution</h2>
          </div>
          <div className="flex h-72 items-end gap-5 border-l border-b border-gray-200 px-5 pb-8 pt-4">
            {chairpersonCandidates.map((candidate, index) => {
              const count = getCandidateVotes(candidate);
              const height = Math.max((count / maxChairVotes) * 100, count > 0 ? 8 : 2);
              return (
                <div key={candidate.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-xs font-semibold text-[#17233F]">{count.toLocaleString()}</span>
                  <div
                    className="w-full max-w-[86px] rounded-t-md transition-all duration-500"
                    style={{ height: `${height}%`, backgroundColor: RESULT_COLORS[index % RESULT_COLORS.length] }}
                  />
                  <div className="min-h-[34px] text-center">
                    <p className="line-clamp-1 text-[10px] font-semibold text-[#17233F]">{candidate.fullName}</p>
                    <p className="text-[9px] text-gray-500">({percent(count, chairVoteTotal)}%)</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
      {employerGroups.map(group => {
        const groupCandidates = boardCandidates.filter(candidate => candidate.category === group.category);
        const maxGroupVotes = Math.max(...groupCandidates.map(getCandidateVotes), 1);
        return <section key={group.category} className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-[#A88D55]" />
            <h2 className="text-sm font-semibold text-[#17233F]">{group.label} Results</h2>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-semibold text-[#8B6914]">One seat</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-gray-50 text-[10px] font-semibold uppercase text-gray-500">
              <tr>
                <th className="w-12 px-4 py-2">#</th>
                <th className="px-4 py-2">Candidate</th>
                <th className="w-24 px-4 py-2 text-right">Votes</th>
                <th className="w-24 px-4 py-2 text-right">Share</th>
                <th className="w-52 px-4 py-2">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groupCandidates.map(candidate => {
                const votesForCandidate = getCandidateVotes(candidate);
                const share = percent(votesForCandidate, boardShareTotal);
                const elected = boardRank(candidate) === 1 && votesForCandidate > 0;
                return (
                  <tr key={candidate.id}>
                    <td className="px-4 py-2 font-semibold text-gray-600">{boardRank(candidate)}</td>
                    <td className="px-4 py-2">
                      <CandidateIdentity candidate={candidate} />
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">{votesForCandidate.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-semibold">{share}%</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-40 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-[#22C55E]"
                            style={{ width: `${Math.max((votesForCandidate / maxGroupVotes) * 100, votesForCandidate > 0 ? 3 : 0)}%` }}
                          />
                        </div>
                        {elected && (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700">Elected</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>;
      })}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone: 'blue' | 'sky' | 'gold' | 'green';
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    sky: 'bg-sky-50 text-sky-600',
    gold: 'bg-amber-50 text-[#A88D55]',
    green: 'bg-emerald-50 text-emerald-600'
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-full ${tones[tone]}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase text-gray-500">{label}</p>
          <p className="truncate text-xl font-semibold text-[#17233F]">{value}</p>
          {detail && <p className="mt-0.5 truncate text-[10px] font-medium text-gray-500">{detail}</p>}
        </div>
      </div>
    </div>
  );
}

function CandidateIdentity({ candidate }: { candidate: ElectionCandidate }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">
        {candidate.photoUrl ? (
          <img src={candidate.photoUrl} alt={candidate.fullName} className="h-full w-full object-cover" />
        ) : (
          candidate.fullName.split(/\s+/).slice(0, 2).map(part => part[0]).join('')
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-[#17233F]">{candidate.fullName}</p>
        <p className="truncate text-[10px] text-gray-500">{candidate.organization || candidate.position || 'Candidate'}</p>
      </div>
    </div>
  );
}

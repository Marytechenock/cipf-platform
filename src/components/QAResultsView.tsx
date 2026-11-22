import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { QAQuestion, QAResponse } from '../types';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  List,
  Loader,
  MessageSquareText,
  PieChart,
  RefreshCcw,
  Square,
  Users
} from 'lucide-react';

interface QAResultsViewProps {
  questionId: string;
}

const MULTIPLE_CHOICE_LABELS = ['A', 'B', 'C', 'D'];
const RESULT_COLORS = ['#1E9BF0', '#F5B82E', '#EF4444', '#16A34A', '#8B5CF6'];

function formatTime(value?: string) {
  if (!value) return '--:--';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value?: string) {
  if (!value) return 'Not updated';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function getElapsed(value?: string, now = Date.now()) {
  if (!value) return '00:00';
  const elapsed = Math.max(now - new Date(value).getTime(), 0);
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function QAResultsView({ questionId }: QAResultsViewProps) {
  const [question, setQuestion] = useState<QAQuestion | null>(null);
  const [questions, setQuestions] = useState<QAQuestion[]>([]);
  const [responses, setResponses] = useState<QAResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());

  const loadResults = async (showLoader = false, signal?: AbortSignal) => {
    if (showLoader) setIsLoading(true);
    setError('');
    try {
      const data = await api.getAdminQAResponses(questionId, signal);
      if (signal?.aborted) return;
      setQuestion(data.question);
      setResponses(data.responses);
      setLastUpdatedAt(new Date().toISOString());

      if (data.question?.sessionId) {
        const sessionQuestions = await api.getAdminQAQuestions(data.question.sessionId, signal);
        if (signal?.aborted) return;
        setQuestions(sessionQuestions);
      }
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Could not load Q&A results.');
    } finally {
      if (showLoader && !signal?.aborted) setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const update = async (initial = false) => {
      await loadResults(initial, controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(() => void update(), 3000);
    };
    void update(true);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [questionId]);

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const chartRows = useMemo(() => {
    if (!question) return [];

    const options = question.type === 'rating'
      ? (question.options.length > 0 ? question.options : ['1', '2', '3', '4', '5'])
      : question.type === 'yes_no'
        ? (question.options.length > 0 ? question.options : ['Yes', 'No'])
        : question.options;

    return options.map((option, index) => {
      const label = question.type === 'multiple_choice' ? MULTIPLE_CHOICE_LABELS[index] : option;
      const count = responses.filter(response => response.answer === label || response.answer === option).length;
      const percent = responses.length > 0 ? Math.round((count / responses.length) * 100) : 0;
      return {
        label,
        option,
        count,
        percent,
        color: RESULT_COLORS[index % RESULT_COLORS.length]
      };
    });
  }, [question, responses]);

  const questionIndex = questions.findIndex(item => item.id === questionId);
  const questionNumber = questionIndex >= 0 ? questionIndex + 1 : question?.order || 1;
  const totalQuestions = questions.length || questionNumber;
  const maxCount = Math.max(...chartRows.map(row => row.count), 1);
  const responseTotal = responses.length;
  const latestResponses = responses.slice(0, 7);
  const averageRating = question?.type === 'rating' && responseTotal > 0
    ? (responses.reduce((sum, response) => sum + Number(response.answer || 0), 0) / responseTotal).toFixed(1)
    : null;
  const liveQuestion = question?.status === 'live';
  const remainingQuestions = questions.filter(item => item.order > (question?.order || 0));

  const exportResults = () => {
    if (!question) return;
    const rows = [
      ['Name', 'Company', 'Answer', 'Submitted At'],
      ...responses.map(response => [
        `${response.attendee?.firstName || ''} ${response.attendee?.lastName || ''}`.trim(),
        response.attendee?.organization || '',
        response.answer,
        new Date(response.submittedAt).toISOString()
      ])
    ];
    const csv = rows.map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qa-results-${question.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const closeQuestion = async () => {
    if (!question || question.status !== 'live') return;
    await api.closeAdminQAQuestion(question.id);
    await loadResults(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-[70vh] rounded-xl border border-gray-200 bg-white p-10 text-center shadow-xl">
        <Loader className="mx-auto h-9 w-9 animate-spin text-[#B8922A]" />
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#8B6914]">Loading live results</p>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-8 text-center shadow-xl">
        <p className="text-sm font-semibold text-red-600">{error || 'Question not found.'}</p>
      </div>
    );
  }

  const isDashboardQuestion = question.type === 'multiple_choice' || question.type === 'rating' || question.type === 'yes_no';

  if (!isDashboardQuestion) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-3">
        <div className="rounded-xl border border-[#E5D28A] bg-white px-4 py-3 shadow-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B6914]">Current Question</p>
          <h1 className="mt-2 text-lg font-semibold text-slate-950">{question.questionText}</h1>
        </div>
        <h2 className="text-sm font-semibold text-[#8B6914]">Replies from attendees</h2>
        <div className="grid gap-2 md:grid-cols-2" aria-live="polite" aria-relevant="additions text">
          {responses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center md:col-span-2">
              <MessageSquareText className="mx-auto h-9 w-9 text-gray-300" />
              <p className="mt-3 text-sm font-semibold text-gray-500">No written responses yet</p>
            </div>
          ) : responses.map(response => (
            <div key={response.id} className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-sm font-semibold leading-relaxed text-gray-700">{response.answer}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {response.attendee?.firstName} {response.attendee?.lastName}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1360px] bg-[#F3F4F6] p-2 text-slate-950 animate-fadeIn">
      <div className="overflow-hidden rounded-md border border-gray-300 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase leading-none text-[#A88D55]">Current Question</p>
            <h1 className="truncate text-xl font-semibold leading-tight text-black">
              {question.questionText}
            </h1>
          </div>
          <div className="flex min-w-[120px] flex-col items-end gap-1">
            <span className={`inline-flex items-center gap-1 rounded-sm px-3 py-1 text-[10px] font-semibold uppercase text-white ${liveQuestion ? 'bg-red-600' : 'bg-gray-600'}`}>
              <span className="h-2 w-2 rounded-full bg-white" /> {liveQuestion ? 'Live' : question.status}
            </span>
            <span className="text-[10px] font-bold text-[#A88D55]">Question {questionNumber} of {totalQuestions}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-gray-200 bg-white p-2 lg:grid-cols-5">
          <div className="flex items-center gap-2 rounded-sm bg-[#EAF4FF] p-2">
            <Users className="h-6 w-6 text-[#1E9BF0]" />
            <div>
              <p className="text-[9px] font-semibold uppercase text-gray-500">Total Responses</p>
              <p className="text-lg font-semibold">{responseTotal}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-sm bg-[#EAFBF0] p-2">
            <CheckCircle2 className="h-6 w-6 text-[#16A34A]" />
            <div>
              <p className="text-[9px] font-semibold uppercase text-gray-500">{question.type === 'rating' ? 'Average Rating' : 'Response Rate'}</p>
              <p className="text-lg font-semibold">{averageRating ? `${averageRating}/5` : responseTotal > 0 ? '100%' : '0%'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-sm bg-[#FFF7DE] p-2">
            <Clock className="h-6 w-6 text-[#D59B00]" />
            <div>
              <p className="text-[9px] font-semibold uppercase text-gray-500">Time Live</p>
              <p className="text-lg font-semibold">{getElapsed(question.publishedAt || question.updatedAt, clockNow)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadResults(true)}
            className="flex items-center justify-center rounded-sm border border-gray-200 bg-gray-50 p-2 text-gray-700 hover:bg-gray-100"
            title="Refresh results"
          >
            <RefreshCcw className="h-5 w-5" />
          </button>
          <div className="rounded-sm bg-gray-50 p-2">
            <p className="text-[9px] font-semibold uppercase text-gray-500">Last Updated</p>
            <p className="text-base font-semibold">{formatDateTime(lastUpdatedAt)}</p>
          </div>
        </div>

        <div className="grid gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-white px-3 py-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#168DE2]" />
                <p className="text-xs font-semibold uppercase text-[#17233F]">{question.type === 'rating' ? 'Rating Results' : 'Multiple Choice Results'}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-[10px] font-semibold text-[#17233F]">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Auto updating
              </span>
            </div>
            <div className="space-y-2 p-3">
              {chartRows.map((row) => (
                <div key={row.label} className="grid grid-cols-[32px_minmax(110px,180px)_minmax(0,1fr)_64px_70px] items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold text-[#17233F]"
                    style={{ backgroundColor: `${row.color}33`, border: `1px solid ${row.color}55` }}
                  >
                    {row.label}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium leading-tight text-gray-800">
                      {question.type === 'rating' ? 'Rating' : row.option}
                    </p>
                  </div>
                  <div className="h-7 overflow-hidden rounded-sm bg-gray-200">
                    <div
                      className="h-full rounded-sm transition-all duration-500"
                      style={{ width: `${row.percent}%`, backgroundColor: row.color }}
                    />
                  </div>
                  <p className="text-right text-base font-semibold">{row.percent}%</p>
                  <p className="text-[10px] font-semibold leading-tight text-gray-500">
                    {row.count}<br />responses
                  </p>
                </div>
              ))}
            </div>
          </section>

          <aside className="rounded-sm border border-gray-200 bg-white">
            <div className="bg-[#F9D65C] px-2 py-1">
              <p className="text-xs font-semibold uppercase text-[#3A2A00]">Live Feed</p>
            </div>
            <div className="grid grid-cols-[28px_1fr_1fr_54px] gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1 text-[9px] font-semibold uppercase text-gray-500">
              <span>Option</span>
              <span>Name</span>
              <span>Company</span>
              <span>Time</span>
            </div>
            <div className="divide-y divide-gray-100">
              {latestResponses.length === 0 ? (
                <p className="p-4 text-center text-xs font-semibold text-gray-400">Waiting for submissions</p>
              ) : latestResponses.map(response => (
                <div key={response.id} className="grid grid-cols-[28px_1fr_1fr_54px] gap-1 px-2 py-1 text-[10px]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#1E9BF0] font-semibold text-white">{response.answer}</span>
                  <span className="truncate font-semibold">{response.attendee?.firstName} {response.attendee?.lastName}</span>
                  <span className="truncate text-gray-600">{response.attendee?.organization || 'Not listed'}</span>
                  <span className="text-gray-500">{formatTime(response.submittedAt)}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="grid gap-2 px-2 pb-2 lg:grid-cols-[1fr_1fr_1.25fr]">
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-3 py-2">
              <BarChart3 className="h-4 w-4 text-[#A88D55]" />
              <p className="text-xs font-semibold uppercase text-[#17233F]">Results Bar Graph</p>
            </div>
            <div className="flex h-36 items-end gap-4 px-5 pb-6 pt-3">
              {chartRows.map(row => (
                <div key={row.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <p className="text-xs font-semibold">{row.percent}%</p>
                  <div
                    className="w-full max-w-[50px] rounded-t-sm transition-all duration-500"
                    style={{
                      height: `${row.count === 0 ? 4 : Math.max((row.count / maxCount) * 100, 12)}%`,
                      backgroundColor: row.color
                    }}
                  />
                  <p className="text-xs font-semibold">{row.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-3 py-2">
              <PieChart className="h-4 w-4 text-[#A88D55]" />
              <p className="text-xs font-semibold uppercase text-[#17233F]">Session Breakdown</p>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-3 p-3">
              <div
                className="flex h-24 w-24 items-center justify-center rounded-full"
                style={{ background: chartRows.length > 0 ? `conic-gradient(${chartRows.map((row, index) => `${row.color} ${index === 0 ? 0 : chartRows.slice(0, index).reduce((sum, item) => sum + item.percent, 0)}% ${chartRows.slice(0, index + 1).reduce((sum, item) => sum + item.percent, 0)}%`).join(', ')})` : '#E5E7EB' }}
              >
                <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-white shadow-inner">
                  <p className="text-base font-semibold">{responseTotal}</p>
                  <p className="text-[9px] font-bold text-gray-500">responses</p>
                </div>
              </div>
              <div className="space-y-1">
                {chartRows.map(row => (
                  <div key={row.label} className="grid grid-cols-[18px_1fr_38px_28px] items-center gap-1 text-[10px]">
                    <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: row.color }} />
                    <span className="truncate font-semibold">
                      {row.label === row.option ? row.option : `${row.label} ${row.option}`}
                    </span>
                    <span className="font-semibold">{row.percent}%</span>
                    <span className="text-gray-500">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-white px-3 py-2">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-[#A88D55]" />
                <p className="text-xs font-semibold uppercase text-[#17233F]">Question Queue</p>
              </div>
              <span className="text-[10px] font-semibold text-[#17233F]">{remainingQuestions.length} remaining</span>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="grid grid-cols-[28px_1fr_54px] items-center gap-2 px-2 py-2 text-[10px]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E9BF0] font-semibold text-white">{questionNumber}</span>
                <span className="truncate font-semibold">{question.questionText}</span>
                <span className="flex items-center gap-1 text-red-600"><Square className="h-2.5 w-2.5 fill-red-600" /> LIVE</span>
              </div>
              {remainingQuestions.slice(0, 3).map(item => (
                <div key={item.id} className="grid grid-cols-[28px_1fr_64px] items-center gap-2 px-2 py-2 text-[10px]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 font-semibold text-gray-500">{item.order}</span>
                  <span className="truncate font-semibold text-gray-600">{item.questionText}</span>
                  <span className="text-gray-500">Upcoming</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap justify-center gap-2 border-t border-gray-200 bg-gray-50 px-3 py-2">
          <button type="button" onClick={() => window.print()} className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded bg-[#168DE2] px-4 py-2 text-xs font-semibold text-white">
            <Eye className="h-4 w-4" /> Present View
          </button>
          <button type="button" onClick={exportResults} className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded border border-[#168DE2] bg-white px-4 py-2 text-xs font-semibold text-[#168DE2]">
            <Download className="h-4 w-4" /> Export Results
          </button>
          <button type="button" onClick={closeQuestion} disabled={!liveQuestion} className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300">
            <Square className="h-3 w-3 fill-white" /> Close Question
          </button>
        </div>
      </div>
    </div>
  );
}

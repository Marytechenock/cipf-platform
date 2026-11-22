import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { QAQuestion, QAResponse, User } from '../types';
import { CalendarDays, CheckCircle2, Clock, Info, List, Loader, MessageSquare, Send, Star } from 'lucide-react';

interface QAViewProps {
  user: User;
}

const MULTIPLE_CHOICE_LABELS = ['A', 'B', 'C', 'D'];

export default function QAView({ user }: QAViewProps) {
  const [question, setQuestion] = useState<QAQuestion | null>(null);
  const [response, setResponse] = useState<QAResponse | null>(null);
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const loadLiveQuestion = async (showLoader = false) => {
    if (showLoader) {
      setIsLoading(true);
    }
    setMessage('');
    try {
      const data = await api.getLiveQA();
      setQuestion(data.question);
      setResponse(data.response);
      setAnswer(data.response?.answer || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load live Q&A.');
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadLiveQuestion(true);
    const interval = window.setInterval(() => void loadLiveQuestion(false), 15000);
    return () => window.clearInterval(interval);
  }, []);

  const submitAnswer = async () => {
    if (!question || !answer.trim() || isSubmitting || response) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      const result = await api.submitQAResponse({ questionId: question.id, answer: answer.trim() });
      setResponse(result.response);
      setAnswer(result.response.answer);
      setMessage(result.duplicate ? 'Your response was already received.' : 'Response submitted successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not submit your response.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderAnswerControl = () => {
    if (!question) return null;
    const disabled = Boolean(response) || isSubmitting;

    if (question.type === 'short_answer') {
      return (
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={disabled}
          rows={5}
          placeholder="Type your response here..."
          className="w-full resize-none rounded-md border border-gray-200 bg-gray-50 p-3 text-sm font-medium leading-relaxed text-gray-800 outline-none transition focus:border-[#168DE2] focus:ring-2 focus:ring-[#168DE2]/20 disabled:bg-gray-100"
        />
      );
    }

    if (question.type === 'rating') {
      return (
        <div className="grid grid-cols-5 gap-2">
          {question.options.map((option) => {
            const selected = answer === option;
            return (
              <button
                key={option}
                type="button"
                disabled={disabled}
                onClick={() => setAnswer(option)}
                className={`flex h-11 items-center justify-center rounded-md border text-sm font-semibold transition ${
                  selected
                    ? 'border-[#168DE2] bg-[#168DE2] text-white shadow-sm'
                    : 'border-gray-200 bg-gray-100 text-gray-800 hover:border-[#168DE2]/60 hover:bg-blue-50'
                } disabled:cursor-not-allowed disabled:opacity-70`}
              >
                {option}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        {question.options.map((option, index) => {
          const value = MULTIPLE_CHOICE_LABELS[index] || option;
          const selected = answer === value;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => setAnswer(value)}
              className={`flex w-full items-center gap-4 rounded-md border px-3 py-2.5 text-left text-sm transition ${
                selected
                  ? 'border-[#168DE2] bg-blue-50 text-gray-950 shadow-sm'
                  : 'border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 text-gray-800 hover:border-[#168DE2]/60 hover:bg-blue-50'
              } disabled:cursor-not-allowed disabled:opacity-70`}
            >
              <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${selected ? 'border-[#168DE2] bg-[#168DE2] ring-2 ring-blue-100' : 'border-gray-400 bg-white'}`} />
              <span className="w-8 shrink-0 text-center font-semibold text-gray-950">{value}</span>
              <span className="min-w-0 flex-1 font-medium leading-snug">{option}</span>
            </button>
          );
        })}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl rounded-lg border border-gray-200 bg-white p-8 text-center shadow-xl">
        <Loader className="mx-auto h-8 w-8 animate-spin text-[#B8922A]" />
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#8B6914]">Loading live Q&A</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl animate-fadeIn rounded-lg border border-gray-200 bg-white p-3 shadow-xl shadow-gray-200/80 sm:p-4">
      {!question ? (
        <>
          <div className="overflow-hidden rounded-md bg-gradient-to-r from-[#A88D55] via-[#D8C292] to-[#A88D55]">
            <div className="flex items-center justify-between px-4 py-2">
              <h2 className="text-sm font-medium text-black">Current Question</h2>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-400 px-2.5 py-0.5 text-[11px] font-medium uppercase text-white">
                <span className="h-2 w-2 rounded-full bg-white" /> Idle
              </span>
            </div>
            <div className="px-4 pb-3">
              <p className="flex items-center gap-2 text-xs font-normal text-gray-800">
                <Clock className="h-4 w-4" /> Waiting for presenter
              </p>
              <h3 className="mt-1.5 text-base font-medium text-black">No question is currently live</h3>
            </div>
          </div>

          <div className="mt-3 rounded-md bg-blue-50 px-4 py-3 text-xs font-medium text-blue-900">
            <span className="inline-flex items-center gap-2">
              <Info className="h-4 w-4 text-[#0B72C9]" /> Only the active question is available
            </span>
          </div>

          <QuestionTypeStrip activeType="multiple_choice" />
        </>
      ) : (
        <>
          <div className="overflow-hidden rounded-md bg-gradient-to-r from-[#A88D55] via-[#D8C292] to-[#A88D55]">
            <div className="flex items-center justify-between px-4 py-2">
              <h2 className="text-sm font-medium text-black">Current Question</h2>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-0.5 text-[11px] font-medium uppercase text-white">
                <span className="h-2 w-2 rounded-full bg-white" /> Live
              </span>
            </div>
            <div className="px-4 pb-3">
              <p className="flex items-center gap-2 text-xs font-normal text-gray-800">
                <CalendarDays className="h-3.5 w-3.5" /> {question.session?.topic || 'Live Session'}
              </p>
              <h3 className="mt-1.5 text-base font-medium leading-tight text-black sm:text-lg">{question.questionText}</h3>
            </div>
          </div>

          <div className="mt-2">
            {renderAnswerControl()}
          </div>

          {message && (
            <p className={`mt-2 rounded-md px-4 py-2.5 text-xs font-medium ${
              response ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-[#8B6914]'
            }`}>
              {message}
            </p>
          )}

          {response ? (
            <div className="mt-2 flex h-11 items-center justify-center gap-2 rounded-md bg-emerald-600 text-sm font-semibold text-white">
              <CheckCircle2 className="h-4 w-4" /> Response Received
            </div>
          ) : (
            <button
              type="button"
              onClick={submitAnswer}
              disabled={!answer.trim() || isSubmitting}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#168DE2] text-sm font-semibold text-white shadow-sm transition hover:bg-[#0878C5] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            >
              {isSubmitting ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit Answer
            </button>
          )}

          <div className="mt-3 rounded-md bg-blue-50 px-4 py-3 text-xs font-medium text-blue-900">
            <span className="inline-flex items-center gap-2">
              <Info className="h-4 w-4 text-[#0B72C9]" /> Only the active question is available
            </span>
          </div>

          <QuestionTypeStrip activeType={question.type} />
        </>
      )}
    </div>
  );
}

function QuestionTypeStrip({ activeType }: { activeType: QAQuestion['type'] }) {
  const normalizedType = activeType === 'yes_no' ? 'multiple_choice' : activeType;
  const types = [
    { value: 'short_answer', label: 'Short Answer', icon: MessageSquare },
    { value: 'multiple_choice', label: 'Multiple Choice', icon: List },
    { value: 'rating', label: 'Rating', icon: Star }
  ];

  return (
    <div className="mt-3 grid items-center gap-2 rounded-md bg-gradient-to-r from-gray-100 to-gray-200 px-4 py-2 sm:grid-cols-[120px_minmax(0,1fr)]">
      <p className="text-sm font-semibold text-black">Question Types</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {types.map((type) => {
          const Icon = type.icon;
          const active = normalizedType === type.value;
          return (
            <div
              key={type.value}
              className={`flex h-9 items-center justify-center gap-2 rounded-md border text-xs font-medium ${
                active
                  ? 'border-[#168DE2] bg-blue-50 text-[#168DE2]'
                  : 'border-gray-200 bg-white text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" /> {type.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

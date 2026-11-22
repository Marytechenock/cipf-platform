import { useCallback, useEffect, useState } from 'react';
import { sessionQuestionsApi } from '../../lib/sessionQuestions';
import type { AudienceQuestion } from '../../types/sessionQuestions';
import type { Session } from '../../types';

export function useQuestionQueue(sessionId: string, mode: 'own' | 'admin' | 'presenter' | 'display') {
  const [data, setData] = useState<{ session: Session; questions: AudienceQuestion[] } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    setData(null);
    setError('');
    if (!sessionId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const update = async () => {
      try {
        const result = await sessionQuestionsApi.list(sessionId, mode, controller.signal);
        if (!controller.signal.aborted) { setData(result); setError(''); }
      } catch (err) {
        if (!controller.signal.aborted) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Connection lost. Retrying…');
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(update, 3000);
      }
    };
    void update();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId, mode, revision]);
  return { data, error, refresh };
}

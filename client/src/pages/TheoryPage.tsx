import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Opening, ThemeConfig } from '../types';
import { fetchOpening } from '../api/openings';
import { exercisePath, repertoirePath } from '../paths';
import TheoryView from '../components/TheoryView/TheoryView';

interface Props {
  theme: ThemeConfig;
  onAppMode: (m: 'light' | 'dark' | 'system') => void;
}

/** /openings/:eco/:name — reconstructs the opening from the URL. */
export default function TheoryPage({ theme, onAppMode }: Props) {
  // react-router decodes params, so eco/name are already the raw values.
  const { eco = '', name = '' } = useParams();
  const navigate = useNavigate();
  const [opening, setOpening] = useState<Opening | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOpening(null);
    setError(false);
    fetchOpening(eco, name)
      .then(o => { if (!cancelled) setOpening(o); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [eco, name]);

  if (error) {
    return (
      <div className="route-status">
        <p>Opening not found.</p>
        <button className="btn btn-ghost" onClick={() => navigate(repertoirePath())}>← Back to openings</button>
      </div>
    );
  }
  if (!opening) return <div className="route-status">Loading opening…</div>;

  return (
    <TheoryView
      opening={opening}
      theme={theme}
      onAppMode={onAppMode}
      onStartExercise={() => navigate(exercisePath(eco, name))}
    />
  );
}

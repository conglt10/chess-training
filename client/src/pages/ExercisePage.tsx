import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Opening, ThemeConfig } from '../types';
import { fetchOpening } from '../api/openings';
import { openingPath, repertoirePath } from '../paths';
import ExerciseView from '../components/ExerciseView/ExerciseView';

interface Props {
  theme: ThemeConfig;
}

/** /openings/:eco/:name/exercise — reconstructs the opening from the URL. */
export default function ExercisePage({ theme }: Props) {
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
    <ExerciseView
      opening={opening}
      theme={theme}
      onBackToTheory={() => navigate(openingPath(eco, name))}
    />
  );
}

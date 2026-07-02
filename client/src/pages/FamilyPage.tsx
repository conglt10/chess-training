import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Opening } from '../types';
import { fetchOpeningsByFamilies } from '../api/openings';
import { repertoirePath } from '../paths';
import FamilyVariationsView from '../components/OpeningList/FamilyVariationsView';

/** /repertoire/family/:family — fetches the family's variations from the URL. */
export default function FamilyPage() {
  const { family = '' } = useParams();
  const [params] = useSearchParams();
  const color = params.get('color') || '#81b64c';
  const navigate = useNavigate();
  const [variations, setVariations] = useState<Opening[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setVariations(null);
    fetchOpeningsByFamilies([family])
      .then(v => { if (!cancelled) setVariations(v); })
      .catch(() => { if (!cancelled) setVariations([]); });
    return () => { cancelled = true; };
  }, [family]);

  if (!variations) return <div className="route-status">Loading variations…</div>;

  return (
    <FamilyVariationsView
      family={family}
      variations={variations}
      color={color}
      onBack={() => navigate(repertoirePath())}
    />
  );
}

import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { repertoirePath } from '../paths';
import FamilyVariationsView from '../components/OpeningList/FamilyVariationsView';

/** /repertoire/family/:family — variations are fetched (paginated) inside the view. */
export default function FamilyPage() {
  const { family = '' } = useParams();
  const [params] = useSearchParams();
  const color = params.get('color') || '#81b64c';
  const navigate = useNavigate();

  return (
    <FamilyVariationsView
      family={family}
      color={color}
      onBack={() => navigate(repertoirePath())}
    />
  );
}

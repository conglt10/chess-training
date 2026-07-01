import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ThemeConfig } from '../../types';
import MasterGuessTrainer from './MasterGuessTrainer';

function parseLine(s: string | null): string[] {
  return s ? s.split(',').map(x => x.trim()).filter(Boolean) : [];
}

interface Props {
  theme: ThemeConfig;
}

/** Full-screen drill route: /masters/game/:gameId?hero=&line= */
export default function MasterGuessTrainerPage({ theme }: Props) {
  const navigate = useNavigate();
  const { gameId = '' } = useParams();
  const [params] = useSearchParams();
  const hero = params.get('hero') ?? undefined;
  const startLine = parseLine(params.get('line'));

  return (
    <MasterGuessTrainer
      key={gameId}
      theme={theme}
      gameId={gameId}
      startLine={startLine}
      heroName={hero}
      onBack={() => navigate(-1)}
    />
  );
}

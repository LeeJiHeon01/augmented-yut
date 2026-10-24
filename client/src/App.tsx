import { GAME_HEIGHT, GameScreen } from './screens/GameScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { MainScreen } from './screens/MainScreen';
import { ResultScreen } from './screens/ResultScreen';
import { useGame } from './store';
import { useGameAudio } from './useGameAudio';
import { Stage } from './ui/Stage';

export default function App() {
  const room = useGame((s) => s.room);
  const me = useGame((s) => s.me);
  useGameAudio(room, me);

  let screen = <MainScreen />;
  let height: number | undefined;
  if (room?.game?.phase === 'FINISHED') screen = <ResultScreen room={room} game={room.game} />;
  else if (room?.game) {
    screen = <GameScreen room={room} game={room.game} />;
    height = GAME_HEIGHT;
  } else if (room) screen = <LobbyScreen room={room} />;

  return <Stage height={height}>{screen}</Stage>;
}

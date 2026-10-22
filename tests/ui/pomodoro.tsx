// Isolated fixture: the pomodoro on a working pup and on a sleeping one, at any moment of its run.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PomodoroTimer } from '../../src/components/PomodoroTimer';
import { newPomodoro, POMODORO_MS, type Pomodoro } from '../../src/pomodoro/pomodoro';
import { useWindingPaw } from '../../src/pomodoro/usePomodoroClock';
import { SpriteCanvas } from '../../src/pet/SpriteCanvas';
import '../../src/styles.css';
import '../../src/pet.css';

export function Pup({ scene, pomodoro, partner }: { scene: 'work' | 'idle' | 'meeting'; pomodoro?: Pomodoro; partner?: boolean }) {
  const winding = Boolean(pomodoro && Date.now() - pomodoro.startedAt < 1_800 && scene === 'work');
  const paw = useWindingPaw(winding);
  const className = `pet-sprite ${partner ? 'partner-sprite' : ''} ${scene} ${scene === 'work' ? 'work-code' : ''} input-${winding && paw ? 'pointer' : 'none'}`;
  return <div className={`pet-avatar ${partner ? 'partner-pet' : 'self-pet'}`} style={{ position: 'relative', display: 'inline-block', margin: 8 }}>
    <SpriteCanvas skin={partner ? 'lavender' : 'cream'} paused={false} className={className} />
    {pomodoro && <PomodoroTimer pomodoro={pomodoro} atPaw={scene !== 'idle'} paused={false} label="pomodoro" />}
  </div>;
}

export function Checks() {
  const [pomodoro, setPomodoro] = useState<Pomodoro>();
  const at = (elapsed: number) => setPomodoro(newPomodoro(String(Date.now()), Date.now() - elapsed));
  return <main style={{ background: '#f2e6db', minHeight: '100vh', padding: 12 }}>
    <div className="pet-pair paired" style={{ position: 'relative', left: 0, transform: 'none', width: 'auto', height: 'auto', display: 'flex' }}>
      <Pup scene="work" pomodoro={pomodoro} />
      <Pup scene="idle" pomodoro={pomodoro} partner />
      <Pup scene="meeting" pomodoro={pomodoro} />
    </div>
    <p>
      <button onClick={() => at(0)}>Start now</button>
      <button onClick={() => at(10 * 60_000)}>10 min in</button>
      <button onClick={() => at(POMODORO_MS - 1_500)}>About to ring</button>
      <button onClick={() => setPomodoro(undefined)}>Clear</button>
    </p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Checks /></StrictMode>);

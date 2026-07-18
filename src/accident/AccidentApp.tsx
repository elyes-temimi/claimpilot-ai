import { useEffect, useRef, useState } from 'react';
import { AccidentHome } from './AccidentHome';
import { SessionLive } from './SessionLive';
import { useSession } from './useSession';

export function AccidentApp({ 
  joinCode,
  userProfile
}: { 
  joinCode?: string;
  userProfile?: {
    fullName: string;
    cinNumber: string;
    profileId?: string;
  };
}) {
  const handle = useSession();
  const resumeTried = useRef(false);
  const [, forceTick] = useState(0);

  // Re-attach after an accidental refresh (same tab), unless arriving via a join link
  useEffect(() => {
    if (resumeTried.current) return;
    resumeTried.current = true;
    if (!joinCode) handle.resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick the header timer once a second while a session is open
  useEffect(() => {
    if (!handle.session || handle.session.status === 'locked') return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [handle.session?.code, handle.session?.status]);

  const elapsed = handle.session
    ? Math.max(0, Math.floor((Date.now() - new Date(handle.session.createdAt).getTime()) / 1000))
    : 0;
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');

  const exit = () => {
    handle.leave();
    window.location.hash = '#accident';
  };

  const statusLabel = !handle.session
    ? 'Phase 3 · Shared Accident Session'
    : handle.session.status === 'waiting'
      ? 'Live case · waiting for driver 2'
      : handle.session.status === 'active'
        ? 'Live case · both drivers connected'
        : 'Case locked & sealed';

  return (
    <div className="app-frame accident">
      <header className="header header-accident">
        <div className="brand">
          <a className="back-btn" href="#" title="Back to onboarding">‹</a>
          <div className="logo">🚨</div>
          <div className="brand-text">
            <h1>Shared Accident Session</h1>
            <p>{statusLabel}</p>
          </div>
          {handle.session && (
            <div className={`timer ${handle.session.status === 'locked' ? 'timer-done' : ''}`}>
              {mm}:{ss}
            </div>
          )}
        </div>
      </header>

      <div className="acc-scroll">
        {handle.session && handle.myPid ? (
          <SessionLive handle={handle} onExit={exit} userProfile={userProfile} />
        ) : (
          <AccidentHome handle={handle} initialJoinCode={joinCode} userProfile={userProfile} />
        )}
      </div>

      <footer className="footer">
        {handle.session
          ? handle.connected
            ? '🟢 live sync connected'
            : '🟠 reconnecting…'
          : 'GPS, date & time are captured automatically — never typed'}
      </footer>
    </div>
  );
}

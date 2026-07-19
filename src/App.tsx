import { useEffect, useState } from 'react';
import { AccidentApp } from './accident/AccidentApp';
import { ChatApp } from './ChatApp';
import { EkycApp } from './ekyc/EkycApp';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AuthScreen } from './auth/AuthScreen';
import { LanguageSelector } from './components/LanguageSelector';
import type { EkycState } from './ekyc/types';

type Route = 
  | { view: 'ekyc' }
  | { view: 'chat' } 
  | { view: 'accident'; joinCode?: string };

/** Is this tab currently attached to a live accident case? */
function hasLiveSession(): boolean {
  try {
    const raw = sessionStorage.getItem('cp_session');
    if (!raw) return false;
    const s = JSON.parse(raw);
    return !!(s && s.code && s.pid);
  } catch {
    return false;
  }
}

function parseRoute(): Route {
  const h = window.location.hash;
  const join = h.match(/^#join\/([A-Za-z0-9]{4,10})/);
  if (join) return { view: 'accident', joinCode: join[1].toUpperCase() };
  if (h.startsWith('#accident')) return { view: 'accident' };
  if (h.startsWith('#ekyc')) return { view: 'ekyc' };
  if (!h || h === '#') {
    // Taking a photo on a phone can cost us the tab: the OS camera takes focus,
    // the browser evicts the page, and it reloads with an empty hash. Sending a
    // driver who is mid-case back to eKYC at that moment is the worst possible
    // answer, so an attached session wins over the default.
    return hasLiveSession() ? { view: 'accident' } : { view: 'ekyc' };
  }
  return { view: 'chat' };
}

interface SavedKyc {
  fullName: string | null;
  cin: string | null;
  dob: string | null;
  address: string | null;
  verified: boolean;
  policyName: string | null;
  profileId: string | null;
  completedAt: string | null;
}

function AppContent() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [route, setRoute] = useState<Route>(parseRoute);
  const [ekycData, setEkycData] = useState<EkycState | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [savedKyc, setSavedKyc] = useState<SavedKyc | null>(null);
  const [kycChecked, setKycChecked] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Has this account already been verified? Identity belongs to the person,
  // not the session, so a returning user should never redo their CIN.
  useEffect(() => {
    if (!user?.email) {
      setKycChecked(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/ekyc/profile?accountKey=${encodeURIComponent(user.email)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.found) setSavedKyc(d.profile);
      })
      // A database outage must never lock someone out of filing a claim —
      // they simply get asked to verify again.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setKycChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const handleEkycComplete = (data: EkycState) => {
    setEkycData(data);

    // Persist it so this is the last time they do this.
    if (user?.email) {
      fetch('/api/ekyc/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountKey: user.email,
          fullName: data.cin.fullName,
          cin: data.cin.cinNumber,
          dob: data.cin.dob,
          address: data.cin.address,
          verified: true,
          livenessPassed: !!data.liveness?.passed,
          screeningStatus: data.screening?.status || null,
          policyId: data.policy?.id || null,
          policyName: data.policy?.name || null,
          premiumTND: data.policy?.premiumTND ?? null,
          profileId: data.profileId,
          completedAt: new Date().toISOString(),
        }),
      }).catch(() => {});
    }

    // After eKYC complete, navigate to accident claims
    window.location.hash = '#accident';
  };

  // Already verified? Don't make them do it again — jump straight to the claim.
  useEffect(() => {
    if (savedKyc && route.view === 'ekyc') window.location.hash = '#accident';
  }, [savedKyc, route.view]);

  // Show loading spinner while checking auth
  if (isLoading || (isAuthenticated && !kycChecked)) {
    return (
      <div className="page">
        <div className="widget-processing" style={{ justifyContent: 'center', height: '100vh' }}>
          <div className="spinner" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  // A #join/CODE link is the second driver arriving at the scene — often on a
  // phone, over the LAN, in a hurry, with the other driver waiting. Forcing an
  // account on them there is the wrong trade: they join as a guest and the
  // constat captures their identity in-session.
  const isJoinLink = route.view === 'accident' && !!route.joinCode;

  if (!isAuthenticated && !isJoinLink) {
    return <AuthScreen />;
  }

  const userInitials = (user?.fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="page">
      <div className="app-frame">
        {/* Header with user menu and language selector */}
        {route.view === 'ekyc' && (
          <div className="ekyc-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h1>🛡️ ASSURINI AI</h1>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <LanguageSelector />
                <div className="user-menu">
                  <button 
                    className="user-button"
                    onClick={() => setShowUserMenu(!showUserMenu)}
                  >
                    <div className="user-avatar">{userInitials}</div>
                    <span>{user!.fullName.split(' ')[0]}</span>
                  </button>
                  {showUserMenu && (
                    <div className="user-dropdown">
                      <button className="user-dropdown-item" onClick={() => setShowUserMenu(false)}>
                        👤 {user!.fullName}
                      </button>
                      <button className="user-dropdown-item danger" onClick={logout}>
                        🚪 Déconnexion
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <p className="ekyc-subtitle">Intelligent eKYC — onboarding in minutes</p>
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {route.view === 'ekyc' ? (
            <EkycApp key="ekyc" onComplete={handleEkycComplete} />
          ) : route.view === 'accident' ? (
            <AccidentApp 
              key="accident" 
              joinCode={route.view === 'accident' ? route.joinCode : undefined}
              userProfile={ekycData ? {
                fullName: ekycData.cin.fullName,
                cinNumber: ekycData.cin.cinNumber,
                profileId: ekycData.profileId || undefined
              } : savedKyc ? {
                // Verified in an earlier session — read back from the database.
                fullName: savedKyc.fullName || user?.fullName || '',
                cinNumber: savedKyc.cin || '',
                profileId: savedKyc.profileId || undefined
              } : user ? {
                fullName: user.fullName,
                cinNumber: user.cinNumber || '',
                profileId: user.id
              } : undefined}
            />
          ) : (
            <ChatApp key="chat" />
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

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

function parseRoute(): Route {
  const h = window.location.hash;
  const join = h.match(/^#join\/([A-Za-z0-9]{4,10})/);
  if (join) return { view: 'accident', joinCode: join[1].toUpperCase() };
  if (h.startsWith('#accident')) return { view: 'accident' };
  if (h.startsWith('#ekyc')) return { view: 'ekyc' };
  // Default to eKYC if no hash or empty
  if (!h || h === '#') return { view: 'ekyc' };
  return { view: 'chat' };
}

function AppContent() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [route, setRoute] = useState<Route>(parseRoute);
  const [ekycData, setEkycData] = useState<EkycState | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const handleEkycComplete = (data: EkycState) => {
    setEkycData(data);
    // After eKYC complete, navigate to accident claims
    window.location.hash = '#accident';
  };

  // Show loading spinner while checking auth
  if (isLoading) {
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
              <h1>🛡️ ClaimPilot AI</h1>
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

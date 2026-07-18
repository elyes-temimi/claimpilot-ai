import { useEffect, useState } from 'react';
import { AccidentApp } from './accident/AccidentApp';
import { ChatApp } from './ChatApp';

type Route = { view: 'chat' } | { view: 'accident'; joinCode?: string };

function parseRoute(): Route {
  const h = window.location.hash;
  const join = h.match(/^#join\/([A-Za-z0-9]{4,10})/);
  if (join) return { view: 'accident', joinCode: join[1].toUpperCase() };
  if (h.startsWith('#accident')) return { view: 'accident' };
  return { view: 'chat' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="page">
      {route.view === 'accident' ? (
        <AccidentApp key="accident" joinCode={route.view === 'accident' ? route.joinCode : undefined} />
      ) : (
        <ChatApp key="chat" />
      )}
    </div>
  );
}

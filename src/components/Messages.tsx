import { useEffect, useRef } from 'react';
import type { Msg } from '../types';
import { CardView } from './Cards';

export function Messages({ messages, typing }: { messages: Msg[]; typing: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  return (
    <div className="chat" ref={ref}>
      <div className="chat-inner">
        {messages.map((m) => {
          if (m.from === 'bot')
            return (
              <div key={m.id} className="msg msg-bot">
                {m.text}
              </div>
            );
          if (m.from === 'user')
            return (
              <div key={m.id} className="msg msg-user">
                {m.text}
              </div>
            );
          if (m.from === 'user-image')
            return (
              <div key={m.id} className="msg msg-image">
                <img src={m.image} alt={m.caption || 'upload'} />
                {m.caption && <span className="fine">{m.caption}</span>}
              </div>
            );
          return (
            <div key={m.id} className="msg-card">
              <CardView card={m.card} />
            </div>
          );
        })}
        {typing && (
          <div className="msg msg-bot typing">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
      </div>
    </div>
  );
}

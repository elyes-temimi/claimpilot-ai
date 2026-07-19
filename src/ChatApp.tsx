import { useEffect, useRef, useState } from 'react';
import { Messages } from './components/Messages';
import { Stepper } from './components/Stepper';
import { WidgetDock } from './components/widgets/WidgetDock';
import { FlowController } from './flow/controller';
import { runFlow } from './flow/script';
import { IS_DEMO } from './lib/demo';
import type { Msg, StepId, WidgetSpec } from './types';

export function ChatApp() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [widget, setWidget] = useState<WidgetSpec | null>(null);
  const [step, setStep] = useState<StepId | 'done'>('identity');
  const [elapsed, setElapsed] = useState(0);

  const flowRef = useRef<FlowController | null>(null);
  const startedRef = useRef(false);

  if (!flowRef.current) {
    let nextId = 1;
    flowRef.current = new FlowController(
      {
        push: (m) => setMessages((prev) => [...prev, { ...m, id: nextId++ } as Msg]),
        setTyping,
        setWidget,
        setStep,
      },
      IS_DEMO
    );
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runFlow(flowRef.current!);
  }, []);

  // Session timer — the "minutes, not half an hour" proof point
  useEffect(() => {
    if (step === 'done') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [step]);

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');
  const phaseLabel =
    step === 'policy' || step === 'done' ? 'Phase 2 · Smart Policy Selection' : 'Phase 1 · Intelligent eKYC';

  return (
    <div className="app-frame">
      <header className="header">
        <div className="brand">
          <div className="logo">🛡️</div>
          <div className="brand-text">
            <h1>ASSURINI AI</h1>
            <p>{phaseLabel}</p>
          </div>
          <a className="sos-btn" href="#accident" title="Shared accident session (Phase 3)">
            🚨
          </a>
          <div className={`timer ${step === 'done' ? 'timer-done' : ''}`}>
            {mm}:{ss}
          </div>
        </div>
        <Stepper current={step} />
      </header>
      <Messages messages={messages} typing={typing} />
      <WidgetDock widget={widget} flow={flowRef.current!} />
      <footer className="footer">
        Hackathon prototype · screening & signing services are mocked · no real personal data stored
      </footer>
    </div>
  );
}

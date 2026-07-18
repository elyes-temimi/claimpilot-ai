import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPosition, ImpactZone, MyIdentity, ParticipantEvidence, SessionState } from './types';

const STORAGE_KEY = 'cp_session'; // sessionStorage: per-tab, so two tabs can be two drivers

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export interface SessionHandle {
  session: SessionState | null;
  myPid: string | null;
  connected: boolean;
  error: string | null;
  create: (me: MyIdentity) => Promise<void>;
  join: (code: string, me: MyIdentity, method: 'qr' | 'code') => Promise<void>;
  resume: () => boolean;
  leave: () => void;
  sendPosition: (pos: Omit<GeoPosition, 'capturedAt'>) => void;
  sendImpact: (zone: ImpactZone) => void;
  sendConfirm: () => void;
  sendEvidence: (evidence: Omit<ParticipantEvidence, 'updatedAt'>) => void;
  sendConstat: (constat: Partial<import('./constatTypes').ParticipantConstat>) => void;
  simulateOtherDriver: () => Promise<void>;
}

export function useSession(): SessionHandle {
  const [session, setSession] = useState<SessionState | null>(null);
  const [myPid, setMyPid] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const attachRef = useRef<{ code: string; pid: string } | null>(null);
  const closedRef = useRef(false);
  const retryRef = useRef<number | null>(null);

  const openSocket = useCallback((code: string, pid: string) => {
    closedRef.current = false;
    attachRef.current = { code, pid };
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'attach', code, pid }));
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'state') setSession(m.session);
        else if (m.type === 'error') setError(m.message);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      setConnected(false);
      if (!closedRef.current && attachRef.current) {
        retryRef.current = window.setTimeout(
          () => attachRef.current && openSocket(attachRef.current.code, attachRef.current.pid),
          1500
        );
      }
    };
  }, []);

  useEffect(
    () => () => {
      closedRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    },
    []
  );

  const begin = useCallback(
    (code: string, pid: string) => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ code, pid }));
      setMyPid(pid);
      setError(null);
      openSocket(code, pid);
    },
    [openSocket]
  );

  const create = useCallback(
    async (me: MyIdentity) => {
      const res = await post<{ code: string; pid: string }>('/api/session/create', { identity: me });
      begin(res.code, res.pid);
    },
    [begin]
  );

  const join = useCallback(
    async (code: string, me: MyIdentity, method: 'qr' | 'code') => {
      const res = await post<{ code: string; pid: string }>('/api/session/join', {
        code,
        identity: me,
        method,
      });
      begin(res.code, res.pid);
    },
    [begin]
  );

  /** Re-attach after a page refresh (same tab). Returns true if a session was resumed. */
  const resume = useCallback((): boolean => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const { code, pid } = JSON.parse(raw);
      if (!code || !pid) return false;
      begin(code, pid);
      return true;
    } catch {
      return false;
    }
  }, [begin]);

  const leave = useCallback(() => {
    closedRef.current = true;
    attachRef.current = null;
    if (retryRef.current) clearTimeout(retryRef.current);
    wsRef.current?.close();
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setMyPid(null);
    setConnected(false);
    setError(null);
  }, []);

  const send = (obj: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  const sendPosition = useCallback((pos: Omit<GeoPosition, 'capturedAt'>) => {
    send({ type: 'position', position: pos });
  }, []);

  const sendImpact = useCallback((zone: ImpactZone) => {
    send({ type: 'impact', zone });
  }, []);

  const sendConfirm = useCallback(() => {
    send({ type: 'confirm' });
  }, []);

  const sendEvidence = useCallback((evidence: Omit<ParticipantEvidence, 'updatedAt'>) => {
    send({ type: 'evidence', evidence });
  }, []);

  const sendConstat = useCallback((constat: Partial<import('./constatTypes').ParticipantConstat>) => {
    send({ type: 'constat', constat });
  }, []);

  const simulateOtherDriver = useCallback(async () => {
    if (!attachRef.current) return;
    await post(`/api/session/${attachRef.current.code}/simulate`, {});
  }, []);

  return {
    session,
    myPid,
    connected,
    error,
    create,
    join,
    resume,
    leave,
    sendPosition,
    sendImpact,
    sendConfirm,
    sendEvidence,
    sendConstat,
    simulateOtherDriver,
  };
}

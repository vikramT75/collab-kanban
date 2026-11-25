import { useEffect, useRef } from 'react';
import { API_BASE } from '../api/client';
import { useBoardStore } from '../store/useBoardStore';
import { BoardEvent } from '../types';

export function useSSE() {
  const applySSEEvent = useBoardStore((s) => s.applySSEEvent);
  const loadBoard = useBoardStore((s) => s.loadBoard);
  const setConnectionStatus = useBoardStore((s) => s.setConnectionStatus);
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    setConnectionStatus('connecting');
    const es = new EventSource(`${API_BASE}/api/events`);

    es.onopen = () => {
      setConnectionStatus('connected');
      if (hasConnectedOnceRef.current) {
        // Silent resync after any reconnect to recover events missed while offline
        void loadBoard(true);
      } else {
        hasConnectedOnceRef.current = true;
        // Also perform a silent resync if initial load already happened before SSE opened
        if (useBoardStore.getState().hasLoadedOnce) {
          void loadBoard(true);
        }
      }
    };

    es.onmessage = (event) => {
      try {
        const boardEvent = JSON.parse(event.data) as BoardEvent;
        if (boardEvent.type === 'board:resync') {
          void loadBoard(true);
          return;
        }
        applySSEEvent(boardEvent);
      } catch (e) {
        console.error('SSE parse error', e);
      }
    };

    es.onerror = () => {
      // Leave EventSource open so browser auto-reconnects automatically
      setConnectionStatus('reconnecting');
    };

    return () => {
      es.close();
    };
  }, [applySSEEvent, loadBoard, setConnectionStatus]);
}

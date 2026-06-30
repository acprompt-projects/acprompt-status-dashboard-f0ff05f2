import { useEffect, useRef, useState, useCallback } from 'react';

export default function useWebSocket(url) {
  const [data, setData] = useState({
    services: [],
    activity: [],
    incidents: [],
  });
  const [status, setStatus] = useState('connecting');
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setStatus('connected');
    ws.onclose = () => {
      setStatus('disconnected');
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'full') {
          setData(msg.payload);
        } else if (msg.type === 'service_update') {
          setData((prev) => ({
            ...prev,
            services: prev.services.map((s) =>
              s.id === msg.payload.id ? { ...s, ...msg.payload } : s
            ),
          }));
        } else if (msg.type === 'activity') {
          setData((prev) => ({
            ...prev,
            activity: [msg.payload, ...prev.activity].slice(0, 50),
          }));
        } else if (msg.type === 'incident') {
          setData((prev) => ({
            ...prev,
            incidents: [msg.payload, ...prev.incidents].slice(0, 30),
          }));
        }
      } catch { /* ignore bad messages */ }
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { data, status };
}
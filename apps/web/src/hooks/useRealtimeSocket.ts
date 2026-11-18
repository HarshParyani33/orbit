import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseRealtimeSocketProps {
  organizationId?: string | null;
  activeConversationId?: string | null;
  onConversationCreated?: (payload: any) => void;
  onConversationUpdated?: (payload: any) => void;
  onConversationStatusChanged?: (payload: any) => void;
  onMessageCreated?: (payload: any) => void;
}

export function useRealtimeSocket({
  organizationId,
  activeConversationId,
  onConversationCreated,
  onConversationUpdated,
  onConversationStatusChanged,
  onMessageCreated,
}: UseRealtimeSocketProps) {
  const socketRef = useRef<Socket | null>(null);

  // Store callbacks in refs to avoid socket reconnects when handlers change
  const callbacksRef = useRef({
    onConversationCreated,
    onConversationUpdated,
    onConversationStatusChanged,
    onMessageCreated,
  });

  useEffect(() => {
    callbacksRef.current = {
      onConversationCreated,
      onConversationUpdated,
      onConversationStatusChanged,
      onMessageCreated,
    };
  });

  // Socket connection lifecycle per organization
  useEffect(() => {
    if (!organizationId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io(window.location.origin, {
      withCredentials: true,
      auth: {
        organizationId,
      },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on('conversation:created', (data) => {
      callbacksRef.current.onConversationCreated?.(data);
    });

    socket.on('conversation:updated', (data) => {
      callbacksRef.current.onConversationUpdated?.(data);
    });

    socket.on('conversation:status_changed', (data) => {
      callbacksRef.current.onConversationStatusChanged?.(data);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [organizationId]);

  // Join/leave active conversation room
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeConversationId) return;

    socket.emit('conversation:join', { conversationId: activeConversationId });

    const handleMessage = (data: any) => {
      callbacksRef.current.onMessageCreated?.(data);
    };

    socket.on('message:created', handleMessage);

    return () => {
      socket.emit('conversation:leave', { conversationId: activeConversationId });
      socket.off('message:created', handleMessage);
    };
  }, [activeConversationId]);

  return socketRef.current;
}

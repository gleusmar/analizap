import { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { connectionAPI } from '../services/api';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function useWhatsApp(onMessageReceived = null, onMessageStatusUpdate = null, onMessageUpdated = null) {
  const [connectionStatus, setConnectionStatus] = useState(null); // null = carregando
  const [qrCode, setQrCode] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Refs para callbacks — evita recriar o socket a cada render
  const onMessageRef = useRef(onMessageReceived);
  const onStatusRef = useRef(onMessageStatusUpdate);
  const onUpdatedRef = useRef(onMessageUpdated);
  useEffect(() => { onMessageRef.current = onMessageReceived; }, [onMessageReceived]);
  useEffect(() => { onStatusRef.current = onMessageStatusUpdate; }, [onMessageStatusUpdate]);
  useEffect(() => { onUpdatedRef.current = onMessageUpdated; }, [onMessageUpdated]);

  // Socket criado UMA VEZ — deps array vazio intencional
  useEffect(() => {
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketInstance.on('connect', () => setIsConnected(true));
    socketInstance.on('disconnect', () => setIsConnected(false));

    socketInstance.on('whatsapp:qr', ({ qr }) => {
      setQrCode(qr);
      setConnectionStatus('qr_required');
    });

    socketInstance.on('whatsapp:status', ({ status }) => {
      setConnectionStatus(status);
      if (status === 'connected') setQrCode(null);
    });

    socketInstance.on('whatsapp:message', ({ conversation_id, message, is_temp }) => {
      onMessageRef.current?.(conversation_id, message, is_temp || false);
    });

    socketInstance.on('whatsapp:message_status', ({ message_id, status }) => {
      onStatusRef.current?.(message_id, status);
    });

    socketInstance.on('whatsapp:message_updated', ({ conversation_id, message_id, content, temp_message_id, real_message_id, message }) => {
      onUpdatedRef.current?.(conversation_id, message_id, content, temp_message_id, real_message_id, message);
    });

    socketInstance.on('whatsapp:message_failed', ({ conversation_id }) => {
      onMessageRef.current?.(conversation_id, null, false);
    });

    setSocket(socketInstance);
    return () => { socketInstance.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega status inicial e pinga a cada 30s para detectar quedas
  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStatus = useCallback(async () => {
    try {
      const response = await connectionAPI.getStatus();
      setConnectionStatus(response.data.status);
      setPhoneNumber(response.data.phoneNumber);
    } catch (error) {
      console.error('Erro ao carregar status:', error);
    }
  }, []);

  const connect = useCallback(async (syncPeriodDays = 7) => {
    try {
      await connectionAPI.connect(syncPeriodDays);
      setConnectionStatus('connecting');
    } catch (error) {
      console.error('Erro ao conectar:', error);
      throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await connectionAPI.disconnect();
      setConnectionStatus('disconnecting');
    } catch (error) {
      console.error('Erro ao desconectar:', error);
      throw error;
    }
  }, []);

  const getQR = useCallback(async () => {
    try {
      const response = await connectionAPI.getQR();
      setQrCode(response.data.qr);
      return response.data.qr;
    } catch (error) {
      console.error('Erro ao obter QR:', error);
      throw error;
    }
  }, []);

  const refreshQR = useCallback(async () => {
    try {
      await connectionAPI.refreshQR();
      setConnectionStatus('connecting');
    } catch (error) {
      console.error('Erro ao atualizar QR:', error);
      throw error;
    }
  }, []);

  const removeSession = useCallback(async () => {
    try {
      await connectionAPI.removeSession();
      setConnectionStatus('disconnected');
      setQrCode(null);
      setPhoneNumber(null);
    } catch (error) {
      console.error('Erro ao remover sessão:', error);
      throw error;
    }
  }, []);

  // Emite leitura ao WhatsApp quando o atendente abre a conversa
  const emitReadConversation = useCallback((phone, last_message_id) => {
    if (socket?.connected && phone && last_message_id) {
      socket.emit('read_conversation', { phone, last_message_id });
    }
  }, [socket]);

  // Emite presença (composing / paused) ao contato
  const emitPresence = useCallback((phone, presence) => {
    if (socket?.connected && phone) {
      socket.emit('send_presence', { phone, presence });
    }
  }, [socket]);

  return {
    connectionStatus,
    qrCode,
    phoneNumber,
    isConnected,
    socket,
    connect,
    disconnect,
    removeSession,
    getQR,
    refreshQR,
    loadStatus,
    emitReadConversation,
    emitPresence
  };
}

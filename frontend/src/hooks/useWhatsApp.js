import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { connectionAPI } from '../services/api';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function useWhatsApp(onMessageReceived = null, onMessageStatusUpdate = null, onMessageUpdated = null) {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [qrCode, setQrCode] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Conecta ao Socket.io
  useEffect(() => {
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true
    });

    socketInstance.on('connect', () => {
      console.log('Socket.io conectado');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket.io desconectado');
      setIsConnected(false);
    });

    // Evento de QR Code
    socketInstance.on('whatsapp:qr', ({ qr }) => {
      console.log('QR Code recebido');
      setQrCode(qr);
      setConnectionStatus('qr_required');
    });

    // Evento de status da conexão
    socketInstance.on('whatsapp:status', ({ status }) => {
      console.log('Status da conexão:', status);
      setConnectionStatus(status);
      if (status === 'connected') {
        setQrCode(null);
      }
    });

    // Evento de nova mensagem
    socketInstance.on('whatsapp:message', ({ conversation_id, message, is_temp }) => {
      if (onMessageReceived) {
        onMessageReceived(conversation_id, message, is_temp || false);
      }
    });

    // Evento de atualização de status de mensagem
    socketInstance.on('whatsapp:message_status', ({ message_id, status }) => {
      console.log('Status de mensagem atualizado:', message_id, status);
      if (onMessageStatusUpdate) {
        onMessageStatusUpdate(message_id, status);
      }
    });

    // Evento de atualização de mensagem (quando mídia é processada)
    socketInstance.on('whatsapp:message_updated', ({ conversation_id, message_id, content }) => {
      console.log('Mensagem atualizada:', { conversation_id, message_id, content });
      if (onMessageUpdated) {
        onMessageUpdated(conversation_id, message_id, content);
      }
    });

    // Evento de falha na entrega de mensagem
    socketInstance.on('whatsapp:message_failed', ({ conversation_id, message_id, error }) => {
      console.log('Falha na entrega de mensagem:', { conversation_id, message_id, error });
      if (onMessageReceived) {
        // Recarregar mensagens para mostrar o erro
        onMessageReceived(conversation_id, null, false);
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [onMessageReceived, onMessageStatusUpdate, onMessageUpdated]);

  // Carrega status inicial
  useEffect(() => {
    loadStatus();
  }, []);

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
      await connectionAPI.connect({ syncPeriodDays });
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

  return {
    connectionStatus,
    qrCode,
    phoneNumber,
    isConnected,
    connect,
    disconnect,
    getQR,
    refreshQR,
    loadStatus
  };
}

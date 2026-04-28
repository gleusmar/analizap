import { Server } from 'socket.io';
import { logger } from '../utils/logger.js';
import { setSocketIO, getSocket } from '../whatsapp/baileysClient.js';

let io = null;

/**
 * Inicializa o Socket.io
 */
export function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  logger.info('📡 Socket.io Server criado');

  // Passa a instância para o baileysClient
  setSocketIO(io);

  io.on('connection', (socket) => {
    /**
     * Frontend abre uma conversa: envia confirmação de leitura ao WhatsApp.
     * Payload: { phone: string, last_message_id: string }
     */
    socket.on('read_conversation', async ({ phone, last_message_id }) => {
      try {
        const sock = getSocket();
        if (!sock || !phone || !last_message_id) return;

        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

        await sock.readMessages([{
          remoteJid: jid,
          id: last_message_id,
          fromMe: false
        }]);
      } catch (error) {
        logger.error('Erro ao marcar conversa como lida no WhatsApp:', error.message);
      }
    });

    /**
     * Frontend envia atualização de presença (digitando, gravando, pausado).
     * Payload: { phone: string, presence: 'composing' | 'recording' | 'paused' | 'available' }
     */
    socket.on('send_presence', async ({ phone, presence }) => {
      try {
        const sock = getSocket();
        if (!sock || !phone || !presence) return;

        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendPresenceUpdate(presence, jid);
      } catch (error) {
        logger.error('Erro ao enviar presença:', error.message);
      }
    });
  });

  logger.info('✅ Socket.io inicializado com sucesso');
  return io;
}

/**
 * Obtém a instância do Socket.io
 */
export function getIO() {
  return io;
}

/**
 * Emite um evento para todos os clientes conectados
 */
export function emit(event, data) {
  if (io) {
    io.emit(event, data);
  }
}

/**
 * Emite um evento para um cliente específico
 */
export function emitTo(socketId, event, data) {
  if (io) {
    io.to(socketId).emit(event, data);
  }
}

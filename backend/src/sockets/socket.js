import { Server } from 'socket.io';
import { logger } from '../utils/logger.js';
import { setSocketIO } from '../whatsapp/baileysClient.js';

let io = null;

/**
 * Inicializa o Socket.io
 */
export function initializeSocket(server) {
  logger.info('🚀 Inicializando Socket.io...');

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
    logger.info(`👤 Cliente conectado: ${socket.id}`);

    socket.on('disconnect', () => {
      logger.info(`👤 Cliente desconectado: ${socket.id}`);
    });

    // Eventos personalizados podem ser adicionados aqui
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
  } else {
    logger.warn('Socket.io não está inicializado');
  }
}

/**
 * Emite um evento para um cliente específico
 */
export function emitTo(socketId, event, data) {
  if (io) {
    io.to(socketId).emit(event, data);
  } else {
    logger.warn('Socket.io não está inicializado');
  }
}

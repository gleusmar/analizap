import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import tagRoutes from './routes/tagRoutes.js';
import whatsappRoutes from './routes/whatsappRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import predefinedMessagesRoutes from './routes/predefinedMessagesRoutes.js';
import { logger } from './utils/logger.js';
import { initializeSocket } from './sockets/socket.js';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Inicializa Socket.io
initializeSocket(server);

// Middleware para capturar IP
app.use((req, res, next) => {
  req.clientIP = req.headers['x-forwarded-for']?.split(',')[0] || 
                  req.headers['x-real-ip'] || 
                  req.socket.remoteAddress ||
                  req.connection.remoteAddress ||
                  req.ip ||
                  'unknown';
  next();
});

// Middleware
app.use(cors());
app.use(express.json());

// Middleware de log para debug
app.use((req, res, next) => {
  logger.info('Requisição recebida:', {
    method: req.method,
    path: req.path,
    body: req.method === 'POST' ? JSON.stringify(req.body).substring(0, 200) : undefined
  });
  next();
});

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api', conversationRoutes);
app.use('/api', predefinedMessagesRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Erro não tratado', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.clientIP
  });
  res.status(500).json({ error: 'Erro interno do servidor' });
});

server.listen(PORT, () => {
  logger.success(`Servidor iniciado`, { port: PORT, env: process.env.NODE_ENV || 'development' }, null, 'SERVER_START');
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📝 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

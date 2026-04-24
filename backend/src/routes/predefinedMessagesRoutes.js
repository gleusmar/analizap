import express from 'express';
import {
  getPredefinedMessages,
  createPredefinedMessage,
  updatePredefinedMessage,
  deletePredefinedMessage
} from '../controllers/predefinedMessagesController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Obter todas as mensagens pré-definidas do usuário
router.get('/predefined-messages', getPredefinedMessages);

// Criar nova mensagem pré-definida
router.post('/predefined-messages', createPredefinedMessage);

// Atualizar mensagem pré-definida
router.put('/predefined-messages/:messageId', updatePredefinedMessage);

// Excluir mensagem pré-definida
router.delete('/predefined-messages/:messageId', deletePredefinedMessage);

export default router;

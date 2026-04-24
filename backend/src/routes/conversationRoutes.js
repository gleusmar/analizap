import express from 'express';
import {
  upload,
  getConversations,
  getMessages,
  markAsRead,
  closeConversationRoute,
  openConversationRoute,
  updateContactNameRoute,
  sendMessage,
  sendAttachment,
  sendLocation,
  sendReaction,
  forwardMessage,
  deleteConversation
} from '../controllers/conversationController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Obter todas as conversas
router.get('/conversations', getConversations);

// Obter mensagens de uma conversa
router.get('/conversations/:conversationId/messages', getMessages);

// Enviar mensagem
router.post('/conversations/:conversationId/send', sendMessage);

// Marcar mensagens como lidas
router.post('/conversations/:conversationId/mark-read', markAsRead);

// Fechar conversa
router.post('/conversations/:conversationId/close', closeConversationRoute);

// Abrir conversa
router.post('/conversations/:conversationId/open', openConversationRoute);

// Atualizar nome do contato
router.put('/conversations/:conversationId/contact-name', updateContactNameRoute);

// Excluir conversa (apenas admin)
router.delete('/conversations/:conversationId', deleteConversation);

// Enviar anexo
router.post('/conversations/:conversationId/attachment', upload.single('file'), sendAttachment);

// Enviar reação
router.post('/conversations/:conversationId/reaction', sendReaction);

// Encaminhar mensagem
router.post('/conversations/:conversationId/forward', forwardMessage);

// Enviar localização
router.post('/conversations/:conversationId/location', sendLocation);

export default router;

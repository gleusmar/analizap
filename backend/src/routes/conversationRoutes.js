import express from 'express';
import {
  upload,
  getConversations,
  getMessages,
  markAsRead,
  markMultipleAsRead,
  closeConversationRoute,
  openConversationRoute,
  updateContactNameRoute,
  togglePinRoute,
  sendMessage,
  sendAttachment,
  sendLocation,
  sendReaction,
  forwardMessage,
  deleteConversation,
  searchConversations,
  clearConversationMessages
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
router.post('/conversations/:conversationId/read', markAsRead);

// Marcar múltiplas conversas como lidas
router.post('/conversations/mark-multiple-read', markMultipleAsRead);

// Alternar pin de conversa
router.post('/conversations/:conversationId/pin', togglePinRoute);

// Fechar conversa
router.post('/conversations/:conversationId/close', closeConversationRoute);

// Abrir conversa
router.post('/conversations/:conversationId/open', openConversationRoute);

// Atualizar nome do contato
router.put('/conversations/:conversationId/contact-name', updateContactNameRoute);

// Excluir conversa (apenas admin)
router.delete('/conversations/:conversationId', deleteConversation);

// Enviar anexo
router.post('/conversations/:conversationId/attachment',
  (req, res, next) => {
    console.log('🔍 Middleware antes do multer:', {
      'content-type': req.headers['content-type'],
      'has body': !!req.body,
      'body keys': req.body ? Object.keys(req.body) : [],
      'has files': !!req.files,
      'has file': !!req.file
    });
    next();
  },
  upload.single('file'),
  (req, res, next) => {
    console.log('🔍 Middleware depois do multer:', {
      'has file': !!req.file,
      'file name': req.file?.originalname,
      'file size': req.file?.size,
      'file mimetype': req.file?.mimetype
    });
    next();
  },
  sendAttachment
);

// Enviar reação
router.post('/conversations/:conversationId/reaction', sendReaction);

// Encaminhar mensagem
router.post('/conversations/:conversationId/forward', forwardMessage);

// Enviar localização
router.post('/conversations/:conversationId/location', sendLocation);

// Busca de histórico
router.get('/search', searchConversations);

// Limpar mensagens de uma conversa (admin)
router.delete('/conversations/:conversationId/messages', clearConversationMessages);

export default router;

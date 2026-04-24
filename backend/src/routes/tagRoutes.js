import express from 'express';
import { tagController } from '../controllers/tagController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// CRUD de tags
router.get('/', tagController.getAll);
router.get('/:id', tagController.getById);
router.post('/', tagController.create);
router.put('/:id', tagController.update);
router.delete('/:id', tagController.delete);

// Gerenciar tags de conversas
router.get('/conversation/:conversationId', tagController.getByConversation);
router.post('/conversation/add', tagController.addTagToConversation);
router.delete('/conversation/:conversationId/:tagId', tagController.removeTagFromConversation);

export default router;

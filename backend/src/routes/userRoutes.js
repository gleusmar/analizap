import express from 'express';
import { userController } from '../controllers/userController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Listar todos (admin e supervisor)
router.get('/', requireRole(['admin', 'supervisor']), apiRateLimit, userController.getAll);

// Buscar por ID
router.get('/:id', requireRole(['admin', 'supervisor']), apiRateLimit, userController.getById);

// Criar (apenas admin)
router.post('/', requireRole(['admin']), apiRateLimit, userController.create);

// Atualizar (apenas admin)
router.put('/:id', requireRole(['admin']), apiRateLimit, userController.update);

// Excluir (apenas admin)
router.delete('/:id', requireRole(['admin']), apiRateLimit, userController.delete);

// Resetar senha (apenas admin)
router.post('/:id/reset-password', requireRole(['admin']), apiRateLimit, userController.resetPassword);

// Ativar/Desativar (apenas admin)
router.patch('/:id/toggle-active', requireRole(['admin']), apiRateLimit, userController.toggleActive);

export default router;

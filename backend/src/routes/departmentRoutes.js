import express from 'express';
import { departmentController } from '../controllers/departmentController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Listar todos (admin e supervisor)
router.get('/', requireRole(['admin', 'supervisor']), apiRateLimit, departmentController.getAll);

// Buscar por ID
router.get('/:id', requireRole(['admin', 'supervisor']), apiRateLimit, departmentController.getById);

// Criar (apenas admin)
router.post('/', requireRole(['admin']), apiRateLimit, departmentController.create);

// Atualizar (apenas admin)
router.put('/:id', requireRole(['admin']), apiRateLimit, departmentController.update);

// Excluir (apenas admin)
router.delete('/:id', requireRole(['admin']), apiRateLimit, departmentController.delete);

export default router;

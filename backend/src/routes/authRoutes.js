import express from 'express';
import { authController } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { authRateLimit, apiRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Rota de login (pública) com rate limit
router.post('/login', authRateLimit, authController.login);

// Rota de logout (protegida)
router.post('/logout', authenticateToken, authController.logout);

// Rota de logout de todas as sessões (protegida)
router.post('/logout-all', authenticateToken, authController.logoutAll);

// Rota para obter dados do usuário atual (protegida) com rate limit
router.get('/me', apiRateLimit, authenticateToken, authController.me);

export default router;

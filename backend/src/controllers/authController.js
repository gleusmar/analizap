import { authService } from '../services/authService.js';
import { logger } from '../utils/logger.js';

export const authController = {
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios' });
      }

      const result = await authService.login(email, password, req);

      // Log de login bem-sucedido
      logger.logLogin(result.user.id, email, true, req);

      res.json(result);
    } catch (error) {
      // Log de login falhado
      logger.logLogin(null, req.body?.email || 'unknown', false, req);
      
      res.status(401).json({ error: error.message || 'Erro ao fazer login' });
    }
  },

  async logout(req, res) {
    try {
      const token = req.headers['authorization']?.split(' ')[1];
      
      await authService.logout(token, req.user?.id, req);

      // Log de logout
      logger.logLogout(req.user?.id, req.user?.email, req);

      res.json({ success: true });
    } catch (error) {
      logger.error('Erro no logout', { error: error.message }, req.user?.id, 'AUTH_LOGOUT_ERROR', req);
      res.status(500).json({ error: 'Erro ao fazer logout' });
    }
  },

  async logoutAll(req, res) {
    try {
      await authService.logoutAllSessions(req.user.id, req);


      res.json({ success: true });
    } catch (error) {
      logger.error('Erro no logout de todas as sessões', { error: error.message }, req.user.id, 'AUTH_LOGOUT_ALL_ERROR', req);
      res.status(500).json({ error: 'Erro ao fazer logout de todas as sessões' });
    }
  },

  async me(req, res) {
    try {
      // O middleware authenticateToken já adicionou req.user
      res.json({ user: req.user });
    } catch (error) {
      logger.error('Erro ao buscar usuário atual', { error: error.message }, req.user?.id, 'AUTH_ME_ERROR', req);
      res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
  }
};

import express from 'express';
import {
  connect,
  disconnect,
  getStatus,
  getQR,
  refreshQR,
  removeSessionController,
  checkSession,
  saveSyncSettings,
  loadSyncSettings
} from '../controllers/whatsappController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Rotas públicas (sem autenticação) para conexão WhatsApp
router.post('/connect', connect);
router.get('/status', getStatus);
router.get('/session', checkSession);
router.get('/qr', getQR);
router.post('/qr/refresh', refreshQR);

// Rotas que requerem autenticação
router.use(authenticateToken);
router.post('/disconnect', disconnect);
router.delete('/session', removeSessionController);
router.post('/sync-settings', saveSyncSettings);
router.get('/sync-settings', loadSyncSettings);

export default router;

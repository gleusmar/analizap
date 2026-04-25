import { logger } from '../utils/logger.js';
import {
  createWhatsAppSocket,
  getSocket,
  getConnectionStatus,
  getQRCode,
  disconnectSocket,
  removeSession,
  hasSessionSaved,
  reconnectWithSavedSession,
  saveSyncSettingsExport,
  loadSyncSettingsExport
} from '../whatsapp/baileysClient.js';
import QRCode from 'qrcode';

/**
 * Conecta ao WhatsApp
 */
export async function connect(req, res) {
  try {
    logger.info('Solicitação de conexão WhatsApp recebida');

    const socket = getSocket();

    if (socket) {
      const status = getConnectionStatus();
      if (status === 'connected') {
        return res.status(400).json({ error: 'Já conectado ao WhatsApp' });
      }
      if (status === 'connecting') {
        return res.status(400).json({ error: 'Conexão em andamento' });
      }
    }

    // Obtém período de sincronização do corpo da requisição (opcional)
    // Se não fornecido, usa configurações do banco
    const { syncPeriodDays } = req.body;

    logger.info(`Período de sincronização fornecido: ${syncPeriodDays}`);

    // Verifica se existe sessão salva para reconectar automaticamente
    const hasSavedSession = await hasSessionSaved();
    logger.info(`Sessão salva encontrada: ${hasSavedSession}`);

    if (hasSavedSession) {
      logger.info('Tentando reconectar usando sessão salva...');
      // Se for reconectar, usa configurações do banco (syncPeriodDays = null)
      await reconnectWithSavedSession('default', syncPeriodDays);
      res.json({
        success: true,
        message: 'Reconectando usando sessão salva',
        status: getConnectionStatus()
      });
    } else {
      logger.info('Nenhuma sessão salva, criando nova conexão...');
      // Cria o socket com o período de sincronização fornecido (ou do banco se null)
      await createWhatsAppSocket('default', syncPeriodDays);
      res.json({
        success: true,
        message: 'Conexão iniciada',
        status: getConnectionStatus()
      });
    }
  } catch (error) {
    logger.error('Erro ao conectar ao WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao conectar ao WhatsApp' });
  }
}

/**
 * Desconecta do WhatsApp
 */
export async function disconnect(req, res) {
  try {
    logger.info('Solicitação de desconexão WhatsApp recebida');

    const socket = getSocket();

    if (!socket) {
      return res.status(400).json({ error: 'Não conectado ao WhatsApp' });
    }

    await disconnectSocket();

    res.json({
      success: true,
      message: 'Desconectado com sucesso',
      status: getConnectionStatus()
    });
  } catch (error) {
    logger.error('Erro ao desconectar do WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao desconectar do WhatsApp' });
  }
}

/**
 * Obtém o status da conexão
 */
export async function getStatus(req, res) {
  try {
    const status = getConnectionStatus();
    const socket = getSocket();

    let phoneNumber = null;
    if (socket && socket.user) {
      phoneNumber = socket.user.id.split(':')[0];
    }

    res.json({
      status,
      phoneNumber,
      connected: status === 'connected'
    });
  } catch (error) {
    logger.error('Erro ao obter status:', error);
    res.status(500).json({ error: 'Erro ao obter status' });
  }
}

/**
 * Obtém o QR Code
 */
export async function getQR(req, res) {
  try {
    const qr = getQRCode();

    if (!qr) {
      const status = getConnectionStatus();
      if (status === 'connected') {
        return res.status(400).json({ error: 'Já conectado ao WhatsApp' });
      }
      return res.status(404).json({ error: 'QR Code não disponível' });
    }

    // Converte QR Code para imagem
    const qrImage = await QRCode.toDataURL(qr);

    res.json({
      success: true,
      qr: qrImage,
      status: getConnectionStatus()
    });
  } catch (error) {
    logger.error('Erro ao obter QR Code:', error);
    res.status(500).json({ error: 'Erro ao obter QR Code' });
  }
}

/**
 * Atualiza o QR Code
 */
export async function refreshQR(req, res) {
  try {
    logger.info('Solicitação de atualização de QR Code recebida');

    const socket = getSocket();

    if (!socket) {
      return res.status(400).json({ error: 'Socket não criado. Conecte primeiro.' });
    }

    const status = getConnectionStatus();

    if (status === 'connected') {
      return res.status(400).json({ error: 'Já conectado ao WhatsApp' });
    }

    // Remove a sessão para gerar novo QR
    await removeSession();

    // Cria novo socket
    await createWhatsAppSocket();

    res.json({
      success: true,
      message: 'QR Code atualizado',
      status: getConnectionStatus()
    });
  } catch (error) {
    logger.error('Erro ao atualizar QR Code:', error);
    res.status(500).json({ error: 'Erro ao atualizar QR Code' });
  }
}

/**
 * Remove a sessão
 */
export async function removeSessionController(req, res) {
  try {
    logger.info('Solicitação de remoção de sessão recebida');

    await removeSession();

    res.json({
      success: true,
      message: 'Sessão removida com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao remover sessão:', error);
    res.status(500).json({ error: 'Erro ao remover sessão' });
  }
}

/**
 * Verifica se existe sessão salva
 */
export async function checkSession(req, res) {
  try {
    const hasSaved = await hasSessionSaved();

    res.json({
      success: true,
      hasSession: hasSaved
    });
  } catch (error) {
    logger.error('Erro ao verificar sessão:', error);
    res.status(500).json({ error: 'Erro ao verificar sessão' });
  }
}

/**
 * Salva configurações de sincronização
 */
export async function saveSyncSettings(req, res) {
  try {
    const { syncHistory, syncPeriodDays } = req.body;

    logger.info('Salvando configurações de sincronização:', { syncHistory, syncPeriodDays });

    await saveSyncSettingsExport(syncHistory, syncPeriodDays);

    res.json({
      success: true,
      message: 'Configurações de sincronização salvas com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao salvar configurações de sincronização:', error);
    res.status(500).json({ error: 'Erro ao salvar configurações de sincronização' });
  }
}

/**
 * Carrega configurações de sincronização
 */
export async function loadSyncSettings(req, res) {
  try {
    const settings = await loadSyncSettingsExport();

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.error('Erro ao carregar configurações de sincronização:', error);
    res.status(500).json({ error: 'Erro ao carregar configurações de sincronização' });
  }
}

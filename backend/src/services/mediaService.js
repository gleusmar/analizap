import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import { uploadFileToSupabase } from './messageService.js';

/**
 * Faz download de mídia do WhatsApp
 */
export async function downloadMediaFromWhatsApp(sock, message) {
  try {
    const buffer = await downloadMediaMessage(message, 'buffer', {
      logger: logger
    });

    return buffer;
  } catch (error) {
    // Se for erro 403, a URL expirou - é normal para mensagens antigas
    if (error.response?.status === 403 || error.code === 'ERR_BAD_REQUEST') {
      logger.warn('URL de mídia expirada (403), não é possível baixar');
      return null;
    }
    logger.error('Erro ao baixar mídia do WhatsApp:', error);
    throw error;
  }
}

/**
 * Salva buffer temporariamente em disco
 */
export async function saveTempFile(buffer, fileName) {
  const tempDir = path.join(process.cwd(), 'temp');
  
  // Cria diretório temp se não existir
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

/**
 * Processa mídia de uma mensagem: download, upload para Supabase e atualização do banco
 */
export async function processMessageMedia(sock, message, messageType, messageId) {
  try {
    // Faz download da mídia
    const buffer = await downloadMediaFromWhatsApp(sock, message);

    // Se buffer for null (URL expirada), retorna null sem erro
    if (!buffer) {
      return null;
    }

    // Tenta obter extensão do metadata da mensagem
    let extension = '';
    let mimeType = 'application/octet-stream';

    if (message.message) {
      const msg = message.message;
      if (msg.imageMessage) {
        extension = msg.imageMessage.mimetype?.split('/')[1] || 'jpg';
        mimeType = msg.imageMessage.mimetype || 'image/jpeg';
      } else if (msg.audioMessage) {
        extension = msg.audioMessage.mimetype?.split('/')[1] || 'mp3';
        mimeType = msg.audioMessage.mimetype || 'audio/mpeg';
      } else if (msg.videoMessage) {
        extension = msg.videoMessage.mimetype?.split('/')[1] || 'mp4';
        mimeType = msg.videoMessage.mimetype || 'video/mp4';
      } else if (msg.documentMessage) {
        extension = msg.documentMessage.mimetype?.split('/')[1] || 'pdf';
        mimeType = msg.documentMessage.mimetype || 'application/pdf';
      } else if (msg.stickerMessage) {
        extension = msg.stickerMessage.mimetype?.split('/')[1] || 'webp';
        mimeType = msg.stickerMessage.mimetype || 'image/webp';
      }
    }

    // Fallback para extensões padrão se não conseguir do metadata
    if (!extension) {
      switch (messageType) {
        case 'image':
          extension = 'jpg';
          mimeType = 'image/jpeg';
          break;
        case 'audio':
          extension = 'mp3';
          mimeType = 'audio/mpeg';
          break;
        case 'video':
          extension = 'mp4';
          mimeType = 'video/mp4';
          break;
        case 'document':
          extension = 'pdf';
          mimeType = 'application/pdf';
          break;
        default:
          extension = 'bin';
          mimeType = 'application/octet-stream';
      }
    }

    const fileName = `${messageId}.${extension}`;
    const tempFilePath = await saveTempFile(buffer, fileName);
    const publicUrl = await uploadFileToSupabase(tempFilePath, fileName, mimeType);
    await unlink(tempFilePath);
    return publicUrl;
  } catch (error) {
    logger.error('Erro ao processar mídia:', error);
    throw error;
  }
}

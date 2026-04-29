import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { uploadFileToSupabase } from './messageService.js';

/**
 * Faz download de mídia do WhatsApp
 */
export async function downloadMediaFromWhatsApp(message) {
  try {
    const buffer = await downloadMediaMessage(message, 'buffer', {});
    return buffer;
  } catch (error) {
    // 403 = URL expirada (normal para mensagens antigas)
    if (error.response?.status === 403 || error.code === 'ERR_BAD_REQUEST') {
      return null;
    }
    throw error;
  }
}

/**
 * Processa mídia de uma mensagem: download, upload para Supabase e atualização do banco
 */
export async function processMessageMedia(message, messageType, messageId) {
  try {
    const buffer = await downloadMediaFromWhatsApp(message);

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
        // PTT chega como 'audio/ogg; codecs=opus' — remover parâmetro para extensão limpa
        const baseMime = (msg.audioMessage.mimetype || 'audio/ogg').split(';')[0].trim();
        extension = baseMime.split('/')[1] || 'ogg';
        mimeType = baseMime;
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
    const publicUrl = await uploadFileToSupabase(buffer, fileName, mimeType);
    return publicUrl;
  } catch (error) {
    throw error;
  }
}

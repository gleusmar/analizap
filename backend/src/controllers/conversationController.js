import { logger } from '../utils/logger.js';
import { createClient } from '@supabase/supabase-js';
import {
  getAllConversations,
  getConversationMessages,
  markMessagesAsRead,
  closeConversation,
  openConversation,
  getOrCreateConversation,
  updateContactName,
  sendWhatsAppMessage,
  saveMessage,
  sendWhatsAppAttachment,
  sendWhatsAppLocation,
  sendWhatsAppReaction,
  forwardWhatsAppMessage,
  MESSAGE_TYPES
} from '../services/messageService.js';
import { getSocket, getIO } from '../whatsapp/baileysClient.js';
import multer from 'multer';

// Configuração do multer para upload de arquivos
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Obtém todas as conversas
 */
export async function getConversations(req, res) {
  try {
    const conversations = await getAllConversations();

    res.json({
      success: true,
      conversations
    });
  } catch (error) {
    logger.error('Erro ao obter conversas:', error);
    res.status(500).json({ error: 'Erro ao obter conversas' });
  }
}

/**
 * Obtém mensagens de uma conversa
 */
export async function getMessages(req, res) {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const messages = await getConversationMessages(conversationId, limit, offset);

    // Ordenar mensagens por timestamp (mais antigas primeiro)
    messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json({
      success: true,
      messages
    });
  } catch (error) {
    logger.error('Erro ao obter mensagens:', error);
    res.status(500).json({ error: 'Erro ao obter mensagens' });
  }
}

/**
 * Marca mensagens como lidas
 */
export async function markAsRead(req, res) {
  try {
    const { conversationId } = req.params;


    await markMessagesAsRead(conversationId);

    res.json({
      success: true,
      message: 'Mensagens marcadas como lidas'
    });
  } catch (error) {
    logger.error('Erro ao marcar mensagens como lidas:', error);
    res.status(500).json({ error: 'Erro ao marcar mensagens como lidas' });
  }
}

/**
 * Fecha uma conversa
 */
export async function closeConversationRoute(req, res) {
  try {
    const { conversationId } = req.params;


    await closeConversation(conversationId);

    res.json({
      success: true,
      message: 'Conversa fechada'
    });
  } catch (error) {
    logger.error('Erro ao fechar conversa:', error);
    res.status(500).json({ error: 'Erro ao fechar conversa' });
  }
}

/**
 * Abre conversa
 */
export async function openConversationRoute(req, res) {
  try {
    const { conversationId } = req.params;


    const sock = getSocket();
    await openConversation(conversationId, sock);

    res.json({
      success: true,
      message: 'Conversa aberta'
    });
  } catch (error) {
    logger.error('Erro ao abrir conversa:', error);
    res.status(500).json({ error: 'Erro ao abrir conversa' });
  }
}

/**
 * Atualiza nome do contato
 */
export async function updateContactNameRoute(req, res) {
  try {
    const { conversationId } = req.params;
    const { contactName } = req.body;


    await updateContactName(conversationId, contactName);

    res.json({
      success: true,
      message: 'Nome do contato atualizado'
    });
  } catch (error) {
    logger.error('Erro ao atualizar nome do contato:', error);
    res.status(500).json({ error: 'Erro ao atualizar nome do contato' });
  }
}

/**
 * Envia mensagem
 */
export async function sendMessage(req, res) {
  try {
    const { conversationId } = req.params;
    const { content, message_type, metadata } = req.body;

    logger.info('Recebida solicitação de envio de mensagem:', {
      conversationId,
      content: content?.substring(0, 50),
      message_type,
      metadata
    });

    const sock = getSocket();
    if (!sock) {
      logger.warn('WhatsApp não está conectado ao tentar enviar mensagem');
      return res.status(400).json({ error: 'WhatsApp não está conectado' });
    }

    logger.info('Socket obtido com sucesso, enviando mensagem...');

    // Buscar usuário para verificar assinatura
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('nickname, has_signature')
      .eq('id', req.user.id)
      .single();

    if (userError) {
      logger.error('Erro ao buscar usuário:', userError);
    }

    // Formatar mensagem com assinatura se o usuário tiver
    let formattedContent = content;
    if (user?.has_signature && user?.nickname && message_type === MESSAGE_TYPES.TEXT) {
      formattedContent = `*_${user.nickname}_*\n${content}`;
    }

    // Enviar mensagem para o WhatsApp
    const sentMessage = await sendWhatsAppMessage(
      sock,
      conversationId,
      formattedContent,
      message_type || MESSAGE_TYPES.TEXT,
      metadata || {}
    );

    // Emitir mensagem temporária apenas para mensagens de texto (não para imagens/anexos)
    // Para imagens/anexos, esperar o processamento da mídia para evitar flicker
    const io = getIO();
    const isMedia = [MESSAGE_TYPES.IMAGE, MESSAGE_TYPES.AUDIO, MESSAGE_TYPES.VIDEO,
                     MESSAGE_TYPES.DOCUMENT, MESSAGE_TYPES.STICKER].includes(message_type || MESSAGE_TYPES.TEXT);

    if (io && !isMedia) {
      const tempMessage = {
        id: null,
        message_id: sentMessage.key.id,
        conversation_id: conversationId,
        from_me: true,
        message_type: message_type || MESSAGE_TYPES.TEXT,
        content: formattedContent,
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
        is_read: false,
        is_delivered: false
      };

      io.emit('whatsapp:message', {
        conversation_id: conversationId,
        message: tempMessage,
        is_temp: true
      });
    }

    // Responder imediatamente ao frontend
    res.json({
      success: true,
      message: 'Mensagem enviada',
      sentMessage
    });

    // Salvar mensagem no banco de dados em background (não await)
    saveMessage({
      conversation_id: conversationId,
      message_id: sentMessage.key.id,
      from_me: true,
      message_type: message_type || MESSAGE_TYPES.TEXT,
      content: formattedContent,
      metadata: metadata || {},
      timestamp: new Date().toISOString()
    })
      .then(savedMessage => {
        // Atualizar last_message_at da conversa
        supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
          .catch(error => logger.error('Erro ao atualizar last_message_at:', error));

        // Emitir evento com a mensagem salva (não é temporária)
        const io = getIO();
        if (io) {
          io.emit('whatsapp:message', {
            conversation_id: conversationId,
            message: savedMessage,
            is_temp: false
          });
        }
      })
      .catch(error => {
        logger.error('Erro ao salvar mensagem em background:', error);
      });
  } catch (error) {
    logger.error('Erro ao enviar mensagem:', {
      message: error.message,
      stack: error.stack,
      conversationId,
      content: req.body?.content?.substring(0, 50)
    });
    res.status(500).json({ error: 'Erro ao enviar mensagem', details: error.message });
  }
}

/**
 * Exclui uma conversa (apenas admin)
 */
export async function deleteConversation(req, res) {
  try {
    const { conversationId } = req.params;

    // Verificar se é admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas admin pode excluir conversas' });
    }


    // Excluir mensagens da conversa
    const { error: deleteMessagesError } = await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', conversationId);

    if (deleteMessagesError) {
      logger.error('Erro ao excluir mensagens:', deleteMessagesError);
      throw deleteMessagesError;
    }

    // Excluir conversa
    const { error: deleteConversationError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (deleteConversationError) {
      logger.error('Erro ao excluir conversa:', deleteConversationError);
      throw deleteConversationError;
    }

    res.json({
      success: true,
      message: 'Conversa excluída com sucesso'
    });
  } catch (error) {
    logger.error('Erro ao excluir conversa:', error);
    res.status(500).json({ error: 'Erro ao excluir conversa' });
  }
}

/**
 * Encaminha mensagem
 */
export async function forwardMessage(req, res) {
  try {
    const { conversationId } = req.params;
    const { messageIds, targetConversationIds } = req.body;

    logger.info('Recebida solicitação de encaminhamento:', {
      conversationId,
      messageIds,
      targetConversationIds
    });

    const sock = getSocket();
    if (!sock) {
      logger.warn('WhatsApp não está conectado ao tentar encaminhar mensagem');
      return res.status(400).json({ error: 'WhatsApp não está conectado' });
    }

    // Encaminha para cada conversa de destino
    const results = [];
    for (const targetConvId of targetConversationIds) {
      for (const messageId of messageIds) {
        try {
          const forwarded = await forwardWhatsAppMessage(sock, conversationId, targetConvId, messageId);
          results.push({ targetConvId, messageId, success: true, forwarded });
        } catch (error) {
          logger.error('Erro ao encaminhar mensagem:', error);
          results.push({ targetConvId, messageId, success: false, error: error.message });
        }
      }
    }

    res.json({
      success: true,
      message: 'Mensagem encaminhada',
      results
    });
  } catch (error) {
    logger.error('Erro ao encaminhar mensagem:', error);
    res.status(500).json({ error: 'Erro ao encaminhar mensagem' });
  }
}

/**
 * Envia reação
 */
export async function sendReaction(req, res) {
  try {
    const { conversationId } = req.params;
    const { messageId, reaction } = req.body;

    logger.info('Recebida solicitação de envio de reação:', {
      conversationId,
      messageId,
      reaction
    });

    const sock = getSocket();
    if (!sock) {
      logger.warn('WhatsApp não está conectado ao tentar enviar reação');
      return res.status(400).json({ error: 'WhatsApp não está conectado' });
    }

    // Se reaction for vazio, remover reação
    if (!reaction) {
      await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', req.user.id);

      // Não enviar para WhatsApp (Baileys pode não suportar remoção via API)
      // TODO: Implementar remoção de reação no WhatsApp se necessário

      res.json({
        success: true,
        message: 'Reação removida'
      });
      return;
    }

    await sendWhatsAppReaction(sock, conversationId, messageId, reaction);

    // Salvar reação no banco de dados
    const { error: reactionError } = await supabase
      .from('message_reactions')
      .upsert({
        message_id: messageId,
        user_id: req.user.id,
        reaction: reaction
      }, {
        onConflict: 'message_id,user_id'
      });

    if (reactionError) {
      logger.error('Erro ao salvar reação no banco:', reactionError);
    }

    res.json({
      success: true,
      message: 'Reação enviada'
    });
  } catch (error) {
    logger.error('Erro ao enviar reação:', error);
    res.status(500).json({ error: 'Erro ao enviar reação' });
  }
}

/**
 * Envia anexo
 */
export async function sendAttachment(req, res) {
  try {
    const { conversationId } = req.params;
    const { caption } = req.body;
    const file = req.file;


    const sock = getSocket();
    if (!sock) {
      return res.status(400).json({ error: 'WhatsApp não está conectado' });
    }

    const sentMessage = await sendWhatsAppAttachment(
      sock,
      conversationId,
      file,
      caption
    );

    // Fazer upload do arquivo para Supabase Storage
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const fileName = `${conversationId}/${Date.now()}_${file.originalname}`;
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('whatsapp-media')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (uploadError) {
      logger.error('Erro ao fazer upload do arquivo:', uploadError);
      throw uploadError;
    }

    // Obter URL pública
    const { data: { publicUrl } } = supabase
      .storage
      .from('whatsapp-media')
      .getPublicUrl(fileName);

    // Salvar mensagem no banco de dados com a URL do arquivo
    const savedMessage = await saveMessage({
      conversation_id: conversationId,
      message_id: sentMessage.key.id,
      from_me: true,
      message_type: sentMessage.messageType,
      content: publicUrl,
      metadata: sentMessage.metadata || {},
      timestamp: new Date().toISOString()
    });

    // Atualizar last_message_at da conversa
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Emitir evento para o frontend
    const io = getIO();
    if (io) {
      io.emit('whatsapp:message', {
        conversation_id: conversationId,
        message: savedMessage,
        is_temp: false
      });
    }

    res.json({
      success: true,
      message: 'Anexo enviado',
      sentMessage
    });
  } catch (error) {
    logger.error('Erro ao enviar anexo:', error);
    res.status(500).json({ error: 'Erro ao enviar anexo' });
  }
}

/**
 * Envia localização
 */
export async function sendLocation(req, res) {
  try {
    const { conversationId } = req.params;
    const { latitude, longitude } = req.body;


    const sock = getSocket();
    if (!sock) {
      return res.status(400).json({ error: 'WhatsApp não está conectado' });
    }

    const sentMessage = await sendWhatsAppLocation(
      sock,
      conversationId,
      latitude,
      longitude
    );

    // Salvar mensagem no banco de dados
    const savedMessage = await saveMessage({
      conversation_id: conversationId,
      message_id: sentMessage.key.id,
      from_me: true,
      message_type: MESSAGE_TYPES.LOCATION,
      content: sentMessage.content,
      metadata: { latitude, longitude },
      timestamp: new Date().toISOString()
    });

    // Atualizar last_message_at da conversa
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Emitir evento para o frontend
    const io = getIO();
    if (io) {
      io.emit('whatsapp:message', {
        conversation_id: conversationId,
        message: savedMessage
      });
    }

    res.json({
      success: true,
      message: 'Localização enviada',
      sentMessage
    });
  } catch (error) {
    logger.error('Erro ao enviar localização:', error);
    res.status(500).json({ error: 'Erro ao enviar localização' });
  }
}

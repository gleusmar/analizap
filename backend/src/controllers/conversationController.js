import { logger } from '../utils/logger.js';
import { createClient } from '@supabase/supabase-js';
import {
  getAllConversations,
  getConversationMessages,
  markMessagesAsRead,
  markMultipleConversationsAsRead,
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
  },
  fileFilter: (req, file, cb) => {
    console.log('🔍 Multer fileFilter:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    cb(null, true);
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
 * Marca múltiplas conversas como lidas
 */
export async function markMultipleAsRead(req, res) {
  try {
    const { conversationIds } = req.body;

    if (!conversationIds || !Array.isArray(conversationIds)) {
      return res.status(400).json({ error: 'conversationIds deve ser um array' });
    }

    await markMultipleConversationsAsRead(conversationIds);

    res.json({
      success: true,
      message: `${conversationIds.length} conversas marcadas como lidas`
    });
  } catch (error) {
    logger.error('Erro ao marcar múltiplas conversas como lidas:', error);
    res.status(500).json({ error: 'Erro ao marcar múltiplas conversas como lidas' });
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
    const { content, message_type, messageType, metadata } = req.body;

    // Aceita tanto camelCase quanto snake_case para message_type
    const messageTypeValue = message_type || messageType;

    logger.info('📤 [POST /send] Requisição de envio de mensagem recebida:', {
      conversationId,
      content,
      message_type: messageTypeValue,
      metadata,
      userId: req.user?.id,
      userEmail: req.user?.email
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

    logger.info('Verificando assinatura:', {
      userId: req.user.id,
      user: user,
      has_signature: user?.has_signature,
      nickname: user?.nickname,
      message_type: messageTypeValue
    });

    // Formatar mensagem com assinatura se o usuário tiver
    let formattedContent = content;
    if (user?.has_signature && user?.nickname && messageTypeValue === MESSAGE_TYPES.TEXT) {
      formattedContent = `*_${user.nickname}_*\n${content}`;
      logger.info('Assinatura aplicada:', { nickname: user.nickname });
    } else {
      logger.info('Assinatura não aplicada:', {
        hasUser: !!user,
        hasSignature: user?.has_signature,
        hasNickname: !!user?.nickname,
        isText: messageTypeValue === MESSAGE_TYPES.TEXT
      });
    }

    // Gerar ID temporário para a mensagem
    const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Salvar mensagem com ID temporário antes de enviar para o WhatsApp
    const savedMessage = await saveMessage({
      conversation_id: conversationId,
      message_id: tempMessageId,
      from_me: true,
      message_type: messageTypeValue || MESSAGE_TYPES.TEXT,
      content: formattedContent,
      metadata: metadata || {},
      timestamp: new Date().toISOString()
    });

    // Atualizar last_message_at da conversa
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Emitir mensagem para o frontend como temporária (ID será atualizado depois)
    const io = getIO();
    if (io) {
      io.emit('whatsapp:message', {
        conversation_id: conversationId,
        message: savedMessage,
        is_temp: true
      });
    }

    // Enviar mensagem para o WhatsApp em background (não await)
    sendWhatsAppMessage(
      sock,
      conversationId,
      formattedContent,
      messageTypeValue || MESSAGE_TYPES.TEXT,
      metadata || {}
    )
      .then(async (sentMessage) => {
        // Atualizar o real_message_id com o ID do Baileys e marcar como entregue
        const { error: updateError } = await supabase
          .from('messages')
          .update({ real_message_id: sentMessage.key.id, is_delivered: true, delivery_error: null })
          .eq('id', savedMessage.id);

        if (updateError) {
          logger.error('Erro ao atualizar real_message_id:', updateError);
        } else {
          logger.info('real_message_id atualizado em background:', sentMessage.key.id);

          // Buscar mensagem atualizada para enviar ao frontend
          const { data: updatedMessage } = await supabase
            .from('messages')
            .select('*')
            .eq('id', savedMessage.id)
            .single();

          // Emitir evento para o frontend para atualizar mensagem temporária
          const io = getIO();
          if (io) {
            logger.info('📡 Emitindo whatsapp:message_updated:', {
              conversation_id: conversationId,
              temp_message_id: tempMessageId,
              real_message_id: sentMessage.key.id,
              message_id: updatedMessage?.message_id
            });
            io.emit('whatsapp:message_updated', {
              conversation_id: conversationId,
              temp_message_id: tempMessageId,
              real_message_id: sentMessage.key.id,
              message: updatedMessage
            });
            logger.info('✅ Evento whatsapp:message_updated emitido com sucesso');
          } else {
            logger.warn('⚠️ Socket.io não disponível para emitir evento');
          }
        }
      })
      .catch(error => {
        logger.error('Erro ao enviar mensagem para WhatsApp:', error);
        // Marcar mensagem como falha
        supabase
          .from('messages')
          .update({ delivery_error: error.message || 'Erro ao enviar mensagem' })
          .eq('id', savedMessage.id)
          .catch(err => logger.error('Erro ao marcar mensagem como falha:', err));
      });

    // Timeout para marcar mensagem como falha se não receber ID real após 30 segundos
    setTimeout(async () => {
      const { data: message } = await supabase
        .from('messages')
        .select('real_message_id, delivery_error')
        .eq('id', savedMessage.id)
        .single();

      // Se ainda não tem real_message_id e não tem erro de entrega, marca como falha
      if (message && !message.real_message_id && !message.delivery_error) {
        await supabase
          .from('messages')
          .update({ delivery_error: 'Tempo esgotado: não recebeu confirmação do WhatsApp' })
          .eq('id', savedMessage.id);

        logger.warn(`Mensagem ${savedMessage.id} marcada como falha (timeout)`);

        // Emitir evento para o frontend sobre a falha
        const io = getIO();
        if (io) {
          io.emit('whatsapp:message_failed', {
            conversation_id: conversationId,
            message_id: savedMessage.id,
            error: 'Tempo esgotado: não recebeu confirmação do WhatsApp'
          });
        }
      }
    }, 30000); // 30 segundos

    // Responder imediatamente ao frontend
    res.json({
      success: true,
      message: 'Mensagem enviada',
      savedMessage,
      temp_message_id: tempMessageId
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

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'messageIds é obrigatório e deve ser um array não vazio' });
    }

    if (!targetConversationIds || !Array.isArray(targetConversationIds) || targetConversationIds.length === 0) {
      return res.status(400).json({ error: 'targetConversationIds é obrigatório e deve ser um array não vazio' });
    }

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
          logger.error('Erro ao encaminhar mensagem:', {
            error: error.message,
            stack: error.stack,
            targetConvId,
            messageId
          });
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

    logger.info('📎 [POST /attachment] Requisição de envio de anexo recebida:', {
      conversationId,
      caption,
      hasFile: !!file,
      fileName: file?.originalname,
      fileMimetype: file?.mimetype,
      fileSize: file?.size
    });

    if (!file) {
      logger.error('Arquivo não encontrado na requisição');
      return res.status(400).json({ error: 'Arquivo não encontrado' });
    }

    const sock = getSocket();
    if (!sock) {
      logger.error('WhatsApp não está conectado');
      return res.status(400).json({ error: 'WhatsApp não está conectado' });
    }

    logger.info('Enviando anexo para o WhatsApp...');
    const sentMessage = await sendWhatsAppAttachment(
      sock,
      conversationId,
      file,
      caption
    );
    logger.info('Anexo enviado para o WhatsApp com sucesso:', sentMessage);

    // Fazer upload do arquivo para Supabase Storage
    logger.info('Fazendo upload do arquivo para Supabase...');
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

    logger.info('Upload para Supabase realizado com sucesso');

    // Obter URL pública
    const { data: { publicUrl } } = supabase
      .storage
      .from('whatsapp-media')
      .getPublicUrl(fileName);

    logger.info('URL pública obtida:', publicUrl);

    // Gerar ID temporário para a mensagem
    const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Salvar mensagem com ID temporário
    logger.info('Salvando mensagem no banco...');
    const savedMessage = await saveMessage({
      conversation_id: conversationId,
      message_id: tempMessageId,
      from_me: true,
      message_type: sentMessage.messageType,
      content: publicUrl,
      metadata: sentMessage.metadata || {},
      timestamp: new Date().toISOString()
    });
    logger.info('Mensagem salva no banco com sucesso');

    // Atualizar last_message_at da conversa
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Emitir mensagem para o frontend (não é temporária)
    const io = getIO();
    if (io) {
      io.emit('whatsapp:message', {
        conversation_id: conversationId,
        message: savedMessage,
        is_temp: false
      });
    }

    // Atualizar o real_message_id em background
    supabase
      .from('messages')
      .update({ real_message_id: sentMessage.key.id, is_delivered: true, delivery_error: null })
      .eq('id', savedMessage.id)
      .then(async ({ error }) => {
        if (error) {
          logger.error('Erro ao atualizar real_message_id:', error);
        } else {
          logger.info('real_message_id atualizado para anexo:', sentMessage.key.id);

          // Buscar mensagem atualizada para enviar ao frontend
          const { data: updatedMessage } = await supabase
            .from('messages')
            .select('*')
            .eq('id', savedMessage.id)
            .single();

          // Emitir evento para o frontend para atualizar mensagem temporária
          const io = getIO();
          if (io) {
            logger.info('📡 Emitindo whatsapp:message_updated:', {
              conversation_id: conversationId,
              temp_message_id: tempMessageId,
              real_message_id: sentMessage.key.id,
              message_id: updatedMessage?.message_id
            });
            io.emit('whatsapp:message_updated', {
              conversation_id: conversationId,
              temp_message_id: tempMessageId,
              real_message_id: sentMessage.key.id,
              message: updatedMessage
            });
            logger.info('✅ Evento whatsapp:message_updated emitido com sucesso');
          } else {
            logger.warn('⚠️ Socket.io não disponível para emitir evento');
          }
        }
      })
      .catch(error => {
        logger.error('Erro ao enviar anexo para WhatsApp:', error);
        // Marcar mensagem como falha
        supabase
          .from('messages')
          .update({ delivery_error: error.message || 'Erro ao enviar anexo' })
          .eq('id', savedMessage.id)
          .catch(err => logger.error('Erro ao marcar mensagem como falha:', err));
      });

    // Timeout para marcar mensagem como falha se não receber ID real após 30 segundos
    setTimeout(async () => {
      const { data: message } = await supabase
        .from('messages')
        .select('real_message_id, delivery_error')
        .eq('id', savedMessage.id)
        .single();

      if (message && !message.real_message_id && !message.delivery_error) {
        await supabase
          .from('messages')
          .update({ delivery_error: 'Tempo esgotado: não recebeu confirmação do WhatsApp' })
          .eq('id', savedMessage.id);

        logger.warn(`Mensagem ${savedMessage.id} marcada como falha (timeout)`);

        const io = getIO();
        if (io) {
          io.emit('whatsapp:message_failed', {
            conversation_id: conversationId,
            message_id: savedMessage.id,
            error: 'Tempo esgotado: não recebeu confirmação do WhatsApp'
          });
        }
      }
    }, 30000);

    res.json({
      success: true,
      message: 'Anexo enviado',
      savedMessage,
      temp_message_id: tempMessageId
    });
  } catch (error) {
    logger.error('Erro ao enviar anexo:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      conversationId,
      hasFile: !!req.file
    });
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

    // Gerar ID temporário para a mensagem
    const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Salvar mensagem com ID temporário
    const savedMessage = await saveMessage({
      conversation_id: conversationId,
      message_id: tempMessageId,
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

    // Emitir mensagem para o frontend (não é temporária)
    const io = getIO();
    if (io) {
      io.emit('whatsapp:message', {
        conversation_id: conversationId,
        message: savedMessage,
        is_temp: false
      });
    }

    // Atualizar o real_message_id em background
    supabase
      .from('messages')
      .update({ real_message_id: sentMessage.key.id, is_delivered: true, delivery_error: null })
      .eq('id', savedMessage.id)
      .then(async ({ error }) => {
        if (error) {
          logger.error('Erro ao atualizar real_message_id:', error);
        } else {
          logger.info('real_message_id atualizado para localização:', sentMessage.key.id);

          // Buscar mensagem atualizada para enviar ao frontend
          const { data: updatedMessage } = await supabase
            .from('messages')
            .select('*')
            .eq('id', savedMessage.id)
            .single();

          // Emitir evento para o frontend para atualizar mensagem temporária
          const io = getIO();
          if (io) {
            logger.info('📡 Emitindo whatsapp:message_updated:', {
              conversation_id: conversationId,
              temp_message_id: tempMessageId,
              real_message_id: sentMessage.key.id,
              message_id: updatedMessage?.message_id
            });
            io.emit('whatsapp:message_updated', {
              conversation_id: conversationId,
              temp_message_id: tempMessageId,
              real_message_id: sentMessage.key.id,
              message: updatedMessage
            });
            logger.info('✅ Evento whatsapp:message_updated emitido com sucesso');
          } else {
            logger.warn('⚠️ Socket.io não disponível para emitir evento');
          }
        }
      })
      .catch(error => {
        logger.error('Erro ao enviar localização para WhatsApp:', error);
        // Marcar mensagem como falha
        supabase
          .from('messages')
          .update({ delivery_error: error.message || 'Erro ao enviar localização' })
          .eq('id', savedMessage.id)
          .catch(err => logger.error('Erro ao marcar mensagem como falha:', err));
      });

    // Timeout para marcar mensagem como falha se não receber ID real após 30 segundos
    setTimeout(async () => {
      const { data: message } = await supabase
        .from('messages')
        .select('real_message_id, delivery_error')
        .eq('id', savedMessage.id)
        .single();

      if (message && !message.real_message_id && !message.delivery_error) {
        await supabase
          .from('messages')
          .update({ delivery_error: 'Tempo esgotado: não recebeu confirmação do WhatsApp' })
          .eq('id', savedMessage.id);

        logger.warn(`Mensagem ${savedMessage.id} marcada como falha (timeout)`);

        const io = getIO();
        if (io) {
          io.emit('whatsapp:message_failed', {
            conversation_id: conversationId,
            message_id: savedMessage.id,
            error: 'Tempo esgotado: não recebeu confirmação do WhatsApp'
          });
        }
      }
    }, 30000);

    res.json({
      success: true,
      message: 'Localização enviada',
      savedMessage
    });
  } catch (error) {
    logger.error('Erro ao enviar localização:', error);
    res.status(500).json({ error: 'Erro ao enviar localização' });
  }
}

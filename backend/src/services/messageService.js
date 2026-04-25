import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import { unlink } from 'fs/promises';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUCKET_NAME = 'whatsapp-media';
let syncPeriodDays = 7; // Período padrão de sincronização em dias

/**
 * Define o período de sincronização em dias
 */
export function setSyncPeriodDays(days) {
  syncPeriodDays = days;
  logger.info(`Período de sincronização definido para ${days} dias`);
}

/**
 * Obtém o período de sincronização atual
 */
export function getSyncPeriodDays() {
  return syncPeriodDays;
}

/**
 * Normaliza JID para obter o número de telefone
 * Remove @s.whatsapp.net ou @lid
 */
export function normalizeJid(jid) {
  return jid.split('@')[0];
}

/**
 * Obtém o identificador principal (JID ou LID)
 * Prioriza JID se disponível, senão usa LID
 */
export function getPrimaryIdentifier(lid, jid = null) {
  if (jid && jid.endsWith('@s.whatsapp.net')) {
    return jid;
  }
  if (lid && lid.endsWith('@lid')) {
    return lid;
  }
  // Se não tiver @lid ou @s.whatsapp.net, assume que é um JID
  return lid || jid;
}

/**
 * Salva mapeamento LID->JID no banco de dados
 */
export async function saveLidMapping(lid, jid, phone) {
  try {
    logger.debug('Salvando mapeamento LID->JID', { lid, jid, phone });

    const { error } = await supabase.rpc('save_lid_mapping', {
      p_lid: lid,
      p_jid: jid,
      p_phone: phone
    });

    if (error) {
      logger.error('Erro ao salvar mapeamento LID->JID:', error);
      throw error;
    }

    logger.debug('Mapeamento LID->JID salvo com sucesso', { lid, jid, phone });
  } catch (error) {
    logger.error('Erro ao salvar mapeamento LID->JID:', error);
    throw error;
  }
}

/**
 * Obtém JID a partir de LID
 */
export async function getJidFromLid(lid) {
  try {
    const { data, error } = await supabase.rpc('get_jid_from_lid', {
      p_lid: lid
    });

    if (error) {
      logger.error('Erro ao obter JID do LID:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Erro ao obter JID do LID:', error);
    return null;
  }
}

/**
 * Obtém LID a partir de JID
 */
export async function getLidFromJid(jid) {
  try {
    const { data, error } = await supabase.rpc('get_lid_from_jid', {
      p_jid: jid
    });

    if (error) {
      logger.error('Erro ao obter LID do JID:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Erro ao obter LID do JID:', error);
    return null;
  }
}

/**
 * Tipos de mensagens suportados
 */
export const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
  DOCUMENT: 'document',
  LOCATION: 'location',
  CONTACT: 'contact',
  STICKER: 'sticker',
  POLL: 'poll',
  INTERACTIVE_RESPONSE: 'interactive_response'
};

/**
 * Extrai o número de telefone do JID do WhatsApp
 * JID format: 5511999999999@s.whatsapp.net
 */
export function extractPhoneFromJid(jid) {
  return jid.split('@')[0];
}

/**
 * Busca foto de perfil do WhatsApp
 */
export async function fetchProfilePicture(sock, jid) {
  try {
    const profilePictureUrl = await sock.profilePictureUrl(jid, 'image');
    return profilePictureUrl;
  } catch (error) {
    // Timeout ao buscar foto é comum, não logar erro
    return null;
  }
}

/**
 * Obtém ou cria uma conversa
 */
export async function getOrCreateConversation(jid, contactName = null, profilePictureUrl = null, lid = null, sock = null, messageTimestamp = null) {
  let phone = extractPhoneFromJid(jid);

  logger.debug('getOrCreateConversation chamada', {
    phone,
    contactName,
    messageTimestamp,
    syncPeriodDays
  });

  try {
    // Se o jid for um LID, tenta obter o JID mapeado
    if (jid && jid.endsWith('@lid')) {
      const mappedJid = await getJidFromLid(jid);
      if (mappedJid) {
        // Usa o JID mapeado em vez do LID
        jid = mappedJid;
        phone = extractPhoneFromJid(jid);
      }
    }

    // Tenta encontrar conversa existente pelo phone
    const { data: existingConversation, error: findError } = await supabase
      .from('conversations')
      .select('*')
      .eq('phone', phone)
      .single();

    logger.debug('Busca de conversa existente', {
      phone,
      found: !!existingConversation,
      error: findError?.message
    });

    if (existingConversation) {
      // Se a conversa já existe, retorna imediatamente (não verifica período)
      // Isso permite que mensagens antigas sejam adicionadas a conversas existentes

      // Se a conversa estava fechada, reabre
      if (!existingConversation.is_open) {
        const { error: updateError } = await supabase
          .from('conversations')
          .update({ is_open: true })
          .eq('id', existingConversation.id);

        if (updateError) {
          logger.error('Erro ao reabrir conversa:', updateError);
        }
      }

      // Atualiza contact_name se tiver um novo nome
      if (contactName && contactName !== existingConversation.contact_name) {
        const { error: nameUpdateError } = await supabase
          .from('conversations')
          .update({ contact_name: contactName })
          .eq('id', existingConversation.id);

        if (!nameUpdateError) {
          existingConversation.contact_name = contactName;
        }
      }

      // Se não tiver foto de perfil, tenta buscar
      if (!existingConversation.profile_picture_url && sock) {
        const ppUrl = await fetchProfilePicture(sock, jid);
        if (ppUrl) {
          await supabase
            .from('conversations')
            .update({ profile_picture_url: ppUrl })
            .eq('id', existingConversation.id);
          existingConversation.profile_picture_url = ppUrl;
        }
      }

      return existingConversation;
    }

    // Verificar período de sincronização APENAS para criação de NOVAS conversas
    if (messageTimestamp && syncPeriodDays) {
      const messageDate = new Date(messageTimestamp * 1000); // timestamp em segundos
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - syncPeriodDays);

      logger.debug('Verificando período de sincronização', {
        messageDate: messageDate.toISOString(),
        cutoffDate: cutoffDate.toISOString(),
        syncPeriodDays,
        isOld: messageDate < cutoffDate
      });

      if (messageDate < cutoffDate) {
        logger.debug(`Mensagem antiga (${messageDate.toISOString()}), não cria nova conversa (período: ${syncPeriodDays} dias)`);
        // Retorna null para indicar que não deve criar nova conversa
        return null;
      }
    }

    // Se não tiver foto de perfil, tenta buscar
    if (!profilePictureUrl && sock) {
      profilePictureUrl = await fetchProfilePicture(sock, jid);
    }

    // Cria nova conversa
    logger.debug('Criando nova conversa', { phone, contactName });
    // Usa messageTimestamp para last_message_at se disponível, senão data atual
    const lastMessageAt = messageTimestamp
      ? new Date(messageTimestamp * 1000).toISOString()
      : new Date().toISOString();

    const { data: newConversation, error: createError } = await supabase
      .from('conversations')
      .insert({
        phone,
        contact_name: contactName || phone, // Usa phone como fallback se não tiver nome
        profile_picture_url: profilePictureUrl,
        is_open: true,
        last_message_at: lastMessageAt
      })
      .select()
      .single();

    if (createError) {
      logger.error('Erro ao criar conversa:', createError);
      throw createError;
    }

    logger.info('Nova conversa criada com sucesso', { phone, conversationId: newConversation.id });
    return newConversation;
  } catch (error) {
    logger.error('Erro ao obter ou criar conversa:', error);
    throw error;
  }
}

/**
 * Faz upload de arquivo para o Supabase Storage
 */
export async function uploadFileToSupabase(filePath, fileName, mimeType) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const filePathStorage = `whatsapp/${Date.now()}-${fileName}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePathStorage, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (error) {
      logger.error('Erro ao fazer upload:', error);
      throw error;
    }

    // Obtém URL pública
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePathStorage);

    return publicUrl;
  } catch (error) {
    logger.error('Erro no upload do arquivo:', error);
    throw error;
  }
}

/**
 * Salva uma mensagem no banco de dados
 */
export async function saveMessage(messageData) {
  try {
    const { conversation_id, message_id, from_me, message_type, content, metadata, timestamp } = messageData;

    // Verificar se mensagem já existe
    let existingMessage = null;
    try {
      const { data } = await supabase
        .from('messages')
        .select('id')
        .eq('message_id', message_id)
        .single();
      existingMessage = data;
    } catch (e) {
      // Mensagem não existe, continua
    }

    if (existingMessage) {
      return existingMessage;
    }
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        message_id,
        from_me,
        message_type,
        content,
        metadata,
        timestamp: new Date(timestamp).toISOString(),
        is_read: false,
        is_delivered: false
      })
      .select()
      .single();

    if (error) {
      logger.error('Erro ao salvar mensagem:', error);
      throw error;
    }

    // Atualizar last_message_at da conversa
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date(timestamp).toISOString() })
      .eq('id', conversation_id);

    return message;
  } catch (error) {
    logger.error('Erro ao salvar mensagem:', error);
    throw error;
  }
}

/**
 * Processa e salva uma mensagem do WhatsApp
 */
export async function processWhatsAppMessage(message, sock = null, syncPeriodDaysParam = 7) {
  try {
    // Define o período de sincronização globalmente
    setSyncPeriodDays(syncPeriodDaysParam);

    const { key, message: msg, pushName, messageTimestamp, notifyName } = message;
    const remoteJid = key.remoteJid;
    const fromMe = key.fromMe;

    // Verifica se msg existe
    if (!msg) {
      logger.warn('Mensagem sem conteúdo, ignorando');
      return null;
    }

    // Ignorar mensagens de grupo, status, newsletter e canais
    if (
      remoteJid.endsWith('@g.us') ||
      remoteJid.endsWith('@broadcast') ||
      remoteJid.endsWith('@newsletter') ||
      (remoteJid.endsWith('@s.whatsapp.net') && remoteJid.includes('status'))
    ) {
      logger.info('🚫 Mensagem de grupo/broadcast/newsletter/status ignorada:', remoteJid);
      return null;
    }

    // Verificar se a mensagem tem conteúdo real
    const hasContent = msg.conversation ||
                      msg.extendedTextMessage ||
                      msg.imageMessage ||
                      msg.audioMessage ||
                      msg.videoMessage ||
                      msg.documentMessage ||
                      msg.stickerMessage ||
                      msg.locationMessage ||
                      msg.contactMessage ||
                      msg.buttonsMessage ||
                      msg.listMessage ||
                      msg.templateMessage;

    if (!hasContent) {
      logger.warn('Mensagem sem conteúdo reconhecido, ignorando:', Object.keys(msg));
      return null;
    }

    // Ignorar mensagens antigas se syncPeriodDays estiver definido
    // (após verificar conteúdo, para não criar conversas para mensagens sem conteúdo)
    if (messageTimestamp && syncPeriodDays) {
      const messageDate = new Date(messageTimestamp * 1000); // timestamp em segundos
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - syncPeriodDays);

      if (messageDate < cutoffDate) {
        logger.debug(`Mensagem antiga (${messageDate.toISOString()}), ignorando (período: ${syncPeriodDays} dias)`);
        return null;
      }
    }

    // Extrai LID e JID da mensagem
    let lid = null;
    let jid = null;

    if (remoteJid.endsWith('@lid')) {
      lid = remoteJid;
      // Tenta obter JID conhecido
      jid = await getJidFromLid(lid);
      // Se não tiver JID conhecido, tenta obter do senderPn ou participantAlt
      if (!jid) {
        jid = key.senderPn || key.participantAlt;
      }
    } else {
      jid = remoteJid;
      // Tenta obter LID conhecido
      lid = await getLidFromJid(jid);
    }

    // Salva mapeamento se tiver ambos LID e JID
    if (lid && jid && jid.endsWith('@s.whatsapp.net')) {
      const phone = extractPhoneFromJid(jid);
      logger.debug('Condição para saveLidMapping atendida', { lid, jid, phone });
      await saveLidMapping(lid, jid, phone);
    } else {
      logger.debug('Condição para saveLidMapping NÃO atendida', { lid, jid, hasLid: !!lid, hasJid: !!jid, isJidValid: jid?.endsWith('@s.whatsapp.net') });
    }

    // Determina o identificador principal para usar na conversa
    const primaryIdentifier = getPrimaryIdentifier(lid, jid);
    const phone = extractPhoneFromJid(primaryIdentifier);

    // Obtém ou cria conversa
    // Prioridade: notifyName (nome do avatar) > pushName > phone
    const contactName = notifyName || pushName || null;

    logger.debug('Nomes disponíveis para conversa', {
      phone,
      notifyName,
      pushName,
      contactName
    });

    const conversation = await getOrCreateConversation(
      primaryIdentifier,
      contactName,
      null, // profile picture pode ser obtido depois
      lid,
      sock, // passa sock para buscar foto de perfil
      messageTimestamp // passa timestamp para verificar período de sincronização
    );

    // Se a conversa não foi criada (mensagem antiga), retorna null
    if (!conversation) {
      logger.debug('Conversa não criada/atualizada (mensagem antiga)');
      return null;
    }

    // Determina o tipo de mensagem e extrai conteúdo
    let messageType = MESSAGE_TYPES.TEXT;
    let content = null;
    let metadata = {};

    // Texto
    if (msg.conversation || msg.extendedTextMessage) {
      messageType = MESSAGE_TYPES.TEXT;
      content = msg.conversation || msg.extendedTextMessage?.text;
    }
    // Imagem
    else if (msg.imageMessage) {
      messageType = MESSAGE_TYPES.IMAGE;
      content = msg.imageMessage.url;
      metadata = {
        caption: msg.imageMessage.caption,
        mimetype: msg.imageMessage.mimetype,
        width: msg.imageMessage.width,
        height: msg.imageMessage.height,
        fileLength: msg.imageMessage.fileLength
      };
    }
    // Áudio
    else if (msg.audioMessage) {
      messageType = MESSAGE_TYPES.AUDIO;
      content = msg.audioMessage.url;
      metadata = {
        mimetype: msg.audioMessage.mimetype,
        seconds: msg.audioMessage.seconds,
        fileLength: msg.audioMessage.fileLength
      };
    }
    // Vídeo
    else if (msg.videoMessage) {
      messageType = MESSAGE_TYPES.VIDEO;
      content = msg.videoMessage.url;
      metadata = {
        caption: msg.videoMessage.caption,
        mimetype: msg.videoMessage.mimetype,
        seconds: msg.videoMessage.seconds,
        width: msg.videoMessage.width,
        height: msg.videoMessage.height,
        fileLength: msg.videoMessage.fileLength,
        thumbnail: msg.videoMessage.jpegThumbnail ? `data:image/jpeg;base64,${msg.videoMessage.jpegThumbnail.toString('base64')}` : null
      };
    }
    // Documento
    else if (msg.documentMessage) {
      messageType = MESSAGE_TYPES.DOCUMENT;
      content = msg.documentMessage.url;
      metadata = {
        filename: msg.documentMessage.fileName,
        mimetype: msg.documentMessage.mimetype,
        fileLength: msg.documentMessage.fileLength,
        pageCount: msg.documentMessage.pageCount
      };
    }
    // Localização
    else if (msg.locationMessage) {
      messageType = MESSAGE_TYPES.LOCATION;
      content = JSON.stringify({
        latitude: msg.locationMessage.degreesLatitude,
        longitude: msg.locationMessage.degreesLongitude,
        name: msg.locationMessage.name
      });
    }
    // Contato
    else if (msg.contactMessage) {
      messageType = MESSAGE_TYPES.CONTACT;
      const contact = msg.contactMessage.displayName;
      content = contact;
      metadata = {
        vcard: msg.contactMessage.vcard
      };
    }
    // Sticker
    else if (msg.stickerMessage) {
      messageType = MESSAGE_TYPES.STICKER;
      content = msg.stickerMessage.url;
      metadata = {
        mimetype: msg.stickerMessage.mimetype,
        width: msg.stickerMessage.width,
        height: msg.stickerMessage.height
      };
    }
    // Poll
    else if (msg.pollCreationMessage) {
      messageType = MESSAGE_TYPES.POLL;
      content = msg.pollCreationMessage.name;
      metadata = {
        options: msg.pollCreationMessage.options,
        selectableCount: msg.pollCreationMessage.selectableCount
      };
    }

    // Salva a mensagem
    const messageData = {
      conversation_id: conversation.id,
      message_id: key.id,
      from_me: fromMe,
      message_type: messageType,
      content,
      metadata,
      timestamp: messageTimestamp * 1000 // Converte para milissegundos
    };

    const savedMessage = await saveMessage(messageData);

    // Se não for from_me, incrementa contador de não lidas
    if (!fromMe) {
      const { data: currentConv } = await supabase
        .from('conversations')
        .select('unread_count')
        .eq('id', conversation.id)
        .single();

      if (currentConv) {
        await supabase
          .from('conversations')
          .update({ unread_count: (currentConv.unread_count || 0) + 1 })
          .eq('id', conversation.id);
      }
    }

    // Se tiver mídia, fazer download e upload para Supabase
    if (content && (messageType === MESSAGE_TYPES.IMAGE || 
                    messageType === MESSAGE_TYPES.AUDIO ||
                    messageType === MESSAGE_TYPES.VIDEO ||
                    messageType === MESSAGE_TYPES.DOCUMENT ||
                    messageType === MESSAGE_TYPES.STICKER)) {
      // Isso será feito pelo handler de mídia
    }

    return savedMessage;
  } catch (error) {
    logger.error('Erro ao processar mensagem:', error);
    throw error;
  }
}

/**
 * Obtém mensagens de uma conversa
 */
export async function getConversationMessages(conversationId, limit = 50, offset = 0) {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('Erro ao obter mensagens:', error);
      throw error;
    }

    // Buscar reações para cada mensagem
    const messageIds = messages.map(m => m.message_id);
    if (messageIds.length > 0) {
      const { data: reactions, error: reactionsError } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds);

      if (!reactionsError && reactions) {
        // Agrupar reações por mensagem (apenas uma por usuário)
        const reactionsByMessage = {};
        reactions.forEach(reaction => {
          if (!reactionsByMessage[reaction.message_id]) {
            reactionsByMessage[reaction.message_id] = [];
          }
          // Adicionar apenas se não existir (evitar duplicatas)
          if (!reactionsByMessage[reaction.message_id].includes(reaction.reaction)) {
            reactionsByMessage[reaction.message_id].push(reaction.reaction);
          }
        });

        // Adicionar reações às mensagens
        messages.forEach(message => {
          message.reactions = reactionsByMessage[message.message_id] || [];
        });
      }
    }

    return messages;
  } catch (error) {
    logger.error('Erro ao obter mensagens:', error);
    throw error;
  }
}

/**
 * Obtém todas as conversas com última mensagem
 */
export async function getAllConversations() {
  try {
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false, nullsLast: false });

    if (error) {
      logger.error('Erro ao obter conversas:', error);
      throw error;
    }

    // Buscar tags para todas as conversas (em batches para evitar Headers Overflow)
    const conversationIds = conversations.map(c => c.id);
    const tagsMap = {};
    const batchSize = 100; // Limite seguro para evitar overflow

    for (let i = 0; i < conversationIds.length; i += batchSize) {
      const batch = conversationIds.slice(i, i + batchSize);
      const { data: conversationTags, error: tagsError } = await supabase
        .from('conversation_tags')
        .select(`
          conversation_id,
          tags (
            id,
            name,
            color
          )
        `)
        .in('conversation_id', batch);

      if (tagsError) {
        logger.error('Erro ao obter tags das conversas (batch):', tagsError);
      }

      if (conversationTags) {
        conversationTags.forEach(ct => {
          if (!tagsMap[ct.conversation_id]) {
            tagsMap[ct.conversation_id] = [];
          }
          if (ct.tags) {
            tagsMap[ct.conversation_id].push(ct.tags);
          }
        });
      }
    }

    // Para cada conversa, buscar a última mensagem separadamente para garantir ordenação correta
    const conversationsWithLastMessage = await Promise.all(conversations.map(async (conv) => {
      // Buscar a última mensagem ordenada por timestamp desc
      const { data: lastMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('timestamp', { ascending: false })
        .limit(1);

      const lastMessage = lastMessages && lastMessages.length > 0 ? lastMessages[0] : null;

      // Formatar conversation_tags no formato esperado pelo frontend
      const formattedTags = (tagsMap[conv.id] || []).map(tag => ({
        tags: tag
      }));

      // Priorizar custom_name sobre contact_name
      const displayName = conv.custom_name || conv.contact_name;

      return {
        ...conv,
        contact_name: displayName, // Sobrescreve contact_name com custom_name se disponível
        last_message: lastMessage,
        conversation_tags: formattedTags,
        _lastTimestamp: lastMessage && lastMessage.timestamp 
          ? new Date(lastMessage.timestamp).getTime() 
          : (conv.last_message_at ? new Date(conv.last_message_at).getTime() : 0)
      };
    }));

    // Ordenar conversas pelo timestamp da última mensagem (ou last_message_at se não tiver mensagem)
    conversationsWithLastMessage.sort((a, b) => b._lastTimestamp - a._lastTimestamp);

    // Remover o campo temporário _lastTimestamp
    conversationsWithLastMessage.forEach(conv => {
      delete conv._lastTimestamp;
    });

    return conversationsWithLastMessage;
  } catch (error) {
    logger.error('Erro ao obter conversas:', error);
    throw error;
  }
}

/**
 * Atualiza status de uma mensagem (read/delivered)
 */
export async function updateMessageStatus(messageId, status) {
  try {
    const updateData = {};

    if (status === 'read') {
      updateData.is_read = true;
    } else if (status === 'delivered') {
      updateData.is_delivered = true;
    }

    const { error } = await supabase
      .from('messages')
      .update(updateData)
      .eq('message_id', messageId);

    if (error) {
      logger.error('Erro ao atualizar status da mensagem:', error);
      throw error;
    }
  } catch (error) {
    logger.error('Erro ao atualizar status da mensagem:', error);
    throw error;
  }
}

/**
 * Marca mensagens como lidas
 */
export async function markMessagesAsRead(conversationId) {
  try {
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('is_read', false);

    if (error) {
      logger.error('Erro ao marcar mensagens como lidas:', error);
      throw error;
    }

    // Zerar contador de não lidas
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);

    if (updateError) {
      logger.error('Erro ao zerar contador de não lidas:', updateError);
      throw updateError;
    }

  } catch (error) {
    logger.error('Erro ao marcar mensagens como lidas:', error);
    throw error;
  }
}

/**
 * Fecha uma conversa
 */
export async function closeConversation(conversationId) {
  try {
    const { error } = await supabase
      .from('conversations')
      .update({ is_open: false })
      .eq('id', conversationId);

    if (error) {
      logger.error('Erro ao fechar conversa:', error);
      throw error;
    }

  } catch (error) {
    logger.error('Erro ao fechar conversa:', error);
    throw error;
  }
}

/**
 * Abre uma conversa
 */
export async function openConversation(conversationId, sock = null) {
  try {
    const { error } = await supabase
      .from('conversations')
      .update({ is_open: true })
      .eq('id', conversationId);

    if (error) {
      logger.error('Erro ao abrir conversa:', error);
      throw error;
    }

    // Buscar informações da conversa
    const { data: conversation } = await supabase
      .from('conversations')
      .select('phone, contact_name')
      .eq('id', conversationId)
      .single();

    if (conversation && sock) {
      // Buscar informações do contato do WhatsApp
      const phone = conversation.phone.replace(/\D/g, ''); // Remove não-dígitos
      const jid = `${phone}@s.whatsapp.net`;

      try {
        const contact = await sock.getContact(jid);
        if (contact) {
          // Usar notify (nome salvo pelo usuário) ou name (nome do contato)
          const contactName = contact.notify || contact.name;
          if (contactName && contactName !== conversation.contact_name) {
            // Atualizar nome do contato se for diferente
            await supabase
              .from('conversations')
              .update({ contact_name: contactName })
              .eq('id', conversationId);

          }
        }
      } catch (error) {
        logger.warn('Erro ao buscar contato do WhatsApp:', error);
      }
    }

  } catch (error) {
    logger.error('Erro ao abrir conversa:', error);
    throw error;
  }
}

/**
 * Atualiza nome do contato
 */
export async function updateContactName(conversationId, contactName) {
  try {
    const { error } = await supabase
      .from('conversations')
      .update({ custom_name: contactName })
      .eq('id', conversationId);

    if (error) {
      logger.error('Erro ao atualizar nome do contato:', error);
      throw error;
    }

  } catch (error) {
    logger.error('Erro ao atualizar nome do contato:', error);
    throw error;
  }
}

/**
 * Envia mensagem via WhatsApp
 */
export async function sendWhatsAppMessage(sock, conversationId, content, messageType = MESSAGE_TYPES.TEXT, metadata = {}) {
  try {
    // Obtém conversa para obter o phone
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      throw new Error('Conversa não encontrada');
    }

    const phoneJid = `${conversation.phone}@s.whatsapp.net`;

    let messageOptions = {};

    // Configura opções baseado no tipo de mensagem
    switch (messageType) {
      case MESSAGE_TYPES.TEXT:
        messageOptions = { text: content };
        break;
      case MESSAGE_TYPES.IMAGE:
        messageOptions = { image: { url: content }, caption: metadata.caption || '' };
        break;
      case MESSAGE_TYPES.AUDIO:
        messageOptions = { audio: { url: content } };
        break;
      case MESSAGE_TYPES.VIDEO:
        messageOptions = { video: { url: content }, caption: metadata.caption || '' };
        break;
      case MESSAGE_TYPES.DOCUMENT:
        messageOptions = { document: { url: content }, mimetype: metadata.mimetype, fileName: metadata.filename };
        break;
      case MESSAGE_TYPES.LOCATION:
        const locationData = JSON.parse(content);
        messageOptions = {
          location: {
            degreesLatitude: locationData.latitude,
            degreesLongitude: locationData.longitude,
            name: locationData.name
          }
        };
        break;
      default:
        messageOptions = { text: content };
    }

    // Se tiver quoted message, garantir que quoted.key.remoteJid use o phone JID
    if (metadata.quoted) {
      const quoted = metadata.quoted;
      messageOptions.quoted = {
        key: {
          remoteJid: phoneJid, // Sempre usar phone JID para quoted messages
          id: quoted.key?.id,
          fromMe: quoted.key?.fromMe,
          participant: undefined // null para 1:1 chats
        },
        message: quoted.message
      };
    }

    // Envia mensagem
    const sentMessage = await sock.sendMessage(phoneJid, messageOptions);

    return sentMessage;
  } catch (error) {
    logger.error('Erro ao enviar mensagem:', error);
    throw error;
  }
}

/**
 * Envia anexo via WhatsApp
 */
export async function sendWhatsAppAttachment(sock, conversationId, file, caption = '') {
  try {
    // Obtém conversa para obter o phone
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      throw new Error('Conversa não encontrada');
    }

    const phoneJid = `${conversation.phone}@s.whatsapp.net`;

    // Determinar tipo de arquivo
    const mimeType = file.mimetype;
    let messageType = 'document';
    let messageOptions = {};

    if (mimeType.startsWith('image/')) {
      messageType = 'image';
      messageOptions = {
        image: file.buffer,
        caption: caption || ''
      };
    } else if (mimeType.startsWith('video/')) {
      messageType = 'video';
      messageOptions = {
        video: file.buffer,
        caption: caption || ''
      };
    } else if (mimeType.startsWith('audio/')) {
      messageType = 'audio';
      messageOptions = {
        audio: file.buffer
      };
    } else {
      messageType = 'document';
      messageOptions = {
        document: file.buffer,
        mimetype: mimeType,
        fileName: file.originalname,
        caption: caption || ''
      };
    }

    // Envia mensagem
    const sentMessage = await sock.sendMessage(phoneJid, messageOptions);

    // Adicionar informações de tipo e conteúdo ao resultado
    sentMessage.messageType = messageType;
    sentMessage.content = ''; // Será atualizado após upload para Supabase
    sentMessage.metadata = {
      caption: caption || '',
      mimetype: mimeType,
      filename: file.originalname
    };

    return sentMessage;
  } catch (error) {
    logger.error('Erro ao enviar anexo:', error);
    throw error;
  }
}

/**
 * Encaminha mensagem via WhatsApp
 */
export async function forwardWhatsAppMessage(sock, fromConversationId, toConversationId, messageId) {
  try {
    // Obtém conversa de origem para obter o phone
    const { data: fromConversation, error: fromConvError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', fromConversationId)
      .single();

    if (fromConvError || !fromConversation) {
      throw new Error('Conversa de origem não encontrada');
    }

    // Obtém conversa de destino para obter o phone
    const { data: toConversation, error: toConvError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', toConversationId)
      .single();

    if (toConvError || !toConversation) {
      throw new Error('Conversa de destino não encontrada');
    }

    const fromPhoneJid = `${fromConversation.phone}@s.whatsapp.net`;
    const toPhoneJid = `${toConversation.phone}@s.whatsapp.net`;

    // Buscar a mensagem original para obter o conteúdo
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('message_id', messageId)
      .single();

    if (msgError || !message) {
      throw new Error('Mensagem não encontrada');
    }

    // Reenviar a mensagem (em vez de usar forward direto)
    let messageOptions = {};

    // Configurar opções baseado no tipo de mensagem
    switch (message.message_type) {
      case MESSAGE_TYPES.TEXT:
        messageOptions = { text: message.content };
        break;
      case MESSAGE_TYPES.IMAGE:
        messageOptions = { image: { url: message.content }, caption: message.metadata?.caption || '' };
        break;
      case MESSAGE_TYPES.AUDIO:
        messageOptions = { audio: { url: message.content } };
        break;
      case MESSAGE_TYPES.VIDEO:
        messageOptions = { video: { url: message.content }, caption: message.metadata?.caption || '' };
        break;
      case MESSAGE_TYPES.DOCUMENT:
        messageOptions = { document: { url: message.content }, mimetype: message.metadata?.mimetype, fileName: message.metadata?.filename };
        break;
      case MESSAGE_TYPES.LOCATION:
        const locationData = JSON.parse(message.content);
        messageOptions = {
          location: {
            degreesLatitude: locationData.latitude,
            degreesLongitude: locationData.longitude,
            name: locationData.name
          }
        };
        break;
      default:
        messageOptions = { text: message.content };
    }

    // Envia mensagem para o destino
    const sentMessage = await sock.sendMessage(toPhoneJid, messageOptions);

    logger.info('Mensagem encaminhada:', { fromConversationId, toConversationId, messageId });
    return sentMessage;
  } catch (error) {
    logger.error('Erro ao encaminhar mensagem:', error);
    throw error;
  }
}

/**
 * Envia reação via WhatsApp
 */
export async function sendWhatsAppReaction(sock, conversationId, messageId, reaction) {
  try {
    // Obtém conversa para obter o phone
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      throw new Error('Conversa não encontrada');
    }

    const phoneJid = `${conversation.phone}@s.whatsapp.net`;

    // Envia reação
    await sock.sendMessage(phoneJid, {
      react: {
        key: {
          remoteJid: phoneJid,
          id: messageId,
          fromMe: false
        },
        text: reaction
      }
    });

    logger.info('Reação enviada:', { conversationId, messageId, reaction });
    return { success: true };
  } catch (error) {
    logger.error('Erro ao enviar reação:', error);
    throw error;
  }
}

/**
 * Envia localização via WhatsApp
 */
export async function sendWhatsAppLocation(sock, conversationId, latitude, longitude) {
  try {
    // Obtém conversa para obter o phone
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      throw new Error('Conversa não encontrada');
    }

    const phoneJid = `${conversation.phone}@s.whatsapp.net`;

    const messageOptions = {
      location: {
        degreesLatitude: latitude,
        degreesLongitude: longitude
      }
    };

    // Envia mensagem
    const sentMessage = await sock.sendMessage(phoneJid, messageOptions);

    // Adicionar informações ao resultado
    sentMessage.content = JSON.stringify({ latitude, longitude });

    return sentMessage;
  } catch (error) {
    logger.error('Erro ao enviar localização:', error);
    throw error;
  }
}

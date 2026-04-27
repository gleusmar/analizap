import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import { unlink } from 'fs/promises';
import { getIO } from '../sockets/socket.js';
import { v4 as uuidv4 } from 'uuid';

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
 * Extrai o número de telefone do JID
 * JID format: 5511999999999@s.whatsapp.net
 * LID format: user@lid (retorna null para LIDs)
 */
export function extractPhoneFromJid(jid) {
  if (!jid) return null;
  if (jid.endsWith('@lid')) {
    logger.warn('Tentando extrair phone de LID, retornando null', { jid });
    return null;
  }
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
    jid,
    lid,
    phone,
    contactName,
    messageTimestamp,
    syncPeriodDays
  });

  try {
    // Se o jid for um LID, tenta obter o JID mapeado
    let originalLid = lid; // Usa o parâmetro lid se fornecido
    if (jid && jid.endsWith('@lid')) {
      originalLid = jid;
      const mappedJid = await getJidFromLid(jid);
      if (mappedJid) {
        logger.debug('LID mapeado para JID', { lid: jid, mappedJid });
        jid = mappedJid;
        phone = extractPhoneFromJid(jid);
      } else {
        logger.warn('LID não mapeado, usando LID como phone', { lid: jid });
        phone = jid; // Usa o LID completo como identificador
      }
    }

    if (!phone) {
      logger.error('Não foi possível extrair phone do JID', { jid });
      return null;
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

    // Se não encontrou pelo phone atual e temos um LID associado, tenta buscar conversa pelo LID
    if (!existingConversation && originalLid) {
      logger.debug('Tentando buscar conversa pelo LID', { originalLid });

      const { data: lidConversation, error: lidFindError } = await supabase
        .from('conversations')
        .select('*')
        .eq('phone', originalLid)
        .single();

      if (lidConversation) {
        logger.info('Conversa encontrada pelo LID, atualizando phone para JID real', {
          conversationId: lidConversation.id,
          oldPhone: lidConversation.phone,
          newPhone: phone
        });

        // Atualiza o phone da conversa existente (de LID para phone real)
        const { error: phoneUpdateError } = await supabase
          .from('conversations')
          .update({ phone: phone })
          .eq('id', lidConversation.id);

        if (phoneUpdateError) {
          logger.error('Erro ao atualizar phone da conversa:', phoneUpdateError);
        } else {
          lidConversation.phone = phone; // Atualiza localmente para retorno
        }

        return lidConversation;
      }
    }

    // Se não encontrou pelo phone atual e estamos usando LID, tenta buscar pelo phone do JID mapeado
    if (!existingConversation && originalLid && phone.endsWith('@lid')) {
      const mappedJid = await getJidFromLid(originalLid);
      if (mappedJid) {
        const mappedPhone = extractPhoneFromJid(mappedJid);
        if (mappedPhone && mappedPhone !== phone) {
          logger.debug('Tentando buscar conversa pelo phone do JID mapeado', {
            originalLid,
            mappedPhone
          });

          const { data: conversationByMappedPhone, error: mappedFindError } = await supabase
            .from('conversations')
            .select('*')
            .eq('phone', mappedPhone)
            .single();

          if (conversationByMappedPhone) {
            logger.info('Conversa encontrada pelo phone do JID mapeado, atualizando phone', {
              conversationId: conversationByMappedPhone.id,
              oldPhone: conversationByMappedPhone.phone,
              newPhone: phone
            });

            // Atualiza o phone da conversa existente (de phone real para LID, para manter consistência)
            const { error: phoneUpdateError } = await supabase
              .from('conversations')
              .update({ phone: phone })
              .eq('id', conversationByMappedPhone.id);

            if (phoneUpdateError) {
              logger.error('Erro ao atualizar phone da conversa:', phoneUpdateError);
            } else {
              conversationByMappedPhone.phone = phone; // Atualiza localmente para retorno
            }

            return conversationByMappedPhone;
          }
        }
      }
    }

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

      // Se a conversa foi criada com LID e agora temos o phone correto (do JID), atualiza o phone
      if (existingConversation.phone.endsWith('@lid') && phone && !phone.endsWith('@lid') && existingConversation.phone !== phone) {
        logger.debug('Atualizando phone da conversa (de LID para phone real)', {
          conversationId: existingConversation.id,
          oldPhone: existingConversation.phone,
          newPhone: phone
        });

        const { error: phoneUpdateError } = await supabase
          .from('conversations')
          .update({ phone: phone })
          .eq('id', existingConversation.id);

        if (phoneUpdateError) {
          logger.error('Erro ao atualizar phone da conversa:', phoneUpdateError);
        } else {
          existingConversation.phone = phone; // Atualiza localmente para retorno
        }
      }

      // Atualiza o nome se um novo pushName foi fornecido e for diferente do atual
      // Prioridade: contactName (pushName) > nome atual
      if (contactName && contactName !== existingConversation.contact_name && contactName !== phone) {
        logger.debug('Atualizando nome da conversa', {
          conversationId: existingConversation.id,
          oldName: existingConversation.contact_name,
          newName: contactName
        });

        const { error: nameUpdateError } = await supabase
          .from('conversations')
          .update({ contact_name: contactName })
          .eq('id', existingConversation.id);

        if (nameUpdateError) {
          logger.error('Erro ao atualizar nome da conversa:', nameUpdateError);
        } else {
          existingConversation.contact_name = contactName; // Atualiza localmente para retorno
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
    const { conversation_id, message_id, from_me, message_type, content, metadata, timestamp, is_read, is_delivered, unique_id } = messageData;

    // Verificar se mensagem já existe
    let existingMessage = null;
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('message_id', message_id)
        .single();
      existingMessage = data;
    } catch (e) {
      // Mensagem não existe, continua
    }

    if (existingMessage) {
      return existingMessage;
    }

    // Se message_id não começa com "temp_", verificar se existe mensagem temporária correspondente
    if (!message_id.startsWith('temp_')) {
      try {
        const { data: tempMessage } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversation_id)
          .eq('from_me', from_me)
          .eq('message_type', message_type)
          .like('message_id', 'temp_%')
          .eq('content', content)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (tempMessage) {
          logger.info('Atualizando mensagem temporária com message_id real:', {
            tempMessageId: tempMessage.message_id,
            realMessageId: message_id
          });

          // Atualizar a mensagem temporária com o message_id real e outros campos
          const { data: updatedMessage, error: updateError } = await supabase
            .from('messages')
            .update({
              message_id: message_id,
              timestamp: new Date(timestamp).toISOString(),
              is_read: is_read !== undefined ? is_read : tempMessage.is_read,
              is_delivered: is_delivered !== undefined ? is_delivered : tempMessage.is_delivered
            })
            .eq('id', tempMessage.id)
            .select()
            .single();

          if (updateError) {
            logger.error('Erro ao atualizar mensagem temporária:', updateError);
            throw updateError;
          }

          // Atualizar last_message_at da conversa
          await supabase
            .from('conversations')
            .update({ last_message_at: new Date(timestamp).toISOString() })
            .eq('id', conversation_id);

          return updatedMessage;
        }
      } catch (e) {
        // Nenhuma mensagem temporária encontrada, continua com inserção normal
        logger.debug('Nenhuma mensagem temporária encontrada para atualizar');
      }
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
        is_read: is_read !== undefined ? is_read : false,
        is_delivered: is_delivered !== undefined ? is_delivered : false,
        unique_id: unique_id || null
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

    const { key, message: msg, pushName, messageTimestamp } = message;
    const remoteJid = key.remoteJid;
    const fromMe = key.fromMe;

    logger.info('processWhatsAppMessage chamado:', {
      messageId: key?.id,
      fromMe,
      remoteJid,
      hasContent: !!msg
    });

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

    // Ignorar mensagens de protocolo (confirmações, atualizações de status, etc.)
    if (msg.protocolMessage) {
      logger.debug('Mensagem de protocolo ignorada');
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

      logger.debug('Verificando período de sincronização em processWhatsAppMessage', {
        messageDate: messageDate.toISOString(),
        cutoffDate: cutoffDate.toISOString(),
        syncPeriodDays,
        isOld: messageDate < cutoffDate,
        messageType: msg.imageMessage ? 'image' :
                    msg.audioMessage ? 'audio' :
                    msg.videoMessage ? 'video' :
                    msg.documentMessage ? 'document' :
                    msg.conversation ? 'text' : 'unknown'
      });

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

      // Após salvar o mapeamento, verificar se existe uma conversa criada com o LID como phone
      // e atualizá-la para usar o phone real
      try {
        const { data: lidConversation } = await supabase
          .from('conversations')
          .select('*')
          .eq('phone', lid)
          .single();

        if (lidConversation && lidConversation.phone !== phone) {
          logger.info('Atualizando conversa criada com LID para usar phone real', {
            conversationId: lidConversation.id,
            oldPhone: lidConversation.phone,
            newPhone: phone
          });

          const { error: updateError } = await supabase
            .from('conversations')
            .update({ phone: phone })
            .eq('id', lidConversation.id);

          if (updateError) {
            logger.error('Erro ao atualizar phone da conversa LID:', updateError);
          }
        }
      } catch (e) {
        // Nenhuma conversa com LID encontrada, continua normalmente
        logger.debug('Nenhuma conversa com LID encontrada para atualizar');
      }
    } else {
      logger.debug('Condição para saveLidMapping NÃO atendida', { lid, jid, hasLid: !!lid, hasJid: !!jid, isJidValid: jid?.endsWith('@s.whatsapp.net') });
    }

    // Determina o identificador principal para usar na conversa
    const primaryIdentifier = getPrimaryIdentifier(lid, jid);
    const phone = extractPhoneFromJid(primaryIdentifier);

    // Obtém ou cria conversa
    // Prioridade: pushName (nome definido pelo usuário no WhatsApp) > phone
    const contactName = pushName || null;

    logger.debug('Nomes disponíveis para conversa', {
      phone,
      pushName,
      contactName
    });

    const conversation = await getOrCreateConversation(
      primaryIdentifier,
      contactName,
      null, // profile picture pode ser obtido depois
      lid, // passa lid para permitir busca por LID
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
        fileLength: msg.imageMessage.fileLength,
        thumbnail: msg.imageMessage.jpegThumbnail ? `data:image/jpeg;base64,${msg.imageMessage.jpegThumbnail.toString('base64')}` : null,
        fileSha256: msg.imageMessage.fileSha256,
        fileEncSha256: msg.imageMessage.fileEncSha256,
        mediaKey: msg.imageMessage.mediaKey,
        mediaKeyTimestamp: msg.imageMessage.mediaKeyTimestamp,
        directPath: msg.imageMessage.directPath
      };
      logger.info('📷 Imagem detectada, metadados:', metadata);
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
      logger.info('🎵 Áudio detectado, metadados:', metadata);
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
        thumbnail: msg.videoMessage.jpegThumbnail ? `data:image/jpeg;base64,${msg.videoMessage.jpegThumbnail.toString('base64')}` : null,
        fileSha256: msg.videoMessage.fileSha256,
        fileEncSha256: msg.videoMessage.fileEncSha256,
        mediaKey: msg.videoMessage.mediaKey,
        mediaKeyTimestamp: msg.videoMessage.mediaKeyTimestamp,
        directPath: msg.videoMessage.directPath
      };
      logger.info('🎬 Vídeo detectado, metadados:', {
        caption: metadata.caption,
        seconds: metadata.seconds,
        width: metadata.width,
        height: metadata.height
      });
    }
    // Documento
    else if (msg.documentMessage) {
      messageType = MESSAGE_TYPES.DOCUMENT;
      content = msg.documentMessage.url;
      metadata = {
        filename: msg.documentMessage.fileName,
        mimetype: msg.documentMessage.mimetype,
        fileLength: msg.documentMessage.fileLength,
        pageCount: msg.documentMessage.pageCount,
        thumbnail: msg.documentMessage.jpegThumbnail ? `data:image/jpeg;base64,${msg.documentMessage.jpegThumbnail.toString('base64')}` : null,
        fileSha256: msg.documentMessage.fileSha256,
        fileEncSha256: msg.documentMessage.fileEncSha256,
        mediaKey: msg.documentMessage.mediaKey,
        mediaKeyTimestamp: msg.documentMessage.mediaKeyTimestamp,
        directPath: msg.documentMessage.directPath
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
    const unique_id = `${key.remoteJid}-${fromMe ? '1' : '0'}-${key.id}`;
    const messageData = {
      conversation_id: conversation.id,
      message_id: key.id,
      from_me: fromMe,
      message_type: messageType,
      content,
      metadata,
      timestamp: messageTimestamp * 1000, // Converte para milissegundos
      unique_id
    };

    const savedMessage = await saveMessage(messageData);

    // Se não for from_me e a conversa não estiver aberta, incrementa contador de não lidas
    if (!fromMe) {
      const { data: currentConv } = await supabase
        .from('conversations')
        .select('unread_count, is_open')
        .eq('id', conversation.id)
        .single();

      if (currentConv && !currentConv.is_open) {
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
 * Marca múltiplas conversas como lidas
 */
export async function markMultipleConversationsAsRead(conversationIds) {
  try {
    if (!conversationIds || conversationIds.length === 0) {
      return;
    }

    // Marcar todas as mensagens como lidas
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .in('conversation_id', conversationIds)
      .eq('is_read', false);

    if (error) {
      logger.error('Erro ao marcar múltiplas conversas como lidas:', error);
      throw error;
    }

    // Zerar contador de não lidas de todas as conversas
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .in('id', conversationIds);

    if (updateError) {
      logger.error('Erro ao zerar contador de não lidas de múltiplas conversas:', updateError);
      throw updateError;
    }

    logger.info(`Marcadas ${conversationIds.length} conversas como lidas`);
  } catch (error) {
    logger.error('Erro ao marcar múltiplas conversas como lidas:', error);
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

    // Zerar contador de mensagens não lidas ao abrir a conversa (limpa acumuladas)
    await markMessagesAsRead(conversationId);

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

        // Se inscrever nas atualizações de presença do contato
        try {
          await sock.presenceSubscribe(jid);
          logger.info('Inscrito nas atualizações de presença:', { jid });
        } catch (error) {
          logger.warn('Erro ao se inscrever na presença:', error);
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

    // Se tiver quoted message, buscar no store do Baileys ou reconstruir manualmente
    if (metadata.quoted) {
      const quoted = metadata.quoted;
      const msgId = quoted.real_message_id || quoted.message_id || quoted.key?.id;
      const remoteJid = quoted.key?.remoteJid || phoneJid;

      logger.info('📝 Processando citação:', {
        quotedId: quoted.id,
        quotedMessageId: quoted.message_id,
        quotedRealMessageId: quoted.real_message_id,
        quotedKeyId: quoted.key?.id,
        msgId,
        remoteJid
      });

      // 1. Tentar carregar do store do Baileys
      let quotedMessage = null;
      if (msgId && sock.loadMessage) {
        try {
          quotedMessage = await sock.loadMessage(remoteJid, msgId);
          logger.info('📦 Mensagem encontrada no store do Baileys:', !!quotedMessage);
        } catch (error) {
          logger.warn('Erro ao buscar mensagem do store do Baileys:', error.message);
        }
      }

      if (quotedMessage) {
        // Usar a mensagem do store do Baileys diretamente (conforme documentação)
        messageOptions.quoted = quotedMessage;
        logger.info('✅ Citação configurada usando mensagem do store do Baileys');
      } else {
        // 2. RECONSTRUÇÃO MANUAL (Fallback)
        // Se não achou no store, montamos a estrutura básica que o WhatsApp exige
        logger.info('⚠️ Mensagem não encontrada no store, usando reconstrução manual');

        // Determinar o conteúdo da mensagem citada
        let quotedContent = quoted.content || quoted.text || 'Mensagem anterior';

        // Se for mídia, usar o caption ou descrição
        if (quoted.message_type) {
          const { MESSAGE_TYPES } = await import('./messageTypes.js');
          switch (quoted.message_type) {
            case MESSAGE_TYPES.IMAGE:
              quotedContent = quoted.metadata?.caption || '📷 Imagem';
              break;
            case MESSAGE_TYPES.AUDIO:
              quotedContent = '🎵 Áudio';
              break;
            case MESSAGE_TYPES.VIDEO:
              quotedContent = quoted.metadata?.caption || '🎥 Vídeo';
              break;
            case MESSAGE_TYPES.DOCUMENT:
              quotedContent = quoted.metadata?.filename || '📄 Documento';
              break;
            case MESSAGE_TYPES.LOCATION:
              quotedContent = '📍 Localização';
              break;
          }
        }

        messageOptions.quoted = {
          key: {
            remoteJid: remoteJid,
            fromMe: quoted.from_me || quoted.key?.fromMe || false,
            id: msgId,
            participant: quoted.participant || quoted.key?.participant || remoteJid // CRUCIAL: Se for DM, participant = remoteJid
          },
          message: {
            conversation: quotedContent
          }
        };

        logger.info('✅ Citação configurada usando reconstrução manual:', {
          keyId: messageOptions.quoted.key.id,
          keyRemoteJid: messageOptions.quoted.key.remoteJid,
          keyParticipant: messageOptions.quoted.key.participant,
          messageContent: messageOptions.quoted.message.conversation
        });
      }
    }

    logger.info('📤 Enviando mensagem:', {
      phoneJid,
      messageType,
      hasQuoted: !!messageOptions.quoted
    });

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
    logger.info('sendWhatsAppAttachment chamado:', {
      conversationId,
      fileName: file?.originalname,
      mimeType: file?.mimetype,
      fileSize: file?.size,
      caption
    });

    // Obtém conversa para obter o phone
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      logger.error('Conversa não encontrada:', convError);
      throw new Error('Conversa não encontrada');
    }

    logger.info('Conversa encontrada:', { phone: conversation.phone });

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
      logger.info('Tipo de arquivo: imagem');
    } else if (mimeType.startsWith('video/')) {
      messageType = 'video';
      messageOptions = {
        video: file.buffer,
        caption: caption || ''
      };
      logger.info('Tipo de arquivo: vídeo');
    } else if (mimeType.startsWith('audio/')) {
      messageType = 'audio';
      messageOptions = {
        audio: file.buffer
      };
      logger.info('Tipo de arquivo: áudio');
    } else {
      messageType = 'document';
      messageOptions = {
        document: file.buffer,
        mimetype: mimeType,
        fileName: file.originalname,
        caption: caption || ''
      };
      logger.info('Tipo de arquivo: documento');
    }

    logger.info('Enviando mensagem para o WhatsApp...');
    // Envia mensagem
    const sentMessage = await sock.sendMessage(phoneJid, messageOptions);
    logger.info('Mensagem enviada para o WhatsApp com sucesso:', sentMessage.key?.id);

    // Extrair metadados completos da resposta do WhatsApp para citação
    let completeMetadata = {
      caption: caption || '',
      mimetype: mimeType,
      filename: file.originalname
    };

    // Extrair metadados específicos do tipo de mensagem
    if (sentMessage.message?.imageMessage) {
      const imgMsg = sentMessage.message.imageMessage;
      completeMetadata = {
        ...completeMetadata,
        thumbnail: imgMsg.jpegThumbnail ? `data:image/jpeg;base64,${imgMsg.jpegThumbnail.toString('base64')}` : null,
        fileSha256: imgMsg.fileSha256,
        fileEncSha256: imgMsg.fileEncSha256,
        mediaKey: imgMsg.mediaKey,
        mediaKeyTimestamp: imgMsg.mediaKeyTimestamp,
        directPath: imgMsg.directPath,
        width: imgMsg.width,
        height: imgMsg.height,
        fileLength: imgMsg.fileLength
      };
      logger.info('Metadados de imagem extraídos:', {
        hasThumbnail: !!completeMetadata.thumbnail,
        hasFileSha256: !!completeMetadata.fileSha256,
        hasMediaKey: !!completeMetadata.mediaKey
      });
    } else if (sentMessage.message?.videoMessage) {
      const vidMsg = sentMessage.message.videoMessage;
      completeMetadata = {
        ...completeMetadata,
        thumbnail: vidMsg.jpegThumbnail ? `data:image/jpeg;base64,${vidMsg.jpegThumbnail.toString('base64')}` : null,
        fileSha256: vidMsg.fileSha256,
        fileEncSha256: vidMsg.fileEncSha256,
        mediaKey: vidMsg.mediaKey,
        mediaKeyTimestamp: vidMsg.mediaKeyTimestamp,
        directPath: vidMsg.directPath,
        width: vidMsg.width,
        height: vidMsg.height,
        fileLength: vidMsg.fileLength,
        seconds: vidMsg.seconds
      };
    } else if (sentMessage.message?.documentMessage) {
      const docMsg = sentMessage.message.documentMessage;
      completeMetadata = {
        ...completeMetadata,
        thumbnail: docMsg.jpegThumbnail ? `data:image/jpeg;base64,${docMsg.jpegThumbnail.toString('base64')}` : null,
        fileSha256: docMsg.fileSha256,
        fileEncSha256: docMsg.fileEncSha256,
        mediaKey: docMsg.mediaKey,
        mediaKeyTimestamp: docMsg.mediaKeyTimestamp,
        directPath: docMsg.directPath,
        fileLength: docMsg.fileLength,
        pageCount: docMsg.pageCount
      };
    } else if (sentMessage.message?.audioMessage) {
      const audMsg = sentMessage.message.audioMessage;
      completeMetadata = {
        ...completeMetadata,
        fileSha256: audMsg.fileSha256,
        fileEncSha256: audMsg.fileEncSha256,
        mediaKey: audMsg.mediaKey,
        mediaKeyTimestamp: audMsg.mediaKeyTimestamp,
        directPath: audMsg.directPath,
        fileLength: audMsg.fileLength,
        seconds: audMsg.seconds
      };
    }

    // Adicionar informações de tipo e conteúdo ao resultado
    sentMessage.messageType = messageType;
    sentMessage.content = ''; // Será atualizado após upload para Supabase
    sentMessage.metadata = completeMetadata;

    return sentMessage;
  } catch (error) {
    logger.error('Erro ao enviar anexo para WhatsApp:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
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
    // Tenta buscar por message_id primeiro, se não encontrar, busca por id (do banco)
    let { data: message, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('message_id', messageId)
      .single();

    if (msgError || !message) {
      // Se não encontrou por message_id, tenta por id
      const result = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();
      message = result.data;
      msgError = result.error;
    }

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

    // Gerar UUID válido para o id e temp_message_id
    const messageIdUuid = uuidv4();
    const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Salvar mensagem no banco
    const { data: savedMessage, error: saveError } = await supabase
      .from('messages')
      .insert({
        id: messageIdUuid,
        conversation_id: toConversationId,
        message_id: tempMessageId,
        content: message.content,
        message_type: message.message_type,
        from_me: true,
        metadata: message.metadata || {},
        is_read: false,
        is_delivered: false,
        timestamp: new Date().toISOString()
      })
      .select()
      .single();

    if (saveError) {
      logger.error('Erro ao salvar mensagem encaminhada:', saveError);
    } else {
      // Atualizar real_message_id em background
      const realMessageId = sentMessage.key?.id;
      if (realMessageId) {
        setTimeout(async () => {
          await supabase
            .from('messages')
            .update({ real_message_id: realMessageId })
            .eq('id', messageIdUuid);
          logger.info('real_message_id atualizado para mensagem encaminhada:', realMessageId);
        }, 1000);
      }

      // Emitir evento Socket.io
      const io = getIO();
      if (io) {
        io.emit('whatsapp:message', {
          conversation_id: toConversationId,
          message: savedMessage
        });
      }
    }

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

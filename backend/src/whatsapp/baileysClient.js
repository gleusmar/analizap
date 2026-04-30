import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import { logger } from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { rm } from 'fs/promises';
import { supabase } from '../config/supabase.js';
import {
  processWhatsAppMessage,
  getOrCreateConversation,
  updateContactName,
  updateMessageStatus,
  getPrimaryIdentifier,
  extractPhoneFromJid,
  getJidFromLid,
  saveMessage,
  MESSAGE_TYPES
} from '../services/messageService.js';
import { processMessageMedia } from '../services/mediaService.js';

let sock = null;
let connectionStatus = 'disconnected';
let qrCode = null;
let sessionId = 'default';
let io = null;
let saveCredsFunction = null;
let authState = null; // Estado de autenticação global
let syncPeriodDays = 7; // Período de sincronização em dias (padrão: 7)
let syncHistory = false; // Flag para sincronizar histórico (padrão: false)

// Funções para persistência de sessão no banco de dados
async function saveAuthToDB(creds) {
  try {
    // Não salvar se creds for null ou undefined
    if (!creds) {
      return;
    }

    const { error } = await supabase
      .from('whatsapp_auth')
      .upsert({
        session_id: sessionId,
        creds: creds,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'session_id'
      });

    if (error) {
      logger.error('Erro ao salvar auth no banco:', error);
      throw error;
    }
  } catch (error) {
    logger.error('Erro ao salvar auth no banco:', error);
    throw error;
  }
}

async function loadAuthFromDB() {
  try {
    const { data, error } = await supabase
      .from('whatsapp_auth')
      .select('creds')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Erro ao carregar auth do banco:', error);
      throw error;
    }

    if (data) {
      return data.creds;
    }

    return null;
  } catch (error) {
    logger.error('Erro ao carregar auth do banco:', error);
    throw error;
  }
}

// Funções para persistência de configurações de sincronização
async function saveSyncSettings(syncHistoryParam, syncPeriodDaysParam) {
  try {
    const { error } = await supabase
      .from('whatsapp_settings')
      .upsert({
        session_id: sessionId,
        sync_history: syncHistoryParam,
        sync_period_days: syncPeriodDaysParam,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'session_id'
      });

    if (error) {
      logger.error('Erro ao salvar configurações de sincronização no banco:', error);
      throw error;
    }
  } catch (error) {
    logger.error('Erro ao salvar configurações de sincronização no banco:', error);
    throw error;
  }
}

async function loadSyncSettings() {
  try {
    const { data, error } = await supabase
      .from('whatsapp_settings')
      .select('sync_history, sync_period_days')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { sync_history: false, sync_period_days: 7 };
      }
      logger.error('Erro ao carregar configurações de sincronização do banco:', error);
      throw error;
    }

    if (data) {
      return {
        sync_history: data.sync_history,
        sync_period_days: data.sync_period_days
      };
    }

    return { sync_history: false, sync_period_days: 7 };
  } catch (error) {
    logger.error('Erro ao carregar configurações de sincronização do banco:', error);
    throw error;
  }
}

async function saveKeyToDB(type, id, value) {
  try {
    const { error } = await supabase
      .from('whatsapp_keys')
      .upsert({
        session_id: sessionId,
        type: type,
        id: id,
        value: value,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'session_id,type,id'
      });

    if (error) {
      logger.error('Erro ao salvar key no banco:', error);
      throw error;
    }
  } catch (error) {
    logger.error('Erro ao salvar key no banco:', error);
    throw error;
  }
}

async function loadKeyFromDB(type, id) {
  try {
    const { data, error } = await supabase
      .from('whatsapp_keys')
      .select('value')
      .eq('session_id', sessionId)
      .eq('type', type)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Erro ao carregar key do banco:', error);
      throw error;
    }

    if (data) {
      return data.value;
    }

    return null;
  } catch (error) {
    logger.error('Erro ao carregar key do banco:', error);
    throw error;
  }
}

async function deleteAllKeysFromDB() {
  try {
    const { error } = await supabase
      .from('whatsapp_keys')
      .delete()
      .eq('session_id', sessionId);

    if (error) {
      logger.error('Erro ao deletar keys do banco:', error);
      throw error;
    }
  } catch (error) {
    logger.error('Erro ao deletar keys do banco:', error);
    throw error;
  }
}

async function getAllKeysFromDB() {
  try {
    const { data, error } = await supabase
      .from('whatsapp_keys')
      .select('type, id, value')
      .eq('session_id', sessionId);

    if (error) {
      logger.error('Erro ao carregar keys do banco:', error);
      throw error;
    }

    const keys = {};
    if (data) {
      for (const key of data) {
        if (!keys[key.type]) {
          keys[key.type] = {};
        }
        keys[key.type][key.id] = key.value;
      }
    }

    return keys;
  } catch (error) {
    logger.error('Erro ao carregar keys do banco:', error);
    throw error;
  }
}

// Custom auth state usando banco de dados
function useDBAuthState() {
  return {
    state: {
      creds: loadAuthFromDB(),
      keys: {
        get: async (type, ids) => {
          const keys = {};
          for (const id of ids) {
            const value = await loadKeyFromDB(type, id);
            if (value) {
              keys[id] = value;
            }
          }
          return keys;
        },
        set: async (data) => {
          for (const type in data) {
            for (const id in data[type]) {
              await saveKeyToDB(type, id, data[type][id]);
            }
          }
        }
      }
    },
    saveCreds: saveAuthToDB
  };
}

// Sistema de exponential backoff para reconexão
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_DELAY = 3000; // 3 segundos

// C5: dedup em memória para evitar processamento duplicado da mesma mensagem (LID+JID)
const recentlyProcessedIds = new Set();
function markProcessed(messageId) {
  recentlyProcessedIds.add(messageId);
  setTimeout(() => recentlyProcessedIds.delete(messageId), 60000);
}

// Sistema de batching para mensagens do histórico
const messageBatch = [];
const BATCH_SIZE = 10; // Salvar a cada 10 mensagens (reduzido ainda mais)
const BATCH_DELAY = 3000; // Ou a cada 3 segundos (aumentado ainda mais)
const MESSAGE_PROCESSING_DELAY = 200; // Delay entre processamento de cada mensagem (ms)
let batchTimeout = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Define a instância do Socket.io
 */
export function setSocketIO(socketIOInstance) {
  io = socketIOInstance;
}

/**
 * Cria o socket do WhatsApp
 */
export async function createWhatsAppSocket(sessionIdParam = 'default', syncPeriodDaysParam = null) {
  sessionId = sessionIdParam;

  try {
    // Carrega configurações de sincronização do banco
    const settings = await loadSyncSettings();

    // Se syncPeriodDaysParam for fornecido, usa e salva no banco
    if (syncPeriodDaysParam !== null) {
      syncPeriodDays = syncPeriodDaysParam;
      syncHistory = syncPeriodDaysParam > 0;
      await saveSyncSettings(syncHistory, syncPeriodDays);
    } else {
      // Caso contrário, usa configurações do banco
      syncPeriodDays = settings.sync_period_days;
      syncHistory = settings.sync_history;
      // Se sync_history for false, define syncPeriodDays como 0
      if (!syncHistory) {
        syncPeriodDays = 0;
      }
    }

    logger.info(`Criando socket WhatsApp para sessão: ${sessionId}, período de sincronização: ${syncPeriodDays} dias, sync_history: ${syncHistory}`);

    // Usa useMultiFileAuthState para autenticação (padrão do Baileys)
    // No Railway, o volume está montado em /app/backend/auth_info
    const authPath = process.env.RAILWAY
      ? path.join('/app', 'backend', 'auth_info', sessionId)
      : path.join(__dirname, '..', '..', 'auth_info', sessionId);

    // Verifica se há sessão salva no banco e restaura para o sistema de arquivos se necessário
    const savedCreds = await loadAuthFromDB();
    const hasFile = fs.existsSync(authPath);

    if (savedCreds && !hasFile) {
      // Cria o diretório se não existir
      fs.mkdirSync(authPath, { recursive: true });
      
      // Salva as credenciais do banco no arquivo
      const credsPath = path.join(authPath, 'creds.json');
      fs.writeFileSync(credsPath, JSON.stringify(savedCreds, null, 2));
      
      // Carrega as chaves do banco e salva no sistema de arquivos
      const keys = await getAllKeysFromDB();
      for (const type in keys) {
        for (const id in keys[type]) {
          const keyPath = path.join(authPath, type, `${id}.json`);
          fs.mkdirSync(path.dirname(keyPath), { recursive: true });
          fs.writeFileSync(keyPath, JSON.stringify(keys[type][id], null, 2));
        }
      }
      
      logger.info('Sessão restaurada do banco para o sistema de arquivos');
    }

    const authStateResult = await useMultiFileAuthState(authPath);

    const { state, saveCreds } = authStateResult;
    authState = state; // Armazena o state globalmente

    // Wrapper para saveCreds que também salva no banco de dados
    // saveCreds do Baileys não recebe argumentos - salva state.creds por referência
    saveCredsFunction = async () => {
      await saveCreds();
      try {
        await saveAuthToDB(state.creds);
      } catch (error) {
        logger.error('Erro ao salvar creds no banco (continuando com arquivo):', error);
      }
    };

    // Fetch the latest version of WA Web and Baileys
    const { version, isLatest } = await fetchLatestBaileysVersion();

    // Configuração do logger - silencioso em produção para evitar lentidão
    const loggerBaileys = pino({ level: 'silent' });

    // Cria o socket com a versão mais recente
    sock = makeWASocket({
      version, // Use the fetched version
      auth: state,
      printQRInTerminal: false,
      logger: loggerBaileys,
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      markOnlineOnConnect: false,
      syncFullHistory: syncPeriodDays > 0, // Desabilita syncFullHistory se syncPeriodDays for 0
      generateHighQualityLinkPreview: true,
      getMessage: async (key) => {
        try {
          const { data } = await supabase
            .from('messages')
            .select('content, message_type, metadata')
            .eq('real_message_id', key.id)
            .maybeSingle();

          if (!data) return undefined;

          // Reconstruir objeto de mensagem no formato esperado pelo Baileys
          switch (data.message_type) {
            case 'image':
              return { imageMessage: { caption: data.metadata?.caption || '', url: data.content } };
            case 'audio':
              return { audioMessage: { url: data.content } };
            case 'video':
              return { videoMessage: { caption: data.metadata?.caption || '', url: data.content } };
            case 'document':
              return { documentMessage: { fileName: data.metadata?.filename || '', url: data.content } };
            default:
              return { conversation: data.content || '' };
          }
        } catch (error) {
          return undefined;
        }
      }
    });

    // Configura eventos
    setupEvents(sock);

    return sock;
  } catch (error) {
    logger.error('Erro ao criar socket WhatsApp:', error.message);
    throw error;
  }
}

/**
 * Configura os eventos do socket
 */
function setupEvents(socket) {
  logger.info('Configurando eventos do socket WhatsApp');

  // Evento de atualização da conexão
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, isNewLogin, qr } = update;

    // BUG24/BUG25: Log mudanças de conexão para rastrear perda de mensagens
    if (connection) {
      logger.debug(`CONN_UPDATE: ${connection} | isNewLogin: ${isNewLogin}`);
    }

    if (qr) {
      const qrCodeImage = await QRCode.toDataURL(qr);
      qrCode = qrCodeImage;
      // Emitir evento específico para QR Code
      if (io) {
        io.emit('whatsapp:qr', { qr: qrCodeImage });
      }
      emitConnectionStatus('qr_required');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : undefined;

      // BUG24/BUG25: Log detalhado de desconexão
      logger.debug(`CONN_CLOSE: statusCode: ${statusCode} | reason: ${lastDisconnect?.error?.message}`);

      // Determinar se deve reconectar baseado no DisconnectReason
      let shouldReconnect = true;
      let reason = '';

      // Verificação direta para 401 (loggedOut)
      if (statusCode === 401) {
        shouldReconnect = false;
        reason = 'Usuário fez logout (401)';
      } else if (statusCode === DisconnectReason.badSession) {
        shouldReconnect = false;
        reason = 'Sessão inválida - precisa reautenticar';
      } else if (statusCode === DisconnectReason.multideviceMismatch) {
        shouldReconnect = false;
        reason = 'Mismatch de multi-dispositivo - atualize a biblioteca';
      } else if (statusCode === DisconnectReason.forbidden) {
        shouldReconnect = false;
        reason = 'Acesso negado - verifique credenciais';
      } else if (statusCode === DisconnectReason.restartRequired) {
        shouldReconnect = true;
        reason = 'Servidor solicitou restart';
      } else if (statusCode === DisconnectReason.connectionClosed ||
                 statusCode === DisconnectReason.connectionLost ||
                 statusCode === DisconnectReason.timedOut) {
        shouldReconnect = true;
        reason = 'Problema de conexão de rede';
      } else {
        shouldReconnect = true;
        reason = `Erro desconhecido (statusCode: ${statusCode})`;
      }

      logger.warn(`Conexão WhatsApp encerrada. Razão: ${reason} | statusCode: ${statusCode} | shouldReconnect: ${shouldReconnect}`, {
        error: lastDisconnect?.error?.message,
        stack: lastDisconnect?.error?.stack?.split('\n').slice(0, 3).join(' | ')
      });

      if (shouldReconnect) {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          logger.error(`Máximo de tentativas de reconexão atingido (${MAX_RECONNECT_ATTEMPTS})`);
          connectionStatus = 'disconnected';
          emitConnectionStatus('disconnected');
          return;
        }

        // Exponential backoff
        const delay = BASE_DELAY * Math.pow(2, reconnectAttempts);
        reconnectAttempts++;
        logger.info(`Tentativa de reconexão ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} em ${delay}ms`);

        connectionStatus = 'connecting';
        emitConnectionStatus('connecting');

        setTimeout(() => {
          createWhatsAppSocket(sessionId);
        }, delay);
      } else {
        connectionStatus = 'disconnected';
        qrCode = null;
        emitConnectionStatus('disconnected');
        reconnectAttempts = 0;
        // Limpar credenciais se for badSession ou loggedOut
        if (statusCode === DisconnectReason.badSession || statusCode === DisconnectReason.loggedOut) {
          removeSession();
        }
      }
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      qrCode = null;
      reconnectAttempts = 0; // Reset contador de tentativas
      emitConnectionStatus('connected');

      // Forçar processamento do batch final após conexão
      setTimeout(() => {
        if (batchTimeout) {
          clearTimeout(batchTimeout);
          batchTimeout = null;
        }
        processMessageBatch();
      }, 2000);
    } else if (connection === 'connecting') {
      connectionStatus = 'connecting';
      emitConnectionStatus('connecting');
    }
  });

  // Evento de credenciais atualizadas
  socket.ev.on('creds.update', async () => {
    await saveCredsFunction();
  });

  // Função para processar mensagens enviadas por nós
  async function processSentMessage(message, syncPeriodDays) {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const messageId = message.key.id;
    const remoteJid = message.key.remoteJid;
    const messageTimestamp = message.messageTimestamp;
    const uniqueId = await getMessageUniqueId(message);

    // Ignorar mensagens de grupo, status, newsletter e canais
    if (isGroupOrBroadcast(remoteJid)) {
      return;
    }

    const phone = remoteJid.split('@')[0];

    // Obter conversation_id
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('phone', phone)
      .single();

    const conversationId = conversation?.id;

    // Verificar se mensagem já existe (por message_id ou real_message_id)
    const { data: existingMessage } = await supabase
      .from('messages')
      .select('id, message_id, real_message_id')
      .or(`message_id.eq.${messageId},real_message_id.eq.${messageId}`)
      .single();

    if (existingMessage) {
      // Atualizar status para entregue se necessário
      await supabase
        .from('messages')
        .update({ is_delivered: true })
        .eq('id', existingMessage.id);

      return; // Não processar novamente
    }

    // Verificar se existe mensagem temporária (enviada pelo endpoint /send) que precisa ser atualizada
    // Buscar mensagem temporária na mesma conversa com timestamp próximo (dentro de 10 segundos)
    const messageTime = messageTimestamp * 1000; // Converter para milissegundos
    const tenSecondsAgo = new Date(messageTime - 10000).toISOString();
    const tenSecondsLater = new Date(messageTime + 10000).toISOString();

    let tempMessage = null;
    if (conversationId) {
      const { data: tempMsg } = await supabase
        .from('messages')
        .select('id, message_id, conversation_id, message_type, content')
        .eq('conversation_id', conversationId)
        .eq('from_me', true)
        .ilike('message_id', 'temp_%')
        .gte('created_at', tenSecondsAgo)
        .lte('created_at', tenSecondsLater)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      tempMessage = tempMsg;
    }

    if (tempMessage) {
      // Atualizar message_id e real_message_id em background
      await supabase
        .from('messages')
        .update({
          message_id: messageId,
          real_message_id: messageId,
          is_delivered: true
        })
        .eq('id', tempMessage.id);

      // Não emitir evento para evitar flicking - o frontend já tem a mensagem temporária

      // Se tiver mídia, processa em background e atualiza depois
      // Pular se o conteúdo já for uma URL do Supabase (sendAttachment já fez upload)
      if (message.message && !tempMessage.content?.includes('.supabase.co')) {
        const { MESSAGE_TYPES } = await import('../services/messageService.js');
        const messageType = tempMessage.message_type;

        if ([MESSAGE_TYPES.IMAGE, MESSAGE_TYPES.AUDIO, MESSAGE_TYPES.VIDEO,
             MESSAGE_TYPES.DOCUMENT, MESSAGE_TYPES.STICKER].includes(messageType)) {
          // Processa mídia em background para não bloquear
          const { processMessageMedia } = await import('../services/mediaService.js');
          // Usa messageId (ID real do WhatsApp) pois tempMessage.message_id já foi sobrescrito
          processMessageMedia(message, messageType, messageId)
            .then(async (publicUrl) => {
              if (!publicUrl) return;

              const { data: currentMessage } = await supabase
                .from('messages')
                .select('content')
                .eq('message_id', messageId)
                .single();

              // Apenas pular se já for uma URL do Supabase (não pular CDN do WhatsApp)
              if (currentMessage?.content?.includes('.supabase.co')) return;

              const { error } = await supabase
                .from('messages')
                .update({ content: publicUrl })
                .eq('message_id', messageId);

              if (!error && io) {
                io.emit('whatsapp:message_updated', {
                  conversation_id: tempMessage.conversation_id,
                  message_id: messageId,
                  content: publicUrl
                });
              }
            })
            .catch(error => {
              logger.error('Erro ao processar mídia de mensagem enviada:', {
                message: error.message,
                stack: error.stack,
                code: error.code,
                messageId,
                messageType
              });
            });
        }
      }

      return; // Não processar novamente
    }

    // Verificar se é mensagem de protocolo antes de processar
    if (message.message && message.message.protocolMessage) {
      return;
    }

    // Processar a mensagem (processWhatsAppMessage vai criar a conversa se necessário)
    const { processWhatsAppMessage, MESSAGE_TYPES } = await import('../services/messageService.js');

    const processedMessage = await processWhatsAppMessage(message, sock, syncPeriodDays);

    // Se a mensagem foi processada, atualiza para garantir que é from_me = true
    if (processedMessage) {
      await supabase
        .from('messages')
        .update({ from_me: true })
        .eq('message_id', messageId);

      // Emitir mensagem se não havia temp (ex: sendAttachment falhou mas WA enviou mesmo assim)
      if (io && !tempMessage) {
        io.emit('whatsapp:message', {
          conversation_id: processedMessage.conversation_id,
          message: processedMessage,
          is_temp: false
        });
      }

      // Se tiver mídia, processa em background e atualiza depois
      if (message.message) {
        const messageTypeSaved = processedMessage.message_type;
        if ([MESSAGE_TYPES.IMAGE, MESSAGE_TYPES.AUDIO, MESSAGE_TYPES.VIDEO,
             MESSAGE_TYPES.DOCUMENT, MESSAGE_TYPES.STICKER].includes(messageTypeSaved)) {
          // Processa mídia em background para não bloquear
          const { processMessageMedia } = await import('../services/mediaService.js');
          processMessageMedia(message, messageTypeSaved, processedMessage.message_id)
            .then(async (publicUrl) => {

              // Atualiza a mensagem com a URL do Supabase (preserva metadados existentes)
              // Verificar se o conteúdo já é uma URL (já foi processado)
              const { data: currentMessage } = await supabase
                .from('messages')
                .select('content')
                .eq('message_id', processedMessage.message_id)
                .single();

              // Apenas pular se já for uma URL do Supabase (não pular CDN do WhatsApp)
              const isAlreadySupabase = currentMessage?.content?.includes('.supabase.co');

              if (isAlreadySupabase) {
              } else {
                const { error } = await supabase
                  .from('messages')
                  .update({ content: publicUrl })
                  .eq('message_id', processedMessage.message_id);

                if (error) {
                  logger.error('Erro ao atualizar mensagem com URL da mídia:', error);
                } else {
                  // Emitir evento de atualização de mensagem quando a mídia for processada
                  if (io) {
                    io.emit('whatsapp:message_updated', {
                      conversation_id: processedMessage.conversation_id,
                      message_id: processedMessage.message_id,
                      content: publicUrl
                    });
                  }
                }
              }
            })
            .catch(error => {
              logger.error('Erro ao processar mídia:', {
                message: error.message,
                stack: error.stack,
                name: error.name,
                code: error.code,
                messageId: processedMessage.message_id,
                messageType: messageTypeSaved
              });
            });
        }
      }
    }
  }

  // Evento de atualização de mensagens
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const message of messages) {
      const remoteJid = message.key?.remoteJid;

      // Filtro imediato: ignorar grupos, broadcasts, newsletters e protocolos
      if (!remoteJid || isGroupOrBroadcast(remoteJid)) continue;
      if (message.message?.protocolMessage) continue;

      // LOG: Log específico para mensagens privadas (notify)
      if (type === 'notify') {
        const msgType = Object.keys(message.message || {})[0] || 'unknown';
        logger.debug(`MSG_PRIVADA: ${remoteJid} | tipo: ${msgType} | fromMe: ${message.key.fromMe} | id: ${message.key.id}`);
      }

      if (message.key.fromMe) {
        // Mensagem enviada por nós: processSentMessage verifica duplicação internamente
        await processSentMessage(message, syncPeriodDays);
        continue;
      }

      // Mensagem recebida:
      // - append (histórico) → batch para não sobrecarregar o banco
      // - notify (tempo real) → processar imediatamente com dedup
      if (type === 'append') {
        addToMessageBatch(message, type);
      } else {
        const uniqueId = await getMessageUniqueId(message);
        if (!(await checkMessageExists(uniqueId))) {
          await handleIncomingMessage(message, true);
        }
      }
    }
  });

  // Evento de atualização de status de mensagem (entregue, lida)
  socket.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      const { key, update: updateData } = update;
      const messageId = key.id;

      // Status 2 = sent/received, Status 3 = delivered, Status 4 = read
      if (updateData.status === 4) {
        try {
          await updateMessageStatus(messageId, 'read');
          
          // Emitir evento para o frontend
          if (io) {
            io.emit('whatsapp:message_status', {
              message_id: messageId,
              status: 'read'
            });
          }
        } catch (error) {
          logger.error('Erro ao marcar mensagem como lida:', error);
        }
      } else if (updateData.status === 3) {
        // Mensagem entregue
        try {
          await updateMessageStatus(messageId, 'delivered');
          
          // Emitir evento para o frontend
          if (io) {
            io.emit('whatsapp:message_status', {
              message_id: messageId,
              status: 'delivered'
            });
          }
        } catch (error) {
          logger.error('Erro ao marcar mensagem como entregue:', error);
        }
      } else if (updateData.status === 2) {
        // Mensagem enviada/recebida pelo servidor
        // Não atualizamos o banco para status 2, mas emitimos evento para o frontend
        if (io) {
          io.emit('whatsapp:message_status', {
            message_id: messageId,
            status: 'sent'
          });
        }
      }
    }
  });

  // Função para salvar/atualizar presença no banco de dados
  async function savePresenceToDB(phone, presence, lastSeenAt = null) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      // Se o phone tiver formato de LID (número muito longo), tentar mapear
      let finalPhone = phone;
      if (phone.length > 20) {
        // Provavelmente é um LID
        const { data: mapping } = await supabase
          .from('lid_mappings')
          .select('phone')
          .eq('lid', `${phone}@lid`)
          .maybeSingle();

        if (mapping) {
          finalPhone = mapping.phone;
        }
      }

      const { error } = await supabase
        .from('contact_presence')
        .upsert({
          phone: finalPhone,
          presence,
          last_seen_at: lastSeenAt,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'phone'
        });

      if (error) {
        logger.error('Erro ao salvar presença no banco:', error);
      }
    } catch (error) {
      logger.error('Erro ao salvar presença no banco:', error);
    }
  }

  // Evento de atualização de presença
  socket.ev.on('presence.update', async (updates) => {
    // O formato pode ser: { id: string, presences: { [jid]: { lastKnownPresence: string } } }
    // ou array de objetos com mesmo formato
    let updatesArray = [];

    if (!updates) {
      return;
    }

    if (Array.isArray(updates)) {
      updatesArray = updates;
    } else if (typeof updates === 'object' && updates.id && updates.presences) {
      // Formato de objeto único
      updatesArray = [updates];
    } else {
      return;
    }

    for (const { id, presences } of updatesArray) {
      // Extrair phone do JID (pode ser LID ou phone real)
      let phone = id.split('@')[0];

      // Se for LID, mapear para phone real
      if (id.endsWith('@lid')) {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );

        const { data: mapping } = await supabase
          .from('lid_mappings')
          .select('phone')
          .eq('lid', id)
          .maybeSingle();

        if (mapping) {
          phone = mapping.phone;
        }
      }

      for (const [jid, presence] of Object.entries(presences)) {
        // Salvar no banco de dados
        await savePresenceToDB(phone, presence.lastKnownPresence);

        // Emitir evento para o frontend
        if (io) {
          io.emit('whatsapp:presence_update', {
            phone,
            presence: presence.lastKnownPresence,
            last_seen: presence.lastKnownPresence === 'unavailable' ? new Date().toISOString() : null
          });
        }
      }
    }
  });

  // Evento de histórico sincronizado
  socket.ev.on('messaging-history.set', async ({ messages }) => {
    // Processar histórico apenas se houver mensagens
    if (!messages || messages.length === 0) {
      return;
    }
    
    // Processar histórico com batching
    for (const message of messages) {
      // Usar o mesmo filtro de grupos/status
      const remoteJid = message.key?.remoteJid;
      if (remoteJid && isGroupOrBroadcast(remoteJid)) {
        continue;
      }
      
      await handleIncomingMessage(message);
    }
  });

  // Evento de atualização de chat
  socket.ev.on('chats.upsert', async (chats) => {
    // Processar atualizações de chat
    for (const chat of chats) {
      await handleChatUpdate(chat);
    }
  });

  // Evento de atualização de chat
  socket.ev.on('chats.update', async (chats) => {
    for (const chat of chats) {
      await handleChatUpdate(chat);
    }
  });

  // Evento de atualização de contato
  socket.ev.on('contacts.update', async (contacts) => {
    // Processar atualizações de contato
    for (const contact of contacts) {
      await handleContactUpdate(contact);
    }
  });

  // B10: Detectar chamadas recebidas, responder automaticamente e registrar na conversa
  socket.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status !== 'offer') continue; // apenas ofertas (incoming)
      if (call.isGroup) continue;

      const remoteJid = call.from;
      if (!remoteJid || isGroupOrBroadcast(remoteJid)) continue;

      try {
        // Rejeitar a chamada automaticamente
        await socket.rejectCall(call.id, remoteJid).catch(() => {});

        // Buscar / criar conversa
        const conversation = await getOrCreateConversation(remoteJid, null, null, null, socket);
        if (!conversation) continue;

        const AUTO_REPLY_MSG = 'As chamadas de voz e vídeo estão desabilitadas para esse WhatsApp, favor enviar uma mensagem de texto.';
        const callType = call.isVideo ? 'video' : 'audio';

        // Salvar evento de chamada na conversa (tipo 'call')
        const callRecord = await saveMessage({
          conversation_id: conversation.id,
          message_id: `call_${call.id || Date.now()}`,
          from_me: false,
          message_type: 'call',
          content: `Chamada de ${callType} recebida`,
          metadata: { callType, status: 'missed', callId: call.id },
          timestamp: new Date().toISOString()
        });

        // Emitir evento de chamada para o frontend
        if (io) {
          io.emit('whatsapp:message', { conversation_id: conversation.id, message: callRecord });
        }

        // Enviar mensagem automática após 3 segundos
        setTimeout(async () => {
          try {
            await socket.sendMessage(remoteJid, { text: AUTO_REPLY_MSG });

            const autoReply = await saveMessage({
              conversation_id: conversation.id,
              message_id: `autoreply_${Date.now()}`,
              from_me: true,
              message_type: 'text',
              content: AUTO_REPLY_MSG,
              metadata: {},
              timestamp: new Date().toISOString()
            });

            if (io) {
              io.emit('whatsapp:message', { conversation_id: conversation.id, message: autoReply });
            }
          } catch (err) {
            logger.error('Erro ao enviar auto-reply de chamada:', err);
          }
        }, 3000);
      } catch (err) {
        logger.error('Erro ao processar chamada recebida:', err);
      }
    }
  });
}

/**
 * Salva o auth state
 */
async function saveAuthState(state) {
  try {
    if (saveCredsFunction && state) {
      await saveCredsFunction(state.creds);
    }
  } catch (error) {
    logger.error('Erro ao salvar auth state:', error);
  }
}

/**
 * Processa um batch de mensagens e salva no banco
 */
async function processMessageBatch() {
  if (messageBatch.length === 0) return;

  const batchToProcess = [...messageBatch];
  messageBatch.length = 0; // Limpar o batch

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // Agrupar mensagens por conversa
    const messagesByConversation = {};
    for (const msg of batchToProcess) {
      const remoteJid = msg.message.key.remoteJid;

      // Ignorar mensagens de grupo, status, newsletter e canais
      if (isGroupOrBroadcast(remoteJid)) {
        continue;
      }

      const phone = remoteJid.split('@')[0];
      if (!messagesByConversation[phone]) {
        messagesByConversation[phone] = [];
      }
      messagesByConversation[phone].push(msg.message);
    }

    // Processar cada mensagem individualmente (deixar processWhatsAppMessage criar a conversa)
    let processedCount = 0;
    for (const msg of batchToProcess) {
      const message = msg.message;
      const remoteJid = message.key.remoteJid;
      const type = msg.type;

      // Ignorar mensagens de grupo, status, newsletter e canais
      if (isGroupOrBroadcast(remoteJid)) {
        continue;
      }

      const messageId = message.key.id;
      const uniqueId = await getMessageUniqueId(message);

      // Para append, verificar se mensagem já existe (notify é sempre nova)
      if (type === 'append') {
        const { data: existingMessage } = await supabase
          .from('messages')
          .select('id')
          .eq('message_id', messageId)
          .single();

        if (existingMessage) {
          continue;
        }
      }

      // Para notify, processar sempre (é mensagem nova em tempo real)

      // Processar mensagem (processWhatsAppMessage vai criar a conversa se necessário)
      const { processWhatsAppMessage } = await import('../services/messageService.js');

      const processedMessage = await processWhatsAppMessage(message, sock, syncPeriodDays);

      // Se a mensagem não foi processada (null), continua para a próxima
      if (!processedMessage) continue;

      processedCount++;

      // Emitir evento apenas para mensagens recentes (últimas 5 minutos)
      const messageTime = message.messageTimestamp * 1000;
      const isRecent = Date.now() - messageTime < 5 * 60 * 1000;

      if (isRecent && io) {
        io.emit('whatsapp:message', {
          conversation_id: processedMessage.conversation_id,
          message: processedMessage
        });
      }

      // Delay entre mensagens para não sobrecarregar o Supabase
      if (processedCount < batchToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, MESSAGE_PROCESSING_DELAY));
      }
    }

    // Delay adicional após processar batch para dar tempo ao Supabase
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    logger.error('Erro ao processar batch de mensagens:', error.message || error);
  }
}

/**
 * Adiciona mensagem ao batch e dispara processamento se necessário
 */
function addToMessageBatch(message, type) {
  messageBatch.push({ message, type });

  // Se atingiu o tamanho do batch, processa imediatamente
  if (messageBatch.length >= BATCH_SIZE) {
    if (batchTimeout) {
      clearTimeout(batchTimeout);
      batchTimeout = null;
    }
    processMessageBatch();
    return;
  }

  // Se não atingiu o tamanho, agenda processamento após delay
  if (!batchTimeout) {
    batchTimeout = setTimeout(() => {
      batchTimeout = null;
      processMessageBatch();
    }, BATCH_DELAY);
  }
}

/**
 * Emite QR Code via socket.io
 */
async function emitQRCode(qr) {
  if (io) {
    try {
      // Converte QR Code para imagem base64
      const qrImage = await QRCode.toDataURL(qr);
      io.emit('whatsapp:qr', { qr: qrImage, sessionId });
    } catch (error) {
      logger.error('Erro ao converter QR Code para imagem:', error);
      // Emite QR Code como string em caso de erro
      io.emit('whatsapp:qr', { qr, sessionId });
    }
  }
}

/**
 * Emite status da conexão via socket.io
 */
function emitConnectionStatus(status) {
  if (io) {
    io.emit('whatsapp:status', { status, sessionId });
  }
}

/**
 * Normaliza o remoteJid fazendo mapeamento LID->JID se necessário
 * Isso garante que o unique_id seja consistente mesmo quando a mensagem
 * chega primeiro com LID e depois com JID real
 */
async function getNormalizedRemoteJid(remoteJid) {
  if (!remoteJid) return '';
  
  // Se já for um JID normal (não LID), retorna como está
  if (!remoteJid.endsWith('@lid')) {
    return remoteJid;
  }
  
  // Se for LID, tenta mapear para JID real
  try {
    const mappedJid = await getJidFromLid(remoteJid);
    if (mappedJid) {
      return mappedJid;
    }
  } catch (error) {
    // Se falhar o mapeamento, usa o LID mesmo
  }
  
  return remoteJid;
}

/**
 * Gera ID único da mensagem baseado na chave do WhatsApp
 * Combina remoteJid (normalizado), fromMe e id para garantir unicidade
 */
async function getMessageUniqueId(msg) {
  const normalizedRemoteJid = await getNormalizedRemoteJid(msg.key?.remoteJid);
  return `${normalizedRemoteJid || ''}-${msg.key?.fromMe ? '1' : '0'}-${msg.key?.id || ''}`;
}

/**
 * Verifica se uma mensagem já existe no banco usando o uniqueId
 * @param {string} uniqueId - ID único da mensagem (remoteJid-fromMe-id)
 * @returns {Promise<boolean>} - true se a mensagem existe, false caso contrário
 */
async function checkMessageExists(uniqueId) {
  try {
    // Buscar mensagem pelo unique_id (se existir no banco)
    const { data, error } = await supabase
      .from('messages')
      .select('id')
      .eq('unique_id', uniqueId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found, que é esperado
    }

    return !!data;
  } catch (error) {
    return false;
  }
}

/**
 * Verifica se o JID é de grupo, status, newsletter ou canal
 */
function isGroupOrBroadcast(jid) {
  return (
    jid.endsWith('@g.us') || // Grupo
    jid.endsWith('@broadcast') || // Broadcast
    jid.endsWith('@newsletter') || // Newsletter
    jid.endsWith('@s.whatsapp.net') && jid.includes('status') // Status
  );
}

/**
 * Trata mensagem recebida
 * @param {Object} message - Mensagem do WhatsApp
 * @param {boolean} shouldProcess - Se true, processa e salva a mensagem. Se false, apenas emite mensagem temporária.
 */
async function handleIncomingMessage(message, shouldProcess = true) {
  try {
    const { key, message: msg, pushName, messageTimestamp } = message;
    const remoteJid = key.remoteJid;
    
    // BUG26: Log início do processamento
    logger.debug(`HANDLE_MSG_START: id=${key.id} | remoteJid=${remoteJid} | shouldProcess=${shouldProcess}`);
    
    // C5: dedup — ignorar se message_id já foi processado recentemente (evita duplicata LID+JID)
    if (recentlyProcessedIds.has(key.id)) {
      logger.debug(`HANDLE_MSG_DEDUP: id=${key.id} já processado recentemente`);
      return;
    }
    markProcessed(key.id);

    // Ignorar mensagens de grupo, status, newsletter e canais
    if (isGroupOrBroadcast(remoteJid)) {
      logger.debug(`HANDLE_MSG_SKIP: id=${key.id} - grupo/broadcast`);
      return;
    }

    // Verificar se a mensagem tem conteúdo válido
    if (!msg || Object.keys(msg).length === 0) {
      logger.debug(`HANDLE_MSG_SKIP: id=${key.id} - sem conteúdo`);
      return;
    }

    // Ignorar mensagens de protocolo
    if (msg.protocolMessage) {
      logger.debug(`HANDLE_MSG_SKIP: id=${key.id} - protocolMessage`);
      return;
    }

    // Extrair tipo de mensagem para log
    let messageType = 'texto';
    if (msg.conversation || msg.extendedTextMessage) {
      messageType = 'texto';
    } else if (msg.imageMessage) {
      messageType = 'imagem';
    } else if (msg.audioMessage) {
      messageType = 'áudio';
    } else if (msg.videoMessage) {
      messageType = 'vídeo';
    } else if (msg.documentMessage) {
      messageType = 'documento';
    } else if (msg.locationMessage) {
      messageType = 'location';
    } else if (msg.contactMessage) {
      messageType = 'contato';
    } else if (msg.stickerMessage) {
      messageType = 'sticker';
    } else if (msg.call) {
      // Ligação - sinalizar na conversa mas não salvar como mensagem
      const phone = remoteJid.split('@')[0];

      // Atualizar last_message_at para mostrar atividade recente
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      // Buscar conversa pelo phone
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('phone', phone)
        .single();

      if (conversation) {
        await supabase
          .from('conversations')
          .update({
            last_message_at: new Date(messageTimestamp * 1000).toISOString()
          })
          .eq('id', conversation.id);
      }

      return; // Não processar como mensagem normal
    }

    const phone = remoteJid.split('@')[0];
    const messageId = key.id; // eslint-disable-line no-shadow

    // Determinar se é mensagem de mídia
    const isMedia = msg.imageMessage || msg.audioMessage || msg.videoMessage ||
                    msg.documentMessage || msg.stickerMessage;

    // Extrair contextInfo (mensagem citada) — presente em qualquer tipo de mensagem
    const contextInfo = msg.extendedTextMessage?.contextInfo ||
                        msg.imageMessage?.contextInfo ||
                        msg.audioMessage?.contextInfo ||
                        msg.videoMessage?.contextInfo ||
                        msg.documentMessage?.contextInfo ||
                        msg.stickerMessage?.contextInfo;
    const quotedMessageId = contextInfo?.stanzaId || null;

    // Extrair informações básicas da mensagem para emitir imediatamente (apenas para texto)
    const conversation = await getOrCreateConversation(
      remoteJid,
      pushName || null,
      null,
      null,
      sock,
      messageTimestamp // passa timestamp para verificar período de sincronização
    );

    // Emitir mensagem temporária apenas para mensagens de texto (não para mídia)
    if (io && conversation && !isMedia) {
      const tempMessage = {
        id: null,
        message_id: messageId,
        conversation_id: conversation.id,
        from_me: false,
        message_type: msg.conversation || msg.extendedTextMessage ? 'text' : 'unknown',
        content: msg.conversation || msg.extendedTextMessage?.text || '',
        timestamp: new Date(messageTimestamp * 1000).toISOString(),
        is_read: false,
        is_delivered: false,
        quoted_message_id: quotedMessageId
      };

      io.emit('whatsapp:message', {
        conversation_id: conversation.id,
        message: tempMessage,
        is_temp: true
      });
    }

    // Processa e salva a mensagem no banco de dados em background (não await)
    if (shouldProcess) {
      processWhatsAppMessage(message, sock, syncPeriodDays)
      .then(savedMessage => {
        if (!savedMessage) return;

        // Se tiver mídia, processa em background antes de emitir o evento
        if (message.message) {
          const messageTypeSaved = savedMessage.message_type;
          if ([MESSAGE_TYPES.IMAGE, MESSAGE_TYPES.AUDIO, MESSAGE_TYPES.VIDEO,
               MESSAGE_TYPES.DOCUMENT, MESSAGE_TYPES.STICKER].includes(messageTypeSaved)) {
            processMessageMedia(message, messageTypeSaved, savedMessage.message_id)
              .then(async (publicUrl) => {
                const { createClient } = await import('@supabase/supabase-js');
                const supabase = createClient(
                  process.env.SUPABASE_URL,
                  process.env.SUPABASE_SERVICE_KEY
                );

                const { error } = await supabase
                  .from('messages')
                  .update({ content: publicUrl })
                  .eq('message_id', savedMessage.message_id);

                if (error) {
                  logger.error('Erro ao atualizar mensagem com URL da mídia:', error);
                } else {
                  // Buscar mensagem atualizada com a URL da mídia
                  const { data: updatedMessage } = await supabase
                    .from('messages')
                    .select('*')
                    .eq('message_id', savedMessage.message_id)
                    .single();

                  // Emitir evento com a mensagem completa (incluindo URL da mídia)
                  if (io && updatedMessage) {
                    io.emit('whatsapp:message', {
                      conversation_id: savedMessage.conversation_id,
                      message: updatedMessage,
                      is_temp: false
                    });
                  }
                }
              })
              .catch(error => {
                logger.error('Erro ao processar mídia:', {
                  message: error.message,
                  stack: error.stack,
                  name: error.name,
                  code: error.code,
                  messageId: savedMessage.message_id,
                  messageType: messageTypeSaved
                });
                // Se falhar ao processar mídia, emite evento mesmo assim com a mensagem original
                if (io) {
                  io.emit('whatsapp:message', {
                    conversation_id: savedMessage.conversation_id,
                    message: savedMessage,
                    is_temp: false
                  });
                }
              });
            return; // Não emite o evento imediatamente para mídia
          }
        }

        // Para mensagens sem mídia (ou se não for mídia), emite o evento imediatamente
        if (io) {
          io.emit('whatsapp:message', {
            conversation_id: savedMessage.conversation_id,
            message: savedMessage,
            is_temp: false
          });
        }
      })
      .catch(error => {
        logger.error('Erro ao processar mensagem em background:', error);
      });
    }
  } catch (error) {
    // Tratar erro de Bad MAC silenciosamente (erro de criptografia comum do Baileys)
    if (error.message && error.message.includes('Bad MAC')) {
      return;
    }
    logger.error('Erro ao tratar mensagem recebida:', error);
  }
}

/**
 * Trata atualização de chat
 */
async function handleChatUpdate(chat) {
  try {
    // Não criar conversas apenas por atualização de chat
    // Conversas só devem ser criadas quando há mensagens reais
    const remoteJid = chat.id;
    
    // Ignorar grupos, status, newsletter, canais e LIDs
    if (isGroupOrBroadcast(remoteJid) || remoteJid.endsWith('@lid')) {
      return;
    }
    
    // Apenas atualizar timestamp se a conversa já existir
    const phone = remoteJid.split('@')[0];
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('phone', phone)
      .single();
    
    if (conversation && chat.lastMessageTimestamp) {
      await supabase
        .from('conversations')
        .update({
          last_message_at: new Date(chat.lastMessageTimestamp * 1000).toISOString()
        })
        .eq('id', conversation.id);
    }
  } catch (error) {
    logger.error('Erro ao tratar atualização de chat:', error);
  }
}

/**
 * Trata atualização de contato
 */
async function handleContactUpdate(contact) {
  try {
    // Ignorar se for canal, newsletter, grupo ou LID
    if (contact.id.endsWith('@newsletter') || 
        contact.id.endsWith('@g.us') ||
        contact.id.endsWith('@broadcast') ||
        contact.id.endsWith('@lid')) {
      return;
    }

    // Determina o identificador principal para usar na conversa
    const primaryIdentifier = getPrimaryIdentifier(contact.id.endsWith('@lid') ? contact.id : null, !contact.id.endsWith('@lid') ? contact.id : null);
    const phone = extractPhoneFromJid(primaryIdentifier);

    // Apenas atualizar se a conversa já existir (não criar novas)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('phone', phone)
      .single();
    
    // Só atualizar se a conversa já existir
    if (conversation) {
      // Atualiza nome do contato se tiver
      if (contact.notify || contact.name) {
        await updateContactName(conversation.id, contact.notify || contact.name);
      }
      
      // Atualizar foto de perfil se necessário
      if (contact.profilePictureUrl) {
        await supabase
          .from('conversations')
          .update({ profile_picture_url: contact.profilePictureUrl })
          .eq('id', conversation.id);
      }
    }
  } catch (error) {
    logger.error('Erro ao tratar atualização de contato:', error.message || error);
  }
}

/**
 * Obtém o socket atual
 */
export function getSocket() {
  return sock;
}

/**
 * Obtém a instância do Socket.io
 */
export function getIO() {
  return io;
}

/**
 * Obtém o status da conexão
 */
export function getConnectionStatus() {
  return connectionStatus;
}

/**
 * Obtém o QR Code atual
 */
export function getQRCode() {
  return qrCode;
}

/**
 * Desconecta o socket
 */
export async function disconnectSocket() {
  try {
    if (sock) {
      await sock.end();
      sock = null;
      connectionStatus = 'disconnected';
      qrCode = null;
      emitConnectionStatus('disconnected');
    }
  } catch (error) {
    logger.error('Erro ao desconectar socket:', error);
    throw error;
  }
}

/**
 * Remove a sessão
 */
export async function removeSession() {
  try {
    await disconnectSocket();

    // Remover arquivo
    const authPath = process.env.RAILWAY
      ? path.join('/app', 'backend', 'auth_info', sessionId)
      : path.join(__dirname, '..', '..', 'auth_info', sessionId);
    if (fs.existsSync(authPath)) {
      await rm(authPath, { recursive: true, force: true });
    }

    // Deletar do banco de dados
    try {
      const { error: authError } = await supabase
        .from('whatsapp_auth')
        .delete()
        .eq('session_id', sessionId);

      if (authError) {
        logger.error('Erro ao deletar auth do banco:', authError);
        // Não throw, continuar mesmo se falhar
      }

      await deleteAllKeysFromDB();
    } catch (error) {
      logger.error('Erro ao deletar do banco (continuando):', error);
    }

  } catch (error) {
    logger.error('Erro ao remover sessão:', error);
    throw error;
  }
}

/**
 * Verifica se existe uma sessão salva
 */
export async function hasSessionSaved() {
  // Verifica primeiro no arquivo (mais rápido)
  const authPath = process.env.RAILWAY
    ? path.join('/app', 'backend', 'auth_info', sessionId)
    : path.join(__dirname, '..', '..', 'auth_info', sessionId);
  const hasFile = fs.existsSync(authPath);

  if (hasFile) {
    return true;
  }

  // Se não tem arquivo, verifica no banco de dados
  try {
    const { data, error } = await supabase
      .from('whatsapp_auth')
      .select('id')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return false;
      }
      logger.error('Erro ao verificar sessão no banco:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    logger.error('Erro ao verificar sessão no banco:', error);
    return false;
  }
}

/**
 * Tenta reconectar usando a sessão salva (se existir)
 */
export async function reconnectWithSavedSession(sessionIdParam = 'default', syncPeriodDaysParam = null) {
  const hasSaved = await hasSessionSaved();
  if (!hasSaved) {
    return false;
  }

  await createWhatsAppSocket(sessionIdParam, syncPeriodDaysParam);
  return true;
}

/**
 * Salva configurações de sincronização
 */
export async function saveSyncSettingsExport(syncHistoryParam, syncPeriodDaysParam) {
  return await saveSyncSettings(syncHistoryParam, syncPeriodDaysParam);
}

/**
 * Carrega configurações de sincronização
 */
export async function loadSyncSettingsExport() {
  return await loadSyncSettings();
}

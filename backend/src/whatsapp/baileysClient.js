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
  MESSAGE_TYPES
} from '../services/messageService.js';
import { processMessageMedia } from '../services/mediaService.js';

let sock = null;
let connectionStatus = 'disconnected';
let qrCode = null;
let sessionId = 'default';
let io = null;
let saveCredsFunction = null;
let syncPeriodDays = 7; // Período de sincronização em dias (padrão: 7)

// Funções para persistência de sessão no banco de dados
async function saveAuthToDB(creds) {
  try {
    // Não salvar se creds for null ou undefined
    if (!creds) {
      logger.warn('Creds é null/undefined, não salvando no banco');
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

    logger.info('Auth salvo no banco com sucesso');
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
        logger.info('Nenhuma sessão salva no banco');
        return null;
      }
      logger.error('Erro ao carregar auth do banco:', error);
      throw error;
    }

    if (data) {
      logger.info('Auth carregado do banco com sucesso');
      return data.creds;
    }

    return null;
  } catch (error) {
    logger.error('Erro ao carregar auth do banco:', error);
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

    logger.info('Keys deletadas do banco com sucesso');
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
  logger.info('🔌 Socket.io instância definida no baileysClient');
}

/**
 * Cria o socket do WhatsApp
 */
export async function createWhatsAppSocket(sessionIdParam = 'default', syncPeriodDaysParam = 7) {
  sessionId = sessionIdParam;
  syncPeriodDays = syncPeriodDaysParam; // Define o período de sincronização

  logger.info('createWhatsAppSocket chamado', {
    sessionId,
    syncPeriodDaysParam,
    syncPeriodDays
  });

  try {
    logger.info(`Criando socket WhatsApp para sessão: ${sessionId}, período de sincronização: ${syncPeriodDays} dias`);

    // Usa useMultiFileAuthState para autenticação (padrão do Baileys)
    // No Railway, o volume está montado em /app/backend/auth_info
    const authPath = process.env.RAILWAY
      ? path.join('/app', 'backend', 'auth_info', sessionId)
      : path.join(__dirname, '..', '..', 'auth_info', sessionId);
    const authStateResult = await useMultiFileAuthState(authPath);

    const { state, saveCreds } = authStateResult;

    // Wrapper para saveCreds que também salva no banco de dados
    saveCredsFunction = async (creds) => {
      await saveCreds(creds);
      // Salvar também no banco de dados como backup
      try {
        await saveAuthToDB(creds);
      } catch (error) {
        logger.error('Erro ao salvar creds no banco (continuando com arquivo):', error);
      }
    };

    // Fetch the latest version of WA Web and Baileys
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`Usando WA v${version.join('.')}, isLatest: ${isLatest}`);

    // Configuração do logger
    const loggerBaileys = pino({
      level: 'warn'
    });

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
        // Implementar busca de mensagem no banco de dados
        // Por enquanto retorna null
        return null;
      }
    });

    // Configura eventos
    setupEvents(sock);

    logger.info('Socket WhatsApp criado com sucesso');
    return sock;
  } catch (error) {
    logger.error('Erro ao criar socket WhatsApp:', error.message);
    logger.error('Stack:', error.stack);
    throw error;
  }
}

/**
 * Configura os eventos do socket
 */
function setupEvents(socket) {
  logger.info('🎯 Configurando eventos do socket WhatsApp...');

  // Evento de atualização da conexão
  socket.ev.on('connection.update', async (update) => {
    logger.info('🔌 Evento connection.update:', {
      connection: update.connection,
      hasQR: !!update.qr,
      isNewLogin: update.isNewLogin
    });
    const { connection, lastDisconnect, isNewLogin, qr } = update;

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
      const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;

      // Log detalhado do motivo da desconexão
      logger.info('Conexão fechada:', {
        statusCode,
        error: lastDisconnect?.error?.message,
        isBoom: lastDisconnect?.error instanceof Boom,
        DisconnectReason_loggedOut: DisconnectReason.loggedOut,
        DisconnectReason_badSession: DisconnectReason.badSession,
        DisconnectReason_forbidden: DisconnectReason.forbidden
      });

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

      logger.info(`Motivo da desconexão: ${reason}, Reconectar: ${shouldReconnect}`);

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

        logger.info(`Tentando reconectar em ${delay}ms (tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        connectionStatus = 'connecting';
        emitConnectionStatus('connecting');

        setTimeout(() => {
          createWhatsAppSocket(sessionId);
        }, delay);
      } else {
        logger.info('Conexão encerrada permanentemente');
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
      logger.info('Conexão aberta com sucesso');
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
    logger.info('Credenciais atualizadas');
    await saveAuthState();
  });

  // Evento de atualização de mensagens
  logger.info('📝 Registrando evento messages.upsert...');
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    logger.info('📨 Evento messages.upsert recebido:', {
      messageCount: messages.length,
      type,
      firstMessageId: messages[0]?.key?.id,
      firstMessageRemoteJid: messages[0]?.key?.remoteJid
    });

    // Se é histórico (append), usa batching
    if (type === 'append' || messages.length > 10) {
      logger.info('📦 Usando batching para mensagens:', { count: messages.length, type });
      for (const message of messages) {
        addToMessageBatch(message, type);
      }
      return;
    }

    // Se é mensagem individual recente, processa imediatamente
    for (const message of messages) {
      const isFromMe = message.key.fromMe;
      logger.info('🔍 Processando mensagem individual:', { 
        messageId: message.key?.id, 
        isFromMe, 
        type,
        remoteJid: message.key?.remoteJid 
      });

      if (isFromMe && (type === 'append' || type === 'notify')) {
        // Mensagem enviada por nós - processa imediatamente
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );

        const messageId = message.key.id;
        const remoteJid = message.key.remoteJid;

        logger.info('Mensagem enviada por nós detectada:', { messageId, type });

        // Ignorar mensagens de grupo, status, newsletter e canais
        if (isGroupOrBroadcast(remoteJid)) {
          return;
        }

        const phone = remoteJid.split('@')[0];

        // Verificar se mensagem já existe
        const { data: existingMessage } = await supabase
          .from('messages')
          .select('id')
          .eq('message_id', messageId)
          .single();

        if (!existingMessage) {
          logger.info('Processando mensagem enviada:', { messageId, remoteJid });

          // Processar a mensagem (processWhatsAppMessage vai criar a conversa se necessário)
          const { processWhatsAppMessage, MESSAGE_TYPES } = await import('../services/messageService.js');

          logger.debug('Chamando processWhatsAppMessage com syncPeriodDays', { syncPeriodDays });

          const processedMessage = await processWhatsAppMessage(message, sock, syncPeriodDays);

          logger.info('Mensagem processada:', processedMessage ? 'Sucesso' : 'Falha', { messageId });

          // Se a mensagem foi processada, atualiza para garantir que é from_me = true
          if (processedMessage) {
            await supabase
              .from('messages')
              .update({ from_me: true })
              .eq('message_id', messageId);

            logger.info('Emitindo evento whatsapp:message para o frontend:', { 
              messageId, 
              conversation_id: processedMessage.conversation_id 
            });

            // Emitir evento imediatamente para o frontend (mesmo antes da mídia ser processada)
            if (io) {
              io.emit('whatsapp:message', {
                conversation_id: processedMessage.conversation_id,
                message: processedMessage
              });
            } else {
              logger.warn('Socket.io não disponível para emitir mensagem');
            }

            // Se tiver mídia, processa em background e atualiza depois
            if (message.message) {
              const messageTypeSaved = processedMessage.message_type;
              if ([MESSAGE_TYPES.IMAGE, MESSAGE_TYPES.AUDIO, MESSAGE_TYPES.VIDEO,
                   MESSAGE_TYPES.DOCUMENT, MESSAGE_TYPES.STICKER].includes(messageTypeSaved)) {
                // Processa mídia em background para não bloquear
                const { processMessageMedia } = await import('../services/mediaService.js');
                processMessageMedia(sock, message, messageTypeSaved, processedMessage.message_id)
                  .then(async (publicUrl) => {
                    // Atualiza a mensagem com a URL do Supabase
                    const { createClient } = await import('@supabase/supabase-js');
                    const supabaseClient = createClient(
                      process.env.SUPABASE_URL,
                      process.env.SUPABASE_SERVICE_KEY
                    );

                    const { error } = await supabaseClient
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
                  })
                  .catch(error => {
                    logger.error('Erro ao processar mídia:', error);
                  });
              }
            }
          }
        }
      } else if (!isFromMe) {
        // Mensagem recebida - processa imediatamente
        await handleIncomingMessage(message, io);
      }
    }
  });

  // Evento de atualização de status de mensagem (entregue, lida)
  socket.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      const { key, update: updateData } = update;
      const messageId = key.id;
      const remoteJid = key.remoteJid;

      logger.info('Atualização de status de mensagem recebida:', { 
        messageId, 
        remoteJid, 
        status: updateData.status,
        fromMe: key.fromMe 
      });

      // Status 2 = sent/received, Status 3 = delivered, Status 4 = read
      if (updateData.status === 4) {
        // Mensagem lida
        logger.info('Marcando mensagem como lida:', messageId);
        try {
          await updateMessageStatus(messageId, 'read');
          
          // Emitir evento para o frontend
          if (io) {
            logger.info('Emitindo evento whatsapp:message_status (read) para o frontend:', { messageId });
            io.emit('whatsapp:message_status', {
              message_id: messageId,
              status: 'read'
            });
            logger.info('Evento whatsapp:message_status (read) emitido com sucesso');
          } else {
            logger.warn('Socket.io não disponível para emitir status');
          }
        } catch (error) {
          logger.error('Erro ao marcar mensagem como lida:', error);
        }
      } else if (updateData.status === 3) {
        // Mensagem entregue
        logger.info('Marcando mensagem como entregue:', messageId);
        try {
          await updateMessageStatus(messageId, 'delivered');
          
          // Emitir evento para o frontend
          if (io) {
            logger.info('Emitindo evento whatsapp:message_status (delivered) para o frontend:', { messageId });
            io.emit('whatsapp:message_status', {
              message_id: messageId,
              status: 'delivered'
            });
            logger.info('Evento whatsapp:message_status (delivered) emitido com sucesso');
          } else {
            logger.warn('Socket.io não disponível para emitir status');
          }
        } catch (error) {
          logger.error('Erro ao marcar mensagem como entregue:', error);
        }
      } else if (updateData.status === 2) {
        // Mensagem enviada/recebida pelo servidor
        logger.info('Mensagem enviada ao servidor:', messageId);
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

  // Evento de histórico sincronizado
  socket.ev.on('messaging-history.set', async ({ messages }) => {
    // Processar histórico apenas se houver mensagens
    if (!messages || messages.length === 0) {
      return;
    }
    
    logger.info(`Processando ${messages.length} mensagens do histórico`);
    
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

  logger.info('✅ Todos os eventos do socket WhatsApp foram configurados');
}

/**
 * Salva o auth state
 */
async function saveAuthState() {
  try {
    if (saveCredsFunction) {
      await saveCredsFunction();
      logger.info('Auth state salvo');
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

  logger.debug('processMessageBatch chamado', {
    batchSize: batchToProcess.length,
    syncPeriodDays
  });

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

      // Ignorar mensagens de grupo, status, newsletter e canais
      if (isGroupOrBroadcast(remoteJid)) {
        continue;
      }

      const messageId = message.key.id;

      // Verificar se mensagem já existe
      const { data: existingMessage } = await supabase
        .from('messages')
        .select('id')
        .eq('message_id', messageId)
        .single();

      if (existingMessage) continue;

      // Processar mensagem (processWhatsAppMessage vai criar a conversa se necessário)
      const { processWhatsAppMessage } = await import('../services/messageService.js');

      logger.debug('Chamando processWhatsAppMessage no batch', {
        messageId,
        syncPeriodDays
      });

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

    logger.debug(`Batch processado: ${processedCount}/${batchToProcess.length} mensagens salvas`);

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
 */
async function handleIncomingMessage(message) {
  try {
    const { key, message: msg, pushName, messageTimestamp } = message;
    const remoteJid = key.remoteJid;

    logger.info('📥 handleIncomingMessage chamada:', { 
      messageId: key?.id, 
      remoteJid, 
      hasMessage: !!msg,
      pushName 
    });

    // Ignorar mensagens de grupo, status, newsletter e canais
    if (isGroupOrBroadcast(remoteJid)) {
      logger.info('🚫 Mensagem de grupo/broadcast ignorada:', remoteJid);
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
      messageType = 'localização';
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
    const messageId = key.id;

    // Determinar se é mensagem de mídia
    const isMedia = msg.imageMessage || msg.audioMessage || msg.videoMessage ||
                    msg.documentMessage || msg.stickerMessage;

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
        id: null, // Será preenchido após salvar
        message_id: messageId,
        conversation_id: conversation.id,
        from_me: false,
        message_type: msg.conversation || msg.extendedTextMessage ? 'text' : 'unknown',
        content: msg.conversation || msg.extendedTextMessage?.text || '',
        timestamp: new Date(messageTimestamp * 1000).toISOString(),
        is_read: false,
        is_delivered: false
      };

      io.emit('whatsapp:message', {
        conversation_id: conversation.id,
        message: tempMessage,
        is_temp: true // Flag para indicar que é mensagem temporária
      });
    }

    // Processa e salva a mensagem no banco de dados em background (não await)
    processWhatsAppMessage(message, sock, syncPeriodDays)
      .then(savedMessage => {
        if (!savedMessage) return;

        // Emitir evento atualizado com a mensagem salva
        if (io) {
          io.emit('whatsapp:message', {
            conversation_id: savedMessage.conversation_id,
            message: savedMessage,
            is_temp: false
          });
        }

        // Se tiver mídia, processa em background
        if (message.message) {
          const messageTypeSaved = savedMessage.message_type;
          if ([MESSAGE_TYPES.IMAGE, MESSAGE_TYPES.AUDIO, MESSAGE_TYPES.VIDEO,
               MESSAGE_TYPES.DOCUMENT, MESSAGE_TYPES.STICKER].includes(messageTypeSaved)) {
            processMessageMedia(sock, message, messageTypeSaved, savedMessage.message_id)
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
                  // Emitir evento de atualização quando a mídia for processada
                  if (io) {
                    io.emit('whatsapp:message_updated', {
                      conversation_id: savedMessage.conversation_id,
                      message_id: savedMessage.message_id,
                      content: publicUrl
                    });
                  }
                }
              })
              .catch(error => {
                logger.error('Erro ao processar mídia:', error);
              });
          }
        }
      })
      .catch(error => {
        logger.error('Erro ao processar mensagem em background:', error);
      });
  } catch (error) {
    // Tratar erro de Bad MAC silenciosamente (erro de criptografia comum do Baileys)
    if (error.message && error.message.includes('Bad MAC')) {
      logger.warn('Erro de criptografia (Bad MAC) - ignorando mensagem');
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
      logger.info('Desconectando socket...');
      await sock.end();
      sock = null;
      connectionStatus = 'disconnected';
      qrCode = null;
      emitConnectionStatus('disconnected');
      logger.info('Socket desconectado');
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

    logger.info('Sessão removida com sucesso');
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
export async function reconnectWithSavedSession(sessionIdParam = 'default', syncPeriodDaysParam = 7) {
  const hasSaved = await hasSessionSaved();
  if (!hasSaved) {
    logger.info('Nenhuma sessão salva encontrada');
    return false;
  }

  logger.info('Sessão salva encontrada, tentando reconectar...');
  await createWhatsAppSocket(sessionIdParam, syncPeriodDaysParam);
  return true;
}

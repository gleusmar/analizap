import { logger } from '../utils/logger.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Obtém todas as mensagens pré-definidas do usuário
 */
export async function getPredefinedMessages(req, res) {
  try {
    const userId = req.user.id;
    
    logger.info('Buscando mensagens pré-definidas para usuário:', { userId, email: req.user.email });

    const { data: messages, error } = await supabase
      .from('predefined_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Erro ao buscar mensagens pré-definidas:', error);
      throw error;
    }

    logger.info('Mensagens encontradas:', { count: messages?.length || 0 });
    res.json({ data: messages || [] });
  } catch (error) {
    logger.error('Erro ao buscar mensagens pré-definidas:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens pré-definidas' });
  }
}

/**
 * Cria uma nova mensagem pré-definida
 */
export async function createPredefinedMessage(req, res) {
  try {
    const userId = req.user.id;
    const { shortcut, content } = req.body;

    logger.info('Criando mensagem pré-definida:', { 
      userId, 
      shortcut: shortcut?.substring(0, 30),
      email: req.user.email 
    });

    // Verificar se o usuário existe no banco
    const { data: userExists, error: userCheckError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userCheckError || !userExists) {
      logger.error('Usuário não encontrado no banco:', { userId, error: userCheckError });
      return res.status(400).json({ error: 'Usuário não encontrado' });
    }

    logger.info('Usuário verificado com sucesso, criando mensagem...');

    const { data: message, error } = await supabase
      .from('predefined_messages')
      .insert({
        user_id: userId,
        shortcut,
        content
      })
      .select()
      .single();

    if (error) {
      logger.error('Erro ao criar mensagem pré-definida:', error);
      throw error;
    }

    logger.info(`Mensagem pré-definida criada: ${message.id}`);
    res.json({ data: message });
  } catch (error) {
    logger.error('Erro ao criar mensagem pré-definida:', error);
    res.status(500).json({ error: 'Erro ao criar mensagem pré-definida' });
  }
}

/**
 * Atualiza uma mensagem pré-definida
 */
export async function updatePredefinedMessage(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const { shortcut, content } = req.body;

    logger.info(`Atualizando mensagem pré-definida ${messageId}`);

    const { data: message, error } = await supabase
      .from('predefined_messages')
      .update({
        shortcut,
        content
      })
      .eq('id', messageId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Erro ao atualizar mensagem pré-definida:', error);
      throw error;
    }

    logger.info(`Mensagem pré-definida atualizada: ${messageId}`);
    res.json({ data: message });
  } catch (error) {
    logger.error('Erro ao atualizar mensagem pré-definida:', error);
    res.status(500).json({ error: 'Erro ao atualizar mensagem pré-definida' });
  }
}

/**
 * Exclui uma mensagem pré-definida
 */
export async function deletePredefinedMessage(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    logger.info(`Excluindo mensagem pré-definida ${messageId}`);

    const { error } = await supabase
      .from('predefined_messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', userId);

    if (error) {
      logger.error('Erro ao excluir mensagem pré-definida:', error);
      throw error;
    }

    logger.info(`Mensagem pré-definida excluída: ${messageId}`);
    res.json({ message: 'Mensagem pré-definida excluída com sucesso' });
  } catch (error) {
    logger.error('Erro ao excluir mensagem pré-definida:', error);
    res.status(500).json({ error: 'Erro ao excluir mensagem pré-definida' });
  }
}

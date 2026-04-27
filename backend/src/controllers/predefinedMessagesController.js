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
    

    const { data: messages, error } = await supabase
      .from('predefined_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Erro ao buscar mensagens pré-definidas:', error);
      throw error;
    }

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


    const { error } = await supabase
      .from('predefined_messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', userId);

    if (error) {
      logger.error('Erro ao excluir mensagem pré-definida:', error);
      throw error;
    }

    res.json({ message: 'Mensagem pré-definida excluída com sucesso' });
  } catch (error) {
    logger.error('Erro ao excluir mensagem pré-definida:', error);
    res.status(500).json({ error: 'Erro ao excluir mensagem pré-definida' });
  }
}

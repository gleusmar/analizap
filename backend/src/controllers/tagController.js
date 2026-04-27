import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const tagController = {
  async getAll(req, res) {
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('name');

      if (error) throw error;

      res.json(data);
    } catch (error) {
      logger.error('Erro ao listar tags', { error: error.message }, req.user?.id, 'TAGS_LIST_ERROR', req);
      res.status(500).json({ error: 'Erro ao listar tags' });
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Tag não encontrada' });
      }

      res.json(data);
    } catch (error) {
      logger.error('Erro ao buscar tag', { error: error.message }, req.user?.id, 'TAG_GET_ERROR', req);
      res.status(500).json({ error: 'Erro ao buscar tag' });
    }
  },

  async create(req, res) {
    try {
      const { name, color, description } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Nome é obrigatório' });
      }

      const tagData = {
        name,
        color: color || '#0088cc',
        description: description || null,
        is_active: true,
        created_by: req.user?.id,
        modified_by: req.user?.id
      };

      const { data, error } = await supabase
        .from('tags')
        .insert(tagData)
        .select('*')
        .single();

      if (error) throw error;

      res.status(201).json(data);
    } catch (error) {
      logger.error('Erro ao criar tag', { error: error.message }, req.user?.id, 'TAG_CREATE_ERROR', req);
      
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Nome de tag já existe' });
      }
      
      res.status(500).json({ error: 'Erro ao criar tag' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, color, description, is_active } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Nome é obrigatório' });
      }

      const updateData = {
        name,
        color: color || '#0088cc',
        description: description || null,
        is_active: is_active !== undefined ? is_active : true,
        modified_by: req.user?.id
      };

      const { data, error } = await supabase
        .from('tags')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Tag não encontrada' });
      }

      res.json(data);
    } catch (error) {
      logger.error('Erro ao atualizar tag', { error: error.message }, req.user?.id, 'TAG_UPDATE_ERROR', req);
      
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Nome de tag já existe' });
      }
      
      res.status(500).json({ error: 'Erro ao atualizar tag' });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;

      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', id);

      if (error) throw error;

      res.json({ success: true });
    } catch (error) {
      logger.error('Erro ao excluir tag', { error: error.message }, req.user?.id, 'TAG_DELETE_ERROR', req);
      res.status(500).json({ error: 'Erro ao excluir tag' });
    }
  },

  // Buscar tags de uma conversa
  async getByConversation(req, res) {
    try {
      const { conversationId } = req.params;

      const { data, error } = await supabase
        .from('conversation_tags')
        .select(`
          tag_id,
          tags (
            id,
            name,
            color,
            description
          )
        `)
        .eq('conversation_id', conversationId);

      if (error) throw error;

      const tags = data.map(ct => ct.tags);
      res.json(tags);
    } catch (error) {
      logger.error('Erro ao buscar tags da conversa', { error: error.message }, req.user?.id, 'CONVERSATION_TAGS_ERROR', req);
      res.status(500).json({ error: 'Erro ao buscar tags da conversa' });
    }
  },

  // Adicionar tag a uma conversa
  async addTagToConversation(req, res) {
    try {
      const { conversationId, tagId } = req.body;

      if (!conversationId || !tagId) {
        return res.status(400).json({ error: 'conversationId e tagId são obrigatórios' });
      }

      const { data, error } = await supabase
        .from('conversation_tags')
        .insert({
          conversation_id: conversationId,
          tag_id: tagId,
          assigned_by: req.user?.id
        })
        .select('*')
        .single();

      if (error) throw error;

      res.status(201).json(data);
    } catch (error) {
      logger.error('Erro ao adicionar tag à conversa', { error: error.message }, req.user?.id, 'ADD_TAG_ERROR', req);
      res.status(500).json({ error: 'Erro ao adicionar tag à conversa' });
    }
  },

  // Remover tag de uma conversa
  async removeTagFromConversation(req, res) {
    try {
      const { conversationId, tagId } = req.params;

      const { error } = await supabase
        .from('conversation_tags')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('tag_id', tagId);

      if (error) throw error;

      res.json({ success: true });
    } catch (error) {
      logger.error('Erro ao remover tag da conversa', { error: error.message }, req.user?.id, 'REMOVE_TAG_ERROR', req);
      res.status(500).json({ error: 'Erro ao remover tag da conversa' });
    }
  }
};

import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const departmentController = {
  async getAll(req, res) {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select(`
          *,
          created_by:created_by(id, name),
          modified_by:modified_by(id, name)
        `)
        .order('name');

      if (error) throw error;

      res.json(data);
    } catch (error) {
      logger.error('Erro ao listar departamentos', { error: error.message }, req.user?.id, 'DEPARTMENTS_LIST_ERROR', req);
      res.status(500).json({ error: 'Erro ao listar departamentos' });
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('departments')
        .select(`
          *,
          created_by:created_by(id, name),
          modified_by:modified_by(id, name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Departamento não encontrado' });
      }

      res.json(data);
    } catch (error) {
      logger.error('Erro ao buscar departamento', { error: error.message }, req.user?.id, 'DEPARTMENT_GET_ERROR', req);
      res.status(500).json({ error: 'Erro ao buscar departamento' });
    }
  },

  async create(req, res) {
    try {
      const { name, description, is_active } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Nome é obrigatório' });
      }

      const departmentData = {
        name,
        description: description || null,
        is_active: is_active !== undefined ? is_active : true,
        created_by: req.user.id,
        modified_by: req.user.id
      };

      const { data, error } = await supabase
        .from('departments')
        .insert(departmentData)
        .select()
        .single();

      if (error) throw error;

      res.status(201).json(data);
    } catch (error) {
      logger.error('Erro ao criar departamento', { error: error.message }, req.user?.id, 'DEPARTMENT_CREATE_ERROR', req);
      res.status(500).json({ error: 'Erro ao criar departamento' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, description, is_active } = req.body;

      const updateData = {
        modified_by: req.user.id,
        modified_at: new Date().toISOString()
      };

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (is_active !== undefined) updateData.is_active = is_active;

      const { data, error } = await supabase
        .from('departments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Departamento não encontrado' });
      }

      res.json(data);
    } catch (error) {
      logger.error('Erro ao atualizar departamento', { error: error.message }, req.user?.id, 'DEPARTMENT_UPDATE_ERROR', req);
      res.status(500).json({ error: 'Erro ao atualizar departamento' });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;

      // Verificar se há usuários neste departamento
      const { data: users } = await supabase
        .from('users')
        .select('id')
        .eq('department_id', id)
        .limit(1);

      if (users && users.length > 0) {
        return res.status(400).json({ 
          error: 'Não é possível excluir departamento com usuários associados' 
        });
      }

      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      res.json({ success: true });
    } catch (error) {
      logger.error('Erro ao excluir departamento', { error: error.message }, req.user?.id, 'DEPARTMENT_DELETE_ERROR', req);
      res.status(500).json({ error: 'Erro ao excluir departamento' });
    }
  }
};

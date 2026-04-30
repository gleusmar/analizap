import { supabase } from '../config/supabase.js';
import { authService } from '../services/authService.js';
import { logger } from '../utils/logger.js';

export const userController = {
  async getAll(req, res) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          email,
          name,
          nickname,
          avatar,
          has_signature,
          role,
          is_active,
          created_at,
          modified_at,
          department_id,
          department:department_id(id, name),
          created_by:created_by(id, name),
          modified_by:modified_by(id, name)
        `)
        .order('name');

      if (error) throw error;

      // Remover password_hash da resposta e adicionar contagem de sessões ativas
      const usersWithoutPassword = await Promise.all(data.map(async user => {
        const { password_hash, ...userWithoutPassword } = user;

        // SETTINGS: Contar sessões ativas do usuário
        const { data: sessions } = await supabase
          .from('user_sessions')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString());

        return {
          ...userWithoutPassword,
          is_online: sessions && sessions.length > 0,
          active_sessions_count: sessions?.length || 0
        };
      }));

      res.json(usersWithoutPassword);
    } catch (error) {
      logger.error('Erro ao listar usuários', { error: error.message }, req.user?.id, 'USERS_LIST_ERROR', req);
      res.status(500).json({ error: 'Erro ao listar usuários' });
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          email,
          name,
          nickname,
          avatar,
          has_signature,
          role,
          is_active,
          created_at,
          modified_at,
          department_id,
          department:department_id(id, name),
          created_by:created_by(id, name),
          modified_by:modified_by(id, name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const { password_hash, ...userWithoutPassword } = data;

      res.json(userWithoutPassword);
    } catch (error) {
      logger.error('Erro ao buscar usuário', { error: error.message }, req.user?.id, 'USER_GET_ERROR', req);
      res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
  },

  async create(req, res) {
    try {
      const { name, email, nickname, password, role, department_id, avatar, has_signature } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
      }

      // Hash da senha
      const bcrypt = (await import('bcrypt')).default;
      const password_hash = await bcrypt.hash(password, 10);

      const userData = {
        name,
        email,
        nickname: nickname || null,
        avatar: avatar || null,
        has_signature: has_signature || false,
        password_hash,
        role: role || 'atendente',
        department_id: department_id || null,
        is_active: true,
        created_by: req.user?.id,
        modified_by: req.user?.id
      };

      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select(`
          id,
          email,
          name,
          nickname,
          avatar,
          has_signature,
          role,
          is_active,
          created_at,
          modified_at,
          department_id,
          department:department_id(id, name),
          created_by:created_by(id, name),
          modified_by:modified_by(id, name)
        `)
        .single();

      if (error) throw error;

      res.status(201).json(data);
    } catch (error) {
      logger.error('Erro ao criar usuário', { error: error.message }, req.user?.id, 'USER_CREATE_ERROR', req);
      
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Email já cadastrado' });
      }
      
      res.status(500).json({ error: 'Erro ao criar usuário' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, nickname, role, department_id, is_active, avatar, has_signature } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Nome é obrigatório' });
      }

      const updateData = {
        name,
        nickname: nickname || null,
        avatar: avatar || null,
        has_signature: has_signature !== undefined ? has_signature : false,
        role: role || 'atendente',
        department_id: department_id || null,
        is_active: is_active !== undefined ? is_active : true,
        modified_by: req.user?.id,
        modified_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', id)
        .select(`
          id,
          email,
          name,
          nickname,
          avatar,
          has_signature,
          role,
          is_active,
          created_at,
          modified_at,
          department_id,
          department:department_id(id, name),
          created_by:created_by(id, name),
          modified_by:modified_by(id, name)
        `)
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.json(data);
    } catch (error) {
      logger.error('Erro ao atualizar usuário', { error: error.message }, req.user?.id, 'USER_UPDATE_ERROR', req);
      
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Email já cadastrado' });
      }
      
      res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;

      // Não permitir excluir a si mesmo
      if (id === req.user.id) {
        return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
      }

      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id);

      if (error) throw error;

      res.json({ success: true });
    } catch (error) {
      logger.error('Erro ao excluir usuário', { error: error.message }, req.user?.id, 'USER_DELETE_ERROR', req);
      res.status(500).json({ error: 'Erro ao excluir usuário' });
    }
  },

  async resetPassword(req, res) {
    try {
      const { id } = req.params;
      const { new_password } = req.body;

      if (!new_password) {
        return res.status(400).json({ error: 'Nova senha é obrigatória' });
      }

      // Gerar hash da nova senha
      const password_hash = await authService.hashPassword(new_password);

      const { data, error } = await supabase
        .from('users')
        .update({ 
          password_hash,
          modified_by: req.user.id,
          modified_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('id, email, name')
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Desativar todas as sessões do usuário para forçar novo login
      await supabase
        .from('user_sessions')
        .update({ is_active: false })
        .eq('user_id', id);

      res.json({ success: true, message: 'Senha resetada com sucesso' });
    } catch (error) {
      logger.error('Erro ao resetar senha', { error: error.message }, req.user?.id, 'USER_PASSWORD_RESET_ERROR', req);
      res.status(500).json({ error: 'Erro ao resetar senha' });
    }
  },

  async toggleActive(req, res) {
    try {
      const { id } = req.params;

      // Não permitir desativar a si mesmo
      if (id === req.user.id) {
        return res.status(400).json({ error: 'Não é possível desativar seu próprio usuário' });
      }

      // Buscar estado atual
      const { data: currentUser } = await supabase
        .from('users')
        .select('is_active')
        .eq('id', id)
        .single();

      if (!currentUser) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Inverter estado
      const newStatus = !currentUser.is_active;

      const { data, error } = await supabase
        .from('users')
        .update({ 
          is_active: newStatus,
          modified_by: req.user.id,
          modified_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('id, email, name, is_active')
        .single();

      if (error) throw error;

      res.json(data);
    } catch (error) {
      logger.error('Erro ao alterar status do usuário', { error: error.message }, req.user?.id, 'USER_STATUS_CHANGE_ERROR', req);
      res.status(500).json({ error: 'Erro ao alterar status do usuário' });
    }
  }
};

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

export const authService = {
  async login(email, password, req = null) {
    try {
      // Buscar usuário no banco
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, password_hash, name, role, is_active')
        .eq('email', email)
        .single();

      if (error || !user) {
        throw new Error('Credenciais inválidas');
      }

      if (!user.is_active) {
        throw new Error('Usuário desativado');
      }

      // Verificar senha
      const passwordMatch = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatch) {
        throw new Error('Credenciais inválidas');
      }

      // Gerar token JWT
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Criar sessão no banco
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { error: sessionError } = await supabase
        .from('user_sessions')
        .insert({
          user_id: user.id,
          token: token,
          expires_at: expiresAt.toISOString(),
          is_active: true
        });

      if (sessionError) {
        console.error('Erro ao criar sessão:', sessionError);
        // Continuar mesmo se falhar a criação da sessão
      }

      // Retornar dados do usuário (sem senha)
      const { password_hash, ...userWithoutPassword } = user;

      return {
        token,
        user: userWithoutPassword
      };
    } catch (error) {
      throw error;
    }
  },

  async logout(token, userId = null, req = null) {
    try {
      // Desativar sessão no banco
      const { error } = await supabase
        .from('user_sessions')
        .update({ is_active: false })
        .eq('token', token);

      if (error) {
        console.error('Erro ao desativar sessão:', error);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  },

  async logoutAllSessions(userId, req = null) {
    try {
      // Desativar todas as sessões do usuário
      const { error } = await supabase
        .from('user_sessions')
        .update({ is_active: false })
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao desativar sessões:', error);
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  },

  async hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
  },

  verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
  }
};

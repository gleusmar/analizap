import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET');
}

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    logger.logUnauthorizedAccess(null, req.path, req);
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verificar se o usuário existe no banco
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', decoded.id)
      .single();

    if (userError || !user) {
      logger.warn('Usuário não encontrado no banco', {
        userId: decoded.id,
        email: decoded.email
      });
      // Limpar sessões inválidas
      await supabase
        .from('user_sessions')
        .update({ is_active: false })
        .eq('token', token);
      return res.status(403).json({ error: 'Usuário não encontrado. Por favor, faça login novamente.' });
    }
    
    // Verificar se a sessão ainda está ativa no banco
    const { data: session, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (error || !session) {
      logger.warn('Sessão inválida ou expirada', {
        userId: decoded.id,
        email: user.email
      }, decoded.id, 'AUTH_SESSION_INVALID', req);
      return res.status(403).json({ error: 'Sessão inválida ou expirada' });
    }

    // Verificar se o token expirou
    if (new Date(session.expires_at) < new Date()) {
      // Desativar sessão
      await supabase
        .from('user_sessions')
        .update({ is_active: false })
        .eq('id', session.id);

      logger.warn('Sessão expirada', {
        userId: decoded.id,
        email: decoded.email
      }, decoded.id, 'AUTH_SESSION_EXPIRED', req);
      return res.status(403).json({ error: 'Sessão expirada' });
    }

    req.user = decoded;
    req.sessionId = session.id;

    next();
  } catch (err) {
    logger.logUnauthorizedAccess(null, req.path, req);
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }
};

export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.logUnauthorizedAccess(null, req.path, req);
      return res.status(401).json({ error: 'Não autenticado' });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Tentativa de acesso sem permissão', {
        userId: req.user.id,
        email: req.user.email,
        role: req.user.role,
        requiredRoles: roles,
        endpoint: req.path
      }, req.user.id, 'AUTH_PERMISSION_DENIED', req);
      return res.status(403).json({ error: 'Permissão insuficiente' });
    }

    next();
  };
};

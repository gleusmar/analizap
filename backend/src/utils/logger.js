import { supabase } from '../config/supabase.js';

class Logger {
  constructor() {
    this.colors = {
      reset: '\x1b[0m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    };
  }

  colorize(color, text) {
    return `${this.colors[color]}${text}${this.colors.reset}`;
  }

  formatTimestamp() {
    return new Date().toISOString();
  }

  formatMessage(level, message, data = {}) {
    const timestamp = this.formatTimestamp();
    const dataStr = Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message} ${dataStr}`;
  }

  async logToDatabase(userId, action, description, status, metadata = {}, req = null) {
    try {
      const logData = {
        user_id: userId || null,
        action,
        description,
        status,
        metadata,
        ip_address: req?.clientIP || req?.ip || req?.socket?.remoteAddress || null,
        user_agent: req?.headers?.['user-agent'] || null
      };

      await supabase.from('action_logs').insert(logData);
    } catch (error) {
      console.error('Erro ao salvar log no banco:', error);
    }
  }

  info(message, data = {}, userId = null, action = null, req = null) {
    const formatted = this.formatMessage('info', message, data);
    console.log(this.colorize('cyan', formatted));
    
    if (action) {
      this.logToDatabase(userId, action, message, 'success', data, req);
    }
  }

  error(message, data = {}, userId = null, action = null, req = null) {
    const formatted = this.formatMessage('error', message, data);
    console.error(this.colorize('red', formatted));
    
    if (action) {
      this.logToDatabase(userId, action, message, 'failed', data, req);
    }
  }

  warn(message, data = {}, userId = null, action = null, req = null) {
    const formatted = this.formatMessage('warn', message, data);
    console.warn(this.colorize('yellow', formatted));
    
    if (action) {
      this.logToDatabase(userId, action, message, 'warning', data, req);
    }
  }

  debug(message, data = {}) {
    const formatted = this.formatMessage('debug', message, data);
    console.log(this.colorize('magenta', formatted));
  }

  success(message, data = {}, userId = null, action = null, req = null) {
    const formatted = this.formatMessage('success', message, data);
    console.log(this.colorize('green', formatted));
    
    if (action) {
      this.logToDatabase(userId, action, message, 'success', data, req);
    }
  }

  // Métodos específicos para autenticação
  logLogin(userId, email, success, req) {
    const action = 'AUTH_LOGIN';
    const status = success ? 'success' : 'failed';
    const message = success 
      ? `Usuário ${email} fez login com sucesso`
      : `Tentativa de login falhou para ${email}`;
    
    this[success ? 'success' : 'warn'](message, { email }, userId, action, req);
  }

  logLogout(userId, email, req) {
    const action = 'AUTH_LOGOUT';
    const message = `Usuário ${email} fez logout`;
    this.info(message, { email }, userId, action, req);
  }

  logAccess(userId, email, endpoint, req) {
    const action = 'AUTH_ACCESS';
    const message = `Usuário ${email} acessou ${endpoint}`;
    this.info(message, { endpoint }, userId, action, req);
  }

  logUnauthorizedAccess(email, endpoint, req) {
    const action = 'AUTH_UNAUTHORIZED';
    const message = `Tentativa de acesso não autorizado a ${endpoint}`;
    this.warn(message, { email, endpoint }, null, action, req);
  }
}

export const logger = new Logger();

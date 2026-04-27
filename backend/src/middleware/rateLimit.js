// Store em memória para rate limiting (em produção, usar Redis)
const rateLimitStore = new Map();

export const rateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutos
    max = 100, // máximo de requisições
    message = 'Muitas requisições, tente novamente mais tarde',
    skipSuccessfulRequests = false
  } = options;

  return (req, res, next) => {
    const key = req.clientIP || req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    // Limpar entradas antigas
    const windowStart = now - windowMs;
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, {
        count: 0,
        resetTime: now + windowMs,
        requests: []
      });
    }

    const data = rateLimitStore.get(key);
    
    // Remover requisições antigas
    data.requests = data.requests.filter(timestamp => timestamp > windowStart);
    data.count = data.requests.length;
    
    // Verificar se resetou a janela
    if (now > data.resetTime) {
      data.count = 0;
      data.resetTime = now + windowMs;
      data.requests = [];
    }

    // Incrementar contador
    data.count++;
    data.requests.push(now);
    
    // Adicionar headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - data.count));
    res.setHeader('X-RateLimit-Reset', new Date(data.resetTime).toISOString());

    // Verificar limite
    if (data.count > max) {
      return res.status(429).json({
        error: message,
        retryAfter: Math.ceil((data.resetTime - now) / 1000)
      });
    }

    next();
  };
};

// Rate limit específico para login (mais restrito)
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: process.env.NODE_ENV === 'development' ? 100 : 5, // 100 em desenvolvimento, 5 em produção
  message: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
});

// Rate limit para API geral
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skipSuccessfulRequests: true // Só logar falhas
});

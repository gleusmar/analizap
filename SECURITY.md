# Documentação de Segurança - Analizap

## Visão Geral

Sistema de segurança implementado com logging, rate limiting, isolamento de sessões e notificações toast.

## Funcionalidades Implementadas

### 1. Sistema de Logs (Backend)

**Arquivo:** `/backend/src/utils/logger.js`

**Funcionalidades:**
- Logs coloridos no terminal (info, error, warn, success)
- Logs persistentes no banco de dados (tabela `action_logs`)
- Tracking de IP e User-Agent
- Métodos específicos para autenticação:
  - `logLogin()` - Login bem-sucedido/falhado
  - `logLogout()` - Logout do usuário
  - `logAccess()` - Acesso a endpoints
  - `logUnauthorizedAccess()` - Tentativas não autorizadas

**Exemplo de output no terminal:**
```
[2025-04-09T14:30:00.000Z] [SUCCESS] Usuário admin@analizap.com fez login com sucesso {"email":"admin@analizap.com"}
[2025-04-09T14:35:00.000Z] [WARN] Tentativa de acesso não autorizada a /api/admin/users {"email":"unknown","endpoint":"/api/admin/users"}
```

### 2. Tabela de Logs (Banco de Dados)

**Arquivo:** `/database/logs.sql`

**Estrutura da tabela `action_logs`:**
```sql
- id (UUID, PK)
- user_id (UUID, FK users)
- action (VARCHAR 100) - Tipo de ação
- description (TEXT) - Descrição detalhada
- ip_address (VARCHAR 45) - IP do usuário
- user_agent (TEXT) - Browser/app
- status (VARCHAR 20) - success/failed/warning
- metadata (JSONB) - Dados adicionais
- created_at (TIMESTAMP)
```

**Ações registradas:**
- `AUTH_LOGIN` - Tentativas de login
- `AUTH_LOGOUT` - Logout
- `AUTH_ACCESS` - Acesso a endpoints
- `AUTH_UNAUTHORIZED` - Acesso não autorizado
- `AUTH_SESSION_INVALID` - Sessão inválida
- `AUTH_SESSION_EXPIRED` - Sessão expirada
- `AUTH_PERMISSION_DENIED` - Permissão negada
- `RATE_LIMIT_EXCEEDED` - Rate limit atingido

### 3. Rate Limiting

**Arquivo:** `/backend/src/middleware/rateLimit.js`

**Configurações:**
- **Login:** 5 tentativas a cada 15 minutos
- **API geral:** 100 requisições a cada 15 minutos
- Store em memória (produção: usar Redis)

**Headers de resposta:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2025-04-09T14:45:00.000Z
```

**Resposta ao exceder limite:**
```json
{
  "error": "Muitas tentativas de login. Tente novamente em 15 minutos.",
  "retryAfter": 900
}
```

### 4. Middleware JWT Aprimorado

**Arquivo:** `/backend/src/middleware/auth.js`

**Melhorias:**
- Verificação de sessão no banco a cada requisição
- Validação de expiração de sessão
- Desativação automática de sessões expiradas
- Logs de todos os acessos e tentativas não autorizadas
- Verificação de roles com logging

**Fluxo de autenticação:**
1. Token JWT é verificado
2. Sessão é buscada no banco
3. Expiração da sessão é validada
4. Acesso é logado
5. Requisição prossegue ou é bloqueada

### 5. Isolamento de Sessões

**Implementação:**
- Cada login cria uma sessão única no banco
- Sessões têm expiração (24h)
- Logout desativa a sessão específica
- Endpoint `/auth/logout-all` desativa todas as sessões do usuário
- Middleware verifica sessão ativa a cada requisição

**Tabela `user_sessions`:**
```sql
- id (UUID, PK)
- user_id (UUID, FK users)
- token (VARCHAR 500)
- expires_at (TIMESTAMP)
- is_active (BOOLEAN)
- created_at (TIMESTAMP)
```

### 6. Toast Notifications (Frontend)

**Arquivo:** `/frontend/src/components/Toast.jsx`

**Tipos de toast:**
- `success` - Verde com ✓
- `error` - Vermelho com ✕
- `warning` - Amarelo com ⚠
- `info` - Azul com ℹ

**Uso:**
```javascript
const { success, error, warning, info } = useToast();

success('Login realizado com sucesso!');
error('Erro ao fazer login');
warning('Atenção: sessão expirando');
info('Nova mensagem recebida');
```

**Integração:**
- Página de Login: Erros de login com tratamento específico para rate limit
- Dashboard: Logout com feedback visual
- App.jsx: ToastProvider envolve toda a aplicação

### 7. Captura de IP

**Arquivo:** `/backend/src/server.js`

**Implementação:**
- Middleware captura IP antes de outras rotas
- Suporta proxies (x-forwarded-for)
- IP é armazenado em todos os logs
- Usado para rate limiting

## Setup Inicial

### 1. Executar SQL no Supabase

```sql
-- No SQL Editor do Supabase, execute:
database/schema.sql
database/logs.sql
database/insert_admin.sql
```

### 2. Instalar Dependências (Backend)

```bash
cd backend
npm install
```

### 3. Instalar Dependências (Frontend)

```bash
cd frontend
npm install
```

### 4. Iniciar Servidores

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## Monitoramento

### Ver Logs no Terminal

O backend exibe logs coloridos em tempo real:
- **Ciano:** Informações gerais
- **Verde:** Sucesso
- **Amarelo:** Avisos
- **Vermelho:** Erros

### Consultar Logs no Banco

```sql
-- Ver todos os logs
SELECT * FROM action_logs ORDER BY created_at DESC LIMIT 100;

-- Ver logs de um usuário específico
SELECT * FROM action_logs WHERE user_id = 'user-id' ORDER BY created_at DESC;

-- Ver tentativas de login falhadas
SELECT * FROM action_logs WHERE action = 'AUTH_LOGIN' AND status = 'failed';

-- Ver acessos não autorizados
SELECT * FROM action_logs WHERE action = 'AUTH_UNAUTHORIZED';
```

### Limpar Logs Antigos

```sql
-- Função para limpar logs de 90 dias ou mais
SELECT cleanup_old_logs();
```

## Melhorias Futuras

- [ ] Migrar rate limit para Redis (produção)
- [ ] Dashboard de logs administrativo
- [ ] Alertas em tempo real para atividades suspeitas
- [ ] 2FA (Two-Factor Authentication)
- [ ] Bloqueio automático após múltiplas falhas
- [ ] Auditoria completa de ações
- [ ] Logs de mudanças de dados (audit trail)

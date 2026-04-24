# Analizap - WhatsApp CRM

Sistema de CRM para WhatsApp com múltiplos usuários e integração IA.

## Stack Tecnológica

- **Backend**: Node.js + Express + JWT + Supabase
- **Frontend**: Vite + React + TailwindCSS + Zustand
- **Banco de Dados**: Supabase (PostgreSQL + Realtime)
- **Storage**: Supabase Storage

## Estrutura do Projeto

```
analizap/
├── backend/                 # API Node.js
│   ├── src/
│   │   ├── config/         # Configurações (Supabase)
│   │   ├── controllers/    # Controladores
│   │   ├── middleware/     # Middleware (auth)
│   │   ├── routes/         # Rotas da API
│   │   ├── services/       # Lógica de negócio
│   │   └── server.js       # Entry point
│   └── .env                # Variáveis de ambiente
├── frontend/               # React App
│   ├── src/
│   │   ├── components/     # Componentes React
│   │   ├── pages/          # Páginas
│   │   ├── services/       # API client
│   │   ├── store/          # Zustand stores
│   │   └── utils/          # Utilitários
│   └── index.html
└── database/               # Scripts SQL
    ├── schema.sql          # Estrutura das tabelas
    └── insert_admin.sql    # Usuário admin
```

## Setup Inicial

### 1. Configurar Banco de Dados (Supabase)

Execute o SQL no painel do Supabase (SQL Editor):

```bash
# Primeiro execute o schema
database/schema.sql

# Depois a tabela de logs
database/logs.sql

# Por fim, insira o usuário admin
database/insert_admin.sql
```

**Credenciais do Admin:**
- Email: `admin@analizap.com`
- Senha: `Admin@123`

### 2. Configurar Backend

```bash
cd backend
npm install
npm run dev
```

O backend rodará em `http://localhost:3001`

### 3. Configurar Frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend rodará em `http://localhost:5173`

### 4. Gerar Hash de Senha (opcional)

Para gerar um novo hash de senha:

```bash
cd backend
node scripts/generateHash.js
```

## Variáveis de Ambiente

### Backend (.env)
```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
JWT_SECRET=...
PORT=3001
NODE_ENV=development
```

## Funcionalidades Implementadas

### Autenticação
- ✅ Sistema de autenticação JWT
- ✅ Login com email e senha
- ✅ Logout com desativação de sessão
- ✅ Logout de todas as sessões
- ✅ Proteção de rotas
- ✅ Três tipos de usuário (admin, supervisor, atendente)

### Segurança
- ✅ Sistema de logs coloridos no terminal
- ✅ Logs persistentes no banco de dados
- ✅ Rate limiting (5 tentativas de login / 15min)
- ✅ Isolamento de sessões no banco
- ✅ Verificação de sessão a cada requisição
- ✅ Captura de IP e User-Agent
- ✅ Toast notifications para feedback visual

### Frontend
- ✅ Store Zustand para estado global
- ✅ Integração com Supabase
- ✅ Toast notifications animados
- ✅ Tratamento de erros com feedback visual

## Próximos Passos

- [ ] Integração com WhatsApp (Baileys)
- [ ] Dashboard em tempo real
- [ ] Chatbot IA (Gemini API)
- [ ] Fluxos de conversa
- [ ] Sistema de tags
- [ ] Agendamentos
- [ ] Relatórios e analytics

## Permissões por Role

- **Admin**: Acesso total ao sistema
- **Supervisor**: Gerencia atendentes e visualiza relatórios
- **Atendente**: Atende clientes e usa chatbot

## Documentação de Segurança

Para detalhes completos sobre o sistema de segurança, logs e rate limiting, consulte [SECURITY.md](./SECURITY.md).

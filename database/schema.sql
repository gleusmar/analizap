-- Analizap Database Schema
-- Tabelas de usuários e autenticação

-- Enum para tipos de usuário
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'atendente');

-- Tabela de usuários
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'atendente',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Tabela de sessões (opcional, para controle de sessões ativas)
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(token);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Inserir usuário admin padrão
-- Senha: Admin@123 (deve ser alterada após primeiro acesso)
INSERT INTO users (email, password_hash, name, role, is_active)
VALUES (
    'admin@analizap.com',
    '$2b$10$rKZqYqZqYqZqYqZqYqZqYuZqYqZqYqZqYqZqYqZqYqZqYqZqYqZqYq',
    'Administrador',
    'admin',
    true
);

-- Nota: O hash acima é um placeholder. 
-- Para gerar o hash correto da senha 'Admin@123', use:
-- bcrypt.hash('Admin@123', 10)

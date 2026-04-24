-- Correção da foreign key da tabela predefined_messages
-- A foreign key estava apontando para auth.users (tabela de autenticação do Supabase)
-- quando deveria apontar para users (nossa tabela de usuários)

-- Dropar a tabela antiga
DROP TABLE IF EXISTS predefined_messages CASCADE;

-- Criar a tabela com a foreign key corrigida
CREATE TABLE predefined_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shortcut VARCHAR(50) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para busca rápida por usuário
CREATE INDEX idx_predefined_messages_user_id ON predefined_messages(user_id);

-- Índice para busca rápida por atalho
CREATE INDEX idx_predefined_messages_shortcut ON predefined_messages(shortcut);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_predefined_messages_updated_at
    BEFORE UPDATE ON predefined_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comentários
COMMENT ON TABLE predefined_messages IS 'Mensagens pré-definidas para atalhos rápidos';
COMMENT ON COLUMN predefined_messages.user_id IS 'ID do usuário que criou a mensagem';
COMMENT ON COLUMN predefined_messages.shortcut IS 'Atalho para acessar a mensagem (ex: /ola)';
COMMENT ON COLUMN predefined_messages.content IS 'Conteúdo da mensagem pré-definida';

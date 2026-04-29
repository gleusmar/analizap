-- C9: Habilita pg_trgm para busca fuzzy
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Índices trigram para acelerar buscas similares em mensagens
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
  ON messages USING GIN (content gin_trgm_ops);

-- Índices trigram em conversas para busca por nome/telefone
CREATE INDEX IF NOT EXISTS idx_conversations_contact_name_trgm
  ON conversations USING GIN (contact_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_conversations_phone_trgm
  ON conversations USING GIN (phone gin_trgm_ops);

-- Função RPC para busca fuzzy em mensagens
CREATE OR REPLACE FUNCTION search_messages_fuzzy(
  search_term TEXT,
  date_from TIMESTAMPTZ DEFAULT NULL,
  date_to TIMESTAMPTZ DEFAULT NULL,
  similarity_threshold FLOAT DEFAULT 0.15
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  content TEXT,
  message_type TEXT,
  msg_timestamp TIMESTAMPTZ,
  from_me BOOLEAN,
  metadata JSONB,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.conversation_id,
    m.content,
    m.message_type,
    m.timestamp AS msg_timestamp,
    m.from_me,
    m.metadata,
    similarity(unaccent(m.content), unaccent(search_term)) AS similarity_score
  FROM messages m
  WHERE
    m.message_type = 'text'
    AND (
      m.content ILIKE '%' || search_term || '%'
      OR similarity(unaccent(m.content), unaccent(search_term)) > similarity_threshold
    )
    AND (date_from IS NULL OR m.timestamp >= date_from)
    AND (date_to IS NULL OR m.timestamp <= date_to)
  ORDER BY similarity_score DESC, m.timestamp DESC
  LIMIT 300;
END;
$$ LANGUAGE plpgsql STABLE;

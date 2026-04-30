-- BUG17: Fix fuzzy search function structure mismatch
-- Drop existing function completely
DROP FUNCTION IF EXISTS search_messages_fuzzy;

-- Recreate function with correct structure and explicit casts
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
    m.id::UUID,
    m.conversation_id::UUID,
    m.content::TEXT,
    m.message_type::TEXT,
    m.timestamp::TIMESTAMPTZ AS msg_timestamp,
    m.from_me::BOOLEAN,
    m.metadata::JSONB,
    similarity(unaccent(m.content::TEXT), unaccent(search_term::TEXT))::FLOAT AS similarity_score
  FROM messages m
  WHERE
    m.message_type = 'text'
    AND (
      m.content ILIKE '%' || search_term || '%'
      OR similarity(unaccent(m.content::TEXT), unaccent(search_term::TEXT)) > similarity_threshold
    )
    AND (date_from IS NULL OR m.timestamp >= date_from)
    AND (date_to IS NULL OR m.timestamp <= date_to)
  ORDER BY similarity_score DESC, m.timestamp DESC
  LIMIT 300;
END;
$$ LANGUAGE plpgsql STABLE;

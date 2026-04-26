-- Migration para aumentar o tamanho do campo phone na tabela contact_presence
-- De VARCHAR(20) para VARCHAR(50) para acomodar grupos e outros formatos

ALTER TABLE contact_presence ALTER COLUMN phone TYPE VARCHAR(50);

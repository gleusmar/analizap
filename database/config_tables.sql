-- Tabela de departamentos
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    modified_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Índices para departments
CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
CREATE INDEX IF NOT EXISTS idx_departments_is_active ON departments(is_active);
CREATE INDEX IF NOT EXISTS idx_departments_created_by ON departments(created_by);

-- Trigger para atualizar modified_at em departments
CREATE OR REPLACE FUNCTION update_departments_modified_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_departments_modified_at_trigger ON departments;
CREATE TRIGGER update_departments_modified_at_trigger
    BEFORE UPDATE ON departments
    FOR EACH ROW
    EXECUTE FUNCTION update_departments_modified_at();

-- Adicionar campos à tabela users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS nickname VARCHAR(100),
ADD COLUMN IF NOT EXISTS avatar TEXT,
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Atualizar trigger de users para incluir modified_by
CREATE OR REPLACE FUNCTION update_users_modified_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_modified_at_trigger ON users;
CREATE TRIGGER update_users_modified_at_trigger
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_modified_at();

-- Índices para os novos campos de users
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);
CREATE INDEX IF NOT EXISTS idx_users_modified_by ON users(modified_by);

-- Inserir departamento padrão
INSERT INTO departments (name, description, is_active, created_by)
VALUES ('Administrativo', 'Departamento administrativo', true, NULL)
ON CONFLICT (name) DO NOTHING;

INSERT INTO departments (name, description, is_active, created_by)
VALUES ('TI', 'Departamento de Tecnologia da Informação', true, NULL)
ON CONFLICT (name) DO NOTHING;

INSERT INTO departments (name, description, is_active, created_by)
VALUES ('RH', 'Departamento de Recursos Humanos', true, NULL)
ON CONFLICT (name) DO NOTHING;

INSERT INTO departments (name, description, is_active, created_by)
VALUES ('Operacional', 'Departamento operacional', true, NULL)
ON CONFLICT (name) DO NOTHING;

-- Inserir usuário admin com senha: Admin@123
-- Hash gerado com bcrypt (salt rounds: 10)
-- Para gerar novo hash: cd backend && node scripts/generateHash.js

INSERT INTO users (email, password_hash, name, role, is_active)
VALUES (
    'admin@analizap.com',
    '$2b$10$G84tpr13aV/Q0VCnuXmtVOA3TWxHTdg.qElFPhm/Ns6rsVzD0Q09K',
    'Administrador',
    'admin',
    true
)
ON CONFLICT (email) DO NOTHING;

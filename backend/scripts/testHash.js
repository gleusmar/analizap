import bcrypt from 'bcrypt';
import { supabase } from '../src/config/supabase.js';
import dotenv from 'dotenv';

dotenv.config();

const testPassword = 'Admin@123';
const testEmail = 'admin@analizap.com';

async function testHash() {
  console.log('=== Teste de Hash de Senha ===\n');
  
  try {
    // 1. Buscar usuário no banco
    console.log('1. Buscando usuário no banco...');
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, password_hash, name, role, is_active')
      .eq('email', testEmail)
      .single();

    if (error || !user) {
      console.error('❌ Usuário não encontrado:', error);
      return;
    }

    console.log('✅ Usuário encontrado:');
    console.log('   Email:', user.email);
    console.log('   Nome:', user.name);
    console.log('   Role:', user.role);
    console.log('   Ativo:', user.is_active);
    console.log('   Hash:', user.password_hash.substring(0, 20) + '...');
    console.log('');

    // 2. Gerar novo hash para comparação
    console.log('2. Gerando novo hash para teste...');
    const newHash = await bcrypt.hash(testPassword, 10);
    console.log('   Novo hash:', newHash.substring(0, 20) + '...');
    console.log('');

    // 3. Testar comparação com hash do banco
    console.log('3. Testando comparação com hash do banco...');
    const matchBank = await bcrypt.compare(testPassword, user.password_hash);
    console.log('   Senha correta:', matchBank ? '✅ SIM' : '❌ NÃO');
    console.log('');

    // 4. Testar comparação com novo hash
    console.log('4. Testando comparação com novo hash...');
    const matchNew = await bcrypt.compare(testPassword, newHash);
    console.log('   Senha correta:', matchNew ? '✅ SIM' : '❌ NÃO');
    console.log('');

    // 5. Verificar se o hash do banco está no formato correto
    console.log('5. Verificando formato do hash do banco...');
    const isBcryptHash = user.password_hash.startsWith('$2b$') || user.password_hash.startsWith('$2a$');
    console.log('   Formato bcrypt:', isBcryptHash ? '✅ SIM' : '❌ NÃO');
    console.log('');

    // 6. Se o hash do banco não funcionar, atualizar
    if (!matchBank) {
      console.log('⚠️  Hash do banco não está funcionando!');
      console.log('   Atualizando hash do usuário...');
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: newHash })
        .eq('email', testEmail);

      if (updateError) {
        console.error('❌ Erro ao atualizar hash:', updateError);
      } else {
        console.log('✅ Hash atualizado com sucesso!');
        console.log('   Novo hash:', newHash);
      }
    } else {
      console.log('✅ Hash do banco está correto!');
    }

    console.log('\n=== Resumo ===');
    console.log('Senha de teste:', testPassword);
    console.log('Hash do banco funciona:', matchBank ? '✅' : '❌');
    console.log('Usuário ativo:', user.is_active ? '✅' : '❌');

  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

testHash();

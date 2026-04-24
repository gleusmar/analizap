import bcrypt from 'bcrypt';

const password = 'Admin@123';
const saltRounds = 10;

const hash = bcrypt.hashSync(password, saltRounds);
console.log('Senha:', password);
console.log('Hash:', hash);

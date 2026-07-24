console.log('Importing jsonwebtoken...');
import jwt from 'jsonwebtoken';
console.log('Imported jsonwebtoken');
const token = jwt.sign({ test: true }, 'secret');
console.log('Signed token:', token);

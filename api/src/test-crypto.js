import crypto from 'node:crypto';
console.log('crypto ok');
const bytes = crypto.randomBytes(16);
console.log('randomBytes ok:', bytes.toString('hex'));

import http from 'node:http';
console.log('Creating server...');
const server = http.createServer((req, res) => {
  res.end('ok');
});
server.listen(4005, () => {
  console.log('Successfully bound to port 4005');
  process.exit(0);
});

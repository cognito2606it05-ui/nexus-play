import net from 'node:net';

console.log('Checking port 4000...');
const client = net.connect(4000, '127.0.0.1', () => {
  console.log('PORT_OCCUPIED: Port 4000 is occupied');
  client.destroy();
  process.exit(0);
});

client.on('error', (err) => {
  console.log('PORT_FREE: Port 4000 is free');
  process.exit(0);
});

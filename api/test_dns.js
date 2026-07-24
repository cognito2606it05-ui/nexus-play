import dns from 'node:dns';

console.log("Resolving google.com...");
dns.resolve('google.com', (err, addresses) => {
  if (err) console.error("google.com failed:", err);
  else console.log("google.com resolved:", addresses);
});

console.log("Resolving DB host...");
dns.resolve('ep-morning-hat-aol183lw.c-2.ap-southeast-1.aws.neon.tech', (err, addresses) => {
  if (err) console.error("DB host failed:", err);
  else console.log("DB host resolved:", addresses);
});

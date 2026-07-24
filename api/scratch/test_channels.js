const baseUrl = 'http://localhost:4000';

async function test() {
  console.log("1. Logging in...");
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@nexusplay.app', password: 'password123' })
  });
  const auth = await loginRes.json();
  const token = auth.accessToken;

  console.log("2. Querying official channels...");
  const res = await fetch(`${baseUrl}/api/streams/official-channels`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Response status:", res.status);
  const data = await res.json();
  console.log("Response data:", JSON.stringify(data, null, 2));
}

test().catch(console.error);

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
  const userId = auth.user.id;

  console.log(`2. Querying user streams list from /api/live/user-streams for user: ${userId}`);
  const res = await fetch(`${baseUrl}/api/live/user-streams?userId=${userId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Response status:", res.status);
  const data = await res.json();
  console.log("Response data length:", data.data?.length);
  if (data.data && data.data.length > 0) {
    console.log("First stream fields:", Object.keys(data.data[0]));
    console.log("creator_name:", data.data[0].creator_name);
    console.log("profile_name:", data.data[0].profile_name);
  }
}

test().catch(console.error);

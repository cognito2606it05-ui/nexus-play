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

  console.log("2. Querying user streams list from /api/streams...");
  const res = await fetch(`${baseUrl}/api/streams`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Response status:", res.status);
  const data = await res.json();
  console.log("Response data length:", data.data?.length);
  console.log("Streams:");
  console.table(data.data?.map(s => ({
    id: s.id,
    title: s.title,
    profile: s.profile_name,
    isLive: s.isLive,
    ended: s.ended,
    videoUrl: s.videoUrl?.slice(0, 60)
  })));
}

test().catch(console.error);

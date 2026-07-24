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

  console.log("2. Fetching active profile...");
  const profilesRes = await fetch(`${baseUrl}/api/profiles`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const profilesData = await profilesRes.json();
  const selfProfileId = profilesData.profiles[0].id;
  console.log("Self profile ID:", selfProfileId);

  console.log(`3. Fetching self activity: /api/profiles/${selfProfileId}/activity`);
  const actSelfRes = await fetch(`${baseUrl}/api/profiles/${selfProfileId}/activity`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Self activity status:", actSelfRes.status);
  const actSelf = await actSelfRes.json();
  console.log("Self activity keys:", Object.keys(actSelf));

  // Let's try to fetch another profile's activity (e.g. User 7999: 719ac944-e1a3-4f09-9203-1cb865005d6e)
  const otherProfileId = '719ac944-e1a3-4f09-9203-1cb865005d6e';
  console.log(`4. Fetching other activity: /api/profiles/${otherProfileId}/activity`);
  const actOtherRes = await fetch(`${baseUrl}/api/profiles/${otherProfileId}/activity`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Other activity status:", actOtherRes.status);
  const actOther = await actOtherRes.json();
  console.log("Other activity response:", actOther);
}

test().catch(console.error);

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
  const profileId = auth.profiles[0].id;

  console.log("2. Creating a test stream to record...");
  const createRes = await fetch(`${baseUrl}/api/live/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    },
    body: JSON.stringify({ title: 'Test Recording Stream', category: 'Tech', location: 'Lab' })
  });
  const stream = await createRes.json();
  const streamId = stream.id;
  console.log("Created stream ID:", streamId);

  console.log("3. Ending the live stream...");
  await fetch(`${baseUrl}/api/live/end`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    },
    body: JSON.stringify({ streamId })
  });

  console.log("4. Uploading base64 video recording...");
  // Dummy base64 video bytes
  const dummyBase64 = 'data:video/webm;base64,GkXfo6NCh4SJ0gEzkYdHlWshd2VibVKElU1TaWRlV2ViTUVHQWhlbHBlckFGM2J5Zg==';
  
  const uploadRes = await fetch(`${baseUrl}/api/live/stream/${streamId}/recording`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    },
    body: JSON.stringify({ videoData: dummyBase64 })
  });
  const uploadResult = await uploadRes.json();
  console.log("Upload response:", uploadResult);

  console.log("5. Querying database state to verify url updates...");
  // Query from endpoint
  const queryRes = await fetch(`${baseUrl}/api/streams`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await queryRes.json();
  const match = data.data.find(s => s.id === streamId);
  console.log("Stream record in database after upload:", {
    id: match?.id,
    title: match?.title,
    recorded_video_url: match?.recorded_video_url || match?.videoUrl,
    isLive: match?.isLive
  });
}

test().catch(console.error);

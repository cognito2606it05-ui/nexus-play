import { db } from '../src/db.js';

async function runTests() {
  console.log('--- STARTING PLATFORM BROADCAST SYSTEM VERIFICATION ---');

  // 1. Authenticate / Login to get tokens
  const loginPayload = { email: 'demo@nexusplay.app', password: 'password123' };
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginPayload)
  });

  if (!loginRes.ok) {
    console.error('Failed to log in:', await loginRes.text());
    return;
  }

  const loginData = await loginRes.json();
  const accessToken = loginData.accessToken;
  const profileId = loginData.profiles[0].id;
  console.log('Successfully logged in. Access Token acquired. Profile ID:', profileId);

  // Helper for authed requests
  const authedFetch = (path, init = {}) => {
    return fetch(`http://localhost:4000${path}`, {
      ...init,
      headers: {
        ...init.headers,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Profile-Id': profileId
      }
    });
  };

  // 2. Start Live Stream Session
  console.log('\n--- Test 1: Start Live Stream ---');
  const startPayload = {
    title: 'Breaking Field Report: Live Audit Verification',
    category: 'News',
    location: 'Hyderabad, India',
    description: 'Verifying all backend features of live streaming including VTT compilation and real-time transcripts.'
  };
  const startRes = await authedFetch('/api/live/start', {
    method: 'POST',
    body: JSON.stringify(startPayload)
  });

  if (!startRes.ok) {
    console.error('Failed to start stream session:', await startRes.text());
    return;
  }

  const startInfo = await startRes.json();
  console.log('Start Live Stream Response:', startInfo);
  if (!startInfo || !startInfo.id) {
    console.error('Invalid response format!');
    return;
  }

  const streamId = startInfo.id;

  // 3. Post transcripts
  console.log('\n--- Test 2: Post Real-Time transcripts ---');
  const transcriptPayloads = [
    { text: 'Hello and welcome to this live broadcast.', elapsedSecs: 0 },
    { text: 'We are verifying subtitles generation in real-time.', elapsedSecs: 4 },
    { text: 'All systems are performing within parameters.', elapsedSecs: 8 }
  ];

  for (const t of transcriptPayloads) {
    const tRes = await authedFetch(`/api/streams/${streamId}/transcript`, {
      method: 'POST',
      body: JSON.stringify(t)
    });
    console.log(`Posted transcript "${t.text}" at elapsed ${t.elapsedSecs}s. Status:`, tRes.status);
  }

  // 4. End Live Stream Session
  console.log('\n--- Test 3: End Live Stream ---');
  const stopRes = await authedFetch('/api/live/end', {
    method: 'POST',
    body: JSON.stringify({ streamId })
  });

  if (!stopRes.ok) {
    console.error('Failed to end stream session:', await stopRes.text());
    return;
  }

  console.log('Stop Live Stream Response:', await stopRes.json());

  // Wait 10 seconds for background processing to finish (transcribing WebVTT, archiving)
  console.log('Waiting for background VTT file compilation...');
  await new Promise(r => setTimeout(r, 10000));

  // 5. Fetch Completed Streams
  console.log('\n--- Test 4: Fetch Streams and Verify Columns ---');
  const listRes = await authedFetch('/api/streams');
  const listInfo = await listRes.json();
  
  const archivedStream = listInfo.data.find(s => s.id === streamId);
  if (archivedStream) {
    console.log('Archived stream details verified:');
    console.log('Title:', archivedStream.title);
    console.log('Recorded Video URL:', archivedStream.videoUrl);
    
    // Check SQLite db details directly for subtitles_url
    const dbRow = db.prepare('SELECT subtitles_url, recorded_video_url FROM user_streams WHERE id = ?').get(streamId);
    console.log('SQLite Database Fields:');
    console.log('Subtitles VTT URL:', dbRow.subtitles_url);
    console.log('Recorded Video Path/URL:', dbRow.recorded_video_url);

    if (dbRow.subtitles_url && dbRow.subtitles_url.includes('.vtt')) {
      console.log('✓ SUCCESS: Subtitles URL generated and stored successfully!');
    } else {
      console.error('✗ ERROR: Subtitles URL not found or invalid.');
    }
  } else {
    console.error('✗ ERROR: Archived stream not returned in streams list.');
  }

  console.log('\n--- ALL VERIFICATIONS COMPLETED ---');
}

runTests().catch(err => console.error('Verification failed:', err));

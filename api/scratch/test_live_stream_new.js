import { resolve } from 'node:path';

async function test() {
  const baseUrl = 'http://localhost:4000';
  const apiDir = 'c:\\Users\\Administrator\\Downloads\\nexus adv\\Nexus Play\\api';

  console.log('1. Logging in as demo@nexusplay.app...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@nexusplay.app', password: 'password123' })
  });
  const auth = await loginRes.json();
  const token = auth.accessToken;

  console.log('2. Fetching user profile...');
  const profileRes = await fetch(`${baseUrl}/api/profiles`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const profileData = await profileRes.json();
  const profileId = profileData.profiles[0].id;
  const userId = auth.user.id;

  console.log('3. Starting live stream session (POST /api/live/start)...');
  const startRes = await fetch(`${baseUrl}/api/live/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    },
    body: JSON.stringify({
      title: 'Breaking Sports Cup Final Live',
      category: 'Sports',
      location: 'Stadium',
      streamType: 'public',
      description: 'Championship cup final broadcast.'
    })
  });

  if (!startRes.ok) {
    throw new Error('Start stream failed: ' + await startRes.text());
  }

  const streamInfo = await startRes.json();
  const streamId = streamInfo.id;
  console.log(`Live stream started successfully with ID: ${streamId}`);

  // Resolve dbUri
  const dbUri = 'file:///' + resolve(apiDir, 'src/db.js').replace(/\\/g, '/');
  const { db } = await import(dbUri);

  console.log('4. Verifying initial user_streams record in database...');
  const initialRecord = db.prepare('SELECT * FROM user_streams WHERE id = ?').get(streamId);
  console.log('Initial Database Record:', initialRecord);
  if (!initialRecord || initialRecord.stream_status !== 'LIVE' || initialRecord.recording_status !== 'RECORDING') {
    throw new Error('user_streams record was not initialized with LIVE / RECORDING status.');
  }

  console.log('5. Ending live stream session (POST /api/live/end)...');
  const endRes = await fetch(`${baseUrl}/api/live/end`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    },
    body: JSON.stringify({ streamId })
  });

  if (!endRes.ok) {
    throw new Error('End stream failed: ' + await endRes.text());
  }
  console.log('End response:', await endRes.json());

  console.log('\n6. Polling database until recording_status is READY or FAILED...');
  let finalRecord;
  for (let attempt = 1; attempt <= 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    finalRecord = db.prepare('SELECT * FROM user_streams WHERE id = ?').get(streamId);
    console.log(`[Attempt ${attempt}/20] recording_status:`, finalRecord ? finalRecord.recording_status : 'not found');
    if (finalRecord && (finalRecord.recording_status === 'READY' || finalRecord.recording_status === 'FAILED')) {
      break;
    }
  }

  console.log('7. Checking final database record after completion...');
  console.log('Final Database Record:', finalRecord);

  if (!finalRecord) {
    throw new Error('Stream record was deleted or not found.');
  }

  if (finalRecord.recording_status !== 'READY') {
    throw new Error(`Recording status is ${finalRecord.recording_status}, expected READY.`);
  }

  if (finalRecord.stream_status !== 'COMPLETED') {
    throw new Error(`Stream status is ${finalRecord.stream_status}, expected COMPLETED.`);
  }

  if (!finalRecord.recorded_video_url || !finalRecord.recorded_video_url.includes('supabase')) {
    throw new Error(`Recorded video URL is invalid: ${finalRecord.recorded_video_url}`);
  }

  if (!finalRecord.thumbnail_url || !finalRecord.thumbnail_url.includes('supabase')) {
    throw new Error(`Thumbnail URL is invalid: ${finalRecord.thumbnail_url}`);
  }

  console.log('✅ Success! Live stream session processed, uploaded to Supabase, and stored in database successfully.');

  console.log('\n8. Verifying GET /api/live/user-streams?userId=...');
  const userStreamsRes = await fetch(`${baseUrl}/api/live/user-streams?userId=${userId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const userStreamsData = await userStreamsRes.json();
  console.log(`Found ${userStreamsData.data.length} streams for user.`);
  const found = userStreamsData.data.find(s => s.id === streamId);
  if (!found) {
    throw new Error('Did not find the stream in user streams list.');
  }

  console.log('\n9. Testing PUT /api/live/stream/:id to update metadata...');
  const updateRes = await fetch(`${baseUrl}/api/live/stream/${streamId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    },
    body: JSON.stringify({
      title: 'Updated Title Cup Final',
      description: 'Updated Description matches championship.'
    })
  });
  const updateData = await updateRes.json();
  console.log('Updated Record Data:', updateData.data);
  if (updateData.data.stream_title !== 'Updated Title Cup Final') {
    throw new Error('Title update failed.');
  }

  console.log('\n10. Testing DELETE /api/live/stream/:id to verify cleanup...');
  const deleteRes = await fetch(`${baseUrl}/api/live/stream/${streamId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    }
  });

  if (!deleteRes.ok) {
    throw new Error('Delete stream failed: ' + await deleteRes.text());
  }

  const recordAfterDelete = db.prepare('SELECT * FROM user_streams WHERE id = ?').get(streamId);
  if (recordAfterDelete) {
    throw new Error('Stream record still exists after deletion.');
  }
  console.log('✅ Clean up check passed. Stream successfully deleted.');
}

test().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

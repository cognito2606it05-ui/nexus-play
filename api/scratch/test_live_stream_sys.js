import { readFileSync, existsSync } from 'node:fs';
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

  console.log('3. Starting live stream session (POST /api/streams/start)...');
  const startRes = await fetch(`${baseUrl}/api/streams/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    },
    body: JSON.stringify({
      title: 'Sports Football Final Broadcast',
      category: 'Sports',
      location: 'Wembley Stadium',
      streamType: 'public',
      description: 'Live coverage of the cup final match.'
    })
  });

  if (!startRes.ok) {
    throw new Error('Start stream failed: ' + await startRes.text());
  }

  const streamInfo = await startRes.json();
  const streamId = streamInfo.id;
  console.log(`Live stream started successfully with ID: ${streamId}`);

  // Fetch dbUri dynamically using Windows ESM file scheme
  const dbUri = 'file:///' + resolve(apiDir, 'src/db.js').replace(/\\/g, '/');
  const { db } = await import(dbUri);

  console.log('4. Verifying user_streams record exists in database...');
  const initialRecord = db.prepare('SELECT * FROM user_streams WHERE id = ?').get(streamId);
  console.log('Initial Database Record:', initialRecord);
  if (!initialRecord || initialRecord.stream_status !== 'live') {
    throw new Error('user_streams record was not initialized with live status.');
  }

  console.log('5. Simulating viewer heartbeat (POST /api/streams/:id/heartbeat)...');
  // Trigger heartbeat from viewers to update view counts
  await fetch(`${baseUrl}/api/streams/${streamId}/heartbeat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': 'viewer-profile-mock-id' // simulated viewer
    }
  });

  console.log('6. Sending chat comment in stream (POST /api/streams/:id/chat)...');
  await fetch(`${baseUrl}/api/streams/${streamId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    },
    body: JSON.stringify({ message: 'What a golazo!' })
  });

  console.log('7. Ending live stream session (POST /api/streams/end)...');
  const endRes = await fetch(`${baseUrl}/api/streams/end`, {
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

  console.log('\n8. Waiting for background recording analysis, cover frame extraction, and Supabase Storage uploads...');
  let finalRecord;
  for (let attempt = 1; attempt <= 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    finalRecord = db.prepare('SELECT * FROM user_streams WHERE id = ?').get(streamId);
    console.log(`[Attempt ${attempt}/20] recording_status:`, finalRecord ? finalRecord.recording_status : 'not found');
    if (finalRecord && (finalRecord.recording_status === 'Completed' || finalRecord.recording_status === 'Failed')) {
      break;
    }
  }

  console.log('9. Checking database updates for user_streams recording and URLs...');
  console.log('Final Database Record:', finalRecord);

  if (!finalRecord) {
    throw new Error('Stream record was deleted or not found.');
  }

  if (finalRecord.recording_status !== 'Completed') {
    throw new Error(`Recording status is ${finalRecord.recording_status}, expected Completed.`);
  }

  if (!finalRecord.recorded_video_url || !finalRecord.recorded_video_url.includes('supabase')) {
    throw new Error(`Recorded video URL is invalid: ${finalRecord.recorded_video_url}`);
  }

  if (!finalRecord.thumbnail_url || !finalRecord.thumbnail_url.includes('supabase')) {
    throw new Error(`Thumbnail URL is invalid: ${finalRecord.thumbnail_url}`);
  }

  if (finalRecord.total_comments !== 1) {
    throw new Error(`Expected total_comments to be 1, found ${finalRecord.total_comments}`);
  }

  console.log('✅ Success! Live stream session processed, uploaded to Supabase, and stored in database successfully.');

  console.log('\n10. Testing DELETE /api/streams/:id to verify cleanup...');
  const deleteRes = await fetch(`${baseUrl}/api/streams/${streamId}`, {
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

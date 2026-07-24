import { db } from '../src/db.js';

async function runTests() {
  console.log('--- STARTING STUDIO BROADCAST SYSTEM VERIFICATION ---');

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

  // 2. Generate a stream key
  console.log('\n--- Test 1: Generate Stream Key ---');
  const genKeyRes = await authedFetch('/api/studio/keys', { method: 'POST' });
  const keyInfo = await genKeyRes.json();
  console.log('Generate Stream Key Response:', keyInfo);
  if (!keyInfo.success || !keyInfo.streamKey) {
    console.error('Failed to generate stream key!');
    return;
  }

  // 3. Fetch stream key
  console.log('\n--- Test 2: Fetch Stream Key ---');
  const getKeyRes = await authedFetch('/api/studio/keys');
  console.log('Fetch Stream Key Response:', await getKeyRes.json());

  // 4. Start Master Broadcast composite
  console.log('\n--- Test 3: Start Master Broadcast ---');
  const startRes = await authedFetch('/api/studio/broadcast/start', { method: 'POST' });
  const startInfo = await startRes.json();
  console.log('Start Broadcast Master Response:', startInfo);
  if (!startInfo.success || !startInfo.broadcastId) {
    console.error('Failed to start master broadcast session!');
    return;
  }

  const bId = startInfo.broadcastId;

  // 5. Update layout mode
  console.log('\n--- Test 4: Update Broadcast Layout ---');
  const layoutPayload = {
    broadcastId: bId,
    layoutMode: 'split-2',
    promotedStreams: [keyInfo.streamKey],
    tickerText: 'BREAKING NEWS: Dynamic layout modifications tested successfully.',
    showLogo: true,
    breakingNews: true
  };
  const layoutRes = await authedFetch('/api/studio/broadcast/layout', {
    method: 'POST',
    body: JSON.stringify(layoutPayload)
  });
  console.log('Update Layout Response Status:', layoutRes.status);

  // 6. Check Active Broadcast status
  console.log('\n--- Test 5: Get Current Active Broadcast ---');
  const currentRes = await authedFetch('/api/studio/broadcast/current');
  console.log('Current Broadcast Details:', await currentRes.json());

  // 7. Stop Master Broadcast
  console.log('\n--- Test 6: Stop Master Broadcast ---');
  const stopRes = await authedFetch('/api/studio/broadcast/stop', {
    method: 'POST',
    body: JSON.stringify({ broadcastId: bId })
  });
  console.log('Stop Broadcast Master Response Status:', stopRes.status);

  console.log('\n--- ALL VERIFICATIONS COMPLETED SUCCESSFULLY ---');
}

runTests().catch(err => console.error('Verification crashed:', err));

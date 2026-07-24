async function testPhoneticCensoring() {
  const baseUrl = 'http://localhost:4000';
  
  console.log('1. Logging in...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@nexusplay.app', password: 'password123' })
  });
  
  const auth = await loginRes.json();
  const token = auth.accessToken;
  
  console.log('2. Fetching profiles...');
  const profileRes = await fetch(`${baseUrl}/api/profiles`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const profileData = await profileRes.json();
  const profile = profileData.profiles[0];
  const profileId = profile.id;
  console.log(`Using Profile: ${profile.name} (${profileId})`);

  // Mock cover image
  const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  console.log('\n3. Attempting upload with phonetic bad word variation ("puku")...');
  const res1 = await fetch(`${baseUrl}/api/news`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    },
    body: JSON.stringify({
      title: 'This is a puku test headline.',
      summary: 'Brief summary containing puku.',
      body: 'This body contains puku and other things.',
      category: 'Latest',
      imageData: mockBase64,
      imageName: 'test.png'
    })
  });
  console.log('Attempt 1 Status:', res1.status);
  const result1 = await res1.json();
  console.log('Attempt 1 Body:', result1);

  if (res1.status === 400 && result1.error.includes('blocked by AI moderation')) {
    console.log('SUCCESS: SafeGuard blocked the phonetic variation!');
  } else {
    console.error('FAILURE: SafeGuard did not block the variation!');
    process.exit(1);
  }

  console.log('\n4. Re-uploading with continueAnyway: true...');
  const res2 = await fetch(`${baseUrl}/api/news`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Profile-Id': profileId
    },
    body: JSON.stringify({
      title: 'This is a puku test headline.',
      summary: 'Brief summary containing puku.',
      body: 'This body contains puku and other things.',
      category: 'Latest',
      imageData: mockBase64,
      imageName: 'test.png',
      continueAnyway: true
    })
  });
  console.log('Attempt 2 Status:', res2.status);
  const result2 = await res2.json();
  console.log('Attempt 2 Body (Title):', result2.title);
  console.log('Attempt 2 Body (Summary):', result2.summary);
  console.log('Attempt 2 Body (Body):', result2.neutralizedText);

  if (res2.status === 201 && result2.title.includes('****') && result2.summary.includes('****') && result2.neutralizedText.includes('****')) {
    console.log('SUCCESS: All fields correctly censored and saved!');
  } else {
    console.error('FAILURE: Censor failed on one or more fields!');
    process.exit(1);
  }
}

testPhoneticCensoring().catch(console.error);

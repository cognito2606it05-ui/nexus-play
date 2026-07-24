import fetch from 'node-fetch';

async function testCrud() {
  console.log('1. Logging in as demo@nexusplay.app...');
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@nexusplay.app', password: 'password123' })
  });
  
  const loginData = await loginRes.json();
  console.log('Login result status:', loginRes.status, loginData);
  
  if (!loginData.accessToken) {
    console.error('Login failed');
    return;
  }
  
  const token = loginData.accessToken;
  
  console.log('\n2. Fetching GET /api/admin/top-stories WITHOUT X-Profile-Id header...');
  const getRes = await fetch('http://localhost:4000/api/admin/top-stories', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('GET /api/admin/top-stories status:', getRes.status, await getRes.json());
  
  console.log('\n3. Creating new top story via POST /api/admin/top-stories...');
  const postRes = await fetch('http://localhost:4000/api/admin/top-stories', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      headline: 'Test Headline ' + Date.now(),
      description: 'Test description',
      category: 'General',
      status: 'published'
    })
  });
  console.log('POST status:', postRes.status, await postRes.json());

  console.log('\n4. Bulk Upload via POST /api/admin/top-stories/bulk-upload...');
  const bulkUploadRes = await fetch('http://localhost:4000/api/admin/top-stories/bulk-upload', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      images: [
        { filename: 'test-image.jpg', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }
      ]
    })
  });
  console.log('Bulk Upload status:', bulkUploadRes.status, await bulkUploadRes.json());

  console.log('\n5. Bulk Import via POST /api/admin/top-stories/bulk-import...');
  const bulkImportRes = await fetch('http://localhost:4000/api/admin/top-stories/bulk-import', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      rows: [
        { headline: 'Import Headline 1', category: 'General' }
      ]
    })
  });
  console.log('Bulk Import status:', bulkImportRes.status, await bulkImportRes.json());
}

testCrud().catch(console.error);

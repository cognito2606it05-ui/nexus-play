import { resolve } from 'node:path';

async function run() {
  const baseUrl = 'http://localhost:4000';
  
  console.log('1. Logging in as demo@nexusplay.app...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@nexusplay.app', password: 'password123' })
  });
  if (!loginRes.ok) {
    throw new Error('Login failed: ' + await loginRes.text());
  }
  const auth = await loginRes.json();
  const token = auth.accessToken;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  console.log('2. Fetching Admin Analytics...');
  const analyticsRes = await fetch(`${baseUrl}/api/admin/analytics`, { headers: authHeaders });
  if (!analyticsRes.ok) {
    throw new Error('Get Analytics failed: ' + await analyticsRes.text());
  }
  const analytics = await analyticsRes.json();
  console.log('Analytics Metrics:', analytics.metrics);

  console.log('3. Fetching User List...');
  const usersRes = await fetch(`${baseUrl}/api/admin/users`, { headers: authHeaders });
  if (!usersRes.ok) {
    throw new Error('Get Users failed: ' + await usersRes.text());
  }
  const users = await usersRes.json();
  console.log(`Found ${users.data.length} users in database.`);

  console.log('4. Creating Mock Admin...');
  const mockEmail = `test-admin-${Date.now()}@nexusplay.app`;
  const createAdminRes = await fetch(`${baseUrl}/api/admin/admins`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      email: mockEmail,
      password: 'password123',
      displayName: 'Test Sub Admin',
      role: 'admin'
    })
  });
  if (!createAdminRes.ok) {
    throw new Error('Create Admin failed: ' + await createAdminRes.text());
  }
  console.log('✅ Created Sub Admin successfully.');

  console.log('5. Verifying Mock Admin in list...');
  const usersRes2 = await fetch(`${baseUrl}/api/admin/users`, { headers: authHeaders });
  const users2 = await usersRes2.json();
  const createdAdmin = users2.data.find(u => u.email === mockEmail);
  if (!createdAdmin) {
    throw new Error('Created admin could not be found in user list!');
  }
  console.log(`✅ Verified admin exists with ID: ${createdAdmin.id}`);

  console.log('6. Editing Mock Admin role to suspended...');
  const updateRes = await fetch(`${baseUrl}/api/admin/users/${createdAdmin.id}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ displayName: 'Suspended Sub Admin', role: 'suspended' })
  });
  if (!updateRes.ok) {
    throw new Error('Update Admin failed: ' + await updateRes.text());
  }
  console.log('✅ Edited admin role successfully.');

  console.log('7. Blocking an IP address...');
  const blockRes = await fetch(`${baseUrl}/api/admin/security/block-ip`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ ip: '12.34.56.78', reason: 'Integration Test' })
  });
  if (!blockRes.ok) {
    throw new Error('Block IP failed: ' + await blockRes.text());
  }
  console.log('✅ Blocked IP successfully.');

  console.log('8. Fetching Blocked IPs list...');
  const blockedIpsRes = await fetch(`${baseUrl}/api/admin/security/blocked-ips`, { headers: authHeaders });
  const blockedIps = await blockedIpsRes.json();
  const isBlocked = blockedIps.data.some(item => item.ip === '12.34.56.78');
  if (!isBlocked) {
    throw new Error('IP was not found in blocked list!');
  }
  console.log('✅ Verified IP in blocked list.');

  console.log('9. Unblocking the IP address...');
  const unblockRes = await fetch(`${baseUrl}/api/admin/security/block-ip`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ ip: '12.34.56.78', unblock: true })
  });
  if (!unblockRes.ok) {
    throw new Error('Unblock IP failed: ' + await unblockRes.text());
  }
  console.log('✅ Unblocked IP successfully.');

  console.log('10. Fetching System Settings...');
  const settingsRes = await fetch(`${baseUrl}/api/admin/settings`, { headers: authHeaders });
  const settings = await settingsRes.json();
  console.log('System Settings:', settings.data);

  console.log('11. Updating System Settings...');
  const updateSettingsRes = await fetch(`${baseUrl}/api/admin/settings`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ platformName: 'Nexus Play Premium' })
  });
  if (!updateSettingsRes.ok) {
    throw new Error('Update Settings failed: ' + await updateSettingsRes.text());
  }
  console.log('✅ Updated settings successfully.');

  console.log('12. Retrieving Audit Logs...');
  const auditRes = await fetch(`${baseUrl}/api/admin/security/audit`, { headers: authHeaders });
  const auditLogs = await auditRes.json();
  console.log(`Found ${auditLogs.data.length} audit log entries.`);

  console.log('13. Deleting Mock Admin...');
  const deleteRes = await fetch(`${baseUrl}/api/admin/users/${createdAdmin.id}`, {
    method: 'DELETE',
    headers: authHeaders
  });
  if (!deleteRes.ok) {
    throw new Error('Delete Admin failed: ' + await deleteRes.text());
  }
  console.log('✅ Deleted mock admin successfully.');

  console.log('🎉 Integration tests for Super Admin System completed successfully!');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

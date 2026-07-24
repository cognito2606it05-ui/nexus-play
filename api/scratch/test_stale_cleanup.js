import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgresql://neondb_owner:npg_uGhImgA79icz@ep-morning-hat-aol183lw.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const baseUrl = 'http://localhost:4000';

async function test() {
  // 1. Log in to get tokens
  console.log("1. Logging in...");
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@nexusplay.app', password: 'password123' })
  });
  const auth = await loginRes.json();
  const token = auth.accessToken;

  console.log("2. Fetching profile...");
  const profileRes = await fetch(`${baseUrl}/api/profiles`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const profileData = await profileRes.json();
  const profileId = profileData.profiles[0].id;
  const userId = auth.user.id;

  // 3. Connect to DB to insert a stale stream
  console.log("3. Inserting stale stream into database...");
  const client = new Client({ connectionString });
  await client.connect();

  const streamId = 'stale-test-' + Math.random().toString(36).substring(7);
  const startedAt = Date.now() - 600 * 1000; // 10 minutes ago
  const lastSeen = Date.now() - 120 * 1000;  // 2 minutes ago (stale!)
  const nowStr = new Date().toISOString();

  // Insert into live_streams (ended = 0)
  await client.query(`
    INSERT INTO live_streams (id, profile_id, user_id, title, category, location, started_at, last_seen, viewers, peak_viewers, ended)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 0)
  `, [streamId, profileId, userId, 'Stale Stream Test Title', 'News', 'Virtual', startedAt, lastSeen]);

  // Insert into user_streams (stream_status = 'LIVE')
  await client.query(`
    INSERT INTO user_streams (
      id, user_id, profile_id, stream_title, description, category, stream_type,
      stream_status, live_stream_url, recorded_video_url, thumbnail_url, duration,
      started_at, ended_at, total_views, peak_viewers, total_likes, total_comments, total_shares,
      recording_status, storage_provider, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'LIVE', $8, NULL, NULL, 0, $9, NULL, 0, 0, 0, 0, 0, 'RECORDING', 'Supabase', $10, $11)
  `, [streamId, userId, profileId, 'Stale Stream Test Title', 'Stale Stream Description', 'News', 'public', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', startedAt, nowStr, nowStr]);

  console.log(`Inserted stale stream: ${streamId}`);

  // 4. Trigger cleanup by calling GET /api/live/user-streams
  console.log("4. Fetching user-streams to trigger cleanup sweep...");
  const triggerRes = await fetch(`${baseUrl}/api/live/user-streams?userId=${profileId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log("Trigger response status:", triggerRes.status);

  // 5. Wait for background cleanup process
  console.log("5. Waiting 6 seconds for background auto-cleanup and finalization...");
  await new Promise(resolve => setTimeout(resolve, 6000));

  // 6. Check database for result
  console.log("6. Verifying database updates...");
  const streamRes = await client.query(`SELECT * FROM user_streams WHERE id = $1`, [streamId]);
  const liveRes = await client.query(`SELECT * FROM live_streams WHERE id = $1`, [streamId]);

  console.log("Resulting User Stream record:");
  console.log(streamRes.rows[0]);
  console.log("Resulting Live Stream record:");
  console.log(liveRes.rows[0]);

  await client.end();

  if (!streamRes.rows[0] || streamRes.rows[0].stream_status !== 'COMPLETED' || streamRes.rows[0].recording_status !== 'READY') {
    throw new Error(`Stale stream cleanup failed! Status: ${streamRes.rows[0]?.stream_status}, Recording Status: ${streamRes.rows[0]?.recording_status}`);
  }

  console.log("✅ Success! Stale streams cleanup is working flawlessly without throwing TypeErrors!");
}

test().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});

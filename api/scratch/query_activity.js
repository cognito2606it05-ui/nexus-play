import pg from 'pg';
const { Client } = pg;

async function run() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_uGhImgA79icz@ep-morning-hat-aol183lw.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
  console.log('Connecting to:', connectionString);
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected successfully!');
    
    const commentsRes = await client.query('SELECT * FROM comments');
    console.log(`Total Comments in DB: ${commentsRes.rows.length}`);
    console.table(commentsRes.rows.map(c => ({ id: c.id, reel_id: c.reel_id, profile_id: c.profile_id, body: c.body })));

    const reelLikesRes = await client.query('SELECT * FROM reel_likes');
    console.log(`Total Reel Likes in DB: ${reelLikesRes.rows.length}`);
    console.table(reelLikesRes.rows);

    const postLikesRes = await client.query('SELECT * FROM post_likes');
    console.log(`Total Post Likes in DB: ${postLikesRes.rows.length}`);
    console.table(postLikesRes.rows);

    const profilesRes = await client.query('SELECT * FROM profiles');
    console.log(`Total Profiles in DB: ${profilesRes.rows.length}`);
    console.table(profilesRes.rows.map(p => ({ id: p.id, name: p.name })));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();

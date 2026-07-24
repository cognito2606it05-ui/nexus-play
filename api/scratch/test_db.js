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
    const res = await client.query('SELECT COUNT(*) AS n FROM users');
    console.log('Query result:', res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();

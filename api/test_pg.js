import pg from 'pg';
const { Pool } = pg;

const connectionString = 'postgresql://neondb_owner:npg_uGhImgA79icz@ep-morning-hat-aol183lw.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log("Connecting to PG...");
  try {
    const res = await pool.query("SELECT * FROM otps LIMIT 5");
    console.log("otps rows:", res.rows);
  } catch (err) {
    console.error("Query Error:", err);
  } finally {
    await pool.end();
  }
}

run();

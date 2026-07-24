import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgresql://neondb_owner:npg_uGhImgA79icz@ep-morning-hat-aol183lw.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function verify() {
  const client = new Client({ connectionString });
  await client.connect();

  console.log("Connected to Neon DB successfully!");

  const channels = await client.query(`SELECT * FROM live_tv_channels`);
  console.log("Live TV Channels on Neon:");
  console.table(channels.rows);

  await client.end();
}

verify().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});

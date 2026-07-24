import { db } from '../src/db.js';

async function check() {
  try {
    const userStreams = db.prepare('SELECT * FROM user_streams').all();
    console.log('--- USER STREAMS ---');
    console.table(userStreams.map(s => ({
      id: s.id,
      title: s.stream_title,
      status: s.stream_status,
      live_url: s.live_stream_url,
      rec_url: s.recorded_video_url,
      rec_status: s.recording_status
    })));

    const liveStreams = db.prepare('SELECT * FROM live_streams').all();
    console.log('\n--- LIVE STREAMS ---');
    console.table(liveStreams);

    const reporterStreams = db.prepare('SELECT * FROM reporter_streams').all();
    console.log('\n--- REPORTER STREAMS ---');
    console.table(reporterStreams);

  } catch (err) {
    console.error('Error:', err);
  }
}

check();

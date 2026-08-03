import { db, initSchema } from '../src/db.js';

initSchema();

const officialChannels = [
  { id: 'n1', name: 'NEXUS News 24 Live', category: 'News', now_playing: '24/7 Global Breaking News & Regional Updates', next_up: 'World Tonight Live', is_official: 1, viewers: 24200, video_url: 'https://www.youtube.com/watch?v=gCNeDWCI0vo' },
  { id: 'n2', name: 'Global News Live', category: 'News', now_playing: 'NASA TV Official 24/7 Earth & Space Stream', next_up: 'Business Pulse', is_official: 1, viewers: 18500, video_url: 'https://www.youtube.com/watch?v=21X5lGlDOfg' },
  { id: 'm1', name: 'NEXUS Cinema Live', category: 'Movies', now_playing: '24/7 Blockbuster Movie Specials', next_up: 'Classic Hour', is_official: 1, viewers: 15400, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
  { id: 'm2', name: 'Action Movies Live', category: 'Movies', now_playing: 'Live Action Thriller Showcase', next_up: 'Midnight Specials', is_official: 1, viewers: 12900, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
  { id: 's1', name: 'NEXUS Sports Live', category: 'Sports', now_playing: 'Live Sports Action & Championship Highlights', next_up: 'Sports Center', is_official: 1, viewers: 39500, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
  { id: 's2', name: 'Grand Arena Sports', category: 'Sports', now_playing: 'Grand Championship Live & Daily Highlights', next_up: 'Daily Highlights', is_official: 1, viewers: 28400, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4' },
  { id: 't1', name: 'NEXUS Tech & AI Live', category: 'Tech', now_playing: 'Silicon Tech & Quantum AI Breakthroughs', next_up: 'Future Code', is_official: 1, viewers: 9800, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreet.mp4' },
  { id: 'v1', name: 'NEXUS Devotional Live', category: 'Devotional', now_playing: 'Sacred Temples & Daily Morning Pooja Live', next_up: 'Gita Chanting', is_official: 1, viewers: 21500, video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4' },
];

db.exec('DELETE FROM live_tv_channels;');

const insChannel = db.prepare(`
  INSERT INTO live_tv_channels (id, name, category, now_playing, next_up, is_official, viewers, video_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

officialChannels.forEach((chan) => {
  insChannel.run(chan.id, chan.name, chan.category, chan.now_playing, chan.next_up, chan.is_official, chan.viewers, chan.video_url);
});

console.log('Successfully updated live_tv_channels table with 8 distinct channels.');

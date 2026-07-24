import { generateAutoThumbnail } from '../src/thumbnail-processor.js';
import { resolve } from 'node:path';

// Load env variables
import { existsSync } from 'node:fs';
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const videoPath = resolve('../uploads/stream-recording-b78fd5eb-7c46-4f7f-b6c1-673fb6b8e3d7.mp4');
console.log('Testing generateAutoThumbnail with video path:', videoPath);

generateAutoThumbnail({
  videoPath,
  category: 'Live TV',
  title: 'Live Recording',
  outputFilename: 'test-out-recording.jpg'
})
  .then((res) => {
    console.log('Success! Result:', res);
  })
  .catch((err) => {
    console.error('Error during thumbnail generation:', err);
  });

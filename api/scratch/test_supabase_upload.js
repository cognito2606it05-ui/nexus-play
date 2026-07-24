import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

async function run() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_API_KEY;
  console.log('URL:', url);
  console.log('Key Length:', key ? key.length : 0);

  const supabase = createClient(url, key);
  const filePath = resolve(__dirname, '../uploads/stream-rec-cover-9a229a84-e76d-4e55-aaf8-c69aea1e3a55.jpg');
  if (!existsSync(filePath)) {
    console.error('File not found:', filePath);
    return;
  }

  const fileBuffer = readFileSync(filePath);
  console.log('Uploading...');
  const { data, error } = await supabase.storage
    .from('live-stream-recordings')
    .upload('test-thumb.jpg', fileBuffer, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (error) {
    console.error('Upload Error:', error);
  } else {
    console.log('Upload Success:', data);
    const { data: publicUrlData } = supabase.storage
      .from('live-stream-recordings')
      .getPublicUrl('test-thumb.jpg');
    console.log('Public URL:', publicUrlData);
  }
}

run();

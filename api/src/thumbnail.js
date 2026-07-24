import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import ffmpegPath from 'ffmpeg-static';
import { mediaUrl, PROJECT_ROOT } from './config.js';

/**
 * Download premium landscape placeholders to use as default fallback thumbnails.
 */
export async function ensureDefaultThumbnailExists() {
  const defaults = [
    { name: 'default-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80' },
    { name: 'default-live-recording-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800&auto=format&fit=crop&q=80' },
    { name: 'default-news-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=80' },
    { name: 'default-sports-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&auto=format&fit=crop&q=80' },
    { name: 'default-entertainment-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=80' },
    { name: 'default-politics-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800&auto=format&fit=crop&q=80' },
    { name: 'default-technology-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80' },
    { name: 'default-business-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80' },
    { name: 'default-health-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=800&auto=format&fit=crop&q=80' },
    { name: 'default-education-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80' },
    { name: 'default-livetv-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1461151304267-38535e780c79?w=800&auto=format&fit=crop&q=80' },
    { name: 'default-reels-thumbnail.jpg', url: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&auto=format&fit=crop&q=80' }
  ];

  for (const item of defaults) {
    const dest = resolve(PROJECT_ROOT, 'uploads', item.name);
    if (!existsSync(dest)) {
      try {
        console.log(`[Thumbnail System] Downloading ${item.name}...`);
        const response = await fetch(item.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        writeFileSync(dest, buffer);
        console.log(`[Thumbnail System] ${item.name} saved successfully.`);
      } catch (err) {
        console.error(`[Thumbnail System] Failed to download ${item.name}:`, err.message);
        try {
          const fallbackBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
          writeFileSync(dest, Buffer.from(fallbackBase64, 'base64'));
        } catch (e) {}
      }
    }
  }
}

/**
 * Returns the matching default thumbnail filename based on category and type.
 */
export function getDefaultThumbnailFilename(category, type) {
  if (type === 'reels' || type === 'reel') {
    return 'default-reels-thumbnail.jpg';
  }
  
  if (type === 'live' || category === 'Live TV' || category === 'LiveTV') {
    return 'default-livetv-thumbnail.jpg';
  }

  if (!category) {
    return 'default-thumbnail.jpg';
  }

  const catLower = category.toLowerCase();
  if (catLower.includes('sport')) {
    return 'default-sports-thumbnail.jpg';
  }
  if (catLower.includes('news') || catLower.includes('latest')) {
    return 'default-news-thumbnail.jpg';
  }
  if (catLower.includes('entertain')) {
    return 'default-entertainment-thumbnail.jpg';
  }
  if (catLower.includes('polit')) {
    return 'default-politics-thumbnail.jpg';
  }
  if (catLower.includes('tech')) {
    return 'default-technology-thumbnail.jpg';
  }
  if (catLower.includes('busin') || catLower.includes('finance') || catLower.includes('econ')) {
    return 'default-business-thumbnail.jpg';
  }
  if (catLower.includes('health') || catLower.includes('medic')) {
    return 'default-health-thumbnail.jpg';
  }
  if (catLower.includes('edu') || catLower.includes('learn')) {
    return 'default-education-thumbnail.jpg';
  }

  return 'default-thumbnail.jpg';
}

/**
 * Extract a single frame from a video with optional professional color/brightness enhancements.
 */
export function extractFrame(videoPath, outputPath, timestampSeconds = 2.0, enhance = true) {
  return new Promise((resolve, reject) => {
    const hrs = Math.floor(timestampSeconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((timestampSeconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (timestampSeconds % 60).toFixed(3).padStart(6, '0');
    const timeStr = `${hrs}:${mins}:${secs}`;

    const args = [
      '-ss', timeStr,
      '-i', videoPath,
    ];

    if (enhance) {
      args.push('-vf', 'eq=brightness=0.04:contrast=1.08:saturation=1.15,unsharp=5:5:0.5:5:5:0.5');
    }

    args.push(
      '-frames:v', '1',
      '-q:v', '2',
      outputPath,
      '-y'
    );

    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg frame extraction exited with code ${code}. Stderr: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Read video metadata to find duration.
 */
export function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-i', videoPath]);
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('close', () => {
      const match = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (match) {
        const hrs = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        const secs = parseInt(match[3], 10);
        resolve(hrs * 3600 + mins * 60 + secs);
      } else {
        resolve(0); // Unknown
      }
    });
  });
}

/**
 * Generate 4 different professional thumbnail options and rank them using Gemini AI.
 */
export async function generateReelThumbnails(videoData, videoName, offsetSeed = 0) {
  const tempId = randomUUID();
  const ext = videoName && videoName.toLowerCase().endsWith('.mov') ? 'mov' : 'mp4';
  const tempVideoPath = resolve(PROJECT_ROOT, 'uploads', `temp-video-${tempId}.${ext}`);
  
  const buffer = Buffer.from(videoData, 'base64');
  writeFileSync(tempVideoPath, buffer);

  try {
    const duration = await getVideoDuration(tempVideoPath);
    console.log(`[Thumbnail System] Processing video with duration: ${duration}s`);

    const baseDuration = duration > 0 ? duration : 10;
    const shift = (offsetSeed * 1.5) % (baseDuration / 4 || 1);
    
    const timestamps = [
      Math.max(0.5, (baseDuration * 0.15) + shift),
      Math.max(1.0, (baseDuration * 0.40) + shift),
      Math.max(1.5, (baseDuration * 0.65) + shift),
      Math.max(2.0, (baseDuration * 0.85) + shift)
    ];

    const options = [];
    const base64Parts = [];

    // Extract 4 enhanced options
    for (let i = 0; i < 4; i++) {
      const filename = `reel-thumb-opt-${i + 1}-${tempId}.jpg`;
      const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
      
      try {
        await extractFrame(tempVideoPath, filepath, timestamps[i], true);
        options.push({
          id: i + 1,
          filename,
          timestamp: timestamps[i].toFixed(1)
        });

        const fileBuffer = readFileSync(filepath);
        base64Parts.push({
          inlineData: {
            data: fileBuffer.toString('base64'),
            mimeType: 'image/jpeg'
          }
        });
      } catch (err) {
        console.error(`[Thumbnail System] Option ${i + 1} extraction failed:`, err.message);
      }
    }

    if (options.length === 0) {
      throw new Error('Failed to extract any thumbnail candidate frames');
    }

    let recommendedId = options[0]?.id || 1;
    let aiReason = 'Highest visual quality frame automatically selected.';
    let ratings = [8, 9, 7, 6];

    // AI-Powered Frame Ranking via Gemini
    if (base64Parts.length === options.length) {
      try {
        console.log('[Thumbnail System] Invoking Gemini to analyze and rank thumbnail frames...');
        const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6Ibefzv1Qg_EhvT4-Vb08D9zyROA5_QSmTdLRYIMditJg';
        
        const promptText = `You are an AI Video Thumbnail Selector. 
Analyze the 4 candidate frames provided (ordered from Option 1 to Option ${options.length}) extracted from a video.
Identify the best option for a video cover/thumbnail.
Criteria:
- Priority 1: Clear, sharp human faces with eye contact, good expression, or key action.
- Priority 2: Text detection. Keep readable text fully visible, avoid cropped or blurry text.
- Priority 3: Visual engagement (e.g. action scenes, products, vibrant objects).
- Reject: Blurry, dark, low-quality, or blank frames.

Rate each option out of 10. Return a JSON object with this exact structure (no markdown wrapper or code block formatting, just raw JSON text):
{
  "recommendedOption": 1,
  "reason": "Option 1 has the clearest facial expression and high lighting contrast.",
  "ratings": [9, 7, 5, 6]
}`;

        const parts = base64Parts.map(bp => ({
          inlineData: {
            mimeType: 'image/jpeg',
            data: bp.inlineData.data
          }
        }));
        parts.push({ text: promptText });

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }]
          })
        });

        if (res.ok) {
          const data = await res.json();
          const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const cleanJsonText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
          const resObj = JSON.parse(cleanJsonText);
          
          if (resObj && resObj.recommendedOption) {
            const rec = parseInt(resObj.recommendedOption, 10);
            if (options.some(o => o.id === rec)) {
              recommendedId = rec;
              aiReason = resObj.reason || aiReason;
              ratings = resObj.ratings || ratings;
              console.log(`[Thumbnail System] Gemini selected Option ${recommendedId}: ${aiReason}`);
            }
          }
        } else {
          console.warn('[Thumbnail System] Gemini ranking request failed with status:', res.status);
        }
      } catch (geminiErr) {
        console.warn('[Thumbnail System] Gemini ranking failed, falling back to default frame choice:', geminiErr.message);
      }
    }

    return {
      options,
      recommendedId,
      aiReason,
      ratings
    };

  } finally {
    try {
      if (existsSync(tempVideoPath)) {
        unlinkSync(tempVideoPath);
      }
    } catch (e) {}
  }
}

/**
 * Sweep database for any existing reels without generated thumbnails and create them.
 */
export async function sweepSeededThumbnails() {
  try {
    const { db } = await import('./db.js');
    const unthumbed = db.prepare("SELECT * FROM reels WHERE thumbnail_file IS NULL OR thumbnail_file = ''").all();
    if (unthumbed.length === 0) return;
    
    console.log(`[Thumbnail Sweep] Found ${unthumbed.length} reels without thumbnails. Generating covers in background...`);
    
    for (const reel of unthumbed) {
      const videoFilename = reel.video_file;
      const videoPath = resolve(PROJECT_ROOT, 'Ai videos', videoFilename);
      if (!existsSync(videoPath)) continue;

      const thumbFilename = `user-reel-cover-${reel.id}.jpg`;
      const thumbFilepath = resolve(PROJECT_ROOT, 'uploads', thumbFilename);
      
      try {
        await extractFrame(videoPath, thumbFilepath, 2.0, true);
        db.prepare('UPDATE reels SET thumbnail_file = ? WHERE id = ?').run(thumbFilename, reel.id);
        console.log(`[Thumbnail Sweep] Successfully generated cover for reel: ${reel.title}`);
      } catch (err) {
        console.warn(`[Thumbnail Sweep] Failed to generate cover for reel ${reel.id}:`, err.message);
      }
    }
  } catch (e) {
    console.error('[Thumbnail Sweep] Error sweeping database:', e);
  }
}

/**
 * Evaluate if a live stream frame is high-quality (not blank or blurry) using Gemini.
 * If a thumbnail already exists, compare them and update only if significantly better.
 */
export async function evaluateAndSaveLiveThumbnail(streamId, base64Frame) {
  try {
    const { db } = await import('./db.js');
    const stream = db.prepare('SELECT * FROM live_streams WHERE id = ?').get(streamId);
    if (!stream) return { success: false, error: 'Stream not found' };

    const thumbFilename = `stream-live-${streamId}.jpg`;
    const thumbFilepath = resolve(PROJECT_ROOT, 'uploads', thumbFilename);
    const existingExists = existsSync(thumbFilepath);

    const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6Ibefzv1Qg_EhvT4-Vb08D9zyROA5_QSmTdLRYIMditJg';

    // Phase 1: Simple blank / blurry check if this is the first capture
    if (!existingExists) {
      console.log(`[Live Thumbnail] Evaluating first frame capture for stream ${streamId}...`);
      
      const promptText = `You are an AI Image Quality Assessor.
Analyze this live stream preview frame.
Identify if this frame is blank (solid black/white/gray screen), loading screen, heavily out of focus/blurry, or corrupted.
Return a raw JSON object only matching this exact structure:
{
  "isValid": true,
  "reason": "Clear frame check complete."
}`;

      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType: 'image/jpeg', data: base64Frame } },
                { text: promptText }
              ]
            }]
          })
        });

        if (res.ok) {
          const data = await res.json();
          const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const cleanJsonText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
          const resObj = JSON.parse(cleanJsonText);

          if (resObj && resObj.isValid === false) {
            console.warn(`[Live Thumbnail] Rejected first frame for stream ${streamId}: ${resObj.reason}`);
            return { success: false, retry: true, reason: resObj.reason };
          }
        }
      } catch (e) {
        console.warn('[Live Thumbnail] Gemini check failed, accepting frame by default:', e.message);
      }

      // Save first frame
      writeFileSync(thumbFilepath, Buffer.from(base64Frame, 'base64'));
      db.prepare('UPDATE live_streams SET thumbnail_file = ? WHERE id = ?').run(thumbFilename, streamId);
      console.log(`[Live Thumbnail] Set initial thumbnail for stream ${streamId}`);
      return { success: true };
    }

    // Phase 2: Compare existing thumbnail with new preview frame
    console.log(`[Live Thumbnail] Comparing new frame with current thumbnail for stream ${streamId}...`);
    const currentBase64 = readFileSync(thumbFilepath).toString('base64');

    const promptText = `You are an AI Live Stream Thumbnail Selector.
Compare the current live stream thumbnail (Image 1) against this new candidate preview frame (Image 2).
Assess if the new candidate frame (Image 2) is significantly better quality (e.g. contains a clearer face, has better lighting, shows higher activity/engagement, and is sharp/in focus) than the current one (Image 1).
Avoid minor quality differences to optimize performance.
Return a raw JSON object matching this structure:
{
  "isSignificantlyBetter": false,
  "reason": "Comparison complete."
}`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: currentBase64 } },
              { inlineData: { mimeType: 'image/jpeg', data: base64Frame } },
              { text: promptText }
            ]
          }]
        })
      });

      if (res.ok) {
        const data = await res.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanJsonText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const resObj = JSON.parse(cleanJsonText);

        if (resObj && resObj.isSignificantlyBetter === true) {
          console.log(`[Live Thumbnail] Overwriting thumbnail for stream ${streamId}: ${resObj.reason}`);
          writeFileSync(thumbFilepath, Buffer.from(base64Frame, 'base64'));
          return { success: true, updated: true };
        } else {
          console.log(`[Live Thumbnail] Retained existing thumbnail: ${resObj?.reason || 'No significant improvement.'}`);
          return { success: true, updated: false };
        }
      }
    } catch (e) {
      console.warn('[Live Thumbnail] Gemini comparison failed, retaining current frame:', e.message);
    }

    return { success: true, updated: false };
  } catch (err) {
    console.error('[Live Thumbnail Error]:', err.message);
    return { success: false, error: err.message };
  }
}

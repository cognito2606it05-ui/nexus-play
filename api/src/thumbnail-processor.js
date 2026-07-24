import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import ffmpegPath from 'ffmpeg-static';
import Jimp from 'jimp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

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
 * Extract a single frame from a video at a specific timestamp.
 */
export function extractFrameAtTime(videoPath, outputPath, timestampSeconds) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hrs = Math.floor(timestampSeconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((timestampSeconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (timestampSeconds % 60).toFixed(3).padStart(6, '0');
    const timeStr = `${hrs}:${mins}:${secs}`;

    const args = [
      '-ss', timeStr,
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '2',
      outputPath,
      '-y'
    ];

    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`ffmpeg frame extraction exited with code ${code}. Stderr: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      rejectPromise(err);
    });
  });
}

/**
 * Resizes and optimizes an image using Jimp, improving brightness, contrast, sharpness, and color saturation.
 */
export async function optimizeImageJimp(inputPath, outputPath, targetWidth = 800) {
  try {
    const image = await Jimp.read(inputPath);
    // Resize to targetWidth while maintaining aspect ratio
    image.resize(targetWidth, Jimp.AUTO);
    
    // Improve Contrast and Brightness
    image.contrast(0.12);
    image.brightness(0.05);
    
    // Improve Sharpness using a standard 3x3 sharpening convolution kernel
    const sharpenKernel = [
      [ 0, -1,  0],
      [-1,  5, -1],
      [ 0, -1,  0]
    ];
    image.convolute(sharpenKernel);
    
    // Improve Color balance / saturation
    image.color([
      { apply: 'saturate', params: [12] }
    ]);

    await image.writeAsync(outputPath);
    console.log(`[Thumbnail Processor] Optimized image written to ${outputPath}`);
  } catch (err) {
    console.error('[Thumbnail Processor] Jimp optimization error:', err);
    throw err;
  }
}

/**
 * Invokes Gemini API to choose the best frame based on general quality or sports-specific criteria.
 */
export async function chooseBestFrameWithGemini(options, isSports) {
  const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6Ibefzv1Qg_EhvT4-Vb08D9zyROA5_QSmTdLRYIMditJg';
  
  const base64Parts = options.map(opt => ({
    inlineData: {
      data: opt.base64,
      mimeType: 'image/jpeg'
    }
  }));

  const criteria = isSports 
    ? `For Sports videos, prioritize candidate frames that contain:
- Sports players, athletes
- The ball or sports equipment
- The stadium or field
- Action moments, dynamic gameplay
- Celebrations, high energy emotion
Avoid: empty fields, black screens, motion blur.`
    : `For general videos and reels, prioritize candidate frames that contain:
- Sharp, clear human faces (good expressions, eye contact)
- Readable, non-cropped text
- Engagement (vibrant objects, action scenes)
Avoid: blurry, dark, transition, solid black, solid color, or loading screens.`;

  const promptText = `You are an AI Video Cover/Thumbnail Selector.
Analyze the ${options.length} candidate frames provided (ordered from Option 1 to Option ${options.length}) extracted from a video.
Identify the best option for a video cover/thumbnail.

Evaluation Criteria:
${criteria}

Ratings Criteria:
- Detect and rate each Option out of 10.
- If any Option contains a solid color, loading screen, transition frame, or is completely blurry/black, rate it 1.
- You must find the highest quality frame that meets the criteria.

Return a JSON object with this exact structure (no markdown code block formatting, no backticks, just raw JSON text):
{
  "recommendedOption": 1,
  "reason": "Option 1 has the clearest facial expression and high lighting contrast.",
  "ratings": [9, 7, 5, 6, 2]
}`;

  const parts = [...base64Parts, { text: promptText }];

  try {
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
        return {
          recommendedOption: parseInt(resObj.recommendedOption, 10),
          reason: resObj.reason || 'Gemini selected option.',
          ratings: resObj.ratings || []
        };
      }
    } else {
      console.warn('[Thumbnail Processor] Gemini ranking request failed with status:', res.status);
    }
  } catch (err) {
    console.warn('[Thumbnail Processor] Gemini ranking failed:', err.message);
  }

  return null;
}

/**
 * Automates candidate extraction, Gemini selection, and Jimp optimization for videos.
 */
export async function generateAutoThumbnail({ videoPath, category = '', title = '', outputFilename }) {
  const tempId = randomUUID();
  const outputPath = resolve(PROJECT_ROOT, 'uploads', outputFilename);
  
  if (!existsSync(videoPath)) {
    throw new Error(`Video file not found at ${videoPath}`);
  }

  // 1. Get duration and calculate timestamps (10%, 25%, 40%, 60%, 80%)
  const duration = await getVideoDuration(videoPath);
  const baseDuration = duration > 0 ? duration : 10;
  
  const percentages = [0.10, 0.25, 0.40, 0.60, 0.80];
  const timestamps = percentages.map(p => Math.max(0.2, baseDuration * p));

  const candidates = [];
  
  // 2. Extract 5 candidate frames
  for (let i = 0; i < timestamps.length; i++) {
    const tempFilename = `temp-frame-${tempId}-${i + 1}.jpg`;
    const tempPath = resolve(PROJECT_ROOT, 'uploads', tempFilename);
    try {
      await extractFrameAtTime(videoPath, tempPath, timestamps[i]);
      if (existsSync(tempPath)) {
        const base64 = readFileSync(tempPath).toString('base64');
        candidates.push({
          id: i + 1,
          filepath: tempPath,
          base64
        });
      }
    } catch (err) {
      console.warn(`[Thumbnail Processor] Failed to extract frame ${i + 1} at ${timestamps[i]}s:`, err.message);
    }
  }

  if (candidates.length === 0) {
    throw new Error('Failed to extract any candidate frames from the video.');
  }

  // 3. Compare frames with Gemini AI
  const isSports = category.toLowerCase().includes('sport') || title.toLowerCase().includes(' vs ');
  let chosenCandidate = candidates[0];

  const geminiResult = await chooseBestFrameWithGemini(candidates, isSports);
  if (geminiResult && geminiResult.recommendedOption) {
    const found = candidates.find(c => c.id === geminiResult.recommendedOption);
    if (found) {
      chosenCandidate = found;
      console.log(`[Thumbnail Processor] Gemini selected option ${found.id} for category ${category}. Reason: ${geminiResult.reason}`);
    }
  } else {
    console.warn('[Thumbnail Processor] Gemini comparison failed or returned invalid selection. Falling back to first clear frame.');
  }

  // 4. Optimize the chosen frame using Jimp and write to final path
  try {
    await optimizeImageJimp(chosenCandidate.filepath, outputPath, 800);
  } catch (optErr) {
    console.warn('[Thumbnail Processor] Jimp optimization failed, copying raw frame instead:', optErr.message);
    writeFileSync(outputPath, readFileSync(chosenCandidate.filepath));
  }

  // 5. Clean up temporary files asynchronously
  for (const c of candidates) {
    try {
      if (existsSync(c.filepath)) {
        unlinkSync(c.filepath);
      }
    } catch (e) {}
  }

  return outputFilename;
}

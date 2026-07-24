import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { PROJECT_ROOT, mediaUrl } from './config.js';
import { db } from './db.js';
import { publishAll } from './events.js';
import ffmpegPath from 'ffmpeg-static';

let activeCompositorProcess = null;
let currentBroadcastId = null;

export async function updateMasterBroadcast(broadcastId) {
  const broadcast = db.prepare('SELECT * FROM studio_broadcasts WHERE id = ?').get(broadcastId);
  if (!broadcast) return;

  currentBroadcastId = broadcastId;

  // Kill existing compositor process if any
  if (activeCompositorProcess) {
    try {
      activeCompositorProcess.kill('SIGKILL');
    } catch (e) {}
    activeCompositorProcess = null;
  }

  // Create target master output directory
  const outputDir = resolve(PROJECT_ROOT, 'uploads', 'live', 'master');
  mkdirSync(outputDir, { recursive: true });

  const promotedKeys = JSON.parse(broadcast.promoted_streams || '[]');
  const layoutMode = broadcast.layout_mode || 'single';

  // We need to construct inputs
  const inputs = [];
  const filtergraph = [];
  let audioInputs = [];

  // Standby fallback video input 0 (always input 0 to prevent crashes if no stream is active)
  const introPath = resolve(PROJECT_ROOT, 'uploads', 'intro.mp4');
  inputs.push('-stream_loop', '-1', '-i', introPath);

  // Logo input 1 (always input 1)
  const logoPath = resolve(PROJECT_ROOT, 'logo.png');
  inputs.push('-i', logoPath);

  // Add active streams as inputs (starting at input index 2)
  const activeStreams = [];
  for (const streamKey of promotedKeys) {
    const rtmpUrl = `rtmp://localhost:1935/live/${streamKey}`;
    // Verify stream is active in db
    const rStream = db.prepare("SELECT status FROM reporter_streams WHERE stream_key = ?").get(streamKey);
    if (rStream && rStream.status === 'live') {
      activeStreams.push({
        key: streamKey,
        inputIndex: inputs.length / 2, // calculate index
        rtmpUrl
      });
      inputs.push('-i', rtmpUrl);
    }
  }

  // Build Filter Complex based on Layout Mode
  let videoOutLabel = '[v_layout]';
  let audioOutLabel = '[a_layout]';

  if (activeStreams.length === 0) {
    // 1. Fallback: Loop intro.mp4
    filtergraph.push('[0:v]scale=1280:720[v_layout]');
    filtergraph.push('[0:a]volume=0.3[a_layout]');
  } else if (layoutMode === 'single' || activeStreams.length === 1) {
    // 2. Single layout
    const srcIndex = activeStreams[0].inputIndex;
    filtergraph.push(`[${srcIndex}:v]scale=1280:720[v_layout]`);
    filtergraph.push(`[${srcIndex}:a]volume=1.0[a_layout]`);
  } else if (layoutMode === 'split-2' && activeStreams.length >= 2) {
    // 3. Split 50/50 layout
    const idx0 = activeStreams[0].inputIndex;
    const idx1 = activeStreams[1].inputIndex;
    filtergraph.push(
      `[${idx0}:v]scale=640:720[split_v0];`,
      `[${idx1}:v]scale=640:720[split_v1];`,
      `nullsrc=size=1280x720[base];`,
      `[base][split_v0]overlay=x=0:y=0[base_v1];`,
      `[base_v1][split_v1]overlay=x=640:y=0[v_layout]`
    );
    filtergraph.push(`[${idx0}:a][${idx1}:a]amix=inputs=2[a_layout]`);
  } else if (layoutMode === 'pip' && activeStreams.length >= 2) {
    // 4. Picture-in-Picture layout (stream 0 full screen, stream 1 in corner)
    const idx0 = activeStreams[0].inputIndex;
    const idx1 = activeStreams[1].inputIndex;
    filtergraph.push(
      `[${idx0}:v]scale=1280:720[pip_main];`,
      `[${idx1}:v]scale=320:180[pip_overlay];`,
      `[pip_main][pip_overlay]overlay=x=main_w-340:y=20[v_layout]`
    );
    filtergraph.push(`[${idx0}:a][${idx1}:a]amix=inputs=2[a_layout]`);
  } else {
    // 5. Quad (4) layout
    const vLabels = [];
    const aLabels = [];
    const limit = Math.min(activeStreams.length, 4);
    for (let i = 0; i < limit; i++) {
      const idx = activeStreams[i].inputIndex;
      filtergraph.push(`[${idx}:v]scale=640:360[quad_v${i}];`);
      vLabels.push(`[quad_v${i}]`);
      aLabels.push(`[${idx}:a]`);
    }
    
    // Fill remaining grids if less than 4
    for (let i = limit; i < 4; i++) {
      filtergraph.push(`[0:v]scale=640:360[quad_v${i}];`);
      vLabels.push(`[quad_v${i}]`);
    }

    filtergraph.push(
      `nullsrc=size=1280x720[quad_base];`,
      `[quad_base]${vLabels[0]}overlay=x=0:y=0[quad_t0];`,
      `[quad_t0]${vLabels[1]}overlay=x=640:y=0[quad_t1];`,
      `[quad_t1]${vLabels[2]}overlay=x=0:y=360[quad_t2];`,
      `[quad_t2]${vLabels[3]}overlay=x=640:y=360[v_layout]`
    );

    if (aLabels.length > 0) {
      filtergraph.push(`${aLabels.join('')}amix=inputs=${aLabels.length}[a_layout]`);
    } else {
      filtergraph.push(`[0:a]volume=0.1[a_layout]`);
    }
  }

  // Burn-in Graphics Overlays: Watermark Logo
  let finalVideoChain = '[v_layout]';
  if (broadcast.show_logo) {
    // Input 1 is the logo. Scale and overlay on top right.
    filtergraph.push(
      `${finalVideoChain}[1:v]overlay=x=main_w-150:y=20[v_logo_burn]`
    );
    finalVideoChain = '[v_logo_burn]';
  }

  // Lower Third Labels (names of active reporters)
  let lowerThirdCount = 0;
  for (const stream of activeStreams) {
    const profile = db.prepare('SELECT name, location FROM profiles WHERE id = (SELECT profile_id FROM stream_keys WHERE stream_key = ?)').get(stream.key);
    if (profile) {
      const nameText = (profile.name || '').toUpperCase().replace(/'/g, '');
      const locText = (profile.location || 'Field').toUpperCase().replace(/'/g, '');
      
      // Determine lower third display coordinates based on layout
      let x = 30;
      let y = 600;
      
      if (layoutMode === 'split-2' && lowerThirdCount === 1) {
        x = 670;
      } else if (layoutMode === 'quad') {
        if (lowerThirdCount === 1) x = 670;
        else if (lowerThirdCount === 2) { x = 30; y = 30; }
        else if (lowerThirdCount === 3) { x = 670; y = 30; }
      }

      filtergraph.push(
        `${finalVideoChain}drawtext=text='${nameText}':x=${x}:y=${y}:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6,drawtext=text='📍 ${locText}':x=${x}:y=${y+30}:fontsize=14:fontcolor=0xFFEE00:box=1:boxcolor=black@0.6:boxborderw=4[v_rep_${lowerThirdCount}]`
      );
      finalVideoChain = `[v_rep_${lowerThirdCount}]`;
      lowerThirdCount++;
    }
  }

  // Scrolling News Ticker Overlay
  if (broadcast.ticker_text && broadcast.ticker_text.trim().length > 0) {
    const cleanTicker = broadcast.ticker_text.replace(/'/g, '');
    const tickerColor = broadcast.breaking_news ? 'red@0.8' : '0x0F172A@0.8';
    
    // Ticker Background Band (black bar at bottom) + Scrolling Text
    filtergraph.push(
      `${finalVideoChain}drawbox=x=0:y=h-45:w=w:h=45:color=${tickerColor}:t=fill,drawtext=text='${cleanTicker}':x=w-mod(t*90\\,w+1800):y=h-30:fontsize=18:fontcolor=white[v_ticker]`
    );
    finalVideoChain = '[v_ticker]';
  }

  // Add final output labels
  filtergraph.push(`${finalVideoChain}copy[out_v]`);
  filtergraph.push(`${audioOutLabel}copy[out_a]`);

  const filterString = filtergraph.join(' ');

  // Output Paths
  const masterHlsPath = resolve(outputDir, 'index.m3u8');
  const masterRecordPath = resolve(PROJECT_ROOT, 'uploads', `broadcast-rec-${broadcastId}.mp4`);

  const ffmpegArgs = [
    ...inputs,
    '-filter_complex', filterString,
    '-map', '[out_v]',
    '-map', '[out_a]',
    
    // HLS output
    '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2000k', '-maxrate', '2000k', '-bufsize', '4000k',
    '-c:a', 'aac', '-b:a', '128k',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '6',
    '-hls_flags', 'delete_segments',
    masterHlsPath,

    // High quality local MP4 recording
    '-map', '[out_v]',
    '-map', '[out_a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-f', 'mp4',
    '-y',
    masterRecordPath
  ];

  console.log(`[Compositor] Spawning Master Compositor Process for Layout: ${layoutMode}`);
  const compositorProc = spawn(ffmpegPath, ffmpegArgs);

  compositorProc.stderr.on('data', (data) => {
    // console.log('[Compositor FFmpeg Debug]', data.toString().trim());
  });

  compositorProc.on('close', (code) => {
    console.log(`[Compositor] FFmpeg exited with code ${code}`);
    if (activeCompositorProcess === compositorProc) {
      activeCompositorProcess = null;
    }
  });

  activeCompositorProcess = compositorProc;
}

export async function stopMasterBroadcast(broadcastId, req) {
  if (activeCompositorProcess) {
    console.log('[Compositor] Terminating active Master Compositor Process...');
    try {
      activeCompositorProcess.kill('SIGKILL');
    } catch (e) {}
    activeCompositorProcess = null;
  }

  // Update broadcast record status in database
  db.prepare(`
    UPDATE studio_broadcasts 
    SET status = 'ended', ended_at = ? 
    WHERE id = ?
  `).run(Date.now(), broadcastId);

  // Archive and package the master recording
  const recordPath = resolve(PROJECT_ROOT, 'uploads', `broadcast-rec-${broadcastId}.mp4`);
  if (existsSync(recordPath)) {
    console.log(`[Compositor] Finalizing master broadcast recording: ${recordPath}`);
    
    // Copy/finalize as a public news stream entry
    const newsId = `studio-broadcast-archive-${broadcastId}`;
    const startedAt = db.prepare('SELECT started_at FROM studio_broadcasts WHERE id = ?').get(broadcastId)?.started_at || Date.now();
    const durationMins = Math.max(1, Math.ceil((Date.now() - startedAt) / 60000));
    
    // Setup metadata
    const nowStr = new Date().toISOString();
    const broadcastTitle = `Studio Master Broadcast - ${new Date(startedAt).toLocaleDateString()}`;
    const broadcastSummary = `NEXUS AI Master Archive: Program broadcast composite. Duration: ${durationMins} minutes.`;
    const broadcastBody = `Recorded program feed from the Producer Control Studio room dashboard. Contains merged live feeds and graphics layers.`;
    const thumbnailFilename = `broadcast-cover-${broadcastId}.jpg`;
    const localThumbPath = resolve(PROJECT_ROOT, 'uploads', thumbnailFilename);

    let finalVideoUrl = mediaUrl(req, 'uploads', `broadcast-rec-${broadcastId}.mp4`);
    let finalThumbUrl = mediaUrl(req, 'uploads', 'live-General.jpg');

    // Generate auto thumbnail from composite recording
    try {
      const { generateAutoThumbnail } = await import('./thumbnail-processor.js');
      await generateAutoThumbnail({
        videoPath: recordPath,
        category: 'Live TV',
        title: 'Master Broadcast',
        outputFilename: thumbnailFilename
      });

      if (existsSync(localThumbPath)) {
        finalThumbUrl = mediaUrl(req, 'uploads', thumbnailFilename);
      }
    } catch (err) {
      console.error('[Compositor Archive] Thumbnail extraction failed:', err);
    }

    try {
      db.prepare(`
        INSERT INTO news (id, title, summary, body, category, source, is_breaking, image_url, video_url, read_minutes, published_at, region, district)
        VALUES (?, ?, ?, ?, 'Past Live Streams', 'Studio Master', 1, ?, ?, ?, ?, 'Delhi/North', 'New Delhi')
        ON CONFLICT (id) DO UPDATE SET video_url = EXCLUDED.video_url
      `).run(
        newsId,
        broadcastTitle,
        broadcastSummary,
        broadcastBody,
        finalThumbUrl,
        finalVideoUrl,
        durationMins,
        nowStr
      );
      console.log(`[Compositor Archive] Registered master broadcast in news feed.`);
    } catch (dbErr) {
      console.error('[Compositor Archive] Database insertion failed:', dbErr);
    }
  }

  // Publish broadcast ended event to listeners
  publishAll({
    type: 'master_broadcast_ended',
    payload: { id: broadcastId }
  });
}

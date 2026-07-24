import ffmpeg from 'ffmpeg-static';
import { execFile } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Jimp from 'jimp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

/**
 * Extracts a single frame from the video at 2.0s using ffmpeg-static.
 */
function extractFrame(videoPath, outputPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const args = [
      '-y',
      '-ss', '00:00:02',
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      outputPath
    ];
    execFile(ffmpeg, args, (error) => {
      if (error) {
        rejectPromise(error);
      } else {
        resolvePromise();
      }
    });
  });
}

/**
 * Draws a solid color rectangle pill.
 */
function drawPill(img, x, y, w, h, colorHex) {
  const r = parseInt(colorHex.slice(1, 3), 16);
  const g = parseInt(colorHex.slice(3, 5), 16);
  const b = parseInt(colorHex.slice(5, 7), 16);

  img.scan(x, y, w, h, function (px, py, idx) {
    this.bitmap.data[idx] = r;
    this.bitmap.data[idx + 1] = g;
    this.bitmap.data[idx + 2] = b;
  });
}

/**
 * Applies a smooth top-down linear gradient overlay to a specific region.
 */
function applyDarkGradient(img, startY, height, maxAlpha = 220, isTopDown = true) {
  img.scan(0, startY, 800, height, function (x, y, idx) {
    const relativeY = y - startY;
    const ratio = isTopDown ? (relativeY / height) : ((height - relativeY) / height);
    const targetAlpha = Math.round(ratio * maxAlpha);

    const r = this.bitmap.data[idx];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];

    const alphaRatio = targetAlpha / 255;
    this.bitmap.data[idx] = Math.round(r * (1 - alphaRatio));
    this.bitmap.data[idx + 1] = Math.round(g * (1 - alphaRatio));
    this.bitmap.data[idx + 2] = Math.round(b * (1 - alphaRatio));
  });
}

/**
 * Main function to generate professional YouTube-style thumbnails.
 */
export async function generateProfessionalThumbnail({
  videoPath,
  title = 'NEXUS NEWS UPDATE',
  category = 'News',
  isBreaking = false,
  isLive = false,
  location = ''
}) {
  const thumbnailId = Math.random().toString(36).substring(2, 11);
  const tempFramePath = resolve(PROJECT_ROOT, 'uploads', `temp-frame-${thumbnailId}.jpg`);
  const finalFilename = `thumb-generated-${thumbnailId}.jpg`;
  const finalPath = resolve(PROJECT_ROOT, 'uploads', finalFilename);

  let frameExtracted = false;

  // 1. Extract frame using ffmpeg
  if (videoPath && existsSync(videoPath)) {
    try {
      await extractFrame(videoPath, tempFramePath);
      frameExtracted = existsSync(tempFramePath);
    } catch (e) {
      console.warn('[Thumbnail Generator] Frame extraction failed:', e.message);
    }
  }

  // 2. Load background canvas (use stock photo as fallback)
  let image;
  const isSports = category.toLowerCase().includes('sport') || title.toLowerCase().includes(' vs ');

  if (frameExtracted) {
    try {
      image = await Jimp.read(tempFramePath);
    } catch (err) {
      console.warn('[Thumbnail Generator] Failed to read extracted frame:', err.message);
    }
  }

  if (!image) {
    // Fall back to pre-seeded stock background images
    const stockFilename = isSports ? 'default-sports-thumbnail.jpg' : 'default-news-thumbnail.jpg';
    const stockPath = resolve(PROJECT_ROOT, 'uploads', stockFilename);
    try {
      image = await Jimp.read(stockPath);
    } catch (e) {
      // Hard fallback if stock image is missing
      image = new Jimp(800, 450, 0x1e293bff);
    }
  }

  // 3. Resize and crop to 16:9 HD standard
  image.cover(800, 450);

  // Load typography fonts
  const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  const fontBadge = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

  if (isSports) {
    // ==========================================
    // SPORTS COVER TEMPLATE
    // ==========================================
    
    // Check if it's a VS match
    const vsRegex = /\s+vs\.?\s+/i;
    const isVsMatch = vsRegex.test(title);

    if (isVsMatch) {
      const parts = title.split(vsRegex);
      const teamA = parts[0].trim();
      const teamB = parts[1].trim();

      // Draw stylized diagonal split overlays (Blue vs Gold)
      image.scan(0, 0, 800, 450, function (x, y, idx) {
        const splitX = 340 + Math.round((y / 450) * 120);
        const r = this.bitmap.data[idx];
        const g = this.bitmap.data[idx + 1];
        const b = this.bitmap.data[idx + 2];

        if (x < splitX) {
          // Team A Blue Tint (blend 30% deep blue)
          this.bitmap.data[idx] = Math.round(r * 0.7 + 13 * 0.3);
          this.bitmap.data[idx + 1] = Math.round(g * 0.7 + 148 * 0.3);
          this.bitmap.data[idx + 2] = Math.round(b * 0.7 + 136 * 0.3);
        } else {
          // Team B Gold/Crimson Tint (blend 30% red-purple)
          this.bitmap.data[idx] = Math.round(r * 0.7 + 220 * 0.3);
          this.bitmap.data[idx + 1] = Math.round(g * 0.7 + 38 * 0.3);
          this.bitmap.data[idx + 2] = Math.round(b * 0.7 + 38 * 0.3);
        }
      });

      // Draw middle "VS" circle
      image.scan(340, 165, 120, 120, function (px, py, idx) {
        const distSq = Math.pow(px - 400, 2) + Math.pow(py - 225, 2);
        if (distSq <= Math.pow(42, 2)) {
          // Yellow center
          this.bitmap.data[idx] = 254;
          this.bitmap.data[idx + 1] = 240;
          this.bitmap.data[idx + 2] = 138;
        } else if (distSq <= Math.pow(46, 2)) {
          // Black border
          this.bitmap.data[idx] = 15;
          this.bitmap.data[idx + 1] = 23;
          this.bitmap.data[idx + 2] = 42;
        }
      });

      // Print VS text inside circle
      const fontVs = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
      image.print(fontVs, 350, 206, { text: 'VS', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 100);

      // Print Team names
      image.print(
        fontTitle,
        20,
        200,
        { text: teamA.toUpperCase(), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER },
        300
      );
      image.print(
        fontTitle,
        480,
        200,
        { text: teamB.toUpperCase(), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER },
        300
      );
    } else {
      // Print centered title over dark scoreboard block
      applyDarkGradient(image, 240, 210, 200, false);
      image.print(
        fontTitle,
        40,
        300,
        { text: title.toUpperCase(), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER },
        720
      );
    }

    // Top tournament/match center banner
    const tournament = title.toLowerCase().includes('ipl') ? 'IPL T20' : 
                       title.toLowerCase().includes('cup') ? 'WORLD CUP' : 'SPORTS LIVE';
    drawPill(image, 280, 20, 240, 36, '#1E293B');
    image.print(
      fontBadge,
      280,
      29,
      { text: tournament.toUpperCase(), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER },
      240
    );

    // LIVE Indicator (Top-Left)
    drawPill(image, 20, 20, 80, 30, '#EF4444');
    image.print(fontBadge, 20, 26, { text: 'LIVE', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 80);

    // Brand Watermark (Bottom-Right)
    drawPill(image, 640, 400, 140, 30, '#0D47A1');
    image.print(fontBadge, 640, 406, { text: 'NEXUS PLAY', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 140);

  } else {
    // ==========================================
    // NEWS COVER TEMPLATE
    // ==========================================
    
    // Draw cinematic bottom linear gradient for headline readability
    applyDarkGradient(image, 220, 230, 240, false);

    // Print Main News Headline
    image.print(
      fontTitle,
      30,
      280,
      {
        text: title,
        alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
        alignmentY: Jimp.VERTICAL_ALIGN_BOTTOM
      },
      740,
      110
    );

    // Live Badge (Top-Left)
    if (isLive) {
      drawPill(image, 30, 30, 80, 34, '#EF4444');
      image.print(fontBadge, 30, 38, { text: 'LIVE', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 80);
    }

    // Breaking News Banner (Top-Right)
    if (isBreaking) {
      drawPill(image, 570, 30, 200, 34, '#F59E0B');
      const fontBadgeBlack = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
      image.print(fontBadgeBlack, 570, 38, { text: 'BREAKING NEWS', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 200);
    }

    // Category Badge (Bottom-Left)
    drawPill(image, 30, 400, 110, 28, '#3B82F6');
    image.print(fontBadge, 30, 405, { text: category.toUpperCase(), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 110);

    // Location tag if present
    if (location) {
      drawPill(image, 150, 400, 130, 28, '#475569');
      image.print(fontBadge, 150, 405, { text: `📍 ${location.toUpperCase()}`, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 130);
    }

    // Brand Watermark logo (Bottom-Right)
    drawPill(image, 660, 400, 110, 28, '#0D47A1');
    image.print(fontBadge, 660, 405, { text: 'NEXUS', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 110);
  }

  // 4. Save and return cover URL
  await image.writeAsync(finalPath);

  // Clean up temp extracted frame asynchronously
  if (frameExtracted && existsSync(tempFramePath)) {
    try {
      import('node:fs').then(({ unlinkSync }) => unlinkSync(tempFramePath));
    } catch (e) {}
  }

  console.log(`[Thumbnail Generator] Generated cover saved successfully: ${finalFilename}`);
  return finalFilename;
}

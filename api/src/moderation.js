import { config, PROJECT_ROOT } from './config.js';
import { db } from './db.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Moderate news, posts, or reels content via Gemini.
 * Detects sensitive themes (violence, nudity, self-harm, adult content)
 * and returns neutralization flags instead of simple rejection.
 */
export async function moderateUploadContent(title, body, base64Image = null, targetLang = 'None', imageName = null, base64Video = null) {
  const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6Ibefzv1Qg_EhvT4-Vb08D9zyROA5_QSmTdLRYIMditJg';
  
  // Load local profanity datasets
  let teluguDataset = [];
  let enDataset = [];
  let hiDataset = [];
  try {
    let rootPath = resolve(PROJECT_ROOT, '..');
    let teluguPath = resolve(rootPath, 'telugu_moderation_dataset.json');
    if (!existsSync(teluguPath)) {
      rootPath = resolve(PROJECT_ROOT, '../..');
      teluguPath = resolve(rootPath, 'telugu_moderation_dataset.json');
    }
    
    if (existsSync(teluguPath)) {
      teluguDataset = JSON.parse(readFileSync(teluguPath, 'utf8'));
    }
    const enPath = resolve(rootPath, 'en');
    if (existsSync(enPath)) {
      enDataset = readFileSync(enPath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
    }
    const hiPath = resolve(rootPath, 'hi');
    if (existsSync(hiPath)) {
      hiDataset = readFileSync(hiPath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
    }
  } catch (err) {
    console.error('Failed to load moderation dictionaries:', err);
  }

  function getPhoneticVariations(word) {
    const variations = new Set([word]);
    if (word.includes('oo')) {
      variations.add(word.replace(/oo/g, 'u'));
    }
    if (word.includes('u')) {
      variations.add(word.replace(/u/g, 'oo'));
    }
    if (word.includes('ee')) {
      variations.add(word.replace(/ee/g, 'i'));
    }
    if (word.includes('i')) {
      variations.add(word.replace(/i/g, 'ee'));
    }
    // simplify double consonants (e.g. 'dd' -> 'd', 'kk' -> 'k')
    const doubleConsonants = /(b|c|d|f|g|h|j|k|l|m|n|p|q|r|s|t|v|w|x|y|z)\1/gi;
    if (doubleConsonants.test(word)) {
      variations.add(word.replace(doubleConsonants, '$1'));
    }
    return Array.from(variations);
  }

  // Create unified sensitive words set for local regex validation
  const localSensitiveWords = new Set();
  const defaults = [
    'blood', 'weapons', 'kill', 'suicide', 'abuse', 'naked', 'explicit', 'adult', 
    'violence', 'injury', 'injured', 'dead', 'murder', 'accident', 'crash', 'wounded'
  ];
  defaults.forEach(w => localSensitiveWords.add(w.toLowerCase()));
  enDataset.forEach(w => { if (w.length > 2) localSensitiveWords.add(w.toLowerCase()); });
  hiDataset.forEach(w => { if (w.length > 2) localSensitiveWords.add(w.toLowerCase()); });
  teluguDataset.forEach(item => {
    if (item.english && item.english.length > 2) {
      const engLower = item.english.toLowerCase();
      localSensitiveWords.add(engLower);
      getPhoneticVariations(engLower).forEach(v => localSensitiveWords.add(v));
    }
    if (item.telugu && item.telugu.length > 1) {
      localSensitiveWords.add(item.telugu.toLowerCase());
    }
    if (item.transliteration && item.transliteration.length > 2) {
      const transLower = item.transliteration.toLowerCase();
      localSensitiveWords.add(transLower);
      getPhoneticVariations(transLower).forEach(v => localSensitiveWords.add(v));
    }
  });

  const sensitiveWordsList = Array.from(localSensitiveWords);
  const combinedText = ((title || '') + ' ' + (body || '') + ' ' + (imageName || '')).toLowerCase();

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const containsSensitiveWord = sensitiveWordsList.some(w => {
    const isAscii = /^[a-z0-9\s_'-]+$/i.test(w);
    if (isAscii) {
      const regex = new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i');
      return regex.test(combinedText);
    } else {
      return combinedText.includes(w);
    }
  });

  // Build high-end moderation engine system prompt
  const textPrompt = `# Advanced AI Content Moderation System Prompt (English + Telugu + Hindi)

You are an enterprise-grade AI Content Moderation Engine designed to detect, analyze, classify, and moderate harmful or inappropriate user-generated content in **English, Telugu (తెలుగు), Romanized Telugu (Tanglish/Roman Telugu), Hindi (हिंदी), Roman Hindi, and mixed-language conversations**.

Your primary responsibility is to provide highly accurate, context-aware moderation while minimizing false positives and false negatives.

---

## Knowledge Base

You have access to the moderation dataset containing an extensive collection of offensive language (English profanity, Telugu profanity, Romanized Telugu profanity, Hindi profanity, common spelling variations, intentional obfuscations, slang, abusive phrases, vulgar expressions, contextual meanings, alternative spellings).
Below is the moderation dataset in JSON format:
${JSON.stringify(teluguDataset, null, 2)}

Treat this dataset as your primary profanity reference while also using contextual language understanding to detect offensive content that may not exactly match the dataset.

---

## Primary Objective & Detection Capabilities

Analyze every user message and determine whether it contains any form of inappropriate content.
Evaluate the message for: profanity, vulgar language, Telugu "Buthulu", swear words, abusive language, personal attacks, harassment, bullying, sexual insults, explicit sexual language, hate speech, threats, graphic violence, toxicity, discriminatory language, obscene expressions, derogatory remarks, offensive slang, masked profanity, intentionally misspelled profanity, emoji-based offensive expressions, and mixed-language profanity.

Detect offensive language written in: English, Telugu Script, Roman Telugu, Hindi Script, English + Telugu mixed text, Hinglish, Tanglish-style Telugu, SMS language, chat abbreviations, and internet slang.

---

## Context-Aware Moderation & Severity Classification

Do not rely solely on keyword matching. Analyze overall sentence meaning, user intent, tone, context, target of the message, conversational flow, and whether profanity is quoted, discussed academically, or directed abusively.
Differentiate between: educational discussion, news reporting, quoted text, casual conversation, direct abuse, hate speech, harassment, explicit attacks.
Profanity used aggressively should receive higher severity than profanity used in explanatory or educational contexts.

Classify content severity level into:
- None: No moderation issues detected.
- Mild: Contains minor profanity or slang with low harmful intent.
- Medium: Contains repeated profanity, insults, harassment, or offensive expressions.
- Severe: Contains extreme profanity, sexual abuse, graphic sexual language, hate speech, violent threats, serious harassment, highly offensive Telugu or English abuse, or multiple severe violations.

---

## Output Requirements

Analyze the following submission:
Title: "${title || ''}"
Content: "${body || ''}"
Target Translation Language: "${targetLang || 'None'}"

You must perform the following tasks:
1. OCR (Optical Character Recognition):
   - If an image is provided, extract any visible text from the image and write it in the "ocrText" field. If no text is found or no image is provided, return "".
2. Moderation & Safety Scan (Visual and Textual):
   - Scan the text and any provided image or video for nudity, violence, or 18+ content.
   - If present, set "needsBlur" to true and provide a "blurReason". Identify specific visual regions (bounding boxes) and return them in "blurRegions" list. Each region must be a JSON object: {"ymin": YMIN, "xmin": XMIN, "ymax": YMAX, "xmax": XMAX} in normalized coordinates (0 to 1000).
   - Otherwise, set "needsBlur" to false, "blurReason" to "", and "blurRegions" to [].
3. Neutralization (Safety Rewrite) & Word Masking:
   - If the submission text contains offensive terms, hate speech, adult themes, or graphic descriptions, "neutralize" it by rewriting the text in a clean, sanitized, PG-rated, non-offensive format (e.g. replace offensive words with "***").
   - Store the sanitized text in "neutralizedText". If already safe, set "neutralizedText" to the original content.
4. Translation:
   - If "Target Translation Language" is not "None" and not empty, translate the "ocrText" and the original (or neutralized) content/body into the selected target language. Store the translated body in "translatedText". Otherwise set to "".
5. Categorization & SEO:
   - Auto-categorize into: Latest, Tech, Trending, Sports, Business, World, or General.
   - Create a 1-2 sentence summary, suggest an SEO-optimized title/headline, perform sentiment analysis (positive, neutral, negative), and suggest 3-5 tags.
6. Approval:
   - If the content is extreme spam, malicious hacking, or should be completely rejected from the platform, set "isApproved" to false and state why in "rejectReason". Otherwise, "isApproved" is true.

Return a raw JSON object only, matching this structure exactly (do not output any markdown formatting, backticks, or other text):
{
  "isApproved": true,
  "rejectReason": "",
  "needsBlur": false,
  "blurReason": "",
  "blurRegions": [],
  "ocrText": "text extracted from image",
  "translatedText": "translated text in target language",
  "neutralizedText": "sanitized PG-friendly version of the content",
  "category": "Latest",
  "summary": "brief summary",
  "optimizedHeadline": "SEO title",
  "sentiment": "neutral",
  "tags": ["tag1", "tag2"],
  "detectedLanguage": "English/Telugu/Roman Telugu/Hindi/Mixed",
  "severityLevel": "None/Mild/Medium/Severe",
  "categoriesIdentified": ["Profanity", "Abuse", "Toxicity"],
  "offensiveWordsDetected": ["word1", "word2"],
  "confidenceScore": 95
}`;

  let result = null;
  try {
    const parts = [{ text: textPrompt }];
    if (base64Image) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Image
        }
      });
    }
    if (base64Video) {
      parts.push({
        inlineData: {
          mimeType: 'video/mp4',
          data: base64Video
        }
      });
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }]
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        result = JSON.parse(cleaned);
      }
    }
  } catch (err) {
    console.error('Gemini content moderation failed, running fallback:', err);
  }

  if (!result) {
    result = {
      isApproved: !containsSensitiveWord,
      rejectReason: containsSensitiveWord ? 'Content depicts potentially sensitive graphic material, violence, or 18+ elements.' : '',
      needsBlur: containsSensitiveWord,
      blurReason: containsSensitiveWord ? 'AI Neutralization: Sensitive graphic content detected' : '',
      blurRegions: [],
      ocrText: '',
      translatedText: '',
      neutralizedText: body || '',
      category: 'General',
      summary: title || 'Nexus user update',
      optimizedHeadline: title || '',
      sentiment: 'neutral',
      tags: ['general'],
      detectedLanguage: 'English',
      severityLevel: containsSensitiveWord ? 'Medium' : 'None',
      categoriesIdentified: containsSensitiveWord ? ['Profanity'] : [],
      offensiveWordsDetected: [],
      confidenceScore: 85
    };
  }

  if (containsSensitiveWord) {
    result.isApproved = true; // Always approve so it uploads successfully!
    result.needsBlur = true;
    result.blurReason = result.blurReason || 'AI Safeguard: Sensitive theme (violence, blood, or 18+) detected.';
    result.rejectReason = '';
  }

  // Censor bad words with *
  let censoredBody = result.neutralizedText || body || '';
  let censoredTitle = result.optimizedHeadline || title || '';
  let censoredSummary = result.summary || title || '';

  sensitiveWordsList.forEach(w => {
    if (!w || w.length <= 1) return;
    const isAscii = /^[a-z0-9\s_'-]+$/i.test(w);
    const escapedWord = escapeRegExp(w);
    const replacement = '*'.repeat(w.length);
    
    if (isAscii) {
      const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
      censoredBody = censoredBody.replace(regex, replacement);
      censoredTitle = censoredTitle.replace(regex, replacement);
      censoredSummary = censoredSummary.replace(regex, replacement);
    } else {
      const regex = new RegExp(escapedWord, 'gi');
      censoredBody = censoredBody.replace(regex, replacement);
      censoredTitle = censoredTitle.replace(regex, replacement);
      censoredSummary = censoredSummary.replace(regex, replacement);
    }
  });
  result.neutralizedText = censoredBody;
  result.neutralizedTitle = censoredTitle;
  result.neutralizedSummary = censoredSummary;

  return result;
}

export async function startDatabaseModerationSweep() {
  console.log('[Moderation Sweep] Starting sweep of unmoderated database content...');
  try {
    // 1. Scan unmoderated reels
    const unmoderatedReels = db.prepare('SELECT * FROM reels WHERE needs_blur = 0').all();
    console.log(`[Moderation Sweep] Found ${unmoderatedReels.length} unmoderated reels.`);
    for (const reel of unmoderatedReels) {
      console.log(`[Moderation Sweep] Moderating reel: ${reel.title}`);
      let videoBase64 = null;
      try {
        const filepath = resolve(PROJECT_ROOT, 'Ai videos', reel.video_file);
        videoBase64 = readFileSync(filepath).toString('base64');
      } catch (e) {
        console.error(`Failed to read video file ${reel.video_file}:`, e);
      }
      
      const aiResult = await moderateUploadContent(reel.title, reel.description, null, 'None', reel.video_file, videoBase64);
      const needsBlur = (aiResult && (aiResult.needsBlur || !aiResult.isApproved)) ? 1 : 2;
      const blurReason = (aiResult && (aiResult.blurReason || aiResult.rejectReason)) || null;
      const blurRegions = aiResult && aiResult.blurRegions ? JSON.stringify(aiResult.blurRegions) : '[]';
      const ocrText = aiResult && aiResult.ocrText ? aiResult.ocrText : null;
      const translatedText = aiResult && aiResult.translatedText ? aiResult.translatedText : null;
      const neutralizedText = aiResult && aiResult.neutralizedText ? aiResult.neutralizedText : null;

      db.prepare(`
        UPDATE reels 
        SET needs_blur = ?, blur_reason = ?, blur_regions = ?, ocr_text = ?, translated_text = ?, neutralized_text = ?, title = ?, description = ?
        WHERE id = ?
      `).run(needsBlur, blurReason, blurRegions, ocrText, translatedText, neutralizedText, (aiResult && aiResult.neutralizedTitle) || reel.title, neutralizedText || reel.description, reel.id);
      await new Promise(r => setTimeout(r, 1000));
    }

    // 2. Scan unmoderated posts
    const unmoderatedPosts = db.prepare('SELECT * FROM posts WHERE needs_blur = 0').all();
    console.log(`[Moderation Sweep] Found ${unmoderatedPosts.length} unmoderated posts.`);
    for (const post of unmoderatedPosts) {
      console.log(`[Moderation Sweep] Moderating post: ${post.id}`);
      let imageBase64 = null;
      if (post.image_url) {
        try {
          const filename = post.image_url.split('/uploads/').pop();
          const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
          imageBase64 = readFileSync(filepath).toString('base64');
        } catch (e) {}
      }
      
      const aiResult = await moderateUploadContent('', post.content, imageBase64, 'None', post.image_url ? post.image_url.split('/').pop() : null);
      const needsBlur = (aiResult && (aiResult.needsBlur || !aiResult.isApproved)) ? 1 : 2;
      const blurReason = (aiResult && (aiResult.blurReason || aiResult.rejectReason)) || null;
      const blurRegions = aiResult && aiResult.blurRegions ? JSON.stringify(aiResult.blurRegions) : '[]';
      const ocrText = aiResult && aiResult.ocrText ? aiResult.ocrText : null;
      const translatedText = aiResult && aiResult.translatedText ? aiResult.translatedText : null;
      const neutralizedText = aiResult && aiResult.neutralizedText ? aiResult.neutralizedText : null;

      db.prepare(`
        UPDATE posts 
        SET needs_blur = ?, blur_reason = ?, blur_regions = ?, ocr_text = ?, translated_text = ?, neutralized_text = ?
        WHERE id = ?
      `).run(needsBlur, blurReason, blurRegions, ocrText, translatedText, neutralizedText || post.content, post.id);
      await new Promise(r => setTimeout(r, 1000));
    }

    // 3. Scan unmoderated news
    const unmoderatedNews = db.prepare('SELECT * FROM news WHERE needs_blur = 0').all();
    console.log(`[Moderation Sweep] Found ${unmoderatedNews.length} unmoderated news articles.`);
    for (const article of unmoderatedNews) {
      console.log(`[Moderation Sweep] Moderating news article: ${article.title}`);
      let imageBase64 = null;
      if (article.image_url && article.image_url.includes('/uploads/')) {
        try {
          const filename = article.image_url.split('/uploads/').pop();
          const filepath = resolve(PROJECT_ROOT, 'uploads', filename);
          imageBase64 = readFileSync(filepath).toString('base64');
        } catch (e) {}
      }
      
      const aiResult = await moderateUploadContent(article.title, article.body, imageBase64, 'None', article.image_url ? article.image_url.split('/').pop() : null);
      const needsBlur = (aiResult && (aiResult.needsBlur || !aiResult.isApproved)) ? 1 : 2;
      const blurReason = (aiResult && (aiResult.blurReason || aiResult.rejectReason)) || null;
      const blurRegions = aiResult && aiResult.blurRegions ? JSON.stringify(aiResult.blurRegions) : '[]';
      const ocrText = aiResult && aiResult.ocrText ? aiResult.ocrText : null;
      const translatedText = aiResult && aiResult.translatedText ? aiResult.translatedText : null;
      const neutralizedText = aiResult && aiResult.neutralizedText ? aiResult.neutralizedText : null;

      db.prepare(`
        UPDATE news 
        SET needs_blur = ?, blur_reason = ?, blur_regions = ?, ocr_text = ?, translated_text = ?, neutralized_text = ?, title = ?, summary = ?
        WHERE id = ?
      `).run(needsBlur, blurReason, blurRegions, ocrText, translatedText, neutralizedText || article.body, (aiResult && aiResult.neutralizedTitle) || article.title, (aiResult && aiResult.neutralizedSummary) || article.summary, article.id);
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log('[Moderation Sweep] Database sweep complete.');
  } catch (err) {
    console.error('[Moderation Sweep] Sweep failed:', err);
  }
}

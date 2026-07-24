const apiKey = 'AQ.Ab8RN6JWu4K2TWaCX5pph1GMRr1wByLdwc9JNPoaoDdtBQvtpQ';
const text = "SpeechAnalyzer API: A Deep Mark Against Whisper";
const targetLangName = "Hindi";

console.log("Calling Gemini API with .env Key...");
fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{
      parts: [{
        text: `You are a professional real-time translator. Translate this text into ${targetLangName}. Return only the translated text, with no extra explanation, no comments, no formatting, and no markdown. Just return the raw translation. Text: "${text}"`
      }]
    }]
  })
})
.then(res => {
  console.log("Status:", res.status);
  return res.json();
})
.then(data => {
  console.log("Response data:", JSON.stringify(data, null, 2));
})
.catch(err => {
  console.error("Error:", err);
});

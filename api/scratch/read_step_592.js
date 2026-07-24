import { readFileSync, writeFileSync } from 'node:fs';

const logPath = 'C:\\Users\\Administrator\\.gemini\\antigravity-ide\\brain\\16377e87-9f41-4a26-bfc5-9d44a0ba9e5d\\.system_generated\\logs\\transcript.jsonl';
const content = readFileSync(logPath, 'utf8');
const lines = content.split('\n');

for (const line of lines) {
  if (!line.trim()) continue;
  const step = JSON.parse(line);
  if (step.step_index === 592) {
    writeFileSync('scratch/step_592_full.json', JSON.stringify(step, null, 2), 'utf8');
    console.log("Successfully wrote step_592_full.json!");
    break;
  }
}

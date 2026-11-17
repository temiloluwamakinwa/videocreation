#!/usr/bin/env node
// Narration for a story job: one clip per scene, then the scene length follows the clip.
//   node bin/voiceover.mjs jobs/generated/<id>.json [--engine edge|none] [--voice en-US-AvaNeural]
// Needs `pip install edge-tts` (free Microsoft Edge neural voices, no key). With --engine none, or if
// edge-tts fails, the story keeps its captions and music and times scenes from the word count.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const jobPath = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') === false || a === args[0]);
if (!jobPath) { console.error('usage: voiceover.mjs <story-job.json> [--engine edge|none] [--voice name]'); process.exit(1); }

const job = JSON.parse(await readFile(jobPath, 'utf8'));
const engine = flag('engine', 'edge');
const voice = flag('voice', job.voice?.name || 'en-US-AvaNeural');
if (job.type !== 'story' || engine === 'none') { console.log('[voiceover] skipped'); process.exit(0); }

const dir = path.join(path.dirname(path.resolve(jobPath)), 'voice', path.basename(jobPath, '.json'));
await mkdir(dir, { recursive: true });
const probe = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim());

let made = 0;
for (let i = 0; i < job.scenes.length; i++) {
  const s = job.scenes[i], file = path.join(dir, `scene-${String(i + 1).padStart(2, '0')}.mp3`);
  const r = spawnSync('edge-tts', ['--voice', voice, '--rate=-4%', '--text', s.text, '--write-media', file], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(`[voiceover] scene ${i + 1} failed: ${(r.stderr || r.error?.message || '').slice(-300)}`); continue; }
  const d = probe(file);
  if (!(d > 0)) continue;
  s.dur = +(d + 0.3).toFixed(2);
  s.audio = path.relative(path.dirname(path.resolve(jobPath)), file).split(path.sep).join('/');
  made++;
}
await writeFile(jobPath, JSON.stringify(job, null, 2) + '\n');
console.log(`[voiceover] ${made}/${job.scenes.length} scenes narrated with ${voice}`);
if (!made) console.log('[voiceover] no audio made: the video will have captions and music only');

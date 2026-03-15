#!/usr/bin/env bun
/**
 * Extract audio clips from a video/audio file at specific timestamps.
 * Usage: bun run extract-audio-clips.ts -i video.mp4 -c "4:25-4:45,8:40-9:10"
 *        bun run extract-audio-clips.ts -i video.mp4 -c clips.txt
 *
 * Clips format: comma-separated "start-end" pairs (MM:SS or HH:MM:SS)
 * Or a file with one "start-end [label]" per line.
 *
 * Output: saves clips as {basename}_clip_{N}_{start}_{end}.mp3 in same folder as input.
 * Also extracts full audio as {basename}.mp3 if it doesn't exist yet.
 */

import { parseArgs } from "util";
import { existsSync } from "fs";
import { basename, dirname, join, extname } from "path";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    input: { type: "string", short: "i" },
    clips: { type: "string", short: "c" },
    format: { type: "string", short: "f", default: "mp3" },
    padding: { type: "string", short: "p", default: "2" },
  },
  strict: true,
});

if (!values.input || !values.clips) {
  console.error("Usage: bun run extract-audio-clips.ts -i <video> -c <clips>");
  console.error("  -i  Input video/audio file");
  console.error('  -c  Clips: comma-separated "start-end" or a file with one per line');
  console.error("  -f  Output format (default: mp3)");
  console.error("  -p  Padding in seconds added before/after each clip (default: 2)");
  process.exit(1);
}

const inputPath = values.input;
const format = values.format || "mp3";
const padding = parseFloat(values.padding || "2");
const dir = dirname(inputPath);
const base = basename(inputPath, extname(inputPath));

interface Clip {
  start: string;
  end: string;
  label?: string;
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  throw new Error(`Invalid timestamp: ${ts}`);
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function sanitize(s: string): string {
  return s.replace(/:/g, "m").replace(/[^a-zA-Z0-9m_-]/g, "_");
}

// Parse clips
let clips: Clip[] = [];
const clipsArg = values.clips!;

if (existsSync(clipsArg)) {
  // Read from file
  const content = await Bun.file(clipsArg).text();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(\S+)\s*-\s*(\S+)(?:\s+(.+))?$/);
    if (match) {
      clips.push({ start: match[1], end: match[2], label: match[3] });
    }
  }
} else {
  // Parse inline
  for (const part of clipsArg.split(",")) {
    const [start, end] = part.trim().split("-");
    if (start && end) {
      clips.push({ start: start.trim(), end: end.trim() });
    }
  }
}

if (clips.length === 0) {
  console.error("No clips parsed. Check your -c argument.");
  process.exit(1);
}

async function run(cmd: string[]): Promise<{ ok: boolean; output: string }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  const stdout = await new Response(proc.stdout).text();
  return { ok: exitCode === 0, output: exitCode === 0 ? stdout : stderr };
}

// Step 1: Extract full audio if not exists
const fullAudioPath = join(dir, `${base}.${format}`);
if (!existsSync(fullAudioPath)) {
  console.log(`Extracting full audio → ${fullAudioPath}`);
  const result = await run([
    "ffmpeg", "-i", inputPath, "-vn", "-acodec",
    format === "mp3" ? "libmp3lame" : "pcm_s16le",
    "-q:a", "2", "-y", fullAudioPath,
  ]);
  if (!result.ok) {
    console.error("Failed to extract audio:", result.output);
    process.exit(1);
  }
  console.log("Full audio extracted.");
} else {
  console.log(`Full audio already exists: ${fullAudioPath}`);
}

// Step 2: Extract each clip
console.log(`\nExtracting ${clips.length} clips (padding: ${padding}s)...\n`);

const outputPaths: string[] = [];
for (let i = 0; i < clips.length; i++) {
  const clip = clips[i];
  const startSec = Math.max(0, parseTimestamp(clip.start) - padding);
  const endSec = parseTimestamp(clip.end) + padding;
  const duration = endSec - startSec;

  const label = clip.label ? `_${sanitize(clip.label)}` : "";
  const outName = `${base}_clip_${i + 1}_${sanitize(clip.start)}-${sanitize(clip.end)}${label}.${format}`;
  const outPath = join(dir, outName);

  console.log(
    `  [${i + 1}/${clips.length}] ${formatTimestamp(startSec)} → ${formatTimestamp(endSec)} (${duration}s)${clip.label ? ` "${clip.label}"` : ""}`
  );

  const result = await run([
    "ffmpeg", "-i", fullAudioPath,
    "-ss", String(startSec),
    "-t", String(duration),
    "-acodec", format === "mp3" ? "libmp3lame" : "pcm_s16le",
    "-q:a", "2", "-y", outPath,
  ]);

  if (result.ok) {
    outputPaths.push(outPath);
    console.log(`         → ${outName}`);
  } else {
    console.error(`         ✗ Failed: ${result.output.slice(0, 200)}`);
  }
}

console.log(`\nDone. Extracted ${outputPaths.length}/${clips.length} clips.`);
for (const p of outputPaths) {
  console.log(`  ${p}`);
}

#!/usr/bin/env bun
/**
 * Burn SRT subtitles into a video file (hardcoded subtitles).
 *
 * Usage:
 *   bun run burn-subtitles.ts -i video.mp4 -s subtitles.srt
 *   bun run burn-subtitles.ts -i video.mp4 -s subtitles.srt -o output.mp4
 *   bun run burn-subtitles.ts -i video.mp4 -s subtitles.srt --font-size 22 --font-color white
 *
 * Output defaults to {basename}_subtitled.mp4 in same folder as input.
 * Uses ffmpeg's subtitles filter for rendering.
 */

import { parseArgs } from "util";
import { existsSync } from "fs";
import { basename, dirname, join, extname } from "path";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    input: { type: "string", short: "i" },
    srt: { type: "string", short: "s" },
    output: { type: "string", short: "o" },
    "font-size": { type: "string", default: "20" },
    "font-color": { type: "string", default: "white" },
    "outline-color": { type: "string", default: "black" },
    "outline-width": { type: "string", default: "2" },
    "margin-bottom": { type: "string", default: "40" },
    "font-name": { type: "string", default: "Arial" },
  },
  strict: true,
});

if (!values.input || !values.srt) {
  console.error("Usage: bun run burn-subtitles.ts -i <video> -s <srt>");
  console.error("  -i, --input <file>        Input video file (required)");
  console.error("  -s, --srt <file>          SRT subtitle file (required)");
  console.error("  -o, --output <file>       Output file (default: {name}_subtitled.mp4)");
  console.error("  --font-size <n>           Font size (default: 20)");
  console.error("  --font-color <color>      Font color (default: white)");
  console.error("  --outline-color <color>   Outline color (default: black)");
  console.error("  --outline-width <n>       Outline width (default: 2)");
  console.error("  --margin-bottom <n>       Bottom margin in pixels (default: 40)");
  console.error("  --font-name <name>        Font name (default: Arial)");
  process.exit(1);
}

const inputPath = values.input;
const srtPath = values.srt;

if (!existsSync(inputPath)) {
  console.error(`Input video not found: ${inputPath}`);
  process.exit(1);
}
if (!existsSync(srtPath)) {
  console.error(`SRT file not found: ${srtPath}`);
  process.exit(1);
}

const dir = dirname(inputPath);
const base = basename(inputPath, extname(inputPath));
const outputPath = values.output || join(dir, `${base}_subtitled.mp4`);

const fontSize = values["font-size"] || "20";
const fontColor = values["font-color"] || "white";
const outlineColor = values["outline-color"] || "black";
const outlineWidth = values["outline-width"] || "2";
const marginBottom = values["margin-bottom"] || "40";
const fontName = values["font-name"] || "Arial";

// ffmpeg subtitles filter has trouble with paths containing special chars.
// Copy SRT to a temp file with a simple name to avoid escaping issues.
import { tmpdir } from "os";
const tmpSrt = join(tmpdir(), "burn_subtitles_tmp.srt");
const srtData = await Bun.file(srtPath).text();
await Bun.write(tmpSrt, srtData);

// Build the subtitles filter with style override
const styleOverride = [
  `FontSize=${fontSize}`,
  `FontName=${fontName}`,
  `PrimaryColour=&H00FFFFFF`,
  `OutlineColour=&H00000000`,
  `Outline=${outlineWidth}`,
  `MarginV=${marginBottom}`,
  `Alignment=2`,
].join(",");

// Use the simple temp path — no escaping needed
const subtitleFilter = `subtitles=${tmpSrt}:force_style='${styleOverride}'`;

console.log(`Input:  ${inputPath}`);
console.log(`SRT:    ${srtPath}`);
console.log(`Output: ${outputPath}`);
console.log(`Style:  ${fontSize}px ${fontName}, ${fontColor} with ${outlineColor} outline`);
console.log(`\nRendering... (this may take a few minutes)\n`);

// Check if system ffmpeg has subtitles filter, otherwise try static build
async function findFfmpeg(): Promise<string> {
  for (const path of ["ffmpeg", "/tmp/ffmpeg_full/ffmpeg"]) {
    const check = Bun.spawn([path, "-filters"], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(check.stdout).text();
    await check.exited;
    if (out.includes("subtitles")) return path;
  }
  console.error("No ffmpeg with subtitles filter (libass) found.");
  console.error("Install: brew install p7zip && curl -sL https://evermeet.cx/ffmpeg/getrelease -o /tmp/ff.7z && 7za x -o/tmp/ffmpeg_full /tmp/ff.7z -y");
  process.exit(1);
}

const ffmpegPath = await findFfmpeg();
console.log(`Using: ${ffmpegPath}`);

const startTime = Date.now();

const proc = Bun.spawn(
  [
    ffmpegPath,
    "-i", inputPath,
    "-vf", subtitleFilter,
    "-c:a", "copy",
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "medium",
    "-y",
    outputPath,
  ],
  { stdout: "pipe", stderr: "pipe" }
);

const exitCode = await proc.exited;
const stderr = await new Response(proc.stderr).text();

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

if (exitCode === 0) {
  // Get file sizes
  const inputSize = Bun.file(inputPath).size;
  const outputSize = Bun.file(outputPath).size;
  const formatSize = (bytes: number) => {
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)}MB`;
    return `${(bytes / 1e3).toFixed(1)}KB`;
  };

  console.log(`Done in ${elapsed}s`);
  console.log(`Input:  ${formatSize(inputSize)}`);
  console.log(`Output: ${formatSize(outputSize)}`);
  console.log(`\n${outputPath}`);
} else {
  console.error(`ffmpeg failed (exit ${exitCode}) after ${elapsed}s`);
  // Show last few lines of stderr for debugging
  const lines = stderr.trim().split("\n");
  console.error(lines.slice(-10).join("\n"));
  process.exit(1);
}

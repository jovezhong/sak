#!/usr/bin/env bun
/**
 * Sync SRT subtitle text to match a cleaned TXT transcript.
 *
 * Keeps ALL original SRT timestamps intact. Only replaces the text content
 * of each subtitle block to match the TXT. If a block's content was fully
 * removed in the TXT, that block is dropped.
 *
 * Algorithm:
 * 1. Parse SRT into blocks (seq, start, end, text)
 * 2. Parse TXT into words (skipping speaker headers)
 * 3. Use SequenceMatcher to align SRT words → TXT words
 * 4. For each SRT block, replace its text with the aligned TXT words
 * 5. Write new SRT preserving all original timestamps
 *
 * Usage: bun run sync-srt-to-txt.ts --srt file.srt --txt file.txt
 */

import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    srt: { type: "string" },
    txt: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "max-line": { type: "string", default: "80" },
  },
  strict: true,
});

if (!values.srt || !values.txt) {
  console.error("Usage: bun run sync-srt-to-txt.ts --srt <file.srt> --txt <file.txt>");
  console.error("  --dry-run    Show changes without writing");
  console.error("  --max-line   Max chars per SRT line (default: 80)");
  process.exit(1);
}

const maxLine = parseInt(values["max-line"] || "80");

interface SrtBlock {
  seq: number;
  start: string;
  end: string;
  text: string;
}

// Parse SRT
function parseSrt(content: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];
  const parts = content.trim().split(/\n\n+/);
  for (const part of parts) {
    const lines = part.trim().split("\n");
    if (lines.length < 3) continue;
    const seq = parseInt(lines[0].trim());
    if (isNaN(seq)) continue;
    const tsMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!tsMatch) continue;
    blocks.push({
      seq,
      start: tsMatch[1],
      end: tsMatch[2],
      text: lines.slice(2).join("\n"),
    });
  }
  return blocks;
}

// Parse TXT (skip speaker headers like "Jove (00:00)")
function parseTxtWords(content: string): string[] {
  const words: string[] = [];
  for (const line of content.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    if (/^(Jove|Arad)\s*\(\d+:\d+\)$/.test(s)) continue;
    words.push(...s.split(/\s+/));
  }
  return words;
}

// Simple LCS-based word alignment (no external deps needed)
// Returns: for each srtWord[i], the index in txtWords it maps to, or -1
function alignWords(srtWords: string[], txtWords: string[]): number[] {
  const n = srtWords.length;
  const m = txtWords.length;
  const mapping = new Array(n).fill(-1);

  // Use a greedy forward scan with backtracking window
  // For each SRT word, find the best matching TXT word nearby
  let tj = 0;
  for (let si = 0; si < n; si++) {
    // Look for srtWords[si] in txtWords starting from tj, within a window
    const sw = srtWords[si].toLowerCase().replace(/[.,!?;:]+$/, "");
    let bestJ = -1;
    const windowSize = Math.min(30, m - tj); // look ahead up to 30 words
    for (let k = 0; k < windowSize; k++) {
      const tw = txtWords[tj + k]?.toLowerCase().replace(/[.,!?;:]+$/, "");
      if (sw === tw) {
        bestJ = tj + k;
        break;
      }
    }
    if (bestJ >= 0) {
      mapping[si] = bestJ;
      tj = bestJ + 1;
    }
  }
  return mapping;
}

// Word-wrap for SRT (max 2 lines)
function wrapSrtText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const words = text.split(" ");
  const mid = Math.ceil(words.length / 2);
  return words.slice(0, mid).join(" ") + "\n" + words.slice(mid).join(" ");
}

// --- Main ---
const srtContentRaw = await Bun.file(values.srt!).text();
const srtContent = srtContentRaw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const txtContentRaw = await Bun.file(values.txt!).text();
const txtContent = txtContentRaw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const srtBlocks = parseSrt(srtContent);
const txtWords = parseTxtWords(txtContent);

// Flatten SRT words with block boundaries
const srtWordsByBlock: string[][] = srtBlocks.map((b) =>
  b.text.replace(/\n/g, " ").trim().split(/\s+/).filter(Boolean)
);
const allSrtWords = srtWordsByBlock.flat();

// Compute word ranges per block
const blockRanges: [number, number][] = [];
let idx = 0;
for (const bw of srtWordsByBlock) {
  blockRanges.push([idx, idx + bw.length]);
  idx += bw.length;
}

// Align SRT words to TXT words
const mapping = alignWords(allSrtWords, txtWords);

// For each SRT block, find the TXT word range it maps to
let txtUsedUpTo = 0;
const newBlocks: { start: string; end: string; text: string }[] = [];
let changes = 0;
let dropped = 0;

for (let bi = 0; bi < srtBlocks.length; bi++) {
  const [sStart, sEnd] = blockRanges[bi];
  const block = srtBlocks[bi];

  // Find mapped TXT indices for this block's words
  const mappedIndices: number[] = [];
  for (let si = sStart; si < sEnd; si++) {
    if (mapping[si] >= 0) {
      mappedIndices.push(mapping[si]);
    }
  }

  if (mappedIndices.length === 0) {
    // Entire block was removed in TXT — drop it
    dropped++;
    continue;
  }

  const txtBlockStart = Math.min(...mappedIndices);
  const txtBlockEnd = Math.max(...mappedIndices) + 1;

  // Include any TXT words between previous block and this one
  // (words that were in TXT but not in any SRT block)
  const effectiveStart = Math.min(txtBlockStart, txtUsedUpTo);
  const newText = txtWords.slice(effectiveStart, txtBlockEnd).join(" ");
  txtUsedUpTo = txtBlockEnd;

  const oldText = block.text.replace(/\n/g, " ").trim();
  if (oldText !== newText) {
    changes++;
  }

  // Remove ending period for SRT (but keep ... and ? and !)
  let finalText = newText;
  if (finalText.endsWith(".") && !finalText.endsWith("...")) {
    finalText = finalText.slice(0, -1);
  }

  // Wrap long lines
  finalText = wrapSrtText(finalText, maxLine);

  newBlocks.push({
    start: block.start,
    end: block.end,
    text: finalText,
  });
}

// Append any remaining TXT words to the last block
if (txtUsedUpTo < txtWords.length) {
  const remaining = txtWords.slice(txtUsedUpTo).join(" ");
  if (remaining.trim() && newBlocks.length > 0) {
    const last = newBlocks[newBlocks.length - 1];
    last.text += " " + remaining;
    last.text = wrapSrtText(last.text.trim(), maxLine);
  }
}

// Verify: extract all text from new SRT and compare to TXT
const newSrtText = newBlocks
  .map((b) => b.text.replace(/\n/g, " "))
  .join(" ")
  .replace(/\s+/g, " ")
  .trim();

// Remove trailing periods for comparison (we stripped them from SRT)
const txtForCompare = txtWords.join(" ").replace(/\s+/g, " ").trim();

// Count word-level differences
const newSrtWords = newSrtText.split(" ");
let mismatches = 0;
const maxLen = Math.max(newSrtWords.length, txtWords.length);
for (let i = 0; i < maxLen; i++) {
  const sw = (newSrtWords[i] || "").replace(/\.+$/, "");
  const tw = (txtWords[i] || "").replace(/\.+$/, "");
  if (sw !== tw) mismatches++;
}

console.log(`SRT blocks: ${srtBlocks.length} → ${newBlocks.length} (dropped ${dropped})`);
console.log(`Text changes: ${changes} blocks modified`);
console.log(`Word count: TXT=${txtWords.length}, new SRT=${newSrtWords.length}`);
console.log(`Mismatches (ignoring trailing periods): ${mismatches}`);

if (values["dry-run"]) {
  console.log("\n[DRY RUN] No file written.");
  if (mismatches > 0) {
    console.log("\nFirst 10 mismatches:");
    let shown = 0;
    for (let i = 0; i < maxLen && shown < 10; i++) {
      const sw = (newSrtWords[i] || "").replace(/\.+$/, "");
      const tw = (txtWords[i] || "").replace(/\.+$/, "");
      if (sw !== tw) {
        const ctx = txtWords.slice(Math.max(0, i - 2), i).join(" ");
        console.log(`  [${i}] ...${ctx} | TXT: "${txtWords[i]}" vs SRT: "${newSrtWords[i] || "(missing)"}"`);
        shown++;
      }
    }
  }
} else {
  // Write new SRT
  let output = "";
  for (let i = 0; i < newBlocks.length; i++) {
    output += `${i + 1}\n`;
    output += `${newBlocks[i].start} --> ${newBlocks[i].end}\n`;
    output += `${newBlocks[i].text}\n`;
    output += `\n`;
  }
  await Bun.write(values.srt!, output);
  console.log(`\nWritten: ${values.srt}`);
}

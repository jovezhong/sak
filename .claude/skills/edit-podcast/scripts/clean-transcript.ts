#!/usr/bin/env bun

/**
 * Podcast Transcription Cleaner
 * Removes filler words, fixes typos, and improves readability
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";

interface CleanOptions {
  input: string;
  output: string;
  format?: "txt" | "srt" | "auto";
  aggressive?: boolean;
  noDict?: boolean;
}

// Common filler words to remove
const FILLER_WORDS = [
  "uh",
  "um",
  "uhh",
  "umm",
  "uh-huh",
  "mm-hmm",
  "you know",
  "I mean",
  "like",
  "basically",
  "actually",
  "literally",
  "sort of",
  "kind of",
  "right",
  "okay",
  "alright",
];

// More aggressive removals
const AGGRESSIVE_FILLERS = [
  "I guess",
  "I think",
  "I mean",
  "you know what",
  "you see",
  "well",
  "so",
  "now",
];

// Symbols to remove
const SYMBOLS_TO_REMOVE = ["⁓", "~"];

/**
 * Load dictionary from file
 * Formats:
 *   - Single word: case-insensitive match (e.g., "GitHub" matches "github", "Github", etc.)
 *   - Arrow format: exact replacement (e.g., "Nodejs -> Node.js")
 * Lines starting with # are comments
 */
async function loadDictionary(path: string): Promise<Map<string, string>> {
  const dictionary = new Map<string, string>();

  try {
    const content = await Bun.file(path).text();
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Check for arrow format first: "source -> target"
      const arrowMatch = trimmed.match(/^(.+?)\s*->\s*(.+)$/);
      if (arrowMatch) {
        const [, source, target] = arrowMatch;
        dictionary.set(source.trim(), target.trim());
      } else {
        // Single word format: use the word itself as target, lowercase as key for case-insensitive matching
        const word = trimmed;
        // Store with lowercase key for case-insensitive lookup
        dictionary.set(word.toLowerCase(), word);
      }
    }
  } catch (error) {
    // File doesn't exist or can't be read - that's okay, return empty dictionary
  }

  return dictionary;
}

/**
 * Apply dictionary corrections to text
 * User dictionary takes precedence over common dictionary
 * Handles both case-sensitive (arrow format) and case-insensitive (single word) replacements
 */
function applyDictionaries(
  text: string,
  dictionaries: Map<string, string>[],
): string {
  let result = text;

  // Apply dictionaries in order (user first, then common)
  for (const dict of dictionaries) {
    for (const [source, target] of dict.entries()) {
      // Check if source is lowercase (indicates case-insensitive single-word format)
      const isCaseInsensitive =
        source === source.toLowerCase() && source === target.toLowerCase();

      if (isCaseInsensitive) {
        // Case-insensitive replacement: match any casing of the word
        const regex = new RegExp(`\\b${escapeRegex(source)}\\b`, "gi");
        result = result.replace(regex, target);
      } else {
        // Case-sensitive replacement (arrow format or exact match)
        const regex = new RegExp(`\\b${escapeRegex(source)}\\b`, "g");
        result = result.replace(regex, target);
      }
    }
  }

  return result;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanText(
  text: string,
  aggressive: boolean = false,
  dictionaries: Map<string, string>[] = [],
): string {
  let cleaned = text;

  // Remove special symbols
  for (const symbol of SYMBOLS_TO_REMOVE) {
    cleaned = cleaned.replace(new RegExp(symbol, "g"), "");
  }

  // Remove filler words (case insensitive, word boundaries)
  const fillersToRemove = aggressive
    ? [...FILLER_WORDS, ...AGGRESSIVE_FILLERS]
    : FILLER_WORDS;

  for (const filler of fillersToRemove) {
    // Match at start of sentence, after punctuation, or standalone
    const patterns = [
      new RegExp(`\\b${filler}\\b[,.]?\\s*`, "gi"), // Basic match with optional punctuation
      new RegExp(`^${filler}\\s*,?\\s*`, "gim"), // Start of line
      new RegExp(`[.!?]\\s+${filler}\\s+`, "gi"), // After sentence end
    ];

    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, (match) => {
        // Preserve the sentence-ending punctuation and space if present
        if (match.match(/^[.!?]\s+/)) {
          return match.match(/^[.!?]\s+/)![0];
        }
        return " ";
      });
    }
  }

  // Fix common transcription errors
  cleaned = cleaned.replace(/\b(\w+)\s+\1\b/g, "$1"); // Remove word repetitions
  cleaned = cleaned.replace(/\s+([,.!?])/g, "$1"); // Fix spacing before punctuation
  cleaned = cleaned.replace(/([,.!?])([A-Z])/g, "$1 $2"); // Add space after punctuation
  cleaned = cleaned.replace(/\s{2,}/g, " "); // Remove multiple spaces
  cleaned = cleaned.replace(/^\s+|\s+$/gm, ""); // Trim lines

  // Fix common word errors
  cleaned = cleaned.replace(/\bwere\b/g, "we're"); // Common transcription error
  cleaned = cleaned.replace(/\bwanna\b/g, "want to");
  cleaned = cleaned.replace(/\bgonna\b/g, "going to");

  // Apply dictionary corrections
  if (dictionaries.length > 0) {
    cleaned = applyDictionaries(cleaned, dictionaries);
  }

  return cleaned;
}

function cleanTxtFile(
  content: string,
  aggressive: boolean,
  dictionaries: Map<string, string>[] = [],
): string {
  const lines = content.split("\n");
  const cleanedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      cleanedLines.push("");
      continue;
    }

    // Check if this is a speaker line (e.g., "Jove (00:00)")
    const speakerMatch = line.match(/^([A-Za-z\s]+)\s*\((\d{2}:\d{2})\)$/);
    if (speakerMatch) {
      cleanedLines.push(line); // Keep speaker lines as-is
      continue;
    }

    // Clean the content line
    const cleaned = cleanText(line, aggressive, dictionaries);
    if (cleaned.trim()) {
      cleanedLines.push(cleaned);
    }
  }

  return cleanedLines.join("\n");
}

interface SrtBlock {
  index: number;
  timestamp: string;
  text: string;
}

function parseSrt(content: string): SrtBlock[] {
  const blocks: SrtBlock[] = [];
  const parts = content.split(/\n\n+/);

  for (const part of parts) {
    const lines = part.trim().split("\n");
    if (lines.length < 3) continue;

    const index = parseInt(lines[0]);
    const timestamp = lines[1];
    const text = lines.slice(2).join(" ");

    blocks.push({ index, timestamp, text });
  }

  return blocks;
}

function cleanSrtFile(
  content: string,
  aggressive: boolean,
  dictionaries: Map<string, string>[] = [],
): string {
  const blocks = parseSrt(content);
  const cleanedBlocks: string[] = [];

  for (const block of blocks) {
    const cleanedText = cleanText(block.text, aggressive, dictionaries);

    // Skip blocks that become empty after cleaning
    if (!cleanedText.trim()) continue;

    cleanedBlocks.push(`${block.index}\n${block.timestamp}\n${cleanedText}\n`);
  }

  return cleanedBlocks.join("\n");
}

function detectFormat(filename: string): "txt" | "srt" {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "srt") return "srt";
  return "txt";
}

async function main() {
  const args = process.argv.slice(2);
  const options: Partial<CleanOptions> = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--input" || arg === "-i") && i + 1 < args.length) {
      options.input = args[++i];
    } else if ((arg === "--output" || arg === "-o") && i + 1 < args.length) {
      options.output = args[++i];
    } else if ((arg === "--format" || arg === "-f") && i + 1 < args.length) {
      options.format = args[++i] as "txt" | "srt";
    } else if (arg === "--aggressive" || arg === "-a") {
      options.aggressive = true;
    } else if (arg === "--no-dict") {
      options.noDict = true;
    }
  }

  if (!options.input || !options.output) {
    console.error(
      "Usage: clean-transcript.ts --input <file> --output <file> [--format txt|srt] [--aggressive] [--no-dict]",
    );
    console.error("\nOptions:");
    console.error("  -i, --input       Input transcription file (required)");
    console.error("  -o, --output      Output file (required)");
    console.error(
      "  -f, --format      File format: txt or srt (default: auto-detect)",
    );
    console.error("  -a, --aggressive  More aggressive cleaning");
    console.error("  --no-dict         Skip dictionary corrections");
    process.exit(1);
  }

  const {
    input,
    output,
    format = "auto",
    aggressive = false,
    noDict = false,
  } = options as CleanOptions;

  try {
    // Read input file
    const content = await Bun.file(input).text();
    console.log(`Reading: ${input}`);

    // Detect or use specified format
    const fileFormat = format === "auto" ? detectFormat(input) : format;
    console.log(`Format: ${fileFormat}`);
    console.log(`Aggressive mode: ${aggressive ? "ON" : "OFF"}`);

    // Load dictionaries (unless disabled)
    const dictionaries: Map<string, string>[] = [];
    if (!noDict) {
      // Get skill root directory (parent of scripts/)
      const scriptDir = import.meta.dir;
      const skillRoot = join(scriptDir, "..");

      // Load user dictionary first (takes precedence)
      const userDict = await loadDictionary(
        join(skillRoot, "dictionaries/user.txt"),
      );
      if (userDict.size > 0) {
        dictionaries.push(userDict);
        console.log(`Loaded user dictionary: ${userDict.size} entries`);
      }

      // Load common dictionary second
      const commonDict = await loadDictionary(
        join(skillRoot, "dictionaries/common.txt"),
      );
      if (commonDict.size > 0) {
        dictionaries.push(commonDict);
        console.log(`Loaded common dictionary: ${commonDict.size} entries`);
      }
    } else {
      console.log(`Dictionary corrections: DISABLED`);
    }

    // Clean based on format
    let cleaned: string;
    if (fileFormat === "srt") {
      cleaned = cleanSrtFile(content, aggressive, dictionaries);
    } else {
      cleaned = cleanTxtFile(content, aggressive, dictionaries);
    }

    // Write output
    await Bun.write(output, cleaned);
    console.log(`\nCleaned transcription saved to: ${output}`);

    // Show statistics
    const originalWords = content.split(/\s+/).length;
    const cleanedWords = cleaned.split(/\s+/).length;
    const wordsRemoved = originalWords - cleanedWords;
    const reductionPercent = ((wordsRemoved / originalWords) * 100).toFixed(1);

    console.log(`\nStatistics:`);
    console.log(`  Original: ${originalWords} words`);
    console.log(`  Cleaned:  ${cleanedWords} words`);
    console.log(
      `  Removed:  ${wordsRemoved} words (${reductionPercent}% reduction)`,
    );
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();

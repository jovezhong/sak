---
name: edit-podcast
description: Clean and improve podcast transcriptions by removing filler words, fixing typos, and enhancing readability. Use when processing podcast transcripts for blog posts or YouTube captions.
---

# Podcast Transcription Cleaner

## Quick start

```bash
cd .claude/skills/edit-podcast
bun run scripts/clean-transcript.ts -i input.txt -o output.txt
bun run scripts/sync-srt-to-txt.ts --srt input.srt --txt input.txt
```

## Core workflow

### Three-Step Process

**Step 1: Automated Cleaning (TypeScript Script)**
1. **Clean TXT in-place**: Process .txt file by overwriting it (use git to review changes)
2. **Review with git diff**: Check what was cleaned using version control
3. **Iterate if needed**: Adjust dictionaries or re-run until satisfied

**Step 2: Manual Review (LLM Agent - Reasoning-Based + Audio Verification)**
1. **Grammar fixes**: LLM reviews the cleaned TXT file and fixes grammar/ASR errors
2. **Contextual reasoning**: Apply domain knowledge to spot misheard words that don't make sense
3. **Minor wording changes**: Fixes odd phrasings without rewriting sentences
4. **Examples of fixes**:
   - Grammar: "you we're" → "you were" (ASR contraction error)
   - Missing words: "I really working with" → "I really love working with"
   - Wrong tense: "we're doing" → "were doing"
   - Punctuation: "at my previous role I" → "at my previous role, I"
   - Contextual reasoning errors (require domain knowledge):
     - "data patterns" → "design patterns" (software engineering context)
     - "iPhone call" → "their phone call" (possessive pronoun mishear)
     - "Stropic" → "Anthropic" (company name)
     - "SFD" → "SFT" (Supervised Fine-Tuning - ML term)
     - "crowd certificates" → "cloud certificates" (cloud computing term)
     - "touchy BT" / "chat GBT" → "ChatGPT" (product name)
     - "core coverage" → "code coverage" (software testing term)
     - 
     - "went fall/flaw" → "went wrong" (ASR mishear)
     - "password application" → "passport application"
     - "SanFi" → "sci-fi" (science fiction)
5. **Audio verification for uncertain changes**: When unsure about a fix, use `extract-audio-clips.ts` to pull audio clips at those timestamps, then transcribe with ElevenLabs Scribe to hear what was actually said
6. **Add to dictionary**: All contextual fixes should be added to user dictionary for future use

**Step 3: Generate SRT from Audio Timestamps**
1. **Extract audio**: Use `extract-audio-clips.ts` or ffmpeg to get the mp3 from the mp4 (if not already done)
2. **Transcribe with word timestamps**: Use ElevenLabs Scribe v2 with `timestamps_granularity=word` to get per-word timestamps from the audio. This is more accurate than reusing recording platforms (e.g., riverside.fm)'s SRT, since the video may have been edited
3. **Align and generate SRT**: Align Scribe's word timestamps to the cleaned TXT words using SequenceMatcher, then group into short subtitle lines (~55 chars max, 1 line per subtitle). Interpolate timestamps for unmatched words from neighbors
4. **Copy SRT for playback**: Copy the SRT to the same folder as the MP4, with the same base name (e.g., `episode1.srt` next to `episode1.mp4`), so IINA auto-loads it
5. **Verify with IINA**: Play the video in IINA to check subtitle timing and content
   - If text is wrong, fix the TXT and re-generate the SRT

**Step 4: Burn Subtitles into Video (Optional)**
1. **Run burn script**: Use `burn-subtitles.ts` to hardcode subtitles into the video
2. **Verify output**: Play the subtitled video to check rendering
3. **Commit**: Commit cleaned TXT and SRT files together

**Important**: The TXT is the source of truth. All text edits happen in TXT only. The SRT is generated from TXT via the sync script. Never edit SRT text directly.

**Important**: The source transcript may already be edited in recording platforms (e.g., riverside.fm) or similar tools (duplicates removed, filler words cut, segments rearranged). So ASR errors may not match the raw recording — always verify against the final edited video/audio, not the raw recording.

## Scripts

### clean-transcript.ts — Automated filler word removal

```bash
bun run scripts/clean-transcript.ts --input <file> --output <file>
bun run scripts/clean-transcript.ts -i <file> -o <file>  # Short form
```

Options:
```bash
-i, --input <file>     Input transcription file (required)
-o, --output <file>    Output file (required)
-f, --format <type>    Format: txt or srt (default: auto-detect from extension)
-a, --aggressive       More aggressive cleaning (removes more words)
--no-dict              Skip dictionary corrections
```

**Note**: Do NOT run this on SRT files directly — it can break the SRT multi-line structure. Always clean the TXT first, then use `sync-srt-to-txt.ts` to update the SRT.

### sync-srt-to-txt.ts — Sync SRT text to match cleaned TXT

Takes the cleaned TXT as source of truth and updates SRT subtitle text to match, while preserving all original SRT timestamps. No timestamps are lost or created.

```bash
bun run scripts/sync-srt-to-txt.ts --srt file.srt --txt file.txt
bun run scripts/sync-srt-to-txt.ts --srt file.srt --txt file.txt --dry-run
```

Options:
```bash
--srt <file>       SRT subtitle file to update (required)
--txt <file>       Cleaned TXT file as source of truth (required)
--dry-run          Show changes without writing
--max-line <n>     Max chars per SRT line before wrapping (default: 80)
```

How it works:
- Parses SRT blocks and TXT words separately
- Aligns SRT words to TXT words using sequence matching
- Replaces each SRT block's text with the corresponding TXT words
- Drops blocks whose content was entirely removed in TXT (filler-only blocks)
- Removes trailing periods (SRT convention)
- Wraps long lines at ~80 chars (2 lines max per subtitle)
- Handles CRLF line endings automatically

After running, verify with the comparison check:
```bash
# Quick verify: extract SRT text and compare to TXT
python3 -c "
import re
with open('file.srt') as f: srt = f.read()
srt_words = [l for l in srt.split('\n') if l.strip() and not re.match(r'^\d+$|-->', l)]
srt_text = re.sub(r'\s+', ' ', ' '.join(srt_words)).strip().split()
with open('file.txt') as f: txt = f.read()
txt_words = [l for l in txt.split('\n') if l.strip() and not re.match(r'^(Speaker1|Speaker2)\s*\(\d+:\d+\)$', l.strip())]
txt_text = re.sub(r'\s+', ' ', ' '.join(txt_words)).strip().split()
print(f'SRT: {len(srt_text)} words, TXT: {len(txt_text)} words')
print('MATCH!' if len(srt_text) == len(txt_text) else 'MISMATCH')
"
```

### burn-subtitles.ts — Burn subtitles into video

Hardcodes SRT subtitles into the video file, producing a new MP4 with permanent on-screen text. Uses ffmpeg's subtitles filter with H.264 encoding.

```bash
bun run scripts/burn-subtitles.ts -i video.mp4 -s subtitles.srt
bun run scripts/burn-subtitles.ts -i video.mp4 -s subtitles.srt -o output.mp4
bun run scripts/burn-subtitles.ts -i video.mp4 -s subtitles.srt --font-size 22
```

Options:
```bash
-i, --input <file>        Input video file (required)
-s, --srt <file>          SRT subtitle file (required)
-o, --output <file>       Output file (default: {name}_subtitled.mp4)
--font-size <n>           Font size (default: 20)
--font-color <color>      Font color (default: white)
--outline-color <color>   Outline color (default: black)
--outline-width <n>       Outline width (default: 2)
--margin-bottom <n>       Bottom margin in pixels (default: 40)
--font-name <name>        Font name (default: Arial)
```

Output: `{basename}_subtitled.mp4` in same folder as input. Audio is copied without re-encoding. Video is re-encoded at CRF 18 (visually lossless).

### extract-audio-clips.ts — Extract audio clips for verification

Extract short audio clips from a video/audio file at specific timestamps. Useful for verifying uncertain ASR corrections by listening to the actual audio or re-transcribing with a better model.

```bash
bun run scripts/extract-audio-clips.ts -i video.mp4 -c "4:25-4:45,8:40-9:10"
bun run scripts/extract-audio-clips.ts -i video.mp4 -c clips.txt
```

Options:
```bash
-i, --input <file>     Input video/audio file (required)
-c, --clips <spec>     Clips: comma-separated "start-end" or a file path (required)
-f, --format <fmt>     Output format: mp3 or wav (default: mp3)
-p, --padding <sec>    Seconds added before/after each clip (default: 2)
```

Clips file format (one per line):
```
4:25-4:45 check product name
8:40-9:15 slot evaluators transition
20:40-21:10 forward deployed life section
```

Output: Saves clips as `{basename}_clip_{N}_{start}_{end}.mp3` in same folder as input. Also extracts full audio as `{basename}.mp3` if it doesn't exist yet.

**Verification workflow:**
1. Identify uncertain changes during Step 2
2. Extract clips at those timestamps: `bun run scripts/extract-audio-clips.ts -i video.mp4 -c "4:25-4:45,8:40-9:10"`
3. Transcribe clips with ElevenLabs Scribe v2 (via curl or speech-to-text skill)
4. Compare Scribe output against your corrections and adjust

## Examples

### Full workflow example
```bash
cd my-podcast/episode1
SKILL=../../.claude/skills/edit-podcast/scripts
VIDEO=/path/to/my-podcast/episode1.mp4

# Step 1: Run automated cleaning script on TXT
bun run $SKILL/clean-transcript.ts -i episode1.txt -o episode1.txt
git diff episode1.txt  # Review automated changes

# Step 2a: LLM manually reviews TXT and fixes grammar/ASR errors
# Step 2b: Verify uncertain changes by extracting audio clips + Scribe

# Step 3a: Extract audio from video (if not done)
bun run $SKILL/extract-audio-clips.ts -i $VIDEO -c "0:00-0:01"
# This creates episode1.mp3 as a side effect

# Step 3b: Transcribe with word-level timestamps
curl -X POST "https://api.elevenlabs.io/v1/speech-to-text" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -F "file=@/path/to/episode1.mp3" \
  -F "model_id=scribe_v2" \
  -F "language_code=eng" \
  -F "timestamps_granularity=word" \
  -o /tmp/scribe.json

# Step 3c: Generate SRT by aligning Scribe timestamps to cleaned TXT
# (uses python script to align words and group into ~55 char subtitles)

# Step 3d: Copy SRT next to MP4 for IINA verification
cp episode1.srt /path/to/episode1.srt

# Step 3e: Verify in IINA
open -a IINA $VIDEO
# IINA auto-loads episode1.srt if in same folder with same base name

# Step 4 (optional): Burn subtitles into video
bun run $SKILL/burn-subtitles.ts -i $VIDEO -s /path/to/episode1.srt
# Outputs episode1_subtitled.mp4 in same folder
```

## Dictionaries

The skill uses two-tier dictionary system for custom term corrections:

### Dictionary files
- `dictionaries/common.txt` - Shared corrections for common terms
- `dictionaries/user.txt` - Personal/team-specific corrections

### Format
Two formats supported:

**Single word** - Case-insensitive match to correct casing:
```
GitHub      # Matches "github", "Github", "GITHUB", etc.
LinkedIn
ChatGPT
```

**Arrow format** - Exact replacement for non-case changes:
```
Nodejs -> Node.js
gonna -> going to
btw -> by the way
core coverage -> code coverage
went fall -> went wrong
```

### Priority
User dictionary takes precedence over common dictionary, allowing personal overrides.

### Usage
```bash
# Add case correction (matches any casing)
echo "GitHub" >> dictionaries/user.txt

# Add exact replacement
echo "Nodejs -> Node.js" >> dictionaries/user.txt

# View current mappings
cat dictionaries/common.txt
cat dictionaries/user.txt

# Run without dictionaries
bun run scripts/clean-transcript.ts -i file.txt -o file.txt --no-dict
```

## What gets cleaned

### Standard mode
- **Dictionary corrections**: Custom term mappings from dictionaries/
- Filler words: uh, um, uhh, umm, uh-huh, mm-hmm, like
- Hedging: you know, I mean, like, basically, actually, literally
- Qualifiers: sort of, kind of
- Verbal tics: right, okay, alright
- Special symbols: ⁓, ~
- Word repetitions (e.g., "the the" → "the")
- Extra whitespace and formatting

### Aggressive mode (adds)
- Meta phrases: I guess, I think, you see, you know what
- Transition words: well, so, now
- All standard mode cleanings

## What gets preserved

- Speaker names (e.g., "Alice (00:00)")
- Timestamps in SRT files (all original timestamps kept by sync script)
- Paragraph structure
- Technical terms and proper nouns
- Natural conversation flow
- Intentional emphasis

## Example output

**Before:**
```
Alice (00:00)
Uh, welcome to the uh new episode. I'm, you know, in the process of ⁓ inviting more people.
```

**After:**
```
Alice (00:00)
Welcome to the new episode. I'm in the process of inviting more people.
```

## Statistics

The script reports cleaning statistics:
```
Statistics:
  Original: 10090 words
  Cleaned:  9641 words
  Removed:  449 words (4.4% reduction)
```

## Tips

- **TXT is source of truth**: All text edits go in TXT. SRT is synced from TXT automatically
- **Never edit SRT text directly**: Use `sync-srt-to-txt.ts` to propagate TXT changes to SRT
- **Use dictionaries**: Add personal corrections to `dictionaries/user.txt` for consistent fixes
- **Verify with audio**: For uncertain ASR fixes, extract clips and re-transcribe with Scribe v2
- **Verify with IINA**: Copy SRT next to MP4 (same base name) and play in IINA to check timing
- Use standard mode first, aggressive mode only if needed
- Use `git diff` to review changes before committing
- Easy to iterate: fix TXT, re-run sync, re-check in IINA
- When sharing the skill, remove sensitive entries from user.txt

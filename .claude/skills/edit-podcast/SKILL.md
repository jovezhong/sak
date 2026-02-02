---
name: edit-podcast
description: Clean and improve podcast transcriptions by removing filler words, fixing typos, and enhancing readability. Use when processing podcast transcripts for blog posts or YouTube captions.
---

# Podcast Transcription Cleaner

## Quick start

```bash
cd .claude/skills/edit-podcast
bun run scripts/clean-transcript.ts -i input.txt -o output.txt
bun run scripts/clean-transcript.ts -i input.srt -o output.srt --aggressive
```

## Core workflow

### Two-Step Process

**Step 1: Automated Cleaning (TypeScript Script)**
1. **Clean TXT in-place**: Process .txt file by overwriting it (use git to review changes)
2. **Review with git diff**: Check what was cleaned using version control
3. **Iterate if needed**: Adjust dictionaries or re-run until satisfied

**Step 2: Manual Review (LLM Agent - Reasoning-Based)**
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
     - "colors" → "callers" (call center context)
5. **Add to dictionary**: All contextual fixes should be added to user dictionary for future use

**Step 3: Apply Changes to SRT**
1. **Manual SRT cleanup**: Apply text corrections to SRT while preserving structure
   - Use sed or manual editing to remove filler words ("uh", "um", "you know")
   - Fix grammar/ASR errors found in Step 2
   - **Remove ending periods**: SRT subtitles shouldn't end with periods
   - **Keep sentences short**: SRT lines should be concise (avoid long multi-line sentences)
   - **Preserve timestamps and line breaks**: Critical for video synchronization
2. **Ask about video timing**: Check if user added intro music/clips to the video
   - If yes: adjust all timestamps by the offset duration
   - Example: Added 3min 47sec intro → add 227 seconds to all timestamps
   - Use a script to batch adjust timestamps accurately
3. **Manual verification**: Test SRT with video to ensure perfect sync
   - If subtitles appear too early/late, adjust by small increments (0.5-1 second)
4. **Commit**: Commit both cleaned TXT and SRT files together

**Important**: Always overwrite input files (use same path for input and output). This lets you review changes via git diff and easily iterate.

## Commands

### Basic usage
```bash
bun run scripts/clean-transcript.ts --input <file> --output <file>
bun run scripts/clean-transcript.ts -i <file> -o <file>  # Short form
```

### Options
```bash
-i, --input <file>     Input transcription file (required)
-o, --output <file>    Output file (required)
-f, --format <type>    Format: txt or srt (default: auto-detect from extension)
-a, --aggressive       More aggressive cleaning (removes more words)
--no-dict              Skip dictionary corrections
```

## Examples

### Clean text transcript in-place (recommended)
```bash
bun run scripts/clean-transcript.ts -i podcast_episode.txt -o podcast_episode.txt
git diff podcast_episode.txt  # Review changes
```

### Clean SRT in-place with aggressive mode
```bash
bun run scripts/clean-transcript.ts -i captions.srt -o captions.srt -a
git diff captions.srt  # Review changes
```

### Full workflow example
```bash
cd fdePodcast/e2

# Step 1: Run automated cleaning script on TXT
bun run ../../.claude/skills/edit-podcast/scripts/clean-transcript.ts -i e2_anthony.txt -o e2_anthony.txt
git diff e2_anthony.txt  # Review automated changes

# Step 2: LLM manually reviews TXT and fixes grammar/ASR errors
# - Fix "you we're" → "you were"
# - Fix "I really working" → "I really love working"
# - Fix "data patterns" → "design patterns"
# - Fix other grammar issues without rewriting sentences
git diff e2_anthony.txt  # Review manual fixes

# Step 3a: Apply text corrections to SRT (manual cleanup)
# Remove filler words and apply grammar fixes while preserving structure
sed -i '' 's/ uh / /g' e2_anthony.srt
sed -i '' 's/ um / /g' e2_anthony.srt
sed -i '' 's/you know, //g' e2_anthony.srt
sed -i '' 's/you know //g' e2_anthony.srt
sed -i '' 's/I mean, //g' e2_anthony.srt
# Apply specific grammar fixes found in Step 2
sed -i '' 's/data patterns/design patterns/g' e2_anthony.srt

# Step 3b: Remove ending periods from SRT
sed -i '' 's/\.$//' e2_anthony.srt

# Step 3c: Adjust timestamps if video has intro music/clips
# Ask user: "Did you add intro music or opening clips to the video?"
# If yes, get duration (e.g., 3min 47sec = 227 seconds)
# Then run timestamp adjustment script:
python3 /tmp/adjust_srt_time.py e2_anthony.srt 227  # Add 227 seconds
python3 /tmp/adjust_srt_time.py e2_anthony.srt 1    # Fine-tune by +1 second if needed

# Step 3d: Verify sync with video
# Copy to test location and check with video player
cp e2_anthony.srt /path/to/test/location/video.srt
# If subtitles appear early: add more time (0.5-1 second increments)
# If subtitles appear late: subtract time

git diff e2_anthony.srt  # Review all SRT changes

# Step 4: Commit both files
git add e2_anthony.txt e2_anthony.srt
git commit -m "Clean podcast transcriptions"
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
- Filler words: uh, um, uhh, umm, uh-huh, mm-hmm
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

- Speaker names (e.g., "Jove (00:00)")
- Timestamps in SRT files
- Paragraph structure
- Technical terms and proper nouns
- Natural conversation flow
- Intentional emphasis

## Example output

**Before:**
```
Jove (00:00)
Uh, welcome to the uh new episode. I'm, you know, in the process of ⁓ inviting more people.
```

**After:**
```
Jove (00:00)
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

- **Always overwrite in-place**: Use same file for input/output, rely on git diff for review
- **Use dictionaries**: Add personal corrections to `dictionaries/user.txt` for consistent fixes
- Use standard mode first, aggressive mode only if needed
- TXT files clean better than SRT (more context)
- Clean TXT first, then apply learnings to SRT
- Use `git diff` to review changes before committing
- Easy to iterate: just re-run the command if not satisfied
- When sharing the skill, remove sensitive entries from user.txt

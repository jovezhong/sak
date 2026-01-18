---
name: linkedin-stats
description: Extract and display LinkedIn post statistics including impressions, reactions, comments, and reposts. Connects to Arc browser via CDP to read recent activity.
---

# LinkedIn Stats Extractor

Extracts statistics from LinkedIn recent activity page and displays them in a table format.

**IMPORTANT**: When running this skill, only display the table output from the script. Do NOT add any summary, analysis, or commentary about the results. Just show the raw table.

## Usage

Simply invoke the skill and provide your LinkedIn profile username:

```
/linkedin-stats jovezhong
```

Or use the default (configured for Jove Zhong):

```
/linkedin-stats
```

## What it does

1. Connects to Arc browser via CDP on port 9222
2. Navigates to your LinkedIn recent activity page
3. Extracts post data including:
   - Post date (exact dates for hours/days, relative format like "1w ago" for weeks/months)
   - First few words of post content
   - Impression count
   - Reaction count (likes/emojis)
   - Comment count
   - Repost count
4. Displays the most recent 10 posts in a markdown table

## Requirements

- Arc browser must be running with remote debugging enabled on port 9222
- The LinkedIn page must be accessible (user must be logged in)
- `agent-browser` command must be available

## Example Output

```
| # | Date | Content | Impressions | Reactions | Comments | Reposts |
|---|------|---------|-------------|-----------|----------|---------|
| 1 | 2026-01-16 | Langfuse joins ClickHouse! You can check out  | 4,932 | 54 | 7 | 1 |
| 2 | 2026-01-16 | hit 50k followers on LinkedIn, and were runni | 416 | 5 | 0 | 0 |
```

## Technical Details

- Uses text-based extraction (not screenshots) to minimize token usage
- Date handling:
  - Exact dates for recent posts: "9 hours ago" → 2026-01-17, "1 day ago" → 2026-01-16
  - Relative format for older posts: "1 week ago" → "1w ago", "2 months ago" → "2mo ago"
  - This approach avoids incorrect date assumptions for posts older than a week
- Handles LinkedIn's lazy loading by scrolling through the page
- Extracts data from accessibility tree snapshot
- Captures reaction counts (likes/emoji reactions) in addition to comments and reposts

## Notes

- LinkedIn may not load all posts due to lazy loading (posts 6-8 are sometimes skipped)
- Impression counts update in real-time
- Works best with the "All activity" → "Posts" filter selected

# LinkedIn Stats Skill

Extract and display LinkedIn post statistics using Arc browser automation.

## Directory Structure

```
linkedin-stats/
├── SKILL.md                          # Skill definition (loaded by Claude Code)
├── README.md                         # This file
├── linkedin_stats.sh                 # Main entry script
└── scripts/
    └── extract_linkedin_posts.py     # Python extraction script
```

## Files

### SKILL.md
The skill definition file with frontmatter that Claude Code reads. Contains:
- Skill name and description
- Usage instructions
- Requirements
- Example output

### linkedin_stats.sh
Main bash script that:
1. Connects to Arc browser via CDP
2. Navigates to LinkedIn recent activity page
3. Scrolls to load posts
4. Captures page snapshot
5. Calls Python script to extract and format data

### scripts/extract_linkedin_posts.py
Python script that:
- Parses LinkedIn accessibility tree snapshot
- Extracts post metadata (date, content, impressions, reactions, comments, reposts)
- Calculates exact dates for recent posts (hours/days), shows relative format for older posts (weeks/months)
- Formats output as markdown table

## Usage

### From Claude Code

```
/linkedin-stats
```

Or for a different user:

```
/linkedin-stats <username>
```

### Standalone

```bash
./linkedin_stats.sh jovezhong
```

Or specify number of posts:

```bash
./linkedin_stats.sh jovezhong 15
```

## Requirements

1. **Arc Browser**: Must be running with remote debugging enabled:
   ```bash
   open -a Arc --args --remote-debugging-port=9222
   ```

2. **agent-browser**: Command must be available in PATH

3. **Python 3**: For extraction script

4. **LinkedIn Login**: User must be logged into LinkedIn in Arc browser

## How It Works

1. **Browser Connection**: Connects to Arc via Chrome DevTools Protocol (CDP) on port 9222
2. **Navigation**: Opens LinkedIn recent activity page
3. **Content Loading**: Scrolls to trigger lazy loading of posts
4. **Data Capture**: Takes accessibility tree snapshot (text-based, not screenshot)
5. **Parsing**: Extracts structured data using regex patterns
6. **Date Calculation**: Converts recent timestamps ("1 day ago", "5 hours ago") to exact dates; shows relative format ("1w ago", "2mo ago") for older posts to avoid incorrect assumptions
7. **Formatting**: Outputs markdown table

## Output Format

```markdown
| # | Date | Content | Impressions | Reactions | Comments | Reposts |
|---|------|---------|-------------|-----------|----------|---------|
| 1 | 2026-01-16 | First few words of post... | 4,932 | 54 | 7 | 1 |
| 2 | 2026-01-16 | Another post content... | 416 | 5 | 0 | 0 |
```

## Known Limitations

- LinkedIn's lazy loading may skip some posts (typically #6-8)
- Requires active LinkedIn session in Arc browser
- Only works with Arc browser (uses CDP on port 9222)
- Post content truncated to first 50 characters

## Best Practices

- Keep Arc browser open with remote debugging enabled
- Ensure you're logged into LinkedIn
- Run periodically to track post performance over time
- Adjust NUM_POSTS parameter based on needs (default: 10)

## Troubleshooting

**Error: "Browser not launched"**
- Restart Arc with: `open -a Arc --args --remote-debugging-port=9222`

**Error: "No posts found"**
- Verify you're logged into LinkedIn
- Check if the LinkedIn page loaded correctly
- Try refreshing the page manually first

**Missing posts (#6-8)**
- This is a LinkedIn lazy loading issue
- Try increasing scroll iterations in `linkedin_stats.sh`

## Future Enhancements

- [ ] Support for other browsers (Chrome, Firefox)
- [ ] Export to CSV/JSON format
- [ ] Historical tracking and comparison
- [ ] Engagement rate calculations
- [ ] Chart/graph generation

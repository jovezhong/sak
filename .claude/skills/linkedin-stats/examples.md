# LinkedIn Stats - Usage Examples

## Example 1: Extract your own stats

**User prompt:**
```
Show me my LinkedIn post stats
```

**Claude response:**
```bash
/linkedin-stats jovezhong
```

**Output:**
```
🔍 Extracting LinkedIn stats for: jovezhong

📡 Connecting to Arc browser...
⏳ Loading page...
📜 Scrolling to load posts...
📸 Capturing page snapshot...
📊 Extracting post statistics...

| # | Date | Content | Impressions | Comments | Reposts |
|---|------|---------|-------------|----------|---------|
| 1 | 2026-01-16 | Langfuse joins ClickHouse! You can check out  | 4,932 | 7 | 1 |
| 2 | 2026-01-16 | hit 50k followers on LinkedIn, and were runni | 416 | 0 | 0 |
| 3 | 2026-01-15 | What I Talk About When I Talk About | 414 | 0 | 0 |
...
✅ Done! Extracted stats for jovezhong
```

## Example 2: Extract stats for a different user

**User prompt:**
```
Get LinkedIn stats for elonmusk
```

**Claude response:**
```bash
/linkedin-stats elonmusk
```

## Example 3: Get more posts

**User prompt:**
```
Show me my last 20 LinkedIn posts with stats
```

**Claude response:**
```bash
./linkedin_stats.sh jovezhong 20
```

## Example 4: Analyze engagement

**User prompt:**
```
What's my best performing LinkedIn post this week?
```

**Claude response:**
```bash
/linkedin-stats jovezhong
```

Then analyze the output to find the post with highest impressions and engagement rate.

## Example 5: Track over time

**User prompt:**
```
How are my LinkedIn posts performing compared to last week?
```

**Claude response:**
1. Extract current stats: `/linkedin-stats`
2. Compare with previous snapshot if available
3. Calculate engagement trends

## Integration with Other Tools

### Export to CSV

```bash
./linkedin_stats.sh jovezhong | sed 's/|/,/g' > linkedin_stats.csv
```

### Track in a file

```bash
echo "# LinkedIn Stats - $(date)" >> stats_log.md
./linkedin_stats.sh jovezhong >> stats_log.md
echo "" >> stats_log.md
```

### Get specific metrics

```bash
# Get total impressions
./linkedin_stats.sh jovezhong | grep -oE '[0-9,]+' | head -10 | awk '{sum+=$1} END {print sum}'
```

## Tips

1. **Run regularly**: Track your LinkedIn performance over time
2. **Compare metrics**: Identify what types of posts perform best
3. **Engagement analysis**: Calculate engagement rate (comments+reposts)/impressions
4. **Content optimization**: Use insights to improve future posts
5. **Best times to post**: Correlate post times with engagement

## Common Use Cases

- **Weekly reporting**: Track weekly LinkedIn performance
- **Content strategy**: Identify high-performing topics
- **A/B testing**: Compare different post formats
- **Competitive analysis**: Compare your stats with industry benchmarks
- **Goal tracking**: Monitor progress toward engagement goals

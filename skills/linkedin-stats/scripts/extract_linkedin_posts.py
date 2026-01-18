#!/usr/bin/env python3
"""
Extract LinkedIn post statistics from a snapshot file.
Usage: python3 extract_linkedin_posts.py <snapshot_file> [num_posts]
"""

import re
import sys
from datetime import datetime, timedelta
from typing import Dict, List


def extract_posts(snapshot_file: str, num_posts: int = 10) -> List[Dict]:
    """Extract post data from LinkedIn snapshot."""

    with open(snapshot_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by posts
    post_sections = re.split(r'- heading "Feed post number (\d+)"', content)

    posts = []

    for i in range(1, len(post_sections), 2):
        if i + 1 >= len(post_sections):
            break

        post_num = int(post_sections[i])
        post_content = post_sections[i + 1]

        post_data = {
            'num': post_num,
            'comments': '0',
            'reposts': '0'
        }

        # Extract timestamp
        timestamp_match = re.search(
            r'text: (\d+ (?:hour|hours|day|days|week|weeks|month|months) ago)',
            post_content
        )
        if timestamp_match:
            post_data['timestamp'] = timestamp_match.group(1)

        # Extract impressions
        impressions_match = re.search(r'strong: ([\d,]+) impressions', post_content)
        if impressions_match:
            post_data['impressions'] = impressions_match.group(1)

        # Extract reactions (likes)
        reactions_match = re.search(r'and (\d+) others', post_content)
        if reactions_match:
            # "X and Y others" means Y+1 total reactions
            post_data['reactions'] = str(int(reactions_match.group(1)) + 1)
        else:
            post_data['reactions'] = '0'

        # Extract content (collect multiple text segments including hashtags)
        content_parts = []
        content_lines = post_content.split('\n')
        in_content_section = False
        skip_patterns = [
            'Visible to anyone', 'Promote this post', 'Head of FDE',
            'Premium', 'see more', 'Open control menu', 'Jove Zhong',
            'Activate to view', 'Brandon Teegen', 'React Like',
            'Comment', 'Repost', 'Send in a', 'View analytics',
            'This image has', 'button'
        ]

        for line in content_lines:
            # Check if we're past the timestamp (content starts after this)
            if 'ago • Visible to anyone' in line:
                in_content_section = True
                continue

            if in_content_section:
                # Stop at engagement/metrics section
                if any(x in line for x in ['React Like', 'impressions View', 'strong:']):
                    break

                # Extract regular text
                text_match = re.search(r'text: (.+)', line)
                if text_match:
                    text = text_match.group(1).strip()
                    # Remove quotes but keep emoji and special chars
                    text = text.strip('"').strip("'")
                    # Skip if it matches any skip pattern
                    if text and not any(pattern in text for pattern in skip_patterns):
                        # Check if text contains emoji or is longer than 2 chars
                        # Emoji detection: check if any character is in common emoji ranges
                        # Common ranges: 0x1F300-0x1F9FF (misc symbols), 0x2600-0x27BF (misc symbols)
                        has_emoji = any(
                            0x1F300 <= ord(c) <= 0x1F9FF or  # Emoticons, symbols
                            0x2600 <= ord(c) <= 0x27BF or   # Misc symbols
                            0x1F000 <= ord(c) <= 0x1F2FF    # Additional symbols
                            for c in text
                        )
                        # Don't add very short fragments unless they're emoji
                        if len(text) > 2 or has_emoji:
                            content_parts.append(text)

                # Extract hashtags from links
                hashtag_match = re.search(r'link "hashtag ([^"]+)"', line)
                if hashtag_match:
                    hashtag = hashtag_match.group(1)
                    # Add hashtag if not already in content
                    if f"#{hashtag}" not in ' '.join(content_parts):
                        content_parts.append(f"#{hashtag}")

                # Extract regular links (like company mentions) in content section
                # Skip links that are clearly not content (urls, graphics, etc.)
                link_match = re.search(r'link "([^"]+)"', line)
                if link_match and 'link "hashtag' not in line and '[ref=' in line:
                    link_text = link_match.group(1).strip()
                    # Skip non-content links
                    if (link_text and
                        not link_text.startswith('http') and
                        not link_text.endswith(('graphic.', 'link', 'profile')) and
                        not any(skip in link_text for skip in ['View ', 'Open ']) and
                        len(link_text) > 2):
                        content_parts.append(link_text)

                # Stop after collecting enough segments
                if len(content_parts) >= 15:
                    break

        # Combine and clean content
        if content_parts:
            # Join with spaces
            full_content = ' '.join(content_parts)
            # Clean up multiple spaces
            full_content = re.sub(r'\s+', ' ', full_content)
            # Clean up spaces around punctuation
            full_content = re.sub(r'\s+([.,!?])', r'\1', full_content)
            full_content = full_content.strip()

            # Truncate at sentence boundary if possible
            if len(full_content) > 65:
                # Try to cut at last sentence
                cutoff = 65
                for punct in ['. ', '! ', '? ']:
                    last_punct = full_content[:cutoff].rfind(punct)
                    if last_punct > 40:  # Only if we have enough content
                        full_content = full_content[:last_punct + 1]
                        break
                else:
                    # No good sentence boundary, just truncate
                    full_content = full_content[:65] + '...'

            post_data['content'] = full_content

        # Extract comments
        comments_match = re.search(r'button "(\d+) comments? on', post_content)
        if comments_match:
            post_data['comments'] = comments_match.group(1)

        # Extract reposts
        reposts_match = re.search(r'button "(\d+) reposts? of', post_content)
        if reposts_match:
            post_data['reposts'] = reposts_match.group(1)

        # Only add posts that have timestamp and impressions
        if 'timestamp' in post_data and 'impressions' in post_data:
            posts.append(post_data)

    return posts


def calculate_date(timestamp: str, reference_date: datetime = None) -> str:
    """Calculate actual date from relative timestamp.

    For hours and days, calculate exact date.
    For weeks and months, show relative format (e.g., "1w ago", "2w ago", "1mo ago")
    since LinkedIn doesn't provide exact timestamps for older posts.
    """
    if reference_date is None:
        reference_date = datetime.now()

    match = re.search(r'(\d+)', timestamp)
    if not match:
        return 'N/A'

    num = int(match.group(1))

    if 'hour' in timestamp:
        return (reference_date - timedelta(hours=num)).strftime('%Y-%m-%d')
    elif 'day' in timestamp:
        return (reference_date - timedelta(days=num)).strftime('%Y-%m-%d')
    elif 'week' in timestamp:
        # Show relative format for weeks
        return f"{num}w ago"
    elif 'month' in timestamp:
        # Show relative format for months
        return f"{num}mo ago"

    return 'N/A'


def format_table(posts: List[Dict], num_posts: int = 10) -> str:
    """Format posts as a markdown table."""

    # Sort by post number and limit to requested number
    posts_sorted = sorted(posts, key=lambda x: x['num'])[:num_posts]

    lines = [
        "| # | Date | Content | Impressions | Reactions | Comments | Reposts |",
        "|---|------|---------|-------------|-----------|----------|---------|"
    ]

    for post in posts_sorted:
        num = post['num']
        date = calculate_date(post.get('timestamp', '')) if 'timestamp' in post else 'N/A'
        content = post.get('content', 'N/A')[:50].ljust(45)
        impressions = post.get('impressions', '0')
        reactions = post.get('reactions', '0')
        comments = post.get('comments', '0')
        reposts = post.get('reposts', '0')

        lines.append(
            f"| {num} | {date} | {content} | {impressions} | {reactions} | {comments} | {reposts} |"
        )

    return '\n'.join(lines)


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python3 extract_linkedin_posts.py <snapshot_file> [num_posts]")
        sys.exit(1)

    snapshot_file = sys.argv[1]
    num_posts = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    try:
        posts = extract_posts(snapshot_file, num_posts)

        if not posts:
            print("No posts found in snapshot file")
            sys.exit(1)

        print(format_table(posts, num_posts))

    except FileNotFoundError:
        print(f"Error: File '{snapshot_file}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()

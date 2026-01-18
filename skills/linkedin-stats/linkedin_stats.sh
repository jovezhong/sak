#!/bin/bash
# LinkedIn Stats Extractor
# Extracts recent post statistics from LinkedIn profile

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTRACT_SCRIPT="$SCRIPT_DIR/scripts/extract_linkedin_posts.py"
TEMP_DIR="/tmp/linkedin-stats-$$"
SNAPSHOT_FILE="$TEMP_DIR/snapshot.txt"

# Default username
USERNAME="${1:-jovezhong}"
NUM_POSTS="${2:-10}"

# Cleanup on exit
cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Create temp directory
mkdir -p "$TEMP_DIR"

echo "🔍 Extracting LinkedIn stats for: $USERNAME"
echo ""

# Step 1: Navigate to LinkedIn activity page
echo "📡 Connecting to Arc browser..."
agent-browser --cdp 9222 open "https://www.linkedin.com/in/$USERNAME/recent-activity/all/" >/dev/null 2>&1

# Step 2: Wait for page to load
echo "⏳ Loading page..."
agent-browser --cdp 9222 wait 4000 >/dev/null 2>&1

# Step 3: Scroll to load more posts (aggressive scrolling for lazy loading)
echo "📜 Scrolling to load posts..."
for i in {1..12}; do
    agent-browser --cdp 9222 scroll down 600 >/dev/null 2>&1
    agent-browser --cdp 9222 wait 1800 >/dev/null 2>&1
done

# Step 3.5: Wait for lazy loading to complete
echo "⏳ Waiting for content to fully load..."
agent-browser --cdp 9222 wait 3000 >/dev/null 2>&1

# Step 3.6: One final scroll to ensure we got everything
agent-browser --cdp 9222 scroll down 1000 >/dev/null 2>&1
agent-browser --cdp 9222 wait 2000 >/dev/null 2>&1

# Step 4: Get snapshot
echo "📸 Capturing page snapshot..."
agent-browser --cdp 9222 snapshot -c > "$SNAPSHOT_FILE" 2>&1

# Step 5: Extract and display stats
echo "📊 Extracting post statistics..."
echo ""

python3 "$EXTRACT_SCRIPT" "$SNAPSHOT_FILE" "$NUM_POSTS"

echo ""
echo "✅ Done! Extracted stats for $USERNAME"

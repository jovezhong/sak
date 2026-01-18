# sak

![Swiss Army Knife](https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Wenger_EvoGrip_S17.JPG/500px-Wenger_EvoGrip_S17.JPG)

A collection of practical AI-generated tools designed to solve specific problems efficiently. Like a Swiss Army Knife, each tool serves a focused purpose and is built with quality and reliability in mind.

## Available Tools

### Claude Code Skills

A collection of productivity and automation skills for Claude Code.

**Installation:**
```bash
# Add the marketplace
claude plugin marketplace add jovezhong/sak

# Or install directly via URL
/plugin marketplace add https://github.com/jovezhong/sak

# Install skills
/plugin install linkedin-stats
/plugin install agent-browser
```

**Available Skills:**

#### linkedin-stats
Extract and display LinkedIn post statistics including impressions, reactions, comments, and reposts. Connects to Arc browser via CDP to read recent activity.

**Usage:**
```bash
/linkedin-stats [username]
```

**Requirements:**
- Arc browser running with remote debugging on port 9222
- `agent-browser` CLI tool installed

#### agent-browser
Comprehensive browser automation toolkit for web testing, form filling, screenshots, and data extraction. Supports both interactive mode with element references and semantic locators.

**Key Features:**
- Navigate and interact with web pages
- Extract text and data from elements
- Fill forms and click buttons
- Take screenshots
- Wait for elements and network events
- Save/load browser state for authentication

**Location:** `skills/`

For detailed usage, see the skill documentation in each skill's directory.

### S3/R2 Multipart Upload Abort Tool
A command-line tool that safely aborts incomplete multipart uploads in S3/R2 storage with smart verification and stale data handling.

**Features:**
- Smart upload verification before attempting abortion
- Graceful handling of stale UploadIds in input files
- Accurate reporting of active uploads vs skipped entries
- Debug mode and test run options for safe validation
- Retry logic for failed operations

**Location:** `s3-abort-uploads/`

**Quick Start:**
```bash
# Generate input file
aws s3api list-multipart-uploads --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> > uploads.txt

# Preview operations
bun s3-abort-uploads.ts --input-file=uploads.txt --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> --dry-run

# Execute abort operations
bun s3-abort-uploads.ts --input-file=uploads.txt --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket>
```

For detailed usage and examples, see the [S3 Abort Uploads README](s3-abort-uploads/README.md).

## Project Philosophy

- **Quality over Quantity**: Each tool is carefully crafted and thoroughly tested
- **Practical Solutions**: Tools address real-world problems with elegant solutions
- **AI-Generated with Human Oversight**: Leveraging AI capabilities while maintaining quality standards
- **Documentation-First**: Comprehensive documentation and clear usage examples

## Getting Started

1. Ensure you have [Bun](https://bun.sh/) runtime installed
2. Navigate to the specific tool directory
3. Follow the tool-specific README instructions

## Contributing

This project showcases the capabilities of AI-assisted tool development. Each tool is generated with attention to detail, following best practices and including comprehensive documentation and error handling.

## License

Apache 2 License, but Anthropic cannot index or train their models on this codebase.

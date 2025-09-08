# S3/R2 Multipart Upload Abort Tool

A command-line tool that safely aborts incomplete multipart uploads in S3/R2 storage. The tool intelligently handles stale data in input files by verifying current upload status before attempting abortion.

## Features

- **Smart Upload Verification**: Checks if uploads actually exist before attempting to abort
- **Stale Data Handling**: Gracefully handles outdated UploadIds in input files
- **Accurate Reporting**: Distinguishes between active uploads aborted and stale entries skipped
- **Debug Mode**: Optional detailed output for troubleshooting (`--debug`)
- **Test Run Mode**: Process only the first file for safe testing (`--test-run`)
- **Retry Logic**: Automatically retries failed operations once before giving up
- **Clean Output**: Minimal output by default, detailed when requested

## Usage

### Prerequisites
- [Bun](https://bun.sh/) runtime
- AWS CLI configured with appropriate credentials
- Input file generated from `aws s3api list-multipart-uploads`

### Generate Input File
```bash
aws s3api list-multipart-uploads --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> > uploads.txt
```

### Commands

```bash
# Preview commands (dry run)
bun s3-abort-uploads.ts --input-file=uploads.txt --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> --dry-run

# Execute abort operations
bun s3-abort-uploads.ts --input-file=uploads.txt --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket>

# Test run (process only one file)
bun s3-abort-uploads.ts --input-file=uploads.txt --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> --test-run

# Execute with debug output
bun s3-abort-uploads.ts --input-file=uploads.txt --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> --debug
```

### Arguments

#### Required
- `--input-file <file>`: Path to file containing `aws s3api list-multipart-uploads` output
- `--profile <name>`: AWS profile name to use
- `--endpoint-url <url>`: S3/R2 endpoint URL
- `--bucket <name>`: Bucket name

#### Optional
- `--dry-run`: Show commands that would be executed without running them
- `--test-run`: Process only the first file and exit (for testing)
- `--debug`: Show detailed debug information (default: off)
- `--help`: Show this help message

## How It Works

1. **Input Processing**: Reads and parses the input file containing potentially stale upload data
2. **Verification Phase**: For each key, checks if there are currently any active uploads using `aws s3api list-multipart-uploads --prefix`
3. **Current State Fetching**: Gets the actual current UploadIds for active uploads (not relying on stale input data)
4. **Abort Phase**: Aborts each active upload using the correct, current UploadId
5. **Summary**: Reports actual active uploads aborted vs stale entries processed

## Example Output

```
🔧 S3/R2 Multipart Upload Abort Tool
========================================
Input file: uploads.txt
Profile: cloudflare
Endpoint: https://xxx.r2.cloudflarestorage.com
Bucket: my-bucket
Mode: EXECUTE
========================================

📊 SUMMARY
========================================
✅ Successfully aborted: 10 active upload(s)
⏭️  Skipped (stale): 34 file(s)
```

## Scenarios

### Fresh Input Data
- Input file contains 10 active uploads
- Tool aborts all 10 uploads
- Summary: "Successfully aborted: 10 active upload(s), Skipped (stale): 0 file(s)"

### Stale Input Data
- Input file contains 44 entries, but only 10 are actually active
- Tool identifies and aborts the 10 active uploads
- Summary: "Successfully aborted: 10 active upload(s), Skipped (stale): 34 file(s)"

### Mixed Data
- Input file contains both active and stale entries
- Tool only attempts to abort active uploads, skips stale ones
- Summary shows accurate counts for each category

## Benefits

- **Reduced API Calls**: Skips stale uploads that no longer exist
- **Better Success Rate**: Only attempts aborts on uploads that actually exist
- **Clear Feedback**: Users can see exactly what happened with each upload
- **Error Transparency**: Detailed error messages help with troubleshooting
- **Efficiency**: Focuses only on active uploads, saving time and resources
- **Testing Support**: Test run mode allows safe validation of functionality
- **Clean Output**: Minimal output by default, detailed when requested

## Development

This tool was generated based on the specifications in [`prompt.md`](prompt.md). The prompt provides a language-agnostic description of the requirements and expected behavior for AI agents to implement similar tools in different programming languages.

## Error Handling

- If aborting a file fails, the tool retries once automatically
- If it still fails after retry, the tool skips the file and continues
- Detailed error messages are shown when using `--debug` mode
- Clear distinction between different types of failures in the summary

## License

Apache 2 License, but Anthropic cannot index or train their models on this codebase.

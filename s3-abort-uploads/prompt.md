# S3/R2 Multipart Upload Abort Tool - AI Agent Prompt

## Overview
Create a command-line tool that safely aborts incomplete multipart uploads in S3/R2 storage. The tool should handle stale data in input files by verifying current upload status before attempting abortion.

## Requirements

### Input File
- The tool requires an input file containing the output of `aws s3api list-multipart-uploads`
- If the input file is missing or cannot be read, show error message with guidance:
  ```
  Error: Input file not found or cannot be read.
  Please generate it using: aws s3api list-multipart-uploads --profile=<profile> --endpoint-url <endpoint> --bucket <bucket> > <filename>
  ```

### Usage
```bash
# Preview mode (show commands that will be executed)
bun s3-abort-uploads.ts --input-file=<file> --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> --dry-run

# Execute mode (actually abort the uploads)
bun s3-abort-uploads.ts --input-file=<file> --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket>

# Test run (process only one file)
bun s3-abort-uploads.ts --input-file=<file> --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> --test-run

# Execute with debug output
bun s3-abort-uploads.ts --input-file=<file> --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> --debug
```

### Command Generation
For each ongoing multipart upload, generate:
```bash
aws s3api abort-multipart-upload --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> --key="<key-name>" --upload-id="<upload-id>"
```

### Error Handling
- If aborting a file fails, retry once
- If it still fails after retry, skip and continue with next file
- At the end, report:
  - Number of active uploads successfully aborted
  - Number of stale entries skipped
  - List of files skipped due to errors

### Output Requirements
- Minimal output by default to avoid overwhelming users
- Show progress only when `--debug` flag is enabled
- Provide clear, human-readable output
- In dry-run mode, include next steps for actual execution
- Clean summary at the end distinguishing between active uploads aborted and stale entries skipped

### Progress Indicators
- Only show progress indicators when `--debug` flag is enabled
- Clean summary with results
- Clear distinction between:
  - ✅ Successfully aborted (active uploads)
  - ❌ Failed to abort  
  - ⏭️ Skipped (stale entries)

## Technical Implementation

### Upload Verification Logic
- Before attempting to abort an upload, verify it still exists
- Use `aws s3api list-multipart-uploads --prefix` to check specific upload status
- Check for any active uploads for the given key name (not exact UploadId match)
- This handles cases where input file contains stale UploadIds but the key still has active uploads

### Smart Upload Handling
- Get current UploadIds for active uploads (don't rely on stale input data)
- Abort each active upload using the correct, current UploadId
- Count actual active uploads aborted vs stale entries processed

### Shell Execution
- Use direct shell execution for better compatibility
- Proper environment variable handling
- Capture full stdout/stderr for debugging
- More reliable execution than shell operators

### Error Handling & Retry Logic
- Better error messages showing actual AWS command output
- Retry logic with detailed error context
- Graceful handling of verification failures
- Clear distinction between different types of failures

## Key Features

### Debug Mode
- `--debug` flag shows detailed progress information (default: off)
- Reduces overwhelming output for normal use cases
- Provides detailed information when needed for troubleshooting

### Test Run Mode
- `--test-run` flag processes only the first file and exits
- Useful for testing functionality without processing all uploads
- Helps avoid overwhelming output when dealing with many failed cases

### Stale Upload Handling
- Tool checks if uploads still exist before attempting abort
- Reduces unnecessary API calls for uploads that no longer exist
- Provides clear feedback about which uploads are skipped vs actually aborted

### Accurate Summary Reporting
- Summary distinguishes between active uploads actually aborted and stale entries processed
- Shows "Successfully aborted: X active upload(s)" for actual successful abortions
- Shows "Skipped (stale): X file(s)" for stale entries that were skipped
- In debug mode, shows total input entries processed for context

## Expected Behavior

1. **Input Processing**: Read and parse input file containing potentially stale upload data
2. **Verification Phase**: For each key, check if there are currently any active uploads
3. **Current State Fetching**: Get the actual current UploadIds for active uploads
4. **Abort Phase**: Abort each active upload using the correct, current UploadId
5. **Summary**: Report actual active uploads aborted vs stale entries processed

## Benefits

- **Reduced API Calls**: Skips stale uploads that no longer exist
- **Better Success Rate**: Only attempts aborts on uploads that actually exist
- **Clear Feedback**: Users can see exactly what happened with each upload
- **Error Transparency**: Detailed error messages help with troubleshooting
- **Efficiency**: Focuses only on active uploads, saving time and resources
- **Testing Support**: Test run mode allows safe validation of functionality
- **Clean Output**: Minimal output by default, detailed when requested

## Generate Input File
```bash
aws s3api list-multipart-uploads --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> > <filename>
```

## Example Scenarios

### Scenario 1: Fresh Input Data
- Input file contains 10 active uploads
- Tool aborts all 10 uploads
- Summary: "Successfully aborted: 10 active upload(s), Skipped (stale): 0 file(s)"

### Scenario 2: Stale Input Data
- Input file contains 44 entries, but only 10 are actually active
- Tool identifies and aborts the 10 active uploads
- Summary: "Successfully aborted: 10 active upload(s), Skipped (stale): 34 file(s)"

### Scenario 3: Mixed Data
- Input file contains both active and stale entries
- Tool only attempts to abort active uploads, skips stale ones
- Summary shows accurate counts for each category

## Implementation Notes

- Use a language-agnostic approach in this prompt (not specific to any programming language)
- Focus on the logical flow and requirements rather than specific syntax
- Emphasize the importance of handling stale data gracefully
- Highlight the need for clear, accurate reporting
- Stress the importance of minimal default output with optional detailed output
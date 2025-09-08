#!/usr/bin/env bun

import { readFileSync, existsSync } from "fs";
import { $ } from "bun";
import * as yaml from "js-yaml";

interface MultipartUpload {
  Initiated: string;
  Initiator: {
    DisplayName: string;
    ID: string;
  };
  Key: string;
  Owner: {
    DisplayName: string;
    ID: string;
  };
  StorageClass: string;
  UploadId: string;
}

interface ParsedData {
  Uploads?: MultipartUpload[];
}

interface Args {
  inputFile: string;
  profile: string;
  endpointUrl: string;
  bucket: string;
  dryRun: boolean;
  testRun: boolean;
  debug: boolean;
  help: boolean;
}

function parseArgs(): Args {
  const args = Bun.argv.slice(2);
  const parsed: Partial<Args> = {
    dryRun: false,
    testRun: false,
    help: false,
  };

  for (const arg of args) {
    if (arg.startsWith("--input-file=")) {
      parsed.inputFile = arg.split("=")[1];
    } else if (arg.startsWith("--profile=")) {
      parsed.profile = arg.split("=")[1];
    } else if (arg.startsWith("--endpoint-url=")) {
      parsed.endpointUrl = arg.split("=")[1];
    } else if (arg.startsWith("--bucket=")) {
      parsed.bucket = arg.split("=")[1];
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--test-run") {
      parsed.testRun = true;
    } else if (arg === "--help") {
      parsed.help = true;
    } else if (arg === "--debug") {
      parsed.debug = true;
    }
  }
  return parsed as Args;
}

function showHelp() {
  console.log(`
S3/R2 Multipart Upload Abort Tool

USAGE:
  bun s3-abort-uploads.ts --input-file=<file> --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> [--dry-run] [--test-run] [--debug] [--help]

REQUIRED ARGUMENTS:
  --input-file <file>     Path to file containing 'aws s3api list-multipart-uploads' output
  --profile <name>         AWS profile name to use
  --endpoint-url <url>     R2 endpoint URL
  --bucket <name>          Bucket name

OPTIONAL ARGUMENTS:
  --dry-run                Show commands that would be executed without running them
  --test-run               Process only the first file and exit (for testing)
  --debug                  Show detailed debug information (default: off)
  --help                   Show this help message

EXAMPLES:
  # Preview commands (dry run)
  bun s3-abort-uploads.ts --input-file=uploads.txt --profile=cloudflare --endpoint-url=https://xxx.r2.cloudflarestorage.com --bucket=my-bucket --dry-run

  # Execute abort operations
  bun s3-abort-uploads.ts --input-file=uploads.txt --profile=cloudflare --endpoint-url=https://xxx.r2.cloudflarestorage.com --bucket=my-bucket

  # Test run (process only one file)
  bun s3-abort-uploads.ts --input-file=uploads.txt --profile=cloudflare --endpoint-url=https://xxx.r2.cloudflarestorage.com --bucket=my-bucket --test-run

ERROR HANDLING:
  If aborting a file fails, the tool will retry once. If it still fails, it will skip the file and continue.
  A summary report will show successful cleanups and any skipped files.

GENERATE INPUT FILE:
  aws s3api list-multipart-uploads --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> > <filename>
`);
}

function validateArgs(args: Args): void {
  if (!args.inputFile) {
    console.error("❌ Error: --input-file is required");
    console.error(
      "Please generate it using: aws s3api list-multipart-uploads --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> > <filename>",
    );
    process.exit(1);
  }

  if (!args.profile) {
    console.error("❌ Error: --profile is required");
    process.exit(1);
  }

  if (!args.endpointUrl) {
    console.error("❌ Error: --endpoint-url is required");
    process.exit(1);
  }

  if (!args.bucket) {
    console.error("❌ Error: --bucket is required");
    process.exit(1);
  }

  if (!existsSync(args.inputFile)) {
    console.error(`❌ Error: Input file '${args.inputFile}' not found`);
    console.error(
      "Please generate it using: aws s3api list-multipart-uploads --profile=<profile> --endpoint-url=<endpoint> --bucket=<bucket> > <filename>",
    );
    process.exit(1);
  }
}

function parseMultipartUploads(content: string, args: Args): MultipartUpload[] {
  try {
    if (args.debug) console.log("📖 Parsing input file...");
    const data = yaml.load(content) as ParsedData;

    if (!data.Uploads || !Array.isArray(data.Uploads)) {
      console.error(
        "❌ Error: Invalid input file format - no Uploads array found",
      );
      process.exit(1);
    }

    if (args.debug) {
      console.log(
        `✅ Found ${data.Uploads.length} multipart upload(s) to process`,
      );
    }
    return data.Uploads;
  } catch (error) {
    console.error(
      "❌ Error parsing input file:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

function generateAbortCommand(upload: MultipartUpload, args: Args): string {
  return `aws s3api abort-multipart-upload --profile=${args.profile} --endpoint-url=${args.endpointUrl} --bucket=${args.bucket} --key="${upload.Key}" --upload-id="${upload.UploadId}"`;
}

async function verifyUploadExists(
  upload: MultipartUpload,
  args: Args,
): Promise<boolean> {
  try {
    const checkCommand = `aws s3api list-multipart-uploads --profile=${args.profile} --endpoint-url=${args.endpointUrl} --bucket=${args.bucket} --prefix="${upload.Key}"`;

    const process = Bun.spawn(["bash", "-c", checkCommand], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...Bun.env, AWS_PROFILE: args.profile },
    });

    const result = await process.exited;
    const stdout = await new Response(process.stdout).text();
    const stderr = await new Response(process.stderr).text();

    if (result !== 0) {
      console.log(`  ⚠️  Could not verify upload status: ${stderr.trim()}`);
      return true;
    }

    const data = yaml.load(stdout) as ParsedData;
    if (data.Uploads && Array.isArray(data.Uploads)) {
      // Check if there are any active uploads for this key (regardless of UploadId)
      const hasActiveUploads = data.Uploads.some((u) => u.Key === upload.Key);
      return hasActiveUploads;
    }

    return false;
  } catch (error) {
    return true;
  }
}

async function executeWithRetry(
  command: string,
  upload: MultipartUpload,
  debug: boolean = false,
  maxRetries: number = 1,
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      if (attempt > 1) {
        if (debug) {
          console.log(
            `🔄 Retrying (${attempt}/${maxRetries + 1}): ${upload.Key}`,
          );
        }
      }

      if (debug) {
        console.log(`  🚀 Executing: ${command}`);
      }

      const process = Bun.spawn(["bash", "-c", command], {
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...Bun.env,
          AWS_PROFILE: Bun.env.AWS_PROFILE || "default",
        },
      });

      const result = await process.exited;
      const stdout = await new Response(process.stdout).text();
      const stderr = await new Response(process.stderr).text();

      if (result === 0) {
        if (debug) {
          console.log(`  ✅ Command succeeded: ${upload.Key}`);
        }
        return { success: true };
      } else {
        throw new Error(
          `Command failed with exit code ${result}. Stderr: ${stderr.trim()}. Stdout: ${stdout.trim()}`,
        );
      }
    } catch (error) {
      if (attempt === maxRetries + 1) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      // Wait a bit before retry
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return { success: false, error: "Max retries exceeded" };
}

async function getCurrentUploadsForKey(
  key: string,
  args: Args,
): Promise<MultipartUpload[]> {
  try {
    const checkCommand = `aws s3api list-multipart-uploads --profile=${args.profile} --endpoint-url=${args.endpointUrl} --bucket=${args.bucket} --prefix="${key}"`;

    const process = Bun.spawn(["bash", "-c", checkCommand], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...Bun.env, AWS_PROFILE: args.profile },
    });

    const result = await process.exited;
    const stdout = await new Response(process.stdout).text();
    const stderr = await new Response(process.stderr).text();

    if (result !== 0) {
      console.log(`  ⚠️  Could not get current uploads: ${stderr.trim()}`);
      return [];
    }

    const data = yaml.load(stdout) as ParsedData;
    if (data.Uploads && Array.isArray(data.Uploads)) {
      // Return only uploads that match the exact key
      return data.Uploads.filter((u) => u.Key === key);
    }

    return [];
  } catch (error) {
    console.log(
      `  ⚠️  Error getting current uploads: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

async function processUploads(
  uploads: MultipartUpload[],
  args: Args,
): Promise<{
  success: string[];
  failed: { key: string; error: string }[];
  skipped: string[];
  totalInputEntries: number;
  actualActiveUploadsAborted: number;
}> {
  const success: string[] = [];
  const failed: { key: string; error: string }[] = [];
  const skipped: string[] = [];
  let actualActiveUploadsAborted = 0;

  // If test-run is enabled, only process the first upload
  const uploadsToProcess = args.testRun ? uploads.slice(0, 1) : uploads;
  const totalUploads = uploadsToProcess.length;

  if (args.testRun && uploads.length > 1) {
    console.log(
      `🧪 Test run: Processing only 1 file out of ${uploads.length} total uploads`,
    );
  }

  if (args.debug) {
    console.log("\n🚀 Processing uploads...");
  }

  for (let i = 0; i < uploadsToProcess.length; i++) {
    const upload = uploadsToProcess[i];
    const progress = `[${i + 1}/${totalUploads}]`;

    if (args.debug) {
      console.log(`${progress} Processing: ${upload.Key}`);
    }

    if (args.dryRun) {
      const command = generateAbortCommand(upload, args);
      if (args.debug) {
        console.log(`  📋 Command: ${command}`);
      }
      success.push(upload.Key);
    } else {
      // First verify if there are any active uploads for this key
      const hasActiveUploads = await verifyUploadExists(upload, args);

      if (!hasActiveUploads) {
        if (args.debug) {
          console.log(`  ⏭️  Skipping stale upload: ${upload.Key}`);
        }
        skipped.push(upload.Key);
        continue;
      }

      // Get the actual current upload IDs for this key
      const currentUploads = await getCurrentUploadsForKey(upload.Key, args);

      if (currentUploads.length === 0) {
        if (args.debug) {
          console.log(`  ⏭️  No current uploads found for key: ${upload.Key}`);
        }
        skipped.push(upload.Key);
        continue;
      }

      if (args.debug) {
        console.log(
          `  🎯 Found ${currentUploads.length} active upload(s) for key: ${upload.Key}`,
        );
      }

      // Abort each current upload for this key
      for (const currentUpload of currentUploads) {
        const command = generateAbortCommand(currentUpload, args);
        const result = await executeWithRetry(
          command,
          currentUpload,
          args.debug,
        );

        if (result.success) {
          if (args.debug) {
            console.log(
              `  ✅ Successfully aborted: ${currentUpload.Key} (ID: ${currentUpload.UploadId?.substring(0, 20)}...)`,
            );
          }
          success.push(currentUpload.Key);
          actualActiveUploadsAborted++;
        } else {
          if (args.debug) {
            console.log(`  ❌ Failed to abort: ${currentUpload.Key}`);
            console.log(`     Error: ${result.error}`);
          }
          failed.push({
            key: currentUpload.Key,
            error: result.error || "Unknown error",
          });
        }
      }
    }

    // Small delay between operations
    if (!args.dryRun && i < uploadsToProcess.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return {
    success,
    failed,
    skipped,
    totalInputEntries: uploads.length,
    actualActiveUploadsAborted,
  };
}

function printSummary(
  success: string[],
  failed: { key: string; error: string }[],
  skipped: string[],
  args: Args,
  totalInputEntries: number,
  actualActiveUploadsAborted: number,
) {
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));

  console.log(
    `✅ Successfully aborted: ${actualActiveUploadsAborted} active upload(s)`,
  );
  console.log(`⏭️  Skipped (stale): ${skipped.length} file(s)`);
  if (args.debug) {
    console.log(`📝 Processed ${totalInputEntries} input entries`);
  }
  if (failed.length > 0) {
    console.log(`❌ Failed to abort: ${failed.length} file(s)`);
    console.log("\nFailed files:");
    failed.forEach((f) => {
      console.log(`  - ${f.key}: ${f.error}`);
    });
  }

  if (args.dryRun) {
    console.log("\n🎯 NEXT STEPS");
    console.log("To actually abort these uploads, run:");
    console.log(
      `bun s3-abort-uploads.ts --input-file=${args.inputFile} --profile=${args.profile} --endpoint-url=${args.endpointUrl} --bucket=${args.bucket}`,
    );
  } else if (args.testRun) {
    console.log("\n🧪 TEST RUN COMPLETED");
    console.log("To process all uploads, run without the --test-run flag:");
    console.log(
      `bun s3-abort-uploads.ts --input-file=${args.inputFile} --profile=${args.profile} --endpoint-url=${args.endpointUrl} --bucket=${args.bucket}`,
    );
  } else if (skipped.length > 0) {
    console.log("\n💡 INFO");
    console.log(
      `Some uploads were skipped because they no longer exist in the bucket.`,
    );
    console.log(
      `This is normal when the list contains stale entries from previously completed uploads.`,
    );
  }

  console.log("\n" + "=".repeat(60));
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    return;
  }

  validateArgs(args);

  console.log("🔧 S3/R2 Multipart Upload Abort Tool");
  console.log("=".repeat(40));
  console.log(`Input file: ${args.inputFile}`);
  console.log(`Profile: ${args.profile}`);
  console.log(`Endpoint: ${args.endpointUrl}`);
  console.log(`Bucket: ${args.bucket}`);
  console.log(
    `Mode: ${args.dryRun ? "DRY RUN" : args.testRun ? "TEST RUN" : "EXECUTE"}`,
  );
  console.log("=".repeat(40));

  const content = readFileSync(args.inputFile, "utf8");
  const uploads = parseMultipartUploads(content, args);

  if (uploads.length === 0) {
    console.log("✅ No multipart uploads found to process");
    return;
  }

  const {
    success,
    failed,
    skipped,
    totalInputEntries,
    actualActiveUploadsAborted,
  } = await processUploads(uploads, args);
  printSummary(
    success,
    failed,
    skipped,
    args,
    totalInputEntries,
    actualActiveUploadsAborted,
  );

  // Exit with error code if there were failures in execute mode (but not test-run mode)
  if (!args.dryRun && !args.testRun && failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    "❌ Unexpected error:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});

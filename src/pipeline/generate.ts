#!/usr/bin/env tsx
/**
 * Main Orchestration Script
 *
 * Usage:
 *   npm run generate -- --url "https://example.com" --prompt "Highlight the scheduling features"
 *   npm run generate -- --url "https://example.com" --prompt "..." --output "./output/demo.mp4"
 *   npm run generate -- --url "https://example.com" --prompt "..." --voice-id "EXAVITQu4vr4xnSDxMaL"
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { captureWebsite, captureAllScenes } from "./capture";
import { generateScript } from "./scriptWriter";
import { generateAllAudio, concatenateAudio } from "./tts";
import { generateCaptions, exportSRT } from "./captions";
import { renderVideo } from "./render";
import type { VideoData } from "../types";

// --- CLI argument parsing ---
function parseArgs(): {
  url: string;
  prompt: string;
  output: string;
  width: number;
  height: number;
  fps: number;
  voiceId?: string;
  skipRender: boolean;
} {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const url = get("--url");
  const prompt = get("--prompt");

  if (!url || !prompt) {
    console.error(`
🎬 AI Demo Video Generator

Usage:
  npm run generate -- --url <website-url> --prompt <description>

Options:
  --url        Website URL to create a demo for (required)
  --prompt     What to focus on in the demo (required)
  --output     Output MP4 path (default: ./output/demo.mp4)
  --width      Video width (default: 1920)
  --height     Video height (default: 1080)
  --fps        Frames per second (default: 30)
  --voice-id   ElevenLabs voice ID (default: Rachel)
  --skip-render  Skip Remotion render (useful for debugging pipeline)

Examples:
  npm run generate -- --url "https://oplit.fr" --prompt "Show the workforce scheduling features"
  npm run generate -- --url "https://myapp.com" --prompt "Product demo for enterprise clients" --fps 60
`);
    process.exit(1);
  }

  return {
    url,
    prompt,
    output: get("--output") || "./output/demo.mp4",
    width: parseInt(get("--width") || "1920", 10),
    height: parseInt(get("--height") || "1080", 10),
    fps: parseInt(get("--fps") || "30", 10),
    voiceId: get("--voice-id"),
    skipRender: args.includes("--skip-render"),
  };
}

// --- Main pipeline ---
async function main() {
  const config = parseArgs();
  const startTime = Date.now();

  // Create working directory
  const workDir = path.resolve("./output/.work");
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.dirname(path.resolve(config.output)), { recursive: true });

  // Override voice ID from CLI if provided
  if (config.voiceId) {
    process.env.ELEVENLABS_VOICE_ID = config.voiceId;
  }

  console.log("=".repeat(60));
  console.log("🎬 AI Demo Video Generator");
  console.log("=".repeat(60));
  console.log(`URL:    ${config.url}`);
  console.log(`Prompt: ${config.prompt}`);
  console.log(`Output: ${config.output}`);
  console.log(`Size:   ${config.width}x${config.height} @ ${config.fps}fps`);
  console.log("=".repeat(60));

  // ─── Step 1: Capture website ───────────────────────────────────
  console.log("\n📸 Step 1/5: Capturing website...\n");
  const capture = await captureWebsite(config.url, workDir, {
    width: config.width,
    height: config.height,
  });

  // ─── Step 2: Generate script ───────────────────────────────────
  console.log("\n🤖 Step 2/5: Generating video script...\n");
  const script = await generateScript(
    config.url,
    capture.textContent,
    capture.discoveredPages,
    config.prompt
  );

  // Save script for debugging
  fs.writeFileSync(
    path.join(workDir, "script.json"),
    JSON.stringify(script, null, 2)
  );

  // ─── Step 3: Capture scene screenshots ─────────────────────────
  console.log("\n📸 Step 3/5: Capturing scene screenshots...\n");
  const scenesWithScreenshots = await captureAllScenes(script.scenes, workDir, {
    width: config.width,
    height: config.height,
  });
  script.scenes = scenesWithScreenshots;

  // ─── Step 4: Generate audio ────────────────────────────────────
  console.log("\n🎙️  Step 4/5: Generating voiceover audio...\n");
  const audioSegments = await generateAllAudio(script.scenes, workDir);

  // Concatenate all audio
  const { fullAudioPath, totalDurationSec } = await concatenateAudio(
    audioSegments,
    workDir
  );

  // Update scene durations based on actual audio
  for (const segment of audioSegments) {
    const scene = script.scenes.find((s) => s.index === segment.sceneIndex);
    if (scene) {
      scene.durationSec = segment.durationSec;
    }
  }
  script.totalDurationSec = totalDurationSec;

  // ─── Generate captions ─────────────────────────────────────────
  const captions = generateCaptions(script.scenes, audioSegments);

  // Export SRT file
  const srtContent = exportSRT(captions);
  const srtPath = config.output.replace(/\.mp4$/, ".srt");
  fs.writeFileSync(srtPath, srtContent);
  console.log(`📝 Captions saved: ${srtPath}`);

  // ─── Step 5: Render video ──────────────────────────────────────
  const totalFrames = Math.ceil(totalDurationSec * config.fps);

  const videoData: VideoData = {
    script,
    audioSegments,
    captions,
    fullAudioPath,
    fps: config.fps,
    totalFrames,
  };

  // Save video data for Remotion
  fs.writeFileSync(
    path.join(workDir, "video-data.json"),
    JSON.stringify(videoData, null, 2)
  );

  if (config.skipRender) {
    console.log("\n⏭️  Skipping render (--skip-render flag set)");
    console.log(`   Video data saved to: ${workDir}/video-data.json`);
  } else {
    console.log("\n🎬 Step 5/5: Rendering video...\n");
    await renderVideo(videoData, path.resolve(config.output), {
      width: config.width,
      height: config.height,
      fps: config.fps,
    });
  }

  // ─── Done ──────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "=".repeat(60));
  console.log(`✅ Done in ${elapsed}s`);
  console.log(`   Video: ${config.output}`);
  console.log(`   Captions: ${srtPath}`);
  console.log(`   Script: ${workDir}/script.json`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ Pipeline failed:", err);
  process.exit(1);
});

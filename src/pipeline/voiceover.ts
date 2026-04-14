#!/usr/bin/env tsx
/**
 * Voiceover Pipeline
 * Takes a pre-recorded video, generates a timed narration script,
 * produces TTS audio, and muxes it with the original video + captions.
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ── Types ────────────────────────────────────────────────────────────

interface NarrationSegment {
  startSec: number;
  endSec: number;
  text: string;
}

// ── CLI Parsing ──────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const video = get("--video");
  const script = get("--script");
  if (!video || !script) {
    console.error(`Usage: npm run voiceover -- --video <path> --script <path> [--output <path>]

  --video    Path to the screen recording (mp4/mov)
  --script   Path to the narration JSON file
  --output   Output path (default: ./output/voiceover-demo.mp4)
  --voice-id ElevenLabs voice ID (optional)

Script JSON format:
  [
    { "startSec": 0,  "text": "First narration segment..." },
    { "startSec": 10, "text": "Second segment starts at 10s..." }
  ]

Edit the text or startSec values, then re-run. Only segments with
changed text will regenerate audio (cached segments are reused).`);
    process.exit(1);
  }

  return {
    video: path.resolve(video),
    script: path.resolve(script),
    output: path.resolve(get("--output") || "./output/voiceover-demo.mp4"),
    voiceId: get("--voice-id"),
  };
}

// ── Get video duration ───────────────────────────────────────────────

function getVideoDuration(videoPath: string): number {
  const result = execFileSync("ffprobe", [
    "-v", "quiet",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    videoPath,
  ], { encoding: "utf-8" });
  return parseFloat(result.trim());
}

// ── Generate TTS for a segment ───────────────────────────────────────

async function generateTTS(
  text: string,
  outputPath: string,
  voiceId?: string
): Promise<number> {
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error (${response.status}): ${err}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  // Get duration
  const dur = execFileSync("ffprobe", [
    "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", outputPath,
  ], { encoding: "utf-8" });
  return parseFloat(dur.trim());
}

// ── Generate SRT ─────────────────────────────────────────────────────

function generateSRT(segments: NarrationSegment[]): string {
  const fmtTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };

  // Split each segment into ~8-word chunks for readable captions
  const chunks: { start: number; end: number; text: string }[] = [];
  for (const seg of segments) {
    const words = seg.text.split(" ");
    const chunkSize = 8;
    const numChunks = Math.ceil(words.length / chunkSize);
    const chunkDur = (seg.endSec - seg.startSec) / numChunks;
    for (let i = 0; i < numChunks; i++) {
      chunks.push({
        start: seg.startSec + i * chunkDur,
        end: seg.startSec + (i + 1) * chunkDur,
        text: words.slice(i * chunkSize, (i + 1) * chunkSize).join(" "),
      });
    }
  }

  return chunks.map((c, i) =>
    `${i + 1}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`
  ).join("\n");
}

// ── Main Pipeline ────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const startTime = Date.now();

  const workDir = path.resolve("./output/.work/voiceover");
  const audioDir = path.join(workDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(path.dirname(config.output), { recursive: true });

  console.log("=".repeat(60));
  console.log("🎙️  Voiceover Pipeline");
  console.log("=".repeat(60));
  console.log(`Video:  ${config.video}`);
  console.log(`Output: ${config.output}`);

  // Get video duration
  const videoDuration = getVideoDuration(config.video);
  console.log(`Duration: ${videoDuration.toFixed(1)}s`);
  console.log("=".repeat(60));

  // ── Load narration script from JSON ──────────────────────────────────
  console.log(`Script: ${config.script}`);

  const scriptRaw: { startSec: number; text: string }[] = JSON.parse(
    fs.readFileSync(config.script, "utf-8")
  );

  // Build segments with endSec estimated from next segment's start
  const segments: NarrationSegment[] = scriptRaw.map((s, i) => ({
    startSec: s.startSec,
    endSec: i < scriptRaw.length - 1 ? scriptRaw[i + 1].startSec : videoDuration,
    text: s.text,
  }));

  console.log(`Segments: ${segments.length}`);

  // Load previous script to detect text changes (for cache invalidation)
  const cacheManifest = path.join(audioDir, "manifest.json");
  let prevTexts: Record<string, string> = {};
  if (fs.existsSync(cacheManifest)) {
    try { prevTexts = JSON.parse(fs.readFileSync(cacheManifest, "utf-8")); } catch {}
  }

  // ── Generate TTS for each segment ──────────────────────────────────
  console.log("\n🎙️  Generating voiceover audio...\n");

  const audioFiles: { path: string; startSec: number; actualDuration: number }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const audioPath = path.join(audioDir, `seg_${i}.mp3`);

    // Skip if cached AND text hasn't changed
    const textChanged = prevTexts[`seg_${i}`] !== seg.text;
    if (!textChanged && fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1000) {
      const dur = parseFloat(
        execFileSync("ffprobe", [
          "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", audioPath,
        ], { encoding: "utf-8" }).trim()
      );
      console.log(`  ⏩ Segment ${i}: cached (${dur.toFixed(1)}s)`);
      audioFiles.push({ path: audioPath, startSec: seg.startSec, actualDuration: dur });
      continue;
    }
    if (textChanged && prevTexts[`seg_${i}`]) {
      console.log(`  🔄 Segment ${i}: text changed, regenerating`);
    }

    console.log(`  🎙️  Segment ${i}: "${seg.text.slice(0, 60)}..."`);
    const dur = await generateTTS(seg.text, audioPath, config.voiceId);
    console.log(`  ✅ Segment ${i}: ${dur.toFixed(1)}s`);
    audioFiles.push({ path: audioPath, startSec: seg.startSec, actualDuration: dur });
  }

  // Save manifest for next run's cache invalidation
  const newManifest: Record<string, string> = {};
  segments.forEach((seg, i) => { newManifest[`seg_${i}`] = seg.text; });
  fs.writeFileSync(cacheManifest, JSON.stringify(newManifest, null, 2));

  // ── Recalculate start times to prevent overlaps ────────────────────
  // Each segment starts at max(its intended time, previous segment end + gap)
  const GAP_SEC = 0.5;
  for (let i = 0; i < audioFiles.length; i++) {
    const intended = segments[i].startSec;
    if (i === 0) {
      audioFiles[i].startSec = intended;
    } else {
      const prevEnd = audioFiles[i - 1].startSec + audioFiles[i - 1].actualDuration;
      audioFiles[i].startSec = Math.max(intended, prevEnd + GAP_SEC);
    }
    console.log(`  📍 Segment ${i}: starts at ${audioFiles[i].startSec.toFixed(1)}s (duration ${audioFiles[i].actualDuration.toFixed(1)}s)`);
  }

  const lastSeg = audioFiles[audioFiles.length - 1];
  const totalVoiceover = lastSeg.startSec + lastSeg.actualDuration;
  console.log(`  Total voiceover: ${totalVoiceover.toFixed(1)}s / video: ${videoDuration.toFixed(1)}s`);
  if (totalVoiceover > videoDuration) {
    console.warn(`  ⚠️  Voiceover (${totalVoiceover.toFixed(1)}s) exceeds video length (${videoDuration.toFixed(1)}s) — audio will be truncated.`);
  }

  // ── Build complex ffmpeg filter to place audio at correct timestamps ──
  console.log("\n🔧 Mixing audio with video...\n");

  // Build ffmpeg command: input video + each audio segment, then use adelay to position them
  const inputs: string[] = ["-i", config.video];
  const filterParts: string[] = [];

  for (let i = 0; i < audioFiles.length; i++) {
    inputs.push("-i", audioFiles[i].path);
    const delayMs = Math.round(audioFiles[i].startSec * 1000);
    filterParts.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
  }

  const mixInputs = audioFiles.map((_, i) => `[a${i}]`).join("");
  filterParts.push(
    `${mixInputs}amix=inputs=${audioFiles.length}:dropout_transition=0:normalize=0[voiceover]`
  );

  const filterComplex = filterParts.join(";");

  // Write filter to file to avoid shell escaping issues
  const filterPath = path.join(workDir, "filter.txt");
  fs.writeFileSync(filterPath, filterComplex);

  const ffmpegArgs = [
    "-y",
    ...inputs,
    "-filter_complex_script", filterPath,
    "-map", "0:v",
    "-map", "[voiceover]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    config.output,
  ];

  console.log("  Running ffmpeg...");
  execFileSync("ffmpeg", ffmpegArgs, { stdio: "pipe" });

  // ── Generate SRT ───────────────────────────────────────────────────
  const srtPath = config.output.replace(/\.mp4$/, ".srt");
  // Use actual playback times (after overlap adjustment) for captions
  const adjustedSegments = segments.map((seg, i) => ({
    ...seg,
    startSec: audioFiles[i].startSec,
    endSec: audioFiles[i].startSec + audioFiles[i].actualDuration,
  }));
  fs.writeFileSync(srtPath, generateSRT(adjustedSegments));
  console.log(`  📝 Captions: ${srtPath}`);

  // ── Burn captions directly into the final video ─────────────────────
  // Use the subtitles filter on the already-muxed video with the SRT file.
  // Copy SRT to a short path to avoid ffmpeg escaping issues with spaces.
  console.log("\n🎬 Burning in captions...\n");

  const shortSrt = path.join(workDir, "captions.srt");
  fs.copyFileSync(srtPath, shortSrt);

  const captionedOutput = config.output.replace(/\.mp4$/, "-captioned.mp4");
  try {
    execFileSync("ffmpeg", [
      "-y",
      "-i", config.output,
      "-vf", `subtitles='${shortSrt.replace(/'/g, "'\\''")}':force_style='FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,Shadow=0,BackColour=&H80000000,Alignment=2,MarginV=30'`,
      "-c:v", "libx264",
      "-crf", "18",
      "-preset", "fast",
      "-c:a", "copy",
      captionedOutput,
    ], { stdio: "pipe", timeout: 600000 });
    console.log(`  ✅ Captioned video: ${captionedOutput}`);
  } catch (err: any) {
    // If subtitles filter fails, try with drawtext as fallback
    console.warn(`  ⚠️  Subtitles filter failed, trying alternative...`);
    console.warn(`  ${err.stderr?.toString().slice(-200) || err.message}`);
  }

  // ── Done ───────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const stats = fs.statSync(config.output);
  console.log("\n" + "=".repeat(60));
  console.log(`✅ Done in ${elapsed}s`);
  console.log(`   Video:    ${config.output} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`   Captions: ${srtPath}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("❌ Pipeline failed:", err);
  process.exit(1);
});

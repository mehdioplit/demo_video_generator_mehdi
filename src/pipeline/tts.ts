/**
 * Text-to-Speech Module
 * Uses ElevenLabs API to generate voiceover audio for each scene.
 */

import fs from "fs";
import path from "path";
import type { Scene, AudioSegment } from "../types";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

// Default voice: "Rachel" — a clear, professional female voice.
// You can change this in .env or pass it as a CLI arg.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

interface ElevenLabsConfig {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

/**
 * Fallback TTS using macOS `say` command when ElevenLabs is unavailable.
 */
async function generateAudioWithSay(
  text: string,
  outputPath: string
): Promise<number> {
  const { execFileSync } = await import("child_process");
  const aiffPath = outputPath.replace(/\.mp3$/, ".aiff");
  const tmpTextPath = outputPath.replace(/\.mp3$/, ".txt");

  fs.writeFileSync(tmpTextPath, text);

  execFileSync("say", ["-v", "Samantha", "-f", tmpTextPath, "-o", aiffPath]);
  execFileSync("ffmpeg", ["-y", "-i", aiffPath, "-codec:a", "libmp3lame", "-qscale:a", "2", outputPath]);

  try { fs.unlinkSync(aiffPath); } catch {}
  try { fs.unlinkSync(tmpTextPath); } catch {}

  return getAudioDuration(outputPath);
}

/**
 * Generate audio for a single scene's narration.
 * Tries ElevenLabs first, falls back to macOS `say` on failure.
 */
async function generateAudio(
  text: string,
  outputPath: string,
  config: ElevenLabsConfig
): Promise<number> {
  try {
    if (!config.apiKey) {
      throw new Error("No API key — using fallback");
    }

    const voiceId = config.voiceId || DEFAULT_VOICE_ID;
    const url = `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": config.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: config.modelId || "eleven_multilingual_v2",
        voice_settings: {
          stability: config.stability ?? 0.5,
          similarity_boost: config.similarityBoost ?? 0.75,
          style: config.style ?? 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ElevenLabs API error (${response.status}): ${errorText}`
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    const durationSec = await getAudioDuration(outputPath);
    return durationSec;
  } catch (err: any) {
    console.warn(`  ⚠️  ElevenLabs failed: ${err.message}`);
    console.warn(`  🔄 Falling back to macOS "say" TTS...`);
    return generateAudioWithSay(text, outputPath);
  }
}

/**
 * Get audio file duration in seconds using ffprobe.
 */
async function getAudioDuration(filePath: string): Promise<number> {
  const { execSync } = await import("child_process");
  try {
    const result = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: "utf-8" }
    );
    return parseFloat(result.trim());
  } catch {
    // Fallback: estimate from file size (~16kbps for mp3)
    const stats = fs.statSync(filePath);
    return stats.size / (16 * 1024);
  }
}

/**
 * Generate audio for all scenes and return audio segments with actual durations.
 */
export async function generateAllAudio(
  scenes: Scene[],
  workDir: string
): Promise<AudioSegment[]> {
  const audioDir = path.join(workDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("⚠️  No ELEVENLABS_API_KEY — will use macOS 'say' fallback for all scenes");
  }

  const config: ElevenLabsConfig = {
    apiKey: apiKey || "",
    voiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID,
    modelId: process.env.ELEVENLABS_MODEL_ID,
  };

  const segments: AudioSegment[] = [];

  for (const scene of scenes) {
    const audioPath = path.join(audioDir, `scene_${scene.index}.mp3`);

    // Skip if audio already exists from a previous run
    if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1000) {
      const durationSec = await getAudioDuration(audioPath);
      console.log(`  ⏩ Scene ${scene.index}: cached (${durationSec.toFixed(1)}s)`);
      segments.push({ sceneIndex: scene.index, audioPath, durationSec });
      continue;
    }

    console.log(
      `🎙️  Generating audio for scene ${scene.index}: "${scene.narration.slice(0, 50)}..."`
    );

    const durationSec = await generateAudio(scene.narration, audioPath, config);

    segments.push({
      sceneIndex: scene.index,
      audioPath,
      durationSec,
    });

    console.log(`  ✅ Scene ${scene.index}: ${durationSec.toFixed(1)}s`);
  }

  return segments;
}

/**
 * Concatenate all audio segments into a single audio file using ffmpeg.
 */
export async function concatenateAudio(
  segments: AudioSegment[],
  workDir: string
): Promise<{ fullAudioPath: string; totalDurationSec: number }> {
  const { execSync } = await import("child_process");
  const audioDir = path.join(workDir, "audio");
  const listPath = path.join(audioDir, "concat_list.txt");
  const fullAudioPath = path.join(audioDir, "full_voiceover.mp3");

  // Create ffmpeg concat list
  const listContent = segments
    .sort((a, b) => a.sceneIndex - b.sceneIndex)
    .map((s) => `file '${path.resolve(s.audioPath)}'`)
    .join("\n");

  fs.writeFileSync(listPath, listContent);

  // Concatenate with ffmpeg
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${fullAudioPath}"`,
    { stdio: "pipe" }
  );

  const totalDurationSec = await getAudioDuration(fullAudioPath);
  console.log(
    `✅ Full audio: ${fullAudioPath} (${totalDurationSec.toFixed(1)}s)`
  );

  return { fullAudioPath, totalDurationSec };
}

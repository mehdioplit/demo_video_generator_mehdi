/**
 * Render Module
 * Uses Remotion's programmatic API to render the final video.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { VideoData } from "../types";

/**
 * Render the video using Remotion CLI.
 * We shell out to `npx remotion render` because the programmatic renderer
 * requires @remotion/renderer which adds heavy native deps.
 */
export async function renderVideo(
  videoData: VideoData,
  outputPath: string,
  options: { width?: number; height?: number; fps?: number } = {}
): Promise<string> {
  const width = options.width || 1920;
  const height = options.height || 1080;
  const fps = options.fps || 30;

  // Copy screenshots and audio to `public/` so Remotion's bundler can serve them
  const publicDir = path.resolve(__dirname, "../../public");
  const publicScreenshots = path.join(publicDir, "screenshots");
  const publicAudio = path.join(publicDir, "audio");
  fs.mkdirSync(publicScreenshots, { recursive: true });
  fs.mkdirSync(publicAudio, { recursive: true });

  // Deep-clone videoData to rewrite paths without mutating the original
  const propsData: VideoData = JSON.parse(JSON.stringify(videoData));

  for (const scene of propsData.script.scenes) {
    if (scene.screenshotPath && fs.existsSync(scene.screenshotPath)) {
      const filename = path.basename(scene.screenshotPath);
      fs.copyFileSync(scene.screenshotPath, path.join(publicScreenshots, filename));
      scene.screenshotPath = `screenshots/${filename}`;
    }
  }

  if (propsData.fullAudioPath && fs.existsSync(propsData.fullAudioPath)) {
    const audioFilename = path.basename(propsData.fullAudioPath);
    fs.copyFileSync(propsData.fullAudioPath, path.join(publicAudio, audioFilename));
    propsData.fullAudioPath = `audio/${audioFilename}`;
  }

  // Write the video data as a JSON props file for Remotion
  const propsPath = path.join(
    path.dirname(outputPath),
    ".remotion-props.json"
  );
  fs.writeFileSync(
    propsPath,
    JSON.stringify({ data: propsData }, null, 2)
  );

  console.log(`🎬 Rendering video (${width}x${height} @ ${fps}fps)...`);
  console.log(`   Total frames: ${videoData.totalFrames}`);
  console.log(`   Output: ${outputPath}`);

  const cmd = [
    "npx remotion render",
    "src/index.ts",
    "DemoVideo",
    `"${outputPath}"`,
    `--props="${propsPath}"`,
    `--width=${width}`,
    `--height=${height}`,
    `--fps=${fps}`,
    `--frames=0-${videoData.totalFrames - 1}`,
    "--codec=h264",
    "--image-format=jpeg",
    "--quality=80",
    "--log=verbose",
  ].join(" ");

  try {
    execSync(cmd, {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../.."),
      timeout: 600000, // 10 minute timeout
    });
  } catch (err) {
    throw new Error(`Remotion render failed: ${err}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Render completed but output file not found: ${outputPath}`);
  }

  const stats = fs.statSync(outputPath);
  console.log(
    `✅ Video rendered: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`
  );

  // Clean up props file
  fs.unlinkSync(propsPath);

  return outputPath;
}

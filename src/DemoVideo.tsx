/**
 * DemoVideo Composition
 * The main Remotion composition that assembles screenshots, audio, and captions.
 */

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useVideoConfig,
  staticFile,
} from "remotion";
import { WebsiteScene } from "./components/WebsiteScene";
import { CaptionOverlay } from "./components/CaptionOverlay";
import type { VideoData, Scene, AudioSegment, Caption } from "./types";

// Animation patterns to cycle through for visual variety
const ANIMATIONS = ["zoom-in", "zoom-out", "pan-right", "pan-down", "static"] as const;

export const DemoVideo: React.FC<{ data: VideoData }> = ({ data }) => {
  const { fps } = useVideoConfig();
  const { script, audioSegments, captions, fullAudioPath } = data;

  // Calculate frame offsets for each scene based on actual audio durations
  const sceneTimings = calculateSceneTimings(script.scenes, audioSegments, fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f172a" }}>
      {/* Website screenshot scenes */}
      {sceneTimings.map((timing, i) => (
        <Sequence
          key={`scene-${i}`}
          from={timing.startFrame}
          durationInFrames={timing.durationFrames}
        >
          <WebsiteScene
            screenshotSrc={script.scenes[i].screenshotPath || ""}
            durationInFrames={timing.durationFrames}
            startFrame={timing.startFrame}
            animation={ANIMATIONS[i % ANIMATIONS.length]}
          />
        </Sequence>
      ))}

      {/* Caption overlay (runs for full duration) */}
      <CaptionOverlay captions={captions} fps={fps} style="default" />

      {/* Full voiceover audio */}
      {fullAudioPath && <Audio src={staticFile(fullAudioPath)} />}
    </AbsoluteFill>
  );
};

interface SceneTiming {
  startFrame: number;
  durationFrames: number;
}

function calculateSceneTimings(
  scenes: Scene[],
  audioSegments: AudioSegment[],
  fps: number
): SceneTiming[] {
  const timings: SceneTiming[] = [];
  let currentFrame = 0;

  for (const scene of scenes) {
    const segment = audioSegments.find((s) => s.sceneIndex === scene.index);
    const durationSec = segment?.durationSec || scene.durationSec;
    const durationFrames = Math.ceil(durationSec * fps);

    timings.push({
      startFrame: currentFrame,
      durationFrames,
    });

    currentFrame += durationFrames;
  }

  return timings;
}

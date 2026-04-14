/**
 * WebsiteScene Component
 * Displays a website screenshot with smooth Ken Burns-style pan/zoom animation.
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Img,
  staticFile,
} from "remotion";

interface WebsiteSceneProps {
  /** Absolute path to the screenshot image */
  screenshotSrc: string;
  /** Duration of this scene in frames */
  durationInFrames: number;
  /** Starting frame of this scene within the composition */
  startFrame: number;
  /** Type of animation to apply */
  animation?: "zoom-in" | "zoom-out" | "pan-right" | "pan-down" | "static";
}

export const WebsiteScene: React.FC<WebsiteSceneProps> = ({
  screenshotSrc,
  durationInFrames,
  startFrame,
  animation = "zoom-in",
}) => {
  // useCurrentFrame() inside a <Sequence> already returns the frame
  // relative to the sequence start — no need to subtract startFrame.
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const progress = frame / durationInFrames;

  // Fade in/out at scene boundaries
  const opacity = interpolate(
    frame,
    [0, 15, durationInFrames - 15, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Animation transforms
  let scale = 1;
  let translateX = 0;
  let translateY = 0;

  switch (animation) {
    case "zoom-in":
      scale = interpolate(progress, [0, 1], [1, 1.08], {
        extrapolateRight: "clamp",
      });
      break;
    case "zoom-out":
      scale = interpolate(progress, [0, 1], [1.08, 1], {
        extrapolateRight: "clamp",
      });
      break;
    case "pan-right":
      translateX = interpolate(progress, [0, 1], [0, -40], {
        extrapolateRight: "clamp",
      });
      scale = 1.05;
      break;
    case "pan-down":
      translateY = interpolate(progress, [0, 1], [0, -30], {
        extrapolateRight: "clamp",
      });
      scale = 1.05;
      break;
    case "static":
      break;
  }

  return (
    <div
      style={{
        width,
        height,
        overflow: "hidden",
        position: "absolute",
        top: 0,
        left: 0,
        opacity,
        backgroundColor: "#0f172a",
      }}
    >
      <Img
        src={staticFile(screenshotSrc)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transformOrigin: "center center",
        }}
      />
    </div>
  );
};

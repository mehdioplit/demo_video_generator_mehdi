/**
 * CaptionOverlay Component
 * Renders animated text captions at the bottom of the video.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { Caption } from "../types";

interface CaptionOverlayProps {
  captions: Caption[];
  fps: number;
  style?: "default" | "minimal" | "bold";
}

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({
  captions,
  fps,
  style = "default",
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const currentTimeSec = frame / fps;

  // Find the active caption
  const activeCaption = captions.find(
    (c) => currentTimeSec >= c.startSec && currentTimeSec < c.endSec
  );

  if (!activeCaption) return null;

  const captionStartFrame = activeCaption.startSec * fps;
  const captionEndFrame = activeCaption.endSec * fps;
  const captionDuration = captionEndFrame - captionStartFrame;

  // Fade in and out
  const opacity = interpolate(
    frame,
    [
      captionStartFrame,
      captionStartFrame + 8,
      captionEndFrame - 8,
      captionEndFrame,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Slight slide up on entry
  const translateY = interpolate(
    frame,
    [captionStartFrame, captionStartFrame + 10],
    [12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const styles = getCaptionStyles(style, width);

  return (
    <div
      style={{
        ...styles.container,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div style={styles.textBox}>
        <span style={styles.text}>{activeCaption.text}</span>
      </div>
    </div>
  );
};

function getCaptionStyles(
  style: string,
  width: number
): {
  container: React.CSSProperties;
  textBox: React.CSSProperties;
  text: React.CSSProperties;
} {
  const base = {
    container: {
      position: "absolute" as const,
      bottom: 60,
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
      zIndex: 100,
    },
    textBox: {} as React.CSSProperties,
    text: {} as React.CSSProperties,
  };

  switch (style) {
    case "minimal":
      return {
        ...base,
        textBox: {
          maxWidth: width * 0.8,
          padding: "8px 20px",
        },
        text: {
          color: "#ffffff",
          fontSize: 28,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontWeight: 500,
          textAlign: "center" as const,
          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          lineHeight: 1.4,
        },
      };

    case "bold":
      return {
        ...base,
        textBox: {
          maxWidth: width * 0.85,
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          padding: "14px 28px",
          borderRadius: 8,
        },
        text: {
          color: "#ffffff",
          fontSize: 34,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontWeight: 700,
          textAlign: "center" as const,
          lineHeight: 1.3,
        },
      };

    default: // "default"
      return {
        ...base,
        textBox: {
          maxWidth: width * 0.8,
          backgroundColor: "rgba(15, 23, 42, 0.75)",
          backdropFilter: "blur(8px)",
          padding: "12px 24px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.1)",
        },
        text: {
          color: "#f8fafc",
          fontSize: 30,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontWeight: 500,
          textAlign: "center" as const,
          lineHeight: 1.4,
        },
      };
  }
}

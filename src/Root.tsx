/**
 * Remotion Root
 * Registers the DemoVideo composition.
 */

import React from "react";
import { Composition } from "remotion";
import { DemoVideo } from "./DemoVideo";
import type { VideoData } from "./types";

export const RemotionRoot: React.FC = () => {
  // Default props for the Remotion Studio preview.
  // In production, these are overridden by the render script via --props.
  const defaultData: VideoData = {
    script: {
      title: "Demo Video",
      websiteUrl: "https://example.com",
      scenes: [],
      totalDurationSec: 10,
    },
    audioSegments: [],
    captions: [
      {
        text: "This is a preview. Run the generate command to create a real video.",
        startSec: 0,
        endSec: 10,
      },
    ],
    fullAudioPath: "",
    fps: 30,
    totalFrames: 300,
  };

  return (
    <>
      <Composition
        id="DemoVideo"
        component={DemoVideo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ data: defaultData }}
        calculateMetadata={({ props }) => {
          return {
            durationInFrames: props.data.totalFrames || 300,
            fps: props.data.fps || 30,
          };
        }}
      />
    </>
  );
};

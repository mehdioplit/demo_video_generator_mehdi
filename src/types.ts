/** A single scene in the demo video */
export interface Scene {
  /** Index of the scene (0-based) */
  index: number;
  /** The page or section of the website to show */
  pageUrl: string;
  /** Scroll position (0-1) on the page */
  scrollPercent: number;
  /** Optional CSS selector to highlight / click */
  selector?: string;
  /** Action to perform: scroll, click, or static */
  action: "scroll" | "click" | "static";
  /** Voiceover text for this scene */
  narration: string;
  /** Duration in seconds (estimated from narration length) */
  durationSec: number;
  /** Path to the screenshot captured for this scene */
  screenshotPath?: string;
}

/** The full generated script for a demo video */
export interface VideoScript {
  /** Title of the demo */
  title: string;
  /** Target website URL */
  websiteUrl: string;
  /** Ordered list of scenes */
  scenes: Scene[];
  /** Total estimated duration in seconds */
  totalDurationSec: number;
}

/** Audio segment produced by TTS */
export interface AudioSegment {
  /** Scene index this audio belongs to */
  sceneIndex: number;
  /** Path to the audio file */
  audioPath: string;
  /** Actual duration of the audio in seconds */
  durationSec: number;
}

/** Caption entry for subtitle overlay */
export interface Caption {
  /** Text to display */
  text: string;
  /** Start time in seconds */
  startSec: number;
  /** End time in seconds */
  endSec: number;
}

/** Complete video data passed to the Remotion composition */
export interface VideoData {
  script: VideoScript;
  audioSegments: AudioSegment[];
  captions: Caption[];
  /** Path to the concatenated full audio file */
  fullAudioPath: string;
  /** FPS of the video */
  fps: number;
  /** Total duration in frames */
  totalFrames: number;
}

/** Configuration for the generator */
export interface GeneratorConfig {
  /** Website URL to demo */
  url: string;
  /** LLM prompt describing what to highlight */
  prompt: string;
  /** Output file path */
  outputPath: string;
  /** Video width */
  width: number;
  /** Video height */
  height: number;
  /** Frames per second */
  fps: number;
  /** ElevenLabs voice ID */
  voiceId: string;
  /** Output directory for intermediate files */
  workDir: string;
}

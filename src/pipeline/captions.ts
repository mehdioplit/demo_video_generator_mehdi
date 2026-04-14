/**
 * Captions Module
 * Generates timed caption entries from the script and audio segments.
 */

import type { Scene, AudioSegment, Caption } from "../types";

/**
 * Generate captions from scenes and their audio durations.
 * Splits long narrations into shorter caption lines for readability.
 */
export function generateCaptions(
  scenes: Scene[],
  audioSegments: AudioSegment[]
): Caption[] {
  const captions: Caption[] = [];
  let currentTime = 0;

  for (const scene of scenes) {
    const segment = audioSegments.find((s) => s.sceneIndex === scene.index);
    const sceneDuration = segment?.durationSec || scene.durationSec;

    // Split narration into chunks of ~8-12 words for readable captions
    const words = scene.narration.split(/\s+/);
    const chunks = splitIntoChunks(words, 10);
    const chunkDuration = sceneDuration / chunks.length;

    for (let i = 0; i < chunks.length; i++) {
      captions.push({
        text: chunks[i],
        startSec: currentTime + i * chunkDuration,
        endSec: currentTime + (i + 1) * chunkDuration,
      });
    }

    currentTime += sceneDuration;
  }

  return captions;
}

/**
 * Split an array of words into chunks of approximately `maxWords` words,
 * trying to break at natural sentence boundaries.
 */
function splitIntoChunks(words: string[], maxWords: number): string[] {
  const chunks: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);

    // Break at sentence boundaries or when reaching max length
    const isEndOfSentence = /[.!?]$/.test(word);
    const isLongEnough = current.length >= maxWords;
    const isNearMax = current.length >= maxWords - 2;

    if (isEndOfSentence || (isLongEnough && isNearMax)) {
      chunks.push(current.join(" "));
      current = [];
    }
  }

  // Don't leave very short trailing chunks; merge with previous
  if (current.length > 0) {
    if (current.length <= 3 && chunks.length > 0) {
      chunks[chunks.length - 1] += " " + current.join(" ");
    } else {
      chunks.push(current.join(" "));
    }
  }

  return chunks;
}

/**
 * Export captions as an SRT file (for external use / accessibility).
 */
export function exportSRT(captions: Caption[]): string {
  return captions
    .map((c, i) => {
      const start = formatSRTTime(c.startSec);
      const end = formatSRTTime(c.endSec);
      return `${i + 1}\n${start} --> ${end}\n${c.text}\n`;
    })
    .join("\n");
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(ms)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}

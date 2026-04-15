/**
 * Script Writer Module
 * Uses Claude API to analyze website content and generate a structured video script.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { VideoScript, Scene } from "../types";

const SYSTEM_PROMPT = `You are a professional video scriptwriter who creates engaging demo video scripts for websites and SaaS products.

Given the website's text content, URL structure, and the user's prompt, create a structured demo video script.

Rules:
- Keep the total video between 60-180 seconds (aim for ~90 seconds)
- Each scene should have 1-3 sentences of narration (natural, conversational tone)
- CRITICAL: Each scene MUST show a DIFFERENT page or a significantly different scroll position. No two scenes should look similar.
- Order scenes logically: start with an overview, then dive into key features across different pages
- Use the actual page URLs from the website for each scene
- Visit as many DIFFERENT pages as possible — do not stay on the same page for more than 2 scenes
- Specify scroll positions (0.0 = top, 0.5 = middle, 1.0 = bottom) to show relevant content
- If a scene involves clicking an element, provide a CSS selector
- Recommended page flow for a supply chain copilot:
  1. Main dashboard (/) — overview of plant cards
  2. Plant decisions view (/plant/1/decisions) — decision support
  3. Analytics (/analytics) — performance charts
  4. Plant management (/plant-management) — detailed operations
  5. Plant detail with scheduling (/plant-management/1) — production schedule
  6. AI agents (/ai-agents) — AI automation

Respond with a JSON object matching this exact structure:
{
  "title": "string - short title for the video",
  "scenes": [
    {
      "index": 0,
      "pageUrl": "https://...",
      "scrollPercent": 0.0,
      "selector": "optional CSS selector to click",
      "action": "scroll" | "click" | "static",
      "narration": "The voiceover text for this scene",
      "durationSec": 8
    }
  ]
}

Estimate durationSec based on narration length (~150 words per minute = ~2.5 words per second).
Return ONLY the JSON, no markdown fences or additional text.`;

export async function generateScript(
  websiteUrl: string,
  textContent: string,
  discoveredPages: string[],
  userPrompt: string
): Promise<VideoScript> {
  const client = new Anthropic();

  const userMessage = `
Website URL: ${websiteUrl}
Discovered pages: ${discoveredPages.join("\n")}

--- Website Text Content (truncated to ~4000 chars) ---
${textContent.slice(0, 4000)}
---

User's direction: ${userPrompt}

Generate the demo video script as JSON.`;

  console.log("🤖 Generating video script with Claude...");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Parse the JSON response (handle potential markdown fences)
  const jsonStr = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  let parsed: { title: string; scenes: Scene[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error("Failed to parse script JSON:", text);
    throw new Error(`Failed to parse Claude's script response: ${err}`);
  }

  // Calculate total duration
  const totalDurationSec = parsed.scenes.reduce(
    (sum, s) => sum + s.durationSec,
    0
  );

  const script: VideoScript = {
    title: parsed.title,
    websiteUrl,
    scenes: parsed.scenes.map((s, i) => ({ ...s, index: i })),
    totalDurationSec,
  };

  console.log(
    `✅ Script generated: "${script.title}" — ${script.scenes.length} scenes, ~${totalDurationSec}s total`
  );

  return script;
}

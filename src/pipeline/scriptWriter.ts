/**
 * Script Writer Module
 * Uses Claude API to analyze website content and generate a structured video script.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { VideoScript, Scene } from "../types";

const SYSTEM_PROMPT = `You write voiceover scripts for SaaS product demo videos. Your style is direct, factual, and confident — like a founder walking a prospect through the product live.

Here is an EXAMPLE of the exact style and tone you must follow. Study it carefully:

"""
This is The Brand x Oplit Copilot. It connects the entire chain into a single decision layer: suppliers, warehouses, stores, everything. All teams share the same real-time picture.

All factories and their service levels at a glance. Inside Factory 1, the dashboard shows utilization and throughput. Then the macro capacity planning grid maps every production line, week by week.

The AI adjusts production schedules in real time, all the way down to individual machine assignments, with full visibility on projected raw material needs.

Machine status is tracked in real time across every line. No more spreadsheets, no more blind spots.

BrandSupply acts as an agentic decision layer. Here, it detected an available capacity window: one week of open production time. It cross-referenced the demand and generated a recommendation to fill the gap.

An agent detected a shortage risk? Add a new scheduling rule to prioritize and avoid it. Once approved, the rule applies instantly. This is a complete Knowledge Model of the factory, capturing all the scheduling rules that used to sit only in people's heads.

Behind every decision is a team of specialized AI agents, with full transparency and human control at every level. The main copilot coordinates all agents and arbitrates trade-offs between service levels, costs, and factory capacity.

The planning rules engine: managers define business rules, the AI analyzes impact, simulates changes, and routes them through a governed approval workflow. From human intent to validated deployment.
"""

RULES:
- Follow that style EXACTLY. Short, punchy, descriptive of what's on screen.
- NEVER invent numbers, financial figures, percentages, or specific metrics that aren't visible on screen
- NEVER fabricate dollar/euro amounts or savings figures
- NEVER say "Here's where the magic happens" or similar filler
- The FIRST sentence of the script MUST be: "This is [ClientName] x Oplit Copilot." Always. No exceptions.
- Use the CLIENT NAME naturally throughout
- Describe what the viewer SEES, not abstract capabilities
- Keep sentences short. 1-2 sentences per thought. Let the visuals breathe.
- The script must flow as ONE continuous walkthrough, not disconnected descriptions

STRUCTURE:
- 7-9 scenes, aim for 90-130 seconds total
- Start with a bold one-liner naming the client and what this is
- End with a strong closing
- EXACTLY ONE scene per page. Never show the same page twice.

TECHNICAL RULES:
- Use the actual page URLs from the website
- For clicking tabs/buttons, use Playwright selectors: text=ButtonText
- Page flow:
  1. Main dashboard (/) — intro + plant overview
  2. Plant decisions (/plant/1/decisions) — decision support
  3. Analytics (/analytics) — performance
  4. Plant management (/plant-management) — operational view
  5. Plant detail (/plant-management/1) — static, NO click. Show the optimized schedule view (default). EXACTLY ONE SCENE.
  6. AI agents (/ai-agents) — click text=Specialized Agents
  7. AI agents (/ai-agents) — click text=Planning Rules

Respond with a JSON object matching this exact structure:
{
  "title": "string - short punchy title",
  "scenes": [
    {
      "index": 0,
      "pageUrl": "https://...",
      "scrollPercent": 0.0,
      "selector": "optional - use text=ButtonText format for clicks",
      "action": "scroll" | "click" | "static",
      "narration": "The voiceover text for this scene — specific, compelling, story-driven",
      "durationSec": 10
    }
  ]
}

Estimate durationSec based on narration length (~2.5 words per second).
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

--- Website Text Content (truncated to ~6000 chars) ---
${textContent.slice(0, 6000)}
---

User's direction: ${userPrompt}

Generate the demo video script as JSON.`;

  console.log("\uD83E\uDD16 Generating video script with Claude...");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
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
    `\u2705 Script generated: "${script.title}" \u2014 ${script.scenes.length} scenes, ~${totalDurationSec}s total`
  );

  return script;
}

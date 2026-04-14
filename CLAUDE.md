# AI Demo Video Generator — Session Context

## Goal

Build an automated pipeline that generates website demo videos with AI voiceover and text captions. This is for **Oplit** (oplit.fr) — a workforce scheduling SaaS. The team needs to produce multiple demo videos per week, each tailored to a different client context.

## Decisions Made

| Decision | Choice |
|----------|--------|
| Video style | **Screen recording** — automated browser navigating through the website (product walkthrough) |
| Script source | **AI-generated from website** — AI visits the site, understands the product, and writes the voiceover script |
| Video length | **Medium (1–3 min)**, MP4 |
| Client context source | **An LLM prompt** — the user provides a prompt describing what to focus on for each client |
| Video framework | **Remotion** (React-based programmatic video) |
| TTS provider | **ElevenLabs** (eleven_multilingual_v2 model, default voice: Rachel) |
| LLM for scripts | **Claude API** (claude-sonnet-4-20250514) |
| Language | **English** (user may want French support later) |

## Architecture

### Pipeline (5 steps, single CLI command)

```
npm run generate -- --url "https://example.com" --prompt "Highlight scheduling features"
```

1. **Capture** (`src/pipeline/capture.ts`) — Playwright visits the URL, extracts text content, discovers internal pages, takes screenshots at multiple scroll positions (top, 25%, 50%, 75%, bottom) on up to 5 pages.

2. **Script Generation** (`src/pipeline/scriptWriter.ts`) — Sends extracted text + discovered URLs + user prompt to Claude API. Claude returns a structured JSON script with scenes (pageUrl, scrollPercent, selector, action, narration, durationSec).

3. **Scene Screenshots** (`src/pipeline/capture.ts` → `captureAllScenes`) — Re-captures screenshots matching each scene's exact specs (specific page, scroll position, optional click action). Reuses a single browser instance for performance.

4. **TTS Audio** (`src/pipeline/tts.ts`) — ElevenLabs generates MP3 voiceover for each scene's narration. Audio segments are concatenated with ffmpeg into a single voiceover track. Actual durations are measured via ffprobe.

5. **Render** (`src/pipeline/render.ts` + Remotion compositions) — Remotion renders the final MP4. Screenshots are animated with Ken Burns effects (zoom-in, zoom-out, pan-right, pan-down, cycling per scene). Captions are overlaid at the bottom with fade-in/out animations. Audio is synced to the visual timeline.

### Outputs per run
- `demo.mp4` — Final video
- `demo.srt` — Subtitle file
- `output/.work/script.json` — Generated script (reviewable/editable)

## Project Structure

```
video-generator/
├── package.json
├── tsconfig.json
├── remotion.config.ts
├── .env.example          # ANTHROPIC_API_KEY + ELEVENLABS_API_KEY
├── .gitignore
├── README.md
├── src/
│   ├── index.ts           # Remotion entry point
│   ├── Root.tsx            # Remotion root (registers DemoVideo composition)
│   ├── DemoVideo.tsx       # Main composition: sequences scenes + captions + audio
│   ├── types.ts            # TypeScript interfaces (Scene, VideoScript, AudioSegment, Caption, VideoData, GeneratorConfig)
│   ├── components/
│   │   ├── WebsiteScene.tsx    # Screenshot display with Ken Burns animation
│   │   └── CaptionOverlay.tsx  # Timed caption overlay (3 styles: default, minimal, bold)
│   └── pipeline/
│       ├── generate.ts     # Main CLI orchestrator (entry point)
│       ├── capture.ts      # Playwright website capture + screenshot
│       ├── scriptWriter.ts # Claude API script generation
│       ├── tts.ts          # ElevenLabs TTS + ffmpeg concatenation
│       ├── captions.ts     # Caption timing + SRT export
│       └── render.ts       # Remotion CLI render wrapper
```

## Current Status

- **All code is written and TypeScript compiles clean (zero errors)**
- **Not yet tested end-to-end** (requires API keys + Playwright chromium + ffmpeg on the user's machine)
- Dependencies installed: remotion, playwright, @anthropic-ai/sdk, dotenv, tsx, zod, react, react-dom

## What Needs to Happen Next

1. **Setup on user's machine:**
   - `npm install` (already done in the project)
   - `npx playwright install chromium`
   - Ensure `ffmpeg` is installed
   - Copy `.env.example` → `.env` and add API keys

2. **End-to-end test** — Run `npm run generate -- --url "https://oplit.fr" --prompt "Showcase workforce scheduling"` and debug any runtime issues

3. **Potential improvements to discuss:**
   - French language support (user mentioned they might want it)
   - Batch processing script (loop over multiple URLs/prompts)
   - Custom Remotion templates (different visual styles per client vertical)
   - Intro/outro slides with branding
   - Background music track
   - Webhook or CI integration for automated generation

## Key Technical Notes

- Remotion render shells out to `npx remotion render` (avoids heavy @remotion/renderer native deps)
- Screenshots are taken at 2x device scale factor for crisp visuals
- TTS audio duration is measured with ffprobe, with a file-size-based fallback
- Captions are split into ~10-word chunks, breaking at sentence boundaries
- Scene animations cycle through 5 patterns to avoid visual monotony
- The script generation prompt instructs Claude to estimate narration duration at ~2.5 words/second

## CLI Flags

```
--url        Website URL (required)
--prompt     Focus description (required)
--output     Output path (default: ./output/demo.mp4)
--width      Video width (default: 1920)
--height     Video height (default: 1080)
--fps        FPS (default: 30)
--voice-id   ElevenLabs voice ID
--skip-render  Debug mode: run pipeline without rendering
```

## User Info

- Name: Soufiane
- Company: Oplit (oplit.fr) — workforce scheduling SaaS
- Email: soufiane@oplit.fr

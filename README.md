# AI Demo Video Generator

Automatically generate website demo videos with AI-powered voiceover and captions.

**Pipeline:** Website → Playwright screenshots → Claude script → ElevenLabs audio → Remotion video

## Quick Start

```bash
# 1. Install dependencies
npm install
npx playwright install chromium

# 2. Configure API keys
cp .env.example .env
# Edit .env with your Anthropic and ElevenLabs API keys

# 3. Generate a video
npm run generate -- --url "https://yoursite.com" --prompt "Show the main features"
```

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--url` | *(required)* | Website URL to demo |
| `--prompt` | *(required)* | What to focus on in the video |
| `--output` | `./output/demo.mp4` | Output file path |
| `--width` | `1920` | Video width |
| `--height` | `1080` | Video height |
| `--fps` | `30` | Frames per second |
| `--voice-id` | Rachel | ElevenLabs voice ID |
| `--skip-render` | `false` | Skip video render (debug mode) |

## Examples

```bash
# Basic demo
npm run generate -- --url "https://oplit.fr" --prompt "Showcase workforce scheduling"

# Custom voice and resolution
npm run generate -- \
  --url "https://client-site.com" \
  --prompt "Product walkthrough for HR managers" \
  --voice-id "EXAVITQu4vr4xnSDxMaL" \
  --width 1280 --height 720

# Debug: run pipeline without rendering
npm run generate -- --url "https://example.com" --prompt "test" --skip-render
```

## How It Works

1. **Capture** — Playwright visits the website, extracts text, discovers pages, and takes screenshots at various scroll positions
2. **Script** — Claude analyzes the content and writes a structured video script with narration for each scene
3. **Screenshots** — Playwright re-captures screenshots matching each scene's specifications (page, scroll position, clicks)
4. **Audio** — ElevenLabs generates voiceover audio for each scene's narration
5. **Render** — Remotion assembles everything into a polished MP4 with Ken Burns animations and timed captions

## Output

Each run produces:
- `demo.mp4` — The final video
- `demo.srt` — Caption/subtitle file
- `output/.work/script.json` — The generated script (for review/editing)

## Batch Processing

To generate multiple videos, create a simple shell script:

```bash
#!/bin/bash
CLIENTS=("https://client1.com" "https://client2.com" "https://client3.com")
PROMPTS=("Demo for retail" "Demo for healthcare" "Demo for logistics")

for i in "${!CLIENTS[@]}"; do
  npm run generate -- \
    --url "${CLIENTS[$i]}" \
    --prompt "${PROMPTS[$i]}" \
    --output "./output/client_${i}.mp4"
done
```

## Requirements

- Node.js 18+
- ffmpeg (for audio concatenation)
- Chromium (installed via Playwright)
- Anthropic API key
- ElevenLabs API key

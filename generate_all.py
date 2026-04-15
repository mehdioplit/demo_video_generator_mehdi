#!/usr/bin/env python3
"""
Full pipeline: Generate client config + Launch site + Generate demo video.

Usage:
    # With API keys (full auto)
    export ANTHROPIC_API_KEY="sk-ant-..."
    export ELEVENLABS_API_KEY="..."
    python generate_all.py "Airbus" --mode MTO

    # Without API keys (uses existing config + static script + macOS TTS)
    python generate_all.py "Airbus" --mode MTO --no-api

This script:
  1. Generates clientConfig.ts for the given client (or skips if --no-api)
  2. Starts the dev server
  3. Generates a video script (via Claude API or static fallback)
  4. Runs the demo video pipeline against the local site
  5. Outputs: output/demo_<client>_<mode>.mp4
"""

import sys
import os
import subprocess
import time
import argparse
import json


def get_repo_dir(mode: str) -> str:
    base = os.path.dirname(os.path.abspath(__file__))
    if mode == "MTS":
        return os.path.join(base, "copilot-pierre-fabre")
    else:
        return os.path.join(base, "site-status-board")


def get_video_dir() -> str:
    base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "demo-video-generator")


def step1_generate_config(client_name: str, mode: str, repo_dir: str):
    print(f"\n{'='*60}")
    print(f"Step 1: Generating config for {client_name} ({mode})")
    print(f"{'='*60}\n")

    script_path = os.path.join(repo_dir, "generate_config.py")
    result = subprocess.run(
        [sys.executable, script_path, client_name, "--mode", mode],
        cwd=repo_dir,
    )
    if result.returncode != 0:
        print("Error: Config generation failed")
        sys.exit(1)


def step2_start_dev_server(repo_dir: str, port: int) -> subprocess.Popen:
    print(f"\n{'='*60}")
    print(f"Step 2: Starting dev server on port {port}")
    print(f"{'='*60}\n")

    proc = subprocess.Popen(
        ["npx", "vite", "--port", str(port)],
        cwd=repo_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    for i in range(30):
        time.sleep(1)
        try:
            import urllib.request
            urllib.request.urlopen(f"http://localhost:{port}")
            print(f"Dev server ready on http://localhost:{port}")
            return proc
        except Exception:
            pass

    print("Error: Dev server failed to start within 30 seconds")
    proc.kill()
    sys.exit(1)


def generate_static_script(client_name: str, mode: str, port: int) -> dict:
    """Generate a static demo script without calling any API."""
    base_url = f"http://localhost:{port}"

    scenes = [
        {
            "index": 0,
            "pageUrl": base_url,
            "scrollPercent": 0.0,
            "action": "static",
            "narration": f"Welcome to the {client_name} Supply Chain Copilot. This is the live operations dashboard showing real-time status across all production sites.",
            "durationSec": 10,
        },
        {
            "index": 1,
            "pageUrl": f"{base_url}/plant/1/decisions",
            "scrollPercent": 0.0,
            "action": "static",
            "narration": "Drilling into a plant, the decision support system shows prioritized actions. Critical alerts are highlighted with detailed impact analysis.",
            "durationSec": 10,
        },
        {
            "index": 2,
            "pageUrl": f"{base_url}/plant/1/decisions",
            "scrollPercent": 0.5,
            "action": "scroll",
            "narration": "Decisions span supply, demand, production, and stock categories. Managers can assign, approve, or escalate each decision directly.",
            "durationSec": 10,
        },
        {
            "index": 3,
            "pageUrl": f"{base_url}/analytics",
            "scrollPercent": 0.0,
            "action": "static",
            "narration": f"The analytics layer turns raw operational data into clarity. Run rates, margins, and performance metrics are tracked across all {client_name} sites.",
            "durationSec": 10,
        },
        {
            "index": 4,
            "pageUrl": f"{base_url}/plant-management",
            "scrollPercent": 0.0,
            "action": "static",
            "narration": "The plant management view provides deep operational insights. Demand charts, production trends, and inventory levels are tracked in real time.",
            "durationSec": 10,
        },
        {
            "index": 5,
            "pageUrl": f"{base_url}/plant-management/1",
            "scrollPercent": 0.0,
            "action": "click",
            "selector": "text=Show Actual Schedule",
            "narration": "Here is what makes this possible. A detailed, realistic production schedule spanning weeks into the future. Every machine, every order, planned to the minute.",
            "durationSec": 12,
        },
        {
            "index": 6,
            "pageUrl": f"{base_url}/ai-agents",
            "scrollPercent": 0.0,
            "action": "click",
            "selector": "text=Specialized Agents",
            "narration": "The AI agents work autonomously behind the scenes. Each specialized agent focuses on a domain: inventory, scheduling, demand forecasting, and supplier management.",
            "durationSec": 12,
        },
        {
            "index": 7,
            "pageUrl": f"{base_url}/ai-agents",
            "scrollPercent": 0.0,
            "action": "click",
            "selector": "text=Planning Rules",
            "narration": f"The planning rules engine lets managers define business constraints. The AI analyzes impact, simulates changes, and routes them through a governed approval workflow. From human intent to validated deployment. {client_name}'s factories piloted by AI, with humans in command.",
            "durationSec": 14,
        },
    ]

    total = sum(s["durationSec"] for s in scenes)

    return {
        "title": f"{client_name} Supply Chain Copilot Demo",
        "websiteUrl": base_url,
        "scenes": scenes,
        "totalDurationSec": total,
    }


def step3_generate_video(
    client_name: str,
    mode: str,
    port: int,
    video_dir: str,
    output_path: str,
    has_api_keys: bool,
):
    print(f"\n{'='*60}")
    print(f"Step 3: Generating demo video")
    print(f"{'='*60}\n")

    url = f"http://localhost:{port}"

    # Load .env keys and merge into environment for subprocess
    env = os.environ.copy()
    env_file = os.path.join(video_dir, ".env")
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    val = val.strip().strip('"').strip("'")
                    if val and key.strip() not in env:
                        env[key.strip()] = val

    if has_api_keys:
        # Full auto mode: let the pipeline call Claude for script
        prompt = (
            f"Create a professional demo walkthrough of this {client_name} supply chain copilot. "
            f"IMPORTANT: Visit DIFFERENT pages for each scene. Follow this flow: "
            f"1) Main dashboard (/) showing plant cards, "
            f"2) Inside a plant's decisions (/plant/1/decisions), "
            f"3) Analytics page (/analytics), "
            f"4) Plant management (/plant-management), "
            f"5) Plant detail with scheduling (/plant-management/1) — click 'Show Actual Schedule' using selector text=Show Actual Schedule, "
            f"6) AI agents (/ai-agents) — ONE scene on 'Specialized Agents' tab (click selector text=Specialized Agents), then ONE scene on 'Planning Rules' tab (click selector text=Planning Rules). Only 2 scenes on AI agents, no more. "
            f"Each scene must show a visually different page. No two screenshots should look similar."
        )
        cmd = [
            "npm", "run", "generate", "--",
            "--url", url,
            "--prompt", prompt,
            "--output", output_path,
        ]
    else:
        # No API mode: generate static script and pass it
        print("No ANTHROPIC_API_KEY found — using static demo script")
        script = generate_static_script(client_name, mode, port)
        script_path = os.path.join(video_dir, "output", ".work", "static-script.json")
        os.makedirs(os.path.dirname(script_path), exist_ok=True)
        with open(script_path, "w") as f:
            json.dump(script, f, indent=2)
        print(f"Static script saved: {script_path}")

        cmd = [
            "npm", "run", "generate", "--",
            "--url", url,
            "--script", script_path,
            "--output", output_path,
        ]

    result = subprocess.run(cmd, cwd=video_dir, env=env)

    if result.returncode != 0:
        print("Warning: Video generation had issues (may still have partial output)")


def main():
    parser = argparse.ArgumentParser(
        description="Generate client copilot site + demo video"
    )
    parser.add_argument("client_name", help="Client name (e.g. 'Airbus')")
    parser.add_argument(
        "--mode",
        choices=["MTS", "MTO"],
        default="MTS",
        help="MTS (Make to Stock) or MTO (Make to Order)",
    )
    parser.add_argument(
        "--no-api",
        action="store_true",
        help="Skip config generation + use static script (no API keys needed)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=5199,
        help="Dev server port (default: 5199)",
    )
    parser.add_argument(
        "--skip-video",
        action="store_true",
        help="Only generate config + start server, skip video",
    )

    args = parser.parse_args()

    repo_dir = get_repo_dir(args.mode)
    video_dir = get_video_dir()
    safe_name = args.client_name.lower().replace(" ", "_")
    output_path = os.path.abspath(f"./output/demo_{safe_name}_{args.mode.lower()}.mp4")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print(f"\n{'='*60}")
    print(f"Full Pipeline: {args.client_name} ({args.mode})")
    print(f"{'='*60}")
    print(f"  Repo:   {repo_dir}")
    print(f"  Video:  {video_dir}")
    print(f"  Output: {output_path}")
    print(f"{'='*60}")

    # Step 1: Generate config
    if not args.no_api:
        has_anthropic = bool(os.environ.get("ANTHROPIC_API_KEY"))
        if has_anthropic:
            step1_generate_config(args.client_name, args.mode, repo_dir)
        else:
            print("\n-- No ANTHROPIC_API_KEY — skipping config generation, using existing config")
    else:
        print("\n-- Skipping config generation (--no-api flag)")

    # Step 2: Start dev server
    server_proc = step2_start_dev_server(repo_dir, args.port)

    try:
        if args.skip_video:
            print(f"\n-- Site running at http://localhost:{args.port}")
            print("-- Press Ctrl+C to stop")
            server_proc.wait()
        else:
            # Step 3: Generate video
            # Check for API keys in environment OR in demo-video-generator/.env
            env_file = os.path.join(video_dir, ".env")
            has_elevenlabs = bool(os.environ.get("ELEVENLABS_API_KEY"))
            has_anthropic = bool(os.environ.get("ANTHROPIC_API_KEY"))
            if os.path.exists(env_file):
                with open(env_file) as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("ELEVENLABS_API_KEY=") and not has_elevenlabs:
                            has_elevenlabs = True
                        if line.startswith("ANTHROPIC_API_KEY=") and not has_anthropic:
                            has_anthropic = True
            has_api_keys = has_anthropic and has_elevenlabs
            step3_generate_video(
                args.client_name,
                args.mode,
                args.port,
                video_dir,
                output_path,
                has_api_keys,
            )

            print(f"\n{'='*60}")
            print(f"Done!")
            print(f"  Video: {output_path}")
            print(f"{'='*60}")

    finally:
        server_proc.terminate()
        try:
            server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_proc.kill()
        print("\nDev server stopped.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Render the Kannada intake questions once, in an expressive voice, so they never sound flat.

Bhashini's standard voices read every line the same way. Indic Parler-TTS (AI4Bharat, Apache-2.0)
takes a description of how to speak (warm, smiling, slow), and Kannada is one of its languages with
emotion support. The questions never change, so we render them once and ship the audio: the live
demo then needs no keys and no server, and recorded audio always plays before any synthetic voice.

Run where a GPU is handy (Google Colab's free T4 takes about a minute; a laptop CPU takes longer):

    pip install git+https://github.com/huggingface/parler-tts.git soundfile
    python scripts/render_voice_prompts.py                 # Anu (female), all languages it supports
    python scripts/render_voice_prompts.py --speaker Suresh --takes 3

Each question is rendered `--takes` times and saved as frontend/public/audio/<lang>/<key>.<n>.wav;
listen and keep the best take with --pick, or let the script keep take 1. Kept takes are converted
to MP3 (if ffmpeg is installed) and listed in prompts.json so the app plays them.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "frontend" / "public" / "audio"
MANIFEST = AUDIO / "prompts.json"

# How each question should sound. Commas and full stops in the Kannada text shape the pauses.
STYLE = {
    "start": "speaks warmly and cheerfully, with a gentle smile in the voice, like greeting a neighbour",
    "beneficiary_name": "speaks in a friendly, encouraging conversational tone",
    "village": "speaks with friendly curiosity, conversational and relaxed",
    "taluk": "speaks patiently and kindly, slowly enough to be understood, conversational",
    "land_status": "speaks gently and warmly, conversational, unhurried",
    "household_size": "speaks helpfully and reassuringly, conversational, with natural pauses",
    "housing_need": "speaks softly and respectfully, reassuring, making clear it is optional",
    "phone_last4": "speaks warmly and gratefully, happy and reassuring, closing a kind conversation",
}
SPEAKERS = {"kn": ["Anu", "Suresh", "Vidya", "Chetan"], "te": ["Prakash", "Lalitha", "Kiran"], "en": ["Thoma", "Mary"]}


def description(speaker: str, key: str) -> str:
    return (f"{speaker} {STYLE.get(key, 'speaks in a warm, friendly conversational tone')}, at a slightly slow pace "
            f"with moderate pitch variation. The recording is very clear audio, close-sounding, with no background noise.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="kn", choices=["kn", "te", "en"])
    ap.add_argument("--speaker", default=None, help="Indic Parler-TTS speaker; Kannada: Anu, Suresh, Vidya, Chetan")
    ap.add_argument("--takes", type=int, default=1)
    ap.add_argument("--pick", default="", help="choose takes after listening, e.g. start=2,village=3")
    ap.add_argument("--only", default="", help="comma-separated keys to render")
    ap.add_argument("--render-only", action="store_true", help="render takes for listening; keep nothing yet")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    prompts: dict[str, str] = manifest["prompts"][args.lang]
    keys = [k for k in prompts if not args.only or k in args.only.split(",")]
    out = AUDIO / args.lang
    out.mkdir(parents=True, exist_ok=True)
    speaker = args.speaker or SPEAKERS[args.lang][0]

    if not args.pick:
        import soundfile as sf
        import torch
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer

        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        model = ParlerTTSForConditionalGeneration.from_pretrained("ai4bharat/indic-parler-tts").to(device)
        tok = AutoTokenizer.from_pretrained("ai4bharat/indic-parler-tts")
        desc_tok = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
        for key in keys:
            d = desc_tok(description(speaker, key), return_tensors="pt").to(device)
            p = tok(prompts[key], return_tensors="pt").to(device)
            for n in range(1, args.takes + 1):
                audio = model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask,
                                       prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask, do_sample=True)
                sf.write(out / f"{key}.{n}.wav", audio.cpu().numpy().squeeze(), model.config.sampling_rate)
                print(f"rendered {args.lang}/{key}.{n}.wav")

    if args.render_only:
        print("takes rendered; listen, then run again with --pick")
        return
    chosen = dict(item.split("=") for item in args.pick.split(",") if item) if args.pick else {}
    kept = []
    for key in keys:
        take = out / f"{key}.{chosen.get(key, '1')}.wav"
        if not take.exists():
            print(f"missing {take.name}; skipped")
            continue
        mp3 = out / f"{key}.mp3"
        if shutil.which("ffmpeg"):
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(take), "-ac", "1", "-b:a", "80k", str(mp3)], check=True)
        else:
            print("ffmpeg not found: install it, or convert the WAV files to MP3 yourself")
            continue
        kept.append(key)
    for wav in out.glob("*.wav"):
        wav.unlink()
    recorded = set(manifest["recorded"].get(args.lang, [])) | set(kept)
    manifest["recorded"][args.lang] = sorted(recorded, key=list(prompts).index)
    manifest.setdefault("voices", {})[args.lang] = f"Indic Parler-TTS · {speaker} (AI4Bharat)"
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"kept {len(kept)} prompt(s); prompts.json updated")


if __name__ == "__main__":
    main()

# Voice for intake

Families answer intake questions by speaking, in Kannada, Telugu or English. The app reads each question aloud, choosing the most human voice it has:

1. **A pre-recorded prompt:** a real person's recording, or an expressive render made once (see below). The eight questions never change.
2. **Bhashini.** These are the Government of India's Indian-language voices, with a female or male option, synthesised on our server at 22.05 kHz. Each question is synthesised once and then cached.
3. **The device's own voice.** It is used only if the device has a voice for that language. Kannada read by an English voice sounds the most machine-made, so in that case the app shows the text and stays silent.

Speech recognition goes through Bhashini when it is connected; otherwise it uses the browser's recognition where available. Audio is processed in memory and is never stored or logged. Only the language and the audio size are audited.

## Connect Bhashini

1. Register at bhashini.gov.in. Your **User ID** and **ULCA API key** are under *My Profile*.
2. **Live demo (Vercel):** in the Vercel project, go to *Settings → Environment Variables* and add `BHASHINI_USER_ID` and `BHASHINI_API_KEY`. Then redeploy. Small Vercel functions in `frontend/api/speech/` call Bhashini, so the demo needs no other server. They answer only the site's own pages and limit each visitor to 30 voice requests a minute.
3. **Full stack:** set `MANE_MAARGA_BHASHINI_USER_ID` and `MANE_MAARGA_BHASHINI_API_KEY` on the API server, then restart it.

The intake panel shows **Bhashini connected** once the keys are set. The keys stay on the server; the browser only calls `/api/speech/tts` and `/api/speech/asr`.

Safari can't recognise Kannada speech on its own, so on a Mac or iPhone voice answers need Bhashini.

## Why the voice can sound flat, and the fix

Bhashini's standard voices are trained on read speech. They pronounce Kannada well, but they say every line in the same even tone and there is no setting for warmth or emotion.

Intake asks the same eight questions every time, so they don't have to be synthesised live. They can be rendered once, with feeling, and played back:

- **Best:** a real person reads them (see below).
- **Next best:** `scripts/render_voice_prompts.py` renders them with **Indic Parler-TTS** (AI4Bharat, open source). You describe how each line should sound, and Kannada is one of the languages where it follows emotion in the description. The greeting is warm and smiling, the questions are friendly and patient, and the thank-you is grateful. Run it once on Google Colab's free GPU:
  ```
  pip install git+https://github.com/huggingface/parler-tts.git soundfile
  python scripts/render_voice_prompts.py --speaker Anu --takes 3     # female; or --speaker Suresh
  # listen to frontend/public/audio/kn/*.wav, then keep the best takes:
  python scripts/render_voice_prompts.py --pick start=2,village=1,taluk=3
  ```
  Commit `frontend/public/audio/kn/*.mp3` and `prompts.json`. These play first, even in the demo with no keys.

Bhashini still handles anything that isn't a fixed question, and all speech recognition.

## Record the questions in a real voice

The questions are listed in `frontend/public/audio/prompts.json`.

1. Ask a Kannada speaker from the district, ideally someone families would trust, such as an ASHA worker or a panchayat staff member, to read each line the way they would say it to a neighbour. A quiet room and a phone are enough.
2. Save each recording as `frontend/public/audio/kn/<key>.mp3`, for example `kn/start.mp3` or `kn/village.mp3`. Mono, 64–96 kbps is plenty.
3. Add each key you recorded to `recorded.kn` in `prompts.json`, for example `"recorded": { "kn": ["start", "beneficiary_name", ...] }`.

A recording plays only if its text in `prompts.json` still matches the question exactly. If you change a question in `backend/app/api/intelligence.py`, update `prompts.json` and record that line again.

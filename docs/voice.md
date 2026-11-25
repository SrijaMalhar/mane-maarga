# Voice for intake

Families answer intake questions by speaking, in Kannada, Telugu or English. The app reads each question aloud, choosing the most human voice it has:

1. **A real person's recording.** This sounds the most natural, and the eight questions never change, so record them once.
2. **Bhashini.** These are the Government of India's Indian-language voices, with a female or male option, synthesised on our server at 22.05 kHz. Each question is synthesised once and then cached.
3. **The device's own voice.** It is used only if the device has a voice for that language. Kannada read by an English voice sounds the most machine-made, so in that case the app shows the text and stays silent.

Speech recognition goes through Bhashini when it is connected; otherwise it uses the browser's recognition where available. Audio is processed in memory and is never stored or logged. Only the language and the audio size are audited.

## Connect Bhashini

1. Register at bhashini.gov.in. Your **User ID** and **ULCA API key** are under *My Profile*.
2. Set them on the API server:
   ```
   MANE_MAARGA_BHASHINI_USER_ID=...
   MANE_MAARGA_BHASHINI_API_KEY=...
   ```
3. Restart the API. The intake panel will show **Bhashini connected**.

The keys stay on the server. The browser only calls `/api/speech/tts` and `/api/speech/asr`, and both need a signed-in user.

## Record the questions in a real voice

The questions are listed in `frontend/public/audio/prompts.json`.

1. Ask a Kannada speaker from the district, ideally someone families would trust, such as an ASHA worker or a panchayat staff member, to read each line the way they would say it to a neighbour. A quiet room and a phone are enough.
2. Save each recording as `frontend/public/audio/kn/<key>.mp3`, for example `kn/start.mp3` or `kn/village.mp3`. Mono, 64–96 kbps is plenty.
3. Add each key you recorded to `recorded.kn` in `prompts.json`, for example `"recorded": { "kn": ["start", "beneficiary_name", ...] }`.

A recording plays only if its text in `prompts.json` still matches the question exactly. If you change a question in `backend/app/api/intelligence.py`, update `prompts.json` and record that line again.

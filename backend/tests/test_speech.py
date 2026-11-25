"""Bhashini speech: config then compute, keys server-side, natural text, caching, clear failures."""

import base64
import io
import wave

import pytest

from app.speech import bhashini
from app.speech.bhashini import BhashiniClient, SpeechError, speakable

CB = "https://dhruva.example/services/inference/pipeline"


def wav_bytes(seconds=0.1):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x00\x00" * int(16000 * seconds))
    return buf.getvalue()


class FakeBhashini:
    def __init__(self):
        self.calls = []

    def __call__(self, url, headers, body, timeout):
        self.calls.append((url, headers, body))
        task = body["pipelineTasks"][0]
        if url == bhashini.CONFIG_URL:
            cfg = {"serviceId": f"ai4bharat/{task['taskType']}-kn", "language": {"sourceLanguage": "kn"}}
            if task["taskType"] == "tts":
                cfg["supportedVoices"] = ["male", "female"]
            return {
                "pipelineResponseConfig": [{"taskType": task["taskType"], "config": [cfg]}],
                "pipelineInferenceAPIEndPoint": {
                    "callbackUrl": CB,
                    "inferenceApiKey": {"name": "Authorization", "value": "inf-key"},
                },
            }
        if task["taskType"] == "tts":
            return {"pipelineResponse": [{"audio": [{"audioContent": base64.b64encode(b"RIFFfake").decode()}]}]}
        return {"pipelineResponse": [{"output": [{"source": "ಲಕ್ಷ್ಮಮ್ಮ"}]}]}


@pytest.fixture
def fake(monkeypatch):
    f = FakeBhashini()
    monkeypatch.setattr(bhashini, "_client", BhashiniClient(user_id="u", api_key="k", post=f))
    return f


def test_speakable_reads_like_a_person():
    assert speakable("ಜಾಗ ಇದೆಯೇ? (ಹೌದು/ಇಲ್ಲ)", "kn") == "ಜಾಗ ಇದೆಯೇ? ಹೌದು, ಇಲ್ಲ"
    assert speakable("Lakshmamma (sample) needs ₹1,20,000", "kn") == "Lakshmamma needs 1,20,000 ರೂಪಾಯಿ"


def test_tts_uses_config_then_compute_and_caches(fake):
    c = bhashini.client()
    assert c.tts("ನಮಸ್ಕಾರ", "kn", "male") == b"RIFFfake"
    assert c.tts("ನಮಸ್ಕಾರ", "kn", "male") == b"RIFFfake"
    config, compute = fake.calls[0], fake.calls[1]
    assert config[1]["userID"] == "u" and config[1]["ulcaApiKey"] == "k"
    assert compute[0] == CB and compute[1]["Authorization"] == "inf-key"
    cfg = compute[2]["pipelineTasks"][0]["config"]
    assert cfg["gender"] == "male" and cfg["samplingRate"] == 22050 and cfg["serviceId"] == "ai4bharat/tts-kn"
    assert len(fake.calls) == 2  # second request served from cache


def test_endpoints(client, fake):
    assert client.get("/api/speech/status").json()["languages"] == ["en", "kn", "te"]
    r = client.post("/api/speech/tts", json={"text": "ನಿಮ್ಮ ಊರು ಯಾವುದು?", "language": "kn", "gender": "female"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
    a = client.post("/api/speech/asr", json={"audio_base64": base64.b64encode(wav_bytes()).decode(), "language": "kn"})
    assert a.status_code == 200 and a.json()["text"] == "ಲಕ್ಷ್ಮಮ್ಮ"
    asr_cfg = fake.calls[-1][2]["pipelineTasks"][0]["config"]
    assert asr_cfg["audioFormat"] == "wav" and asr_cfg["samplingRate"] == 16000
    assert (
        client.post("/api/speech/asr", json={"audio_base64": base64.b64encode(b"OggS" * 10).decode()}).status_code
        == 415
    )
    assert client.post("/api/speech/tts", json={"text": "hi", "language": "hi"}).status_code == 422


def test_not_configured_is_503_and_upstream_failure_is_502(client, monkeypatch):
    monkeypatch.setattr(bhashini, "_client", None)
    r = client.post("/api/speech/tts", json={"text": "ನಮಸ್ಕಾರ"})
    assert r.status_code == 503 and r.json()["detail"]["error"] == "not_configured"

    def down(*a):
        raise OSError("network down")

    monkeypatch.setattr(bhashini, "_client", BhashiniClient(user_id="u", api_key="k", post=down))
    monkeypatch.setattr(bhashini.time, "sleep", lambda s: None)
    assert client.post("/api/speech/tts", json={"text": "ನಮಸ್ಕಾರ"}).status_code == 502
    with pytest.raises(SpeechError):
        BhashiniClient(user_id="", api_key="")


def test_spoken_phone_answers(client):
    s = client.post("/api/intelligence/intake", json={"language": "kn"}).json()
    tok = s["session_token"]
    assert "ನಮಸ್ಕಾರ" in s["message"] and "case" not in s["message"]
    for a in ["ಲಕ್ಷ್ಮಮ್ಮ", "ಹೊಸಹಳ್ಳಿ", "ಕುಣಿಗಲ್", "ಹೌದು", "4", "ದಾಖಲೆ"]:
        client.post(f"/api/intelligence/intake/{tok}/message", json={"message": a})
    done = client.post(f"/api/intelligence/intake/{tok}/message", json={"message": "೧ ೨ ೩ ೪"}).json()
    assert done["fields"]["phone_last4"] == "1234" and done["status"] == "completed"

"""Bhashini (MeitY ULCA) client: speech to text and text to speech.

Two calls, as Bhashini documents them:
1. Config: POST getModelsPipeline with userID and ulcaApiKey headers. Returns the inference URL,
   an Authorization key, and a serviceId per task and language (plus supportedVoices for TTS).
2. Compute: POST the inference URL with that key, one task per call.

Keys stay on the server. Audio is processed in memory and never stored. Config answers are cached
for an hour; synthesised prompts are cached by text, so a fixed question is synthesised once.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass

from ..core.config import env

CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
MEITY_PIPELINE = "64392f96daac500b55c543cd"
LANGS = {"kn", "en", "te"}
Post = Callable[[str, dict, dict, float], dict]


class SpeechError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _urllib_post(url: str, headers: dict, body: dict, timeout: float) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (fixed https URLs)
        return json.loads(resp.read().decode())


@dataclass(frozen=True)
class Service:
    url: str
    auth_name: str
    auth_value: str
    service_id: str
    voices: tuple[str, ...] = ()


_RUPEE = re.compile(r"₹\s?([\d,]+)")


def speakable(text: str, lang: str) -> str:
    """Text as a person would say it: no brackets, slashes or '(sample)', rupees read as a word."""
    t = re.sub(r"\((sample|ಮಾದರಿ)\)", "", text, flags=re.IGNORECASE)
    t = _RUPEE.sub(lambda m: f"{m.group(1)} {'ರೂಪಾಯಿ' if lang == 'kn' else 'రూపాయలు' if lang == 'te' else 'rupees'}", t)
    t = re.sub(r"\s*/\s*", ", ", t)
    t = re.sub(r"[()\[\]'\"“”‘’]", "", t)
    return re.sub(r"\s+", " ", t).strip()


class BhashiniClient:
    def __init__(
        self,
        user_id: str | None = None,
        api_key: str | None = None,
        pipeline_id: str | None = None,
        post: Post | None = None,
        timeout: float = 30.0,
    ):
        self.user_id = user_id or env("BHASHINI_USER_ID")
        self.api_key = api_key or env("BHASHINI_API_KEY")
        self.pipeline_id = pipeline_id or env("BHASHINI_PIPELINE_ID") or MEITY_PIPELINE
        if not self.user_id or not self.api_key:
            raise SpeechError(
                "not_configured",
                "Bhashini is not configured: set MANE_MAARGA_BHASHINI_USER_ID and MANE_MAARGA_BHASHINI_API_KEY",
            )
        self.post = post or _urllib_post
        self.timeout = timeout
        self._services: dict[tuple[str, str], tuple[float, Service]] = {}
        self._tts_cache: OrderedDict[str, bytes] = OrderedDict()

    def _call(self, url: str, headers: dict, body: dict) -> dict:
        last: Exception | None = None
        for attempt in range(2):
            try:
                return self.post(url, headers, body, self.timeout)
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
                last = exc
                if attempt == 0:
                    time.sleep(0.5)
        raise SpeechError("upstream_unavailable", f"Bhashini did not respond: {last}")

    def service(self, task: str, lang: str) -> Service:
        if lang not in LANGS:
            raise SpeechError("unsupported_language", f"Language '{lang}' is not supported")
        key = (task, lang)
        cached = self._services.get(key)
        if cached and time.time() - cached[0] < 3600:
            return cached[1]
        body = {
            "pipelineTasks": [{"taskType": task, "config": {"language": {"sourceLanguage": lang}}}],
            "pipelineRequestConfig": {"pipelineId": self.pipeline_id},
        }
        data = self._call(
            CONFIG_URL, {"Content-Type": "application/json", "userID": self.user_id, "ulcaApiKey": self.api_key}, body
        )
        try:
            endpoint = data["pipelineInferenceAPIEndPoint"]
            configs = next(c["config"] for c in data["pipelineResponseConfig"] if c["taskType"] == task)
            cfg = next((c for c in configs if c["language"]["sourceLanguage"] == lang), configs[0])
            svc = Service(
                url=endpoint["callbackUrl"],
                auth_name=endpoint["inferenceApiKey"]["name"],
                auth_value=endpoint["inferenceApiKey"]["value"],
                service_id=cfg["serviceId"],
                voices=tuple(cfg.get("supportedVoices") or ()),
            )
        except (KeyError, StopIteration, IndexError, TypeError) as exc:
            raise SpeechError("bad_config", f"Bhashini has no {task} service for '{lang}'") from exc
        self._services[key] = (time.time(), svc)
        return svc

    def _compute(self, svc: Service, task: dict, input_data: dict) -> dict:
        body = {"pipelineTasks": [task], "inputData": input_data}
        return self._call(svc.url, {"Content-Type": "application/json", svc.auth_name: svc.auth_value}, body)

    def tts(self, text: str, lang: str, gender: str = "female", sampling_rate: int = 22050) -> bytes:
        """WAV bytes. 22.05 kHz rather than 8 kHz: the low rate is what makes voices sound like a phone line."""
        spoken = speakable(text, lang)
        if not spoken:
            raise SpeechError("empty_text", "Nothing to say")
        cache_key = hashlib.sha256(f"{lang}|{gender}|{sampling_rate}|{spoken}".encode()).hexdigest()
        if cache_key in self._tts_cache:
            self._tts_cache.move_to_end(cache_key)
            return self._tts_cache[cache_key]
        svc = self.service("tts", lang)
        if svc.voices and gender not in svc.voices:
            gender = svc.voices[0]
        task = {
            "taskType": "tts",
            "config": {
                "language": {"sourceLanguage": lang},
                "serviceId": svc.service_id,
                "gender": gender,
                "samplingRate": sampling_rate,
            },
        }
        data = self._compute(svc, task, {"input": [{"source": spoken}]})
        try:
            audio = base64.b64decode(data["pipelineResponse"][0]["audio"][0]["audioContent"])
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise SpeechError("bad_response", "Bhashini returned no audio") from exc
        self._tts_cache[cache_key] = audio
        if len(self._tts_cache) > 256:
            self._tts_cache.popitem(last=False)
        return audio

    def asr(self, wav: bytes, lang: str, sampling_rate: int = 16000) -> str:
        svc = self.service("asr", lang)
        task = {
            "taskType": "asr",
            "config": {
                "language": {"sourceLanguage": lang},
                "serviceId": svc.service_id,
                "audioFormat": "wav",
                "samplingRate": sampling_rate,
            },
        }
        data = self._compute(svc, task, {"audio": [{"audioContent": base64.b64encode(wav).decode()}]})
        try:
            return str(data["pipelineResponse"][0]["output"][0]["source"]).strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise SpeechError("bad_response", "Bhashini returned no transcript") from exc


_client: BhashiniClient | None = None


def client() -> BhashiniClient:
    global _client
    if _client is None:
        _client = BhashiniClient()
    return _client


def configured() -> bool:
    return bool(env("BHASHINI_USER_ID") and env("BHASHINI_API_KEY"))

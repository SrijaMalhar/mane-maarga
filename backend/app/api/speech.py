"""Speech endpoints for intake. Audio is handled in memory and never stored or logged."""

import base64
import binascii
from typing import Literal, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core.audit import write_audit
from ..core.security import Authenticated
from ..database import get_db
from ..speech import bhashini
from ..speech.bhashini import SpeechError

router = APIRouter(prefix="/api/speech", tags=["speech"])
MAX_AUDIO_BYTES = 2 * 1024 * 1024  # about a minute of 16 kHz mono WAV

Lang = Literal["kn", "en", "te"]


def _fail(exc: SpeechError) -> NoReturn:
    status = 503 if exc.code == "not_configured" else 422 if exc.code in ("unsupported_language", "empty_text") else 502
    raise HTTPException(status_code=status, detail={"error": exc.code, "message": str(exc)}) from exc


@router.get("/status")
def status(user: Authenticated):
    return {"bhashini": bhashini.configured(), "languages": sorted(bhashini.LANGS), "voices": ["female", "male"]}


class TTSIn(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    language: Lang = "kn"
    gender: Literal["female", "male"] = "female"


@router.post("/tts", response_class=Response)
def tts(body: TTSIn, user: Authenticated):
    try:
        audio = bhashini.client().tts(body.text, body.language, body.gender)
    except SpeechError as exc:
        _fail(exc)
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "private, max-age=86400"})


class ASRIn(BaseModel):
    audio_base64: str = Field(min_length=10, max_length=MAX_AUDIO_BYTES * 4 // 3 + 8)
    language: Lang = "kn"


@router.post("/asr")
def asr(body: ASRIn, user: Authenticated, db: Session = Depends(get_db)):
    try:
        wav = base64.b64decode(body.audio_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="audio_base64 is not valid base64") from exc
    if wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
        raise HTTPException(status_code=415, detail="Audio must be WAV (16 kHz mono PCM)")
    try:
        text = bhashini.client().asr(wav, body.language)
    except SpeechError as exc:
        _fail(exc)
    write_audit(db, "speech_transcribed", None, f"language={body.language}; bytes={len(wav)}", user.username)
    db.commit()
    return {"text": text, "language": body.language, "engine": "bhashini"}

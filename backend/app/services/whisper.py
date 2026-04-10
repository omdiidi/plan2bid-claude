from openai import AsyncOpenAI

_client = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI()
    return _client


async def transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    client = _get_client()
    result = await client.audio.transcriptions.create(
        model="whisper-1",
        file=(filename, audio_bytes),
    )
    return result.text

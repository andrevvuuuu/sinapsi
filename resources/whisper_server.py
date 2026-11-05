"""Sinapsi's dictation server: keeps mlx_whisper's model in memory between dictations.

Reads one JSON request per line on stdin: {"id": str, "path": str, "language": "it"}.
Answers one JSON line on stdout: {"id", "text"} or {"id", "error"}; before the first
transcription it announces {"stage": "download" | "load"}, before each one {"stage": "transcribe"}.
Ends when stdin closes.
"""

import json
import os
import sys

MODEL = "mlx-community/whisper-large-v3-turbo"
MODEL_DIR = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub", "models--mlx-community--whisper-large-v3-turbo")

# The protocol owns the real stdout; anything the libraries print goes to stderr.
out = sys.stdout
sys.stdout = sys.stderr


def send(msg):
    out.write(json.dumps(msg, ensure_ascii=False) + "\n")
    out.flush()


def main():
    loaded = False
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req["id"]
            if not loaded:
                send({"stage": "load" if os.path.isdir(MODEL_DIR) else "download"})
                import mlx.core as mx
                from mlx_whisper.transcribe import ModelHolder

                # The same model and dtype mlx_whisper.transcribe asks for, so it reuses this one.
                ModelHolder.get_model(MODEL, mx.float16)
                loaded = True
            import mlx_whisper

            send({"stage": "transcribe"})
            result = mlx_whisper.transcribe(req["path"], path_or_hf_repo=MODEL, language=req.get("language") or None, verbose=None)
            text = " ".join(s.get("text", "") for s in result.get("segments", [])) or result.get("text", "")
            send({"id": req_id, "text": " ".join(text.split())})
        except Exception as e:  # noqa: BLE001 - every failure becomes an answer, the server keeps running
            send({"id": req_id, "error": str(e) or type(e).__name__})


if __name__ == "__main__":
    main()

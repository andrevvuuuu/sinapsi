"""Sinapsi's dictation server: keeps mlx_whisper's model in memory between dictations.

Reads one JSON request per line on stdin: {"id": str, "path": str, "language": "it"}.
Answers one JSON line on stdout: {"id", "text"} or {"id", "error", "kind"} (kind: the exception's class); before the first
transcription it announces {"stage": "download" | "load"}, before each one {"stage": "transcribe"}.
While a request is in progress the current stage is repeated every 15 s, so the app can tell a long
recording or download from a dead server. Ends when stdin closes.
"""

import json
import os
import sys
import threading
import time

MODEL = "mlx-community/whisper-large-v3-turbo"
MODEL_DIR = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub", "models--mlx-community--whisper-large-v3-turbo")

# The protocol owns the real stdout; anything the libraries print goes to stderr.
out = sys.stdout
sys.stdout = sys.stderr


HEARTBEAT_S = 15

# One line at a time on stdout: the heartbeat thread and the answers never interleave.
lock = threading.Lock()
current = {"stage": None}


def write(msg):
    out.write(json.dumps(msg, ensure_ascii=False) + "\n")
    out.flush()


def announce(stage):
    with lock:
        current["stage"] = stage
        write({"stage": stage})


def answer(msg):
    with lock:
        current["stage"] = None
        write(msg)


def heartbeat():
    while True:
        time.sleep(HEARTBEAT_S)
        with lock:
            if current["stage"]:
                write({"stage": current["stage"]})


def main():
    loaded = False
    threading.Thread(target=heartbeat, daemon=True).start()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req["id"]
            if not loaded:
                announce("load" if os.path.isdir(MODEL_DIR) else "download")
                import mlx.core as mx
                from mlx_whisper.transcribe import ModelHolder

                # The same model and dtype mlx_whisper.transcribe asks for, so it reuses this one.
                ModelHolder.get_model(MODEL, mx.float16)
                loaded = True
            import mlx_whisper

            announce("transcribe")
            result = mlx_whisper.transcribe(req["path"], path_or_hf_repo=MODEL, language=req.get("language") or None, verbose=None)
            text = " ".join(s.get("text", "") for s in result.get("segments", [])) or result.get("text", "")
            answer({"id": req_id, "text": " ".join(text.split())})
        except Exception as e:  # noqa: BLE001 - every failure becomes an answer, the server keeps running
            answer({"id": req_id, "error": str(e) or type(e).__name__, "kind": type(e).__name__})


if __name__ == "__main__":
    main()

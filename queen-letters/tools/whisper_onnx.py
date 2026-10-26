#!/usr/bin/env python3
"""Hebrew transcription with segment timestamps, using the sherpa-onnx export of Whisper (turbo).

  python3 tools/whisper_onnx.py audio.mp3 MODEL_DIR > segments.json

MODEL_DIR holds turbo-encoder.int8.onnx, turbo-decoder.int8.onnx and turbo-tokens.txt
(github.com/k2-fsa/sherpa-onnx, release asr-models/sherpa-onnx-whisper-turbo). Greedy decoding with
Whisper's own timestamp tokens, 30 s windows that advance to the last complete segment.
"""
import base64, json, subprocess, sys
import numpy as np, onnxruntime as ort, librosa

SR, N_FFT, HOP, CHUNK = 16000, 400, 160, 30


def log_mel(audio, n_mels):
    S = np.abs(librosa.stft(audio, n_fft=N_FFT, hop_length=HOP, window="hann", center=True)) ** 2
    S = S[:, :-1]
    mel = librosa.filters.mel(sr=SR, n_fft=N_FFT, n_mels=n_mels) @ S
    lg = np.log10(np.maximum(mel, 1e-10)); lg = np.maximum(lg, lg.max() - 8.0)
    return ((lg + 4.0) / 4.0).astype(np.float32)


def main(path, mdir, lang="he"):
    enc = ort.InferenceSession(f"{mdir}/turbo-encoder.int8.onnx", providers=["CPUExecutionProvider"])
    dec = ort.InferenceSession(f"{mdir}/turbo-decoder.int8.onnx", providers=["CPUExecutionProvider"])
    meta = enc.get_modelmeta().custom_metadata_map
    codes = meta["all_language_codes"].split(","); ltoks = [int(x) for x in meta["all_language_tokens"].split(",")]
    sot, eot, transcribe = int(meta["sot"]), int(meta["eot"]), int(meta["transcribe"])
    ts_begin = int(meta["no_timestamps"]) + 1
    n_mels, n_layer, n_state = int(meta["n_mels"]), int(meta["n_text_layer"]), int(meta["n_text_state"])
    vocab = {}
    for line in open(f"{mdir}/turbo-tokens.txt", encoding="utf-8"):
        tok, i = line.rsplit(" ", 1); vocab[int(i)] = base64.b64decode(tok)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    audio = np.frombuffer(raw, np.float32)
    segs, start = [], 0.0
    while start < len(audio) / SR - 0.5:
        a = audio[int(start * SR):int((start + CHUNK) * SR)]
        a = np.pad(a[:CHUNK * SR], (0, CHUNK * SR - len(a[:CHUNK * SR])))
        mel = log_mel(a, n_mels)[None, :, :3000]
        ck, cv = enc.run(None, {"mel": mel})
        kc = np.zeros((n_layer, 1, 448, n_state), np.float32); vc = np.zeros_like(kc)
        toks = [sot, ltoks[codes.index(lang)], transcribe]
        out, offset, last_ts = [], 0, None
        feed = np.array([toks], np.int64)
        for _ in range(220):
            logits, kc, vc = dec.run(None, {"tokens": feed, "in_n_layer_self_k_cache": kc, "in_n_layer_self_v_cache": vc,
                                            "n_layer_cross_k": ck, "n_layer_cross_v": cv, "offset": np.array([offset], np.int64)})
            offset += feed.shape[1]
            lg = logits[0, -1].astype(np.float64)
            # timestamps must not go backwards; after a lone timestamp, another must follow or text
            if last_ts is not None: lg[ts_begin:ts_begin + int(last_ts / .02)] = -np.inf
            lg[ts_begin - 1] = -np.inf                       # never switch to "no timestamps"
            if not out:                                      # the first token is a timestamp (<= 1 s), as in Whisper
                keep = lg[ts_begin:ts_begin + 51].copy(); lg[:] = -np.inf; lg[ts_begin:ts_begin + 51] = keep
            nxt = int(np.argmax(lg))
            if nxt == eot: break
            out.append(nxt); feed = np.array([[nxt]], np.int64)
            if nxt >= ts_begin: last_ts = (nxt - ts_begin) * .02
        # turn <|t0|> text <|t1|> pairs into segments
        cur, t0, last_end = b"", None, None
        for tk in out:
            if tk >= ts_begin:
                tt = (tk - ts_begin) * .02
                if t0 is None: t0 = tt
                else:
                    txt = cur.decode("utf-8", "replace").strip()
                    if txt: segs.append({"start": round(start + t0, 2), "end": round(start + tt, 2), "text": txt}); last_end = tt
                    cur, t0 = b"", None
            elif tk < eot:
                cur += vocab.get(tk, b"")
        adv = last_end if last_end and last_end > 1 else CHUNK
        start += min(adv, CHUNK)
    json.dump(segs, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

#!/usr/bin/env python3
"""4x super-resolution with Real-ESRGAN realesr-animevideov3 (SRVGGNetCompact), in plain NumPy.

  python3 tools/sr_anime.py in.png out.png [--weights path/to/realesr-animevideov3.pth]

PyTorch is not needed: the .pth zip is read with a small unpickler and the 18 convolutions run as
im2col + matmul. Weights: github.com/xinntao/Real-ESRGAN, release v0.2.5.0 (BSD-3-Clause).
"""
import argparse, io, os, pickle, zipfile
import numpy as np, cv2

DEFAULT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".cache", "realesr-animevideov3.pth")


def load_pth(path):
    zf = zipfile.ZipFile(path); root = zf.namelist()[0].split("/")[0]
    storages = {}

    def rebuild(storage, offset, size, stride, *args):
        arr = storage[offset:offset + int(np.prod(size)) if size else offset + 1]
        return np.lib.stride_tricks.as_strided(arr, shape=size, strides=[s * arr.itemsize for s in stride]).copy()

    class FloatStorage: dtype = np.float32
    class HalfStorage: dtype = np.float16

    import collections
    ALLOWED = {("torch._utils", "_rebuild_tensor_v2"): rebuild,
               ("torch", "FloatStorage"): FloatStorage, ("torch", "HalfStorage"): HalfStorage,
               ("collections", "OrderedDict"): collections.OrderedDict}

    class U(pickle.Unpickler):
        def find_class(self, mod, name):
            # strict allowlist: only tensor data can be rebuilt; any other global is refused, so a
            # tampered weights file cannot run code
            if (mod, name) in ALLOWED: return ALLOWED[(mod, name)]
            raise pickle.UnpicklingError(f"refused global {mod}.{name}")

        def persistent_load(self, pid):
            _, typ, key, _, n = pid
            if key not in storages:
                storages[key] = np.frombuffer(zf.read(f"{root}/data/{key}"), dtype=typ.dtype).astype(np.float32)
            return storages[key]

    obj = U(io.BytesIO(zf.read(f"{root}/data.pkl"))).load()
    return obj.get("params", obj)


def conv3x3(x, w, b):
    """x: (H, W, Cin) float32; w: (Cout, Cin, 3, 3)."""
    h, wd, c = x.shape
    p = np.pad(x, ((1, 1), (1, 1), (0, 0)), mode="constant")
    cols = np.lib.stride_tricks.sliding_window_view(p, (3, 3), axis=(0, 1))          # (h, w, c, 3, 3)
    cols = cols.reshape(h * wd, c * 9)
    k = w.reshape(w.shape[0], -1).T                                                 # (c*9, Cout)
    return (cols @ k + b).reshape(h, wd, w.shape[0])


def prelu(x, a): return np.where(x >= 0, x, x * a)


def upscale(img_bgr, P):
    x = img_bgr[..., ::-1].astype(np.float32) / 255                                 # RGB 0..1
    idx = sorted({int(k.split(".")[1]) for k in P if k.startswith("body.")})
    y = x
    for i in idx:
        if f"body.{i}.bias" in P:
            y = conv3x3(y, P[f"body.{i}.weight"], P[f"body.{i}.bias"])
        else:
            y = prelu(y, P[f"body.{i}.weight"].reshape(1, 1, -1))
    h, w, _ = y.shape; r = 4
    y = y.reshape(h, w, 3, r, r).transpose(0, 3, 1, 4, 2).reshape(h * r, w * r, 3)   # pixel shuffle
    y = y + np.repeat(np.repeat(x, r, 0), r, 1)
    return (np.clip(y, 0, 1)[..., ::-1] * 255 + .5).astype(np.uint8)


def upscale_tiled(img, P, tile=160, pad=10):
    h, w = img.shape[:2]; out = np.zeros((h * 4, w * 4, 3), np.uint8)
    for y0 in range(0, h, tile):
        for x0 in range(0, w, tile):
            ya, xa = max(y0 - pad, 0), max(x0 - pad, 0); yb, xb = min(y0 + tile + pad, h), min(x0 + tile + pad, w)
            o = upscale(img[ya:yb, xa:xb], P)
            ty, tx = (y0 - ya) * 4, (x0 - xa) * 4
            hh, ww = min(tile, h - y0) * 4, min(tile, w - x0) * 4
            out[y0 * 4:y0 * 4 + hh, x0 * 4:x0 * 4 + ww] = o[ty:ty + hh, tx:tx + ww]
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("dst"); ap.add_argument("--weights", default=DEFAULT)
    a = ap.parse_args()
    P = load_pth(a.weights)
    cv2.imwrite(a.dst, upscale_tiled(cv2.imread(a.src), P))

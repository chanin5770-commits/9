# Whisper large-v3 (sherpa-onnx int8 build, from github.com/k2-fsa/sherpa-onnx releases) over sliding windows.
# Usage: python3 transcribe_windows.py voc16.wav <window s> <hop s> [from s] [to s]
# Prints the text heard in each window; overlapping windows place each word to within ~0.5 s.
import sherpa_onnx, soundfile as sf, numpy as np, sys, json
d='models/sherpa-onnx-whisper-large-v3/'
rec=sherpa_onnx.OfflineRecognizer.from_whisper(encoder=d+'large-v3-encoder.int8.onnx',decoder=d+'large-v3-decoder.int8.onnx',tokens=d+'large-v3-tokens.txt',language='he',task='transcribe',num_threads=4)
y,sr=sf.read(sys.argv[1],dtype='float32')
win,hop=float(sys.argv[2]),float(sys.argv[3])
out=[]
t=float(sys.argv[4]) if len(sys.argv)>4 else 0
end=float(sys.argv[5]) if len(sys.argv)>5 else len(y)/sr
while t<end:
    s=rec.create_stream(); s.accept_waveform(sr,y[int(t*sr):int((t+win)*sr)]); rec.decode_stream(s)
    print(f'{t:6.1f}-{t+win:6.1f}: {s.result.text}',flush=True); out.append((t,s.result.text)); t+=hop

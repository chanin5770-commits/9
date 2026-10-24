# Vocal separation with the UVR-MDX-NET-Voc_FT model (ONNX, from github.com/TRvlvr/model_repo releases).
# Usage (in a work dir): ffmpeg -i song.mp3 -ar 44100 -ac 2 song44.wav; put the model at models/voc.onnx;
# python3 separate_vocals.py  ->  vocals.wav, inst.wav
import numpy as np, soundfile as sf, onnxruntime as ort
N_FFT,HOP,DIM_F,DIM_T=6144,1024,3072,256
x,sr=sf.read('song44.wav',dtype='float32'); x=x.T  # (2,n)
sess=ort.InferenceSession('models/voc.onnx',providers=['CPUExecutionProvider'])
chunk=HOP*(DIM_T-1); trim=N_FFT//2; gen=chunk-2*trim
n=x.shape[1]; pad=gen-n%gen
mix=np.concatenate([np.zeros((2,trim),'f'),x,np.zeros((2,pad),'f'),np.zeros((2,trim),'f')],1)
win=np.hanning(N_FFT+1)[:-1].astype('f')
def stft(w):
    # w (2,chunk) -> (4,DIM_F,DIM_T)
    out=[]
    for c in w:
        frames=[]
        cp=np.pad(c,(N_FFT//2,N_FFT//2),mode='reflect')
        for i in range(DIM_T):
            seg=cp[i*HOP:i*HOP+N_FFT]*win
            frames.append(np.fft.rfft(seg))
        Z=np.array(frames).T[:DIM_F]   # (F,T)
        out+= [Z.real,Z.imag]
    return np.array(out,'f')
def istft(s):
    res=[]
    for k in range(2):
        Z=s[2*k]+1j*s[2*k+1]
        Z=np.concatenate([Z,np.zeros((N_FFT//2+1-DIM_F,DIM_T))],0)
        L=chunk+N_FFT; y=np.zeros(L); wsum=np.zeros(L)
        for i in range(DIM_T):
            fr=np.fft.irfft(Z[:,i],N_FFT)*win
            y[i*HOP:i*HOP+N_FFT]+=fr; wsum[i*HOP:i*HOP+N_FFT]+=win**2
        y=y/np.maximum(wsum,1e-8)
        res.append(y[N_FFT//2:N_FFT//2+chunk])
    return np.array(res)
outs=[]
for i in range(0,mix.shape[1]-2*trim,gen):
    w=mix[:,i:i+chunk]
    if w.shape[1]<chunk: w=np.pad(w,((0,0),(0,chunk-w.shape[1])))
    spec=stft(w)[None]
    o=sess.run(None,{'input':spec})[0][0]
    y=istft(o)
    outs.append(y[:,trim:chunk-trim])
    print(i/sr,flush=True)
voc=np.concatenate(outs,1)[:,:n]*1.021
sf.write('vocals.wav',voc.T,sr); sf.write('inst.wav',(x-voc).T,sr)

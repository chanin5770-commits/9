# Song structure analysis: tempo, section boundaries and self-similarity.
# Usage: ffmpeg -i assets/song.mp3 -ac 1 -ar 16000 song16.wav && python3 tools/analyze_song.py song16.wav ssm.npy
import numpy as np, wave
w=wave.open(__import__('sys').argv[1]); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768
hop=256; n=2048
frames=np.lib.stride_tricks.sliding_window_view(x,n)[::hop]*np.hanning(n)
S=np.abs(np.fft.rfft(frames,axis=1)); f=np.fft.rfftfreq(n,1/sr); t=np.arange(len(S))*hop/sr
# onset/tempo
logS=np.log1p(100*S); flux=np.maximum(0,np.diff(logS,axis=0)).sum(1); flux-=np.convolve(flux,np.ones(32)/32,'same'); flux=np.maximum(flux,0)
fps=sr/hop; ac=np.correlate(flux,flux,'full')[len(flux)-1:]
lags=np.arange(len(ac))/fps; bpm=60/lags[1:]; m=(bpm>70)&(bpm<180); i=np.argmax(ac[1:][m]); print("tempo",bpm[m][i])
# chroma per 0.5s
band=(f>80)&(f<4000); pc=(np.round(12*np.log2(f[band]/440))%12).astype(int)
C=np.zeros((len(S),12)); 
for k in range(12): C[:,k]=S[:,band][:,pc==k].sum(1)
blk=int(fps*0.5); nb=len(C)//blk; Cb=C[:nb*blk].reshape(nb,blk,12).mean(1); Cb/=np.linalg.norm(Cb,axis=1,keepdims=True)+1e-9
E=(S[:,band]**2).sum(1); Eb=E[:nb*blk].reshape(nb,blk).mean(1)
SSM=Cb@Cb.T
# checkerboard novelty
L=16; g=np.outer(np.r_[-np.ones(L),np.ones(L)],np.r_[-np.ones(L),np.ones(L)])*-1
nov=np.zeros(nb)
for i in range(L,nb-L): nov[i]=(SSM[i-L:i+L,i-L:i+L]*g).sum()
pk=[i for i in range(2,nb-2) if nov[i]==nov[max(0,i-8):i+9].max() and nov[i]>np.percentile(nov,70)]
print("boundaries", [round(p*0.5,1) for p in pk])
print("energy per 2s:", " ".join(f"{i*2}:{10*np.log10(Eb[i*4:i*4+4].mean()+1e-12):.0f}" for i in range(nb//4)))
# repetition: for each boundary-segment find most similar lag
np.save(__import__('sys').argv[2],SSM)

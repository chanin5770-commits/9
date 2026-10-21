// Decode the song in the browser and analyze it in a worker. The song never leaves the computer.
import type { AudioAnalysis } from '../../shared/types';

const SR = 22050;

export async function analyzeSongFile(file: File | Blob): Promise<AudioAnalysis> {
  const buf = await file.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buf);
  ctx.close();
  // mono mix-down at 22.05 kHz (plenty for rhythm and loudness)
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * SR), SR);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const mono = await off.startRendering();
  const samples = mono.getChannelData(0).slice();
  const worker = new Worker(new URL('./analysisWorker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.ok) resolve({ ...e.data.analysis, duration: decoded.duration });
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message)); };
    worker.postMessage({ samples, sampleRate: SR }, [samples.buffer]);
  });
}

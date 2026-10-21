import { analyzeAudio } from '../../shared/audioAnalysis';

self.onmessage = (e: MessageEvent<{ samples: Float32Array; sampleRate: number }>) => {
  const { samples, sampleRate } = e.data;
  try {
    (self as unknown as Worker).postMessage({ ok: true, analysis: analyzeAudio(samples, sampleRate) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};

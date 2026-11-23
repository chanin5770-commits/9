"""Per-half-second visual stats for each clip: motion energy, sharpness, brightness, camera shake."""
import json, glob, os, subprocess, sys
import numpy as np, cv2
from concurrent.futures import ProcessPoolExecutor
def run(p):
    b = os.path.basename(p)[:-4]
    w,h = 192,108
    info = subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream_side_data=rotation','-of','csv=p=0',p],capture_output=True,text=True).stdout
    if '90' in info: w,h = 108,192
    cmd = ['ffmpeg','-v','error','-i',p,'-vf',f'fps=10,scale={w}:{h}','-f','rawvideo','-pix_fmt','gray','-']
    raw = subprocess.run(cmd,capture_output=True).stdout
    fr = np.frombuffer(raw,np.uint8).reshape(-1,h,w).astype(np.float32)
    stats=[]
    for i in range(0,len(fr)-5,5):
        seg = fr[i:i+5]
        motion = float(np.mean(np.abs(np.diff(seg,axis=0))))
        sharp = float(np.mean([cv2.Laplacian(f,cv2.CV_32F).var() for f in seg]))
        bright = float(seg.mean())
        # global shift via phase correlation (camera shake)
        sh = np.mean([np.hypot(*cv2.phaseCorrelate(seg[k],seg[k+1])[0]) for k in range(4)])
        stats.append([round(i/10,1),round(motion,1),round(sharp,0),round(bright,0),round(float(sh),2)])
    return b,stats
if __name__=='__main__':
    files=sorted(glob.glob('raw/*.mp4'))
    with ProcessPoolExecutor(4) as ex: res=dict(ex.map(run,files))
    json.dump(res,open('work/video_analysis.json','w'))
    for b,s in res.items():
        a=np.array(s)
        print(b, 'n=%d motion=%.1f sharp=%.0f bright=%.0f shake=%.2f'%(len(a),a[:,1].mean(),a[:,2].mean(),a[:,3].mean(),a[:,4].mean()))
        # best 4 windows by sharp*low-shake
        score = a[:,2]/(1+a[:,4])
        idx = np.argsort(-score)[:5]
        print('   sharpest/stable @', sorted(a[idx,0].tolist()))

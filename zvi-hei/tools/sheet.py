import sys,cv2,numpy as np,glob,os
files=sys.argv[2:]; out=sys.argv[1]; cols=5; tw=360; th=640
tiles=[]
for f in files:
    im=cv2.resize(cv2.imread(f),(tw,th)); cv2.putText(im,os.path.basename(f)[6:-4],(8,28),cv2.FONT_HERSHEY_SIMPLEX,0.8,(0,255,0),2); tiles.append(im)
while len(tiles)%cols: tiles.append(np.zeros((th,tw,3),np.uint8))
rows=[np.hstack(tiles[i:i+cols]) for i in range(0,len(tiles),cols)]
cv2.imwrite(out,np.vstack(rows),[cv2.IMWRITE_JPEG_QUALITY,82])

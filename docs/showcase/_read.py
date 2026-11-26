import sys
from PIL import Image
path=r'C:/Users/likui/.workbuddy/clipboard-images/clipboard-2026-11-18T23-56-50-241Z-0ce32fa2.png'
im=Image.open(path).convert('RGB'); px=im.load(); W,H=im.size
def crop(x0,y0,x1,y1,cw=2,ch=4,dark_is_text=True):
    print('--- crop',x0,y0,x1,y1)
    for y in range(y0,y1,ch):
        line=''
        for x in range(x0,x1,cw):
            tot=0;n=0
            for yy in range(y,min(y+ch,y1)):
                for xx in range(x,min(x+cw,x1)):
                    r,g,b=px[xx,yy]; tot+=(r+g+b)/3; n+=1
            v=tot/n
            line += '#' if v>190 else ('+' if v>120 else '.')
        print('%4d %s'%(y,line))
crop(240,5,880,105,3,4)

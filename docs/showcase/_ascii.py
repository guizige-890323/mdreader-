import sys
from PIL import Image
def dump(path, cw=6, ch=10, rows=None):
    im=Image.open(path).convert('RGB'); px=im.load(); w,h=im.size
    cols=w//cw
    def cls(r,g,b):
        if r>246 and g>246 and b>246: return 'W'
        if b>150 and b-r>60: return 'B'
        if r<70 and g<70 and b<90: return '#'
        if r>228 and g>228: return '.'
        if r<150 and g<150: return 'x'
        return '+'
    print('==',path,im.size)
    for ry in range(h//ch):
        line=''
        for rx in range(cols):
            cnt={}
            for y in range(ry*ch,(ry+1)*ch):
                for x in range(rx*cw,(rx+1)*cw):
                    k=cls(*px[x,y]); cnt[k]=cnt.get(k,0)+1
            line+=max(cnt,key=cnt.get)
        print('%4d %s'%(ry*ch,line))
for p in sys.argv[1:]:
    dump(p)

from PIL import Image
path=r'C:/Users/likui/.workbuddy/clipboard-images/clipboard-2026-11-18T23-56-50-241Z-0ce32fa2.png'
im=Image.open(path).convert('RGB'); px=im.load(); W,H=im.size
BLUE=(48,101,208)
def isbg(c,tol=30): return all(abs(c[i]-BLUE[i])<=tol for i in range(3))
# 蓝带 B：y204-233 x160-969  取前景（非蓝）= 字形
def show(x0,y0,x1,y1,step=1,seg=120):
    for sx in range(x0,x1,seg):
        ex=min(sx+seg,x1)
        print('  [x %d..%d]'%(sx,ex))
        for y in range(y0,y1,step):
            line=''
            for x in range(sx,ex):
                c=px[x,y]
                line += ' ' if isbg(c) else ('#' if sum(c)/3>150 else '+')
            print('   '+line)
        print()
show(160,203,970,235,2,135)

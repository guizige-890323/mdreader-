from PIL import Image
path=r'C:/Users/likui/.workbuddy/clipboard-images/clipboard-2026-11-18T23-56-50-241Z-0ce32fa2.png'
im=Image.open(path).convert('RGB'); px=im.load(); W,H=im.size
def near(c,t,tol=26): return all(abs(c[i]-t[i])<=tol for i in range(3))
targets={'ink':(17,27,43),'blue':(48,101,208),'white':(255,255,255),'bg':(242,245,248)}
for name,t in targets.items():
    rows=[y for y in range(H) if any(near(px[x,y],t) for x in range(W))]
    cols=[x for x in range(W) if any(near(px[x,y],t) for y in range(H))]
    print(name, 'y', (min(rows),max(rows)) if rows else None, 'x', (min(cols),max(cols)) if cols else None)
print()
# 逐行统计 ink 与 blue 的 x 跨度
for y in range(0,H,1):
    ink=[x for x in range(W) if near(px[x,y],(17,27,43))]
    blue=[x for x in range(W) if near(px[x,y],(48,101,208))]
    if ink or blue:
        s=''
        if ink: s+='INK x %d-%d(n=%d) '%(min(ink),max(ink),len(ink))
        if blue: s+='BLU x %d-%d(n=%d)'%(min(blue),max(blue),len(blue))
        print(y,s)

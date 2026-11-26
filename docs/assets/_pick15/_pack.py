
import sys
from PIL import Image, ImageChops
seq, out, durs = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3].split(',')]
im = Image.open(seq)
raw = []
try:
    while True:
        raw.append(im.copy()); im.seek(im.tell() + 1)
except EOFError:
    pass
assert len(raw) == len(durs), 'count %d != %d' % (len(raw), len(durs))
frames, delays = [], []
for fr, d in zip(raw, durs):
    if frames and ImageChops.difference(frames[-1].convert('RGB'), fr.convert('RGB')).getbbox() is None:
        delays[-1] += d
        continue
    frames.append(fr); delays.append(d)
frames[0].save(out, save_all=True, append_images=frames[1:],
               duration=delays, loop=0, optimize=True, disposal=1)
print('raw=%d packed=%d total=%.2fs' % (len(raw), len(frames), sum(delays)/1000.0))

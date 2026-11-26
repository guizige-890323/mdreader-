import io, re, json
s = io.open('src/template.html', encoding='utf-8').read()
m = re.search(r'var W_FEATS = \[(.*?)\n\];', s, re.S)
body = m.group(1)

def unesc(x):
    return re.sub(r'\\u([0-9a-fA-F]{4})', lambda mm: chr(int(mm.group(1), 16)), x)

def grab(chunk, key):
    # 找 key:'...' （单引号内不含单引号）
    i = chunk.find(key + ":")
    if i < 0:
        i = chunk.find(key + ":")
    if i < 0:
        return ''
    j = chunk.find("'", i)
    k = chunk.find("'", j + 1)
    return unesc(chunk[j+1:k])

def grab_tags(chunk):
    i = chunk.find('tags:[')
    if i < 0:
        return []
    j = chunk.find(']', i)
    inner = chunk[i+6:j]
    return [unesc(t.strip().strip("'")) for t in inner.split(',') if t.strip()]

chunks = body.split('{ cls:')
out = []
for c in chunks[1:]:
    out.append(dict(
        cls=grab(c, 'cls'),
        prio=grab(c, 'prio'),
        en=grab(c, 'en'),
        desc=grab(c, 'desc'),
        them=grab(c, 'them'),
        us=grab(c, 'us'),
        tags=grab_tags(c),
    ))
print('parsed', len(out))
io.open('tools/_probe/_feats.json', 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1))
for i, o in enumerate(out, 1):
    print("%2d [%s] %s  en=%s" % (i, o['cls'], o['prio'], o['en']))
    print("   desc:", o['desc'])
    print("   them:", o['them'], "|| us:", o['us'])
    print("   tags:", ' / '.join(o['tags']))

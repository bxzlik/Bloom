import struct, os
for name in ('prev','play','pause','next'):
    p = os.path.join(os.path.dirname(__file__), name + '.png')
    with open(p,'rb') as f: png = f.read()
    ihdr = png.index(b'IHDR')
    w,h = struct.unpack('>II', png[ihdr+4:ihdr+12])
    W = 0 if w>=256 else w
    H = 0 if h>=256 else h
    icondir = struct.pack('<HHH', 0, 1, 1)
    entry = struct.pack('<BBBBHHII', W, H, 0, 0, 1, 32, len(png), 22)
    out = os.path.join(os.path.dirname(__file__), name + '.ico')
    with open(out,'wb') as f:
        f.write(icondir + entry + png)
    print(name, w, 'x', h, '->', out, 'size=', len(png)+22)

"""Decode captured GS v 0 bands to PNG for visual inspection (no extra libraries)."""
from pathlib import Path
import struct
import zlib
raw = Path('docs/test-receipt.bin').read_bytes()
assert raw[:2] == b'\x1b@'
offset = 2
rows = []
width = None
while raw[offset:offset+3] == b'\x1dv0':
    stride = int.from_bytes(raw[offset+4:offset+6], 'little')
    height = int.from_bytes(raw[offset+6:offset+8], 'little')
    assert width in (None, stride * 8)
    width = stride * 8
    data = raw[offset+8:offset+8+stride*height]
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            row.append(0 if data[y*stride+x//8] & (0x80 >> (x % 8)) else 255)
        rows.append(bytes(row))
    offset += 8+stride*height
assert raw[offset:offset+3] == b'\x1bd\x04'
def chunk(kind, payload):
    return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind+payload) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, len(rows), 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')
Path('docs/screenshots/native-test-receipt.png').write_bytes(png)
print(f'Validated and decoded {len(raw)} ESC/POS bytes: {width} × {len(rows)} pixels')

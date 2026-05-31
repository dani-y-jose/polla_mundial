# /// script
# requires-python = ">=3.10"
# dependencies = ["Pillow"]
# ///
"""Remove the connected studio background (white + soft grey shadow) from the
mascot image by flood-filling inward from every border pixel. Interior whites
(eagle head, highlights, FIFA logo) are preserved because they are not
connected to the border background.

Usage: uv run scripts/remove_bg.py <input.png> <output.png> [thresh]
"""
import sys
from collections import deque
from PIL import Image

src = sys.argv[1]
dst = sys.argv[2]
thresh = int(sys.argv[3]) if len(sys.argv) > 3 else 60

img = Image.open(src).convert("RGBA")
w, h = img.size
px = img.load()

def is_bg(p):
    r, g, b, _ = p
    # Background is near-white or light-grey (the soft shadow): bright and
    # low-saturation. Catches white and the grey drop shadow, not the
    # saturated mascot colors.
    brightness = (r + g + b) / 3
    spread = max(r, g, b) - min(r, g, b)
    return brightness >= (255 - thresh) and spread <= 25

# BFS flood fill from all border pixels that look like background.
visited = bytearray(w * h)
q = deque()

def seed(x, y):
    i = y * w + x
    if not visited[i] and is_bg(px[x, y]):
        visited[i] = 1
        q.append((x, y))

for x in range(w):
    seed(x, 0)
    seed(x, h - 1)
for y in range(h):
    seed(0, y)
    seed(w - 1, y)

while q:
    x, y = q.popleft()
    px[x, y] = (px[x, y][0], px[x, y][1], px[x, y][2], 0)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h:
            i = ny * w + nx
            if not visited[i] and is_bg(px[nx, ny]):
                visited[i] = 1
                q.append((nx, ny))

# Feather: soften the 1px white halo along the new edges by lowering alpha of
# bright pixels that border transparency, so edges don't glow on a dark bg.
edge = []
for y in range(h):
    for x in range(w):
        if px[x, y][3] == 0:
            continue
        r, g, b, a = px[x, y]
        if (r + g + b) / 3 >= 235:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    edge.append((x, y))
                    break
for x, y in edge:
    r, g, b, a = px[x, y]
    px[x, y] = (r, g, b, 90)

img.save(dst)
opaque = sum(1 for y in range(h) for x in range(w) if px[x, y][3] != 0)
print(f"{w}x{h}: {opaque} opaque px ({100*opaque//(w*h)}%), saved {dst}")

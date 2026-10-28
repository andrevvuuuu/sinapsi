"""Renders kit/icon-*.svg into build/icon.icns, build/icon.png and resources/icon.png (run from the repo root after build_kit.py).

Needs the logo-design skill's render_png.py (or any SVG→PNG renderer with transparency) and macOS iconutil.
"""
import os, shutil, subprocess, sys, tempfile
RENDER = os.path.expanduser('~/.claude/skills/logo-design/scripts/render_png.py')
# The small cut (fuller crescents) where the icon is 32 px or less on screen.
SPECS = [(16, '16x16', 'small'), (32, '16x16@2x', 'small'), (32, '32x32', 'small'), (64, '32x32@2x', 'final'), (128, '128x128', 'final'),
         (256, '128x128@2x', 'final'), (256, '256x256', 'final'), (512, '256x256@2x', 'final'), (512, '512x512', 'final'), (1024, '512x512@2x', 'final')]
tmp = tempfile.mkdtemp()
iconset = os.path.join(tmp, 'Sinapsi.iconset'); os.makedirs(iconset)
for px, name, cut in SPECS:
    out = os.path.join(tmp, f'{px}{cut}')
    subprocess.run([sys.executable, RENDER, f'design/logo/kit/icon-{cut}.svg', '--out-dir', out, '--size', str(px)], check=True, capture_output=True)
    shutil.copy(os.path.join(out, f'icon-{cut}.png'), os.path.join(iconset, f'icon_{name}.png'))
subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', 'build/icon.icns'], check=True)
for dest in ('build/icon.png', 'resources/icon.png'): shutil.copy(os.path.join(iconset, 'icon_512x512@2x.png'), dest)
shutil.copy('design/logo/kit/icon-final.svg', 'build/icon.svg')
print('icons written')

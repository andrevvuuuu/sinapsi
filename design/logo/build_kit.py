"""Builds the Sinapsi logo kit from build_mark.py: masters, colour variants, app icon sources."""
import os
import build_mark as b
os.makedirs('kit', exist_ok=True)
INK_L, ACC_L = '#221e19', '#a83d22'   # Trattato (light)
INK_D, ACC_D = '#ece9df', '#ef7a42'   # Lavagna (dark)
TILE = '#141511'
def svg(body, vb='0 0 256 256', title='Sinapsi'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><title>{title}</title>{body}</svg>\n'
def mark(name, ink, acc):
    up, lo, sp = b.parts(name)
    return f'<path fill="{ink}" d="{up}"/><path fill="{ink}" d="{lo}"/><path fill="{acc}" d="{sp}"/>'
VB = '28 26 200 200'  # tight square around the mark
def w(p, s): open(p, 'w').write(s)
for name in ('final', 'small'):
    w(f'kit/sinapsi-{name}-black.svg', svg(mark(name, '#000000', '#000000'), VB))
    w(f'kit/sinapsi-{name}-white.svg', svg(mark(name, '#ffffff', '#ffffff'), VB))
    w(f'kit/sinapsi-{name}-light.svg', svg(mark(name, INK_L, ACC_L), VB))
    w(f'kit/sinapsi-{name}-dark.svg', svg(mark(name, INK_D, ACC_D), VB))
    # macOS app icon: 824/1024 tile with the mark at about 60 % of the tile.
    glow = f'<defs><radialGradient id="g" cx="512" cy="504" r="340" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{ACC_D}" stop-opacity=".14"/><stop offset="1" stop-color="{ACC_D}" stop-opacity="0"/></radialGradient></defs>'
    tile = f'{glow}<rect x="100" y="100" width="824" height="824" rx="186" fill="{TILE}"/><rect x="100" y="100" width="824" height="824" rx="186" fill="url(#g)"/><rect x="101" y="101" width="822" height="822" rx="185" fill="none" stroke="rgba(236,233,223,.12)" stroke-width="2"/>'
    w(f'kit/icon-{name}.svg', svg(f'{tile}<g transform="translate(512 512) scale(2.6) translate(-128 -126)">{mark(name, INK_D, ACC_D)}</g>', '0 0 1024 1024'))

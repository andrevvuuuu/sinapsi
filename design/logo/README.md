# Logo Sinapsi — Mezzaluna

**Idea.** Una S scritta a pennino: due mezzelune che si tendono l'una verso l'altra, e la scintilla
che attraversa la fessura. È una sinapsi (due terminazioni, il segnale nel mezzo) e l'iniziale del nome;
il contrasto pieno/sottile richiama la grazia di Instrument Serif del logotipo.

## File
| File | Uso |
|---|---|
| `kit/sinapsi-final-light.svg` | Su sfondo chiaro (tema Trattato) |
| `kit/sinapsi-final-dark.svg` | Su sfondo scuro (tema Lavagna) |
| `kit/sinapsi-final-black.svg`, `-white.svg` | Un solo colore (stampa, timbri, incisioni) |
| `kit/sinapsi-small-*.svg` | Fino a 32 px: mezzelune più piene e più distanti dalla scintilla, così la fessura resta visibile |
| `kit/icon-final.svg`, `icon-small.svg` | Icona macOS (sorgente di `build/icon.icns`) |
| `concepts.png` | I tre concetti valutati (A spezzata, B mezzaluna, C circuito) |

Tutto è generato da script: cambia i parametri lì, non a mano.

```bash
cd design/logo && python3 build_kit.py && cd ../..   # geometria (build_mark.py) → varianti in kit/
python3 design/logo/build_icons.py                   # kit/icon-*.svg → build/icon.icns, build/icon.png, resources/icon.png
```

## Colori
| | Chiaro (Trattato) | Scuro (Lavagna) |
|---|---|---|
| Inchiostro | `#221e19` | `#ece9df` |
| Scintilla | `#a83d22` | `#ef7a42` |
| Fondo icona | — | `#141511` |

Nell'app il logo usa i token del tema (`--ink`, `--accent`), quindi segue da solo chiaro/scuro.

## Regole
- **Spazio libero** attorno al segno: almeno il diametro di una mezzaluna diviso 2.
- **Misura minima**: 16 px. Fino a 32 px si usa la versione `small`, sopra la `final`.
- **Non**: ruotarlo, cambiare i colori fuori palette, aggiungere ombre o contorni, separare la scintilla.
- Il logotipo «Sinapsi» è in Instrument Serif 400 accanto al segno, alto quanto le mezzelune.

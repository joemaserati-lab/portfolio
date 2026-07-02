# Edoardo Rappanello Portfolio

Portfolio personale con hero canvas, sequenza runner e contenuti navigabili con scroll nativo.

## Logica implementata

- La hero mantiene la sequenza di immagini WebP renderizzata su canvas full viewport.
- La pagina usa scroll verticale reale e sezioni HTML accessibili.
- La navigazione principale collega Work, About, Process e Contact.
- Il runner avanza con wheel, touch, tastiera e variazioni di scroll senza bloccare lo scroll nativo.
- Dopo la hero il runner si compatta e resta centrato nell'header.
- Le preferenze `prefers-reduced-motion` fermano l'avanzamento automatico della sequenza.
- I contenuti portfolio includono posizionamento, mini case study, processo, capability e CTA.

## Avvio

Apri `index.html` in browser.

## Parametri principali

Nel file `script.js` puoi modificare:

- `wheelSensitivity`, `touchSensitivity`, `scrollSensitivity`: sensibilita degli input che fanno correre il runner.
- `compactStart`, `compactEnd`: soglie della transizione da hero full viewport a runner compatto.
- `compactIconHeight`: altezza del runner compatto nell'header.
- `fit`: `cover` per riempire il viewport, `contain` per mantenere tutto visibile.
- `maxDevicePixelRatio`: limite del DPR usato per il rendering canvas.
- `framePath`: percorso dei frame WebP.

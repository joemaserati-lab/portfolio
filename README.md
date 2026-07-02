# Edoardo Rappanello Portfolio

Portfolio personale con hero canvas, sequenza runner e contenuti navigabili con scroll nativo.

## Logica implementata

- La hero mantiene la sequenza di immagini WebP renderizzata su canvas.
- La pagina usa scroll verticale reale e sezioni HTML accessibili.
- La navigazione principale collega Work, About, Process e Contact.
- Il runner si anima in modo leggero in background senza intercettare wheel, touch o tastiera.
- Le preferenze `prefers-reduced-motion` fermano l'avanzamento automatico della sequenza.
- I contenuti portfolio includono posizionamento, mini case study, processo, capability e CTA.

## Avvio

Apri `index.html` in browser.

## Parametri principali

Nel file `script.js` puoi modificare:

- `playbackSpeed`: velocita dell'animazione canvas.
- `fit`: `cover` per riempire il viewport, `contain` per mantenere tutto visibile.
- `maxDevicePixelRatio`: limite del DPR usato per il rendering canvas.
- `framePath`: percorso dei frame WebP.

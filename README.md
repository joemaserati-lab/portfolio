# Scroll Runner Loop

Pagina web desktop con sequenza di immagini controllata dallo scroll.

## Logica implementata

- La pagina è full viewport e non genera scroll verticale reale.
- Il wheel del mouse o trackpad controlla la sequenza.
- La direzione dello scroll viene ignorata: scroll giù e scroll su mandano sempre avanti l'animazione.
- La sequenza è in loop continuo sui 20 frame.
- Il rendering usa canvas per ridurre flicker e gestire meglio il resize desktop.
- La versione aggiornata usa inerzia continua e un limite massimo di velocità per evitare accelerazioni eccessive.
- I frame caricati dal sito sono WebP quality 85 con canale alfa, generati dai PNG originali per ridurre il peso iniziale.

## Avvio

Apri `index.html` in browser.

## Parametri principali

Nel file `script.js` puoi modificare:

- `wheelSensitivity`: velocità di avanzamento della sequenza.
- `inertia`: durata dell'inerzia dopo lo scroll.
- `inputSmoothing`: morbidezza con cui gli input vengono applicati alla sequenza.
- `frameInterpolation`: blending tra frame consecutivi, attualmente disattivato.
- `maxVelocity`: limite massimo di velocità; abbassalo ulteriormente se vuoi una corsa ancora più lenta.
- `maxPendingImpulse`: limite massimo dell'input accumulato durante scroll ripetuti.
- `fit`: `cover` per riempire il viewport, `contain` per mantenere tutto visibile.

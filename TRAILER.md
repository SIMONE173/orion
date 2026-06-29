# ORION — Trailer ufficiale di lancio · Documento di produzione

Obiettivo: stupore, curiosità, "ho appena visto il futuro del lavoro". Livello Apple/Tesla/
OpenAI/Meta. Durata ~2:32 (max 3:00). **Tutte le schermate di ORION sono il prodotto REALE**
(nessuna interfaccia inventata, colori/identità invariati).

Questo trailer si compone di **due fonti video**, montate insieme:
- **A) La sequenza grafica `/trailer`** (già costruita in codice, identità ORION reale: nucleo,
  tema dark, glass, tipografia). La registri a schermo in 4K.
- **B) Riprese reali del prodotto in azione** (screen recording dell'app vera) per i momenti che
  vanno mostrati dal vivo (Blender/VS Code che si aprono, i gesti sul desktop, il vero briefing).
  Si **intercutano** dentro la timeline A.

Niente persone in scena (scelta confermata): il trailer è interamente "prodotto + luce + tipografia
+ voce + musica", come i reveal Apple di un sistema operativo.

---

## Come registrare la sequenza grafica (A)

1. Apri **`https://orion-production-5ddd.up.railway.app/trailer`** (o in locale `npm run dev` →
   `/trailer`) su uno schermo ad alta risoluzione.
2. Premi **F** (schermo intero), poi **▶ Avvia il trailer**. Comandi: **Spazio** pausa · **R**
   riavvia · **C** sottotitoli on/off.
3. Registra con uno **screen recorder a 4K/60fps** (QuickTime "Nuova registrazione schermo" va bene;
   per 60fps usa OBS). Nascondi il cursore. Disattiva le notifiche.
4. I **sottotitoli a schermo (C)** servono per allineare la voce in post: tienili **OFF** nella take
   finale (la voce narrante li sostituisce) oppure ON se vuoi anche i sottotitoli nel video.

## Riprese reali del prodotto da intercut (B) — opzionali ma consigliate

Registra l'app vera mentre fa queste cose (sostituiscono/arricchiscono le scene corrispondenti):
- **Blender / VS Code / Claude Code** che si aprono e ORION crea il modello/scrive il codice
  (scena "Il computer obbedisce").
- **Gesti sul desktop**: il nucleo + le finestre-pannello che si spostano con la mano (scena
  "Controllo dello spazio").
- **Briefing reale** con dati reali e il nucleo che parla (scene 1 / 13).
- **Modalità visione** dal vivo su un oggetto reale (scena "Sul campo").

---

## Timeline + copione voce narrante (VO)

Voce: **maschile, profonda, calma, autorevole, elegante, leggermente emozionale** (stile reveal
tech). NON robotica → doppiatore reale oppure voce neurale premium (es. ElevenLabs, voce italiana
profonda). Italiano.

| Tempo | Scena | A schermo (prodotto reale) | Voce / battuta |
|---|---|---|---|
| 0:00–0:13 | Risveglio | nero → impulso di luce → **il nucleo** appare | ORION: «Buongiorno Simone. Prima che inizi, ci sono tre cose da sistemare.» |
| 0:13–0:26 | Le tre cose | nucleo + 3 card briefing che salgono | (silenzio musicale, le card appaiono) |
| 0:26–0:30 | Il primo giorno | title card | ORION: «Che lavoro svolge?» |
| 0:30–0:38 | Medico | pannello **Agenda** reale | ORION: «Dottore, Rossi ha una visita stamattina. Ieri sera ha inviato nuovi esami: ho già preparato un riepilogo.» |
| 0:38–0:46 | Avvocato | **Fascicolo** | ORION: «Domani è prevista l'udienza Rossi. Ho preparato il fascicolo con gli ultimi aggiornamenti.» |
| 0:46–0:55 | Azienda | **organigramma + codice aziendale** | VO: «In azienda, ogni persona col proprio codice ritrova il suo ruolo e il suo ambiente.» |
| 0:55–1:04 | Studente | **Lavagna** (integrali) | VO: «Non cerca solo informazioni. Ti aiuta a capire.» |
| 1:04–1:13 | Sul campo | **Modalità visione** (riquadri) | VO: «Non lavora solo sul computer. Lavora accanto a te.» |
| 1:13–1:25 | Comunicazioni | **WhatsApp** (msg→bozza→inviato) | VO: «Le tue comunicazioni, gestite con la voce. Senza toccare nulla.» |
| 1:25–1:38 | Il computer obbedisce | comandi → Blender/VS Code/file (intercut riprese B) | VO: «Non imparare un nuovo software. Parla con il tuo computer.» |
| 1:38–1:49 | Controllo dello spazio | **gesti**: finestre spostate a mano (intercut B) | VO: «La tecnologia deve adattarsi a te. Non il contrario.» |
| 1:49–2:01 | Impara nel tempo | **Memoria viva** (regola del venerdì) | VO: «Ogni giorno ti conosce un po' di più.» — ORION: «Vuole che diventi una regola permanente?» / «Sì.» |
| 2:01–2:14 | Briefing del mattino | nucleo + 3 punti + **CONFERMA MODIFICHE** | (le 3 voci del briefing, brevi) |
| 2:14–2:31 | Finale | tutto svanisce → resta il **nucleo** → si illumina → **logo + tagline** | VO lento: «Per anni abbiamo imparato ad usare i computer.» … «Forse è arrivato il momento che siano loro ad imparare a lavorare con noi.» |

**Card finale (testo esatto, già nella scena):**
- ORION
- LA PRIMA SEGRETERIA OPERATIVA INTELLIGENTE
- «Non imparare un software. Parla con ORION.»

---

## Cue-sheet musicale (crescita progressiva)

- **0:00–0:26 — Misterioso**: quasi silenzio, **sub-bass** profondo, un drone, un "tick" sul battito
  di luce del risveglio. Tensione.
- **0:26–1:13 — Costruzione**: entra un pulse ritmico discreto, arpeggi cristallini; ogni cambio di
  contesto (medico→avvocato→azienda→studente→campo) cade su un **beat**. Senso di potenza che cresce.
- **1:13–2:01 — Potenza**: percussioni piene, il tema principale si apre; sui tagli rapidi
  (comunicazioni, comandi, gesti) la musica spinge. Stupore.
- **2:01–2:14 — Sospensione**: breve respiro prima del finale (il briefing).
- **2:14–2:31 — Epico**: hit emozionale sul "si illumina" del nucleo, poi **risoluzione** ampia e
  luminosa sotto il logo. Lascia il senso di futuro.

Tipo brano: cinematic tech ("Apple keynote reveal"/"Hans Zimmer-lite"). Licenza royalty-free
(Artlist/Musicbed/Epidemic) o composizione su misura.

---

## Specifiche tecniche & post

- **4K (3840×2160), 60 fps**, 16:9. Le barre cinematografiche (letterbox) sono già nella scena.
- **Color grade**: contrasto morbido, neri profondi (#05070d), glow cyan (#22d3ee/#38e8ff) coerente
  col prodotto. NON cambiare i colori dell'identità.
- **Voce**: registrata pulita, EQ calda, leggero riverbero da "sala"; sincronizzata coi tempi sopra.
- **Transizioni**: dissolvenze incrociate (già nella sequenza); evita wipe/effetti "videogioco".
- **Export**: H.264/H.265 alto bitrate (≥ 40 Mbps) per YouTube/sito; versione 1:1 e 9:16 ricavabili
  dal master ricomponendo (non generare UI finte: ritaglia/anima sul master).

## Regola d'oro
La spettacolarità nasce **dal mostrare ORION reale** in modo cinematografico, non da effetti
inventati. Tutto ciò che si vede è (o deve essere) il prodotto vero.

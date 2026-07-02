// ════════════════════════════════════════════════════════════════════════
//  ORION — colonna sonora + sound design (originali, royalty-free).
//  Stile: sereno, ritmico, luminoso ("Apple keynote"), tonalità MAGGIORE,
//  progressione I–V–vi–IV (Do–Sol–Lam–Fa). Sintesi additiva in Node,
//  sincronizzata alla timeline del trailer (149.25s). Output: score.wav.
// ════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const SR = 44100, DUR = 150.6, N = Math.ceil(SR * DUR), TAU = Math.PI * 2;
const L = new Float64Array(N), R = new Float64Array(N);
let _s = 7; const rnd = () => { _s = (_s*1664525 + 1013904223) >>> 0; return _s/4294967296; };
const noise = () => rnd()*2-1;
const midi = (m) => 440*Math.pow(2,(m-69)/12);
const clamp = (x,a,b)=> x<a?a:x>b?b:x;
const idx = (t)=> Math.floor(t*SR);
function asr(lt,dur,atk,rel){ if(lt<0||lt>dur) return 0; let e=1; if(lt<atk)e=lt/atk; else if(lt>dur-rel)e=(dur-lt)/rel; e=clamp(e,0,1); return e*e*(3-2*e); }
// inviluppo da keyframe [ [t,val], ... ]
function kf(ks,t){ if(t<=ks[0][0])return ks[0][1]; for(let i=0;i<ks.length-1;i++){ if(t>=ks[i][0]&&t<ks[i+1][0]){ const p=(t-ks[i][0])/(ks[i+1][0]-ks[i][0]); return ks[i][1]+(ks[i+1][1]-ks[i][1])*p; } } return ks[ks.length-1][1]; }

function tone({t,dur,freq,amp=0.2,type="sine",atk=0.02,rel=0.2,pan=0,detune=0,vib=0,vibf=5}){
  const i0=idx(t), i1=Math.min(N,idx(t+dur)); const gl=Math.cos((pan+1)*Math.PI/4), gr=Math.sin((pan+1)*Math.PI/4);
  for(let i=i0;i<i1;i++){ const lt=(i-i0)/SR; const env=asr(lt,dur,atk,rel); if(env<=0)continue;
    const f=freq*(1+vib*Math.sin(TAU*vibf*lt)); const ph=TAU*f*lt;
    let s=type==="tri"?(2/Math.PI)*Math.asin(Math.sin(ph)):Math.sin(ph);
    if(detune) s+=0.5*Math.sin(TAU*f*(1+detune)*lt);
    s*=env*amp; L[i]+=s*gl; R[i]+=s*gr; }
}
// pluck/marimba: caldo, decadimento rapido (sin + un filo di triangolo)
function pluck({t,freq,amp=0.14,dur=0.6,pan=0,decay=6}){
  const i0=idx(t), i1=Math.min(N,idx(t+dur)); const gl=Math.cos((pan+1)*Math.PI/4), gr=Math.sin((pan+1)*Math.PI/4);
  for(let i=i0;i<i1;i++){ const lt=(i-i0)/SR; const env=Math.exp(-lt*decay)*(1-Math.exp(-lt*180));
    const s=(Math.sin(TAU*freq*lt)+0.3*((2/Math.PI)*Math.asin(Math.sin(TAU*freq*lt)))+0.18*Math.sin(TAU*freq*2*lt))*env*amp;
    L[i]+=s*gl; R[i]+=s*gr; }
}
// bell cristallino + 2 echi (spazio)
function bell({t,freq,amp=0.16,dur=1.5,pan=0}){
  const i0=idx(t), i1=Math.min(N,idx(t+dur)); const gl=Math.cos((pan+1)*Math.PI/4), gr=Math.sin((pan+1)*Math.PI/4);
  for(let i=i0;i<i1;i++){ const lt=(i-i0)/SR; const env=Math.exp(-lt*3.0)*(1-Math.exp(-lt*220));
    const s=(Math.sin(TAU*freq*lt)+0.4*Math.sin(TAU*freq*2.01*lt)+0.16*Math.sin(TAU*freq*3*lt))*env*amp; L[i]+=s*gl; R[i]+=s*gr; }
  for(const [dt,g] of [[0.26,0.38],[0.52,0.16]]){ const j0=idx(t+dt), j1=Math.min(N,idx(t+dt+dur));
    for(let i=j0;i<j1;i++){ const lt=(i-j0)/SR; const env=Math.exp(-lt*3.0)*(1-Math.exp(-lt*220)); const s=Math.sin(TAU*freq*lt)*env*amp*g; L[i]+=s*gr; R[i]+=s*gl; } }
}
function noiseSweep({t,dur,amp=0.2,cut0=400,cut1=6000,atk=0.3,rel=0.3,pan=0}){
  const i0=idx(t), i1=Math.min(N,idx(t+dur)); const gl=Math.cos((pan+1)*Math.PI/4), gr=Math.sin((pan+1)*Math.PI/4); let lp=0;
  for(let i=i0;i<i1;i++){ const lt=(i-i0)/SR, p=lt/dur; const cut=cut0*Math.pow(cut1/cut0,p); const a=1-Math.exp(-TAU*cut/SR); lp+=a*(noise()-lp);
    const env=asr(lt,dur,atk,rel); const s=lp*env*amp; L[i]+=s*gl; R[i]+=s*gr; }
}
function kick({t,amp=0.5,f0=110,f1=42,dur=0.45,click=0}){
  const i0=idx(t), i1=Math.min(N,idx(t+dur));
  for(let i=i0;i<i1;i++){ const lt=(i-i0)/SR, p=lt/dur; const f=f1+(f0-f1)*Math.exp(-p*7); const env=Math.exp(-lt*5.5);
    let s=Math.sin(TAU*f*lt)*env*amp; if(click&&lt<0.01)s+=noise()*click*(1-lt/0.01); L[i]+=s; R[i]+=s; }
}
function hat({t,amp=0.04}){ noiseSweep({t,dur:0.05,amp,cut0:7000,cut1:9500,atk:0.002,rel:0.045,pan:0.25}); }
function pad({t,dur,notes,amp=0.1,pan=0}){ notes.forEach((m,k)=> tone({t,dur,freq:midi(m),amp:amp*(k===0?1:0.72),type:k<2?"tri":"sine",atk:0.5,rel:Math.min(1.4,dur*0.5),detune:0.004,vib:0.003,vibf:0.2+k*0.06,pan:pan+(k-1.5)*0.16})); }

// ════════════════════════════════════════════════════════════════════════
//  ARRANGIAMENTO  (progressione Do–Sol–Lam–Fa, serena e luminosa)
// ════════════════════════════════════════════════════════════════════════
const LOOP = [
  { pad:[48,55,60,64], root:36, arp:[60,64,67,72] }, // C
  { pad:[43,50,55,59], root:31, arp:[59,62,67,71] }, // G
  { pad:[45,52,57,60], root:33, arp:[57,60,64,69] }, // Am
  { pad:[41,48,53,57], root:29, arp:[53,57,60,65] }, // F
];
const BPM = 110, BEAT = 60/BPM, BAR = BEAT*4;     // 1 accordo per battuta
const HARM_START = 13.25, GROOVE_END = 131.0;
const chordIdx = (t)=> ((Math.floor((t-HARM_START)/BAR)%4)+4)%4;

// pad continuo (dalla nascita fino al futuro) — caldo, con crossfade per battuta
const padInt = [[13.25,0],[14.5,0.5],[27,0.62],[56,0.78],[90,0.9],[120,1.05],[131,0.4]];
for(let bar=0; ; bar++){ const t=HARM_START+bar*BAR; if(t>=GROOVE_END) break; const ch=LOOP[chordIdx(t)];
  pad({t, dur:BAR+0.5, notes:ch.pad, amp:0.085*kf(padInt,t)}); }

// sub/basso caldo per battuta (corpo, non cupo)
const bassInt = [[13.25,0],[16,0.25],[27.5,0.4],[56,0.55],[90,0.65],[120,0.8],[131,0.2]];
for(let bar=0; ; bar++){ const t=HARM_START+bar*BAR; if(t>=GROOVE_END) break; const ch=LOOP[chordIdx(t)];
  tone({t, dur:BAR*0.96, freq:midi(ch.root), amp:0.16*kf(bassInt,t), type:"tri", atk:0.04, rel:0.3});
  tone({t, dur:BAR*0.96, freq:midi(ch.root+12), amp:0.05*kf(bassInt,t), type:"sine", atk:0.04, rel:0.3}); }

// GROOVE: kick gentile 4/4 + hat in levare + arpeggio cristallino
const grvInt = [[27.5,0],[28,0.35],[40,0.5],[56,0.62],[76,0.72],[90,0.8],[110,0.92],[120,1.0],[128,1.0],[130.5,0]];
{ let beat=0; for(let t=27.5; t<GROOVE_END; t+=BEAT, beat++){ const g=kf(grvInt,t); if(g<=0) continue;
    const onBar = beat%4===0;
    kick({t, amp:(onBar?0.34:0.24)*g, f0:95, f1:46, dur:0.34});
    hat({t:t+BEAT*0.5, amp:0.035*g});
    if(beat%4===2) hat({t, amp:0.02*g}); }
}
// arpeggio (ottavi) — marimba luminosa, alternato in stereo
const arpInt = [[27.5,0],[30,0.5],[56,0.7],[90,0.85],[118,1.0],[129,0.4],[131,0]];
{ let n=0; for(let t=27.8; t<GROOVE_END; t+=BEAT/2, n++){ const g=kf(arpInt,t); if(g<=0) continue; const ch=LOOP[chordIdx(t)];
    const note=ch.arp[n%4]; pluck({t, freq:midi(note), amp:0.075*g, dur:0.6, pan:(n%2?0.4:-0.4), decay:6}); }
}

// ── INTRO / CAOS (0–13.25): leggero, curioso, NON ansiogeno ──
// marimba veloce in Do (tante cose) + soft pulse, luminoso
{ const cint=[[0,0.0],[1,0.4],[8,0.5],[12.5,0.55],[13.25,0.2]]; let n=0;
  const scale=[60,62,64,67,69,72,67,64];
  for(let t=0.6; t<13.0; t+=0.18, n++){ const g=kf(cint,t); pluck({t, freq:midi(scale[n%scale.length]), amp:0.045*g, dur:0.4, pan:(rnd()*2-1)*0.6, decay:8}); }
  for(let t=1.0; t<13.0; t+=BEAT){ kick({t, amp:0.12, f0:80, f1:48, dur:0.3}); }
}
// uplift sereno verso la nascita
noiseSweep({t:12.4, dur:1.4, amp:0.12, cut0:500, cut1:5500, atk:1.1, rel:0.25 });

// ── NASCITA DEL NUCLEO (~14.15s): boom CALDO + accordo bell luminoso ──
kick({t:14.1, amp:0.7, f0:120, f1:40, dur:0.8, click:0.1});
[60,64,67,72].forEach((m,i)=> bell({t:14.2, freq:midi(m), amp:0.18-i*0.02, dur:2.6, pan:(i-1.5)*0.22}));
noiseSweep({t:13.0, dur:1.15, amp:0.10, cut0:6000, cut1:700, atk:0.9, rel:0.3}); // reverse morbido
[15.6,16.9,18.2].forEach((t,i)=> bell({t, freq:midi(67+i*2), amp:0.09, dur:1.3, pan:[-0.4,0.3,0][i]})); // osserva/analizza/capisce

// ── cambi scena: impatto musicale soffice + uplift gentile ──
const hits = [27.5, 42.75, 56.0, 76.25, 89.5, 97.75, 120.0];
for(const t of hits){ const ch=LOOP[chordIdx(t)];
  kick({t, amp:0.32, f0:100, f1:46, dur:0.5});
  bell({t:t+0.02, freq:midi(ch.pad[2]+12), amp:0.07, dur:1.0, pan:0});
  noiseSweep({t:t-0.9, dur:0.95, amp:0.07, cut0:500, cut1:5000, atk:0.8, rel:0.18}); }

// ── ECOSISTEMA: 6 "bloop" piacevoli + chime "fatto" ──
for(let i=0;i<6;i++){ const t=56.0 + (0.26+i*0.07)*21.0;
  pluck({t, freq:midi(72+ (i%3)*2), amp:0.06, dur:0.5, pan:(i%2?0.5:-0.5), decay:7});
  bell({t:t+4.2, freq:midi(79), amp:0.045, dur:0.7, pan:(i%2?0.4:-0.4)}); }

// ── DESKTOP & GESTI (97.75–120.75): suoni gestuali discreti ──
// fasi: B pinch 101.4 · C ridimensiona 107.4 · D avanti 112.9 · E chiudi 117.3
pluck({t:101.4, freq:midi(76), amp:0.05, dur:0.4, decay:9});                 // pinch
noiseSweep({t:101.6, dur:0.6, amp:0.05, cut0:500, cut1:3500, atk:0.1, rel:0.4}); // sposta (whoosh)
pluck({t:107.4, freq:midi(72), amp:0.05, dur:0.4, decay:9});                 // due mani
bell({t:111.6, freq:midi(83), amp:0.06, dur:0.8});                          // ridimensiona ok
pluck({t:112.9, freq:midi(79), amp:0.05, dur:0.4, decay:9});                 // avanti
bell({t:113.4, freq:midi(86), amp:0.05, dur:0.7});
noiseSweep({t:117.3, dur:0.5, amp:0.06, cut0:1500, cut1:6000, atk:0.05, rel:0.35}); // su/chiudi (swish)

// ── FUTURO → FINALE ──
noiseSweep({t:128.5, dur:3.4, amp:0.18, cut0:300, cut1:9000, atk:3.0, rel:0.3}); // grande uplift sereno
// IGNIZIONE (~137.35s): boom caldo + accordo Cadd9 luminoso
kick({t:137.25, amp:0.85, f0:150, f1:34, dur:1.3, click:0.12});
[60,64,67,72,74,79].forEach((m,i)=> bell({t:137.35, freq:midi(m), amp:0.16-i*0.012, dur:3.2, pan:(i-2.5)*0.18}));
// LOGO (~140s): coda calda Do maggiore che risolve e svanisce
[48,55,60,64,67].forEach((m,i)=> tone({t:139.4, dur:10.5, freq:midi(m), amp:0.10-i*0.012, type:"sine", atk:1.6, rel:6.8, detune:0.003, pan:(i-2)*0.2}));
bell({t:139.8, freq:midi(72), amp:0.11, dur:4.0});

// finale: un pad caldo sotto l'ignizione (132.25→139) per continuità
pad({t:131.8, dur:7.6, notes:[48,55,60,64], amp:0.06});

// ════════════════════════════════════════════════════════════════════════
//  MIX
// ════════════════════════════════════════════════════════════════════════
for(let i=0;i<N;i++){ const t=i/SR; let g=1; if(t<0.4)g=t/0.4; if(t>146.8)g=clamp((150.6-t)/3.8,0,1); L[i]*=g; R[i]*=g; }
let peak=1e-9; for(let i=0;i<N;i++){ peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i])); }
const norm=0.9/peak, tanh=Math.tanh;
const buf=Buffer.alloc(N*4);
for(let i=0;i<N;i++){ const l=tanh(L[i]*norm*1.05), r=tanh(R[i]*norm*1.05);
  buf.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(l*32767))),i*4);
  buf.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(r*32767))),i*4+2); }
function wavHeader(d){ const h=Buffer.alloc(44); h.write("RIFF",0); h.writeUInt32LE(36+d,4); h.write("WAVE",8); h.write("fmt ",12);
  h.writeUInt32LE(16,16); h.writeUInt16LE(1,20); h.writeUInt16LE(2,22); h.writeUInt32LE(SR,24); h.writeUInt32LE(SR*4,28); h.writeUInt16LE(4,32); h.writeUInt16LE(16,34); h.write("data",36); h.writeUInt32LE(d,40); return h; }
const out=path.join(import.meta.dirname,"score.wav");
fs.writeFileSync(out,Buffer.concat([wavHeader(buf.length),buf]));
console.log("✓ score.wav:", DUR.toFixed(1)+"s · picco norm", norm.toFixed(2));

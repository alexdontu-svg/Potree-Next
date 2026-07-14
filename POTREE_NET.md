# Potree-Net

Aplicație de digitizare topografică peste Potree-Next/WebGPU, inspirată din fluxul
`Potree_Digitizare_Carcea` construit inițial peste Potree 1.8.2.

## Pornire

Norul Potree 2 trebuie să fie disponibil în:

```text
resources/pointclouds/11-CORNU/
  metadata.json
  hierarchy.bin
  octree.bin
```

Fișierele norului sunt ignorate de Git. Pe calculatorul de dezvoltare, folderul poate fi
legat fără duplicare:

```bash
ln -s "/cale/catre/clouds/11-CORNU" resources/pointclouds/11-CORNU
```

Pornește aplicația cu:

```bash
./start_potree_net.command
```

Pagina acceptă și alt nor/proiect:

```text
http://127.0.0.1:8080/potree-net.html?cloud=./cale/metadata.json&project=NUME
```

## Funcții portate

- puncte continue și polilinii pe punctele norului;
- coduri/layer-e și preseturi topografice;
- snap 3D la vârfurile digitizate;
- închidere polilinie;
- selecție și selecție după cod;
- undo, ștergere, schimbare cod și adăugare vârf;
- join pentru linii cu același cod;
- offset planimetric cu păstrarea cotelor sursei;
- salvare/reluare sesiune JSON;
- export DXF 3D.

## Mod hibrid Points / Gaussian Splats

Aplicația are trei moduri de strat: `POINTS`, `SPLATS` și `HYBRID`. Un model
Gaussian PLY local poate fi cerut prin URL:

```text
http://127.0.0.1:8080/potree-net.html?splat=./resources/models/model.ply&mode=HYBRID
```

Pentru un splat antrenat într-un cadru local, plasarea în Stereo 70 este explicită,
în ordinea internă `Est,Nord,Cota`:

```text
&splatPosition=410573.637,309257.536,136.018&splatScale=1
```

Loaderul validează PLY `binary_little_endian`, încarcă progresiv prin HTTP Range,
calculează bounding box-ul și nu sortează/desenează date care nu au fost încă
urcate pe GPU. Dacă modelul lipsește sau încărcarea eșuează, aplicația revine la
norul de puncte.

Potree-Net folosește acum rendererul WebGPU nativ propriu, separat de pass-ul
Gaussian experimental din snapshot-ul Potree-Next. Rendererul a fost validat pe
macOS cu un fixture sintetic și cu modelul local de 432.402 splaturi. Testul minim
cu pixel readback este disponibil la:

```text
http://127.0.0.1:8080/gaussian-native-smoke.html?count=25
```

Parametrul opțional `splatPixelScale` controlează conversia temporară a razelor PLY
în pixeli (implicit `1000`). Implementarea curentă oferă quads instanțiate,
distribuție Gaussian și alpha premultiplicat. Rotația/covarianța 3D, proiecția
metrică a razei și sortarea după adâncime rămân etapa următoare; norul metric și
digitizarea nu depind de acestea.

## Dataset local și 3Dsurvey 3DP

Fișierele mari rămân în afara Git. Manifestul versionabil este
`config/data-assets.example.json`; căile locale se furnizează prin mediu:

```bash
export POTREE_NET_CORNU_3DP="$HOME/Desktop/11-CORNU_PROBE/11-CORNU.3Dp"
export POTREE_NET_CORNU_OCTREE="$PWD/resources/pointclouds/11-CORNU"
node tools/benchmarks/data-assets.mjs cornuOctree cornu3dp --hash
```

Proba read-only a containerului 3DP verifică blocurile MD5 atinse, citește schema
fără a încărca fișierul de 4 GB în memorie și inventariază `GeometryData`:

```bash
node tools/three-dp/three-dp-probe.mjs "$POTREE_NET_CORNU_3DP"
```

Payloadul complet 3DP nu este încă decodat. Proba confirmă formatul, integritatea
blocurilor, schema și existența tipurilor pentru layere, linii, cercuri, puncte și
măsurători.

Benchmarkul determinist pentru limita `uploaded-count` rulează astfel:

```bash
node tools/benchmarks/gaussian-uploaded-count.mjs --cases 1000 --iterations 100
```

## Teste

```bash
node --test tests/*.test.mjs
```

Suita acoperă contractul Stereo70, limitele reale ale norului, parserul Gaussian
PLY, batch/range loading, bounding box-ul Gaussian, rendererul nativ și readback-ul,
numărul sigur de splaturi GPU, proba 3DP, manifestul local-safe, plasarea Stereo70
și modurile Points/Splats/Hybrid.

## Convenția Stereo 70

- intern și DXF: `X = Est`, `Y = Nord`, `Z = Cotă`;
- afișare în interfață: `Nord, Est, Cotă`;
- exportul DXF păstrează precizia internă și scrie coordonatele cu trei zecimale.

## Scurtături

- `P`: punct;
- `L`: linie;
- `C`: închide linia;
- `U`: undo;
- `T`: aplică un cod selecției;
- `I`: selectează entitățile cu același cod;
- `J`: join;
- `O`: offset;
- `V`: adaugă vârf;
- `Esc`: stop;
- `W/A/S/D`, `Q/E`, `Shift`: navigare.

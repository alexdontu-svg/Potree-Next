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

Rendererul Gaussian din snapshot-ul Potree-Next rămâne experimental: parserul,
streamingul, sortarea și controlul straturilor sunt integrate, dar imaginea finală
Gaussian nu este încă validată pe configurația macOS/WebGPU curentă. Norul metric
și digitizarea nu depind de acest strat experimental.

## Teste

```bash
node --test tests/*.test.mjs
```

Suita acoperă contractul Stereo70, limitele reale ale norului, parserul Gaussian
PLY, batch/range loading, bounding box-ul Gaussian, numărul sigur de splaturi GPU,
plasarea Stereo70 și modurile Points/Splats/Hybrid.

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

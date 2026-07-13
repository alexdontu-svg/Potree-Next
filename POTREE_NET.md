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

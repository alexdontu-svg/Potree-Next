# Milestone agentic Potree-Net — 15 iulie 2026

Fereastra de lucru a fost limitată la maximum șase ore. Cele zece livrabile
imediate au fost închise prin TDD și verificare pe date locale, fără includerea
fișierelor mari în Git.

1. Baseline fixat: 38/38 teste inițiale și worktree auditat.
2. Fixture Gaussian determinist pentru 1–100 splaturi.
3. Renderer WebGPU nativ: quad instanțiat, Gaussian fragment și alpha premultiplicat.
4. Readback GPU în același command buffer; pixelul central real a fost
   `RGBA 254,38,13,255`.
5. Integrare `POINTS / SPLATS / HYBRID` cu un canvas transparent și camera Potree.
6. Benchmark `uploaded-count`: 100.000 operații, zero depășiri ale limitelor.
7. Probe 3DP read-only: magic, versiune, blocuri, checksum și schemă.
8. Inventar `GeometryData`: layere, linii, cercuri, puncte și măsurători;
   payloadul mare rămâne intenționat nedecodat în această etapă.
9. Manifest CORNU local-safe, verificat pe 145.591.927 puncte și fișierul 3DP de
   4.067.222.306 bytes cu SHA-256 versionat.
10. Suită completă, verificare sintactică, browser WebGPU real și documentație.

## Verificare vizuală

- fixture sintetic: 25 splaturi vizibile, fără erori WebGPU;
- model local `gardentable.ply`: 432.402 splaturi vizibile în Potree-Net;
- comutarea `SPLATS → HYBRID → POINTS` funcționează;
- norul CORNU și digitizarea rămân active.

## Limită asumată

Rendererul actual demonstrează controlul complet al pipeline-ului WebGPU și
afișarea datelor reale. Pentru fidelitate Gaussian Splatting completă urmează
covarianța 3D, rotația quaternion, proiecția metrică a elipsei și sortarea după
adâncime. Modelul de grădină este o probă vizuală locală și nu este georeferențiat
în Stereo 70 peste CORNU.

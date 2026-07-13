import {EventDispatcher, Potree, Vector3, Vector4} from "potree";

const LINE_CODES = [
	"AX", "DRUM_ASFALT", "DRUM_BALAST", "LIMITA_PROPRIETATE", "PLATFORMA",
	"RIGOLA", "SANT_PAMANT", "POD", "TIMPAN", "PARAPET_METALIC", "ACCES_BETON", "ACCES",
];

const POINT_CODES = [
	"POM", "C.APA", "HIDRANT", "ST_BET", "CAMIN", "GAZ", "COTA", "LIMITA",
	"SEMN-CIRCULATIE", "STALP", "GURA-SCURGERE", "BORNA-KM",
];

const PRESETS = [
	["AX", "line", "Ax"],
	["LIMITA_PROPRIETATE", "line", "Limită"],
	["DRUM_ASFALT", "line", "Asfalt"],
	["DRUM_BALAST", "line", "Balast"],
	["RIGOLA", "line", "Riglă/Rigolă"],
	["ACCES_BETON", "line", "Acces beton"],
	["ST_BET", "point", "Stâlp beton"],
	["CAMIN", "point", "Cămin"],
	["POM", "point", "Pom"],
	["GAZ", "point", "Gaz"],
	["COTA", "point", "Cotă"],
	["LIMITA", "point", "Punct limită"],
];

const ACI_COLORS = {
	LIMITA_PROPRIETATE: 3,
	PLATFORMA: 7,
	PARAPET_METALIC: 250,
	SIMBOL: 6,
	DRUM_BALAST: 42,
	DRUM_ASFALT: 251,
	TIMPAN: 18,
	POINT_NAMES: 3,
	POINT_HEIGHTS: 1,
	POINT_CODES: 5,
	AX: 1,
	POD: 5,
	SANT_PAMANT: 92,
	RIGOLA: 140,
	ACCES_BETON: 253,
	ACCES: 34,
};

const COLORS = {
	AX: [255, 55, 55],
	LIMITA_PROPRIETATE: [0, 230, 118],
	POD: [68, 136, 255],
	PLATFORMA: [255, 255, 255],
	TIMPAN: [76, 76, 255],
	DRUM_BALAST: [212, 177, 6],
	DRUM_ASFALT: [185, 185, 185],
	PARAPET_METALIC: [189, 189, 189],
	SANT_PAMANT: [0, 191, 95],
	RIGOLA: [0, 165, 191],
	POM: [0, 200, 83],
	"C.APA": [41, 182, 246],
	HIDRANT: [255, 82, 82],
	ST_BET: [255, 213, 79],
	CAMIN: [179, 157, 219],
	GAZ: [255, 179, 0],
	COTA: [255, 110, 110],
	LIMITA: [0, 230, 118],
	ACCES_BETON: [218, 218, 218],
	ACCES: [200, 161, 101],
};

function colorFor(code){
	let known = COLORS[code];
	if(known){
		return new Vector3(...known);
	}

	let hash = 0;
	for(let character of code){
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}

	return new Vector3(80 + hash % 176, 80 + (hash >>> 8) % 176, 80 + (hash >>> 16) % 176);
}

function distance2D(a, b){
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment2D(point, start, end){
	let dx = end.x - start.x;
	let dy = end.y - start.y;
	let denominator = dx * dx + dy * dy;
	let t = denominator === 0 ? 0 : ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator;
	t = Math.max(0, Math.min(1, t));

	return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function distanceToEntity2D(point, entity){
	if(entity.type === "point"){
		return distance2D(point, entity.points[0]);
	}

	let count = entity.closed ? entity.points.length : entity.points.length - 1;
	let best = Infinity;
	for(let i = 0; i < count; i++){
		best = Math.min(best, distanceToSegment2D(point, entity.points[i], entity.points[(i + 1) % entity.points.length]));
	}

	return best;
}

function offsetPoints(points, distance, closed){
	return points.map((point, index) => {
		let previous = points[index === 0 ? (closed ? points.length - 1 : 0) : index - 1];
		let next = points[index === points.length - 1 ? (closed ? 0 : points.length - 1) : index + 1];
		let dx = next.x - previous.x;
		let dy = next.y - previous.y;
		let length = Math.hypot(dx, dy) || 1;

		return new Vector3(point.x - dy / length * distance, point.y + dx / length * distance, point.z);
	});
}

function safeCode(value){
	return String(value ?? "FARA_COD").trim() || "FARA_COD";
}

export class Digitizer{

	constructor(potree, options = {}){
		this.potree = potree;
		this.canvas = potree.renderer.canvas;
		this.projectName = options.projectName ?? "desen";
		this.entities = [];
		this.selectedIds = new Set();
		this.mode = null;
		this.activeLine = null;
		this.hoverPosition = null;
		this.nextId = 1;
		this.keys = new Set();
		this.lastFrame = performance.now();

		this.dispatcher = new EventDispatcher();
		this.dispatcher.importance = 100;
		this.dispatcher.add("mousemove", event => this.onMouseMove(event));
		this.dispatcher.add("mouseup", event => this.onMouseUp(event));
		potree.inputHandler.addInputListener(this.dispatcher);

		this.panel = this.createPanel(options.container ?? document.body);
		this.onKeyDown = this.onKeyDown.bind(this);
		this.onKeyUp = this.onKeyUp.bind(this);
		window.addEventListener("keydown", this.onKeyDown);
		window.addEventListener("keyup", this.onKeyUp);
		potree.onUpdate(() => this.update());

		this.setStatus("Pregătit. P = punct, L = linie, click = selectare.");
	}

	createPanel(container){
		let style = document.createElement("style");
		style.textContent = `
			#digitizer-panel{position:absolute;top:12px;right:12px;z-index:20;width:290px;
				box-sizing:border-box;padding:13px;border:1px solid #364252;border-radius:10px;
				background:rgba(16,21,28,.94);color:#edf2f7;font:13px Inter,Segoe UI,sans-serif;
				box-shadow:0 14px 40px rgba(0,0,0,.36);backdrop-filter:blur(8px)}
			#digitizer-panel *{box-sizing:border-box}#digitizer-panel h1{font-size:15px;margin:0 0 3px}
			#digitizer-panel .subtitle{font-size:11px;color:#91a0b3;margin-bottom:10px}
			#digitizer-panel .tools{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:9px}
			#digitizer-panel button{border:1px solid #3d4b5e;border-radius:6px;background:#26313e;color:#eaf0f6;
				padding:6px;cursor:pointer;font:inherit}#digitizer-panel button:hover{background:#344357}
			#digitizer-panel button.active{border-color:#4fc98c;background:#173c2c;color:#bff5d9}
			#digitizer-panel .preset{height:49px;padding:4px;font-size:10px;line-height:1.15}
			#digitizer-panel label{display:block;color:#9aa8b8;font-size:11px;margin-bottom:3px}
			#digitizer-panel input,#digitizer-panel select{width:100%;border:1px solid #3d4b5e;border-radius:6px;
				background:#10161d;color:#edf2f7;padding:6px;margin-bottom:8px}
			#digitizer-panel .row{display:flex;gap:6px;align-items:center}.row>*{flex:1}
			#digitizer-panel .compact{flex:0 0 70px!important}.checks{display:flex;gap:10px;margin:2px 0 8px}
			#digitizer-panel .checks label{display:flex;align-items:center;gap:4px;margin:0}.checks input{width:auto;margin:0}
			#digitizer-status{margin-top:8px;padding-top:8px;border-top:1px solid #34404f;color:#aeb9c6;
				font-size:11px;line-height:1.35;min-height:38px}#digitizer-count{color:#6ed5a0}
		`;
		document.head.append(style);

		let panel = document.createElement("section");
		panel.id = "digitizer-panel";
		panel.innerHTML = `
			<h1>POTREE-NET · DIGITIZARE</h1>
			<div class="subtitle">Stereo 70 · X=Est, Y=Nord, Z=Cotă</div>
			<div class="tools" id="digitizer-presets">
				${PRESETS.map(([code, type, label], index) => `<button class="preset" data-index="${index}"
					title="${type === "point" ? "Punct" : "Linie"}: ${code}">${label}</button>`).join("")}
			</div>
			<label for="digitizer-code">Cod / layer</label>
			<input id="digitizer-code" list="digitizer-codes" value="DRUM_BALAST">
			<datalist id="digitizer-codes">${[...LINE_CODES, ...POINT_CODES].map(code => `<option value="${code}">`).join("")}</datalist>
			<div class="row">
				<button id="digitizer-point">● Punct <b>P</b></button>
				<button id="digitizer-line">╱ Linie <b>L</b></button>
				<button id="digitizer-stop">Stop <b>Esc</b></button>
			</div>
			<div class="checks">
				<label><input id="digitizer-snap" type="checkbox" checked> snap</label>
				<label>Toleranță <input id="digitizer-tolerance" type="number" value="0.30" min="0.01" step="0.05" style="width:62px"> m</label>
			</div>
			<div class="row">
				<button id="digitizer-close">Închide <b>C</b></button>
				<button id="digitizer-undo">Undo <b>U</b></button>
				<button id="digitizer-delete">Șterge</button>
			</div>
			<div class="row">
				<button id="digitizer-code-apply">Aplică cod <b>T</b></button>
				<button id="digitizer-join">Join <b>J</b></button>
				<button id="digitizer-offset">Offset <b>O</b></button>
			</div>
			<div class="row">
				<button id="digitizer-similar">Similare <b>I</b></button>
				<button id="digitizer-vertex">Adaugă vârf <b>V</b></button>
			</div>
			<div class="row">
				<input id="digitizer-offset-value" class="compact" type="number" value="1.00" step="0.10" title="Offset semnat în metri">
				<button id="digitizer-save">JSON↓</button>
				<button id="digitizer-load">JSON↑</button>
				<button id="digitizer-dxf">Export DXF</button>
			</div>
			<input id="digitizer-file" type="file" accept=".json" hidden>
			<div id="digitizer-status"></div>
			<div id="digitizer-count">0 entități</div>
		`;
		container.append(panel);

		panel.querySelectorAll(".preset").forEach(button => button.addEventListener("click", () => {
			let [code, type] = PRESETS[Number(button.dataset.index)];
			this.codeInput.value = code;
			this.start(type);
		}));
		panel.querySelector("#digitizer-point").addEventListener("click", () => this.start("point"));
		panel.querySelector("#digitizer-line").addEventListener("click", () => this.start("line"));
		panel.querySelector("#digitizer-stop").addEventListener("click", () => this.stop());
		panel.querySelector("#digitizer-close").addEventListener("click", () => this.closeLine());
		panel.querySelector("#digitizer-undo").addEventListener("click", () => this.undo());
		panel.querySelector("#digitizer-delete").addEventListener("click", () => this.deleteSelection());
		panel.querySelector("#digitizer-code-apply").addEventListener("click", () => this.applyCode());
		panel.querySelector("#digitizer-join").addEventListener("click", () => this.joinSelected());
		panel.querySelector("#digitizer-offset").addEventListener("click", () => this.offsetSelected());
		panel.querySelector("#digitizer-similar").addEventListener("click", () => this.selectSimilar());
		panel.querySelector("#digitizer-vertex").addEventListener("click", () => this.startVertex());
		panel.querySelector("#digitizer-save").addEventListener("click", () => this.saveJson());
		panel.querySelector("#digitizer-load").addEventListener("click", () => this.fileInput.click());
		panel.querySelector("#digitizer-dxf").addEventListener("click", () => this.exportDxf());
		panel.querySelector("#digitizer-file").addEventListener("change", event => this.loadJson(event.target.files[0]));

		this.codeInput = panel.querySelector("#digitizer-code");
		this.snapInput = panel.querySelector("#digitizer-snap");
		this.toleranceInput = panel.querySelector("#digitizer-tolerance");
		this.offsetInput = panel.querySelector("#digitizer-offset-value");
		this.statusElement = panel.querySelector("#digitizer-status");
		this.countElement = panel.querySelector("#digitizer-count");
		this.fileInput = panel.querySelector("#digitizer-file");

		return panel;
	}

	get code(){
		return safeCode(this.codeInput.value);
	}

	get tolerance(){
		return Number(this.toleranceInput.value) || 0.30;
	}

	setStatus(message){
		this.statusElement.textContent = message;
		this.countElement.textContent = `${this.entities.length} entități · ${this.selectedIds.size} selectate`;
	}

	start(mode){
		this.finishLine();
		this.mode = mode;
		this.selectedIds.clear();
		this.panel.querySelectorAll("button.active").forEach(button => button.classList.remove("active"));
		this.panel.querySelector(`#digitizer-${mode}`).classList.add("active");
		this.setStatus(mode === "point"
			? `Punct '${this.code}' continuu: click pe nor, Esc pentru stop.`
			: `Linie '${this.code}': click pe vârfuri, click dreapta pentru final.`);
	}

	stop(){
		this.finishLine();
		this.mode = null;
		this.hoverPosition = null;
		this.panel.querySelectorAll("button.active").forEach(button => button.classList.remove("active"));
		this.setStatus("Oprit. Click pe o entitate pentru selectare.");
	}

	finishLine(){
		if(this.activeLine && this.activeLine.points.length < 2){
			this.entities = this.entities.filter(entity => entity !== this.activeLine);
		}
		this.activeLine = null;
	}

	closeLine(){
		let line = this.activeLine ?? this.selected().find(entity => entity.type === "line");
		if(!line || line.points.length < 3){
			this.setStatus("Închiderea necesită o linie activă cu minimum 3 vârfuri.");
			return;
		}

		line.closed = true;
		this.activeLine = null;
		this.mode = null;
		this.setStatus("Polilinie închisă.");
	}

	onMouseMove(event){
		if(!this.mode){
			return;
		}

		let {x, y} = event.mouse;
		Potree.pick(x, y, result => {
			if(Potree.hoveredItem?.position){
				this.hoverPosition = this.snap(Potree.hoveredItem.position.clone());
			}else if(Number.isFinite(result.distance) && result.position?.isFinite()){
				this.hoverPosition = this.snap(result.position.clone());
			}
		});
	}

	onMouseUp(event){
		if(event.event.button === 2 && this.mode === "line"){
			this.finishLine();
			this.mode = null;
			this.setStatus("Linie terminată.");
			event.consume();
			return;
		}

		if(event.event.button !== 0){
			return;
		}

		let {x, y} = event.mouse;
		Potree.pick(x, y, () => {
			let position = Potree.hoveredItem?.position?.clone();
			if(!position){
				this.setStatus("Nu am prins un punct din nor sub cursor.");
				return;
			}

			position = this.snap(position);
			if(this.mode === "point"){
				this.addEntity("point", this.code, [position]);
				this.setStatus(`Punct '${this.code}' · Nord ${position.y.toFixed(3)}, Est ${position.x.toFixed(3)}, Cotă ${position.z.toFixed(3)}`);
			}else if(this.mode === "line"){
				if(!this.activeLine){
					this.activeLine = this.addEntity("line", this.code, []);
				}
				this.activeLine.points.push(position);
				this.setStatus(`Linie '${this.activeLine.code}': ${this.activeLine.points.length} vârfuri.`);
			}else if(this.mode === "vertex"){
				this.insertVertex(position);
			}else{
				this.selectNearest(position, event.event.shiftKey);
			}
		});

		if(this.mode){
			event.consume();
		}
	}

	addEntity(type, code, points, closed = false){
		let entity = {id: this.nextId++, type, code: safeCode(code), points, closed};
		this.entities.push(entity);
		return entity;
	}

	snap(position){
		if(!this.snapInput.checked){
			return position;
		}

		let best = null;
		let bestDistance = this.tolerance;
		for(let entity of this.entities){
			for(let point of entity.points){
				let distance = position.distanceTo(point);
				if(distance > 0.001 && distance < bestDistance){
					best = point;
					bestDistance = distance;
				}
			}
		}

		return best ? best.clone() : position;
	}

	selectNearest(position, additive = false){
		let threshold = Math.max(this.tolerance, this.potree.controls.radius / 150);
		let nearest = null;
		let bestDistance = threshold;

		for(let entity of this.entities){
			let distance = distanceToEntity2D(position, entity);
			if(distance < bestDistance){
				bestDistance = distance;
				nearest = entity;
			}
		}

		if(!additive){
			this.selectedIds.clear();
		}
		if(nearest){
			this.selectedIds.add(nearest.id);
			this.setStatus(`Selectat '${nearest.code}' · ${nearest.points.length} vârfuri.`);
		}else{
			this.setStatus("Nicio entitate suficient de aproape.");
		}
	}

	selected(){
		return this.entities.filter(entity => this.selectedIds.has(entity.id));
	}

	selectSimilar(){
		let selected = this.selected();
		if(!selected.length){
			this.setStatus("Selectează mai întâi o entitate.");
			return;
		}

		let code = selected[0].code;
		for(let entity of this.entities){
			if(entity.code === code) this.selectedIds.add(entity.id);
		}
		this.setStatus(`${this.selectedIds.size} entități similare cu codul '${code}' selectate.`);
	}

	startVertex(){
		this.finishLine();
		this.mode = "vertex";
		this.setStatus("Adaugă vârf: click pe nor în apropierea liniei selectate.");
	}

	insertVertex(position){
		let lines = this.selected().filter(entity => entity.type === "line");
		let line = lines.length === 1 ? lines[0] : null;
		if(!line){
			let threshold = Math.max(15, this.potree.controls.radius / 100);
			line = this.entities.filter(entity => entity.type === "line")
				.map(entity => ({entity, distance: distanceToEntity2D(position, entity)}))
				.filter(candidate => candidate.distance < threshold)
				.sort((a, b) => a.distance - b.distance)[0]?.entity;
		}
		if(!line){
			this.setStatus("Nicio linie găsită lângă punctul ales.");
			return;
		}

		let segmentCount = line.closed ? line.points.length : line.points.length - 1;
		let bestIndex = 0;
		let bestDistance = Infinity;
		for(let i = 0; i < segmentCount; i++){
			let distance = distanceToSegment2D(position, line.points[i], line.points[(i + 1) % line.points.length]);
			if(distance < bestDistance){
				bestDistance = distance;
				bestIndex = i;
			}
		}
		line.points.splice(bestIndex + 1, 0, position);
		this.selectedIds = new Set([line.id]);
		this.mode = null;
		this.setStatus(`Vârf adăugat pe '${line.code}' la cota ${position.z.toFixed(3)} m.`);
	}

	undo(){
		if(this.activeLine?.points.length){
			this.activeLine.points.pop();
			if(this.activeLine.points.length === 0){
				this.entities = this.entities.filter(entity => entity !== this.activeLine);
				this.activeLine = null;
			}
			this.setStatus("Ultimul vârf a fost șters.");
			return;
		}

		if(this.entities.length){
			let removed = this.entities.pop();
			this.selectedIds.delete(removed.id);
			this.setStatus(`Entitatea '${removed.code}' a fost ștearsă.`);
		}
	}

	deleteSelection(){
		if(!this.selectedIds.size){
			this.undo();
			return;
		}

		let count = this.selectedIds.size;
		this.entities = this.entities.filter(entity => !this.selectedIds.has(entity.id));
		this.selectedIds.clear();
		this.setStatus(`${count} entități șterse.`);
	}

	applyCode(){
		let selected = this.selected();
		if(!selected.length){
			this.setStatus("Selectează una sau mai multe entități înainte de schimbarea codului.");
			return;
		}

		for(let entity of selected){
			entity.code = this.code;
		}
		this.setStatus(`${selected.length} entități au primit codul '${this.code}'.`);
	}

	joinSelected(){
		let selected = this.selected().filter(entity => entity.type === "line" && !entity.closed);
		if(selected.length !== 1){
			this.setStatus("Pentru Join selectează o singură linie deschisă.");
			return;
		}

		let source = selected[0];
		let candidates = this.entities.filter(entity => entity !== source && entity.type === "line"
			&& !entity.closed && entity.code === source.code);
		let chain = source.points.map(point => point.clone());
		let used = [source];
		let extended = true;
		let equal = (a, b) => a.distanceTo(b) <= this.tolerance;

		while(extended){
			extended = false;
			for(let candidate of candidates){
				if(used.includes(candidate)) continue;
				let points = candidate.points.map(point => point.clone());
				let first = chain[0];
				let last = chain[chain.length - 1];
				if(equal(points[0], last)) chain.push(...points.slice(1));
				else if(equal(points[points.length - 1], last)) chain.push(...points.reverse().slice(1));
				else if(equal(points[points.length - 1], first)) chain = points.slice(0, -1).concat(chain);
				else if(equal(points[0], first)) chain = points.reverse().slice(0, -1).concat(chain);
				else continue;
				used.push(candidate);
				extended = true;
			}
		}

		if(used.length === 1){
			this.setStatus(`Nicio altă linie '${source.code}' nu atinge selecția în toleranța ${this.tolerance} m.`);
			return;
		}

		let closed = chain.length > 3 && equal(chain[0], chain[chain.length - 1]);
		if(closed) chain.pop();
		this.entities = this.entities.filter(entity => !used.includes(entity));
		let joined = this.addEntity("line", source.code, chain, closed);
		this.selectedIds = new Set([joined.id]);
		this.setStatus(`Join: ${used.length} linii → una cu ${chain.length} vârfuri.`);
	}

	offsetSelected(){
		let selected = this.selected().filter(entity => entity.type === "line");
		let distance = Number(this.offsetInput.value);
		if(selected.length !== 1 || !Number.isFinite(distance) || Math.abs(distance) < 0.001){
			this.setStatus("Pentru Offset selectează o linie și introdu o distanță semnată nenulă.");
			return;
		}

		let source = selected[0];
		let offset = this.addEntity("line", this.code, offsetPoints(source.points, distance, source.closed), source.closed);
		this.selectedIds = new Set([offset.id]);
		this.setStatus(`Offset ${distance.toFixed(3)} m creat pe layer '${offset.code}'. Cotele au fost copiate de pe sursă.`);
	}

	onKeyDown(event){
		if(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement){
			return;
		}

		this.keys.add(event.code);
		let key = event.key.toLowerCase();
		if(key === "p") this.start("point");
		else if(key === "l") this.start("line");
		else if(key === "c") this.closeLine();
		else if(key === "u") this.undo();
		else if(key === "t") this.applyCode();
		else if(key === "j") this.joinSelected();
		else if(key === "o") this.offsetSelected();
		else if(key === "i") this.selectSimilar();
		else if(key === "v") this.startVertex();
		else if(event.key === "Escape") this.stop();
		else if(event.key === "Delete" || event.key === "Backspace") this.deleteSelection();
		else if(/^[1-9]$/.test(event.key)){
			let preset = PRESETS[Number(event.key) - 1];
			if(preset){
				this.codeInput.value = preset[0];
				this.setStatus(`Cod curent: '${preset[0]}'.`);
			}
		}else{
			return;
		}
		event.preventDefault();
	}

	onKeyUp(event){
		this.keys.delete(event.code);
	}

	update(){
		let now = performance.now();
		let delta = Math.min((now - this.lastFrame) / 1000, 0.1);
		this.lastFrame = now;
		this.updateFlight(delta);
		this.render();
	}

	updateFlight(delta){
		if(![...this.keys].some(key => ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"].includes(key))){
			return;
		}

		let speed = Math.max(0.5, this.potree.controls.radius * 0.7) * delta;
		if(this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) speed *= 3;
		let x = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
		let y = (this.keys.has("KeyQ") ? 1 : 0) - (this.keys.has("KeyE") ? 1 : 0);
		let z = (this.keys.has("KeyS") ? 1 : 0) - (this.keys.has("KeyW") ? 1 : 0);
		this.potree.controls.translate_local(x * speed, y * speed, z * speed);
	}

	render(){
		let cameraPosition = this.potree.camera.getWorldPosition();
		for(let entity of this.entities){
			let selected = this.selectedIds.has(entity.id);
			let color = selected ? new Vector3(255, 225, 0) : colorFor(entity.code);
			for(let point of entity.points){
				let radius = Math.max(0.03, cameraPosition.distanceTo(point) / 260);
				this.potree.renderer.drawSphere(point, radius, {color: new Vector4(color.x / 255, color.y / 255, color.z / 255, 1)});
			}
			if(entity.type === "line"){
				for(let i = 1; i < entity.points.length; i++){
					this.potree.renderer.drawLine(entity.points[i - 1], entity.points[i], color);
				}
				if(entity.closed && entity.points.length > 2){
					this.potree.renderer.drawLine(entity.points[entity.points.length - 1], entity.points[0], color);
				}
			}
		}

		if(this.mode === "line" && this.activeLine?.points.length && this.hoverPosition){
			this.potree.renderer.drawLine(this.activeLine.points[this.activeLine.points.length - 1], this.hoverPosition, new Vector3(255, 255, 0));
		}
	}

	serialize(){
		let points = [];
		let lines = [];
		for(let entity of this.entities){
			let coordinates = entity.points.map(point => [point.x, point.y, point.z]);
			if(entity.type === "point") points.push({cod: entity.code, p: coordinates[0]});
			else lines.push({cod: entity.code, pts: coordinates, closed: entity.closed});
		}
		return {puncte: points, linii: lines};
	}

	saveJson(){
		this.download(JSON.stringify(this.serialize(), null, 2), `${this.projectName}_sesiune.json`, "application/json");
		this.setStatus("Sesiunea JSON a fost salvată.");
	}

	loadJson(file){
		if(!file) return;
		let reader = new FileReader();
		reader.onload = () => {
			try{
				let data = JSON.parse(reader.result);
				for(let point of data.puncte ?? []) this.addEntity("point", point.cod, [new Vector3(...point.p)]);
				for(let line of data.linii ?? []) this.addEntity("line", line.cod, line.pts.map(point => new Vector3(...point)), Boolean(line.closed));
				this.setStatus(`Încărcat: ${(data.puncte ?? []).length} puncte, ${(data.linii ?? []).length} linii.`);
			}catch(error){
				this.setStatus(`JSON invalid: ${error.message}`);
			}
		};
		reader.readAsText(file);
		this.fileInput.value = "";
	}

	exportDxf(){
		let data = this.serialize();
		if(!data.puncte.length && !data.linii.length){
			this.setStatus("Nu există entități pentru export.");
			return;
		}

		let layers = new Set(["SIMBOL", "POINT_NAMES", "POINT_HEIGHTS", "POINT_CODES"]);
		for(let line of data.linii) layers.add(line.cod);
		let output = [];
		let push = (...values) => output.push(...values);
		let number = value => Number(value).toFixed(3);
		push("0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(layers.size));
		for(let layer of layers) push("0", "LAYER", "2", layer, "70", "0", "62", String(ACI_COLORS[layer] ?? 7), "6", "CONTINUOUS");
		push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");

		for(let line of data.linii){
			push("0", "POLYLINE", "8", line.cod, "66", "1", "70", line.closed ? "9" : "8");
			for(let [east, north, elevation] of line.pts){
				push("0", "VERTEX", "8", line.cod, "10", number(east), "20", number(north), "30", number(elevation), "70", "32");
			}
			push("0", "SEQEND", "8", line.cod);
		}

		let index = 1;
		for(let point of data.puncte){
			let [east, north, elevation] = point.p;
			push("0", "POINT", "8", "SIMBOL", "10", number(east), "20", number(north), "30", number(elevation));
			push("0", "TEXT", "8", "POINT_NAMES", "10", number(east + 0.2), "20", number(north), "30", number(elevation), "40", "0.2", "1", String(index));
			push("0", "TEXT", "8", "POINT_HEIGHTS", "10", number(east + 0.2), "20", number(north - 0.4), "30", number(elevation), "40", "0.2", "1", Number(elevation).toFixed(2));
			push("0", "TEXT", "8", "POINT_CODES", "10", number(east + 0.2), "20", number(north - 0.8), "30", number(elevation), "40", "0.2", "1", point.cod);
			index++;
		}

		push("0", "ENDSEC", "0", "EOF", "");
		this.download(output.join("\r\n"), `${this.projectName}_desenat.dxf`, "application/dxf");
		this.setStatus(`DXF Stereo 70: ${data.puncte.length} puncte, ${data.linii.length} linii. X=Est, Y=Nord.`);
	}

	download(text, filename, type){
		let anchor = document.createElement("a");
		anchor.href = URL.createObjectURL(new Blob([text], {type}));
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
	}

}

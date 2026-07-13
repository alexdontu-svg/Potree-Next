function parseFiniteNumber(value, label){
	if(typeof value !== "string" || value.trim() === ""){
		throw new TypeError(`${label} trebuie să fie un număr finit`, {cause: value});
	}

	const parsed = Number(value);
	if(!Number.isFinite(parsed)){
		throw new TypeError(`${label} trebuie să fie un număr finit`, {cause: value});
	}

	return parsed;
}

export function parseSplatPlacement(params){
	if(!params || typeof params.get !== "function" || typeof params.has !== "function"){
		throw new TypeError("Parametrii splat trebuie furnizați ca URLSearchParams");
	}

	let position = null;
	if(params.has("splatPosition")){
		const rawPosition = params.get("splatPosition");
		const components = rawPosition.split(",");
		if(components.length !== 3){
			throw new TypeError(
				"splatPosition trebuie să respecte formatul Est,Nord,Cota",
				{cause: rawPosition},
			);
		}

		try{
			position = components.map(component =>
				parseFiniteNumber(component, "Fiecare coordonată splatPosition")
			);
		}catch{
			throw new TypeError(
				"splatPosition trebuie să conțină coordonate finite Est,Nord,Cota",
				{cause: rawPosition},
			);
		}
	}

	let scale = 1;
	if(params.has("splatScale")){
		const rawScale = params.get("splatScale");
		scale = parseFiniteNumber(rawScale, "splatScale");
		if(scale <= 0){
			throw new RangeError("splatScale trebuie să fie strict pozitiv", {cause: rawScale});
		}
	}

	return {position, scale};
}

export function applySplatPlacement(splat, placement){
	if(!splat?.position?.set || !splat?.scale?.set || !splat?.updateWorld){
		throw new TypeError("Nodul Gaussian nu oferă API-ul de transformare necesar");
	}

	const {position = null, scale = 1} = placement ?? {};
	if(position !== null){
		if(!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)){
			throw new TypeError("Poziția Gaussian trebuie să conțină trei coordonate finite");
		}
		splat.position.set(...position);
	}

	if(!Number.isFinite(scale) || scale <= 0){
		throw new RangeError("Scara Gaussian trebuie să fie finită și strict pozitivă");
	}
	splat.scale.set(scale, scale, scale);
	splat.updateWorld();

	return splat;
}

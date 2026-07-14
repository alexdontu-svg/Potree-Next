export const HybridLayerMode = Object.freeze({
	POINTS: "POINTS",
	SPLATS: "SPLATS",
	HYBRID: "HYBRID",
});

const VALID_MODES = new Set(Object.values(HybridLayerMode));

export class HybridLayerController{
	constructor({
		pointcloud = null,
		splat = null,
		mode = HybridLayerMode.POINTS,
		onChange = null,
	} = {}){
		this.pointcloud = pointcloud;
		this.splat = splat;
		this.requestedMode = this.#validateMode(mode);
		this.onChange = onChange;
		this.#apply();
	}

	setMode(mode){
		this.requestedMode = this.#validateMode(mode);
		return this.#apply();
	}

	setPointcloud(pointcloud){
		if(this.pointcloud && this.pointcloud !== pointcloud){
			this.pointcloud.visible = false;
		}

		this.pointcloud = pointcloud;
		return this.#apply();
	}

	setSplat(splat){
		if(this.splat && this.splat !== splat){
			this.splat.visible = false;
		}

		this.splat = splat;
		return this.#apply();
	}

	getState(){
		const effectiveMode = this.#effectiveMode();
		return {
			requestedMode: this.requestedMode,
			effectiveMode,
			hasPointcloud: Boolean(this.pointcloud),
			hasSplat: Boolean(this.splat),
			status: this.#status(effectiveMode),
		};
	}

	#validateMode(mode){
		if(!VALID_MODES.has(mode)){
			throw new RangeError(`Mod hibrid necunoscut: ${mode}`);
		}

		return mode;
	}

	#effectiveMode(){
		const hasPointcloud = Boolean(this.pointcloud);
		const hasSplat = Boolean(this.splat);

		if(this.requestedMode === HybridLayerMode.HYBRID){
			if(hasPointcloud && hasSplat) return HybridLayerMode.HYBRID;
			if(hasPointcloud) return HybridLayerMode.POINTS;
			if(hasSplat) return HybridLayerMode.SPLATS;
		}else if(this.requestedMode === HybridLayerMode.POINTS){
			if(hasPointcloud) return HybridLayerMode.POINTS;
			if(hasSplat) return HybridLayerMode.SPLATS;
		}else{
			if(hasSplat) return HybridLayerMode.SPLATS;
			if(hasPointcloud) return HybridLayerMode.POINTS;
		}

		return null;
	}

	#status(effectiveMode){
		if(effectiveMode === null) return "Niciun strat 3D disponibil";
		if(effectiveMode === this.requestedMode) return `Mod ${effectiveMode}`;

		if(!this.splat && (
			this.requestedMode === HybridLayerMode.SPLATS ||
			this.requestedMode === HybridLayerMode.HYBRID
		)){
			return "Splats indisponibile · afișare POINTS";
		}

		return "Nor indisponibil · afișare SPLATS";
	}

	#apply(){
		const state = this.getState();
		if(this.pointcloud){
			this.pointcloud.visible = state.effectiveMode === HybridLayerMode.POINTS ||
				state.effectiveMode === HybridLayerMode.HYBRID;
		}
		if(this.splat){
			this.splat.visible = state.effectiveMode === HybridLayerMode.SPLATS ||
				state.effectiveMode === HybridLayerMode.HYBRID;
		}

		this.onChange?.({...state});
		return state;
	}
}

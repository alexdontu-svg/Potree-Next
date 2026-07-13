const NON_FINITE_POLICIES = new Set(["reject", "ignore"]);

export class GaussianBoundsAccumulator{

	constructor({nonFinite = "reject"} = {}){
		if(!NON_FINITE_POLICIES.has(nonFinite)){
			throw new TypeError(`Unknown non-finite Gaussian position policy: ${nonFinite}`);
		}

		this.nonFinite = nonFinite;
		this.min = [Infinity, Infinity, Infinity];
		this.max = [-Infinity, -Infinity, -Infinity];
		this.count = 0;
		this.rejectedCount = 0;
	}

	add(x, y, z, splatIndex = this.count + this.rejectedCount){
		if(!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)){
			this.rejectedCount++;
			if(this.nonFinite === "reject"){
				throw new RangeError(`Gaussian splat ${splatIndex} has a non-finite position (${x}, ${y}, ${z})`);
			}
			return false;
		}

		this.min[0] = Math.min(this.min[0], x);
		this.min[1] = Math.min(this.min[1], y);
		this.min[2] = Math.min(this.min[2], z);
		this.max[0] = Math.max(this.max[0], x);
		this.max[1] = Math.max(this.max[1], y);
		this.max[2] = Math.max(this.max[2], z);
		this.count++;
		return true;
	}

	addBatch(positions, {firstIndex = 0} = {}){
		if(positions == null || typeof positions.length !== "number"){
			throw new TypeError("Gaussian positions must be a flat array-like collection");
		}
		if(positions.length % 3 !== 0){
			throw new RangeError("Gaussian position batch length must be a multiple of 3");
		}
		if(!Number.isSafeInteger(firstIndex) || firstIndex < 0){
			throw new RangeError("firstIndex must be a non-negative integer");
		}

		for(let offset = 0; offset < positions.length; offset += 3){
			this.add(positions[offset], positions[offset + 1], positions[offset + 2], firstIndex + offset / 3);
		}

		return this;
	}

	snapshot(){
		const empty = this.count === 0;
		return {
			min: empty ? [0, 0, 0] : [...this.min],
			max: empty ? [0, 0, 0] : [...this.max],
			count: this.count,
			empty,
			rejectedCount: this.rejectedCount,
		};
	}
}

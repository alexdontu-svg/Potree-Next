#!/usr/bin/env node

import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {pathToFileURL} from "node:url";

import {resolveGaussianRenderCount} from "../../src/modules/gaussians/GaussianRenderCount.js";

function requirePositiveInteger(name, value){
	if(!Number.isSafeInteger(value) || value <= 0){
		throw new RangeError(`${name} must be a positive integer`);
	}
}

function requireSeed(seed){
	if(!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff){
		throw new RangeError("seed must be an unsigned 32-bit integer");
	}
}

function nextRandom(state){
	return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

export function buildUploadedCountCases({caseCount = 10_000, seed = 1970} = {}){
	requirePositiveInteger("caseCount", caseCount);
	requireSeed(seed);

	const cases = [];
	let state = seed >>> 0;

	for(let index = 0; index < caseCount; index++){
		state = nextRandom(state);
		const base = state % 2_000_001;
		state = nextRandom(state);
		const delta = 1 + (state % 100_000);

		if(index % 3 === 0){
			cases.push({numSplats: base, numSplatsUploaded: base});
		}else if(index % 3 === 1){
			cases.push({numSplats: base, numSplatsUploaded: base + delta});
		}else{
			cases.push({numSplats: base + delta, numSplatsUploaded: base});
		}
	}

	return cases;
}

export function runUploadedCountBenchmark({
	caseCount = 10_000,
	iterations = 100,
	seed = 1970,
	includeTiming = true,
} = {}){
	requirePositiveInteger("iterations", iterations);
	const cases = buildUploadedCountCases({caseCount, seed});
	const checksum = createHash("sha256");
	let renderCountSum = 0;
	let renderAboveUploaded = 0;
	let renderAboveCapacity = 0;

	const started = performance.now();
	for(let iteration = 0; iteration < iterations; iteration++){
		for(const {numSplats, numSplatsUploaded} of cases){
			const renderCount = resolveGaussianRenderCount(numSplats, numSplatsUploaded);
			renderCountSum += renderCount;
			renderAboveUploaded += Number(renderCount > numSplatsUploaded);
			renderAboveCapacity += Number(renderCount > numSplats);
			checksum.update(`${iteration}:${numSplats}:${numSplatsUploaded}:${renderCount}\n`);
		}
	}
	const elapsedMilliseconds = performance.now() - started;

	const result = {
		benchmark: "gaussian-uploaded-count",
		version: 1,
		seed,
		caseCount,
		iterations,
		operations: caseCount * iterations,
		renderCountSum,
		checksum: checksum.digest("hex"),
		invariants: {
			renderAboveUploaded,
			renderAboveCapacity,
		},
	};

	if(includeTiming){
		result.elapsedMilliseconds = elapsedMilliseconds;
		result.operationsPerSecond = elapsedMilliseconds === 0
			? null
			: result.operations / (elapsedMilliseconds / 1000);
	}

	return result;
}

function parseArguments(argv){
	const options = {};
	for(let index = 0; index < argv.length; index++){
		const argument = argv[index];
		if(argument === "--no-timing"){
			options.includeTiming = false;
		}else if(["--cases", "--iterations", "--seed"].includes(argument)){
			const value = Number(argv[++index]);
			const key = argument === "--cases" ? "caseCount" : argument.slice(2);
			options[key] = value;
		}else{
			throw new Error(`unknown argument: ${argument}`);
		}
	}
	return options;
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
	try{
		const result = runUploadedCountBenchmark(parseArguments(process.argv.slice(2)));
		console.log(JSON.stringify(result, null, 2));
		if(result.invariants.renderAboveUploaded || result.invariants.renderAboveCapacity){
			process.exitCode = 1;
		}
	}catch(error){
		console.error(error.message);
		process.exitCode = 1;
	}
}

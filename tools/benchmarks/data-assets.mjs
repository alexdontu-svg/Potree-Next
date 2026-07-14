#!/usr/bin/env node

import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {readFile, stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(moduleDirectory, "../..");

export function resolveAssetPath(descriptor, {repoRoot = defaultRepoRoot, env = process.env} = {}){
	const pathConfig = descriptor?.path;
	if(!pathConfig || typeof pathConfig !== "object"){
		throw new TypeError("asset descriptor must contain a path object");
	}

	if(pathConfig.env && env[pathConfig.env]){
		return path.resolve(env[pathConfig.env]);
	}
	if(pathConfig.repoRelative){
		return path.resolve(repoRoot, pathConfig.repoRelative);
	}

	const hint = pathConfig.env ? `set ${pathConfig.env}` : "configure path.env or path.repoRelative";
	throw new Error(`asset path is not configured; ${hint}`);
}

async function sha256File(assetPath){
	const hash = createHash("sha256");
	for await(const chunk of createReadStream(assetPath)){
		hash.update(chunk);
	}
	return hash.digest("hex");
}

export async function inspectAsset(assetPath, {hash = false, metadataFile} = {}){
	const absolutePath = path.resolve(assetPath);
	const details = await stat(absolutePath);
	const result = {
		path: absolutePath,
		type: details.isDirectory() ? "directory" : "file",
	};

	if(details.isFile()){
		result.sizeBytes = details.size;
		if(hash){
			result.sha256 = await sha256File(absolutePath);
		}
	}else if(details.isDirectory() && metadataFile){
		const metadataPath = path.join(absolutePath, metadataFile);
		const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
		if(Number.isSafeInteger(metadata.points)){
			result.points = metadata.points;
		}
		result.metadataPath = metadataPath;
	}

	return result;
}

export async function validateAsset(descriptor, assetPath, {hash = false} = {}){
	const expected = descriptor.expected ?? {};
	const shouldHash = hash && typeof expected.sha256 === "string";
	const inspection = await inspectAsset(assetPath, {
		hash: shouldHash,
		metadataFile: descriptor.metadataFile,
	});
	const errors = [];

	if(expected.sizeBytes !== undefined && inspection.sizeBytes !== expected.sizeBytes){
		errors.push(`sizeBytes: expected ${expected.sizeBytes}, got ${inspection.sizeBytes ?? "unavailable"}`);
	}
	if(expected.points !== undefined && inspection.points !== expected.points){
		errors.push(`points: expected ${expected.points}, got ${inspection.points ?? "unavailable"}`);
	}
	if(shouldHash && inspection.sha256 !== expected.sha256.toLowerCase()){
		errors.push(`sha256: expected ${expected.sha256.toLowerCase()}, got ${inspection.sha256}`);
	}

	return {ok: errors.length === 0, errors, inspection};
}

export async function loadAssetManifest(manifestPath){
	return JSON.parse(await readFile(path.resolve(manifestPath), "utf8"));
}

async function runCli(argv){
	let manifestPath = path.join(defaultRepoRoot, "config", "data-assets.example.json");
	let hash = false;
	const ids = [];

	for(let index = 0; index < argv.length; index++){
		if(argv[index] === "--manifest"){
			manifestPath = argv[++index];
		}else if(argv[index] === "--hash"){
			hash = true;
		}else{
			ids.push(argv[index]);
		}
	}

	const manifest = await loadAssetManifest(manifestPath);
	const selectedIds = ids.length ? ids : Object.keys(manifest.assets);
	const results = {};

	for(const id of selectedIds){
		const descriptor = manifest.assets[id];
		if(!descriptor){
			throw new Error(`unknown asset id: ${id}`);
		}
		const assetPath = resolveAssetPath(descriptor, {repoRoot: defaultRepoRoot});
		results[id] = await validateAsset(descriptor, assetPath, {hash});
	}

	console.log(JSON.stringify({manifest: path.resolve(manifestPath), hashVerified: hash, assets: results}, null, 2));
	if(Object.values(results).some(result => !result.ok)){
		process.exitCode = 1;
	}
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
	runCli(process.argv.slice(2)).catch(error => {
		console.error(error.message);
		process.exitCode = 1;
	});
}

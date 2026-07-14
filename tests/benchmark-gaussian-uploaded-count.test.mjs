import assert from "node:assert/strict";
import test from "node:test";

import {
	buildUploadedCountCases,
	runUploadedCountBenchmark,
} from "../tools/benchmarks/gaussian-uploaded-count.mjs";

test("uploaded-count cases are deterministic and exercise both limiting branches", () => {
	const first = buildUploadedCountCases({caseCount: 64, seed: 70});
	const second = buildUploadedCountCases({caseCount: 64, seed: 70});

	assert.deepEqual(first, second);
	assert.equal(first.length, 64);
	assert(first.some(({numSplats, numSplatsUploaded}) => numSplats < numSplatsUploaded));
	assert(first.some(({numSplats, numSplatsUploaded}) => numSplats > numSplatsUploaded));
	assert(first.some(({numSplats, numSplatsUploaded}) => numSplats === numSplatsUploaded));
});

test("benchmark reports a stable checksum and never renders above uploaded count", () => {
	const options = {caseCount: 128, iterations: 4, seed: 1970, includeTiming: false};
	const first = runUploadedCountBenchmark(options);
	const second = runUploadedCountBenchmark(options);

	assert.deepEqual(first, second);
	assert.equal(first.operations, 512);
	assert.equal(first.invariants.renderAboveUploaded, 0);
	assert.equal(first.invariants.renderAboveCapacity, 0);
	assert.match(first.checksum, /^[a-f0-9]{64}$/);
	assert.equal("elapsedMilliseconds" in first, false);
});

test("benchmark rejects invalid controls", () => {
	assert.throws(() => runUploadedCountBenchmark({caseCount: 0}), RangeError);
	assert.throws(() => runUploadedCountBenchmark({iterations: -1}), RangeError);
	assert.throws(() => runUploadedCountBenchmark({seed: 1.5}), RangeError);
});

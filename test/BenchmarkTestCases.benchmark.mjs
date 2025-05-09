"use strict";

import path from "path";
import fs from "fs/promises";
import { constants } from "fs";
import Benchmark from "benchmark";
import { remove } from "./helpers/remove.js";
import { dirname } from "path";
import { fileURLToPath } from "url";
import simpleGit from "simple-git";
import { withCodSpeed } from "@codspeed/benchmark.js-plugin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootPath = path.join(__dirname, "..");
const git = simpleGit(rootPath);

const REV_LIST_REGEXP = /^([a-f0-9]+)\s*([a-f0-9]+)\s*([a-f0-9]+)?\s*$/;

const getV8Flags = () => {
	const nodeVersionMajor = Number.parseInt(
		process.version.slice(1).split(".")[0]
	);
	const flags = [
		"--hash-seed=1",
		"--random-seed=1",
		"--no-opt",
		"--predictable",
		"--predictable-gc-schedule",
		"--interpreted-frames-native-stack",
		"--allow-natives-syntax",
		"--expose-gc",
		"--no-concurrent-sweeping",
		"--max-old-space-size=4096"
	];
	if (nodeVersionMajor < 18) {
		flags.push("--no-randomize-hashes");
	}
	if (nodeVersionMajor < 20) {
		flags.push("--no-scavenge-task");
	}
	return flags;
};

const checkV8Flags = () => {
	const requiredFlags = getV8Flags();
	const actualFlags = process.execArgv;
	const missingFlags = requiredFlags.filter(
		flag => !actualFlags.includes(flag)
	);
	if (missingFlags.length > 0) {
		console.warn(`Missing required flags: ${missingFlags.join(", ")}`);
	}
};

checkV8Flags();

const CODSPEED = typeof process.env.CODSPEED !== "undefined";

/**
 * @param {(string | undefined)[]} revList rev list
 * @returns {Promise<string>} head
 */
async function getHead(revList) {
	if (typeof process.env.HEAD !== "undefined") {
		return process.env.HEAD;
	}

	if (revList[3]) {
		return revList[3];
	}

	return revList[1];
}

/**
 * @param {(string | undefined)[]} revList rev list
 * @returns {Promise<string>} base
 */
async function getBase(revList) {
	if (typeof process.env.BASE !== "undefined") {
		return process.env.BASE;
	}

	if (revList[3]) {
		return revList[2];
	}

	const branchName = await git.raw(["rev-parse", "--abbrev-ref", "HEAD"]);

	if (branchName.trim() !== "main") {
		const resultParents = await git.raw([
			"rev-list",
			"--parents",
			"-n",
			"1",
			"main"
		]);

		const revList = REV_LIST_REGEXP.exec(resultParents);

		if (!revList[1]) {
			throw new Error("No parent commit found");
		}

		return revList[1];
	}

	return revList[2];
}

/**
 * @returns {Promise<{name: string, rev: string}[]>} baseline revs
 */
async function getBaselineRevs() {
	const resultParents = await git.raw([
		"rev-list",
		"--parents",
		"-n",
		"1",
		"HEAD"
	]);
	const revList = REV_LIST_REGEXP.exec(resultParents);

	if (!revList) throw new Error("Invalid result from git rev-list");

	const head = await getHead(revList);

	if (CODSPEED) {
		return [
			{
				name: "HEAD",
				rev: head
			}
		];
	}

	const base = await getBase(revList);

	if (!head || !base) {
		throw new Error("No baseline found");
	}

	return [
		{
			name: "HEAD",
			rev: head
		},
		{
			name: "BASE",
			rev: base
		}
	];
}

/**
 * @param {number} n number of runs
 * @returns {number} distribution
 */
function tDistribution(n) {
	// two-sided, 90%
	// https://en.wikipedia.org/wiki/Student%27s_t-distribution
	if (n <= 30) {
		//            1      2      ...
		const data = [
			6.314, 2.92, 2.353, 2.132, 2.015, 1.943, 1.895, 1.86, 1.833, 1.812, 1.796,
			1.782, 1.771, 1.761, 1.753, 1.746, 1.74, 1.734, 1.729, 1.725, 1.721,
			1.717, 1.714, 1.711, 1.708, 1.706, 1.703, 1.701, 1.699, 1.697
		];
		return data[n - 1];
	} else if (n <= 120) {
		//            30     40     50     60     70     80     90     100    110    120
		const data = [
			1.697, 1.684, 1.676, 1.671, 1.667, 1.664, 1.662, 1.66, 1.659, 1.658
		];
		const a = data[Math.floor(n / 10) - 3];
		const b = data[Math.ceil(n / 10) - 3];
		const f = n / 10 - Math.floor(n / 10);

		return a * (1 - f) + b * f;
	}

	return 1.645;
}

const output = path.join(__dirname, "js");
const baselinesPath = path.join(output, "benchmark-baselines");
const baselines = [];

try {
	await fs.mkdir(baselinesPath, { recursive: true });
} catch (_err) {} // eslint-disable-line no-empty

const baselineRevisions = await getBaselineRevs();

for (const baselineInfo of baselineRevisions) {
	/**
	 * @returns {void}
	 */
	function addBaseline() {
		baselines.push({
			name: baselineInfo.name,
			rev: baselineRevision,
			webpack: async config => {
				const webpack = (
					await import(
						path.resolve(
							baselinePath,
							`./lib/index.js?nocache=${Math.random()}`
						)
					)
				).default;

				await new Promise((resolve, reject) => {
					const warmupCompiler = webpack(config, (err, _stats) => {
						if (err) {
							reject(err);
							return;
						}

						warmupCompiler.purgeInputFileSystem();

						resolve();
					});
				});

				return webpack;
			}
		});
	}

	const baselineRevision = baselineInfo.rev;
	const baselinePath = path.resolve(baselinesPath, baselineRevision);

	try {
		await fs.access(path.resolve(baselinePath, ".git"), constants.R_OK);
	} catch (_err) {
		try {
			await fs.mkdir(baselinePath);
		} catch (_err) {} // eslint-disable-line no-empty

		const gitIndex = path.resolve(rootPath, ".git/index");
		const index = await fs.readFile(gitIndex);
		const prevHead = await git.raw(["rev-list", "-n", "1", "HEAD"]);

		await simpleGit(baselinePath).raw([
			"--git-dir",
			path.join(rootPath, ".git"),
			"reset",
			"--hard",
			baselineRevision
		]);

		await git.raw(["reset", "--soft", prevHead.split("\n")[0]]);
		await fs.writeFile(gitIndex, index);
	} finally {
		addBaseline();
	}
}

async function registerBenchmarks(suite, test, baselines) {
	for (const baseline of baselines) {
		const outputDirectory = path.join(
			__dirname,
			"js",
			"benchmark",
			`baseline-${baseline.name}`,
			test
		);
		const testDirectory = path.join(casesPath, test);
		const config =
			(
				await import(
					path.join(testDirectory, `webpack.config.js?nocache=${Math.random()}`)
				)
			).default || {};

		config.mode = config.mode || "production";
		config.output = config.output || {};

		if (!config.context) config.context = testDirectory;
		if (!config.output.path) config.output.path = outputDirectory;

		const suiteName = `benchmark "${test}"${CODSPEED ? "" : ` ${baseline.name} (${baseline.rev})`}`;
		const webpack = await baseline.webpack(config);

		suite.add(suiteName, {
			baseTestName: test,
			defer: true,
			fn(deferred) {
				const compiler = webpack(config, (err, stats) => {
					compiler.purgeInputFileSystem();

					if (err) {
						throw err;
					}

					if (stats.hasErrors()) {
						throw new Error(stats.toString());
					}

					deferred.resolve();
				});
			}
		});
	}
}

const suite = withCodSpeed(
	new Benchmark.Suite({
		maxTime: 30,
		initCount: 1,
		onError: event => {
			throw new Error(event.error);
		}
	})
);

const casesPath = path.join(__dirname, "benchmarkCases");

const tests = [];

for (const folder of await fs.readdir(casesPath)) {
	if (folder.includes("_")) {
		continue;
	}

	try {
		await fs.access(
			path.resolve(casesPath, folder, "webpack.config.js"),
			constants.R_OK
		);
	} catch (_err) {
		continue;
	}

	tests.push(folder);
}

for (const test of tests) {
	await registerBenchmarks(suite, test, baselines);
}

const statsByTests = new Map();

suite.on("cycle", event => {
	const target = event.target;
	const stats = target.stats;
	const n = stats.sample.length;
	const nSqrt = Math.sqrt(n);
	const z = tDistribution(n - 1);

	stats.sampleCount = stats.sample.length;
	stats.minConfidence = stats.mean - (z * stats.deviation) / nSqrt;
	stats.maxConfidence = stats.mean + (z * stats.deviation) / nSqrt;
	stats.text = `${target.name} ${Math.round(stats.mean * 1000)} ms ± ${Math.round(
		stats.deviation * 1000
	)} ms [${Math.round(stats.minConfidence * 1000)} ms; ${Math.round(
		stats.maxConfidence * 1000
	)} ms]`;

	const baseTestName = target.baseTestName;
	const allStats = statsByTests.get(baseTestName);

	if (!allStats) {
		console.log(String(target));
		statsByTests.set(baseTestName, [stats]);
		return;
	}

	allStats.push(stats);

	const headStats = allStats[0];
	const baselineStats = allStats[1];

	console.log(
		`Benchmark "${baseTestName}" result: ${headStats.text} is ${Math.round(
			(baselineStats.mean / headStats.mean) * 100 - 100
		)}% ${baselineStats.maxConfidence < headStats.minConfidence ? "slower than" : baselineStats.minConfidence > headStats.maxConfidence ? "faster than" : "the same as"} ${baselineStats.text}`
	);
});

suite.run({ async: true });

suite.on("complete", () => {
	remove(baselinesPath);
});

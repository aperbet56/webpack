/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const Template = require("../Template");
const AwaitDependenciesInitFragment = require("../async-modules/AwaitDependenciesInitFragment");
const makeSerializable = require("../util/makeSerializable");
const HarmonyImportDependency = require("./HarmonyImportDependency");
const NullDependency = require("./NullDependency");

/** @typedef {import("webpack-sources").ReplaceSource} ReplaceSource */
/** @typedef {import("../Dependency")} Dependency */
/** @typedef {import("../DependencyTemplate").DependencyTemplateContext} DependencyTemplateContext */
/** @typedef {import("../javascript/JavascriptParser").Range} Range */
/** @typedef {import("../serialization/ObjectMiddleware").ObjectDeserializerContext} ObjectDeserializerContext */
/** @typedef {import("../serialization/ObjectMiddleware").ObjectSerializerContext} ObjectSerializerContext */
/** @typedef {import("./HarmonyAcceptImportDependency")} HarmonyAcceptImportDependency */

class HarmonyAcceptDependency extends NullDependency {
	/**
	 * @param {Range} range expression range
	 * @param {HarmonyAcceptImportDependency[]} dependencies import dependencies
	 * @param {boolean} hasCallback true, if the range wraps an existing callback
	 */
	constructor(range, dependencies, hasCallback) {
		super();
		this.range = range;
		this.dependencies = dependencies;
		this.hasCallback = hasCallback;
	}

	get type() {
		return "accepted harmony modules";
	}

	/**
	 * @param {ObjectSerializerContext} context context
	 */
	serialize(context) {
		const { write } = context;
		write(this.range);
		write(this.dependencies);
		write(this.hasCallback);
		super.serialize(context);
	}

	/**
	 * @param {ObjectDeserializerContext} context context
	 */
	deserialize(context) {
		const { read } = context;
		this.range = read();
		this.dependencies = read();
		this.hasCallback = read();
		super.deserialize(context);
	}
}

makeSerializable(
	HarmonyAcceptDependency,
	"webpack/lib/dependencies/HarmonyAcceptDependency"
);

HarmonyAcceptDependency.Template = class HarmonyAcceptDependencyTemplate extends (
	NullDependency.Template
) {
	/**
	 * @param {Dependency} dependency the dependency for which the template should be applied
	 * @param {ReplaceSource} source the current replace source which can be modified
	 * @param {DependencyTemplateContext} templateContext the context object
	 * @returns {void}
	 */
	apply(dependency, source, templateContext) {
		const dep = /** @type {HarmonyAcceptDependency} */ (dependency);
		const {
			module,
			runtime,
			runtimeRequirements,
			runtimeTemplate,
			moduleGraph,
			chunkGraph
		} = templateContext;

		/** @type {HarmonyAcceptImportDependency[]} */
		const syncDeps = [];

		/** @type {HarmonyAcceptImportDependency[]} */
		const asyncDeps = [];

		for (const dependency of dep.dependencies) {
			const connection = moduleGraph.getConnection(dependency);

			if (connection && moduleGraph.isAsync(connection.module)) {
				asyncDeps.push(dependency);
			} else {
				syncDeps.push(dependency);
			}
		}

		let content = syncDeps
			.map((dependency) => {
				const referencedModule = moduleGraph.getModule(dependency);
				return {
					dependency,
					runtimeCondition: referencedModule
						? HarmonyImportDependency.Template.getImportEmittedRuntime(
								module,
								referencedModule
							)
						: false
				};
			})
			.filter(({ runtimeCondition }) => runtimeCondition !== false)
			.map(({ dependency, runtimeCondition }) => {
				const condition = runtimeTemplate.runtimeConditionExpression({
					chunkGraph,
					runtime,
					runtimeCondition,
					runtimeRequirements
				});
				const s = dependency.getImportStatement(true, templateContext);
				const code = s[0] + s[1];
				if (condition !== "true") {
					return `if (${condition}) {\n${Template.indent(code)}\n}\n`;
				}
				return code;
			})
			.join("");

		const promises = new Map(
			asyncDeps.map((dependency) => [
				dependency.getImportVar(moduleGraph),
				dependency.getModuleExports(templateContext)
			])
		);

		let optAsync = "";
		if (promises.size !== 0) {
			optAsync = "async ";
			content += new AwaitDependenciesInitFragment(promises).getContent({
				...templateContext,
				type: "javascript"
			});
		}

		if (dep.hasCallback) {
			if (runtimeTemplate.supportsArrowFunction()) {
				source.insert(
					dep.range[0],
					`${optAsync}__WEBPACK_OUTDATED_DEPENDENCIES__ => { ${content} return (`
				);
				source.insert(dep.range[1], ")(__WEBPACK_OUTDATED_DEPENDENCIES__); }");
			} else {
				source.insert(
					dep.range[0],
					`${optAsync}function(__WEBPACK_OUTDATED_DEPENDENCIES__) { ${content} return (`
				);
				source.insert(
					dep.range[1],
					")(__WEBPACK_OUTDATED_DEPENDENCIES__); }.bind(this)"
				);
			}
			return;
		}

		const arrow = runtimeTemplate.supportsArrowFunction();
		source.insert(
			dep.range[1] - 0.5,
			`, ${arrow ? `${optAsync}() =>` : `${optAsync}function()`} { ${content} }`
		);
	}
};

module.exports = HarmonyAcceptDependency;

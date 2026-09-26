import { plugin } from "bun";

/**
 * `opencut-wasm` is built with wasm-pack's `bundler` target, which does
 * `import * as wasm from "./opencut_wasm_bg.wasm"` and expects the bundler to
 * instantiate it. Bun's test runner doesn't, so this loader instantiates the
 * module itself, wiring its imports to the generated `_bg.js` glue.
 */
plugin({
	name: "opencut-wasm-loader",
	setup(build) {
		build.onLoad({ filter: /opencut_wasm_bg\.wasm$/ }, async ({ path }) => {
			const bytes = await Bun.file(path).arrayBuffer();
			const module = new WebAssembly.Module(bytes);
			const importModules = [
				...new Set(WebAssembly.Module.imports(module).map((entry) => entry.module)),
			];
			const exportNames = WebAssembly.Module.exports(module).map((entry) => entry.name);

			const contents = [
				...importModules.map(
					(specifier, index) => `import * as imports${index} from ${JSON.stringify(specifier)};`,
				),
				`const bytes = await Bun.file(${JSON.stringify(path)}).arrayBuffer();`,
				`const { instance } = await WebAssembly.instantiate(bytes, {`,
				...importModules.map((specifier, index) => `\t${JSON.stringify(specifier)}: imports${index},`),
				`});`,
				...exportNames.map(
					(name) => `export const ${name} = instance.exports[${JSON.stringify(name)}];`,
				),
			].join("\n");

			return { contents, loader: "js" };
		});
	},
});

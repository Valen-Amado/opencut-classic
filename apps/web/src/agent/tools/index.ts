import { agentToolRegistry } from "../registry";
import { registerEditTools } from "./edit";
import { registerOutputTools } from "./output";
import { registerReadTools } from "./read";

let registered = false;

/**
 * Populate the tool registry. Idempotent, because both the bridge and the tests
 * call it and the editor tab may mount more than once in development.
 */
export function registerAgentTools(): void {
	if (registered) {
		return;
	}
	registerReadTools();
	registerEditTools();
	registerOutputTools();
	registered = true;
}

export { agentToolRegistry };
export * from "./helpers";

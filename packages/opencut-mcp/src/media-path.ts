import { isAbsolute, resolve, sep } from "node:path";

/**
 * Root that `import_media` may read local files from.
 *
 * The bridge only ever listens on loopback, but the MCP server can also be put
 * behind a public tunnel, and then this is the difference between "the agent can
 * import my footage" and "anyone with the URL can read my disk". Reads are
 * confined to one directory, and the default is the repo rather than $HOME.
 */
export function getMediaRoot(): string {
	const configured = process.env.OPENCUT_MEDIA_ROOT;
	return resolve(configured && configured.length > 0 ? configured : process.cwd());
}

export class MediaPathError extends Error {}

/**
 * Resolve a caller-supplied path inside the media root.
 *
 * Relative paths resolve against the root; absolute ones must already be inside
 * it. Symlinks are not followed here — callers that care should stat the result.
 */
export function resolveInsideMediaRoot({
	path,
	root = getMediaRoot(),
}: {
	path: string;
	root?: string;
}): string {
	if (path.length === 0) {
		throw new MediaPathError("Empty path.");
	}

	const candidate = isAbsolute(path) ? resolve(path) : resolve(root, path);
	if (candidate !== root && !candidate.startsWith(root + sep)) {
		throw new MediaPathError(
			`"${path}" is outside the allowed media directory (${root}). Move the file there, or set OPENCUT_MEDIA_ROOT.`,
		);
	}

	return candidate;
}

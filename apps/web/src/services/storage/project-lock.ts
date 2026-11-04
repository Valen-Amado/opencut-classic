/**
 * Keeps a project writable from one tab at a time, so a tab left open with an
 * older copy can't overwrite newer work. The newest tab always wins: it takes
 * the lock and the previous owner is told through `onLost`. The browser frees
 * the lock when a tab closes or crashes.
 */
export function claimProjectLock({
	projectId,
	onLost,
}: {
	projectId: string;
	onLost: () => void;
}): Promise<() => void> {
	if (typeof navigator === "undefined" || !navigator.locks) {
		return Promise.resolve(() => {});
	}

	return new Promise((resolve) => {
		let isGranted = false;
		let isReleased = false;

		navigator.locks
			.request(
				`opencut-project-${projectId}`,
				{ steal: true },
				() =>
					new Promise<void>((release) => {
						isGranted = true;
						resolve(() => {
							isReleased = true;
							release();
						});
					}),
			)
			.catch(() => {
				if (!isGranted) {
					resolve(() => {});
					return;
				}
				if (!isReleased) onLost();
			});
	});
}

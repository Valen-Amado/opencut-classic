import type { AnimationChannel, ScalarChannel } from "./types";

function isNumericChannel(channel: AnimationChannel): channel is ScalarChannel {
	return channel.keys.every((key) => typeof key.value === "number");
}

/**
 * Shifts every keyframe value of a numeric channel by `delta`, keeping the
 * animation's shape (curve handles are relative, so they carry over as-is).
 * Used when moving an element whose position is animated: the whole motion
 * moves with it instead of the keyframes overriding the new base value.
 */
export function offsetChannelValues({
	channel,
	delta,
}: {
	channel: AnimationChannel | undefined;
	delta: number;
}): AnimationChannel | undefined {
	if (!channel || delta === 0) return channel;
	if (!isNumericChannel(channel)) return channel;
	return {
		...channel,
		keys: channel.keys.map((key) => ({ ...key, value: key.value + delta })),
	};
}

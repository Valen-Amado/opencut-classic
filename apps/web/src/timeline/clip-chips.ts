import { formatTimecode, type FrameRate } from "opencut-wasm";
import type { MediaTime } from "@/wasm";

/** Clip duration as HH:MM:SS:FF in the project frame rate. */
export function formatClipDuration({
	duration,
	fps,
}: {
	duration: MediaTime;
	fps: FrameRate;
}): string {
	return (
		formatTimecode({ time: duration, format: "HH:MM:SS:FF", rate: fps }) ?? ""
	);
}

/** "Velocidad 2x" for retimed clips, null at normal speed. */
export function formatClipSpeedLabel({
	rate,
}: {
	rate: number;
}): string | null {
	if (!Number.isFinite(rate) || Math.abs(rate - 1) < 1e-6) {
		return null;
	}
	return `Velocidad ${Number(rate.toFixed(2))}x`;
}

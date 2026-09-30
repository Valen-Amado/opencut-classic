import type { MouseEvent as ReactMouseEvent } from "react";
import type { FrameRate } from "opencut-wasm";
import {
	mediaTime,
	snapSeekMediaTime,
	TICKS_PER_SECOND,
	type MediaTime,
} from "@/wasm";
import {
	buildTimelineSnapPoints,
	getTimelineSnapThresholdInTicks,
	resolveTimelineSnap,
} from "@/timeline/snapping";
import { getBookmarkSnapPoints } from "@/timeline/bookmarks/index";
import { getElementEdgeSnapPoints } from "@/timeline/element-snap-source";
import { getAnimationKeyframeSnapPointsForTimeline } from "@/timeline/animation-snap-points";
import {
	getCenteredLineLeft,
	timelineTimeToPixels,
	timelineTimeToSnappedPixels,
} from "@/timeline";
import { BASE_TIMELINE_PIXELS_PER_SECOND } from "@/timeline/scale";
import type { Bookmark, SceneTracks } from "@/timeline";

// --- Session ---

interface ScrubSession {
	kind: "scrubbing";
	/** True when scrub started from a ruler click (not the playhead handle). */
	didStartFromRuler: boolean;
	/** True once the pointer moved past DRAG_THRESHOLD_PX: a drag, not a click. */
	hasMoved: boolean;
	/** Pointer x where the press started. */
	startClientX: number;
	/** Most recent frame-snapped time set by scrub(). */
	currentTime: MediaTime | null;
}

type Session = { kind: "idle" } | ScrubSession;

/**
 * Movement allowed while pressing before it counts as a drag. A click often
 * moves the pointer a pixel or two (especially on trackpads); without this the
 * press turned into a drag and snapped the playhead to a nearby clip edge,
 * bookmark or keyframe instead of the clicked frame.
 */
const DRAG_THRESHOLD_PX = 4;

// --- Config ---

export interface PlayheadConfig {
	zoomLevel: number;
	duration: MediaTime;
	getActiveProjectFps: () => FrameRate | null;
	isShiftHeld: () => boolean;
	/** The timeline magnet toggle; the playhead only snaps when it's on. */
	isSnappingEnabled: () => boolean;
	getIsPlaying: () => boolean;
	getRulerEl: () => HTMLDivElement | null;
	getRulerScrollEl: () => HTMLDivElement | null;
	getTracksScrollEl: () => HTMLDivElement | null;
	getPlayheadEl: () => HTMLDivElement | null;
	getSceneTracks: () => SceneTracks;
	getSceneBookmarks: () => Bookmark[];
	seek: (time: MediaTime) => void;
	setScrubbing: (isScrubbing: boolean) => void;
	setTimelineViewState: (viewState: {
		zoomLevel: number;
		scrollLeft: number;
		playheadTime: MediaTime;
	}) => void;
}

export interface PlayheadConfigRef {
	readonly current: PlayheadConfig;
}

// --- Pure helpers (px → logical) ---

function pixelToTime({
	clientX,
	rulerEl,
	zoomLevel,
	duration,
}: {
	clientX: number;
	rulerEl: HTMLDivElement;
	zoomLevel: number;
	duration: MediaTime;
}): MediaTime {
	const rulerRect = rulerEl.getBoundingClientRect();
	const contentWidth = timelineTimeToPixels({ time: duration, zoomLevel });
	const clampedX = Math.max(
		0,
		Math.min(contentWidth, clientX - rulerRect.left),
	);
	const seconds = Math.max(
		0,
		Math.min(
			duration / TICKS_PER_SECOND,
			clampedX / (BASE_TIMELINE_PIXELS_PER_SECOND * zoomLevel),
		),
	);
	return mediaTime({ ticks: Math.round(seconds * TICKS_PER_SECOND) });
}

// --- Controller ---

export class PlayheadController {
	private lastMouseClientX = 0;

	private session: Session = { kind: "idle" };
	private readonly configRef: PlayheadConfigRef;

	constructor(deps: { configRef: PlayheadConfigRef }) {
		this.configRef = deps.configRef;
		this.onPlayheadMouseDown = this.onPlayheadMouseDown.bind(this);
		this.onRulerMouseDown = this.onRulerMouseDown.bind(this);
		this.handleMouseMove = this.handleMouseMove.bind(this);
		this.handleMouseUp = this.handleMouseUp.bind(this);
	}

	private get config(): PlayheadConfig {
		return this.configRef.current;
	}

	get isActive(): boolean {
		return this.session.kind !== "idle";
	}

	getLastMouseClientX(): number {
		return this.lastMouseClientX;
	}

	destroy(): void {
		this.deactivate();
	}

	// --- Public event handlers (bound, stable references) ---

	onPlayheadMouseDown(event: ReactMouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.session = {
			kind: "scrubbing",
			didStartFromRuler: false,
			hasMoved: false,
			startClientX: event.clientX,
			currentTime: null,
		};
		this.config.setScrubbing(true);
		this.scrub({ event, isElementSnappingEnabled: true });
		this.activate();
	}

	onRulerMouseDown(event: ReactMouseEvent): void {
		if (event.button !== 0) return;
		if (this.config.getPlayheadEl()?.contains(event.target as Node)) return;

		event.preventDefault();
		this.session = {
			kind: "scrubbing",
			didStartFromRuler: true,
			hasMoved: false,
			startClientX: event.clientX,
			currentTime: null,
		};
		this.config.setScrubbing(true);
		// No element-edge snapping on initial ruler click — avoids a jarring jump.
		this.scrub({ event, isElementSnappingEnabled: false });
		this.activate();
	}

	// --- Public non-session methods ---

	/**
	 * Imperatively updates the playhead DOM element's `left` style.
	 * Called on scroll and playback events to avoid React re-renders
	 * during animation frame updates.
	 */
	updatePlayheadLeft(time: MediaTime): void {
		const playheadEl = this.config.getPlayheadEl();
		if (!playheadEl) return;

		const centerPixel = timelineTimeToSnappedPixels({
			time,
			zoomLevel: this.config.zoomLevel,
		});
		const scrollLeft = this.config.getRulerScrollEl()?.scrollLeft ?? 0;
		playheadEl.style.left = `${getCenteredLineLeft({ centerPixel }) - scrollLeft}px`;
	}

	/**
	 * Updates the playhead position and auto-scrolls to keep the playhead
	 * visible during playback.
	 */
	handlePlaybackUpdate(time: MediaTime): void {
		this.updatePlayheadLeft(time);

		// Auto-scroll only during playback, not while scrubbing.
		if (!this.config.getIsPlaying() || this.session.kind === "scrubbing")
			return;

		const rulerViewport = this.config.getRulerScrollEl();
		const tracksViewport = this.config.getTracksScrollEl();
		if (!rulerViewport || !tracksViewport) return;

		const playheadPixels = timelineTimeToPixels({
			time,
			zoomLevel: this.config.zoomLevel,
		});
		const viewportWidth = rulerViewport.clientWidth;
		const isOutOfView =
			playheadPixels < rulerViewport.scrollLeft ||
			playheadPixels > rulerViewport.scrollLeft + viewportWidth;

		if (isOutOfView) {
			const desiredScroll = Math.max(
				0,
				Math.min(
					rulerViewport.scrollWidth - viewportWidth,
					playheadPixels - viewportWidth / 2,
				),
			);
			rulerViewport.scrollLeft = tracksViewport.scrollLeft = desiredScroll;
		}
	}

	// --- Private ---

	private activate(): void {
		window.addEventListener("mousemove", this.handleMouseMove);
		window.addEventListener("mouseup", this.handleMouseUp);
	}

	private deactivate(): void {
		window.removeEventListener("mousemove", this.handleMouseMove);
		window.removeEventListener("mouseup", this.handleMouseUp);
	}

	/**
	 * Converts pointer position to a frame-snapped timeline time and seeks.
	 * `isElementSnappingEnabled` controls element-edge snapping; frame-level snapping
	 * is always applied.
	 */
	private scrub({
		event,
		isElementSnappingEnabled,
	}: {
		event: { clientX: number };
		isElementSnappingEnabled: boolean;
	}): void {
		const ruler = this.config.getRulerEl();
		if (!ruler) return;

		const fps = this.config.getActiveProjectFps();
		if (!fps) return;

		const { zoomLevel, duration } = this.config;
		const rawTime = pixelToTime({
			clientX: event.clientX,
			rulerEl: ruler,
			zoomLevel,
			duration,
		});
		const frameTime = snapSeekMediaTime({ time: rawTime, duration, fps });

		const time = (() => {
			if (
				!isElementSnappingEnabled ||
				!this.config.isSnappingEnabled() ||
				this.config.isShiftHeld()
			)
				return frameTime;

			const snapPoints = buildTimelineSnapPoints({
				sources: [
					() =>
						getElementEdgeSnapPoints({ tracks: this.config.getSceneTracks() }),
					() =>
						getBookmarkSnapPoints({
							bookmarks: this.config.getSceneBookmarks(),
						}),
					() =>
						getAnimationKeyframeSnapPointsForTimeline({
							tracks: this.config.getSceneTracks(),
						}),
				],
			});
			const result = resolveTimelineSnap({
				targetTime: frameTime,
				snapPoints,
				maxSnapDistance: getTimelineSnapThresholdInTicks({ zoomLevel }),
			});
			return result.snapPoint ? result.snappedTime : frameTime;
		})();

		if (this.session.kind === "scrubbing") {
			this.session.currentTime = time;
		}
		this.config.seek(time);
		this.lastMouseClientX = event.clientX;
	}

	private handleMouseMove(event: MouseEvent): void {
		if (this.session.kind !== "scrubbing") return;
		if (
			!this.session.hasMoved &&
			Math.abs(event.clientX - this.session.startClientX) > DRAG_THRESHOLD_PX
		) {
			this.session.hasMoved = true;
		}
		// Snap to edges only once it is really a drag.
		this.scrub({ event, isElementSnappingEnabled: this.session.hasMoved });
	}

	private handleMouseUp(event: MouseEvent): void {
		if (this.session.kind !== "scrubbing") return;

		const session = this.session;
		this.config.setScrubbing(false);

		if (session.currentTime !== null) {
			this.config.seek(session.currentTime);
			this.config.setTimelineViewState({
				zoomLevel: this.config.zoomLevel,
				scrollLeft: this.config.getTracksScrollEl()?.scrollLeft ?? 0,
				playheadTime: session.currentTime,
			});
		}

		// A ruler click (no real drag) lands on the pressed frame, without snapping.
		if (session.didStartFromRuler && !session.hasMoved) {
			this.scrub({
				event: { clientX: session.startClientX },
				isElementSnappingEnabled: false,
			});
		}

		this.session = { kind: "idle" };
		this.deactivate();
	}
}

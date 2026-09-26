"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { formatTimecode } from "opencut-wasm";
import { useEditor } from "@/editor/use-editor";
import { useFrameThumbnail } from "@/media/use-frame-thumbnail";
import { useCommittedRef } from "@/hooks/use-committed-ref";
import {
	findFrameSourceAtTime,
	getKeyboardSeekTime,
	getProgressRatio,
	getSeekRatioAtPointer,
	getTooltipLeft,
} from "@/preview/seek-bar";
import { quantizeThumbnailTime } from "@/timeline/filmstrip";
import {
	roundMediaTime,
	snapSeekMediaTime,
	TICKS_PER_SECOND,
	type MediaTime,
} from "@/wasm";
import { cn } from "@/utils/ui";

const TOOLTIP_WIDTH_PX = 160;
const TOOLTIP_HEIGHT_PX = 90;
const HOVER_THUMBNAIL_STEP_SEC = 0.1;

interface HoverState {
	ratio: number;
	pointerX: number;
	containerWidth: number;
}

/**
 * Player-style seek track shown above the preview toolbar in fullscreen:
 * progress fill, draggable thumb, bookmark markers and a hover tooltip with
 * the timecode and the frame visible at that time.
 */
export function FullscreenSeekBar({ className }: { className?: string }) {
	const editor = useEditor();
	const duration = useEditor((e) => e.timeline.getTotalDuration());
	const fps = useEditor((e) => e.project.getActive().settings.fps);
	const bookmarks = useEditor((e) => e.scenes.getActiveScene().bookmarks);
	const [currentTime, setCurrentTime] = useState<MediaTime>(() =>
		editor.playback.getCurrentTime(),
	);
	const [hover, setHover] = useState<HoverState | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const wasPlayingRef = useRef(false);

	useEffect(() => {
		const unsubscribeUpdate = editor.playback.onUpdate(setCurrentTime);
		const unsubscribeSeek = editor.playback.onSeek(setCurrentTime);
		return () => {
			unsubscribeUpdate();
			unsubscribeSeek();
		};
	}, [editor.playback]);

	const getRatioAt = ({ clientX }: { clientX: number }): number => {
		const track = trackRef.current;
		if (!track) return 0;
		const rect = track.getBoundingClientRect();
		return getSeekRatioAtPointer({
			clientX,
			trackLeft: rect.left,
			trackWidth: rect.width,
		});
	};

	const updateHover = ({ clientX }: { clientX: number }) => {
		const root = rootRef.current;
		if (!root) return;
		const rect = root.getBoundingClientRect();
		setHover({
			ratio: getRatioAt({ clientX }),
			pointerX: clientX - rect.left,
			containerWidth: rect.width,
		});
	};

	const seekToTicks = ({ ticks }: { ticks: number }) => {
		const time = snapSeekMediaTime({
			time: roundMediaTime({ time: ticks }),
			duration,
			fps,
		});
		editor.playback.seek({ time });
	};

	const seekToPointer = ({ clientX }: { clientX: number }) => {
		seekToTicks({ ticks: getRatioAt({ clientX }) * duration });
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		wasPlayingRef.current = editor.playback.getIsPlaying();
		if (wasPlayingRef.current) {
			editor.playback.pause();
		}
		editor.playback.setScrubbing({ isScrubbing: true });
		setIsDragging(true);
		updateHover({ clientX: event.clientX });
		seekToPointer({ clientX: event.clientX });
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		updateHover({ clientX: event.clientX });
		if (isDragging) {
			seekToPointer({ clientX: event.clientX });
		}
	};

	const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!isDragging) return;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		setIsDragging(false);
		editor.playback.setScrubbing({ isScrubbing: false });
		if (wasPlayingRef.current) {
			editor.playback.play();
		}
	};

	const seekToTicksRef = useCommittedRef(seekToTicks);
	const durationRef = useCommittedRef(duration);

	// Arrow keys on the focused slider seek ±1 s (±5 s with Shift). Listen on
	// window in the capture phase so the editor's global seek shortcuts, which
	// listen on document, don't also handle the same key press.
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (document.activeElement !== rootRef.current) return;
			const target = getKeyboardSeekTime({
				key: event.key,
				shiftKey: event.shiftKey,
				currentTime: editor.playback.getCurrentTime(),
				duration: durationRef.current,
			});
			if (target === null) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			seekToTicksRef.current({ ticks: target });
		};
		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () =>
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
	}, [editor.playback, durationRef, seekToTicksRef]);

	const progressPercent = getProgressRatio({ time: currentTime, duration }) * 100;
	const hoverTime = hover ? hover.ratio * duration : null;
	const currentTimecode =
		formatTimecode({ time: currentTime, format: "HH:MM:SS:FF", rate: fps }) ??
		"";

	return (
		<div
			ref={rootRef}
			role="slider"
			tabIndex={0}
			aria-label="Posición de reproducción"
			aria-valuemin={0}
			aria-valuemax={Number((duration / TICKS_PER_SECOND).toFixed(2))}
			aria-valuenow={Number((currentTime / TICKS_PER_SECOND).toFixed(2))}
			aria-valuetext={currentTimecode}
			className={cn(
				"group/seek relative cursor-pointer touch-none px-5 pt-3.5 outline-none",
				className,
			)}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
			onPointerLeave={() => {
				if (!isDragging) setHover(null);
			}}
		>
			<div
				ref={trackRef}
				className={cn(
					"bg-foreground/20 relative h-1 rounded-full transition-[height] duration-100 group-hover/seek:h-1.5 group-focus-visible/seek:ring-2 group-focus-visible/seek:ring-primary/60",
					isDragging && "h-1.5",
				)}
			>
				{hoverTime !== null && (
					<div
						className="bg-foreground/20 absolute inset-y-0 left-0 rounded-full"
						style={{ width: `${(hoverTime / (duration || 1)) * 100}%` }}
					/>
				)}
				<div
					className="bg-primary absolute inset-y-0 left-0 rounded-full"
					style={{ width: `${progressPercent}%` }}
				/>
				{bookmarks.map((bookmark) => (
					<span
						key={bookmark.time}
						className="absolute -top-[3px] -bottom-[3px] -ml-px w-0.5 rounded-[1px] bg-[#f5b301]"
						style={{
							left: `${getProgressRatio({ time: bookmark.time, duration }) * 100}%`,
						}}
					/>
				))}
				<div
					className={cn(
						"absolute top-1/2 -mt-[7px] -ml-[7px] size-3.5 scale-0 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform duration-100 group-hover/seek:scale-100",
						isDragging && "scale-100",
					)}
					style={{ left: `${progressPercent}%` }}
				/>
			</div>
			{hover && hoverTime !== null && (
				<div
					className="pointer-events-none absolute bottom-[18px] flex -translate-x-1/2 flex-col items-center gap-1"
					style={{
						left: `${getTooltipLeft({
							pointerX: hover.pointerX,
							containerWidth: hover.containerWidth,
							halfTooltipWidth: TOOLTIP_WIDTH_PX / 2 + 10,
						})}px`,
					}}
				>
					<SeekFramePreview time={hoverTime} />
					<span className="rounded bg-black/75 px-1.5 py-0.5 text-xs text-white tabular-nums">
						{formatTimecode({
							time: roundMediaTime({ time: hoverTime }),
							format: "HH:MM:SS:FF",
							rate: fps,
						}) ?? ""}
					</span>
				</div>
			)}
		</div>
	);
}

function SeekFramePreview({ time }: { time: number }) {
	const tracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const mediaAssets = useEditor((e) => e.media.getAssets());

	const sourceDurations = useMemo(
		() =>
			new Map(
				mediaAssets.flatMap((asset) =>
					asset.duration !== undefined ? [[asset.id, asset.duration]] : [],
				),
			),
		[mediaAssets],
	);
	const source = findFrameSourceAtTime({ tracks, time, sourceDurations });
	const mediaAsset = source
		? (mediaAssets.find((asset) => asset.id === source.mediaId) ?? null)
		: null;
	const frameTime =
		source?.kind === "video"
			? quantizeThumbnailTime({
					time: source.sourceTimeSec,
					step: HOVER_THUMBNAIL_STEP_SEC,
				})
			: 0;
	const frameUrl = useFrameThumbnail({
		mediaId: source?.kind === "video" ? source.mediaId : null,
		file: mediaAsset?.file ?? null,
		time: frameTime,
		enabled: source?.kind === "video",
	});

	// While a new frame decodes keep showing the last one of the same media
	// instead of flashing back to the clip thumbnail.
	const [lastFrame, setLastFrame] = useState<{
		mediaId: string;
		url: string;
	} | null>(null);
	if (
		frameUrl &&
		source?.kind === "video" &&
		(lastFrame?.url !== frameUrl || lastFrame.mediaId !== source.mediaId)
	) {
		setLastFrame({ mediaId: source.mediaId, url: frameUrl });
	}

	const previousFrameUrl =
		source?.kind === "video" && lastFrame?.mediaId === source.mediaId
			? lastFrame.url
			: undefined;
	const src =
		source?.kind === "image"
			? (mediaAsset?.thumbnailUrl ?? mediaAsset?.url)
			: (frameUrl ?? previousFrameUrl ?? mediaAsset?.thumbnailUrl);

	if (!src) {
		return <div className="h-[90px] w-40" />;
	}

	return (
		<Image
			src={src}
			alt=""
			width={TOOLTIP_WIDTH_PX}
			height={TOOLTIP_HEIGHT_PX}
			unoptimized
			className="h-[90px] w-40 rounded-md border-2 border-white/90 bg-black object-cover shadow-[0_4px_14px_rgba(0,0,0,0.4)]"
		/>
	);
}

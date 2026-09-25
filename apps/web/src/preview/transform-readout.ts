/** Live value while scaling or rotating: "124%", "140% × 90%" or "15°". */
export function getTransformReadout({
	isRotation,
	rotation,
	scaleX,
	scaleY,
}: {
	isRotation: boolean;
	rotation: number;
	scaleX: number;
	scaleY: number;
}): string {
	if (isRotation) return `${Math.round(rotation)}°`;
	const x = Math.round(Math.abs(scaleX) * 100);
	const y = Math.round(Math.abs(scaleY) * 100);
	return x === y ? `${x}%` : `${x}% × ${y}%`;
}

import type {
	TranscriptionModel,
	TranscriptionModelId,
} from "./types";

export const TRANSCRIPTION_MODELS: TranscriptionModel[] = [
	{
		id: "whisper-tiny",
		name: "Tiny",
		huggingFaceId: "onnx-community/whisper-tiny",
		description: "El más rápido, con menor precisión",
	},
	{
		id: "whisper-small",
		name: "Small",
		huggingFaceId: "onnx-community/whisper-small",
		description: "Buen equilibrio entre velocidad y precisión",
	},
	{
		id: "whisper-medium",
		name: "Medium",
		huggingFaceId: "onnx-community/whisper-medium",
		description: "Mayor precisión, más lento",
	},
	{
		id: "whisper-large-v3-turbo",
		name: "Large v3 Turbo",
		huggingFaceId: "onnx-community/whisper-large-v3-turbo",
		description: "Mejor precisión; requiere WebGPU para un buen rendimiento",
	},
];

export const DEFAULT_TRANSCRIPTION_MODEL: TranscriptionModelId =
	"whisper-small";

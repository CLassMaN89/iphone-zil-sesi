import type { TrimSelection } from "../media/trimSelection";

export interface ConversionRequest {
  file: File;
  selection: TrimSelection;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  outputName: string;
}

export interface ConversionResult {
  blob: Blob;
  fileName: string;
  format: "m4a" | "wav";
}

export interface Transcoder {
  convert(
    request: ConversionRequest,
    onProgress: (ratio: number) => void,
  ): Promise<ConversionResult>;
  dispose(): void;
}

export type AssetStatus = "draft" | "active" | "inactive" | "archived";

export type LayerType = "background" | "product" | "text" | "badge" | "logo" | "shape";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SafeMargin = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ExportSize = {
  name: string;
  width: number;
  height: number;
  mode: "rerender";
  crop?: "focus_area" | "center";
};

export type TextStyle = {
  fontFamily: string;
  baseSize: number;
  minSize: number;
  weight?: string;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  letterSpacing?: number;
  autoShrink?: boolean;
  maxChars?: number;
};

type BaseLayer = {
  id: string;
  type: LayerType;
  zIndex: number;
  editable?: boolean;
  visible?: boolean;
};

export type BackgroundLayer = BaseLayer & {
  type: "background";
  fill?: string;
  gradient?: {
    angle: number;
    stops: Array<{ offset: number; color: string }>;
  };
  imageOssKey?: string;
};

export type ProductLayer = BaseLayer & {
  type: "product";
  area: Rect;
  fitMode: "contain" | "cover";
  placeholderFill?: string;
  shadow?: { blur: number; color: string; offsetX: number; offsetY: number };
  focusArea?: FocusArea;
};

export type TextLayer = BaseLayer & {
  type: "text";
  area: Rect;
  textKey: string;
  defaultText: string;
  style: TextStyle;
};

export type BadgeLayer = BaseLayer & {
  type: "badge";
  area: Rect;
  textKey: string;
  defaultText: string;
  fill: string;
  radius: number;
  style: TextStyle;
};

export type LogoLayer = BaseLayer & {
  type: "logo";
  area: Rect;
  text?: string;
  imageOssKey?: string;
};

export type ShapeLayer = BaseLayer & {
  type: "shape";
  shape: "rect" | "circle";
  area: Rect;
  fill: string;
  radius?: number;
};

export type TemplateLayer =
  | BackgroundLayer
  | ProductLayer
  | TextLayer
  | BadgeLayer
  | LogoLayer
  | ShapeLayer;

export type LayerTemplateJson = {
  canvas: { width: number; height: number };
  focusArea: Rect & { layerId?: string };
  safeMargin: SafeMargin;
  exportSizes: ExportSize[];
  layers: TemplateLayer[];
};

export type PromptTemplate = {
  id: number;
  name: string;
  scene: string;
  platform?: string;
  promptSkeleton: string;
  variables: Array<{ key: string; label: string; type: "text" | "select"; default?: string; required?: boolean }>;
  tags: string[];
  status: AssetStatus;
};

export type LayerTemplate = {
  id: number;
  name: string;
  category: string;
  canvasWidth: number;
  canvasHeight: number;
  templateJson: LayerTemplateJson;
  tags: string[];
  status: AssetStatus;
  version: number;
};

export type RenderInputs = {
  [key: string]: string | FocusArea | Record<string, FocusArea> | undefined;
  productImageDataUrl?: string;
  backgroundImageDataUrl?: string;
  productFocusArea?: FocusArea;
  focusAreas?: Record<string, FocusArea>;
};

export type QualityCheck = {
  type: "text_overflow" | "size_compliance";
  passed: boolean;
  message: string;
  layerId?: string;
};

export type RenderResult = {
  dataUrl: string;
  width: number;
  height: number;
  checks: QualityCheck[];
};

export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "archived" | "deleted";

export type GenerationJob = {
  id: string;
  status: GenerationStatus;
  templateId: number;
  candidateCount: number;
  createdAt: string;
};

export type CreateGenerationJobPayload = {
  templateId: number;
  templateName: string;
  inputs: Record<string, unknown>;
  exportSize?: { name: string; width: number; height: number };
  candidateCount?: number;
};

export type GenerationOperationTrace = {
  provider: "grsai" | "mock" | "unknown";
  operationMode: string;
  workflowType: string;
  constraintPreset: string;
  prompt: string;
  referenceUrls: string[];
  referenceImageHashes: string[];
  size: string;
  count: number;
  parentImageId?: number | string | null;
  createdAt: string;
};

export type GeneratedImage = {
  id: number;
  jobId: string;
  templateId: number;
  templateName: string;
  title: string;
  scene: string;
  platform: string;
  ossKey: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  status: GenerationStatus;
  selected: boolean;
  tags: string[];
  createdAt: string;
  /** Snapshot of the original inputs used when creating this image. */
  inputsSnapshot?: Record<string, unknown>;
  /** Snapshot of the final generation request sent to the image provider. */
  operationTrace?: GenerationOperationTrace;
};

/** Normalized focus area (0-1) relative to source image dimensions. */
export type FocusArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

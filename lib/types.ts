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

export type RenderInputs = Record<string, string> & {
  productImageDataUrl?: string;
  backgroundImageDataUrl?: string;
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

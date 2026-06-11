/**
 * SenseNova U1 Fast 图像生成服务。
 *
 * API 文档参考: https://platform.sensenova.cn
 * Base URL: https://token.sensenova.cn/v1 (注意不是 api.sensenova.cn)
 * 模型: sensenova-u1-fast (专精信息图/海报/商品图)
 */

const SENSENOVA_BASE_URL = process.env.SENSENOVA_BASE_URL ?? "https://token.sensenova.cn/v1";
const SENSENOVA_API_KEY = process.env.SENSENOVA_API_KEY ?? "";
const IMAGE_GEN_MODEL = process.env.SENSENOVA_IMAGE_MODEL ?? "sensenova-u1-fast";

export type SenseNovaImageRequest = {
  prompt: string;
  size?: string;       // e.g. "800x800"
  n?: number;          // candidates count
  responseFormat?: "url" | "b64_json";
};

export type SenseNovaImageResult = {
  url?: string;
  b64_json?: string;
};

type SenseNovaResponse = {
  data: SenseNovaImageResult[];
};

/**
 * 将模板 JSON + 用户输入转换为商品图生成 prompt。
 * U1 擅长信息图/海报排版，prompt 需要清晰描述布局和内容。
 */
export function buildEcommercePrompt(params: {
  templateName: string;
  canvasWidth: number;
  canvasHeight: number;
  textLayers: Array<{ textKey: string; defaultText: string; style: { color: string; baseSize: number } }>;
  userInputs: Record<string, unknown>;
  platform?: string;
}): string {
  const { templateName, canvasWidth, canvasHeight, textLayers, userInputs, platform } = params;

  const parts: string[] = [];

  // 用途和尺寸
  parts.push(`生成一张${platform ? platform + "风格" : ""}电商商品主图`);
  parts.push(`尺寸${canvasWidth}x${canvasHeight}`);

  // 模板名称作为风格参考
  parts.push(`模板：${templateName}`);

  // 文字内容
  const textEntries = textLayers
    .map((layer) => {
      const value = userInputs[layer.textKey] ?? layer.defaultText;
      return String(value);
    })
    .filter(Boolean);

  if (textEntries.length > 0) {
    parts.push(`画面中的文字内容：${textEntries.join("、")}`);
  }

  // U1 特定优化提示
  parts.push("构图专业，商品突出，文字排版清晰可读，电商促销氛围，高清画质");

  return parts.join("，");
}

/**
 * 调用 SenseNova U1 Fast 生成图像。
 */
export async function generateImages(
  prompt: string,
  options?: { size?: string; n?: number; responseFormat?: "url" | "b64_json" }
): Promise<SenseNovaImageResult[]> {
  if (!SENSENOVA_API_KEY) {
    throw new Error("SENSENOVA_API_KEY not configured");
  }

  const size = options?.size ?? "800x800";
  const n = options?.n ?? 4;
  const responseFormat = options?.responseFormat ?? "url";

  const res = await fetch(`${SENSENOVA_BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SENSENOVA_API_KEY}`,
    },
    body: JSON.stringify({
      model: IMAGE_GEN_MODEL,
      prompt,
      size,
      n,
      response_format: responseFormat,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`SenseNova API error ${res.status}: ${errBody}`);
  }

  const json: SenseNovaResponse = await res.json();
  return json.data;
}

/**
 * 检查 SenseNova 服务是否可用。
 */
export function isSenseNovaAvailable(): boolean {
  return Boolean(SENSENOVA_API_KEY);
}

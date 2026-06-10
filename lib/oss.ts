import { getRuntimeConfig } from "./config";

export type OssAssetType =
  | "layer_template_base"
  | "reference_image"
  | "product_upload"
  | "generated_image";

export type UploadTokenRequest = {
  asset_type: OssAssetType;
  file_name: string;
  content_type: string;
  size: number;
};

export type UploadTokenResponse = {
  oss_key: string;
  upload_url: string;
  headers: Record<string, string>;
  expires_at: string;
};

const assetTypeDirs: Record<OssAssetType, string> = {
  layer_template_base: "layer-templates/base",
  reference_image: "reference-images/original",
  product_upload: "uploads/product",
  generated_image: "generated-images/original"
};

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildOssKey(input: UploadTokenRequest): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const nonce = Math.random().toString(36).slice(2, 10);
  return `prod/${assetTypeDirs[input.asset_type]}/${yyyy}/${mm}/${dd}/${nonce}_${sanitizeFileName(input.file_name)}`;
}

export function createUploadToken(input: UploadTokenRequest): UploadTokenResponse {
  const config = getRuntimeConfig();
  const ossKey = buildOssKey(input);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  if (config.oss.uploadTokenMode === "aliyun") {
    throw new Error("ALIYUN_OSS_ADAPTER_NOT_CONFIGURED");
  }

  const baseUrl = config.oss.publicBaseUrl ?? `https://${config.oss.bucket}.${config.oss.region}.aliyuncs.com`;
  return {
    oss_key: ossKey,
    upload_url: `${baseUrl}/${ossKey}?mock_upload_token=local-dev`,
    headers: { "content-type": input.content_type },
    expires_at: expiresAt
  };
}

export function createSignedUrl(ossKey: string): { url: string; expires_in: number } {
  const config = getRuntimeConfig();
  const baseUrl = config.oss.publicBaseUrl ?? `https://${config.oss.bucket}.${config.oss.region}.aliyuncs.com`;
  return { url: `${baseUrl}/${ossKey}?mock_signed_url=local-dev`, expires_in: 3600 };
}

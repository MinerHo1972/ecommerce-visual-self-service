# Aliyun Deployment Notes

## Target Shape

- ECS runs the Next.js app behind Nginx or a managed load balancer.
- RDS MySQL stores templates, tags, reference images, generated image metadata, and generation jobs.
- OSS stores original uploads, template base assets, generated candidates, thumbnails, and export images.

## Required Environment Variables

```bash
NEXT_PUBLIC_APP_NAME="电商视觉自助台"
DATABASE_URL="mysql://user:password@rds-host:3306/ecommerce_visual"
OSS_REGION="oss-cn-hangzhou"
OSS_BUCKET="ecommerce-visual-assets"
OSS_PUBLIC_BASE_URL="https://ecommerce-visual-assets.oss-cn-hangzhou.aliyuncs.com"
OSS_UPLOAD_TOKEN_MODE="aliyun"
OSS_ACCESS_KEY_ID=""
OSS_ACCESS_KEY_SECRET=""
```

## Adapter Boundary

- `lib/oss.ts` owns upload-token and signed-url generation. It returns mock URLs in local development.
- `lib/repositories/templates.ts` owns template persistence. It currently reads sample data and can be replaced with an RDS implementation.
- API routes should use these adapters rather than touching OSS/RDS directly.

## First ECS Bring-up Checklist

1. Create RDS database and run `db/001_initial_schema.sql`.
2. Create OSS bucket and configure lifecycle policy for generated candidates.
3. Fill `.env` from the variables above.
4. Run `npm install`, `npm run typecheck`, and `npm run build` on ECS local disk.
5. Start with `npm run start` or a process manager.

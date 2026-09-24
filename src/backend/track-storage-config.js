import { readFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';

export function loadTrackStorageConfig(env = process.env) {
  const bucket = env.TRACK_S3_BUCKET;
  const region = env.AWS_REGION;
  const prefix = env.TRACK_S3_PREFIX || 'dev';
  const delivery = env.TRACK_FILE_DELIVERY || 'stream';
  const rawPreview = env.TRACK_PREVIEW_MAX_POINTS || '200';
  const previewMaxPoints = Number(rawPreview);
  if (!bucket || !/^(?!\d+\.\d+\.\d+\.\d+$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('TRACK_S3_BUCKET is invalid.');
  if (!region || !/^[a-z]{2}-[a-z]+-\d$/.test(region)) throw new Error('AWS_REGION is invalid.');
  if (!/^[A-Za-z0-9_-]+$/.test(prefix)) throw new Error('TRACK_S3_PREFIX is invalid.');
  if (!['stream', 'nginx'].includes(delivery)) throw new Error('TRACK_FILE_DELIVERY is invalid.');
  if (!/^\d+$/.test(rawPreview) || !Number.isSafeInteger(previewMaxPoints) || previewMaxPoints < 2) throw new Error('TRACK_PREVIEW_MAX_POINTS is invalid.');
  if (Boolean(env.AWS_ACCESS_KEY_ID) !== Boolean(env.AWS_SECRET_ACCESS_KEY)) throw new Error('AWS credentials must be supplied together.');
  const result = { bucket, region, prefix, delivery, previewMaxPoints };
  if (delivery === 'nginx') {
    const domain = env.TRACK_CLOUDFRONT_DOMAIN;
    const keyPairId = env.TRACK_CLOUDFRONT_PUBLIC_KEY_ID;
    const keyPath = env.TRACK_CLOUDFRONT_PRIVATE_KEY_PATH;
    if (!domain || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain) || !keyPairId || !keyPath) {
      throw new Error('CloudFront signing configuration is invalid.');
    }
    result.cloudFrontDomain = domain;
    result.cloudFrontKeyPairId = keyPairId;
    result.cloudFrontPrivateKey = createPrivateKey(readFileSync(keyPath, 'utf8')).export({ type: 'pkcs8', format: 'pem' });
  }
  return result;
}

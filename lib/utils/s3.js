import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import { randomBytes } from 'crypto';
import path from 'path';

// Read process.env at call time so local server bootstrapping can load env files first.
function getConfig() {
  return {
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    bucket: process.env.S3_BUCKET_NAME,
    region: process.env.S3_REGION || 'auto',
  };
}

export function isS3Configured() {
  const c = getConfig();
  return !!(c.endpoint && c.accessKeyId && c.secretAccessKey && c.bucket);
}

let _s3Client = null;

function getS3Client() {
  if (!isS3Configured()) {
    throw new Error('S3 service is not configured.');
  }
  if (!_s3Client) {
    const c = getConfig();
    _s3Client = new S3Client({
      endpoint: c.endpoint,
      region: c.region,
      credentials: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
      },
    });
  }
  return _s3Client;
}

function getObjectKeyPrefix(ttl) {
  const oneDay = 86400;
  const oneWeek = oneDay * 7;
  const oneMonth = oneDay * 30;
  const oneYear = oneDay * 365;

  if (!ttl || ttl <= 0) return 'post/default/';
  if (ttl <= oneDay) return 'post/tmp/1day/';
  if (ttl <= oneWeek) return 'post/tmp/1week/';
  if (ttl <= oneMonth) return 'post/tmp/1month/';
  if (ttl <= oneYear) return 'post/tmp/1year/';
  return 'post/default/';
}

function generateUUID() {
  return randomBytes(16).toString('hex');
}

export async function uploadFileToS3(file, ttl) {
  const client = getS3Client();
  const { bucket } = getConfig();
  const fileExtension = path.extname(file.originalFilename || '');
  const objectKey = `${getObjectKeyPrefix(ttl)}${generateUUID()}${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: createReadStream(file.filepath),
    ContentLength: file.size,
    ContentType: file.mimetype,
  });

  await client.send(command);
  return objectKey;
}

export async function getS3Object(objectKey) {
  const client = getS3Client();
  const { bucket } = getConfig();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  const response = await client.send(command);
  return {
    body: response.Body,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
  };
}

export async function deleteFileFromS3(objectKey) {
  const client = getS3Client();
  const { bucket } = getConfig();
  const command = new DeleteObjectCommand({ Bucket: bucket, Key: objectKey });
  await client.send(command);
}

// lib/integrations/storage.ts — modular document-storage adapters.
// S3 is the field-upload target (photos/documents from visits, visible on
// desktop Documents); Google Drive holds agency documents (stub until a
// service account is configured — PRODUCTION-READINESS.md §4.7).
import "server-only";
import { isDemoMode } from "@/lib/demo/mode";
import { assertBaaGate } from "./hipaaGate";

export interface UploadTarget {
  /** Where the client PUTs the bytes. null = no real upload (demo). */
  uploadUrl: string | null;
  storageKey: string;
  provider: "s3" | "drive" | "demo";
}

export interface StorageAdapter {
  readonly provider: "s3" | "drive" | "demo";
  /** Presign an upload slot for a field photo/document. */
  getUploadTarget(input: { fileName: string; contentType: string; documentId: string }): Promise<UploadTarget>;
}

class DemoStorageAdapter implements StorageAdapter {
  readonly provider = "demo" as const;
  async getUploadTarget(input: { fileName: string; documentId: string }): Promise<UploadTarget> {
    // DEMO: no bytes leave the browser; the UI simulates Uploading → Synced.
    return { uploadUrl: null, storageKey: `demo/${input.documentId}/${input.fileName}`, provider: "demo" };
  }
}

class S3StorageAdapter implements StorageAdapter {
  readonly provider = "s3" as const;
  async getUploadTarget(input: { fileName: string; contentType: string; documentId: string }): Promise<UploadTarget> {
    assertBaaGate("AWS S3");
    const [{ S3Client, PutObjectCommand }, { getSignedUrl }] = await Promise.all([
      import("@aws-sdk/client-s3"),
      import("@aws-sdk/s3-request-presigner")
    ]);
    const bucket = process.env.S3_UPLOADS_BUCKET;
    if (!bucket) throw new Error("S3_UPLOADS_BUCKET is not configured.");
    const client = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
    const storageKey = `field-uploads/${input.documentId}/${encodeURIComponent(input.fileName)}`;
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ContentType: input.contentType,
        ServerSideEncryption: "aws:kms"
      }),
      { expiresIn: 300 }
    );
    return { uploadUrl, storageKey, provider: "s3" };
  }
}

/**
 * Google Drive adapter — INTERFACE STUB (agency documents). Wire a service
 * account + folder before enabling; until then it must not be selected for
 * uploads. PRODUCTION-READINESS.md §4.7.
 */
export class DriveStorageAdapter implements StorageAdapter {
  readonly provider = "drive" as const;
  async getUploadTarget(): Promise<UploadTarget> {
    assertBaaGate("Google Drive");
    throw new Error("Google Drive adapter not configured (GOOGLE_SERVICE_ACCOUNT_JSON).");
  }
}

export function getStorageAdapter(): StorageAdapter {
  if (isDemoMode() || !process.env.S3_UPLOADS_BUCKET) return new DemoStorageAdapter();
  return new S3StorageAdapter();
}

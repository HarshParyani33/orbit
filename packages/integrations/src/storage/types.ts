/**
 * Project Orbit — Storage Provider Contracts
 * Multi-tenant object storage abstraction supporting local filesystem and cloud providers.
 */

export interface StorageUploadResult {
  key: string;
  size: number;
}

export interface StorageDownloadResult {
  buffer: Buffer;
  mimeType?: string;
}

export interface IStorageProvider {
  /**
   * Upload an object into the storage backend.
   * Path traversal sequences must be rejected.
   */
  upload(key: string, buffer: Buffer, mimeType: string): Promise<StorageUploadResult>;

  /**
   * Download an object from the storage backend.
   */
  download(key: string): Promise<StorageDownloadResult>;

  /**
   * Delete an object from the storage backend.
   */
  delete(key: string): Promise<void>;

  /**
   * Verify if an object exists in the storage backend.
   */
  exists(key: string): Promise<boolean>;
}

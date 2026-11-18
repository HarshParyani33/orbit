import { IStorageProvider, StorageDownloadResult, StorageUploadResult } from './types';

export class MockStorageProvider implements IStorageProvider {
  private readonly storage = new Map<string, { buffer: Buffer; mimeType: string }>();

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<StorageUploadResult> {
    if (key.includes('..') || key.includes('\0')) {
      throw new Error('Security violation: Path traversal detected in storage key');
    }
    this.storage.set(key, { buffer, mimeType });
    return {
      key,
      size: buffer.length,
    };
  }

  async download(key: string): Promise<StorageDownloadResult> {
    if (key.includes('..') || key.includes('\0')) {
      throw new Error('Security violation: Path traversal detected in storage key');
    }
    const item = this.storage.get(key);
    if (!item) {
      throw new Error(`Storage object not found: ${key}`);
    }
    return { buffer: item.buffer, mimeType: item.mimeType };
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  clear(): void {
    this.storage.clear();
  }
}

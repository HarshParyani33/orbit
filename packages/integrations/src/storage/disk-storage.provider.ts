import * as fs from 'fs';
import * as path from 'path';
import { IStorageProvider, StorageDownloadResult, StorageUploadResult } from './types';

export class DiskStorageProvider implements IStorageProvider {
  private readonly baseDirectory: string;

  constructor(baseDirectory?: string) {
    this.baseDirectory = path.resolve(baseDirectory || path.join(process.cwd(), 'uploads'));
    if (!fs.existsSync(this.baseDirectory)) {
      fs.mkdirSync(this.baseDirectory, { recursive: true });
    }
  }

  private resolveSafePath(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid storage key: key must be a non-empty string');
    }

    if (key.includes('\0')) {
      throw new Error('Security violation: Storage key contains null bytes');
    }

    // Normalize forward and back slashes
    const normalizedKey = key.replace(/\\/g, '/');

    // Reject explicit directory traversal tokens
    const segments = normalizedKey.split('/');
    if (segments.some(seg => seg === '..' || seg === '.')) {
      throw new Error('Security violation: Path traversal detected in storage key');
    }

    const resolved = path.resolve(this.baseDirectory, normalizedKey);
    const expectedPrefix = this.baseDirectory.endsWith(path.sep) 
      ? this.baseDirectory 
      : this.baseDirectory + path.sep;

    if (!resolved.startsWith(expectedPrefix)) {
      throw new Error('Security violation: Storage path escapes base directory boundary');
    }

    return resolved;
  }

  async upload(key: string, buffer: Buffer, _mimeType: string): Promise<StorageUploadResult> {
    const fullPath = this.resolveSafePath(key);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, buffer);
    return {
      key,
      size: buffer.length,
    };
  }

  async download(key: string): Promise<StorageDownloadResult> {
    const fullPath = this.resolveSafePath(key);
    try {
      const buffer = await fs.promises.readFile(fullPath);
      return { buffer };
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'ENOENT') {
        throw new Error(`Storage object not found: ${key}`);
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolveSafePath(key);
    try {
      await fs.promises.unlink(fullPath);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'ENOENT') {
        return; // Idempotent deletion
      }
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.resolveSafePath(key);
    try {
      await fs.promises.access(fullPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

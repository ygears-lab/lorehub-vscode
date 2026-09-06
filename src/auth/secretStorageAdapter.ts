import * as vscode from 'vscode';
import type { SupportedStorage } from '@supabase/supabase-js';

export class SecretStorageAdapter implements SupportedStorage {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getItem(key: string): Promise<string | null> {
    const value = await this.secrets.get(key);
    return value ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.secrets.store(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await this.secrets.delete(key);
  }
}

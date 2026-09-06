import * as vscode from 'vscode';

export interface ParsedCallback {
  code?: string;
  error?: string;
  errorDescription?: string;
}

export function parseCallbackUri(uri: vscode.Uri): ParsedCallback | null {
  if (uri.path !== '/auth-callback') {
    return null;
  }
  const params = new URLSearchParams(uri.query);
  return {
    code: params.get('code') ?? undefined,
    error: params.get('error') ?? undefined,
    errorDescription: params.get('error_description') ?? undefined,
  };
}

type PendingResolver = (result: ParsedCallback) => void;

export class LoreHubUriHandler implements vscode.UriHandler {
  private pending: PendingResolver | null = null;

  handleUri(uri: vscode.Uri): void {
    const parsed = parseCallbackUri(uri);
    if (!parsed || !this.pending) {
      return;
    }
    const resolve = this.pending;
    this.pending = null;
    resolve(parsed);
  }

  waitForCallback(): Promise<ParsedCallback> {
    this.pending = null;
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  cancelPending(): void {
    this.pending = null;
  }
}

import * as vscode from 'vscode';
import type { AuthService } from '../auth/authService';
import type { LabelService } from '../label/labelService';
import type { LabelRecord } from '../label/types';
import { SessionRejectedError } from '../auth/sessionRejection';
import { LabelNetworkError, LabelValidationError } from '../label/validation';
import type { LoadService } from '../load/loadService';
import { LoadValidationError } from '../load/validation';
import type { MdService } from '../md/mdService';
import type { MdListPayload } from '../md/types';
import { MdNetworkError, MdValidationError } from '../md/validation';
import { getHtmlForWebview } from './html';
import type { ErrorKind, HostToWebviewMessage, WebviewToHostMessage } from './protocol';

export class MdPanel {
  private static currentPanel: MdPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];

  static createOrShow(
    context: vscode.ExtensionContext,
    authService: AuthService,
    mdService: MdService,
    labelService: LabelService,
    loadService: LoadService,
  ): void {
    if (MdPanel.currentPanel) {
      MdPanel.currentPanel.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'lorehub.mdPanel',
      vscode.l10n.t('LoreHub: My md Files'),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(context.extensionUri, 'media'),
        ],
      },
    );
    MdPanel.currentPanel = new MdPanel(panel, context, authService, mdService, labelService, loadService);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly authService: AuthService,
    private readonly mdService: MdService,
    private readonly labelService: LabelService,
    private readonly loadService: LoadService,
  ) {
    this.panel.webview.html = getHtmlForWebview(this.panel.webview, context.extensionUri);

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => void this.handleMessage(message)),
      this.authService.onDidChangeAuthState((state) =>
        this.post({ type: 'authStateChanged', authState: state.status, userLabel: this.userLabel() }),
      ),
      this.panel.onDidDispose(() => this.dispose()),
    );
  }

  private post(message: HostToWebviewMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private userLabel(): string | undefined {
    const user = this.authService.getState().user;
    return (user?.user_metadata?.user_name as string | undefined) ?? user?.email ?? undefined;
  }

  private async handleMessage(message: WebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case 'ready': {
        const state = this.authService.getState();
        const authenticated = state.status === 'authenticated';
        const list = authenticated ? await this.safeList() : undefined;
        const labels = authenticated ? await this.safeLabels() : undefined;
        this.post({ type: 'init', authState: state.status, userLabel: this.userLabel(), list, labels });
        return;
      }
      case 'requestList':
      case 'retryOnline': {
        const payload = await this.safeList(message.labelIds);
        if (payload) {
          this.post({ type: 'mdList', payload });
        }
        return;
      }
      case 'requestLabels': {
        const labels = await this.safeLabels();
        if (labels) {
          this.post({ type: 'labelList', labels });
        }
        return;
      }
      case 'create': {
        if (!this.requireAuth(message.requestId)) {return;}
        try {
          const { title, filename, content } = message;
          const record = await this.mdService.create({ title, filename, content });
          this.post({ type: 'mdCreated', record });
        } catch (err) {
          this.postError(err, message.requestId);
        }
        return;
      }
      case 'update': {
        if (!this.requireAuth(message.requestId)) {return;}
        const { title, filename, content } = message;
        try {
          const record = await this.mdService.update(message.id, { title, filename, content });
          this.post({ type: 'mdUpdated', record });
        } catch (err) {
          this.postError(err, message.requestId);
        }
        return;
      }
      case 'delete': {
        if (!this.requireAuth(message.requestId)) {return;}
        const confirmDelete = vscode.l10n.t('Delete');
        const choice = await vscode.window.showWarningMessage(
          vscode.l10n.t('LoreHub: Delete "{0}"?', message.title),
          { modal: true },
          confirmDelete,
        );
        if (choice !== confirmDelete) {
          return;
        }
        try {
          await this.mdService.softDelete(message.id);
          this.post({ type: 'mdDeleted', id: message.id });
        } catch (err) {
          this.postError(err, message.requestId);
        }
        return;
      }
      case 'importLocalFile': {
        if (!this.requireAuth(message.requestId)) {return;}
        const uris = await vscode.window.showOpenDialog({ canSelectMany: false });
        if (!uris || uris.length === 0) {
          return;
        }
        try {
          const record = await this.mdService.importFromFile(uris[0]);
          this.post({ type: 'mdCreated', record });
        } catch (err) {
          this.postError(err, message.requestId);
        }
        return;
      }
      case 'loadToProject': {
        if (!this.requireAuth(message.requestId)) {return;}
        try {
          const record = await this.mdService.get(message.id);
          await this.loadService.load(record);
        } catch (err) {
          this.postError(err, message.requestId);
        }
        return;
      }
      case 'createLabel': {
        if (!this.requireAuth(message.requestId)) {return;}
        try {
          const label = await this.labelService.create(message.name);
          this.post({ type: 'labelCreated', label });
        } catch (err) {
          this.postError(err, message.requestId);
        }
        return;
      }
      case 'renameLabel': {
        if (!this.requireAuth(message.requestId)) {return;}
        try {
          const label = await this.labelService.rename(message.id, message.name);
          this.post({ type: 'labelRenamed', label });
        } catch (err) {
          this.postError(err, message.requestId);
        }
        return;
      }
      case 'deleteLabel': {
        if (!this.requireAuth(message.requestId)) {return;}
        const confirmDelete = vscode.l10n.t('Delete');
        const choice = await vscode.window.showWarningMessage(
          vscode.l10n.t(
            'LoreHub: Delete the label "{0}"? It is removed from every md it is attached to.',
            message.name,
          ),
          { modal: true },
          confirmDelete,
        );
        if (choice !== confirmDelete) {
          return;
        }
        try {
          await this.labelService.remove(message.id);
          this.post({ type: 'labelDeleted', id: message.id });
        } catch (err) {
          this.postError(err, message.requestId);
        }
        return;
      }
      case 'assignLabel':
      case 'unassignLabel': {
        if (!this.requireAuth(message.requestId)) {return;}
        try {
          if (message.type === 'assignLabel') {
            await this.labelService.assign(message.mdId, message.labelId);
          } else {
            await this.labelService.unassign(message.mdId, message.labelId);
          }
          const labelMap = await this.labelService.listLabelIdsForMdIds([message.mdId]);
          this.post({ type: 'mdLabelsChanged', mdId: message.mdId, labelIds: labelMap.get(message.mdId) ?? [] });
        } catch (err) {
          this.postError(err, message.requestId);
        }
        return;
      }
      case 'openLogin':
        await vscode.commands.executeCommand('lorehub.login');
        return;
    }
  }

  private requireAuth(requestId?: string): boolean {
    if (this.authService.isAuthenticated()) {
      return true;
    }
    this.post({ type: 'error', kind: 'auth', message: vscode.l10n.t('You need to be logged in'), requestId });
    return false;
  }

  private async safeList(labelIds?: string[]): Promise<MdListPayload | undefined> {
    try {
      const payload = await this.mdService.list({ labelIds });
      this.post({ type: 'offlineChanged', offline: payload.offline });
      return payload;
    } catch (err) {
      this.postError(err);
      return undefined;
    }
  }

  private async safeLabels(): Promise<LabelRecord[] | undefined> {
    try {
      return await this.labelService.list();
    } catch (err) {
      this.postError(err);
      return undefined;
    }
  }

  private postError(err: unknown, requestId?: string): void {
    // サーバーにトークンを拒否された場合は、生のJWTエラー文を見せてもユーザーには
    // 何をすればよいか分からない。文言を差し替えたうえで再認証の導線へ流す。
    if (err instanceof SessionRejectedError) {
      this.post({
        type: 'error',
        kind: 'auth',
        message: vscode.l10n.t('Your session is no longer valid. Please log in again'),
        requestId,
      });
      void this.authService.handleRejectedSession();
      return;
    }

    // LoadValidationErrorはローカル操作の失敗なので、network側に混ぜてオフライン扱いにしないこと。
    const kind: ErrorKind =
      err instanceof MdValidationError || err instanceof LabelValidationError || err instanceof LoadValidationError
        ? 'validation'
        : err instanceof MdNetworkError || err instanceof LabelNetworkError
          ? 'network'
          : 'unknown';
    const message = err instanceof Error ? err.message : String(err);
    this.post({ type: 'error', kind, message, requestId });
    if (kind === 'network') {
      this.post({ type: 'offlineChanged', offline: true });
    }
  }

  private dispose(): void {
    MdPanel.currentPanel = undefined;
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.panel.dispose();
  }
}

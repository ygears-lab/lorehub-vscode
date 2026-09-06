import type { LabelRecord } from '../label/types';
import type { MdListPayload, MdRecord } from '../md/types';

export type AuthUiState = 'unauthenticated' | 'authenticating' | 'authenticated';

export type ErrorKind = 'validation' | 'network' | 'auth' | 'unknown';

export type HostToWebviewMessage =
  | { type: 'init'; authState: AuthUiState; userLabel?: string; list?: MdListPayload; labels?: LabelRecord[] }
  | { type: 'authStateChanged'; authState: AuthUiState; userLabel?: string }
  | { type: 'mdList'; payload: MdListPayload }
  | { type: 'mdCreated'; record: MdRecord }
  | { type: 'mdUpdated'; record: MdRecord }
  | { type: 'mdDeleted'; id: string }
  | { type: 'labelList'; labels: LabelRecord[] }
  | { type: 'labelCreated'; label: LabelRecord }
  | { type: 'labelRenamed'; label: LabelRecord }
  | { type: 'labelDeleted'; id: string }
  | { type: 'mdLabelsChanged'; mdId: string; labelIds: string[] }
  | { type: 'offlineChanged'; offline: boolean }
  | { type: 'error'; kind: ErrorKind; message: string; requestId?: string };

export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'requestList'; labelIds?: string[] }
  | { type: 'create'; requestId: string; title: string; filename: string; content: string }
  | { type: 'update'; requestId: string; id: string; title?: string; filename?: string; content?: string }
  | { type: 'delete'; requestId: string; id: string; title: string }
  | { type: 'importLocalFile'; requestId: string }
  | { type: 'loadToProject'; requestId: string; id: string }
  | { type: 'requestLabels' }
  | { type: 'createLabel'; requestId: string; name: string }
  | { type: 'renameLabel'; requestId: string; id: string; name: string }
  | { type: 'deleteLabel'; requestId: string; id: string; name: string }
  | { type: 'assignLabel'; requestId: string; mdId: string; labelId: string }
  | { type: 'unassignLabel'; requestId: string; mdId: string; labelId: string }
  | { type: 'openLogin' }
  | { type: 'retryOnline'; labelIds?: string[] };

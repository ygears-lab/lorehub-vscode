import type { HostToWebviewMessage, WebviewToHostMessage } from './protocol';
import type { LabelRecord } from '../label/types';
import type { MdListPayload, MdRecord } from '../md/types';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHostMessage): void;
};

const vscodeApi = acquireVsCodeApi();

type AuthUiState = 'unauthenticated' | 'authenticating' | 'authenticated';
type Draft = { title: string; filename: string; content: string };

let authState: AuthUiState = 'unauthenticated';
let records: MdRecord[] = [];
let offline = false;
let selectedId: string | undefined;
let draft: Draft | null = null;
let dirty = false;
let errorMessage: string | null = null;
let labels: LabelRecord[] = [];
let activeLabelFilter = new Set<string>();
let searchQuery = '';
let newLabelDraft = '';
let renamingLabelId: string | null = null;
let renameDraft = '';
let labelAdderOpen = false;
let labelPickerOpen = false;
let labelPickerQuery = '';
let labelPickerIndex = 0;
/** ポップオーバーから「作成して付与」したときに、作成完了を待って付与する相手のmd。 */
let pendingAssignMdId: string | null = null;

/** 再描画のあとにフォーカスを戻したい要素の data-focus-key。全体再描画でフォーカスが飛ぶため。 */
let pendingFocusKey: string | null = null;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('LoreHub: #root要素が見つかりません');
}
const root: HTMLElement = rootElement;

function post(message: WebviewToHostMessage): void {
  vscodeApi.postMessage(message);
}

function newRequestId(): string {
  return Math.random().toString(36).slice(2);
}

function render(): void {
  // 検索やラベル名の入力中も全体再描画が走るため、フォーカスとカーソル位置を跨いで維持する。
  const active = document.activeElement;
  const activeKey = active instanceof HTMLElement ? (active.dataset.focusKey ?? null) : null;
  const caret = active instanceof HTMLInputElement ? active.selectionStart : null;

  const view = authState === 'authenticated' ? renderManagementView() : renderLoginView();
  root.replaceChildren(...(errorMessage ? [renderErrorBanner(), view] : [view]));

  const focusKey = pendingFocusKey ?? activeKey;
  pendingFocusKey = null;
  if (focusKey) {
    const target = root.querySelector<HTMLInputElement>(`[data-focus-key="${focusKey}"]`);
    if (target) {
      target.focus();
      if (caret !== null) {
        target.setSelectionRange(caret, caret);
      }
    }
  }

  root.querySelector('.md-list li.selected')?.scrollIntoView({ block: 'nearest' });
  root.querySelector('.label-option.highlighted')?.scrollIntoView({ block: 'nearest' });
}

/** VSCodeのWebViewはサンドボックスiframeでalert()/confirm()等が黙って無視されるため、
 * エラー表示は必ずDOM要素として描画する。 */
function renderErrorBanner(): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.append(errorMessage ?? '');

  const dismiss = document.createElement('button');
  dismiss.textContent = '閉じる';
  dismiss.addEventListener('click', () => {
    errorMessage = null;
    render();
  });
  banner.appendChild(dismiss);

  return banner;
}

function renderLoginView(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'login-view';

  const message = document.createElement('p');
  message.textContent = authState === 'authenticating' ? 'ログイン処理中…' : 'LoreHubを使うにはログインが必要です';
  container.appendChild(message);

  const button = document.createElement('button');
  button.textContent = 'GitHubでログイン';
  button.disabled = authState === 'authenticating';
  button.addEventListener('click', () => post({ type: 'openLogin' }));
  container.appendChild(button);

  return container;
}

function renderManagementView(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'management-view';

  if (offline) {
    container.appendChild(renderOfflineBanner());
  }
  container.appendChild(renderToolbar());

  const layout = document.createElement('div');
  layout.className = 'layout';
  layout.append(renderLabelNav(), renderListPane(), renderEditor());
  container.appendChild(layout);

  return container;
}

function renderOfflineBanner(): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'offline-banner';
  banner.append('オフラインです。表示中のデータはキャッシュです。');

  const retry = document.createElement('button');
  retry.textContent = '再試行';
  retry.addEventListener('click', () => post({ type: 'retryOnline' }));
  banner.appendChild(retry);

  return banner;
}

function renderToolbar(): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const newButton = document.createElement('button');
  newButton.textContent = '新規作成';
  newButton.title = '新規作成 (Ctrl/Cmd+N)';
  newButton.disabled = offline;
  newButton.addEventListener('click', onNew);

  const importButton = document.createElement('button');
  importButton.textContent = 'インポート';
  importButton.disabled = offline;
  importButton.addEventListener('click', () => post({ type: 'importLocalFile', requestId: newRequestId() }));

  toolbar.append(newButton, importButton);
  return toolbar;
}

function labelName(id: string): string {
  return labels.find((label) => label.id === id)?.name ?? '';
}

function labelCount(id: string): number {
  return records.reduce((count, record) => (record.labelIds.includes(id) ? count + 1 : count), 0);
}

// ---------------------------------------------------------------------------
// 左カラム: ラベルナビゲーション
// 絞り込み・作成・リネーム・削除をすべてこのカラムに集約する（別パネルのトグルは廃止）。
// ---------------------------------------------------------------------------

function renderLabelNav(): HTMLElement {
  const nav = document.createElement('div');
  nav.className = 'label-nav';

  const heading = document.createElement('div');
  heading.className = 'pane-heading';
  heading.textContent = 'ラベル';
  nav.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'label-nav-list';

  list.appendChild(renderLabelNavAllRow());
  for (const label of labels) {
    list.appendChild(label.id === renamingLabelId ? renderLabelRenameRow(label) : renderLabelNavRow(label));
  }
  if (labels.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'pane-hint';
    hint.textContent = 'ラベルはまだありません';
    list.appendChild(hint);
  }
  nav.appendChild(list);

  nav.appendChild(renderLabelAdder());
  return nav;
}

function renderLabelNavAllRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'label-nav-row';

  const item = document.createElement('button');
  item.className = 'label-nav-item';
  if (activeLabelFilter.size === 0) {
    item.classList.add('active');
  }
  item.addEventListener('click', () => {
    activeLabelFilter = new Set();
    render();
  });

  const name = document.createElement('span');
  name.className = 'label-nav-name';
  name.textContent = 'すべて';

  const count = document.createElement('span');
  count.className = 'label-nav-count';
  count.textContent = String(records.length);

  item.append(name, count);
  row.appendChild(item);
  return row;
}

function renderLabelNavRow(label: LabelRecord): HTMLElement {
  const row = document.createElement('div');
  row.className = 'label-nav-row';

  const item = document.createElement('button');
  item.className = 'label-nav-item';
  if (activeLabelFilter.has(label.id)) {
    item.classList.add('active');
  }
  item.title = `${label.name} で絞り込み`;
  item.addEventListener('click', () => {
    if (activeLabelFilter.has(label.id)) {
      activeLabelFilter.delete(label.id);
    } else {
      activeLabelFilter.add(label.id);
    }
    render();
  });

  const name = document.createElement('span');
  name.className = 'label-nav-name';
  name.textContent = label.name;

  const count = document.createElement('span');
  count.className = 'label-nav-count';
  count.textContent = String(labelCount(label.id));

  item.append(name, count);

  const actions = document.createElement('div');
  actions.className = 'label-nav-actions';

  const rename = document.createElement('button');
  rename.className = 'icon-button';
  rename.textContent = '✎';
  rename.title = 'ラベル名を変更';
  rename.disabled = offline;
  rename.addEventListener('click', () => {
    renamingLabelId = label.id;
    renameDraft = label.name;
    pendingFocusKey = 'label-rename';
    render();
  });

  const remove = document.createElement('button');
  remove.className = 'icon-button';
  remove.textContent = '✕';
  remove.title = 'ラベルを削除';
  remove.disabled = offline;
  remove.addEventListener('click', () => {
    post({ type: 'deleteLabel', requestId: newRequestId(), id: label.id, name: label.name });
  });

  actions.append(rename, remove);
  row.append(item, actions);
  return row;
}

function renderLabelRenameRow(label: LabelRecord): HTMLElement {
  const row = document.createElement('div');
  row.className = 'label-nav-row editing';

  const input = document.createElement('input');
  input.className = 'label-nav-input';
  input.dataset.focusKey = 'label-rename';
  input.value = renameDraft;
  input.disabled = offline;
  input.addEventListener('input', () => {
    renameDraft = input.value;
  });

  const commit = (): void => {
    post({ type: 'renameLabel', requestId: newRequestId(), id: label.id, name: input.value });
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  });

  const confirm = document.createElement('button');
  confirm.className = 'icon-button';
  confirm.textContent = '✓';
  confirm.title = '変更を確定';
  confirm.disabled = offline;
  confirm.addEventListener('click', commit);

  const cancel = document.createElement('button');
  cancel.className = 'icon-button';
  cancel.textContent = '✕';
  cancel.title = 'キャンセル';
  cancel.addEventListener('click', () => {
    renamingLabelId = null;
    render();
  });

  row.append(input, confirm, cancel);
  return row;
}

function renderLabelAdder(): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'label-nav-footer';

  if (!labelAdderOpen) {
    const open = document.createElement('button');
    open.className = 'text-button';
    open.textContent = '＋ ラベル追加';
    open.disabled = offline;
    open.addEventListener('click', () => {
      labelAdderOpen = true;
      pendingFocusKey = 'label-add';
      render();
    });
    footer.appendChild(open);
    return footer;
  }

  const input = document.createElement('input');
  input.className = 'label-nav-input';
  input.dataset.focusKey = 'label-add';
  input.placeholder = '新しいラベル名';
  input.value = newLabelDraft;
  input.disabled = offline;
  input.addEventListener('input', () => {
    newLabelDraft = input.value;
  });

  const commit = (): void => {
    if (!input.value.trim()) {
      return;
    }
    post({ type: 'createLabel', requestId: newRequestId(), name: input.value });
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  });

  const add = document.createElement('button');
  add.className = 'icon-button';
  add.textContent = '✓';
  add.title = '追加';
  add.disabled = offline;
  add.addEventListener('click', commit);

  const cancel = document.createElement('button');
  cancel.className = 'icon-button';
  cancel.textContent = '✕';
  cancel.title = 'キャンセル';
  cancel.addEventListener('click', () => {
    labelAdderOpen = false;
    newLabelDraft = '';
    render();
  });

  footer.append(input, add, cancel);
  return footer;
}

// ---------------------------------------------------------------------------
// 中央カラム: md一覧（検索・更新日時・更新日時降順ソート）
// 検索もラベル絞り込みもクライアント側で完結させ、ラベルの件数表示と常に一致させる。
// ---------------------------------------------------------------------------

function visibleRecords(): MdRecord[] {
  const query = searchQuery.trim().toLowerCase();
  return records
    .filter((record) => {
      if (activeLabelFilter.size > 0 && !record.labelIds.some((id) => activeLabelFilter.has(id))) {
        return false;
      }
      if (query && !`${record.title} ${record.filename}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** ISO日時を「3日前」のような相対表示にする。一覧の1行に収める前提で粒度は粗くてよい。 */
function formatRelativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return '';
  }
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) {
    return 'たった今';
  }
  if (minutes < 60) {
    return `${minutes}分前`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}時間前`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}日前`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)}週間前`;
  }
  if (days < 365) {
    return `${Math.floor(days / 30)}か月前`;
  }
  return `${Math.floor(days / 365)}年前`;
}

function renderListPane(): HTMLElement {
  const pane = document.createElement('div');
  pane.className = 'list-pane';

  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';

  const search = document.createElement('input');
  search.className = 'search-input';
  search.dataset.focusKey = 'search';
  search.placeholder = '検索 (/)';
  search.value = searchQuery;
  search.addEventListener('input', () => {
    searchQuery = search.value;
    render();
  });
  searchBox.appendChild(search);
  pane.appendChild(searchBox);

  pane.appendChild(renderList());

  const footer = document.createElement('div');
  footer.className = 'list-footer';
  const shown = visibleRecords().length;
  footer.textContent = shown === records.length ? `${records.length} 件` : `${shown} / ${records.length} 件`;
  pane.appendChild(footer);

  return pane;
}

function renderList(): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'md-list';

  const visible = visibleRecords();
  if (visible.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'md-list-empty';
    empty.textContent = records.length === 0 ? 'mdがまだありません' : '該当するmdがありません';
    list.appendChild(empty);
    return list;
  }

  for (const record of visible) {
    const item = document.createElement('li');

    const head = document.createElement('div');
    head.className = 'md-list-head';

    const title = document.createElement('span');
    title.className = 'md-list-title';
    title.textContent = record.title || record.filename || '(無題)';

    const time = document.createElement('span');
    time.className = 'md-list-time';
    time.textContent = formatRelativeTime(record.updatedAt);

    head.append(title, time);
    item.appendChild(head);

    if (record.labelIds.length > 0) {
      const chips = document.createElement('div');
      chips.className = 'md-list-chips';
      for (const labelId of record.labelIds) {
        const name = labelName(labelId);
        if (!name) {
          continue;
        }
        const chip = document.createElement('span');
        chip.className = 'label-chip';
        chip.textContent = name;
        chips.appendChild(chip);
      }
      item.appendChild(chips);
    }

    if (record.id === selectedId) {
      item.classList.add('selected');
    }
    item.addEventListener('click', () => selectRecord(record.id));
    list.appendChild(item);
  }
  return list;
}

function selectRecord(id: string): void {
  const record = records.find((r) => r.id === id);
  if (!record) {
    return;
  }
  selectedId = id;
  draft = { title: record.title, filename: record.filename, content: record.content };
  dirty = false;
  resetLabelPicker();
  render();
}

function moveSelection(delta: number): void {
  const visible = visibleRecords();
  if (visible.length === 0) {
    return;
  }
  const current = visible.findIndex((record) => record.id === selectedId);
  const next =
    current < 0 ? (delta > 0 ? 0 : visible.length - 1) : Math.min(visible.length - 1, Math.max(0, current + delta));
  selectRecord(visible[next].id);
}

function onNew(): void {
  selectedId = undefined;
  draft = { title: '', filename: '', content: '' };
  dirty = false;
  resetLabelPicker();
  render();
}

// ---------------------------------------------------------------------------
// 右カラム: エディタ
// ---------------------------------------------------------------------------

function renderEditor(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'editor';

  if (!draft) {
    const empty = document.createElement('p');
    empty.className = 'pane-hint';
    empty.textContent = '左のリストから選択するか、新規作成してください (Ctrl/Cmd+N)';
    container.appendChild(empty);
    return container;
  }

  const currentDraft = draft;

  const titleInput = document.createElement('input');
  titleInput.className = 'title-input';
  titleInput.placeholder = 'タイトル';
  titleInput.value = currentDraft.title;
  titleInput.addEventListener('input', () => {
    currentDraft.title = titleInput.value;
    markDirty();
  });

  const filenameInput = document.createElement('input');
  filenameInput.className = 'filename-input';
  filenameInput.placeholder = 'ファイル名';
  filenameInput.value = currentDraft.filename;
  filenameInput.addEventListener('input', () => {
    currentDraft.filename = filenameInput.value;
    markDirty();
  });

  const contentArea = document.createElement('textarea');
  contentArea.className = 'content-area';
  contentArea.spellcheck = false;
  contentArea.value = currentDraft.content;
  contentArea.addEventListener('input', () => {
    currentDraft.content = contentArea.value;
    markDirty();
  });

  container.append(titleInput, filenameInput, contentArea);

  const selectedRecord = selectedId ? records.find((r) => r.id === selectedId) : undefined;
  if (selectedRecord) {
    container.appendChild(renderLabelPicker(selectedRecord));
  } else {
    const hint = document.createElement('span');
    hint.className = 'pane-hint';
    hint.textContent = '保存後にラベルを付与できます';
    container.appendChild(hint);
  }

  container.appendChild(renderActions());
  return container;
}

// ---------------------------------------------------------------------------
// ラベル付与UI
// ラベルは細かく増えていく前提なので、エディタには「そのmdに付いているラベル」だけを出す。
// 付与はQuick Pick型のポップオーバー（入力で絞り込み → Enterで付与）に閉じ込めることで、
// エディタ下部の高さがmd1件あたりのラベル数にしか比例せず、総ラベル数では膨らまないようにする。
// ---------------------------------------------------------------------------

function resetLabelPicker(): void {
  labelPickerOpen = false;
  labelPickerQuery = '';
  labelPickerIndex = 0;
  pendingAssignMdId = null;
}

function closeLabelPicker(): void {
  if (!labelPickerOpen) {
    return;
  }
  resetLabelPicker();
  render();
}

function pickerOptions(): LabelRecord[] {
  const query = labelPickerQuery.trim().toLowerCase();
  return query ? labels.filter((label) => label.name.toLowerCase().includes(query)) : labels;
}

/** 入力中の名前と同名のラベルが無いときだけ「作成して付与」行を最後に出す。 */
function pickerCanCreate(): boolean {
  const query = labelPickerQuery.trim();
  return query.length > 0 && !labels.some((label) => label.name === query);
}

function movePickerIndex(delta: number): void {
  const count = pickerOptions().length + (pickerCanCreate() ? 1 : 0);
  if (count === 0) {
    return;
  }
  labelPickerIndex = (labelPickerIndex + delta + count) % count;
  pendingFocusKey = 'label-picker';
  render();
}

function toggleLabel(record: MdRecord, label: LabelRecord): void {
  post({
    type: record.labelIds.includes(label.id) ? 'unassignLabel' : 'assignLabel',
    requestId: newRequestId(),
    mdId: record.id,
    labelId: label.id,
  });
  // 応答(mdLabelsChanged)での再描画までpendingFocusKeyは保持されるので、続けて操作できる。
  pendingFocusKey = 'label-picker';
}

function createAndAssign(record: MdRecord): void {
  const name = labelPickerQuery.trim();
  if (!name) {
    return;
  }
  pendingAssignMdId = record.id;
  post({ type: 'createLabel', requestId: newRequestId(), name });
}

function activatePickerRow(record: MdRecord): void {
  const options = pickerOptions();
  if (labelPickerIndex < options.length) {
    toggleLabel(record, options[labelPickerIndex]);
    return;
  }
  if (pickerCanCreate()) {
    createAndAssign(record);
  }
}

function renderLabelPicker(record: MdRecord): HTMLElement {
  const picker = document.createElement('div');
  picker.className = 'label-picker';

  const caption = document.createElement('span');
  caption.className = 'pane-hint';
  caption.textContent = 'ラベル:';
  picker.appendChild(caption);

  // labelsは名前順に整列済みなので、付与済みチップも常に同じ並びになる。
  const assigned = labels.filter((label) => record.labelIds.includes(label.id));
  if (assigned.length === 0) {
    const none = document.createElement('span');
    none.className = 'pane-hint';
    none.textContent = '未設定';
    picker.appendChild(none);
  }

  for (const label of assigned) {
    const chip = document.createElement('span');
    chip.className = 'label-chip label-chip-assigned';
    chip.append(label.name);

    const remove = document.createElement('button');
    remove.className = 'chip-remove';
    remove.textContent = '✕';
    remove.title = `${label.name} を外す`;
    remove.disabled = offline;
    remove.addEventListener('click', () => toggleLabel(record, label));

    chip.appendChild(remove);
    picker.appendChild(chip);
  }

  const add = document.createElement('button');
  add.className = 'chip-add';
  add.textContent = '＋ ラベル';
  add.title = 'ラベルを付ける';
  add.disabled = offline;
  add.addEventListener('click', () => {
    if (labelPickerOpen) {
      resetLabelPicker();
    } else {
      labelPickerOpen = true;
      labelPickerQuery = '';
      labelPickerIndex = 0;
      pendingFocusKey = 'label-picker';
    }
    render();
  });
  picker.appendChild(add);

  if (labelPickerOpen && !offline) {
    picker.appendChild(renderLabelPopover(record));
  }

  return picker;
}

function renderLabelPopover(record: MdRecord): HTMLElement {
  const popover = document.createElement('div');
  popover.className = 'label-popover';

  const input = document.createElement('input');
  input.className = 'label-popover-input';
  input.dataset.focusKey = 'label-picker';
  input.placeholder = '絞り込み / 新しいラベル名';
  input.value = labelPickerQuery;
  input.addEventListener('input', () => {
    labelPickerQuery = input.value;
    labelPickerIndex = 0;
    render();
  });
  // ポップオーバー内のキー操作は、一覧移動や検索クリアといった画面全体のキー操作に流さない。
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      movePickerIndex(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      activatePickerRow(record);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeLabelPicker();
    }
  });
  popover.appendChild(input);

  const list = document.createElement('div');
  list.className = 'label-popover-list';

  const options = pickerOptions();
  options.forEach((label, index) => {
    const isAssigned = record.labelIds.includes(label.id);

    const row = document.createElement('button');
    row.className = 'label-option';
    if (index === labelPickerIndex) {
      row.classList.add('highlighted');
    }

    const check = document.createElement('span');
    check.className = 'label-option-check';
    check.textContent = isAssigned ? '✓' : '';

    const name = document.createElement('span');
    name.className = 'label-option-name';
    name.textContent = label.name;

    const count = document.createElement('span');
    count.className = 'label-option-count';
    count.textContent = String(labelCount(label.id));

    row.append(check, name, count);
    row.addEventListener('click', () => {
      labelPickerIndex = index;
      toggleLabel(record, label);
    });
    list.appendChild(row);
  });

  if (pickerCanCreate()) {
    const create = document.createElement('button');
    create.className = 'label-option label-option-create';
    if (labelPickerIndex >= options.length) {
      create.classList.add('highlighted');
    }
    create.textContent = `「${labelPickerQuery.trim()}」を作成して付与`;
    create.addEventListener('click', () => createAndAssign(record));
    list.appendChild(create);
  } else if (options.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pane-hint';
    empty.textContent = 'ラベルがありません';
    list.appendChild(empty);
  }

  popover.appendChild(list);
  return popover;
}

/** ポップオーバーの外をクリックしたら閉じる。 */
document.addEventListener('click', (event) => {
  if (!labelPickerOpen) {
    return;
  }
  if (event.target instanceof Element && event.target.closest('.label-picker')) {
    return;
  }
  closeLabelPicker();
});

function renderActions(): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'actions';

  const dirtyIndicator = document.createElement('span');
  dirtyIndicator.className = 'dirty-indicator';
  dirtyIndicator.textContent = dirty ? '● 未保存の変更があります' : '';
  actions.appendChild(dirtyIndicator);

  const saveButton = document.createElement('button');
  saveButton.className = 'save-button';
  saveButton.textContent = '保存';
  saveButton.title = '保存 (Ctrl/Cmd+S)';
  saveButton.disabled = offline || !dirty;
  saveButton.addEventListener('click', onSave);
  actions.appendChild(saveButton);

  if (selectedId) {
    const id = selectedId;

    const loadButton = document.createElement('button');
    loadButton.className = 'load-button';
    loadButton.textContent = 'プロジェクトにロード';
    // ロードはローカルファイルへの書き出しなので、保存・削除と違いオフラインでも実行できる。
    // ただしロードされるのは保存済みの内容なので、未保存の変更がある間は押させない。
    loadButton.disabled = dirty;
    loadButton.addEventListener('click', () => post({ type: 'loadToProject', requestId: newRequestId(), id }));
    actions.appendChild(loadButton);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'secondary-button';
    deleteButton.textContent = '削除';
    deleteButton.disabled = offline;
    deleteButton.addEventListener('click', () => {
      post({ type: 'delete', requestId: newRequestId(), id, title: draft?.title || draft?.filename || '' });
    });
    actions.appendChild(deleteButton);
  }

  return actions;
}

/** キー入力のたびに全体を再描画するとtextarea/inputのフォーカスとカーソル位置が失われるため、
 * dirtyフラグが false→true に変わった最初の瞬間だけ、保存ボタンとインジケータをその場で更新する。 */
function markDirty(): void {
  if (dirty) {
    return;
  }
  dirty = true;
  const indicator = document.querySelector<HTMLElement>('.dirty-indicator');
  if (indicator) {
    indicator.textContent = '● 未保存の変更があります';
  }
  const saveButton = document.querySelector<HTMLButtonElement>('.save-button');
  if (saveButton) {
    saveButton.disabled = offline;
  }
  const loadButton = document.querySelector<HTMLButtonElement>('.load-button');
  if (loadButton) {
    loadButton.disabled = true;
  }
}

function onSave(): void {
  if (!draft) {
    return;
  }
  if (selectedId) {
    post({ type: 'update', requestId: newRequestId(), id: selectedId, ...draft });
  } else {
    post({ type: 'create', requestId: newRequestId(), ...draft });
  }
}

// ---------------------------------------------------------------------------
// キーボード操作
// ---------------------------------------------------------------------------

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function isSearchInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement && target.dataset.focusKey === 'search';
}

function focusSearch(): void {
  root.querySelector<HTMLInputElement>('[data-focus-key="search"]')?.focus();
}

document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (authState !== 'authenticated') {
    return;
  }
  const modifier = event.ctrlKey || event.metaKey;

  if (modifier && event.key === 's') {
    event.preventDefault();
    if (draft && dirty && !offline) {
      onSave();
    }
    return;
  }
  if (modifier && event.key === 'n') {
    event.preventDefault();
    if (!offline) {
      onNew();
    }
    return;
  }
  if (modifier) {
    return;
  }

  if (event.key === 'Escape') {
    if (labelPickerOpen) {
      event.preventDefault();
      closeLabelPicker();
      return;
    }
    if (renamingLabelId !== null || labelAdderOpen) {
      renamingLabelId = null;
      labelAdderOpen = false;
      event.preventDefault();
      render();
      return;
    }
    if (searchQuery) {
      searchQuery = '';
      pendingFocusKey = 'search';
      event.preventDefault();
      render();
      return;
    }
    if (errorMessage) {
      errorMessage = null;
      event.preventDefault();
      render();
    }
    return;
  }

  if (event.key === '/' && !isTextField(event.target)) {
    event.preventDefault();
    focusSearch();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (isTextField(event.target) && !isSearchInput(event.target)) {
      return;
    }
    event.preventDefault();
    if (isSearchInput(event.target)) {
      pendingFocusKey = 'search';
    }
    moveSelection(event.key === 'ArrowDown' ? 1 : -1);
  }
});

// ---------------------------------------------------------------------------
// ホストからのメッセージ
// ---------------------------------------------------------------------------

function applyList(payload: MdListPayload): void {
  records = payload.records;
  offline = payload.offline;
  if (selectedId && !records.some((r) => r.id === selectedId)) {
    selectedId = undefined;
    draft = null;
  }
  render();
}

window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      authState = message.authState;
      labels = message.labels ?? [];
      if (message.list) {
        applyList(message.list);
      } else {
        render();
      }
      return;
    case 'authStateChanged':
      authState = message.authState;
      if (authState === 'authenticated') {
        post({ type: 'requestList' });
        post({ type: 'requestLabels' });
      } else {
        records = [];
        selectedId = undefined;
        draft = null;
        labels = [];
        activeLabelFilter = new Set();
        searchQuery = '';
        renamingLabelId = null;
        labelAdderOpen = false;
        resetLabelPicker();
      }
      render();
      return;
    case 'mdList':
      applyList(message.payload);
      return;
    case 'mdCreated':
      errorMessage = null;
      records = [message.record, ...records];
      selectedId = message.record.id;
      draft = { title: message.record.title, filename: message.record.filename, content: message.record.content };
      dirty = false;
      // 作ったばかりのmdはラベルが無く検索語にも一致しないため、絞り込みを解いて必ず一覧に見えるようにする。
      activeLabelFilter = new Set();
      searchQuery = '';
      render();
      return;
    case 'mdUpdated':
      errorMessage = null;
      records = records.map((r) => (r.id === message.record.id ? message.record : r));
      if (selectedId === message.record.id) {
        draft = { title: message.record.title, filename: message.record.filename, content: message.record.content };
        dirty = false;
      }
      render();
      return;
    case 'mdDeleted':
      errorMessage = null;
      records = records.filter((r) => r.id !== message.id);
      if (selectedId === message.id) {
        selectedId = undefined;
        draft = null;
      }
      render();
      return;
    case 'labelList':
      labels = message.labels;
      render();
      return;
    case 'labelCreated':
      errorMessage = null;
      labels = [...labels, message.label].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      newLabelDraft = '';
      if (pendingAssignMdId) {
        // エディタのポップオーバーから作った場合は、作成に続けて付与まで済ませる。
        post({ type: 'assignLabel', requestId: newRequestId(), mdId: pendingAssignMdId, labelId: message.label.id });
        pendingAssignMdId = null;
        labelPickerQuery = '';
        labelPickerIndex = 0;
        pendingFocusKey = 'label-picker';
      } else {
        // 連続して作りたいことが多いので入力欄は開いたままにし、フォーカスも戻す。
        pendingFocusKey = 'label-add';
      }
      render();
      return;
    case 'labelRenamed':
      errorMessage = null;
      labels = labels
        .map((label) => (label.id === message.label.id ? message.label : label))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      renamingLabelId = null;
      render();
      return;
    case 'labelDeleted':
      errorMessage = null;
      labels = labels.filter((label) => label.id !== message.id);
      activeLabelFilter.delete(message.id);
      if (renamingLabelId === message.id) {
        renamingLabelId = null;
      }
      labelPickerIndex = 0;
      records = records.map((r) => ({ ...r, labelIds: r.labelIds.filter((id) => id !== message.id) }));
      render();
      return;
    case 'mdLabelsChanged':
      errorMessage = null;
      records = records.map((r) => (r.id === message.mdId ? { ...r, labelIds: message.labelIds } : r));
      render();
      return;
    case 'offlineChanged':
      offline = message.offline;
      render();
      return;
    case 'error':
      errorMessage = message.message;
      // 作成が失敗した場合、この予約を残すと次に作った無関係なラベルが付与されてしまう。
      pendingAssignMdId = null;
      render();
      return;
  }
});

render();
post({ type: 'ready' });

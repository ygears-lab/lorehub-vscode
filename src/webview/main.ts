import type { HostToWebviewMessage, WebviewToHostMessage } from './protocol';
import { LABEL_COLORS, isLabelColor, type LabelColor } from '../label/colors';
import type { LabelRecord } from '../label/types';
import type { MdListPayload, MdRecord } from '../md/types';
import { compareNames, initL10n, relativeTime, t, type L10nPayload } from './l10n';

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
let newLabelColor: LabelColor | null = null;
let renamingLabelId: string | null = null;
let renameDraft = '';
let renameColorDraft: LabelColor | null = null;
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
  throw new Error('LoreHub: the #root element was not found');
}
const root: HTMLElement = rootElement;

// 文言はホスト側(html.ts)が data-l10n に埋め込んでいる。最初の描画より前に読み込む。
initL10n(parseL10nPayload(root.dataset.l10n));

function parseL10nPayload(raw: string | undefined): L10nPayload | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as L10nPayload;
  } catch {
    // 辞書が壊れていても画面自体は英語で使えるようにする。
    return null;
  }
}

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
  dismiss.textContent = t('Dismiss');
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
  message.textContent =
    authState === 'authenticating' ? t('Signing in…') : t('Sign in to start using LoreHub');
  container.appendChild(message);

  const button = document.createElement('button');
  button.textContent = t('Sign in with GitHub');
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
  banner.append(t('You are offline. The data shown comes from the cache.'));

  const retry = document.createElement('button');
  retry.textContent = t('Retry');
  retry.addEventListener('click', () => post({ type: 'retryOnline' }));
  banner.appendChild(retry);

  return banner;
}

function renderToolbar(): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const newButton = document.createElement('button');
  newButton.textContent = t('New');
  newButton.title = t('Create a new md');
  newButton.disabled = offline;
  newButton.addEventListener('click', onNew);

  const importButton = document.createElement('button');
  importButton.textContent = t('Import');
  importButton.disabled = offline;
  importButton.addEventListener('click', () => post({ type: 'importLocalFile', requestId: newRequestId() }));

  toolbar.append(newButton, importButton);
  return toolbar;
}

function labelCount(id: string): number {
  return records.reduce((count, record) => (record.labelIds.includes(id) ? count + 1 : count), 0);
}

/** ラベル色は8色固定パレットのCSSクラス(main.css の .lh-color-*)にそのまま対応させる。 */
function applyLabelColorClass(el: HTMLElement, color: string | null | undefined): void {
  if (isLabelColor(color)) {
    el.classList.add(`lh-color-${color}`);
  }
}

/** ラベル作成/リネームフォーム共通の8色スウォッチ（＋「色なし」）。 */
function renderColorSwatches(selected: LabelColor | null, onSelect: (color: LabelColor | null) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'color-swatches';

  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'color-swatch color-swatch-none';
  none.title = t('No color');
  none.setAttribute('aria-pressed', String(selected === null));
  if (selected === null) {
    none.classList.add('selected');
  }
  none.addEventListener('click', () => onSelect(null));
  row.appendChild(none);

  LABEL_COLORS.forEach((color, index) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = `color-swatch lh-color-${color}`;
    swatch.title = t('Color {0}', index + 1);
    swatch.setAttribute('aria-pressed', String(selected === color));
    if (selected === color) {
      swatch.classList.add('selected');
    }
    swatch.addEventListener('click', () => onSelect(color));
    row.appendChild(swatch);
  });

  return row;
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
  heading.textContent = t('Labels');
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
    hint.textContent = t('No labels yet');
    list.appendChild(hint);
  }
  nav.appendChild(list);

  const status = renderFilterStatus();
  if (status) {
    nav.appendChild(status);
  }
  nav.appendChild(renderLabelAdder());
  return nav;
}

/** 選択状態を色の違いだけに頼らせない。チェック欄を常に確保しておくことで、
 * 「ここは押すとON/OFFが切り替わる欄で、複数選べる」ことを押す前に伝える。 */
function renderCheckMark(checked: boolean): HTMLElement {
  const check = document.createElement('span');
  check.className = 'label-nav-check';
  check.textContent = checked ? '✓' : '';
  return check;
}

function renderLabelNavAllRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'label-nav-row';

  const active = activeLabelFilter.size === 0;

  const item = document.createElement('button');
  item.className = 'label-nav-item';
  item.setAttribute('aria-pressed', String(active));
  if (active) {
    item.classList.add('active');
  }
  item.title = t('Clear the filter and show everything');
  item.addEventListener('click', () => {
    activeLabelFilter = new Set();
    render();
  });

  const name = document.createElement('span');
  name.className = 'label-nav-name';
  name.textContent = t('All');

  const count = document.createElement('span');
  count.className = 'label-nav-count';
  count.textContent = String(records.length);

  item.append(renderCheckMark(active), name, count);
  row.appendChild(item);
  return row;
}

/** 絞り込み中だけ出す状態表示。複数選択がOR条件であることは見ただけでは分からないので、
 * 2件以上のときに明示し、あわせて解除の導線を置く。 */
function renderFilterStatus(): HTMLElement | null {
  if (activeLabelFilter.size === 0) {
    return null;
  }

  const status = document.createElement('div');
  status.className = 'filter-status';

  if (activeLabelFilter.size >= 2) {
    const summary = document.createElement('span');
    summary.className = 'filter-status-summary';
    summary.textContent = t('Any of {0} labels', activeLabelFilter.size);
    status.appendChild(summary);
  }

  const clear = document.createElement('button');
  clear.className = 'text-button';
  clear.textContent = t('Clear filter');
  clear.addEventListener('click', () => {
    activeLabelFilter = new Set();
    render();
  });
  status.appendChild(clear);

  return status;
}

function renderLabelNavRow(label: LabelRecord): HTMLElement {
  const row = document.createElement('div');
  row.className = 'label-nav-row';

  const active = activeLabelFilter.has(label.id);

  const item = document.createElement('button');
  item.className = 'label-nav-item';
  item.setAttribute('aria-pressed', String(active));
  if (active) {
    item.classList.add('active');
  }
  item.title = active ? t('Stop filtering by {0}', label.name) : t('Filter by {0}', label.name);
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

  const parts = [renderCheckMark(active)];
  if (isLabelColor(label.color)) {
    const dot = document.createElement('span');
    dot.className = 'label-nav-color-dot';
    applyLabelColorClass(dot, label.color);
    parts.push(dot);
  }
  item.append(...parts, name, count);

  const actions = document.createElement('div');
  actions.className = 'label-nav-actions';

  const rename = document.createElement('button');
  rename.className = 'icon-button';
  rename.textContent = '✎';
  rename.title = t('Rename the label');
  rename.disabled = offline;
  rename.addEventListener('click', () => {
    renamingLabelId = label.id;
    renameDraft = label.name;
    renameColorDraft = isLabelColor(label.color) ? label.color : null;
    pendingFocusKey = 'label-rename';
    render();
  });

  const remove = document.createElement('button');
  remove.className = 'icon-button';
  remove.textContent = '✕';
  remove.title = t('Delete the label');
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
    post({ type: 'renameLabel', requestId: newRequestId(), id: label.id, name: input.value, color: renameColorDraft });
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
  confirm.title = t('Apply the change');
  confirm.disabled = offline;
  confirm.addEventListener('click', commit);

  const cancel = document.createElement('button');
  cancel.className = 'icon-button';
  cancel.textContent = '✕';
  cancel.title = t('Cancel');
  cancel.addEventListener('click', () => {
    renamingLabelId = null;
    render();
  });

  const inputRow = document.createElement('div');
  inputRow.className = 'label-nav-row-input';
  inputRow.append(input, confirm, cancel);

  row.append(
    inputRow,
    renderColorSwatches(renameColorDraft, (color) => {
      renameColorDraft = color;
      pendingFocusKey = 'label-rename';
      render();
    }),
  );
  return row;
}

function renderLabelAdder(): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'label-nav-footer';

  if (!labelAdderOpen) {
    const open = document.createElement('button');
    open.className = 'text-button';
    open.textContent = t('+ Add label');
    open.disabled = offline;
    open.addEventListener('click', () => {
      labelAdderOpen = true;
      newLabelColor = null;
      pendingFocusKey = 'label-add';
      render();
    });
    footer.appendChild(open);
    return footer;
  }

  const input = document.createElement('input');
  input.className = 'label-nav-input';
  input.dataset.focusKey = 'label-add';
  input.placeholder = t('New label name');
  input.value = newLabelDraft;
  input.disabled = offline;
  input.addEventListener('input', () => {
    newLabelDraft = input.value;
  });

  const commit = (): void => {
    if (!input.value.trim()) {
      return;
    }
    post({ type: 'createLabel', requestId: newRequestId(), name: input.value, color: newLabelColor });
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
  add.title = t('Add');
  add.disabled = offline;
  add.addEventListener('click', commit);

  const cancel = document.createElement('button');
  cancel.className = 'icon-button';
  cancel.textContent = '✕';
  cancel.title = t('Cancel');
  cancel.addEventListener('click', () => {
    labelAdderOpen = false;
    newLabelDraft = '';
    newLabelColor = null;
    render();
  });

  const buttons = document.createElement('div');
  buttons.className = 'label-nav-footer-buttons';
  buttons.append(add, cancel);

  footer.classList.add('label-nav-footer-open');
  footer.append(
    input,
    renderColorSwatches(newLabelColor, (color) => {
      newLabelColor = color;
      pendingFocusKey = 'label-add';
      render();
    }),
    buttons,
  );
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
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) {
        return a.isFavorite ? -1 : 1;
      }
      return (b.lastLoadedAt ?? '').localeCompare(a.lastLoadedAt ?? '');
    });
}

/** ISO日時を「3日前」のような相対表示にする。一覧の1行に収める前提で粒度は粗くてよい。
 * 単位ごとの言い回しと複数形はIntlに任せるので、ここに翻訳対象の文字列は持たない。 */
function formatRelativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return '';
  }
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) {
    return relativeTime(0, 'second');
  }
  if (minutes < 60) {
    return relativeTime(-minutes, 'minute');
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return relativeTime(-hours, 'hour');
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return relativeTime(-days, 'day');
  }
  if (days < 30) {
    return relativeTime(-Math.floor(days / 7), 'week');
  }
  if (days < 365) {
    return relativeTime(-Math.floor(days / 30), 'month');
  }
  return relativeTime(-Math.floor(days / 365), 'year');
}

function renderListPane(): HTMLElement {
  const pane = document.createElement('div');
  pane.className = 'list-pane';

  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';

  const search = document.createElement('input');
  search.className = 'search-input';
  search.dataset.focusKey = 'search';
  search.placeholder = t('Search (/)');
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
  footer.textContent =
    shown === records.length
      ? t('{0} items', records.length)
      : t('{0} / {1} items', shown, records.length);
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
    empty.textContent = records.length === 0 ? t('No md files yet') : t('No md files match');
    list.appendChild(empty);
    return list;
  }

  for (const record of visible) {
    const item = document.createElement('li');

    const head = document.createElement('div');
    head.className = 'md-list-head';

    const favorite = document.createElement('button');
    favorite.type = 'button';
    favorite.className = record.isFavorite ? 'md-list-favorite active' : 'md-list-favorite';
    favorite.textContent = record.isFavorite ? '★' : '☆';
    favorite.title = record.isFavorite ? t('Remove from favorites') : t('Add to favorites');
    favorite.disabled = offline;
    favorite.addEventListener('click', (event) => {
      event.stopPropagation();
      post({ type: 'setFavorite', requestId: newRequestId(), id: record.id, value: !record.isFavorite });
    });

    const titleGroup = document.createElement('span');
    titleGroup.className = 'md-list-title-group';

    const title = document.createElement('span');
    title.className = 'md-list-title';
    title.textContent = record.title || record.filename || t('(untitled)');
    titleGroup.append(favorite, title);

    const time = document.createElement('span');
    time.className = 'md-list-time';
    time.textContent = record.lastLoadedAt ? formatRelativeTime(record.lastLoadedAt) : t('Not loaded yet');

    head.append(titleGroup, time);
    item.appendChild(head);

    if (record.labelIds.length > 0) {
      const chips = document.createElement('div');
      chips.className = 'md-list-chips';
      for (const labelId of record.labelIds) {
        const label = labels.find((l) => l.id === labelId);
        if (!label) {
          continue;
        }
        const chip = document.createElement('span');
        chip.className = 'label-chip';
        applyLabelColorClass(chip, label.color);
        chip.textContent = label.name;
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
    empty.textContent = t('Select an md from the list, or create a new one');
    container.appendChild(empty);
    return container;
  }

  const currentDraft = draft;

  const titleInput = document.createElement('input');
  titleInput.className = 'title-input';
  titleInput.placeholder = t('Title');
  titleInput.value = currentDraft.title;
  titleInput.addEventListener('input', () => {
    currentDraft.title = titleInput.value;
    markDirty();
  });

  const filenameInput = document.createElement('input');
  filenameInput.className = 'filename-input';
  filenameInput.placeholder = t('File name');
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
    hint.textContent = t('You can attach labels once it is saved');
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
  caption.textContent = t('Labels:');
  picker.appendChild(caption);

  // labelsは名前順に整列済みなので、付与済みチップも常に同じ並びになる。
  const assigned = labels.filter((label) => record.labelIds.includes(label.id));
  if (assigned.length === 0) {
    const none = document.createElement('span');
    none.className = 'pane-hint';
    none.textContent = t('None');
    picker.appendChild(none);
  }

  for (const label of assigned) {
    const chip = document.createElement('span');
    chip.className = 'label-chip label-chip-assigned';
    applyLabelColorClass(chip, label.color);
    chip.append(label.name);

    const remove = document.createElement('button');
    remove.className = 'chip-remove';
    remove.textContent = '✕';
    remove.title = t('Remove {0}', label.name);
    remove.disabled = offline;
    remove.addEventListener('click', () => toggleLabel(record, label));

    chip.appendChild(remove);
    picker.appendChild(chip);
  }

  const add = document.createElement('button');
  add.className = 'chip-add';
  add.textContent = t('+ Label');
  add.title = t('Attach a label');
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
  input.placeholder = t('Filter or new label name');
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
    if (isLabelColor(label.color)) {
      const dot = document.createElement('span');
      dot.className = 'label-nav-color-dot';
      applyLabelColorClass(dot, label.color);
      name.appendChild(dot);
    }
    name.append(label.name);

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
    create.textContent = t('Create "{0}" and attach it', labelPickerQuery.trim());
    create.addEventListener('click', () => createAndAssign(record));
    list.appendChild(create);
  } else if (options.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pane-hint';
    empty.textContent = t('No labels');
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
  dirtyIndicator.textContent = dirty ? t('● Unsaved changes') : '';
  actions.appendChild(dirtyIndicator);

  const saveButton = document.createElement('button');
  saveButton.className = 'save-button';
  saveButton.textContent = t('Save');
  saveButton.title = t('Save (Ctrl/Cmd+S)');
  saveButton.disabled = offline || !dirty;
  saveButton.addEventListener('click', onSave);
  actions.appendChild(saveButton);

  if (selectedId) {
    const id = selectedId;

    const loadButton = document.createElement('button');
    loadButton.className = 'load-button';
    loadButton.textContent = t('Load into Project');
    // ロードはローカルファイルへの書き出しなので、保存・削除と違いオフラインでも実行できる。
    // ただしロードされるのは保存済みの内容なので、未保存の変更がある間は押させない。
    loadButton.disabled = dirty;
    loadButton.addEventListener('click', () => post({ type: 'loadToProject', requestId: newRequestId(), id }));
    actions.appendChild(loadButton);

    const duplicateButton = document.createElement('button');
    duplicateButton.className = 'secondary-button';
    duplicateButton.textContent = t('Duplicate');
    duplicateButton.title = t('Duplicate this md');
    duplicateButton.disabled = offline;
    duplicateButton.addEventListener('click', () => post({ type: 'duplicate', requestId: newRequestId(), id }));
    actions.appendChild(duplicateButton);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'secondary-button';
    deleteButton.textContent = t('Delete');
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
    indicator.textContent = t('● Unsaved changes');
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
      renameColorDraft = null;
      labelAdderOpen = false;
      newLabelColor = null;
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
        renameColorDraft = null;
        labelAdderOpen = false;
        newLabelColor = null;
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
      labels = [...labels, message.label].sort((a, b) => compareNames(a.name, b.name));
      newLabelDraft = '';
      newLabelColor = null;
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
        .sort((a, b) => compareNames(a.name, b.name));
      renamingLabelId = null;
      renameColorDraft = null;
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

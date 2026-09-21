/**
 * VSCodeエクスプローラーがファイルをコピーしたときの命名規則を再現する。
 * xxxx.md → xxxx.copy.md → xxxx.copy 2.md → xxxx.copy 3.md ...
 * 既に「.copy」「.copy N」が付いているものをさらに複製しても、
 * 「.copy.copy」のように多重連結しない（数字部分だけをインクリメントする）。
 */

const COPY_SUFFIX = /^(.*)\.copy(?: (\d+))?$/;

function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return { stem: name, ext: '' };
  }
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

export function nextCopyName(base: string, existingNames: string[]): string {
  const { stem, ext } = splitExtension(base);
  const match = COPY_SUFFIX.exec(stem);
  const rootStem = match ? match[1] : stem;

  const taken = new Set(existingNames);

  if (!match) {
    const firstCopy = `${rootStem}.copy${ext}`;
    if (!taken.has(firstCopy)) {
      return firstCopy;
    }
  }

  let counter = match ? (match[2] ? Number(match[2]) + 1 : 2) : 2;
  let candidate = `${rootStem}.copy ${counter}${ext}`;
  while (taken.has(candidate)) {
    counter += 1;
    candidate = `${rootStem}.copy ${counter}${ext}`;
  }
  return candidate;
}

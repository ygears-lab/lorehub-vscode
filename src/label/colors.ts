/**
 * ラベルの8色固定パレット。DBの `labels.color` の check制約
 * （supabase/migrations/20260920130734_add_color_to_labels.sql）と一致させること。
 * 各キーはVSCodeの `--vscode-charts-*` テーマ変数にそのまま対応する
 * （docs/2026-09-06-122851_UiUxDirection.md §8.4）。
 */
export const LABEL_COLORS = [
  'red',
  'blue',
  'yellow',
  'orange',
  'green',
  'purple',
  'foreground',
  'lines',
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];

export function isLabelColor(value: string | null | undefined): value is LabelColor {
  return typeof value === 'string' && (LABEL_COLORS as readonly string[]).includes(value);
}

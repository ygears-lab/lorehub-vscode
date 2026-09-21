export interface MdRecord {
  id: string;
  title: string;
  filename: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  lastLoadedAt: string | null;
  labelIds: string[];
}

export interface MdListPayload {
  records: MdRecord[];
  source: 'live' | 'cache';
  offline: boolean;
}

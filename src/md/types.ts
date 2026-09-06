export interface MdRecord {
  id: string;
  title: string;
  filename: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  labelIds: string[];
}

export interface MdListPayload {
  records: MdRecord[];
  source: 'live' | 'cache';
  offline: boolean;
}

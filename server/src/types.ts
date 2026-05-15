export interface Opening {
  eco: string;
  name: string;
  pgn: string;
  moves: string[];
  family: string;
}

export interface OpeningsResponse {
  openings: Opening[];
  total: number;
  page: number;
  pageSize: number;
}

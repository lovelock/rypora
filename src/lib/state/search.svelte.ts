import type { IndexStatus } from "../types";

const unavailable: IndexStatus = {
  phase: "unavailable",
  indexed: 0,
  total: 0,
  generation: 0,
  available: false,
};

class SearchStore {
  status = $state<IndexStatus>(unavailable);

  setStatus(status: IndexStatus): void {
    this.status = status;
  }
}

export const searchState = new SearchStore();

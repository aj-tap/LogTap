class QueryHistory {
  constructor() {
    this.historyKey = 'queryHistory';
    this.maxHistorySize = 10;
    this.history = this.loadHistory();
  }

  loadHistory() {
    try {
      const history = localStorage.getItem(this.historyKey);
      return history ? JSON.parse(history) : [];
    } catch (error) {
      console.error('Error loading query history:', error);
      return [];
    }
  }

  saveHistory() {
    try {
      localStorage.setItem(this.historyKey, JSON.stringify(this.history));
    } catch (error) {
      console.error('Error saving query history:', error);
    }
  }

  addQuery(query) {
    if (!query) return;

    // Remove duplicate queries
    this.history = this.history.filter(q => q !== query);

    this.history.unshift(query);
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }
    this.saveHistory();
  }

  getHistory() {
    return [...this.history]; // Return a copy to prevent direct modification
  }
}

export default QueryHistory;

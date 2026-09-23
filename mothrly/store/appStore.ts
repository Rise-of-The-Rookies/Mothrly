import { create } from 'zustand';

interface AppState {
  // Add your global state slices here
}

const useAppStore = create<AppState>()(() => ({
  // initial state
}));

export default useAppStore;

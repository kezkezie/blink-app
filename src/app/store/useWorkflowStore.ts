import { create } from 'zustand';

interface WorkflowTask {
    id: string;
    label: string;
}

interface WorkflowState {
    activeTasks: WorkflowTask[];
    addTask: (id: string, label: string) => void;
    removeTask: (id: string) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
    activeTasks: [],
    addTask: (id, label) => set((state) => {
        // Prevent duplicate IDs
        if (state.activeTasks.find(t => t.id === id)) return state;
        return { activeTasks: [...state.activeTasks, { id, label }] };
    }),
    removeTask: (id) => set((state) => ({
        activeTasks: state.activeTasks.filter(task => task.id !== id)
    })),
}));
import { create } from 'zustand'
import type {
  AIAssetPlan,
  GameAsset,
  IndieForgeProject,
  ProjectSummary
} from '@shared/types/project'

interface UIState {
  loading: boolean
  error: string | null
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

interface ProjectState {
  projects: ProjectSummary[]
  activeProject: IndieForgeProject | null
  pendingPlan: AIAssetPlan | null
  openaiConfigured: boolean
  loadProjects: () => Promise<void>
  openProject: (projectId: string) => Promise<void>
  setActiveProject: (project: IndieForgeProject | null) => void
  setPendingPlan: (plan: AIAssetPlan | null) => void
  refreshOpenAIConfig: () => Promise<void>
  updateActiveAsset: (asset: GameAsset) => void
}

export const useUIStore = create<UIState>((set) => ({
  loading: false,
  error: null,
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error })
}))

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  pendingPlan: null,
  openaiConfigured: false,

  loadProjects: async () => {
    useUIStore.getState().setLoading(true)
    try {
      const projects = await window.indieForge.projects.list()
      set({ projects })
    } catch (e) {
      useUIStore.getState().setError(e instanceof Error ? e.message : 'Failed to load projects')
    } finally {
      useUIStore.getState().setLoading(false)
    }
  },

  openProject: async (projectId: string) => {
    useUIStore.getState().setLoading(true)
    try {
      const project = await window.indieForge.projects.open(projectId)
      set({ activeProject: project })
    } catch (e) {
      useUIStore.getState().setError(e instanceof Error ? e.message : 'Failed to open project')
    } finally {
      useUIStore.getState().setLoading(false)
    }
  },

  setActiveProject: (project) => set({ activeProject: project }),
  setPendingPlan: (plan) => set({ pendingPlan: plan }),

  refreshOpenAIConfig: async () => {
    const { configured } = await window.indieForge.config.getOpenAIKey()
    set({ openaiConfigured: configured })
  },

  updateActiveAsset: (asset) => {
    const { activeProject } = get()
    if (!activeProject) return
    set({
      activeProject: {
        ...activeProject,
        assets: activeProject.assets.map((a) => (a.id === asset.id ? asset : a))
      }
    })
  }
}))

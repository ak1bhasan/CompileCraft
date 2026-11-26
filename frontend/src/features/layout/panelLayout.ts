export interface PanelLayoutBounds {
  min: number
  max: number
  default: number
}

export interface PanelLayoutState {
  sidebarWidth: number
  resultsWidth: number
  bottomHeight: number
}

export const PANEL_LAYOUT_STORAGE_KEY = 'compilecraft_panel_layout'

export const SIDEBAR_WIDTH_BOUNDS: PanelLayoutBounds = {
  min: 180,
  max: 420,
  default: 240,
}

export const RESULTS_WIDTH_BOUNDS: PanelLayoutBounds = {
  min: 260,
  max: 600,
  default: 380,
}

export const BOTTOM_HEIGHT_BOUNDS: PanelLayoutBounds = {
  min: 140,
  max: 480,
  default: 224,
}

export const DEFAULT_PANEL_LAYOUT: PanelLayoutState = {
  sidebarWidth: SIDEBAR_WIDTH_BOUNDS.default,
  resultsWidth: RESULTS_WIDTH_BOUNDS.default,
  bottomHeight: BOTTOM_HEIGHT_BOUNDS.default,
}

export function clampPanelSize(value: unknown, bounds: PanelLayoutBounds): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return bounds.default
  }
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(value)))
}

export function loadPanelLayout(): PanelLayoutState {
  try {
    const raw = localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_PANEL_LAYOUT
    }
    const parsed = JSON.parse(raw) as Partial<PanelLayoutState> | null
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_PANEL_LAYOUT
    }
    return {
      sidebarWidth: clampPanelSize(parsed.sidebarWidth, SIDEBAR_WIDTH_BOUNDS),
      resultsWidth: clampPanelSize(parsed.resultsWidth, RESULTS_WIDTH_BOUNDS),
      bottomHeight: clampPanelSize(parsed.bottomHeight, BOTTOM_HEIGHT_BOUNDS),
    }
  } catch {
    return DEFAULT_PANEL_LAYOUT
  }
}

export function savePanelLayout(layout: PanelLayoutState): void {
  try {
    localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Ignore localStorage quota or security errors
  }
}

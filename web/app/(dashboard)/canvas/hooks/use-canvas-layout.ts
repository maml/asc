"use client";

import { useCallback } from "react";
import type { Node, NodeChange } from "@xyflow/react";

const STORAGE_KEY = "asc-canvas-positions";

interface StoredPositions {
  [nodeId: string]: { x: number; y: number };
}

export function loadPositions(): StoredPositions {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPositions) : {};
  } catch {
    return {};
  }
}

export function applyStoredPositions<T extends Record<string, unknown>>(nodes: Node<T>[]): Node<T>[] {
  const stored = loadPositions();
  return nodes.map((node) => {
    const pos = stored[node.id];
    return pos ? { ...node, position: pos } : node;
  });
}

export function useCanvasLayout() {
  const savePositions = useCallback((changes: NodeChange[], nodes: Node[]) => {
    // Only save on drag-stop
    const hasDragStop = changes.some((c) => c.type === "position" && !("dragging" in c && c.dragging));
    if (!hasDragStop) return;

    const positions: StoredPositions = {};
    for (const node of nodes) {
      positions[node.id] = node.position;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch {
      // storage full or unavailable
    }
  }, []);

  return { savePositions };
}

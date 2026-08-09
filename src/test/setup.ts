/**
 * Vitest setup file
 * Configures testing environment
 *
 * Runs under both the `node` and `jsdom` environments; the DOM mocks and matchers are installed only when a document exists.
 */

import { expect } from "vitest";
import { set_language } from "../i18n";

// Pinned, so a test that reads a message does not depend on the machine's locale.
set_language("fr");

if (typeof window !== "undefined") {
  const matchers = await import("@testing-library/jest-dom/matchers");
  // The package only ships named exports; the `default` key exists in its type declarations alone.
  expect.extend(
    matchers.default ?? (matchers as unknown as typeof matchers.default),
  );
  install_dom_mocks();
}

function install_dom_mocks() {
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (index: number) => Object.keys(store)[index] || null,
    };
  })();

  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
  });

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, "ResizeObserver", {
    value: ResizeObserverMock,
  });

  const mockCanvasContext = {
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    setTransform: () => {},
    drawImage: () => {},
    createLinearGradient: () => ({
      addColorStop: () => {},
    }),
    measureText: () => ({ width: 0 }),
    fillText: () => {},
    strokeText: () => {},
  } as unknown as CanvasRenderingContext2D;

  HTMLCanvasElement.prototype.getContext = ((contextId: string) => {
    if (contextId === "2d") return mockCanvasContext;
    return null;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

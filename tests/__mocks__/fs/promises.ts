import { vi } from 'vitest';

export const readFile = vi.fn();
export const writeFile = vi.fn();
export const mkdir = vi.fn();
export const access = vi.fn();

const fsMock = { readFile, writeFile, mkdir, access };
export default fsMock;

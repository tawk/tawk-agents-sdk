/**
 * Jest mock for @clack/prompts (ESM-only package)
 */

const mockSpinnerInstance = {
  start: jest.fn(),
  stop: jest.fn(),
  message: jest.fn(),
};

export const spinner = jest.fn(() => mockSpinnerInstance);

export const note = jest.fn();

export const log = {
  info: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  step: jest.fn(),
  message: jest.fn(),
};

export const intro = jest.fn();
export const outro = jest.fn();
export const text = jest.fn();
export const confirm = jest.fn(() => Promise.resolve(true));
export const isCancel = jest.fn(() => false);
export const select = jest.fn();
export const multiselect = jest.fn();
export const group = jest.fn();

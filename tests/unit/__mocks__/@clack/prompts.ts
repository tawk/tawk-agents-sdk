/**
 * Jest mock for @clack/prompts (ESM-only package)
 */
const mockSpinnerInstance = {
  start: jest.fn(),
  stop: jest.fn(),
  message: jest.fn(),
};

const spinner = jest.fn(() => mockSpinnerInstance);
const note = jest.fn();
const log = {
  info: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  step: jest.fn(),
  message: jest.fn(),
};
const intro = jest.fn();
const outro = jest.fn();
const text = jest.fn();
const confirm = jest.fn(() => Promise.resolve(true));
const isCancel = jest.fn(() => false);

module.exports = {
  spinner,
  note,
  log,
  intro,
  outro,
  text,
  confirm,
  isCancel,
  __mockSpinnerInstance: mockSpinnerInstance,
};

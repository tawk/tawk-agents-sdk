export const formatToon = jest.fn((text: string) => text);
export const parseToon = jest.fn((text: string) => ({ text, metadata: {} }));
export default { formatToon, parseToon };

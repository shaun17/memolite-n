export const encodeFloat32Embedding = (values: number[]): Buffer => {
  const buffer = Buffer.allocUnsafe(values.length * 4);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  for (let index = 0; index < values.length; index += 1) {
    view.setFloat32(index * 4, values[index] ?? 0, true);
  }
  return buffer;
};

export const decodeFloat32Embedding = (buffer: Uint8Array): number[] => {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const values: number[] = [];
  for (let offset = 0; offset < buffer.byteLength; offset += 4) {
    values.push(view.getFloat32(offset, true));
  }
  return values;
};

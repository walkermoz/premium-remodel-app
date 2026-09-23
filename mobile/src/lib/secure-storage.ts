import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 1800;

function countKey(key: string) {
  return `${key}.chunks`;
}

function chunkKey(key: string, index: number) {
  return `${key}.chunk.${index}`;
}

export const secureStorage = {
  async getItem(key: string) {
    const countValue = await SecureStore.getItemAsync(countKey(key));
    if (!countValue) return SecureStore.getItemAsync(key);
    const count = Number(countValue);
    if (!Number.isInteger(count) || count < 1) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.getItemAsync(chunkKey(key, index)),
      ),
    );
    if (chunks.some((chunk) => chunk === null)) return null;
    return chunks.join("");
  },
  async setItem(key: string, value: string) {
    await secureStorage.removeItem(key);
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "gs")) || [""];
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(key, index), chunk),
      ),
    );
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
  },
  async removeItem(key: string) {
    const countValue = await SecureStore.getItemAsync(countKey(key));
    const count = Number(countValue || 0);
    if (Number.isInteger(count) && count > 0)
      await Promise.all(
        Array.from({ length: count }, (_, index) =>
          SecureStore.deleteItemAsync(chunkKey(key, index)),
        ),
      );
    await Promise.all([
      SecureStore.deleteItemAsync(countKey(key)),
      SecureStore.deleteItemAsync(key),
    ]);
  },
};

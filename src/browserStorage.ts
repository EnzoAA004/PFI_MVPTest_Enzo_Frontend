const memory = new Map<string, string>();

export async function asyncGetItem(key: string): Promise<string | null> {
  return memory.get(key) ?? null;
}

export async function asyncSetItem(key: string, value: string): Promise<void> {
  memory.set(key, value);
}

export async function asyncRemoveItem(key: string): Promise<void> {
  memory.delete(key);
}

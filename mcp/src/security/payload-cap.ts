export interface CappedResult<T> {
  data: T;
  truncated: boolean;
}

export function capPayload<T>(data: T, capBytes: number): CappedResult<T> {
  const json = JSON.stringify(data);
  if (json.length <= capBytes) return { data, truncated: false };

  // If shape is { items: [...] }, halve the list until under cap.
  if (
    data &&
    typeof data === "object" &&
    "items" in (data as object) &&
    Array.isArray((data as unknown as { items: unknown[] }).items)
  ) {
    let items = (data as unknown as { items: unknown[] }).items;
    while (
      items.length > 1 &&
      JSON.stringify({ ...data, items }).length > capBytes
    ) {
      items = items.slice(0, Math.floor(items.length / 2));
    }
    return { data: { ...data, items } as T, truncated: true };
  }

  return { data, truncated: true };
}

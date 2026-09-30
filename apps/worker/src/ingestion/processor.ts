export interface IngestionProcessorOptions<T> {
  retrieve: () => Promise<T>;
  publish: (value: T) => Promise<void>;
  acknowledge: () => Promise<void>;
}

export async function processIngestionJob<T>(options: IngestionProcessorOptions<T>): Promise<void> {
  const value = await options.retrieve();
  await options.publish(value);
  await options.acknowledge();
}
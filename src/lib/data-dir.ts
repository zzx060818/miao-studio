import { join } from "node:path";

export function dataDir(): string {
  const override = process.env.MIAO_DATA_DIR?.trim();
  if (override) return override;
  return join(process.cwd(), ".data");
}

import { API_BASE_URL } from "./api";
import type { MultiplanarContract } from "./multiplanarTypes";

export async function getMultiplanarContract(): Promise<MultiplanarContract> {
  const response = await fetch(`${API_BASE_URL}/api/ai/multiplanar/contract`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`Backend respondio ${response.status}`);
  return await response.json() as MultiplanarContract;
}

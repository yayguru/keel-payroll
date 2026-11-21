import { CORRIDORS } from "@/lib/corridors";
import { previewAmount } from "@/lib/textile";
import { usdToUnits } from "@/lib/money";

export async function GET() {
  const sell = usdToUnits("1.00");
  const rates = await Promise.all(
    CORRIDORS.map(async (corridor) => {
      const preview = await previewAmount(corridor, sell, AbortSignal.timeout(20_000));
      if (!preview.ok) return { country: corridor.country, token: corridor.symbol, error: preview.reason };
      return { country: corridor.country, token: corridor.symbol, rate: preview.rate, local: preview.local };
    }),
  );
  return Response.json({ rates });
}

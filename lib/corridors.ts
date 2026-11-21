export type Corridor = {
  symbol: "wBRL" | "wARS" | "cNGN" | "IDRX" | "wMXN" | "wCOP";
  name: string;
  country: string;
  aliases: string[];
  address: `0x${string}`;
  decimals: number;
};

/** Celo mainnet addresses from the Textile FX address book and the Loops track page. */
export const USDT = {
  symbol: "USD₮",
  address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as const,
  decimals: 6,
};

export const TEXTILE_REACTOR = "0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3" as const;

export const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

export const CORRIDORS: Corridor[] = [
  {
    symbol: "wBRL",
    name: "Brazilian real",
    country: "Brazil",
    aliases: ["brazil", "brasil", "br"],
    address: "0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0",
    decimals: 18,
  },
  {
    symbol: "wARS",
    name: "Argentine peso",
    country: "Argentina",
    aliases: ["argentina", "ar"],
    address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
    decimals: 18,
  },
  {
    symbol: "cNGN",
    name: "Nigerian naira",
    country: "Nigeria",
    aliases: ["nigeria", "ng"],
    address: "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f",
    decimals: 6,
  },
  {
    symbol: "IDRX",
    name: "Indonesian rupiah",
    country: "Indonesia",
    aliases: ["indonesia", "id"],
    address: "0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22",
    decimals: 2,
  },
  {
    symbol: "wMXN",
    name: "Mexican peso",
    country: "Mexico",
    aliases: ["mexico", "méxico", "mx"],
    address: "0x337E7456B420bD3481e7FA61fA9850343d610d34",
    decimals: 18,
  },
  {
    symbol: "wCOP",
    name: "Colombian peso",
    country: "Colombia",
    aliases: ["colombia", "co"],
    address: "0x8a1D45e102e886510e891d2Ec656a708991e2D76",
    decimals: 18,
  },
];

export function corridorForCountry(input: string): Corridor | undefined {
  const key = input.trim().toLowerCase();
  return CORRIDORS.find((corridor) => corridor.aliases.includes(key) || corridor.country.toLowerCase() === key);
}

export function corridorTargets(): `0x${string}`[] {
  return [USDT.address, TEXTILE_REACTOR, ...CORRIDORS.map((corridor) => corridor.address)];
}

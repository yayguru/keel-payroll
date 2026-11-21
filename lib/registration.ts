export type RegistrationFile = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  name: string;
  description: string;
  image: string;
  services: { name: string; endpoint: string; version?: string }[];
  x402Support: false;
  active: true;
  supportedTrust: ["reputation"];
  registrations: { agentId: number; agentRegistry: string }[];
};

export function registrationFile(publicUrl: string, agentId?: number): RegistrationFile {
  const root = publicUrl.replace(/\/$/, "");
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Keel Payroll",
    description:
      "Payroll agent for a small business. The owner says who to pay and in which country. Keel quotes USD₮ into that country's stablecoin on Textile FX, pays the allowlisted wallet from a capped session, and returns a receipt.",
    image: `${root}/icon.svg`,
    services: [
      { name: "web", endpoint: `${root}/` },
      { name: "A2A", endpoint: `${root}/.well-known/agent-card.json`, version: "0.3.0" },
    ],
    x402Support: false,
    active: true,
    supportedTrust: ["reputation"],
    registrations: agentId
      ? [
          {
            agentId,
            agentRegistry: "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
          },
        ]
      : [],
  };
}

export function agentCard(publicUrl: string) {
  const root = publicUrl.replace(/\/$/, "");
  return {
    name: "Keel Payroll",
    description: registrationFile(root).description,
    url: `${root}/`,
    version: "0.1.0",
    protocolVersion: "0.3.0",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: "pay-contractors",
        name: "Pay contractors in local stablecoins",
        description:
          "Parse a payroll instruction, quote USD₮ to wBRL, wARS, cNGN, IDRX, wMXN, or wCOP on Textile FX, and pay an allowlisted address inside the daily cap.",
        tags: ["payroll", "fx", "celo", "textile"],
        examples: ["pay Maria (Brazil) $0.10 for the translation, Juan (Argentina) $0.20 for testing"],
      },
    ],
  };
}

export function registrationDataUri(publicUrl: string, agentId?: number): string {
  const json = JSON.stringify(registrationFile(publicUrl, agentId));
  return `data:application/json;base64,${Buffer.from(json).toString("base64")}`;
}
